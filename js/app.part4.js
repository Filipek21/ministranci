
// ============================================================================
// GENERATOR KART, PDF (plakietki, raport, log korekt) i BEZPIECZEŃSTWO  (v2.3)
//
// PDF — przyczyna dawnej awarii: domyślna czcionka jsPDF (Helvetica) nie zawiera
// polskich ani ukraińskich liter, więc dokument wychodził z "krzaczkami" lub się nie
// budował. Teraz każdy PDF osadza czcionkę DejaVu Sans (fonts/*.ttf — polski, angielski
// i ukraiński w jednym pliku) i pokazuje czytelny komunikat, gdy cokolwiek się nie uda.
// ============================================================================

// ---------------------------------------------------------------- PDF: baza --
let czcionkiPdfPromise = null;

function arrayBufferNaBase64(buf) {
    const bajty = new Uint8Array(buf);
    let bin = '';
    const porcja = 0x8000;
    for (let i = 0; i < bajty.length; i += porcja) bin += String.fromCharCode.apply(null, bajty.subarray(i, i + porcja));
    return btoa(bin);
}

function zaladujCzcionkiPdf() {
    if (!czcionkiPdfPromise) {
        const pobierz = async (sciezka) => {
            const odp = await fetch(sciezka + '?v=' + encodeURIComponent(WERSJA_APLIKACJI));
            if (!odp.ok) throw new Error('HTTP ' + odp.status + ' — ' + sciezka);
            return arrayBufferNaBase64(await odp.arrayBuffer());
        };
        czcionkiPdfPromise = Promise.all([pobierz('fonts/DejaVuSans-sub.ttf'), pobierz('fonts/DejaVuSans-Bold-sub.ttf')])
            .then(([normal, bold]) => ({ normal, bold }))
            .catch((e) => { czcionkiPdfPromise = null; throw e; }); // następna próba pobierze od nowa
    }
    return czcionkiPdfPromise;
}

function sprawdzBibliotekiPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.QRCode) throw new Error(t('card.libs_missing'));
}

// Nowy dokument A4 z osadzoną czcionką (domyślnie ustawioną jako 'DejaVu')
async function nowyDokumentPdf() {
    sprawdzBibliotekiPdf();
    const czcionki = await zaladujCzcionkiPdf();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.addFileToVFS('DejaVuSans.ttf', czcionki.normal);
    doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
    doc.addFileToVFS('DejaVuSans-Bold.ttf', czcionki.bold);
    doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
    doc.setFont('DejaVu', 'normal');
    return doc;
}

function formatujDatePelna(iso) {
    return new Date(iso).toLocaleString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function dataDoNazwyPliku() { return new Date().toISOString().slice(0, 10); }

// Pobranie pliku. Na części przeglądarek mobilnych/PWA doc.save() bywa blokowane —
// wtedy otwieramy PDF w nowej karcie (stamtąd da się go zapisać).
function zapiszPdf(doc, nazwaPliku) {
    try {
        doc.save(nazwaPliku);
    } catch (e) {
        console.error('doc.save nie powiodło się, otwieram w nowej karcie', e);
        window.open(doc.output('bloburl'), '_blank');
    }
}

// Drukowanie: okno MUSI zostać otwarte synchronicznie w reakcji na klik (zanim zaczną się
// operacje asynchroniczne), inaczej przeglądarka uzna je za wyskakujące i zablokuje.
async function drukujPdf(budowniczy, nazwaPliku) {
    const okno = window.open('', '_blank');
    try {
        const doc = await budowniczy();
        if (okno) {
            doc.autoPrint();
            okno.location.href = doc.output('bloburl');
        } else {
            zapiszPdf(doc, nazwaPliku);
            alert(t('card.print_blocked'));
        }
    } catch (e) {
        if (okno) okno.close();
        throw e;
    }
}

// Wspólna obsługa kliknięć z komunikatem o postępie/błędzie
async function zPostepem(statusEl, dzialanie) {
    statusEl.style.color = '';
    statusEl.textContent = '⏳ ' + t('card.pdf_working');
    try {
        await dzialanie();
        statusEl.style.color = 'var(--ok)';
        statusEl.textContent = '✅ ' + t('card.pdf_ready');
    } catch (e) {
        console.error(e);
        statusEl.style.color = 'var(--err)';
        statusEl.textContent = '❌ ' + t('card.pdf_failed', { blad: e && e.message ? e.message : String(e) });
    }
}

// Prosta tabela do PDF: zawijanie tekstu w komórkach + automatyczne strony z powtórzonym nagłówkiem.
// kolumny: [{ tytul, x, w }] (mm). Zwraca końcową współrzędną y.
function rysujTabelePdf(doc, kolumny, wiersze, yStart, opcje) {
    const o = Object.assign({ rozmiar: 8, interlinia: 4, dolnyMargines: 285, gornyMargines: 16 }, opcje || {});
    let y = yStart;
    const naglowek = () => {
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(o.rozmiar);
        kolumny.forEach(k => doc.text(k.tytul, k.x, y));
        y += 2; doc.setDrawColor(190); doc.line(14, y, 196, y); y += o.interlinia;
        doc.setFont('DejaVu', 'normal');
    };
    doc.setFontSize(o.rozmiar);
    naglowek();
    wiersze.forEach(wiersz => {
        doc.setFont('DejaVu', 'normal'); doc.setFontSize(o.rozmiar);
        const linie = wiersz.map((v, i) => doc.splitTextToSize(String(v === null || v === undefined ? '' : v), kolumny[i].w));
        const wysokosc = Math.max(...linie.map(l => l.length)) * o.interlinia + 1.5;
        if (y + wysokosc > o.dolnyMargines) { doc.addPage(); y = o.gornyMargines; naglowek(); }
        linie.forEach((l, i) => doc.text(l, kolumny[i].x, y));
        y += wysokosc;
    });
    return y;
}

// ------------------------------------------------------- PDF: karta ministranta --
async function narysujStronePlakietki(doc, m) {
    const dataTekst = formatujDatePelna(m.wygenerowano);

    // ===== GÓRA STRONY: QR, imię, nazwisko, kod =====
    doc.setDrawColor(150);
    doc.roundedRect(20, 20, 170, 120, 6, 6);

    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(t('card.pdf_title'), 105, 32, { align: 'center' });
    doc.setTextColor(0);

    const qrDataUrl = await QRCode.toDataURL(String(m.kod_plakietki), { margin: 1, width: 400 });
    const qrRozmiar = 70;
    doc.addImage(qrDataUrl, 'PNG', 105 - qrRozmiar / 2, 40, qrRozmiar, qrRozmiar);

    doc.setFont('DejaVu', 'bold');
    doc.setFontSize(20);
    doc.text(`${m.imie} ${m.nazwisko}`, 105, 122, { align: 'center', maxWidth: 160 });
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(90);
    doc.text(t('card.pdf_code', { kod: m.kod }), 105, 132, { align: 'center' });
    doc.setTextColor(0);

    if (m.aktywna === false) {
        // tekst obrócony o 20° — środek w (105, 90); w jsPDF obrót wokół punktu początkowego, więc liczymy start
        doc.setFont('DejaVu', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(200, 0, 0);
        const napis = t('card.pdf_revoked');
        const w = doc.getTextWidth(napis), kat = 20 * Math.PI / 180;
        doc.text(napis, 105 - (w / 2) * Math.cos(kat), 90 + (w / 2) * Math.sin(kat), { angle: 20 });
        doc.setTextColor(0);
        doc.setFont('DejaVu', 'normal');
    }

    // ===== LINIA DO PRZECIĘCIA =====
    const yLinia = 155;
    doc.setDrawColor(150);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(15, yLinia, 195, yLinia);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(t('card.pdf_cut'), 105, yLinia - 2, { align: 'center' });
    doc.setTextColor(0);

    // ===== DÓŁ STRONY: PIN, numer plakietki, data =====
    doc.setDrawColor(150);
    doc.roundedRect(45, yLinia + 15, 120, 45, 4, 4);
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(t('card.pdf_pin', { kod: m.kod }), 105, yLinia + 26, { align: 'center' });
    doc.setFont('DejaVu', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(50);
    doc.text(m.pin_jawny ? String(m.pin_jawny) : t('bdg.pin_unknown'), 105, yLinia + 38, { align: 'center' });
    doc.setFont('DejaVu', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(t('card.pdf_badge_no', { kod: m.kod_plakietki }), 105, yLinia + 47, { align: 'center' });
    doc.text(t('card.pdf_generated', { data: dataTekst }), 105, yLinia + 53, { align: 'center' });
    doc.setTextColor(0);
}

async function zbudujPdfDlaListy(lista) {
    const doc = await nowyDokumentPdf();
    for (let i = 0; i < lista.length; i++) {
        if (i > 0) doc.addPage();
        await narysujStronePlakietki(doc, lista[i]);
    }
    return doc;
}

// ---------------------------------------------------- Miniaturka karty na ekranie --
async function renderujMiniaturkeA4(kontener, m) {
    const dataTekst = formatujDatePelna(m.wygenerowano);
    const qrDataUrl = await QRCode.toDataURL(String(m.kod_plakietki), { margin: 1, width: 300 });
    const uniewazniona = m.aktywna === false;
    kontener.innerHTML = `
        <div style="background:white; color:#111; border-radius:6px; overflow:hidden; box-shadow:0 4px 14px rgba(0,0,0,0.4);
                    aspect-ratio:210/297; width:100%; display:flex; flex-direction:column; position:relative; font-family:sans-serif;
                    ${uniewazniona ? 'filter:grayscale(1);' : ''}">
            ${uniewazniona ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:2;">
                <div style="background:rgba(200,0,0,0.85); color:white; font-weight:800; padding:6px 16px; border-radius:6px; transform:rotate(-18deg); font-size:0.9rem;">${esc(t('card.pdf_revoked'))}</div>
            </div>` : ''}
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6% 8% 2%; border-bottom:1px dashed #999;">
                <div style="font-size:0.55rem; color:#888; margin-bottom:4%;">${esc(t('card.pdf_title'))}</div>
                <img src="${qrDataUrl}" alt="QR" style="width:55%; aspect-ratio:1/1;">
                <div style="font-weight:800; font-size:0.85rem; margin-top:4%; text-align:center;">${esc(m.imie)} ${esc(m.nazwisko)}</div>
                <div style="font-size:0.7rem; color:#555;">${esc(t('card.pdf_code', { kod: m.kod }))}</div>
            </div>
            <div style="flex:0 0 22%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:2%;">
                <div style="font-size:0.5rem; color:#999;">${esc(t('card.pdf_pin', { kod: m.kod }))}</div>
                <div style="font-size:1rem; font-weight:800; color:#333; letter-spacing:2px;">${esc(m.pin_jawny || t('bdg.pin_unknown'))}</div>
                <div style="font-size:0.45rem; color:#aaa; margin-top:2%;">${esc(t('card.pdf_badge_no', { kod: m.kod_plakietki }))}</div>
                <div style="font-size:0.45rem; color:#aaa;">${esc(t('card.pdf_generated', { data: dataTekst }))}</div>
            </div>
        </div>`;
}

// --------------------------------------------------------- Generator kart (zakładka) --
let rosterKart = [];                  // aktywni ministranci (admin_lista_ministrantow — ma pin_jawny)
const zaznaczeniDoWydruku = new Set(); // id ministrantów zaznaczonych checkboxem
let ostatnioWygenerowane = [];

async function odswiezRosterKart() {
    const wynik = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    const cont = $('karty-lista');
    if (!wynik.sukces) { cont.innerHTML = `<p style="color:var(--err)">❌ ${esc(blad(wynik))}</p>`; return; }
    rosterKart = (wynik.dane || []).filter(m => m.aktywny);
    renderujListeKart();
    await odswiezWszystkiePlakietki();
}

function renderujListeKart() {
    const cont = $('karty-lista');
    if (rosterKart.length === 0) { cont.innerHTML = `<p style="color:var(--text-dim)">${esc(t('card.none_active'))}</p>`; return; }
    const wszyscy = rosterKart.every(m => zaznaczeniDoWydruku.has(m.id));
    cont.innerHTML = `
        <div style="margin-bottom:6px;">
            <button type="button" class="btn btn-secondary" style="width:auto; padding:6px 12px; font-size:0.85rem;" data-akcja="karty-wszyscy">${esc(wszyscy ? t('card.deselect_all') : t('card.select_all'))}</button>
        </div>` + rosterKart.map(m => `
        <label style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);">
            <input type="checkbox" style="width:auto; margin:0;" data-karta-id="${esc(m.id)}" ${zaznaczeniDoWydruku.has(m.id) ? 'checked' : ''}>
            <span style="flex:1">${esc(m.kod)} — ${esc(m.imie)} ${esc(m.nazwisko)}</span>
            <span style="color:var(--text-dim)">PIN: ${esc(m.pin_jawny ?? '—')}</span>
        </label>`).join('');
}

$('karty-lista').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-karta-id]');
    if (!cb) return;
    if (cb.checked) zaznaczeniDoWydruku.add(cb.dataset.kartaId); else zaznaczeniDoWydruku.delete(cb.dataset.kartaId);
});
AKCJE['karty-wszyscy'] = () => {
    const wszyscy = rosterKart.every(m => zaznaczeniDoWydruku.has(m.id));
    rosterKart.forEach(m => wszyscy ? zaznaczeniDoWydruku.delete(m.id) : zaznaczeniDoWydruku.add(m.id));
    renderujListeKart();
};

$('btn-generuj-pdf').addEventListener('click', async () => {
    const status = $('karty-status');
    const wybrani = rosterKart.filter(m => zaznaczeniDoWydruku.has(m.id));
    if (wybrani.length === 0) { status.style.color = 'var(--err)'; status.textContent = t('card.pick_one'); return; }

    const btn = $('btn-generuj-pdf');
    btn.disabled = true;
    status.style.color = '';
    status.textContent = t('card.generating');
    const wygenerowane = [];

    for (const m of wybrani) {
        // Nowa, unikalna plakietka dla tej karty (osobny kod w QR, można ją później unieważnić bez ruszania konta)
        const plakietka = await wywolajRPC('admin_generuj_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: m.id });
        if (!plakietka.sukces) {
            status.style.color = 'var(--err)';
            status.textContent = '❌ ' + t('card.error_for', { kod: m.kod, blad: blad(plakietka) });
            continue;
        }
        wygenerowane.push({ ...m, kod_plakietki: plakietka.kod_plakietki, wygenerowano: plakietka.wygenerowano, aktywna: true });
    }
    btn.disabled = false;

    if (wygenerowane.length > 0) {
        status.style.color = 'var(--ok)';
        status.textContent = '✅ ' + t('card.done', { n: wygenerowane.length });
        ostatnioWygenerowane = wygenerowane;
        await renderujPodgladWygenerowanych(wygenerowane);
        wygenerowane.forEach(m => zaznaczeniDoWydruku.delete(m.id));
        renderujListeKart();
        await odswiezListeMinistrantow();
        await odswiezWszystkiePlakietki();
    }
});

async function renderujPodgladWygenerowanych(lista) {
    let cont = $('podglad-nowych-plakietek');
    if (!cont) {
        cont = document.createElement('div');
        cont.id = 'podglad-nowych-plakietek';
        $('karty-status').after(cont);
    }
    cont.innerHTML = `
        <h3 style="margin-top:20px;">${esc(t('card.preview_title'))}</h3>
        <div id="miniaturki-plakietek" style="display:flex; flex-wrap:wrap; gap:14px;"></div>
        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
            <button class="btn" style="width:auto" id="btn-pobierz-wszystkie">${esc(t('card.download_all'))}</button>
            <button class="btn btn-secondary" style="width:auto" id="btn-drukuj-wszystkie">${esc(t('card.print_all'))}</button>
        </div>
        <div id="podglad-nowych-status" style="margin-top:8px;"></div>`;

    const statusEl = $('podglad-nowych-status');
    $('btn-pobierz-wszystkie').addEventListener('click', () => zPostepem(statusEl, async () => {
        zapiszPdf(await zbudujPdfDlaListy(ostatnioWygenerowane), `karty-ministranci-${dataDoNazwyPliku()}.pdf`);
    }));
    $('btn-drukuj-wszystkie').addEventListener('click', () => zPostepem(statusEl, () =>
        drukujPdf(() => zbudujPdfDlaListy(ostatnioWygenerowane), `karty-ministranci-${dataDoNazwyPliku()}.pdf`)));

    const miniaturki = $('miniaturki-plakietek');
    for (const m of lista) {
        const wrap = document.createElement('div');
        wrap.style.width = '210px';
        miniaturki.appendChild(wrap);
        try { await renderujMiniaturkeA4(wrap, m); }
        catch (e) { console.error(e); wrap.textContent = t('card.libs_missing'); }
    }
}

// --- Modal: podgląd / pobierz / drukuj POJEDYNCZEJ, już istniejącej plakietki ---
function znajdzPinMinistranta(kodMinistranta) {
    const m = (rosterKart || []).concat(biezacaListaMinistrantow || []).find(x => x.kod === kodMinistranta);
    return m ? m.pin_jawny : null;
}

async function pokazPodgladPojedynczej(p) {
    const dane = {
        imie: p.imie, nazwisko: p.nazwisko, kod: p.ministrant_kod,
        // lista plakietek zwykle nie niesie PIN-u — bierzemy go z listy ministrantów
        pin_jawny: p.pin_jawny || znajdzPinMinistranta(p.ministrant_kod),
        kod_plakietki: p.kod_plakietki, wygenerowano: p.wygenerowano, aktywna: p.aktywna
    };
    const stary = $('modal-podglad-plakietki');
    if (stary) stary.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-podglad-plakietki';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;';
    modal.innerHTML = `
        <div class="card" style="max-width:340px; width:100%; max-height:90vh; overflow:auto; margin:0;">
            <div class="top-bar"><h3>${esc(t('bdg.modal_title'))}</h3><a href="#" id="btn-zamknij-modal-podglad">${esc(t('common.close'))} ✕</a></div>
            <div id="modal-miniaturka"></div>
            ${dane.aktywna ? `
            <div style="display:flex; gap:8px; margin-top:14px;">
                <button class="btn" id="modal-btn-pobierz">${esc(t('bdg.download'))}</button>
                <button class="btn btn-secondary" id="modal-btn-drukuj">${esc(t('bdg.print'))}</button>
            </div>` : `<p style="color:var(--text-dim)">${esc(t('bdg.modal_revoked'))}</p>`}
            <div id="modal-status" style="margin-top:8px; font-size:0.9rem;"></div>
        </div>`;
    document.body.appendChild(modal);

    const zamknij = (e) => { if (e) e.preventDefault(); modal.remove(); };
    $('btn-zamknij-modal-podglad').addEventListener('click', zamknij);
    modal.addEventListener('click', (e) => { if (e.target === modal) zamknij(); });

    try { await renderujMiniaturkeA4($('modal-miniaturka'), dane); }
    catch (e) { console.error(e); $('modal-miniaturka').textContent = t('card.libs_missing'); }

    if (dane.aktywna) {
        const statusEl = $('modal-status');
        $('modal-btn-pobierz').addEventListener('click', () => zPostepem(statusEl, async () => {
            zapiszPdf(await zbudujPdfDlaListy([dane]), `plakietka-${dane.kod}.pdf`);
        }));
        $('modal-btn-drukuj').addEventListener('click', () => zPostepem(statusEl, () =>
            drukujPdf(() => zbudujPdfDlaListy([dane]), `plakietka-${dane.kod}.pdf`)));
    }
}

// --- Lista WSZYSTKICH wydanych plakietek ---
async function odswiezWszystkiePlakietki() {
    const wynik = await wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: null });
    const tbody = $('tabela-wszystkie-plakietki').querySelector('tbody');
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(5, '❌ ' + blad(wynik)); return; }
    wszystkiePlakietki = wynik.dane || [];
    tbody.innerHTML = wierszePlakietek(wszystkiePlakietki, 5, true, 'wszystkie');
}

// ============================================================================
// BEZPIECZEŃSTWO
//   • zablokowane kody (odblokowanie — tylko Admin)
//   • log korekt ręcznych (+ eksport CSV / PDF)
//   • raport miesięczny PDF
//   • historia logowań
//   Każde zapytanie ma własną obsługę błędów — nic nie znika po cichu.
// ============================================================================
let biezacyLogKorekt = [];

function komunikatBledu(tekst) { return `<span style="color:var(--err)">❌ ${esc(tekst)}</span>`; }

async function odswiezBezpieczenstwo() {
    const admin = !!sesja.is_admin;

    // --- zablokowane kody ---
    const tbZabl = $('tabela-zablokowane').querySelector('tbody');
    const { data: zablokowane, error: errZabl } = await supabaseClient.from('zablokowane_kody').select('*');
    if (errZabl) {
        tbZabl.innerHTML = `<tr><td colspan="4">${komunikatBledu(t('sec.load_error', { blad: errZabl.message }))}</td></tr>`;
    } else {
        tbZabl.innerHTML = (zablokowane || []).map(z => `
            <tr>
                <td>${esc(z.kod)}</td>
                <td>${esc(z.nieudane_proby)}</td>
                <td>${esc(formatGodzina(z.zablokowane_do))}</td>
                <td>${admin ? `<button class="btn btn-secondary" style="width:auto; padding:6px 12px;" data-akcja="sec-odblokuj" data-kod="${esc(z.kod)}">${esc(t('sec.unlock'))}</button>` : ''}</td>
            </tr>`).join('') || wierszKomunikat(4, t('sec.none_locked'));
    }

    // --- log korekt ---
    const tbLog = $('tabela-log-korekt').querySelector('tbody');
    const { data: log, error: errLog } = await supabaseClient.from('log_korekt_czytelny').select('*').order('kiedy', { ascending: false }).limit(200);
    if (errLog) {
        biezacyLogKorekt = [];
        tbLog.innerHTML = `<tr><td colspan="5">${komunikatBledu(t('sec.load_error', { blad: errLog.message }))}</td></tr>`;
    } else {
        biezacyLogKorekt = log || [];
        tbLog.innerHTML = biezacyLogKorekt.map(l => `
            <tr>
                <td>${esc(formatDataCzas(l.kiedy))}</td>
                <td>${esc(l.kto_pelne_imie)} (${esc(l.kto)})</td>
                <td>${esc(l.komu_pelne_imie)} (${esc(l.komu_kod)})</td>
                <td>${esc(l.wydarzenie)} — ${esc(l.zaliczone_jako)}</td>
                <td>${esc(l.punkty_przed ?? '—')} → ${esc(l.punkty_po)}</td>
            </tr>`).join('') || wierszKomunikat(5, t('sec.none_corr'));
    }

    await odswiezHistorieLogowan();
}

// Blokady wygasają same — odświeżaj listę, dopóki zakładka jest otwarta
setInterval(() => {
    if (sesja && aktywnaZakladka === 'bezpieczenstwo' && !widokAdmin.classList.contains('hidden') && !document.hidden) odswiezBezpieczenstwo();
}, 30000);

async function odswiezHistorieLogowan() {
    const filtr = $('historia-logowan-filtr').value.trim() || null;
    const wynik = await wywolajRPC('historia_logowan', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_filtr_kod: filtr, p_limit: 200 });
    const tbody = $('tabela-historia-logowan').querySelector('tbody');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="4">${komunikatBledu(blad(wynik))}</td></tr>`; return; }
    tbody.innerHTML = (wynik.dane || []).map(l => `
        <tr>
            <td>${esc(formatDataCzas(l.kiedy))}</td>
            <td>${esc(l.kod)}</td>
            <td style="color:${l.sukces ? 'var(--ok)' : 'var(--err)'}">${esc(l.sukces ? t('sec.res_ok') : t('sec.res_fail'))}</td>
            <td>${esc(powodLogowania(l.powod))}</td>
        </tr>`).join('') || wierszKomunikat(4, t('sec.none_logins'));
}
$('btn-odswiez-historie-logowan').addEventListener('click', odswiezHistorieLogowan);
$('historia-logowan-filtr').addEventListener('keydown', (e) => { if (e.key === 'Enter') odswiezHistorieLogowan(); });

async function odblokujKod(kod) {
    if (!sesja.is_admin) { alert(t('sec.admin_only')); return; }
    const st = $('odblokuj-status');
    const wynik = await wywolajRPC('admin_odblokuj_kod', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kod_do_odblokowania: kod });
    st.style.color = wynik.sukces ? 'var(--ok)' : 'var(--err)';
    st.textContent = wynik.sukces ? ('✅ ' + (wynik.informacja || t('sec.unlocked'))) : ('❌ ' + blad(wynik));
    await odswiezBezpieczenstwo();
}
AKCJE['sec-odblokuj'] = (d) => odblokujKod(d.kod);
$('btn-odblokuj-recznie').addEventListener('click', () => {
    const kod = $('odblokuj-kod-input').value.trim();
    if (!kod) return;
    odblokujKod(kod);
    $('odblokuj-kod-input').value = '';
});

// --- Eksport logu korekt: CSV (UTF-8 z BOM, średnik — poprawnie otwiera się w Excelu) ---
$('btn-eksport-log-csv').addEventListener('click', () => {
    if (biezacyLogKorekt.length === 0) { alert(t('sec.no_export')); return; }
    const naglowki = [t('sec.col_when'), t('sec.col_who') + ' (kod)', t('sec.col_who'), t('sec.col_to') + ' (kod)', t('sec.col_to'), t('sec.col_event'), 'Typ', 'Przed', 'Po'];
    const wiersze = biezacyLogKorekt.map(l => [
        formatDataCzas(l.kiedy), l.kto, l.kto_pelne_imie, l.komu_kod, l.komu_pelne_imie,
        l.wydarzenie, l.zaliczone_jako, l.punkty_przed ?? '', l.punkty_po
    ]);
    // zabezpieczenie przed "formula injection" w Excelu: komórki zaczynające się od = + - @ dostają apostrof
    const komorka = (pole) => {
        let s = String(pole === null || pole === undefined ? '' : pole);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [naglowki, ...wiersze].map(w => w.map(komorka).join(';')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `log-korekt-${dataDoNazwyPliku()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// --- Eksport logu korekt: PDF ---
$('btn-eksport-log-pdf').addEventListener('click', async () => {
    if (biezacyLogKorekt.length === 0) { alert(t('sec.no_export')); return; }
    const status = $('odblokuj-status');
    await zPostepem(status, async () => {
        const doc = await nowyDokumentPdf();
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(14);
        doc.text(t('sec.pdf_corr_title'), 14, 15);
        const kolumny = [
            { tytul: t('sec.col_when'), x: 14, w: 30 }, { tytul: t('sec.col_who'), x: 46, w: 32 },
            { tytul: t('sec.col_to'), x: 80, w: 32 }, { tytul: t('sec.col_event'), x: 114, w: 58 },
            { tytul: t('sec.rp_pts'), x: 174, w: 22 }
        ];
        const wiersze = biezacyLogKorekt.map(l => [
            formatDataCzas(l.kiedy), l.kto_pelne_imie, l.komu_pelne_imie,
            `${l.wydarzenie} (${l.zaliczone_jako})`, `${l.punkty_przed ?? '—'} → ${l.punkty_po}`
        ]);
        rysujTabelePdf(doc, kolumny, wiersze, 24);
        zapiszPdf(doc, `log-korekt-${dataDoNazwyPliku()}.pdf`);
    });
});

// --- RAPORT MIESIĘCZNY (dowolny miesiąc) ---
$('btn-generuj-raport').addEventListener('click', async () => {
    const rok = parseInt($('raport-rok').value);
    const miesiac = parseInt($('raport-miesiac').value);
    const status = $('raport-status');
    status.style.color = '';
    status.textContent = '';
    if (!rok || rok < 2000 || rok > 2100) { status.style.color = 'var(--err)'; status.textContent = t('sec.report_bad_year'); return; }

    status.textContent = '⏳ ' + t('sec.report_working');
    const wynik = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    if (!wynik.sukces) { status.style.color = 'var(--err)'; status.textContent = '❌ ' + blad(wynik); return; }

    try {
        const nazwaM = nazwaMiesiaca(miesiac);
        const doc = await nowyDokumentPdf();

        doc.setFont('DejaVu', 'bold'); doc.setFontSize(16);
        doc.text(t('sec.report_h', { miesiac: nazwaM, rok }), 14, 18);
        doc.setFontSize(12);
        doc.text(t('sec.report_rank'), 14, 28);
        rysujTabelePdf(doc,
            [{ tytul: t('sec.rp_pos'), x: 14, w: 14 }, { tytul: t('sec.rp_code'), x: 30, w: 28 }, { tytul: t('sec.rp_name'), x: 60, w: 95 }, { tytul: t('sec.rp_points'), x: 160, w: 30 }],
            (wynik.ranking || []).map(r => [`${r.pozycja}.`, r.kod, `${r.imie} ${r.nazwisko}`, r.punkty]),
            36, { rozmiar: 9, interlinia: 5 });

        doc.addPage();
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(12);
        doc.text(t('sec.report_hist', { miesiac: nazwaM, rok }), 14, 18);
        rysujTabelePdf(doc,
            [{ tytul: t('sec.rp_date'), x: 14, w: 26 }, { tytul: t('sec.rp_minister'), x: 42, w: 55 }, { tytul: t('sec.rp_event'), x: 99, w: 55 }, { tytul: t('sec.rp_as'), x: 156, w: 30 }, { tytul: t('sec.rp_pts'), x: 188, w: 10 }],
            (wynik.historia || []).map(h => [formatData(h.data_zapisu), `${h.imie} ${h.nazwisko}`, h.nazwa, h.zaliczone_jako, h.punkty]),
            26);

        zapiszPdf(doc, `raport-${rok}-${String(miesiac).padStart(2, '0')}.pdf`);
        status.style.color = 'var(--ok)';
        status.textContent = '✅ ' + t('sec.report_done');
    } catch (e) {
        console.error(e);
        status.style.color = 'var(--err)';
        status.textContent = '❌ ' + t('card.pdf_failed', { blad: e && e.message ? e.message : String(e) });
    }
});
