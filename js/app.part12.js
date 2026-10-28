// ============================================================================
// app.part12.js — v2.14
//   1) RAPORT DNIA (Admin): wszystko, co działo się w systemie danego dnia — konta, PIN-y, obecności, punkty, plakietki, skany,
//      Kioski, polecenia, blokady, kolejki offline, import list, RODO, audyt, akceptacje. Każdy dzień można oznaczyć jako „przejrzany”;
//      dni z aktywnością, których Admin nie przejrzał, są stale pokazywane (nic nie może umknąć).
//   2) AKCEPTACJE wpisów > 36 h z Kiosków: wpis młodszy niż 36 h dodaje się sam, starszy czeka na decyzję Admina.
//   3) MONITOR Admina: co minutę lekki licznik (nowe zdarzenia, wpisy do akceptacji, nieprzejrzane dni) → znaczki na zakładkach + powiadomienia.
// Serwer: sql/33_akceptacja_36h_raport_dnia.sql.
// ============================================================================

const RD_ODSWIEZANIE_MS = 60 * 1000;
let rdOstatniRaport = null;      // ostatnio pobrany raport (do przerysowania po zmianie języka i do CSV)
let rdNumer = 0;                 // numer zapytania — odpowiedź starszego zapytania nie nadpisuje nowszej
let rdOtwarteSekcje = {};        // zapamiętany stan rozwinięcia sekcji między odświeżeniami
let monitorTimer = null;
let monitorBaza = null;          // czas SERWERA z poprzedniego odpytania
let monitorTick = null;          // ostatnia funkcja odpytująca (wołana także po decyzjach Admina)

// ---------------------------------------------------------------- daty (strefa Europe/Warsaw) ----
function rdDzis() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }); }
function rdPrzesun(dataStr, delta) {
    const d = new Date(dataStr + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}
function rdDzienWybrany() { const v = $('rd-dzien').value; return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : rdDzis(); }

// ---------------------------------------------------------------- definicje sekcji raportu ----
// kolumny: 'pole' albo 'pole:typ' (dt = data i godzina, bool, kat = kategoria audytu, akc = akcja audytu, json)
const RD_SEKCJE = [
    { k: 'wydarzenia',            kol: ['nazwa', 'data_wydarzenia:dt', 'okno_start:dt', 'okno_koniec:dt', 'obecnych'] },
    { k: 'obecnosci',             kol: ['kiedy:dt', 'ministrant_kod', 'wydarzenie_nazwa', 'zdarzenie', 'punkty_przed', 'punkty_po', 'zmiana', 'zaliczone_po', 'zrodlo', 'kto_kod', 'powod'] },
    { k: 'konta',                 kol: ['kiedy:dt', 'ministrant_kod', 'zdarzenie', 'zrodlo', 'kto_kod'] },
    { k: 'blokady_pin',           kol: ['kiedy:dt', 'kod', 'zdarzenie', 'stopien', 'zrodlo'] },
    { k: 'skany',                 kol: ['kiedy:dt', 'kiedy_urzadzenia:dt', 'kod_plakietki', 'ministrant_kod', 'kiosk_id', 'wynik'] },
    { k: 'plakietki',             kol: ['kiedy:dt', 'kod_plakietki', 'ministrant_kod', 'zdarzenie', 'kto_kod', 'powod'] },
    { k: 'kioski',                kol: ['kiosk_id', 'ostatnie_uzycie:dt', 'cisza_h', 'tryb_offline', 'zablokowany:bool', 'skanow_dnia', 'operacji_offline_dnia', 'do_akceptacji_dnia', 'wygasa:dt'] },
    { k: 'kiosk_blokady',         kol: ['kiosk_id', 'od:dt', 'do_kiedy:dt', 'powod', 'zalozyl', 'aktywna:bool', 'zdjeta:dt', 'zdjal'] },
    { k: 'kiosk_polecenia',       kol: ['utworzono:dt', 'kiosk_id', 'typ', 'zlecil', 'odebrano:dt', 'wykonano:dt'] },
    { k: 'kiosk_ping',            kol: ['utworzono:dt', 'kiosk_id', 'zlecil', 'odpowiedziano:dt'] },
    { k: 'operacje_offline',      kol: ['utworzono:dt', 'kiosk_id', 'rodzaj', 'zrodlo', 'ministrant_id', 'wydarzenie_id', 'kiedy_klient:dt'] },
    { k: 'retencja',              kol: ['zapisano:dt', 'akcja', 'op_id', 'kto', 'kiosk_id', 'godzin'] },
    { k: 'akceptacje_oczekujace', kol: ['utworzono:dt', 'kiosk_id', 'rodzaj', 'ministrant_kod', 'wydarzenie_id', 'wybor', 'typ', 'wiek_h'] },
    { k: 'akceptacje_dnia',       kol: ['utworzono:dt', 'kiosk_id', 'rodzaj', 'ministrant_kod', 'status', 'decyzja_kto', 'decyzja_kiedy:dt', 'decyzja_uwagi', 'wiek_h'] },
    { k: 'zgloszenia',            kol: null },   // kolumny wykrywane z danych (nazwa tabeli zgłoszeń nie jest znana z góry)
    { k: 'rodo',                  kol: ['kiedy:dt', 'kto_kod', 'operacja', 'osoba_ref', 'uwagi'] },
    { k: 'importy',               kol: ['kiedy:dt', 'kto_kod', 'nazwa_pliku', 'wierszy_razem', 'dodano', 'zaktualizowano', 'niedoczytanych', 'bledow'] },
    { k: 'cofniecia',             kol: ['kiedy:dt', 'kto_kod', 'tab', 'rid', 'powod', 'opis'] },
    { k: 'audyt',                 kol: ['kiedy:dt', 'kto_kod', 'kategoria:kat', 'akcja:akc', 'obiekt', 'szczegoly:json'] }
];

// kafelki podsumowania: [klucz, poziom] — poziom: 'alarm' / 'uwaga' (podświetlane, gdy wartość > 0), '' (neutralny)
const RD_KAFELKI = [
    ['akceptacje_oczekujace', 'alarm'], ['akceptacje_zgloszone', ''], ['akceptacje_zaakceptowane', ''], ['akceptacje_odrzucone', ''],
    ['zgloszenia_oczekujace', 'uwaga'], ['obecnosci_dnia', ''], ['punkty_zmiana', ''], ['edycje_punktow', 'uwaga'],
    ['nowe_konta', ''], ['zmiany_pin', ''], ['blokady_pin', 'uwaga'], ['ministranci_aktywni', ''],
    ['skany_razem', ''], ['skany_offline', ''], ['skany_podejrzane', 'uwaga'], ['plakietki_zdarzenia', ''],
    ['kioski_razem', ''], ['kioski_cisza', 'uwaga'], ['kioski_zablokowane', 'uwaga'], ['kioski_polecenia', ''],
    ['operacje_offline', ''], ['retencja_wpisy', ''], ['wpisy_audytu', ''], ['usuniecia', 'uwaga'],
    ['rodo_operacje', 'uwaga'], ['importy_list', ''], ['cofniecia', 'uwaga'], ['wydarzenia_dnia', '']
];

// ---------------------------------------------------------------- formatowanie komórek ----
function rdTekstKomorki(typ, v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typ === 'dt') { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : formatDataCzas(v); }
    if (typ === 'bool') return v === true ? '✔' : '—';
    if (typ === 'kat') return etykieta('aud.c.' + v, v);
    if (typ === 'akc') return etykieta('aud.a.' + v, v);
    if (typeof v === 'object') { let s = ''; try { s = JSON.stringify(v); } catch (e) { s = String(v); } return s === '{}' || s === 'null' ? '—' : (s.length > 200 ? s.slice(0, 200) + '…' : s); }
    return String(v);
}
function rdKolumny(sek, dane) {
    if (sek.kol) return sek.kol.map(x => { const [pole, typ] = x.split(':'); return { pole, typ: typ || '' }; });
    // sekcja o nieznanych kolumnach: pierwsze 8 pól z danych (preferowane: id, ministrant_id, typ, status, data_zgloszenia)
    const pierwszy = (dane[0] && (dane[0].wiersz || dane[0])) || {};
    const pref = ['id', 'ministrant_id', 'typ', 'status', 'data_zgloszenia'];
    const wszystkie = Object.keys(pierwszy);
    const kol = pref.filter(p => wszystkie.includes(p)).concat(wszystkie.filter(p => !pref.includes(p))).slice(0, 8);
    return kol.map(pole => ({ pole, typ: /data|kiedy|utworzono/.test(pole) ? 'dt' : '' }));
}
const rdWiersz = (r) => (r && r.wiersz && typeof r.wiersz === 'object') ? r.wiersz : r;
const rdNaglowek = (pole) => etykieta('rd.col.' + pole, pole);

// ---------------------------------------------------------------- render ----
function rdRenderujAlerty(p, sekcje, nieprzejrzane) {
    const a = [];
    const n = (k) => Number(p[k]) || 0;
    if (n('akceptacje_oczekujace') > 0) a.push({ poz: 'pilne', tekst: t('rd.al.approvals', { n: n('akceptacje_oczekujace'), h: n('akceptacje_najstarsze_h') }), przycisk: ['rd-do-akceptacji', t('rd.al.go_approvals')] });
    if (n('zgloszenia_oczekujace') > 0) a.push({ poz: 'pilne', tekst: t('rd.al.requests', { n: n('zgloszenia_oczekujace') }), przycisk: ['rd-do-zgloszen', t('rd.al.go_requests')] });
    if (n('kioski_cisza') > 0) a.push({ poz: 'uwaga', tekst: t('rd.al.kiosk_silent', { n: n('kioski_cisza') }) });
    if (n('kioski_zablokowane') > 0) a.push({ poz: 'uwaga', tekst: t('rd.al.kiosk_locked', { n: n('kioski_zablokowane') }) });
    if (n('blokady_pin') > 0) a.push({ poz: 'uwaga', tekst: t('rd.al.pin_locks', { n: n('blokady_pin') }) });
    if (n('skany_podejrzane') > 0) a.push({ poz: 'uwaga', tekst: t('rd.al.scans_bad', { n: n('skany_podejrzane') }) });
    if (n('usuniecia') > 0) a.push({ poz: 'uwaga', tekst: t('rd.al.deletions', { n: n('usuniecia') }) });
    if (n('edycje_punktow') > 0) a.push({ poz: 'info', tekst: t('rd.al.points_edits', { n: n('edycje_punktow') }) });
    if (n('rodo_operacje') > 0) a.push({ poz: 'info', tekst: t('rd.al.rodo', { n: n('rodo_operacje') }) });
    if (n('cofniecia') > 0) a.push({ poz: 'info', tekst: t('rd.al.undo', { n: n('cofniecia') }) });
    if (n('nowe_konta') > 0) a.push({ poz: 'info', tekst: t('rd.al.new_accounts', { n: n('nowe_konta') }) });
    if (n('operacje_offline') > 0) a.push({ poz: 'info', tekst: t('rd.al.offline_ops', { n: n('operacje_offline') }) });
    // sekcje, których serwer nie zdołał zbudować — NIC nie może zostać ukryte po cichu (brak tabeli = moduł nieużywany, nie błąd)
    Object.keys(sekcje || {}).forEach(k => {
        const b = sekcje[k] && sekcje[k].blad;
        if (b && !/^brak tabeli|nie wykryto tabeli/.test(b)) a.push({ poz: 'uwaga', tekst: t('rd.al.section_err', { sekcja: etykieta('rd.sec.' + k, k), blad: b }) });
    });
    if (!a.length) a.push({ poz: 'ok', tekst: t('rd.al.none') });
    return a.map(x => `<div class="rd-alert ${x.poz}"><span>${x.poz === 'pilne' ? '🔴' : x.poz === 'uwaga' ? '🟠' : x.poz === 'ok' ? '✅' : 'ℹ️'}</span><span style="flex:1">${esc(x.tekst)}</span>${x.przycisk ? `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="${x.przycisk[0]}">${esc(x.przycisk[1])}</button>` : ''}</div>`).join('');
}

function rdRenderujKafelki(p) {
    return RD_KAFELKI.map(([k, poz]) => {
        const v = p[k];
        const wartosc = (v === null || v === undefined) ? '—' : (k === 'punkty_zmiana' && Number(v) > 0 ? '+' + v : String(v));
        const klasa = (poz && Number(v) > 0) ? poz : '';
        return `<div class="rd-kafel ${klasa}"><div class="rd-liczba">${esc(wartosc)}</div><div class="rd-opis">${esc(etykieta('rd.tile.' + k, k))}</div></div>`;
    }).join('');
}

function rdRenderujSekcje(sekcje) {
    return RD_SEKCJE.map(sek => {
        const s = (sekcje && sekcje[sek.k]) || { dane: [], blad: null };
        const dane = Array.isArray(s.dane) ? s.dane : [];
        const tytul = etykieta('rd.sec.' + sek.k, sek.k);
        const otwarta = (sek.k in rdOtwarteSekcje) ? rdOtwarteSekcje[sek.k] : dane.length > 0;   // sekcje z danymi rozwinięte, puste zwinięte; wybór Admina jest pamiętany
        if (s.blad) {
            const brak = /^brak tabeli|nie wykryto tabeli/.test(s.blad);
            return `<details class="rd-sekcja" data-sek="${esc(sek.k)}"><summary>${esc(tytul)}<span class="rd-n">${brak ? '—' : '⚠️'}</span></summary><div class="rd-blad">${esc(brak ? t('rd.section_missing') : t('rd.section_error', { blad: s.blad }))}</div></details>`;
        }
        const kol = rdKolumny(sek, dane);
        const nagl = kol.map(c => `<th>${esc(rdNaglowek(c.pole))}</th>`).join('');
        const wiersze = dane.map(r0 => { const r = rdWiersz(r0); return `<tr>${kol.map(c => `<td style="${c.typ === 'dt' ? 'white-space:nowrap;' : ''}">${esc(rdTekstKomorki(c.typ, r[c.pole]))}</td>`).join('')}</tr>`; }).join('');
        const tresc = dane.length
            ? `<div class="tabela-przewijana"><table><thead><tr>${nagl}</tr></thead><tbody>${wiersze}</tbody></table></div>`
            : `<div class="rd-blad">${esc(t('rd.none'))}</div>`;
        return `<details class="rd-sekcja" data-sek="${esc(sek.k)}" ${otwarta ? 'open' : ''}><summary>${esc(tytul)}<span class="rd-n">(${dane.length})</span></summary>${tresc}</details>`;
    }).join('');
}

function rdRenderujPrzeglad(w) {
    const box = $('rd-przeglad');
    const pr = w.przejrzany;
    if (pr) {
        box.className = 'rd-przeglad ok';
        box.innerHTML = `<span>✅ ${esc(t('rd.reviewed', { kto: pr.kto || '?', kiedy: pr.kiedy ? formatDataCzas(pr.kiedy) : '' }))}${pr.uwagi ? ' — ' + esc(pr.uwagi) : ''}</span>
            <button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="rd-cofnij">↩ ${esc(t('rd.btn_unmark'))}</button>`;
    } else {
        box.className = 'rd-przeglad nowy';
        box.innerHTML = `<span>👀 ${esc(t('rd.not_reviewed'))}</span>
            <button class="btn" style="width:auto; padding:4px 12px;" data-akcja="rd-oznacz">✔ ${esc(t('rd.btn_mark'))}</button>`;
    }
}

function rdRenderujZalegle(lista, wybrany) {
    const box = $('rd-zalegle');
    const dni = (lista || []).filter(x => x.dzien !== wybrany);
    if (!dni.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="rd-zalegle"><strong>⚠️ ${esc(t('rd.backlog', { n: dni.length }))}</strong><br>` +
        dni.map(x => `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="rd-otworz-dzien" data-dzien="${esc(x.dzien)}">${esc(x.dzien)} · ${esc(String(x.zdarzen))}</button>`).join('') + `</div>`;
}

function rdRenderuj(w) {
    document.querySelectorAll('#rd-sekcje details[data-sek]').forEach(d => { rdOtwarteSekcje[d.dataset.sek] = d.open; });
    rdRenderujPrzeglad(w);
    $('rd-alerty').innerHTML = rdRenderujAlerty(w.podsumowanie || {}, w.sekcje || {});
    $('rd-kafelki').innerHTML = rdRenderujKafelki(w.podsumowanie || {});
    $('rd-sekcje').innerHTML = rdRenderujSekcje(w.sekcje || {});
    $('rd-licznik').textContent = t('rd.generated', { kiedy: w.teraz ? formatDataCzas(w.teraz) : '' });
}

// ---------------------------------------------------------------- pobieranie ----
async function odswiezRaportDnia() {
    if (!sesja || !sesja.is_admin) return;
    if (!$('rd-dzien').value) $('rd-dzien').value = rdDzis();
    const dzien = rdDzienWybrany();
    const mojNumer = ++rdNumer;
    const zmianaDnia = !rdOstatniRaport || rdOstatniRaport.dzien !== dzien;
    if (zmianaDnia) { rdOtwarteSekcje = {}; $('rd-sekcje').innerHTML = `<p>⏳ ${esc(window.emTx ? emTx('loading') : '…')}</p>`; $('rd-alerty').innerHTML = ''; $('rd-kafelki').innerHTML = ''; }
    let w;
    try { w = await wywolajRPC('admin_raport_dnia', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dzien: dzien }); }
    catch (e) { w = { sukces: false, blad: String((e && e.message) || e) }; }
    if (mojNumer !== rdNumer) return;
    if (!w || !w.sukces) {
        const kodPg = w && w.kod_pg ? ' [' + w.kod_pg + ']' : '';
        $('rd-sekcje').innerHTML = `<p>❌ ${esc(brakFunkcjiSerwera(w) ? t('rd.need_sql') : blad(w))}${esc(kodPg)}</p>`;
        $('rd-alerty').innerHTML = ''; $('rd-kafelki').innerHTML = ''; $('rd-przeglad').innerHTML = '';
        return;
    }
    rdOstatniRaport = w;
    rdRenderuj(w);
    rdOdswiezZalegle();
    rdZerujZnaczekNowych();
}

async function rdOdswiezZalegle() {
    let w;
    try { w = await wywolajRPC('admin_raport_dnia_nieprzejrzane', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dni: 30 }); } catch (e) { return; }
    if (!w || !w.sukces) return;
    rdRenderujZalegle(w.dni, rdDzienWybrany());
    ustawZnaczek('raport-znaczek', (w.dni || []).filter(x => x.dzien !== w.dzis).length);
}

// ---------------------------------------------------------------- akcje Raportu ----
AKCJE['rd-oznacz'] = async () => {
    const uwaga = prompt(t('rd.mark_note'), '');
    if (uwaga === null) return;
    const w = await wywolajRPC('admin_raport_dnia_oznacz', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dzien: rdDzienWybrany(), p_uwagi: uwaga.trim() || null, p_przejrzany: true });
    if (!w.sukces) { $('rd-przeglad').textContent = '❌ ' + (brakFunkcjiSerwera(w) ? t('rd.need_sql') : blad(w)); return; }
    await odswiezRaportDnia();
    if (monitorTick) monitorTick();
};
AKCJE['rd-cofnij'] = async () => {
    const w = await wywolajRPC('admin_raport_dnia_oznacz', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dzien: rdDzienWybrany(), p_uwagi: null, p_przejrzany: false });
    if (!w.sukces) { $('rd-przeglad').textContent = '❌ ' + (brakFunkcjiSerwera(w) ? t('rd.need_sql') : blad(w)); return; }
    await odswiezRaportDnia();
    if (monitorTick) monitorTick();
};
AKCJE['rd-otworz-dzien'] = (d) => { $('rd-dzien').value = d.dzien; odswiezRaportDnia(); };
AKCJE['rd-do-akceptacji'] = () => { const b = document.querySelector('.tabs button[data-tab="akceptacje"]'); if (b) b.click(); };
AKCJE['rd-do-zgloszen'] = () => { const b = document.querySelector('.tabs button[data-tab="zgloszenia"]'); if (b) b.click(); };

$('rd-dzien').addEventListener('change', () => odswiezRaportDnia());
$('rd-dzien-wstecz').addEventListener('click', () => { $('rd-dzien').value = rdPrzesun(rdDzienWybrany(), -1); odswiezRaportDnia(); });
$('rd-dzien-dalej').addEventListener('click', () => { $('rd-dzien').value = rdPrzesun(rdDzienWybrany(), 1); odswiezRaportDnia(); });
$('rd-dzis').addEventListener('click', () => { $('rd-dzien').value = rdDzis(); odswiezRaportDnia(); });
$('btn-rd-odswiez').addEventListener('click', () => odswiezRaportDnia());

// CSV: wszystkie sekcje w jednym pliku (kolumna „Sekcja” + nagłówki każdej sekcji w osobnym wierszu)
$('btn-rd-csv').addEventListener('click', () => {
    const w = rdOstatniRaport; if (!w) return;
    const wiersze = [];
    Object.keys(w.podsumowanie || {}).forEach(k => wiersze.push([t('rd.sec_summary'), etykieta('rd.tile.' + k, k), (w.podsumowanie[k] === null ? '' : w.podsumowanie[k])]));
    RD_SEKCJE.forEach(sek => {
        const s = (w.sekcje && w.sekcje[sek.k]) || { dane: [] };
        const dane = Array.isArray(s.dane) ? s.dane : [];
        const tytul = etykieta('rd.sec.' + sek.k, sek.k);
        if (s.blad) { wiersze.push([tytul, '#', s.blad]); return; }
        if (!dane.length) return;
        const kol = rdKolumny(sek, dane);
        wiersze.push([tytul, '#', ...kol.map(c => rdNaglowek(c.pole))]);
        dane.forEach(r0 => { const r = rdWiersz(r0); wiersze.push([tytul, '', ...kol.map(c => { const v = rdTekstKomorki(c.typ, r[c.pole]); return v === '—' ? '' : v; })]); });
    });
    pobierzBlob(zbudujCsv([t('rd.csv_section'), t('rd.csv_col1'), t('rd.csv_col2')], wiersze), `raport-dnia-${w.dzien}.csv`);
});

// automatyczne odświeżanie (tylko gdy zakładka otwarta, karta widoczna i wybrany jest dzisiejszy dzień)
setInterval(() => {
    if (!sesja || !sesja.is_admin || aktywnaZakladka !== 'raport' || document.hidden) return;
    if (!$('rd-auto').checked || rdDzienWybrany() !== rdDzis()) return;
    odswiezRaportDnia();
}, RD_ODSWIEZANIE_MS);

document.addEventListener('zmiana-jezyka', () => {
    if (!sesja || !sesja.is_admin) return;
    if (aktywnaZakladka === 'raport' && rdOstatniRaport) rdRenderuj(rdOstatniRaport);
    if (aktywnaZakladka === 'akceptacje') odswiezAkceptacje();
});

// ============================================================================
// AKCEPTACJE wpisów > 36 h
// ============================================================================
let akcDane = [];

function akcRodzajTekst(r) {
    if (r.rodzaj === 'zgloszenie') return t('akc.kind_request') + (r.typ ? ' · ' + r.typ : '');
    return t('akc.kind_attendance') + (r.wybor ? ' · ' + r.wybor : '');
}
function akcStatusTekst(s) { return etykieta('akc.st_' + ({ oczekuje: 'pending', zaakceptowane: 'accepted', odrzucone: 'rejected' }[s] || 'all'), s); }

async function odswiezAkceptacje() {
    if (!sesja || !sesja.is_admin) return;
    const tbody = $('tabela-akceptacje').querySelector('tbody');
    const status = $('akc-status').value || 'oczekuje';
    tbody.innerHTML = wierszKomunikat(8, '⏳ ' + (window.emTx ? emTx('loading') : '…'));
    let w;
    try { w = await wywolajRPC('admin_akceptacje_lista', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: status, p_limit: 500 }); }
    catch (e) { w = { sukces: false, blad: String((e && e.message) || e) }; }
    if (!w || !w.sukces) {
        tbody.innerHTML = wierszKomunikat(8, '❌ ' + (brakFunkcjiSerwera(w) ? t('rd.need_sql') : blad(w)));
        akcDane = []; $('akc-licznik').textContent = ''; return;
    }
    akcDane = w.dane || [];
    ustawZnaczek('akceptacje-znaczek', Number(w.oczekujace) || 0);
    $('akc-licznik').textContent = t('akc.count', { n: akcDane.length, p: Number(w.oczekujace) || 0 });
    if (!akcDane.length) { tbody.innerHTML = wierszKomunikat(8, t('akc.empty')); return; }
    tbody.innerHTML = akcDane.map((r, i) => {
        const oczekuje = r.status === 'oczekuje';
        const ostrz = [];
        if (oczekuje && r.juz_zaliczona) ostrz.push('⚠️ ' + t('akc.warn_exists'));
        if (r.aktywny === false) ostrz.push('⚠️ ' + t('akc.warn_inactive'));
        const wydarzenie = r.rodzaj === 'zgloszenie'
            ? esc(r.kod_plakietki ? t('akc.badge', { kod: r.kod_plakietki }) : '—')
            : `${esc(r.wydarzenie_nazwa || r.wydarzenie_id || '—')}${r.data_wydarzenia ? `<br><small>${esc(formatDataCzas(r.data_wydarzenia))}</small>` : ''}`;
        const decyzja = oczekuje
            ? `<div class="akc-ctrl">
                <input type="number" class="akc-pkt" min="0" max="100" step="1" placeholder="${esc(t('akc.points_ph'))}" title="${esc(t('akc.points_title'))}">
                ${r.rodzaj === 'zgloszenie' ? '' : `<select class="akc-zal" title="${esc(t('akc.counted_title'))}"><option value="">${esc(t('akc.counted_auto'))}</option><option value="zbiorka">${esc(t('akc.counted_gathering'))}</option><option value="msza">${esc(t('akc.counted_mass'))}</option></select>`}
                <input type="text" class="akc-uwaga" maxlength="300" placeholder="${esc(t('akc.note_ph'))}" style="min-width:110px;">
                <button class="btn" style="width:auto; padding:4px 10px;" data-akcja="akc-akceptuj" data-i="${i}">✅ ${esc(t('akc.btn_accept'))}</button>
                <button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="akc-odrzuc" data-i="${i}">❌ ${esc(t('akc.btn_reject'))}</button>
              </div>`
            : `<small>${esc(r.decyzja_kto || '—')}${r.decyzja_kiedy ? ' · ' + esc(formatDataCzas(r.decyzja_kiedy)) : ''}${r.decyzja_uwagi ? '<br>' + esc(r.decyzja_uwagi) : ''}${r.punkty_przyznane !== null && r.punkty_przyznane !== undefined ? '<br>' + esc(t('akc.points_given', { n: r.punkty_przyznane })) : ''}</small>`;
        return `<tr data-i="${i}">
            <td style="white-space:nowrap; font-size:0.85rem;">${esc(formatDataCzas(r.utworzono))}</td>
            <td>${esc(r.kiosk_id || '—')}</td>
            <td>${esc(((r.imie || '') + ' ' + (r.nazwisko || '')).trim() || '—')} <small>(${esc(r.ministrant_kod || '?')})</small></td>
            <td>${esc(akcRodzajTekst(r))}</td>
            <td>${wydarzenie}</td>
            <td>${esc(r.wiek_h === null || r.wiek_h === undefined ? '—' : String(r.wiek_h))}</td>
            <td>${esc(akcStatusTekst(r.status))}${ostrz.length ? '<br><small style="color:var(--accent-4)">' + esc(ostrz.join(' · ')) + '</small>' : ''}</td>
            <td>${decyzja}</td>
        </tr>`;
    }).join('');
}

// jedna decyzja; zwraca odpowiedź serwera
async function akcWyslijDecyzje(r, decyzja, wiersz) {
    const pkt = wiersz && wiersz.querySelector('.akc-pkt') ? wiersz.querySelector('.akc-pkt').value.trim() : '';
    const zal = wiersz && wiersz.querySelector('.akc-zal') ? wiersz.querySelector('.akc-zal').value : '';
    const uwaga = wiersz && wiersz.querySelector('.akc-uwaga') ? wiersz.querySelector('.akc-uwaga').value.trim() : '';
    return wywolajRPC('admin_akceptacje_decyzja', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: Number(r.id), p_decyzja: decyzja,
        p_punkty: pkt === '' ? null : Number(pkt), p_uwagi: uwaga || null, p_zaliczone_jako: zal || null
    });
}
async function akcDecyzja(d, el, decyzja) {
    const r = akcDane[Number(d.i)]; if (!r) return;
    const wiersz = el.closest('tr');
    const opis = `${((r.imie || '') + ' ' + (r.nazwisko || '')).trim() || r.ministrant_kod}`;
    if (!confirm(t(decyzja === 'zaakceptuj' ? 'akc.confirm_accept' : 'akc.confirm_reject', { kto: opis }))) return;
    const w = await akcWyslijDecyzje(r, decyzja, wiersz);
    $('akc-komunikat').innerHTML = w.sukces ? `✅ ${esc(t(decyzja === 'zaakceptuj' ? 'akc.accepted_ok' : 'akc.rejected_ok', { kto: opis }))}` : `❌ ${esc(brakFunkcjiSerwera(w) ? t('rd.need_sql') : blad(w))}`;
    await odswiezAkceptacje();
    if (monitorTick) monitorTick();
}
AKCJE['akc-akceptuj'] = (d, el) => akcDecyzja(d, el, 'zaakceptuj');
AKCJE['akc-odrzuc'] = (d, el) => akcDecyzja(d, el, 'odrzuc');

$('btn-akc-wszystkie').addEventListener('click', async () => {
    const lista = akcDane.filter(r => r.status === 'oczekuje' && r.aktywny !== false && !r.juz_zaliczona);
    if (!lista.length) { $('akc-komunikat').textContent = t('akc.nothing'); return; }
    if (!confirm(t('akc.confirm_all', { n: lista.length }))) return;
    let ok = 0; const bledy = [];
    for (const r of lista) {
        const w = await akcWyslijDecyzje(r, 'zaakceptuj', null);   // punkty automatyczne, „zaliczone jako” wg wyboru z Kiosku
        if (w && w.sukces) ok++; else bledy.push(`${r.ministrant_kod}: ${brakFunkcjiSerwera(w) ? t('rd.need_sql') : blad(w)}`);
    }
    $('akc-komunikat').innerHTML = `✅ ${esc(t('akc.bulk_done', { ok, err: bledy.length }))}` + (bledy.length ? '<br>' + bledy.slice(0, 5).map(esc).join('<br>') : '');
    await odswiezAkceptacje();
    if (monitorTick) monitorTick();
});
$('btn-akc-odswiez').addEventListener('click', odswiezAkceptacje);
$('akc-status').addEventListener('change', odswiezAkceptacje);

// ============================================================================
// MONITOR ADMINA — znaczki na zakładkach + powiadomienia o nowych zdarzeniach
// ============================================================================
function ustawZnaczek(id, n) {
    const el = $(id); if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.classList.toggle('hidden', !(n > 0));
}
let rdNoweNieodczytane = 0;
function rdZerujZnaczekNowych() { rdNoweNieodczytane = 0; }

function uruchomMonitorAdmina() {
    if (monitorTimer) return;
    monitorBaza = null;
    const tick = async () => {
        if (!sesja || !sesja.is_admin) { clearInterval(monitorTimer); monitorTimer = null; monitorTick = null; return; }
        let w;
        try { w = await wywolajRPC('admin_raport_dnia_licznik', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_od: monitorBaza }); } catch (e) { return; }
        if (!w || !w.sukces) return;   // serwer bez sql/33 albo chwilowy błąd — bez hałasu
        const pierwszy = monitorBaza === null;
        ustawZnaczek('akceptacje-znaczek', Number(w.akceptacje_oczekujace) || 0);
        ustawZnaczek('raport-znaczek', Number(w.nieprzejrzane_dni) || 0);
        if (typeof kontaktOdswiezZnaczek === 'function') kontaktOdswiezZnaczek();   // v2.15: skrzynka „Kontakt z Administratorem”
        if (pierwszy) {
            // po zalogowaniu Admin od razu widzi, co na niego czeka
            if (w.akceptacje_oczekujace > 0 && typeof powiadomOstrzezenie === 'function') powiadomOstrzezenie(t('rd.login_approvals', { n: w.akceptacje_oczekujace }));
            if (w.nieprzejrzane_dni > 0 && typeof powiadomInfo === 'function') powiadomInfo(t('rd.login_backlog', { n: w.nieprzejrzane_dni }));
        } else if (w.nowe) {
            const n = (k) => Number(w.nowe[k]) || 0;
            if (n('akceptacje') > 0 && typeof powiadomOstrzezenie === 'function') powiadomOstrzezenie(t('rd.new_approvals', { n: n('akceptacje') }));
            const aktywnosc = n('skany') + n('konta') + n('blokady') + n('kioski') + n('rodo');
            if (aktywnosc > 0 && typeof powiadomInfo === 'function') powiadomInfo(t('rd.new_activity', { n: aktywnosc }));
            rdNoweNieodczytane += n('audyt') + n('punkty') + aktywnosc + n('akceptacje');
            // otwarty Raport Dnia z dzisiejszym dniem odświeża się od razu (bez czekania na minutę)
            if (aktywnaZakladka === 'raport' && $('rd-auto').checked && rdDzienWybrany() === rdDzis() && (n('audyt') + n('punkty') + aktywnosc + n('akceptacje')) > 0) odswiezRaportDnia();
            if (aktywnaZakladka === 'akceptacje' && n('akceptacje') > 0) odswiezAkceptacje();
        }
        monitorBaza = w.teraz;
    };
    monitorTick = tick;
    tick();
    monitorTimer = setInterval(tick, RD_ODSWIEZANIE_MS);
}
