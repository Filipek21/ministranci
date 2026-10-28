// ============================================================================
// v2.11 — LISTY PAPIEROWE: druk pustej listy + odczyt wypełnionej (OCR) + import jako „System (Lista)”
//
// Przebieg: (1) Admin/Ksiądz drukuje listę dla wydarzenia (PDF powstaje lokalnie, bez internetu; w rogu kod QR wydarzenia).
// (2) Ministranci wpisują DRUKOWANYMI literami kod (np. MIN-014), opcjonalnie datę (dd.mm) i typ M / N / O
//     (msza / nabożeństwo / oba — tylko dla mszy połączonej z nabożeństwem).
// (3) Zdjęcie lub skan listy → odczyt w przeglądarce (Tesseract.js doczytywany z CDN przy pierwszym użyciu — wymaga internetu).
// (4) Wiersze nieczytelne są wypisane z numerami i można je poprawić ręcznie; reszta trafia do bazy jako „System (Lista)”
//     (sql/22 → admin_import_listy). Historia importów pokazuje, kto zatwierdził i które wiersze nie zostały odczytane.
// ============================================================================

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LISTA_WIERSZY_DOMYSLNIE = 25;
const OCR_PEWNOSC_MIN = 55;                 // poniżej — wiersz oznaczony jako „niepewny”

// ----------------------------------------------------------------- CZYSTE FUNKCJE PARSOWANIA (testowalne) --
const POMYLKI_CYFR = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', '!': '1', S: '5', B: '8', Z: '2', G: '6' };

function napraw3Cyfry(s) {
    return String(s || '').toUpperCase().replace(/\s+/g, '').split('').map(ch => POMYLKI_CYFR[ch] || ch).join('');
}

// Jedna linia z OCR → { wiersz, kod, data:{d,m,r}|null, wybor, tekst } albo kod=null gdy nie rozpoznano
function parsujLinieListy(tekst) {
    const surowy = String(tekst || '').toUpperCase().replace(/[–—_~]/g, '-').trim();
    const wynik = { wiersz: null, kod: null, data: null, wybor: null, tekst: surowy };
    // PREFIKS (2–6 liter, np. MIN / ADMIN) + myślnik + 3 znaki cyfropodobne
    const m = surowy.match(/([A-Z1|]{2,6})\s*[-.:]?\s*([0-9OQDILSBZG|!]\s*[0-9OQDILSBZG|!]\s*[0-9OQDILSBZG|!])/);
    if (m) {
        let prefiks = m[1].replace(/1|\|/g, 'I');
        if (!/^(ADMIN|MIN|KS|KSIADZ)$/.test(prefiks)) prefiks = 'MIN';      // pomyłki typu „M1N”, „MN”, „NIN”
        wynik.kod = prefiks + '-' + napraw3Cyfry(m[2]);
        const przed = surowy.slice(0, m.index).replace(/[^0-9]/g, '');
        if (przed) wynik.wiersz = parseInt(przed, 10);
        const po = surowy.slice(m.index + m[0].length);
        const d = po.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?/);
        if (d) {
            const dzien = parseInt(d[1], 10), mies = parseInt(d[2], 10);
            if (dzien >= 1 && dzien <= 31 && mies >= 1 && mies <= 12) wynik.data = { d: dzien, m: mies, r: d[3] ? parseInt(d[3], 10) : null };
        }
        const typ = po.replace(/\d{1,2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{2,4})?/, ' ').match(/(?:^|[\s,;])([MNO])\s*$/);
        if (typ) wynik.wybor = typ[1];
    } else {
        const lead = surowy.match(/^\s*(\d{1,2})\b/);
        if (lead) wynik.wiersz = parseInt(lead[1], 10);
    }
    return wynik;
}

function dataISOZParsowania(dm, rokDomyslny) {
    if (!dm) return null;
    let r = dm.r != null ? dm.r : rokDomyslny;
    if (r < 100) r += 2000;
    const p = n => String(n).padStart(2, '0');
    const d = new Date(r, dm.m - 1, dm.d);
    if (d.getFullYear() !== r || d.getMonth() !== dm.m - 1 || d.getDate() !== dm.d) return null;
    return `${r}-${p(dm.m)}-${p(dm.d)}`;
}

// ----------------------------------------------------------------- STAN EKRANU --
let listaWydarzenia = [];
let listaWiersze = [];          // [{wiersz, kod, dataISO, wybor, pewnosc, status, tekst, dolacz}]
let listaNiedoczytane = [];     // numery wierszy
let listaNazwaPliku = null;

async function odswiezListyPapierowe() {
    if (!sesja) return;
    const { data } = await odczytajZBledem(supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(60), 'kalendarz');
    listaWydarzenia = data || [];
    const opcje = listaWydarzenia.map(w => `<option value="${esc(w.id)}">${esc(w.nazwa)} — ${esc(formatDataCzas(w.data_wydarzenia))}</option>`).join('');
    ['lst-wydarzenie-druk', 'lst-wydarzenie-import'].forEach(id => { const el = $(id); const stare = el.value; el.innerHTML = opcje; if (stare) el.value = stare; });
    if (!biezacaListaMinistrantow || biezacaListaMinistrantow.length === 0) await odswiezListeMinistrantow();
    await odswiezHistorieImportow();
}

// ----------------------------------------------------------------- DRUK PUSTEJ LISTY (PDF lokalnie) --
function narysujListeNaCanvas(wydarzenie, liczbaWierszy) {
    const c = document.createElement('canvas');
    c.width = PDF_A4_PX.w; c.height = PDF_A4_PX.h;
    const x = c.getContext('2d');
    const FONT = '"DejaVu Sans","Segoe UI",Arial,Helvetica,sans-serif';
    const px = PDF_MM;
    const tekst = (txt, mmX, mmY, pt, o) => {
        o = o || {};
        x.font = (o.bold ? 'bold ' : '') + Math.round(pt / 72 * 150) + 'px ' + FONT;
        x.fillStyle = o.kolor || '#000'; x.textAlign = o.align || 'left'; x.textBaseline = 'alphabetic';
        x.fillText(String(txt), px(mmX), px(mmY), o.maxMm ? px(o.maxMm) : undefined);
    };
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);

    tekst(t('lst.pdf_title'), 12, 20, 20, { bold: true });
    tekst(wydarzenie.nazwa || '', 12, 29, 14, { bold: true, maxMm: 140 });
    tekst(formatDataCzas(wydarzenie.data_wydarzenia), 12, 36, 11, { kolor: '#333' });
    tekst(t('lst.pdf_hint'), 12, 43, 8.5, { kolor: '#333', maxMm: 150 });
    if (window.QRLocal) {   // QR wydarzenia: przy odczycie lista sama wskaże właściwe wydarzenie
        const qr = window.QRLocal.toCanvas('LISTA|' + wydarzenie.id, { width: 300, margin: 1 });
        x.imageSmoothingEnabled = false;
        x.drawImage(qr, px(165), px(10), px(32), px(32));
    }

    const y0 = 52, y1 = 282, h = (y1 - y0) / liczbaWierszy;
    // nagłówki kolumn
    tekst(t('lst.col_no'), 13, y0 - 2, 8, { bold: true });
    tekst(t('lst.col_code'), 28, y0 - 2, 8, { bold: true });
    tekst(t('lst.col_date'), 100, y0 - 2, 8, { bold: true });
    tekst(t('lst.col_type'), 140, y0 - 2, 8, { bold: true });
    // linie JASNE (po binaryzacji znikają), numery wierszy i „MIN-” CIEMNE (OCR dzięki nim zna numer wiersza)
    x.strokeStyle = '#d4d4d4'; x.lineWidth = 2;
    for (let i = 0; i <= liczbaWierszy; i++) { x.beginPath(); x.moveTo(px(10), px(y0 + i * h)); x.lineTo(px(200), px(y0 + i * h)); x.stroke(); }
    [10, 25, 98, 138, 200].forEach(xx => { x.beginPath(); x.moveTo(px(xx), px(y0)); x.lineTo(px(xx), px(y1)); x.stroke(); });
    for (let i = 0; i < liczbaWierszy; i++) {
        const yb = y0 + (i + 1) * h - h * 0.28;
        tekst(String(i + 1), 12, yb, 11, { bold: true });
        tekst('MIN-', 27, yb, 13, { bold: true });
    }
    tekst(t('lst.pdf_footer'), 12, 290, 8, { kolor: '#555', maxMm: 186 });
    return c;
}

$('btn-lst-pdf').addEventListener('click', async () => {
    const st = $('lst-status-druk');
    const w = listaWydarzenia.find(e => String(e.id) === String($('lst-wydarzenie-druk').value));
    if (!w) { st.textContent = '❌ ' + t('lst.need_event'); return; }
    const n = Math.max(5, Math.min(30, parseInt($('lst-ile-wierszy').value, 10) || LISTA_WIERSZY_DOMYSLNIE));
    st.textContent = '⏳ ' + t('lst.pdf_building');
    try {
        const c = narysujListeNaCanvas(w, n);
        const doc = zbudujDokumentLokalny([{ w: c.width, h: c.height, bajty: canvasNaJpegBajty(c) }]);
        doc.save('lista-obecnosci-' + String(w.nazwa || 'wydarzenie').replace(/[^\w-]+/g, '_').slice(0, 40) + '.pdf');
        st.textContent = '✅ ' + t('lst.pdf_ready');
    } catch (e) { st.textContent = '❌ ' + (e && e.message ? e.message : e); }
});

// ----------------------------------------------------------------- ODCZYT (OCR) --
function zaladujTesseract() {
    if (window.Tesseract) return Promise.resolve();
    return new Promise((ok, err) => {
        const s = document.createElement('script');
        s.src = TESSERACT_URL;
        s.onload = () => (window.Tesseract ? ok() : err(new Error('Tesseract')));
        s.onerror = () => err(new Error('Tesseract'));
        document.head.appendChild(s);
    });
}

async function obrazDoCanvas(plik) {
    const bmp = await createImageBitmap(plik);
    const skala = Math.min(2.2, 2400 / bmp.width);                  // szerokość ok. 2400 px — dobry kompromis dokładność/czas
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * skala); c.height = Math.round(bmp.height * skala);
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0, c.width, c.height);
    return { canvas: c, bmp };
}

// Szarość + próg Otsu → czarne pismo na białym tle (jasne linie tabeli znikają)
function binaryzacja(canvas) {
    const x = canvas.getContext('2d', { willReadFrequently: true });
    const img = x.getImageData(0, 0, canvas.width, canvas.height), d = img.data, n = d.length / 4;
    const szary = new Uint8ClampedArray(n), hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++) { const g = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) | 0; szary[i] = g; hist[g]++; }
    let suma = 0; for (let i = 0; i < 256; i++) suma += i * hist[i];
    let sB = 0, wB = 0, max = 0, prog = 128;
    for (let i = 0; i < 256; i++) {
        wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break;
        sB += i * hist[i]; const mB = sB / wB, mF = (suma - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
        if (v > max) { max = v; prog = i; }
    }
    prog = Math.min(prog, 175);                                      // linie #d4d4d4 (212) zawsze poniżej progu = białe
    for (let i = 0; i < n; i++) { const b = szary[i] > prog ? 255 : 0; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0);
    return canvas;
}

async function odczytajQrWydarzenia(bmp) {
    try {
        if (!('BarcodeDetector' in window)) return null;
        const det = new BarcodeDetector({ formats: ['qr_code'] });
        const w = await det.detect(bmp);
        const m = w && w[0] && /^LISTA\|(.+)$/.exec(w[0].rawValue || '');
        return m ? m[1] : null;
    } catch (e) { return null; }
}

function znajdzMinistranta(kod) {
    const k = String(kod || '').toUpperCase();
    return (biezacaListaMinistrantow || []).find(m => String(m.kod).toUpperCase() === k && m.aktywny !== false && (sesja.is_admin || !m.is_admin)) || null;
}

function ocenWiersz(w) {
    const m = w.kod ? znajdzMinistranta(w.kod) : null;
    w.ministrant = m;
    if (!w.kod) w.status = 'nieczytelny';
    else if (!m) w.status = 'nieznany';
    else if (w.pewnosc != null && w.pewnosc < OCR_PEWNOSC_MIN) w.status = 'niepewny';
    else w.status = 'ok';
    w.dolacz = (w.status === 'ok' || w.status === 'niepewny');
}

$('btn-lst-odczytaj').addEventListener('click', async () => {
    const plik = $('lst-plik').files[0];
    const st = $('lst-status-import');
    if (!plik) { st.textContent = '❌ ' + t('lst.need_file'); return; }
    $('btn-lst-odczytaj').disabled = true;
    $('lst-wyniki').classList.add('hidden');
    try {
        st.textContent = '⏳ ' + t('lst.loading_ocr');
        await zaladujTesseract();
        const { canvas, bmp } = await obrazDoCanvas(plik);
        const idZQr = await odczytajQrWydarzenia(bmp);
        if (idZQr && listaWydarzenia.some(e => String(e.id) === String(idZQr))) $('lst-wydarzenie-import').value = idZQr;
        binaryzacja(canvas);

        const worker = await Tesseract.createWorker('eng', 1, {
            logger: m => { if (m.status === 'recognizing text') st.textContent = '⏳ ' + t('lst.reading', { p: Math.round((m.progress || 0) * 100) }); }
        });
        await worker.setParameters({
            tessedit_char_whitelist: 'MINADKSOmina0123456789-./: ',
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1'
        });
        const { data } = await worker.recognize(canvas);
        await worker.terminate();

        const wydarzenie = listaWydarzenia.find(e => String(e.id) === String($('lst-wydarzenie-import').value));
        const rokDomyslny = wydarzenie ? new Date(wydarzenie.data_wydarzenia).getFullYear() : new Date().getFullYear();
        const linie = (data.lines || []).filter(l => (l.text || '').replace(/\s/g, '').length >= 3);

        listaWiersze = []; let poprzedni = 0;
        linie.forEach(l => {
            const p = parsujLinieListy(l.text);
            if (!p.kod && !/\d{1,2}/.test(p.tekst)) return;          // szum bez żadnej cyfry — pomijamy
            if (!p.kod && p.tekst.replace(/[^A-Z0-9]/g, '').length < 4 && p.wiersz != null) return;   // sam numer wiersza = pusty wiersz
            const nr = p.wiersz != null ? p.wiersz : poprzedni + 1;
            poprzedni = nr;
            const w = { wiersz: nr, kod: p.kod, dataISO: dataISOZParsowania(p.data, rokDomyslny), wybor: p.wybor, pewnosc: Math.round(l.confidence || 0), tekst: p.tekst };
            ocenWiersz(w);
            listaWiersze.push(w);
        });
        listaNazwaPliku = plik.name;
        przeliczNiedoczytane();
        pokazWynikiOdczytu();
        st.textContent = '✅ ' + t('lst.read_done', { n: listaWiersze.length });
    } catch (e) {
        st.textContent = '❌ ' + ((e && e.message === 'Tesseract') ? t('lst.ocr_unavailable') : (e && e.message ? e.message : String(e)));
    }
    $('btn-lst-odczytaj').disabled = false;
});

function przeliczNiedoczytane() {
    listaNiedoczytane = listaWiersze.filter(w => w.status === 'nieczytelny' || w.status === 'nieznany').map(w => w.wiersz);
    // luki w numeracji (np. po wierszu 3 od razu 5) = wiersz 4 nie został odczytany wcale
    const nr = listaWiersze.map(w => w.wiersz).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
    for (let i = 1; i < nr.length; i++) for (let k = nr[i - 1] + 1; k < nr[i]; k++) if (!listaNiedoczytane.includes(k)) listaNiedoczytane.push(k);
    listaNiedoczytane.sort((a, b) => a - b);
}

function pokazWynikiOdczytu() {
    $('lst-wyniki').classList.remove('hidden');
    const tbody = document.querySelector('#tabela-lista-odczyt tbody');
    const etykiety = { ok: '✅', niepewny: '⚠️ ' + t('lst.st_unsure'), nieznany: '❓ ' + t('lst.st_unknown'), nieczytelny: '❌ ' + t('lst.st_unreadable') };
    tbody.innerHTML = listaWiersze.map((w, i) => `
        <tr style="${w.status === 'ok' ? '' : 'background:rgba(255,200,0,0.08);'}">
            <td><input type="checkbox" data-lst-dolacz="${i}" ${w.dolacz ? 'checked' : ''} ${w.status === 'nieczytelny' || w.status === 'nieznany' ? 'disabled' : ''} style="width:auto"></td>
            <td>${esc(w.wiersz)}</td>
            <td><input type="text" data-lst-kod="${i}" value="${esc(w.kod || '')}" maxlength="12" style="width:110px; margin:0;" placeholder="MIN-000"></td>
            <td>${w.ministrant ? esc(w.ministrant.imie + ' ' + w.ministrant.nazwisko) : '—'}</td>
            <td>${esc(w.dataISO || '—')}</td>
            <td>${esc(w.wybor || '—')}</td>
            <td>${esc(etykiety[w.status])}${w.pewnosc != null ? ` <small style="color:var(--text-dim)">${w.pewnosc}%</small>` : ''}</td>
        </tr>`).join('') || `<tr><td colspan="7">${esc(t('lst.nothing_read'))}</td></tr>`;

    const lista = $('lst-niedoczytane');
    lista.innerHTML = listaNiedoczytane.length
        ? `⚠️ ${esc(t('lst.unread_rows', { n: listaNiedoczytane.join(', ') }))}`
        : `✅ ${esc(t('lst.all_read'))}`;
    lista.style.color = listaNiedoczytane.length ? 'var(--warn, #fbbf24)' : 'var(--ok)';
    $('lst-licznik-dodania').textContent = t('lst.to_add', { n: listaWiersze.filter(w => w.dolacz).length });
}

// ręczna poprawka kodu / zaznaczenia w tabeli odczytu
$('tabela-lista-odczyt').addEventListener('input', (e) => {
    const i = e.target.getAttribute && e.target.getAttribute('data-lst-kod');
    if (i == null) return;
    const w = listaWiersze[+i];
    w.kod = e.target.value.trim().toUpperCase() || null;
    w.pewnosc = null;                        // poprawione ręcznie = pewne
    ocenWiersz(w);
    przeliczNiedoczytane();
    clearTimeout(pokazWynikiOdczytu._t);
    pokazWynikiOdczytu._t = setTimeout(() => { const f = document.activeElement; const pos = f && f.selectionStart; pokazWynikiOdczytu(); const el = document.querySelector(`[data-lst-kod="${i}"]`); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* pole bez zaznaczenia */ } } }, 700);
});
$('tabela-lista-odczyt').addEventListener('change', (e) => {
    const i = e.target.getAttribute && e.target.getAttribute('data-lst-dolacz');
    if (i == null) return;
    listaWiersze[+i].dolacz = e.target.checked;
    $('lst-licznik-dodania').textContent = t('lst.to_add', { n: listaWiersze.filter(w => w.dolacz).length });
});

// ----------------------------------------------------------------- IMPORT DO BAZY --
$('btn-lst-importuj').addEventListener('click', async () => {
    const st = $('lst-status-import');
    const doDodania = listaWiersze.filter(w => w.dolacz && w.kod);
    if (doDodania.length === 0) { st.textContent = '❌ ' + t('lst.nothing_to_add'); return; }
    const wydarzenie = $('lst-wydarzenie-import').value;
    if (!wydarzenie) { st.textContent = '❌ ' + t('lst.need_event'); return; }
    const punktyTekst = $('lst-punkty').value.trim();
    const punkty = punktyTekst === '' ? null : parsujPunkty(punktyTekst);   // v2.12.01: puste = automatycznie wg zasad tygodnia
    if (punkty !== null && (isNaN(punkty) || punkty < 0 || punkty > 100)) { st.textContent = '❌ ' + t('man.need_points'); return; }
    if (!confirm(t('lst.confirm_import', { n: doDodania.length, bad: listaNiedoczytane.length }))) return;

    $('btn-lst-importuj').disabled = true;
    st.textContent = '⏳ ' + t('man.saving');
    const wynik = await wywolajRPC('admin_import_listy', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_wydarzenie_id: wydarzenie,
        p_wiersze: doDodania.map(w => ({ wiersz: w.wiersz, kod: w.kod, data: w.dataISO, wybor: w.wybor })),
        p_punkty: punkty, p_niedoczytane: listaNiedoczytane, p_nazwa_pliku: listaNazwaPliku
    });
    $('btn-lst-importuj').disabled = false;
    if (!wynik.sukces) {
        const brak = wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883';
        st.textContent = '❌ ' + (brak ? t('lst.need_sql') : blad(wynik));
        return;
    }
    const bledy = wynik.bledy || [];
    st.innerHTML = `✅ ${esc(t('lst.imported', { a: wynik.dodano, b: wynik.zaktualizowano }))}`
        + (listaNiedoczytane.length ? `<div style="color:var(--warn,#fbbf24)">⚠️ ${esc(t('lst.unread_rows', { n: listaNiedoczytane.join(', ') }))}</div>` : '')
        + (bledy.length ? `<div style="color:var(--err)">❌ ${esc(t('lst.server_rejected'))}: ${bledy.map(b => esc(`#${b.wiersz} ${b.kod} — ${b.blad}`)).join('; ')}</div>` : '')
        + `<div style="color:var(--text-dim)">${esc(t('lst.source_note'))}</div>`;
    $('lst-wyniki').classList.add('hidden');
    listaWiersze = []; listaNiedoczytane = [];
    await odswiezHistorieImportow();
});

async function odswiezHistorieImportow() {
    const w = await wywolajRPC('admin_import_listy_historia', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_limit: 30 });
    const tbody = document.querySelector('#tabela-lista-historia tbody');
    if (!w.sukces) {
        const brak = w.kod_pg === 'PGRST202' || w.kod_pg === '42883';
        tbody.innerHTML = `<tr><td colspan="6" style="color:var(--err)">❌ ${esc(brak ? t('lst.need_sql') : blad(w))}</td></tr>`;
        return;
    }
    tbody.innerHTML = (w.dane || []).map(r => `
        <tr><td>${esc(formatDataCzas(r.kiedy))}</td><td>${esc(r.wydarzenie || '—')}</td><td>${esc(r.dodal)}</td><td>${esc(r.kto_kod)}</td>
            <td>${esc(r.dodano)}${r.zaktualizowano ? ` (+${esc(r.zaktualizowano)} ${esc(t('lst.updated_short'))})` : ''}</td>
            <td>${(r.niedoczytane || []).length ? esc((r.niedoczytane || []).join(', ')) : '—'}</td></tr>`).join('')
        || `<tr><td colspan="6" style="color:var(--text-dim)">${esc(t('lst.no_history'))}</td></tr>`;
}
