
// ============================================================================
// v2.6 — DASHBOARD, STATYSTYKI, RAPORT FREKWENCJI, USTAWIENIA SYSTEMOWE, AUDYT, RODO,
//        porównanie z poprzednim miesiącem (ministrant)
//
//  Admin:   Dashboard startowy, Statystyki i raporty (CSV/PDF), Ustawienia, Audyt, RODO
//  Ksiądz:  Raport frekwencji (+ dodawanie/zarządzanie ministrantami — app.part3.js)
//  Ministrant: karta „Porównanie z poprzednim miesiącem”
// ============================================================================

// ---------------------------------------------------------------- narzędzia ----
function pobierzBlob(blob, nazwaPliku) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nazwaPliku;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// CSV: UTF-8 z BOM, średnik; zabezpieczenie przed „formula injection” w Excelu
function zbudujCsv(naglowki, wiersze) {
    const komorka = (v) => {
        let s = String(v === null || v === undefined ? '' : v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = [naglowki, ...wiersze].map(w => w.map(komorka).join(';')).join('\r\n');
    return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
}

function przesunMiesiac(rok, miesiac, delta) {
    const d = new Date(rok, miesiac - 1 + delta, 1);
    return { rok: d.getFullYear(), miesiac: d.getMonth() + 1 };
}
function klucMiesiaca(rok, miesiac) { return `${rok}-${String(miesiac).padStart(2, '0')}`; }

// ------------------------------------------------------ ustawienia (publiczne) ----
// Wartości domyślne działają także bez sql/18 — ustawienia z serwera tylko je nadpisują.
const USTAWIENIA = { nazwa_parafii: 'Parafia', okno_przed_min: 15, okno_po_min: 5, cache_offline_dni: 10, cache_odswiez_min: 30, domyslny_jezyk: 'pl' };

async function ladujUstawieniaPubliczne() {
    const w = await wywolajRPC('ustawienia_publiczne', {});
    // funkcja zwraca sam obiekt JSON (bez pola „sukces”) — rozpoznajemy po kluczach
    if (w && !w.siec && !w.kod_pg && typeof w === 'object' && (w.nazwa_parafii !== undefined || w.okno_przed_min !== undefined)) {
        Object.assign(USTAWIENIA, w);
        // domyślne okno rejestracji w formularzu nowego wydarzenia (tylko jeśli Admin jeszcze nic nie zmienił)
        if ($('nowe-przed') && $('nowe-przed').value === '15') $('nowe-przed').value = USTAWIENIA.okno_przed_min;
        if ($('nowe-po') && $('nowe-po').value === '5') $('nowe-po').value = USTAWIENIA.okno_po_min;
    }
}
const nazwaParafii = () => String(USTAWIENIA.nazwa_parafii || 'Parafia');

// ----------------------------------------------------------- dane do raportów ----
let kalendarzPamiec = { czas: 0, dane: [] };
async function pobierzKalendarz() {
    if (Date.now() - kalendarzPamiec.czas < 60000 && kalendarzPamiec.dane.length) return kalendarzPamiec.dane;
    const { data } = await odczytajZBledem(supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(1500), 'kalendarz');
    kalendarzPamiec = { czas: Date.now(), dane: data || [] };
    return kalendarzPamiec.dane;
}
function wydarzeniaWMiesiacu(kalendarz, rok, miesiac, tylkoMinione) {
    const teraz = Date.now();
    return kalendarz.filter(w => {
        const d = new Date(w.data_wydarzenia);
        return d.getFullYear() === rok && d.getMonth() + 1 === miesiac && (!tylkoMinione || d.getTime() <= teraz);
    });
}
async function raportMiesiaca(rok, miesiac) {
    const w = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    return w.sukces ? { ranking: w.ranking || [], historia: w.historia || [] } : { ranking: [], historia: [], blad: blad(w) };
}
async function listaAktywnychMinistrantow() {
    const w = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    return w.sukces ? (w.dane || []).filter(m => m.aktywny && !m.is_admin && !m.is_moderator) : [];
}
const sredniaProcent = (a) => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0;

// ================================================================== DASHBOARD ====
async function odswiezDashboard() {
    if (!sesja || !sesja.is_admin) return;
    const teraz = new Date(), rok = teraz.getFullYear(), miesiac = teraz.getMonth() + 1;
    const [aktywni, raport, kalendarz, kioski, zgl, blokady, ksiega] = await Promise.all([
        listaAktywnychMinistrantow(),
        raportMiesiaca(rok, miesiac),
        pobierzKalendarz(),
        wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin }),
        wywolajRPC('lista_zgloszen', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: 'oczekujace' }),
        wywolajRPC('admin_blokady_pin_lista', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin }),
        wywolajRPC('admin_historia_punktow', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: null, p_limit: 8 })
    ]);

    // zablokowane kody: nowa funkcja (sql/16) albo stary widok
    let zablokowane = 0;
    if (blokady.sukces) zablokowane = (blokady.dane || []).filter(b => b.trwala || (b.zablokowane_do && new Date(b.zablokowane_do) > teraz)).length;
    else { const { data } = await odczytajZBledem(supabaseClient.from('zablokowane_kody').select('kod'), 'zablokowane_kody'); zablokowane = (data || []).length; }

    const listaKioskow = kioski.sukces ? (kioski.dane || []) : [];
    const kioskiOnline = listaKioskow.filter(k => k.online).length;
    const kioskiOffline = listaKioskow.length - kioskiOnline;
    const kolejki = listaKioskow.reduce((s, k) => s + (((k.ostatnie_dane && k.ostatnie_dane.offline_kolejka_dlugosc) || 0)), 0);
    const oczekujace = zgl.sukces ? (zgl.dane || []).length : 0;
    const punktyMiesiac = raport.historia.reduce((s, h) => s + (Number(h.punkty) || 0), 0);
    const wydarzeniaMiesiac = wydarzeniaWMiesiacu(kalendarz, rok, miesiac, false);
    const nadchodzace = kalendarz.filter(w => new Date(w.data_wydarzenia) > teraz).sort((a, b) => new Date(a.data_wydarzenia) - new Date(b.data_wydarzenia)).slice(0, 5);

    const kpi = (wartosc, klucz, klasa) => `<div class="kpi ${klasa || ''}"><div class="wartosc">${esc(wartosc)}</div><div class="etykieta">${esc(t(klucz))}</div></div>`;
    $('dash-kpi').innerHTML =
        kpi(aktywni.length, 'dash.k_ministers') + kpi(punktyMiesiac, 'dash.k_points') + kpi(raport.historia.length, 'dash.k_attend') +
        kpi(wydarzeniaMiesiac.length, 'dash.k_events') + kpi(oczekujace, 'dash.k_requests', oczekujace ? 'alarm' : '') +
        kpi(`${kioskiOnline}/${listaKioskow.length}`, 'dash.k_kiosks', kioskiOffline ? 'alarm' : 'ok') +
        kpi(zablokowane, 'dash.k_locked', zablokowane ? 'alarm' : '') + kpi(kolejki, 'dash.k_queue', kolejki ? 'alarm' : '');

    const alerty = [];
    if (kioskiOffline) alerty.push(t('dash.al_kiosk', { n: kioskiOffline }));
    if (zablokowane) alerty.push(t('dash.al_locked', { n: zablokowane }));
    if (oczekujace) alerty.push(t('dash.al_requests', { n: oczekujace }));
    if (kolejki) alerty.push(t('dash.al_queue', { n: kolejki }));
    if (!nadchodzace.length) alerty.push(t('dash.al_events'));
    $('dash-alerty').innerHTML = alerty.length ? alerty.map(a => `<div class="alert-wiersz">⚠️ ${esc(a)}</div>`).join('') : `<div class="alert-wiersz ok">${esc(t('dash.alert_none'))}</div>`;

    $('dash-top').innerHTML = raport.ranking.slice(0, 5).map(r =>
        `<div style="padding:5px 0;">${esc(r.pozycja)}. ${esc(r.imie)} ${esc(r.nazwisko)} — <b>${esc(t('common.points_short', { n: r.punkty }))}</b></div>`).join('') || `<p style="color:var(--text-dim)">${esc(t('dash.none'))}</p>`;
    $('dash-wydarzenia').innerHTML = nadchodzace.map(w =>
        `<div style="padding:5px 0;">${esc(formatDataCzas(w.data_wydarzenia))} — ${esc(w.nazwa)}</div>`).join('') || `<p style="color:var(--text-dim)">${esc(t('dash.al_events'))}</p>`;
    $('dash-ostatnie').innerHTML = (ksiega.sukces ? (ksiega.dane || []) : []).map(h =>
        `<div style="padding:5px 0; font-size:0.9rem;">${esc(formatDataCzas(h.kiedy))} — ${esc(h.imie || h.ministrant_kod || '')} ${esc(h.nazwisko || '')}: <b style="color:${h.zmiana < 0 ? 'var(--err)' : 'var(--ok)'}">${esc(zmianaTekst(h.zmiana))}</b></div>`).join('')
        || `<p style="color:var(--text-dim)">${esc(t('dash.none'))}</p>`;
    $('dash-odswiezono').textContent = t('dash.updated', { kiedy: formatGodzina(new Date().toISOString()) });
}
$('btn-dash-odswiez').addEventListener('click', odswiezDashboard);

// ================================================================= STATYSTYKI ====
let statystykiDane = null;

async function odswiezStatystyki() {
    if (!sesja || !sesja.is_admin) return;
    const status = $('st-status');
    status.style.color = '';
    status.textContent = '⏳ ' + t('st.loading');
    const n = parseInt($('st-miesiecy').value) || 6;
    const teraz = new Date();
    const miesiace = [];
    for (let i = n - 1; i >= 0; i--) miesiace.push(przesunMiesiac(teraz.getFullYear(), teraz.getMonth() + 1, -i));

    const [raporty, kalendarz, aktywni] = await Promise.all([
        Promise.all(miesiace.map(m => raportMiesiaca(m.rok, m.miesiac))),
        pobierzKalendarz(),
        listaAktywnychMinistrantow()
    ]);

    const trend = miesiace.map((m, i) => {
        const hist = raporty[i].historia;
        const wydarzen = wydarzeniaWMiesiacu(kalendarz, m.rok, m.miesiac, true).length;
        const unikalni = new Set(hist.map(h => h.kod)).size;
        const frekw = (wydarzen > 0 && aktywni.length > 0) ? Math.min(100, Math.round(hist.length / (wydarzen * aktywni.length) * 100)) : 0;
        return { rok: m.rok, miesiac: m.miesiac, etykieta: `${nazwaMiesiaca(m.miesiac)} ${m.rok}`, obecnosci: hist.length,
                 punkty: hist.reduce((s, h) => s + (Number(h.punkty) || 0), 0), unikalni, wydarzen, frekw };
    });

    const typy = {};
    const ranking = {};
    raporty.forEach(r => r.historia.forEach(h => {
        typy[h.zaliczone_jako] = (typy[h.zaliczone_jako] || 0) + 1;
        const k = ranking[h.kod] || (ranking[h.kod] = { kod: h.kod, nazwa: `${h.imie} ${h.nazwisko}`, obecnosci: 0, punkty: 0 });
        k.obecnosci += 1; k.punkty += Number(h.punkty) || 0;
    }));
    const rankingTab = Object.values(ranking).sort((a, b) => b.punkty - a.punkty || b.obecnosci - a.obecnosci);
    const typyTab = Object.entries(typy).sort((a, b) => b[1] - a[1]);

    statystykiDane = { trend, typyTab, rankingTab, od: trend[0].etykieta, do: trend[trend.length - 1].etykieta };
    status.textContent = '';
    renderujStatystyki();
}

function renderujStatystyki() {
    const d = statystykiDane;
    if (!d) return;
    const maxPkt = Math.max(1, ...d.trend.map(x => x.punkty)), maxObec = Math.max(1, ...d.trend.map(x => x.obecnosci));
    $('st-wykres').innerHTML = `<div class="slupki">${d.trend.map(x => `
        <div class="slupek-grupa" title="${esc(x.etykieta)}">
            <div class="slupek-para">
                <div class="slupek pkt" style="height:${Math.round(x.punkty / maxPkt * 120)}px" title="${esc(t('st.col_points'))}: ${esc(x.punkty)}"></div>
                <div class="slupek obec" style="height:${Math.round(x.obecnosci / maxObec * 120)}px" title="${esc(t('st.col_att'))}: ${esc(x.obecnosci)}"></div>
            </div>
            <div>${esc(nazwaMiesiaca(x.miesiac).slice(0, 3))}</div>
        </div>`).join('')}</div>
        <p style="font-size:0.8rem; color:var(--text-dim)"><span style="color:var(--accent)">■</span> ${esc(t('st.col_points'))} &nbsp; <span style="color:var(--ok)">■</span> ${esc(t('st.col_att'))}</p>`;

    $('tabela-st-trend').querySelector('tbody').innerHTML = d.trend.map(x => `<tr>
        <td>${esc(x.etykieta)}</td><td>${esc(x.obecnosci)}</td><td>${esc(x.punkty)}</td><td>${esc(x.unikalni)}</td><td>${esc(x.wydarzen)}</td><td>${esc(x.frekw)}%</td></tr>`).join('');
    $('tabela-st-typy').querySelector('tbody').innerHTML = d.typyTab.map(([typ, ile]) =>
        `<tr><td>${esc(etykieta('cal.type.' + typ, typ))}</td><td>${esc(ile)}</td></tr>`).join('') || wierszKomunikat(2, t('st.none'));
    $('tabela-st-ranking').querySelector('tbody').innerHTML = d.rankingTab.slice(0, 50).map((r, i) => `<tr>
        <td>${i + 1}.</td><td>${esc(r.nazwa)} <small style="color:var(--text-dim)">${esc(r.kod)}</small></td><td>${esc(r.obecnosci)}</td><td>${esc(r.punkty)}</td></tr>`).join('') || wierszKomunikat(4, t('st.none'));
}

$('btn-st-odswiez').addEventListener('click', odswiezStatystyki);
$('btn-st-csv').addEventListener('click', () => {
    const d = statystykiDane;
    if (!d) return;
    const naglowki = [t('st.col_month'), t('st.col_att'), t('st.col_points'), t('st.col_unique'), t('st.col_events'), t('st.col_avg') + ' %'];
    pobierzBlob(zbudujCsv(naglowki, d.trend.map(x => [x.etykieta, x.obecnosci, x.punkty, x.unikalni, x.wydarzen, x.frekw])), `statystyki-${dataDoNazwyPliku()}.csv`);
});
$('btn-st-pdf').addEventListener('click', async () => {
    const d = statystykiDane;
    if (!d) return;
    await zPostepem($('st-status'), async () => {
        const doc = await nowyDokumentPdf();
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(15);
        doc.text(t('st.pdf_title', { parafia: nazwaParafii() }), 14, 16);
        doc.setFont('DejaVu', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
        doc.text(t('st.period', { od: d.od, do: d.do }), 14, 23);
        doc.setTextColor(0);

        // wykres słupkowy (punkty = fiolet, obecności = zielony)
        const x0 = 18, y0 = 78, h = 40, szer = 174 / d.trend.length;
        const maxP = Math.max(1, ...d.trend.map(x => x.punkty)), maxO = Math.max(1, ...d.trend.map(x => x.obecnosci));
        doc.setDrawColor(180); doc.line(x0 - 2, y0, 192, y0);
        d.trend.forEach((x, i) => {
            const bx = x0 + i * szer;
            const w = Math.min(8, szer / 3);
            doc.setFillColor(124, 92, 255); doc.rect(bx, y0 - x.punkty / maxP * h, w, x.punkty / maxP * h, 'F');
            doc.setFillColor(61, 180, 130); doc.rect(bx + w + 1, y0 - x.obecnosci / maxO * h, w, x.obecnosci / maxO * h, 'F');
            doc.setFontSize(7); doc.setTextColor(90); doc.text(nazwaMiesiaca(x.miesiac).slice(0, 3), bx, y0 + 4); doc.setTextColor(0);
        });

        const kolumny = [{ tytul: t('st.col_month'), x: 14, w: 40 }, { tytul: t('st.col_att'), x: 58, w: 26 }, { tytul: t('st.col_points'), x: 88, w: 24 },
                         { tytul: t('st.col_unique'), x: 116, w: 26 }, { tytul: t('st.col_events'), x: 146, w: 22 }, { tytul: t('st.col_avg'), x: 170, w: 26 }];
        let y = rysujTabelePdf(doc, kolumny, d.trend.map(x => [x.etykieta, x.obecnosci, x.punkty, x.unikalni, x.wydarzen, x.frekw + '%']), y0 + 12, { rozmiar: 8 });

        doc.setFont('DejaVu', 'bold'); doc.setFontSize(11);
        if (y > 250) { doc.addPage(); y = 16; }
        doc.text(t('st.ranking'), 14, y + 8);
        rysujTabelePdf(doc, [{ tytul: t('st.col_pos'), x: 14, w: 12 }, { tytul: t('st.col_minister'), x: 28, w: 110 }, { tytul: t('st.col_att'), x: 142, w: 26 }, { tytul: t('st.col_points'), x: 170, w: 24 }],
            d.rankingTab.slice(0, 40).map((r, i) => [`${i + 1}.`, `${r.nazwa} (${r.kod})`, r.obecnosci, r.punkty]), y + 14, { rozmiar: 8 });
        zapiszPdf(doc, `statystyki-${dataDoNazwyPliku()}.pdf`);
    });
});

// ============================================================ RAPORT FREKWENCJI ====
let frekwencjaDane = null;

async function odswiezFrekwencje() {
    if (!sesja) return;
    const teraz = new Date();
    if (!$('fr-miesiac').options.length) wypelnijSelektorMiesiecy($('fr-miesiac'), teraz.getMonth() + 1);
    if (!$('fr-rok').value) $('fr-rok').value = teraz.getFullYear();
    const rok = parseInt($('fr-rok').value), miesiac = parseInt($('fr-miesiac').value);
    const status = $('fr-status');
    status.style.color = '';
    status.textContent = '⏳ …';

    const [raport, kalendarz, aktywni] = await Promise.all([raportMiesiaca(rok, miesiac), pobierzKalendarz(), listaAktywnychMinistrantow()]);
    if (raport.blad) { status.style.color = 'var(--err)'; status.textContent = '❌ ' + raport.blad; return; }
    status.textContent = '';

    const wydarzen = wydarzeniaWMiesiacu(kalendarz, rok, miesiac, true).length;
    const wiersze = aktywni.map(m => {
        const moje = raport.historia.filter(h => h.kod === m.kod);
        const obecne = new Set(moje.map(h => `${h.nazwa}|${String(h.data_zapisu).slice(0, 10)}`)).size;   // blok połączony = jedno wydarzenie
        const pct = wydarzen > 0 ? Math.min(100, Math.round(obecne / wydarzen * 100)) : 0;
        return { kod: m.kod, nazwa: `${m.imie} ${m.nazwisko}`, obecne, pct, punkty: moje.reduce((s, h) => s + (Number(h.punkty) || 0), 0) };
    }).sort((a, b) => b.pct - a.pct || b.punkty - a.punkty);

    frekwencjaDane = { rok, miesiac, wydarzen, wiersze, srednia: sredniaProcent(wiersze.map(w => w.pct)), zero: wiersze.filter(w => w.obecne === 0).length };
    renderujFrekwencje();
}

function renderujFrekwencje() {
    const d = frekwencjaDane;
    if (!d) return;
    $('fr-podsumowanie').textContent = t('fr.summary', { e: d.wydarzen, p: d.srednia, z: d.zero });
    $('tabela-frekwencja').querySelector('tbody').innerHTML = d.wiersze.map(w => {
        const kolor = w.pct >= 75 ? 'var(--ok)' : (w.pct >= 50 ? 'var(--accent-4)' : 'var(--err)');
        return `<tr><td>${esc(w.nazwa)} <small style="color:var(--text-dim)">${esc(w.kod)}</small></td><td>${esc(w.obecne)}</td><td>${esc(d.wydarzen)}</td>
            <td style="color:${kolor}; font-weight:800;">${esc(w.pct)}%</td><td>${esc(w.punkty)}</td></tr>`;
    }).join('') || wierszKomunikat(5, t('fr.none'));
}
$('btn-fr-pokaz').addEventListener('click', odswiezFrekwencje);
$('btn-fr-csv').addEventListener('click', () => {
    const d = frekwencjaDane;
    if (!d) return;
    pobierzBlob(zbudujCsv([t('fr.col_minister'), 'Kod', t('fr.col_present'), t('fr.col_events'), t('fr.col_pct') + ' %', t('fr.col_points')],
        d.wiersze.map(w => [w.nazwa, w.kod, w.obecne, d.wydarzen, w.pct, w.punkty])), `frekwencja-${d.rok}-${String(d.miesiac).padStart(2, '0')}.csv`);
});
$('btn-fr-pdf').addEventListener('click', async () => {
    const d = frekwencjaDane;
    if (!d) return;
    await zPostepem($('fr-status'), async () => {
        const doc = await nowyDokumentPdf();
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(15);
        doc.text(t('fr.pdf_title', { miesiac: nazwaMiesiaca(d.miesiac), rok: d.rok }), 14, 16);
        doc.setFont('DejaVu', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
        doc.text(nazwaParafii(), 14, 23);
        doc.text(t('fr.summary', { e: d.wydarzen, p: d.srednia, z: d.zero }), 14, 29);
        doc.setTextColor(0);
        rysujTabelePdf(doc,
            [{ tytul: t('fr.col_minister'), x: 14, w: 80 }, { tytul: t('fr.col_present'), x: 98, w: 26 }, { tytul: t('fr.col_events'), x: 128, w: 24 }, { tytul: t('fr.col_pct'), x: 156, w: 20 }, { tytul: t('fr.col_points'), x: 178, w: 18 }],
            d.wiersze.map(w => [`${w.nazwa} (${w.kod})`, w.obecne, d.wydarzen, w.pct + '%', w.punkty]), 38, { rozmiar: 9, interlinia: 5 });
        zapiszPdf(doc, `frekwencja-${d.rok}-${String(d.miesiac).padStart(2, '0')}.pdf`);
    });
});

// ==================================================== USTAWIENIA SYSTEMOWE ====
const POLA_USTAWIEN = [
    { k: 'nazwa_parafii', typ: 'text' }, { k: 'okno_przed_min', typ: 'number' }, { k: 'okno_po_min', typ: 'number' },
    { k: 'cache_offline_dni', typ: 'number' }, { k: 'cache_odswiez_min', typ: 'number' }, { k: 'retencja_logowan_dni', typ: 'number' },
    { k: 'domyslny_jezyk', typ: 'jezyk' }
];

async function odswiezUstawienia() {
    if (!sesja || !sesja.is_admin) return;
    const cont = $('ustawienia-lista');
    const w = await wywolajRPC('admin_ustawienia_pobierz', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin });
    if (!w.sukces) { cont.innerHTML = `<p style="color:var(--err)">❌ ${esc(brakFunkcjiSerwera(w) ? t('set.need_sql') : blad(w))}</p>`; return; }
    const mapa = {};
    (w.dane || []).forEach(u => { mapa[u.klucz] = u; });

    cont.innerHTML = POLA_USTAWIEN.map(p => {
        const u = mapa[p.k] || { wartosc: '' };
        let pole;
        if (p.typ === 'jezyk') {
            pole = `<select id="ust-${p.k}">${Object.keys(JEZYKI).map(kod => `<option value="${esc(kod)}" ${u.wartosc === kod ? 'selected' : ''}>${esc(JEZYKI[kod].nazwa || kod)}</option>`).join('')}</select>`;
        } else {
            pole = `<input id="ust-${p.k}" type="${p.typ}" value="${esc(u.wartosc)}" ${p.typ === 'text' ? 'maxlength="80"' : ''}>`;
        }
        return `<div style="margin-bottom:14px;">
            <label class="form-etykieta">${esc(t('set.k.' + p.k))}</label>
            <div style="display:flex; gap:8px;">${pole}
                <button class="btn" style="width:auto" data-akcja="ust-zapisz" data-klucz="${esc(p.k)}" data-typ="${esc(p.typ)}">${esc(t('set.save'))}</button></div>
            ${u.zmienil ? `<small style="color:var(--text-dim)">${esc(t('set.changed', { kto: u.zmienil, kiedy: formatDataCzas(u.zmieniono) }))}</small>` : ''}
        </div>`;
    }).join('');
}
AKCJE['ust-zapisz'] = async (d) => {
    const el = $('ust-' + d.klucz);
    const wartosc = d.typ === 'number' ? Number(el.value) : el.value.trim();
    const st = $('ustawienia-status');
    const w = await wywolajRPC('admin_ustawienia_zapisz', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_klucz: d.klucz, p_wartosc: wartosc });
    st.style.color = w.sukces ? 'var(--ok)' : 'var(--err)';
    st.textContent = w.sukces ? '✅ ' + t('set.saved') : '❌ ' + (brakFunkcjiSerwera(w) ? t('set.need_sql') : blad(w));
    if (w.sukces) { await ladujUstawieniaPubliczne(); await odswiezUstawienia(); }
};

// ================================================================== AUDYT ====
let audytDane = [];
const KATEGORIE_AUDYTU = ['pin', 'plakietki', 'punkty', 'ministranci', 'kalendarz', 'ustawienia', 'rodo', 'blokady', 'kod3', 'obecnosci', 'baza', 'kioski', 'audyt'];

function opiszSzczegolyAudytu(h) {
    const s = h.szczegoly || {};
    if (h.kategoria === 'punkty') return `${s.wydarzenie || '—'}: ${s.przed ?? 0} → ${s.po ?? 0}${s.powod ? ` (${s.powod})` : ''}`;
    if (h.kategoria === 'pin') return s.zrodlo ? zrodloT(s.zrodlo) : '';
    if (h.kategoria === 'plakietki') return `${s.plakietka || ''}${s.powod ? ` — ${s.powod}` : ''}`;
    if (h.akcja === 'zmieniono' && s && typeof s === 'object') {
        return Object.entries(s).filter(([k]) => k !== '_id').slice(0, 5).map(([k, v]) => (v && typeof v === 'object' && 'na' in v) ? `${k}: ${JSON.stringify(v.z)} → ${JSON.stringify(v.na)}` : `${k}: ${JSON.stringify(v)}`).join('; ');
    }
    const t2 = JSON.stringify(s);
    return t2 && t2 !== '{}' && t2 !== 'null' ? t2.slice(0, 160) : '';
}

let _audytNumer = 0;   // v2.12.05: numer zapytania — odpowiedź starszego zapytania nie nadpisuje nowszej
async function odswiezAudyt() {
    if (!sesja || !sesja.is_admin) return;
    const mojNumer = ++_audytNumer;
    const sel = $('audyt-kategoria');
    if (!sel.options.length) {
        sel.innerHTML = `<option value="">${esc(t('aud.cat_all'))}</option>` + KATEGORIE_AUDYTU.map(k => `<option value="${k}">${esc(etykieta('aud.c.' + k, k))}</option>`).join('');
    }
    const tbody = $('tabela-audyt').querySelector('tbody');
    const ostrz = $('audyt-ostrzezenia');
    let odDnia = $('audyt-od').value, doDnia = $('audyt-do').value;
    if (odDnia && doDnia && odDnia > doDnia) { const tmp = odDnia; odDnia = doDnia; doDnia = tmp; $('audyt-od').value = odDnia; $('audyt-do').value = doDnia; }   // v2.12.05: odwrócony zakres dat
    const limitAudytu = Number(($('audyt-limit') && $('audyt-limit').value) || 500);
    ostrz.textContent = '';
    tbody.innerHTML = wierszKomunikat(7, '⏳ ' + (window.emTx ? emTx('loading') : '…'));
    const parametry = {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_limit: limitAudytu, p_kategoria: sel.value || null,
        p_od: odDnia ? new Date(odDnia + 'T00:00:00').toISOString() : null,
        p_do: doDnia ? new Date(doDnia + 'T23:59:59').toISOString() : null,
        p_szukaj: $('audyt-szukaj').value.trim() || null
    };
    let w;
    try {
        w = await wywolajRPC('admin_audyt_zdarzenia', parametry);
        // serwer bez sql/24 → dotychczasowa wersja (4 parametry, bez filtrów i cofania)
        if (!w.sukces && brakFunkcjiSerwera(w)) {
            w = await wywolajRPC('admin_audyt_zdarzenia', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_limit: limitAudytu, p_kategoria: sel.value || null });
        }
    } catch (e) { w = { sukces: false, blad: String(e && e.message || e) }; }
    if (mojNumer !== _audytNumer) return;   // przyszła nowsza prośba — ta odpowiedź jest już nieaktualna
    if (!w.sukces) { tbody.innerHTML = wierszKomunikat(7, '❌ ' + (brakFunkcjiSerwera(w) ? t('aud.need_sql') : blad(w))); audytDane = []; ostrz.textContent = ''; return; }
    audytDane = w.dane || [];
    ostrz.innerHTML = (w.pominiete && w.pominiete.length)
        ? `⚠️ ${esc(t('aud.skipped', { n: w.pominiete.length }))}: ${w.pominiete.map(p => esc(p['gałąź'] + ' — ' + p.blad)).join('; ')}` : '';
    tbody.innerHTML = audytDane.map((h, i) => `<tr data-i="${i}" style="${h.cofniete ? 'opacity:0.55;' : ''}">
        <td style="white-space:nowrap; font-size:0.85rem;">${esc(formatDataCzas(h.kiedy))}</td><td>${esc(h.kto_kod || '—')}</td>
        <td>${esc(etykieta('aud.c.' + h.kategoria, h.kategoria))}</td><td>${esc(etykieta('aud.a.' + h.akcja, h.akcja))}</td>
        <td>${esc(h.obiekt || '—')}</td><td style="font-size:0.85rem;">${esc(opiszSzczegolyAudytu(h))}</td>
        <td style="white-space:nowrap;">${h.cofniete ? `↩️ ${esc(t('aud.undone'))}` : (h.cofalne ? `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="audyt-cofnij" data-i="${i}">↩️ ${esc(t('aud.undo'))}</button>` : '')}</td></tr>`).join('') || wierszKomunikat(7, t('aud.none'));
    if ($('audyt-licznik')) $('audyt-licznik').textContent = window.emTx ? emTx('aud_count', { n: audytDane.length, limit: limitAudytu }) : String(audytDane.length);
}
AKCJE['audyt-cofnij'] = async (d) => {
    const h = audytDane[Number(d.i)];
    if (!h) return;
    if (!confirm(t('aud.undo_confirm', { opis: `${etykieta('aud.a.' + h.akcja, h.akcja)} — ${h.obiekt || ''}` }))) return;
    const w = await wywolajRPC('admin_audyt_cofnij', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_tab: h.tab, p_rid: String(h.rid), p_powod: null });
    $('audyt-ostrzezenia').innerHTML = w.sukces ? `✅ ${esc(t('aud.undone_ok', { opis: w.opis || '' }))}` : `❌ ${esc(brakFunkcjiSerwera(w) ? t('aud.need_sql') : blad(w))}`;
    await odswiezAudyt();
};
['audyt-od', 'audyt-do'].forEach(id => $(id).addEventListener('change', () => odswiezAudyt()));
$('audyt-szukaj').addEventListener('keydown', (e) => { if (e.key === 'Enter') odswiezAudyt(); });
// v2.12.05: wyszukiwanie „na żywo” (po 450 ms od ostatniego znaku), limit wpisów, szybkie zakresy dat, wyczyszczenie filtrów
let _audytSzukajTimer = null;
$('audyt-szukaj').addEventListener('input', () => { clearTimeout(_audytSzukajTimer); _audytSzukajTimer = setTimeout(odswiezAudyt, 450); });
if ($('audyt-limit')) $('audyt-limit').addEventListener('change', () => odswiezAudyt());
document.querySelectorAll('[data-audyt-zakres]').forEach(b => b.addEventListener('click', () => {
    const dni = Number(b.dataset.audytZakres), dz = new Date(), iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (!dni) { $('audyt-od').value = ''; $('audyt-do').value = ''; }
    else { const od = new Date(dz.getTime() - (dni - 1) * 86400000); $('audyt-od').value = iso(od); $('audyt-do').value = iso(dz); }
    odswiezAudyt();
}));
if ($('btn-audyt-wyczysc')) $('btn-audyt-wyczysc').addEventListener('click', () => {
    $('audyt-od').value = ''; $('audyt-do').value = ''; $('audyt-szukaj').value = ''; $('audyt-kategoria').value = '';
    if ($('audyt-limit')) $('audyt-limit').value = '500';
    odswiezAudyt();
});
document.addEventListener('change', (e) => { if (e.target && e.target.id === 'audyt-kategoria') odswiezAudyt(); });
$('btn-audyt-odswiez').addEventListener('click', odswiezAudyt);
$('btn-audyt-csv').addEventListener('click', () => {
    if (!audytDane.length) return;
    const daneCsv = (typeof window.audytWidoczne === 'function') ? window.audytWidoczne(audytDane) : audytDane;   // v2.12.05: CSV = to, co widać (filtr + sortowanie)
    pobierzBlob(zbudujCsv([t('aud.col_when'), t('aud.col_who'), t('aud.col_cat'), t('aud.col_action'), t('aud.col_object'), t('aud.col_details')],
        daneCsv.map(h => [formatDataCzas(h.kiedy), h.kto_kod || '', etykieta('aud.c.' + h.kategoria, h.kategoria), etykieta('aud.a.' + h.akcja, h.akcja), h.obiekt || '', opiszSzczegolyAudytu(h)])),
        `audyt-${dataDoNazwyPliku()}.csv`);
});

// ================================================================== RODO ====
let rodoOsoby = [];

async function odswiezRodo() {
    if (!sesja || !sesja.is_admin) return;
    const lista = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    rodoOsoby = lista.sukces ? (lista.dane || []) : [];
    const wybrany = $('rodo-osoba').value;
    $('rodo-osoba').innerHTML = rodoOsoby.map(m => `<option value="${esc(m.id)}">${esc(m.kod)} — ${esc(m.imie)} ${esc(m.nazwisko)}${m.aktywny ? '' : ' (' + esc(t('common.inactive')) + ')'}</option>`).join('');
    if (wybrany) $('rodo-osoba').value = wybrany;

    const tbody = $('tabela-rodo').querySelector('tbody');
    const w = await wywolajRPC('admin_rodo_rejestr', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_limit: 200 });
    if (!w.sukces) { tbody.innerHTML = wierszKomunikat(5, '❌ ' + (brakFunkcjiSerwera(w) ? t('rodo.need_sql') : blad(w))); return; }
    tbody.innerHTML = (w.dane || []).map(r => `<tr><td style="white-space:nowrap; font-size:0.85rem;">${esc(formatDataCzas(r.kiedy))}</td><td>${esc(r.kto_kod || '—')}</td>
        <td>${esc(etykieta('aud.a.' + r.operacja, r.operacja))}</td><td>${esc(r.osoba_ref || '—')}</td><td style="font-size:0.85rem;">${esc(r.uwagi || '')}</td></tr>`).join('') || wierszKomunikat(5, t('rodo.none'));
}

function rodoStatus(ok, tekst) { const el = $('rodo-status'); el.style.color = ok ? 'var(--ok)' : 'var(--err)'; el.textContent = (ok ? '✅ ' : '❌ ') + tekst; }

async function pobierzEksportOsoby() {
    const id = $('rodo-osoba').value;
    if (!id) return null;
    const w = await wywolajRPC('admin_rodo_eksport', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: String(id) });
    if (!w.sukces) { rodoStatus(false, brakFunkcjiSerwera(w) ? t('rodo.need_sql') : blad(w)); return null; }
    return w.dane;
}

$('btn-rodo-json').addEventListener('click', async () => {
    const dane = await pobierzEksportOsoby();
    if (!dane) return;
    pobierzBlob(new Blob([JSON.stringify(dane, null, 2)], { type: 'application/json' }), `rodo-${(dane.konto && dane.konto.kod) || 'osoba'}-${dataDoNazwyPliku()}.json`);
    rodoStatus(true, t('pts.saved'));
    await odswiezRodo();
});

$('btn-rodo-pdf').addEventListener('click', async () => {
    const dane = await pobierzEksportOsoby();
    if (!dane) return;
    await zPostepem($('rodo-status'), async () => {
        const doc = await nowyDokumentPdf();
        const k = dane.konto || {};
        doc.setFont('DejaVu', 'bold'); doc.setFontSize(14);
        doc.text(t('rodo.pdf_title'), 14, 16);
        doc.setFont('DejaVu', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
        doc.text(`${nazwaParafii()} · ${t('rodo.pdf_generated', { kiedy: formatDataCzas(dane.wygenerowano) })}`, 14, 22);
        doc.setTextColor(0);

        let y = 30;
        const naglowek = (tekst) => { if (y > 265) { doc.addPage(); y = 16; } doc.setFont('DejaVu', 'bold'); doc.setFontSize(11); doc.text(tekst, 14, y); y += 6; doc.setFont('DejaVu', 'normal'); };
        naglowek(t('rodo.pdf_account'));
        const pola = Object.entries(k).filter(([, v]) => v !== null && typeof v !== 'object').map(([n, v]) => [n, String(v)]);
        y = rysujTabelePdf(doc, [{ tytul: '', x: 14, w: 60 }, { tytul: '', x: 78, w: 118 }], pola, y, { rozmiar: 8 }) + 4;

        naglowek(t('rodo.pdf_attend'));
        y = rysujTabelePdf(doc, [{ tytul: t('st.col_month'), x: 14, w: 32 }, { tytul: t('pts.col_event'), x: 48, w: 90 }, { tytul: t('pts.f_type'), x: 140, w: 34 }, { tytul: t('st.col_points'), x: 176, w: 18 }],
            (dane.obecnosci || []).map(o => [formatData(o.data_zapisu), o.wydarzenie || '—', o.zaliczone_jako || '', o.punkty]), y, { rozmiar: 8 }) + 4;

        naglowek(t('rodo.pdf_badges'));
        y = rysujTabelePdf(doc, [{ tytul: t('bdg.col_code'), x: 14, w: 70 }, { tytul: t('bdg.col_status'), x: 88, w: 30 }],
            (dane.plakietki || []).map(p => [p.kod_plakietki, p.aktywna ? t('bdg.active') : t('bdg.revoked')]), y, { rozmiar: 8 }) + 4;

        naglowek(t('rodo.pdf_pins'));
        rysujTabelePdf(doc, [{ tytul: t('pts.col_when'), x: 14, w: 50 }, { tytul: t('sec.h_event'), x: 68, w: 60 }, { tytul: t('sec.h_source'), x: 132, w: 60 }],
            (dane.historia_pin || []).map(h => [formatDataCzas(h.kiedy), etykieta('aud.a.' + h.zdarzenie, h.zdarzenie), zrodloT(h.zrodlo)]), y, { rozmiar: 8 });
        zapiszPdf(doc, `rodo-${k.kod || 'osoba'}-${dataDoNazwyPliku()}.pdf`);
    });
    await odswiezRodo();
});

$('btn-rodo-anon').addEventListener('click', async () => {
    const id = $('rodo-osoba').value;
    const osoba = rodoOsoby.find(m => String(m.id) === String(id));
    if (!osoba) return;
    if (!confirm(t('rodo.anon_confirm', { nazwa: `${osoba.imie} ${osoba.nazwisko} (${osoba.kod})` }))) return;
    const w = await wywolajRPC('admin_rodo_anonimizuj', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: String(id), p_potwierdzenie: $('rodo-potwierdzenie').value.trim() });
    if (!w.sukces) { rodoStatus(false, brakFunkcjiSerwera(w) ? t('rodo.need_sql') : blad(w)); return; }
    $('rodo-potwierdzenie').value = '';
    rodoStatus(true, t('rodo.anon_done', { kod: w.nowy_kod }));
    kalendarzPamiec = { czas: 0, dane: [] };
    await odswiezRodo();
});

$('btn-rodo-purge').addEventListener('click', async () => {
    const dni = parseInt($('rodo-dni').value);
    if (!dni || dni < 30) { rodoStatus(false, t('rodo.purge_hint')); return; }
    if (!confirm(t('rodo.purge_confirm', { d: dni }))) return;
    const w = await wywolajRPC('admin_rodo_wyczysc_logi', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dni: dni });
    if (!w.sukces) { rodoStatus(false, brakFunkcjiSerwera(w) ? t('rodo.need_sql') : blad(w)); return; }
    rodoStatus(true, t('rodo.purge_done', { txt: Object.entries(w.usuniete || {}).map(([k, v]) => `${k}: ${v}`).join(', ') || '0' }));
    await odswiezRodo();
});

// ================================================ MINISTRANT: porównanie miesięcy ====
async function odswiezPorownanieMiesiecy() {
    const cont = $('mm-porownanie');
    if (!cont || !sesja) return;
    const teraz = new Date();
    const biez = { rok: teraz.getFullYear(), miesiac: teraz.getMonth() + 1 };
    const poprz = przesunMiesiac(biez.rok, biez.miesiac, -1);
    const pobierz = (m) => wywolajRPC('moja_historia_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: m.rok, p_miesiac: m.miesiac });
    const [a, b] = await Promise.all([pobierz(biez), pobierz(poprz)]);
    if (!a.sukces || !b.sukces) { cont.innerHTML = `<p style="color:var(--text-dim)">${esc(t('cmp.no_prev'))}</p>`; return; }

    const dane = {
        punkty: { teraz: Number(a.suma_punktow) || 0, przed: Number(b.suma_punktow) || 0, jednostka: t('cmp.unit_points'), etykieta: t('cmp.points') },
        obecnosci: { teraz: (a.historia || []).length, przed: (b.historia || []).length, jednostka: t('cmp.unit_att'), etykieta: t('cmp.attend') }
    };
    const wiersz = (x) => {
        const maks = Math.max(x.teraz, x.przed, 1);
        return `<div class="porownanie-wiersz"><b>${esc(x.etykieta)}</b><div>
            <div class="pasek teraz"><span style="width:${Math.round(x.teraz / maks * 100)}%"></span></div>
            <div style="font-size:0.85rem;">${esc(nazwaMiesiaca(biez.miesiac))}: <b>${esc(x.teraz)}</b> ${esc(x.jednostka)}</div>
            <div class="pasek przed"><span style="width:${Math.round(x.przed / maks * 100)}%"></span></div>
            <div style="font-size:0.85rem; color:var(--text-dim);">${esc(nazwaMiesiaca(poprz.miesiac))}: ${esc(x.przed)} ${esc(x.jednostka)}</div></div></div>`;
    };
    const roznica = dane.punkty.teraz - dane.punkty.przed;
    const komunikat = roznica > 0 ? t('cmp.up', { n: roznica }) : (roznica < 0 ? t('cmp.down', { n: Math.abs(roznica) }) : t('cmp.same'));
    cont.innerHTML = wiersz(dane.punkty) + wiersz(dane.obecnosci) +
        `<p style="font-weight:700; color:${roznica > 0 ? 'var(--ok)' : (roznica < 0 ? 'var(--accent-4)' : 'var(--text-dim)')}">${esc(komunikat)}</p>`;
}

// ---- start: ustawienia publiczne (nazwa parafii, domyślne okno) ----
document.addEventListener('zmiana-jezyka', () => {
    if (!sesja || !sesja.is_admin) return;
    if (statystykiDane && aktywnaZakladka === 'statystyki') renderujStatystyki();
    if (frekwencjaDane && aktywnaZakladka === 'frekwencja') renderujFrekwencje();
    const sel = $('audyt-kategoria'); if (sel) sel.innerHTML = '';   // etykiety kategorii przeładują się przy odświeżeniu zakładki
});
window.addEventListener('DOMContentLoaded', () => { ladujUstawieniaPubliczne(); });
