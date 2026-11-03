
// ============================================================================
// MONITORING KIOSKÓW
// ============================================================================
let biezacaListaKioskow = [];
const niedostepne = () => `<span style="color:var(--text-dim)">${esc(t('common.unavailable'))}</span>`;

function formatujDiagnostykeKiosku(d) {
    if (!d) return niedostepne();
    const tak = (v) => v === true ? '✅ ' + t('common.yes') : v === false ? '❌ ' + t('common.no') : null;

    let cache = null;
    if (d.offline_cache_pobrano) {
        const godz = Math.max(0, Math.round((Date.now() - new Date(d.offline_cache_pobrano).getTime()) / 3600000));
        cache = t('kio.d_cache_age', { h: godz });
    } else if (d.offline_cache_pobrano === null) {
        cache = t('kio.d_cache_none');
    }

    const wiersze = [
        [t('kio.d_online_nav'), tak(d.online_navigator)],
        [t('kio.d_online_ok'), tak(d.online_zweryfikowane)],
        [t('kio.d_net_type'), d.siec_effective_type || d.siec_typ || null],
        [t('kio.d_speed'), (d.siec_downlink_mbps != null || d.siec_rtt_ms != null) ? `${d.siec_downlink_mbps ?? '?'} Mb/s, ${d.siec_rtt_ms ?? '?'} ms` : null],
        [t('kio.d_resolution'), d.rozdzielczosc || null],
        [t('kio.d_visible'), d.karta_widoczna === true ? t('common.yes') : d.karta_widoczna === false ? t('kio.d_background') : null],
        [t('kio.d_battery'), d.bateria_procent != null ? `${d.bateria_procent}%${d.bateria_ladowanie ? ' (' + t('kio.d_charging') + ')' : ''}` : null],
        [t('kio.d_cpu'), (d.rdzenie_cpu != null || d.pamiec_gb != null) ? `${d.rdzenie_cpu ?? '?'} ${t('kio.d_cores')}, ${d.pamiec_gb ?? '?'} GB` : null],
        [t('kio.d_queue'), d.offline_kolejka_dlugosc != null ? t('kio.d_queue_n', { n: d.offline_kolejka_dlugosc }) : null],
        [t('kio.d_cache'), cache],
        [t('kio.d_lang'), d.jezyk || null]
    ];
    // Wartości pochodzą z urządzenia (niezaufane) → esc()
    return '<div style="font-size:0.8rem; line-height:1.5;">' + wiersze.map(([etykieta, wartosc]) =>
        `<div><b>${esc(etykieta)}:</b> ${wartosc == null ? niedostepne() : esc(wartosc)}</div>`
    ).join('') + '</div>';
}

async function odswiezKioski() {
    const tbody = $('tabela-kioski').querySelector('tbody');
    const wynik = await wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin });
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(6, '❌ ' + blad(wynik)); return; }
    biezacaListaKioskow = wynik.dane || [];
    const admin = !!sesja.is_admin;

    tbody.innerHTML = biezacaListaKioskow.map(k => `
        <tr>
            <td>
                <input type="text" value="${esc(k.nazwa || '')}" data-kiosk-nazwa="${esc(k.kiosk_id)}" style="margin:0; width:160px;">
                <button class="btn btn-secondary" style="width:auto; padding:4px 8px; margin-top:4px;" data-akcja="kiosk-nazwa" data-id="${esc(k.kiosk_id)}">${esc(t('kio.save_name'))}</button>
            </td>
            <td style="color:${k.online ? 'var(--ok)' : 'var(--err)'}">${esc(k.online ? t('kio.online') : t('kio.offline'))}</td>
            <td style="font-size:0.85rem;">${k.ostatni_ping ? esc(formatDataCzas(k.ostatni_ping)) : esc(t('common.never'))}</td>
            <td>${k.ostatnia_wersja ? esc(k.ostatnia_wersja) : niedostepne()}</td>
            <td>${formatujDiagnostykeKiosku(k.ostatnie_dane)}</td>
            <td style="white-space:nowrap;">
                ${admin ? `<button class="btn" style="width:auto; padding:6px 10px;" data-akcja="kiosk-ping" data-id="${esc(k.kiosk_id)}" data-nazwa="${esc(k.nazwa || k.kiosk_id)}">📡 ${esc(t('ping.btn'))}</button>
                <button class="btn btn-warn" style="width:auto; padding:6px 10px;" data-akcja="kiosk-steruj" data-id="${esc(k.kiosk_id)}" data-nazwa="${esc(k.nazwa || k.kiosk_id)}">🎛 ${esc(t('ster.btn'))}</button>` : ''}
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="kiosk-historia" data-id="${esc(k.kiosk_id)}" data-nazwa="${esc(k.nazwa || k.kiosk_id)}">${esc(t('kio.history'))}</button>
                ${admin ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="kiosk-usun" data-id="${esc(k.kiosk_id)}" data-nazwa="${esc(k.nazwa || k.kiosk_id)}">🗑️ ${esc(t('kio.delete'))}</button>` : ''}
            </td>
        </tr>`).join('') || wierszKomunikat(6, t('kio.none'));
}
$('btn-kioski-odswiez').addEventListener('click', odswiezKioski);

// Lista kiosków odświeża się sama, dopóki karta „Kioski” jest otwarta i widoczna
setInterval(() => {
    if (sesja && aktywnaZakladka === 'kioski' && !widokAdmin.classList.contains('hidden') && !document.hidden) odswiezKioski();
}, 30000);

AKCJE['kiosk-nazwa'] = async (d) => {
    const pole = document.querySelector(`input[data-kiosk-nazwa="${CSS.escape(d.id)}"]`);
    const nazwa = pole ? pole.value.trim() : '';
    const wynik = await wywolajRPC('admin_nazwij_kiosk', { p_kod: sesja.kod, p_pin: sesja.pin, p_kiosk_id: d.id, p_nazwa: nazwa });
    if (!wynik.sukces) alert('❌ ' + blad(wynik));
    await odswiezKioski();
};

AKCJE['kiosk-historia'] = (d) => otworzHistorieKiosku(d.id, d.nazwa);

AKCJE['kiosk-usun'] = async (d) => {
    if (!sesja.is_admin) { alert(t('sec.admin_only')); return; }
    if (!confirm(t('kio.delete_confirm', { nazwa: d.nazwa }))) return;
    const st = $('kioski-status');
    const wynik = await wywolajRPC('admin_usun_kiosk', { p_kod: sesja.kod, p_pin: sesja.pin, p_kiosk_id: d.id });
    if (wynik && wynik.sukces) {
        st.style.color = 'var(--ok)';
        st.textContent = '✅ ' + t('kio.deleted');
        $('panel-historia-kiosku').classList.add('hidden');
    } else {
        st.style.color = 'var(--err)';
        // Funkcja nie istnieje na serwerze (nie uruchomiono sql/14) → wskazówka zamiast surowego błędu
        const brakFunkcji = wynik && (wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883');
        st.textContent = '❌ ' + (brakFunkcji ? t('kio.delete_need_sql') : blad(wynik));
    }
    await odswiezKioski();
};

async function otworzHistorieKiosku(kioskId, nazwa) {
    $('historia-kiosku-tytul').textContent = t('kio.hist_title', { nazwa });
    $('panel-historia-kiosku').classList.remove('hidden');
    const wynik = await wywolajRPC('admin_historia_pingow', { p_kod: sesja.kod, p_pin: sesja.pin, p_kiosk_id: kioskId, p_limit: 100 });
    const tbody = $('tabela-historia-kiosku');
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(6, '❌ ' + blad(wynik)); return; }
    tbody.innerHTML = (wynik.dane || []).map(p => {
        const d = p.dane || {};
        return `
        <tr>
            <td>${esc(formatDataCzas(p.otrzymano))}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${d.czas_urzadzenia ? esc(formatDataCzas(d.czas_urzadzenia)) : niedostepne()}</td>
            <td>${p.wersja ? esc(p.wersja) : niedostepne()}</td>
            <td>${d.online_navigator === true ? '✅' : d.online_navigator === false ? '❌' : niedostepne()}</td>
            <td>${(d.siec_effective_type || d.siec_typ) ? esc(d.siec_effective_type || d.siec_typ) : niedostepne()}</td>
            <td>${d.offline_kolejka_dlugosc != null ? esc(d.offline_kolejka_dlugosc) : niedostepne()}</td>
        </tr>`;
    }).join('') || wierszKomunikat(6, t('kio.h_none'));
}
$('btn-zamknij-historie-kiosku').addEventListener('click', () => $('panel-historia-kiosku').classList.add('hidden'));

// ============================================================================
// BAZA DANYCH — czytelny, przeszukiwalny podgląd wszystkiego naraz
// ============================================================================
const bazaDane = { uzytkownicy: [], plakietki: [], obecnosci: [], logowania: [], kioski: [], zgloszeniaOczekujace: [] };
let bazaObecnosciEdytowalne = false; // true, gdy serwer ma sql/17 (lista obecności z identyfikatorami)

// Przyciski akcji w wierszu użytkownika (Baza danych): historia punktów dla Admina i Księdza, reszta tylko Admin
function akcjeBazaUzytkownik(m) {
    const st = 'width:auto; padding:6px 10px;';
    let a = `<button class="btn btn-secondary" style="${st}" data-akcja="pkt-historia" data-id="${esc(m.id)}" data-nazwa="${esc(m.imie + ' ' + m.nazwisko)}">${esc(t('db.act_history'))}</button>`;
    if (sesja.is_admin && !m.is_admin) {
        a += `<button class="btn btn-secondary" style="${st}" data-akcja="db-edytuj-uzytkownika" data-id="${esc(m.id)}">${esc(t('db.act_edit'))}</button>`;
        a += m.aktywny
            ? `<button class="btn btn-danger" style="${st}" data-akcja="db-dezaktywuj" data-id="${esc(m.id)}">${esc(t('mi.act_deactivate'))}</button>`
            : `<button class="btn" style="${st}" data-akcja="db-przywroc" data-id="${esc(m.id)}">${esc(t('mi.act_restore'))}</button>`;
    }
    return a;
}
let bazaAktywnyPodtab = 'uzytkownicy';
const PODTABY_BAZY = ['uzytkownicy', 'plakietki', 'obecnosci', 'logowania', 'kioski-baza', 'synchronizacja'];

document.querySelectorAll('.subtabs button[data-podtab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.subtabs button[data-podtab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bazaAktywnyPodtab = btn.dataset.podtab;
        PODTABY_BAZY.forEach(p => $('podtab-' + p).classList.toggle('hidden', p !== bazaAktywnyPodtab));
        $('baza-szukaj').value = '';
        renderujAktywnyPodtabBazy();
    });
});
$('baza-szukaj').addEventListener('input', renderujAktywnyPodtabBazy);

function pasujeDoSzukania(tekstSzukany, ...pola) {
    if (!tekstSzukany) return true;
    const s = tekstSzukany.toLowerCase();
    return pola.some(p => (p == null ? '' : p).toString().toLowerCase().includes(s));
}

function renderujAktywnyPodtabBazy() {
    const szukaj = $('baza-szukaj').value.trim();
    if (bazaAktywnyPodtab === 'uzytkownicy') renderujBazaUzytkownicy(szukaj);
    else if (bazaAktywnyPodtab === 'plakietki') renderujBazaPlakietki(szukaj);
    else if (bazaAktywnyPodtab === 'obecnosci') renderujBazaObecnosci(szukaj);
    else if (bazaAktywnyPodtab === 'logowania') renderujBazaLogowania(szukaj);
    else if (bazaAktywnyPodtab === 'kioski-baza') renderujBazaKioski(szukaj);
    else if (bazaAktywnyPodtab === 'synchronizacja') renderujBazaSynchronizacja(szukaj);
}

async function odswiezBazaDanych() {
    const wyniki = await Promise.all([
        wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin }),
        wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: null }),
        wywolajRPC('historia_logowan', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_filtr_kod: null, p_limit: 300 }),
        wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin }),
        wywolajRPC('lista_zgloszen', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: 'oczekujace' })
    ]);
    const [uzytkownicy, plakietki, logowania, kioski, zgloszenia] = wyniki;

    bazaDane.uzytkownicy = uzytkownicy.sukces ? uzytkownicy.dane : [];
    bazaDane.plakietki = plakietki.sukces ? plakietki.dane : [];
    bazaDane.logowania = logowania.sukces ? logowania.dane : [];
    bazaDane.kioski = kioski.sukces ? kioski.dane : [];
    bazaDane.zgloszeniaOczekujace = zgloszenia.sukces ? zgloszenia.dane : [];

    await pokazBazaObecnosci();
    renderujAktywnyPodtabBazy();
}

function rolaTekst(m) { return m.is_admin ? t('role.admin') : (m.is_moderator ? t('role.priest') : t('role.minister')); }
const komorka = (v, styl) => `<td${styl ? ` style="${styl}"` : ''}>${esc(v)}</td>`;

function renderujBazaUzytkownicy(szukaj) {
    const dane = bazaDane.uzytkownicy.filter(m => pasujeDoSzukania(szukaj, m.kod, m.imie, m.nazwisko));
    $('tabela-baza-uzytkownicy').querySelector('tbody').innerHTML = dane.map(m => `<tr>
        ${komorka(m.kod)}
        ${komorka(`${m.imie} ${m.nazwisko}`)}
        ${komorka(rolaTekst(m))}
        ${komorka(m.aktywny ? t('common.active') : t('common.inactive'), `color:${m.aktywny ? 'var(--ok)' : 'var(--err)'}`)}
        <td>${m.liczba_aktywnych_plakietek > 0 ? esc(t('db.badge_active', { n: m.liczba_aktywnych_plakietek })) : `<span style="color:var(--text-dim)">${esc(t('common.none'))}</span>`}</td>
        ${komorka(m.pin_jawny == null ? '—' : m.pin_jawny)}
        ${komorka(m.punkty_miesiac)}
        ${komorka(m.ostatnie_logowanie_pwa ? formatDataCzas(m.ostatnie_logowanie_pwa) : '—', 'font-size:0.8rem; color:var(--text-dim);')}
        ${komorka(m.ostatnie_logowanie_kiosk ? formatDataCzas(m.ostatnie_logowanie_kiosk) : '—', 'font-size:0.8rem; color:var(--text-dim);')}
        <td style="white-space:nowrap;">${akcjeBazaUzytkownik(m)}</td>
    </tr>`).join('') || wierszKomunikat(10, t('common.no_results'));
}

function renderujBazaPlakietki(szukaj) {
    const dane = bazaDane.plakietki.filter(p => pasujeDoSzukania(szukaj, p.kod_plakietki, p.ministrant_kod, p.imie, p.nazwisko));
    $('tabela-baza-plakietki').querySelector('tbody').innerHTML = dane.map(p => `<tr>
        ${komorka(p.kod_plakietki)}
        ${komorka(`${p.imie} ${p.nazwisko} (${p.ministrant_kod})`)}
        ${komorka(p.aktywna ? t('bdg.active') : t('bdg.revoked'), `color:${p.aktywna ? 'var(--ok)' : 'var(--err)'}`)}
        ${komorka(formatDataCzas(p.wygenerowano), 'font-size:0.85rem;')}
        ${komorka(p.uniewazniona_kiedy ? formatDataCzas(p.uniewazniona_kiedy) : '—', 'font-size:0.85rem; color:var(--text-dim);')}
        <td>${p.aktywna && sesja.is_admin ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="db-bdg-uniewaznij" data-kod="${esc(p.kod_plakietki)}">${esc(t('db.act_revoke'))}</button>` : ''}</td>
    </tr>`).join('') || wierszKomunikat(6, t('common.no_results'));
}

async function pokazBazaObecnosci() {
    const miesiac = parseInt($('baza-ob-miesiac').value);
    const rok = parseInt($('baza-ob-rok').value);
    // Nowa lista z identyfikatorami (umożliwia edycję i usuwanie) — sql/17; bez niej stary widok tylko do odczytu
    bazaObecnosciEdytowalne = false;
    $('baza-ob-info').textContent = '';
    let wynik = null;
    if (sesja.is_admin) {
        const nowy = await wywolajRPC('admin_obecnosci_lista', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_rok: rok, p_miesiac: miesiac });
        if (nowy.sukces) { bazaObecnosciEdytowalne = true; bazaDane.obecnosci = nowy.dane || []; wynik = nowy; }
    }
    if (!wynik) {
        wynik = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
        bazaDane.obecnosci = wynik.sukces ? (wynik.historia || []) : [];
        if (sesja.is_admin) $('baza-ob-info').textContent = t('db.read_only');
    }
    if (bazaAktywnyPodtab === 'obecnosci') renderujBazaObecnosci($('baza-szukaj').value.trim());
}
$('btn-baza-ob-pokaz').addEventListener('click', pokazBazaObecnosci);

function renderujBazaObecnosci(szukaj) {
    const dane = bazaDane.obecnosci.filter(h => pasujeDoSzukania(szukaj, h.kod, h.imie, h.nazwisko, h.nazwa, h.zaliczone_jako));
    $('tabela-baza-obecnosci').querySelector('tbody').innerHTML = dane.map(h => `<tr>
        ${komorka(formatDataCzas(h.data_zapisu), 'font-size:0.85rem;')}
        ${komorka(`${h.imie} ${h.nazwisko} (${h.kod})`)}
        ${komorka(h.nazwa)}
        ${komorka(h.zaliczone_jako)}
        ${komorka((h.punkty > 0 ? '+' : '') + h.punkty)}
        <td style="white-space:nowrap;">${bazaObecnosciEdytowalne && h.id ? `
            <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="pkt-edytuj-ob" data-id="${esc(h.id)}">${esc(t('pts.edit'))}</button>
            <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="pkt-usun-ob" data-id="${esc(h.id)}">${esc(t('pts.delete'))}</button>
            <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="pkt-historia" data-id="${esc(h.ministrant_id)}" data-nazwa="${esc(h.imie + ' ' + h.nazwisko)}">${esc(t('db.act_history'))}</button>` : ''}</td>
    </tr>`).join('') || wierszKomunikat(6, t('common.no_results'));
}

function powodLogowania(powod) {
    const klucz = 'sec.reason.' + powod;
    const w = t(klucz);
    return w === klucz ? (powod || '—') : w;
}

function renderujBazaLogowania(szukaj) {
    const dane = bazaDane.logowania.filter(l => pasujeDoSzukania(szukaj, l.kod, l.powod));
    $('tabela-baza-logowania').querySelector('tbody').innerHTML = dane.map(l => `<tr>
        ${komorka(formatDataCzas(l.kiedy), 'font-size:0.85rem;')}
        ${komorka(l.kod)}
        ${komorka(l.sukces ? t('sec.res_ok') : t('sec.res_fail'), `color:${l.sukces ? 'var(--ok)' : 'var(--err)'}`)}
        ${komorka(powodLogowania(l.powod))}
    </tr>`).join('') || wierszKomunikat(4, t('common.no_results'));
}

function renderujBazaKioski(szukaj) {
    const dane = bazaDane.kioski.filter(k => pasujeDoSzukania(szukaj, k.nazwa, k.kiosk_id));
    $('tabela-baza-kioski').querySelector('tbody').innerHTML = dane.map(k => `<tr>
        ${komorka(k.nazwa || k.kiosk_id)}
        ${komorka(k.online ? t('kio.online') : t('kio.offline'), `color:${k.online ? 'var(--ok)' : 'var(--err)'}`)}
        ${komorka(k.ostatni_ping ? formatDataCzas(k.ostatni_ping) : '—', 'font-size:0.85rem;')}
        ${komorka(k.ostatnia_wersja || '—')}
        ${komorka((k.ostatnie_dane && k.ostatnie_dane.offline_kolejka_dlugosc != null) ? k.ostatnie_dane.offline_kolejka_dlugosc : '—')}
    </tr>`).join('') || wierszKomunikat(5, t('common.no_results'));
}

function renderujBazaSynchronizacja(szukaj) {
    const zgl = bazaDane.zgloszeniaOczekujace.filter(z => pasujeDoSzukania(szukaj, z.imie, z.nazwisko, z.ministrant_kod, z.typ));
    $('tabela-baza-sync-zgloszenia').querySelector('tbody').innerHTML = zgl.map(z => `<tr>
        ${komorka(formatDataCzas(z.data_zgloszenia), 'font-size:0.85rem;')}
        ${komorka(`${z.imie} ${z.nazwisko} (${z.ministrant_kod})`)}
        ${komorka(etykieta('req.type.' + z.typ, z.typ))}
    </tr>`).join('') || wierszKomunikat(3, t('db.no_pending_requests'));

    const kioskiZKolejka = bazaDane.kioski.filter(k =>
        ((k.ostatnie_dane && k.ostatnie_dane.offline_kolejka_dlugosc) || 0) > 0 && pasujeDoSzukania(szukaj, k.nazwa, k.kiosk_id));
    $('tabela-baza-sync-kioski').querySelector('tbody').innerHTML = kioskiZKolejka.map(k => `<tr>
        ${komorka(k.nazwa || k.kiosk_id)}
        ${komorka(k.ostatnie_dane.offline_kolejka_dlugosc)}
        ${komorka(k.ostatni_ping ? formatDataCzas(k.ostatni_ping) : '—', 'font-size:0.85rem;')}
    </tr>`).join('') || wierszKomunikat(3, t('db.no_kiosk_queues'));
}

$('btn-baza-synchronizuj').addEventListener('click', async () => {
    const status = $('baza-sync-status');
    status.textContent = t('db.syncing');
    const wynik = await wywolajRPC('admin_wymus_synchronizacje', { p_kod: sesja.kod, p_pin: sesja.pin });
    await odswiezBazaDanych();
    status.textContent = wynik.sukces ? '✅ ' + t('db.sync_ok') : ('❌ ' + blad(wynik));
});

// ============================================================================
// OBECNOŚCI (wszyscy, wybrany miesiąc)
// ============================================================================
let obecnosciMiesiacDane = [];   // v2.15.03: lista z identyfikatorami (zakładka „Obecności (miesiąc)”)
async function odswiezObecnosciWszystkich() { await pokazObecnosciWszystkich(); }

async function pokazObecnosciWszystkich() {
    const miesiac = parseInt($('ob-miesiac').value);
    const rok = parseInt($('ob-rok').value);
    const tbody = $('tabela-obecnosci-wszystkich').querySelector('tbody');

    // v2.15.03: Admin i Ksiądz mogą tu EDYTOWAĆ i USUWAĆ wpisy (lista z identyfikatorami: admin_obecnosci_lista, sql/36);
    // bez sql/36 (albo bez uprawnień) zostaje dotychczasowy widok tylko do odczytu (raport_miesiac)
    let lista = null;
    if (sesja.is_admin || sesja.is_moderator) {
        const nowy = await wywolajRPC('admin_obecnosci_lista', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_rok: rok, p_miesiac: miesiac });
        if (nowy && nowy.sukces) lista = nowy.dane || [];
    }
    const kolumnaAkcji = $('ob-th-akcje');
    if (kolumnaAkcji) kolumnaAkcji.classList.toggle('hidden', lista === null);
    if (lista !== null) {
        obecnosciMiesiacDane = lista;
        tbody.innerHTML = lista.map(h => `<tr>
            ${komorka(formatDataCzas(h.data_zapisu))}
            ${komorka(`${h.imie} ${h.nazwisko} (${h.kod})`)}
            ${komorka(h.nazwa)}
            ${komorka(h.zaliczone_jako)}
            ${komorka((h.punkty > 0 ? '+' : '') + h.punkty)}
            <td style="white-space:nowrap;">
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="pkt-edytuj-ob2" data-id="${esc(h.id)}">${esc(t('pts.edit'))}</button>
                <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="pkt-usun-ob2" data-id="${esc(h.id)}">${esc(t('pts.delete'))}</button>
            </td>
        </tr>`).join('') || wierszKomunikat(6, t('att.none'));
        return;
    }
    const wynik = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(5, '❌ ' + blad(wynik)); return; }

    tbody.innerHTML = (wynik.historia || []).map(h => `<tr>
        ${komorka(formatDataCzas(h.data_zapisu))}
        ${komorka(`${h.imie} ${h.nazwisko} (${h.kod})`)}
        ${komorka(h.nazwa)}
        ${komorka(h.zaliczone_jako)}
        ${komorka('+' + h.punkty)}
    </tr>`).join('') || wierszKomunikat(5, t('att.none'));
}
$('btn-ob-pokaz').addEventListener('click', pokazObecnosciWszystkich);
