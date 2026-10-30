// ============================================================================
// PWA — Panel Ministranta + Panel Admina/Księdza (v2.3)
//   • wielojęzyczność (pl / en-GB / uk) — patrz js/i18n.js
//   • każde dane z bazy wstawiane do HTML przechodzą przez esc() (ochrona przed XSS)
//   • zdarzenia przez data-akcja + jeden delegowany handler (zamiast onclick z danymi)
// ============================================================================

let sesja = null; // { id, kod, imie, nazwisko, is_admin, is_moderator, pin } — pin w pamięci na czas sesji do RPC

const $ = (id) => document.getElementById(id);
const widokLogin = $('widok-login');
const widokMinistrant = $('widok-ministrant');
const widokAdmin = $('widok-admin');

let aktywnaZakladka = 'kalendarz';

function pokazWidok(w) {
    [widokLogin, widokMinistrant, widokAdmin].forEach(x => x.classList.add('hidden'));
    w.classList.remove('hidden');
}

// Komunikat błędu z odpowiedzi RPC, przetłumaczony na aktualny język
function blad(wynik) { return tekstBlokadyZOdpowiedzi(wynik) || tlumaczBlad(wynik && wynik.blad); }

// Wiersz „brak danych” / „błąd” do tabel
function wierszKomunikat(kolumny, tekst) {
    return `<tr><td colspan="${kolumny}">${esc(tekst)}</td></tr>`;
}

// --- Delegowana obsługa akcji z przycisków w tabelach ---
// Przycisk: <button data-akcja="nazwa" data-id="..." data-kod="...">. Wartości data-* są
// zawsze escapowane przez esc(), więc nie da się ich użyć do wstrzyknięcia kodu.
const AKCJE = {};
document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-akcja]');
    if (!el) return;
    const fn = AKCJE[el.dataset.akcja];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

// --- LOGOWANIE ---
$('btn-zaloguj').addEventListener('click', zaloguj);
$('login-pin').addEventListener('keydown', e => { if (e.key === 'Enter') zaloguj(); });

async function zaloguj() {
    const kod = $('login-kod').value.trim();
    const pin = $('login-pin').value.trim();
    const status = $('login-status');
    status.textContent = '';

    if (!kod || pin.length !== 4) { status.textContent = t('login.need_both'); return; }

    let wynik = await wywolajRPC('zaloguj', { p_kod: kod, p_pin: pin, p_zrodlo: 'pwa' });
    // zapas: wersja zaloguj() bez parametru p_zrodlo
    if (!wynik.sukces && (wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883')) wynik = await wywolajRPC('zaloguj', { p_kod: kod, p_pin: pin });
    if (!wynik.sukces) { status.textContent = blad(wynik); return; }

    // PIN żyje WYŁĄCZNIE w pamięci karty (RAM). Nie trafia do sessionStorage/localStorage — po odświeżeniu karty trzeba zalogować się ponownie.
    sesja = { ...wynik, pin };
    ustawDostepDoPaneluAdmina();
    await pokazPanelMinistranta();
}

function ustawDostepDoPaneluAdmina() {
    $('btn-panel-admina').classList.toggle('hidden', !(sesja && (sesja.is_admin || sesja.is_moderator)));
}

// Wznów sesję po odświeżeniu strony (PWA)
// Sesja nie jest już zapisywana w przeglądarce (wcześniej: sessionStorage z jawnym PIN-em). Usuwamy ślad po starszych wersjach.
try { sessionStorage.removeItem('sesja'); } catch (e) { /* ignoruj */ }

$('btn-wyloguj').addEventListener('click', wyloguj);
$('btn-admin-wyloguj').addEventListener('click', wyloguj);
function wyloguj(e) {
    if (e) e.preventDefault();
    sesja = null;
    pokazWidok(widokLogin);
}

// --- Miesiące (nazwy zależne od języka) ---
function wypelnijSelektorMiesiecy(selectEl, wybranyMiesiac) {
    const wybrany = wybranyMiesiac || parseInt(selectEl.value) || (new Date().getMonth() + 1);
    let html = '';
    for (let m = 1; m <= 12; m++) html += `<option value="${m}" ${m === wybrany ? 'selected' : ''}>${esc(nazwaMiesiaca(m))}</option>`;
    selectEl.innerHTML = html;
}

// --- PANEL MINISTRANTA ---
async function pokazPanelMinistranta() {
    pokazWidok(widokMinistrant);
    $('mm-imie').textContent = `${sesja.imie} ${sesja.nazwisko} (${sesja.kod})`;

    const teraz = new Date();
    wypelnijSelektorMiesiecy($('mm-hist-miesiac'), teraz.getMonth() + 1);
    if (!$('mm-hist-rok').value) $('mm-hist-rok').value = teraz.getFullYear();

    const { data: ranking } = await odczytajZBledem(supabaseClient.from('ranking_miesiac').select('*').order('pozycja'), 'ranking_miesiac');
    const wlasnyWiersz = (ranking || []).find(r => r.ministrant_id === sesja.id);
    $('mm-punkty').textContent = wlasnyWiersz ? wlasnyWiersz.punkty_miesiac : 0;

    $('mm-ranking').querySelector('tbody').innerHTML = (ranking || []).map(r =>
        `<tr class="${r.ministrant_id === sesja.id ? 'podswietlone' : ''}">
            <td>${esc(r.pozycja)}.</td><td>${esc(r.imie)} ${esc(r.nazwisko)}</td><td>${esc(t('common.points_short', { n: r.punkty_miesiac }))}</td>
        </tr>`).join('');

    await pokazMojaHistorie();
    if (typeof odswiezPorownanieMiesiecy === 'function') await odswiezPorownanieMiesiecy();   // porównanie z poprzednim miesiącem
}

async function pokazMojaHistorie() {
    const miesiac = parseInt($('mm-hist-miesiac').value);
    const rok = parseInt($('mm-hist-rok').value);
    const tbody = $('mm-historia').querySelector('tbody');
    const sumaEl = $('mm-hist-suma');

    const wynik = await wywolajRPC('moja_historia_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(4, '❌ ' + blad(wynik)); sumaEl.textContent = ''; return; }
    sumaEl.textContent = t('mm.sum', { miesiac: nazwaMiesiaca(miesiac), rok, n: wynik.suma_punktow });
    tbody.innerHTML = (wynik.historia || []).map(h => `
        <tr>
            <td>${esc(h.nazwa)}</td>
            <td>${esc(formatData(h.data_wydarzenia))}</td>
            <td>${esc(h.zaliczone_jako)}</td>
            <td>+${esc(t('common.points_short', { n: h.punkty }))}</td>
        </tr>`).join('') || wierszKomunikat(4, t('mm.none'));
}
$('btn-mm-pokaz-historie').addEventListener('click', pokazMojaHistorie);

$('btn-zmien-pin').addEventListener('click', async () => {
    const stary = $('pin-stary').value.trim();
    const nowy = $('pin-nowy').value.trim();
    const status = $('zmien-pin-status');
    status.textContent = '';

    if (stary.length !== 4 || nowy.length !== 4) { status.textContent = t('mm.pin_both4'); return; }

    if (pinZbytProsty(nowy)) { status.textContent = '❌ ' + t('e.pin_weak'); return; }

    // Wersja z audytem zapisuje w historii: kto zmienił i skąd (PWA). Brak funkcji na serwerze → zwykła zmiana.
    const wynik = await wywolajRPCZAudytem('zmien_pin_audyt', 'zmien_pin', { p_kod: sesja.kod, p_stary_pin: stary, p_nowy_pin: nowy }, { p_zrodlo: 'pwa' });
    if (wynik.sukces) {
        status.textContent = '✅ ' + t('mm.pin_changed');
        sesja.pin = nowy;
        $('pin-stary').value = '';
        $('pin-nowy').value = '';
    } else {
        status.textContent = '❌ ' + blad(wynik);
    }
});

$('btn-panel-admina').addEventListener('click', (e) => { e.preventDefault(); pokazPanelAdmina(); });
$('btn-admin-do-panelu-ministranta').addEventListener('click', (e) => { e.preventDefault(); pokazPanelMinistranta(); });

// --- PANEL ADMINA / KSIĘDZA ---
async function pokazPanelAdmina() {
    pokazWidok(widokAdmin);
    const admin = !!sesja.is_admin;
    $('tab-karty').classList.toggle('hidden', !(admin || sesja.is_moderator));   // v2.15.07: karty (plakietki) generuje Admin i Ksiądz — Ksiądz tylko dla zwykłych ministrantów (sql/40)
    $('tab-baza').classList.toggle('hidden', !admin);                  // Ksiądz NIE widzi modułu Baza danych
    $('tab-kioski').classList.toggle('hidden', !admin);                // ani modułu Kioski
    ['dashboard', 'stats', 'ustawienia', 'audyt', 'rodo', 'narzedzia', 'raport', 'akceptacje', 'wiadomosci'].forEach(z => $('tab-' + z).classList.toggle('hidden', !admin)); // moduły tylko dla Admina
    const start = admin ? 'dashboard' : 'kalendarz';                   // Admin startuje od Dashboardu, Ksiądz od Kalendarza
    aktywnaZakladka = start;
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === start));
    ZAKLADKI.forEach(z => $('tab-content-' + z).classList.toggle('hidden', z !== start));
    // Formularz konta: Admin (pełny) i Ksiądz (tylko dodawanie/edycja zwykłych ministrantów)
    $('mi-formularz-admin-only').classList.toggle('hidden', !(admin || sesja.is_moderator));
    $('mi-moderator-wiersz').classList.toggle('hidden', !admin);       // nadawanie roli Księdza — tylko Admin
    $('mi-priest-note').classList.toggle('hidden', admin);
    document.querySelectorAll('.admin-only-akcja').forEach(el => el.classList.toggle('hidden', !(admin || sesja.is_moderator)));   // v2.15.03: akcje na wydarzeniach (edycja / usuwanie) także dla Księdza

    const teraz = new Date();
    wypelnijSelektorMiesiecy($('raport-miesiac'), teraz.getMonth() + 1);
    wypelnijSelektorMiesiecy($('ob-miesiac'), teraz.getMonth() + 1);
    wypelnijSelektorMiesiecy($('baza-ob-miesiac'), teraz.getMonth() + 1);
    if (!$('ob-rok').value) $('ob-rok').value = teraz.getFullYear();
    if (!$('baza-ob-rok').value) $('baza-ob-rok').value = teraz.getFullYear();
    if (!$('raport-rok').value) $('raport-rok').value = teraz.getFullYear();

    await odswiezKalendarz();
    await odswiezListeMinistrantow();
    if (admin) await odswiezDashboard();
    if (admin && typeof uruchomMonitorAdmina === 'function') uruchomMonitorAdmina();   // v2.14: Raport Dnia — powiadamianie Admina o wszystkim
}

const ZAKLADKI = ['kalendarz', 'ministranci', 'obecnosci', 'karty', 'zgloszenia', 'reczna', 'listy', 'kioski', 'baza', 'bezpieczenstwo',
                  'dashboard', 'statystyki', 'frekwencja', 'ustawienia', 'audyt', 'rodo', 'narzedzia', 'raport', 'akceptacje', 'wiadomosci'];

// Zakładki niedostępne dla Księdza (Admin-only) — zabezpieczenie także na wypadek ręcznego wywołania
const ZAKLADKI_TYLKO_ADMIN = ['kioski', 'baza', 'dashboard', 'statystyki', 'ustawienia', 'audyt', 'rodo', 'narzedzia', 'raport', 'akceptacje', 'wiadomosci'];

function odswiezAktywnaZakladke() {
    if (sesja && !sesja.is_admin && ZAKLADKI_TYLKO_ADMIN.includes(aktywnaZakladka)) return;
    switch (aktywnaZakladka) {
        case 'kalendarz': return odswiezKalendarz();
        case 'ministranci': return odswiezListeMinistrantow();
        case 'bezpieczenstwo': return odswiezBezpieczenstwo();
        case 'karty': return odswiezRosterKart();
        case 'obecnosci': return odswiezObecnosciWszystkich();
        case 'zgloszenia': return odswiezZgloszenia();
        case 'reczna': return odswiezReczna();
        case 'listy': return odswiezListyPapierowe();
        case 'narzedzia': return odswiezNarzedzia();
        case 'kioski': return odswiezKioski();
        case 'baza': return odswiezBazaDanych();
        case 'dashboard': return odswiezDashboard();
        case 'statystyki': return odswiezStatystyki();
        case 'frekwencja': return odswiezFrekwencje();
        case 'ustawienia': return odswiezUstawienia();
        case 'audyt': return odswiezAudyt();
        case 'rodo': return odswiezRodo();
        case 'raport': return odswiezRaportDnia();
        case 'akceptacje': return odswiezAkceptacje();
        case 'wiadomosci': return odswiezWiadomosci();
    }
}

document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        aktywnaZakladka = btn.dataset.tab;
        ZAKLADKI.forEach(z => $('tab-content-' + z).classList.toggle('hidden', z !== aktywnaZakladka));
        odswiezAktywnaZakladke();
    });
});

// Zmiana języka — przerysuj to, co użytkownik właśnie widzi
document.addEventListener('zmiana-jezyka', () => {
    if (!sesja) return;
    if (!widokMinistrant.classList.contains('hidden')) pokazPanelMinistranta();
    else if (!widokAdmin.classList.contains('hidden')) {
        ['raport-miesiac', 'ob-miesiac', 'baza-ob-miesiac'].forEach(id => wypelnijSelektorMiesiecy($(id)));
        if (edytowanyMinistrantId) {
            const m = biezacaListaMinistrantow.find(x => x.id === edytowanyMinistrantId);
            if (m) $('mi-tytul-formularza').textContent = t('mi.edit', { n: `${m.imie} ${m.nazwisko}` });
            $('mi-pin').placeholder = t('mi.pin_edit_ph');
            $('btn-dodaj-ministranta').textContent = t('mi.btn_save');
        }
        odswiezAktywnaZakladke();
    }
});

// --- ZGŁOSZENIA SPECJALNE ---
async function odswiezZgloszenia() {
    const status = $('zg-filtr-status').value || null;
    const wynik = await wywolajRPC('lista_zgloszen', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: status });
    const tbody = $('tabela-zgloszenia').querySelector('tbody');
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(7, '❌ ' + blad(wynik)); return; }

    const KOLOR = { oczekujace: 'var(--accent-4)', zatwierdzone: 'var(--ok)', odrzucone: 'var(--err)' };

    tbody.innerHTML = (wynik.dane || []).map(z => {
        let akcja = '—';
        if (z.status === 'oczekujace') {
            const zablokowane = (z.ministrant_is_admin && !sesja.is_admin);
            const dis = zablokowane ? `disabled title="${esc(t('req.cannot_admin'))}"` : '';
            akcja = `
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="number" min="0" placeholder="${esc(t('req.pts_ph'))}" style="width:70px; margin:0;" id="zg-pkt-${esc(z.id)}" ${dis}>
                    <button class="btn" style="width:auto; padding:6px 10px;" ${dis} data-akcja="zg-zatwierdz" data-id="${esc(z.id)}">${esc(t('req.approve'))}</button>
                    <button class="btn btn-danger" style="width:auto; padding:6px 10px;" ${dis} data-akcja="zg-odrzuc" data-id="${esc(z.id)}">${esc(t('req.reject'))}</button>
                </div>`;
        }
        return `
        <tr>
            <td>${esc(formatDataCzas(z.data_zgloszenia))}</td>
            <td>${esc(z.imie)} ${esc(z.nazwisko)} (${esc(z.ministrant_kod)})${z.ministrant_is_admin ? ' 👑' : ''}</td>
            <td>${esc(t('req.type.' + z.typ) === 'req.type.' + z.typ ? z.typ : t('req.type.' + z.typ))}</td>
            <td style="color:${KOLOR[z.status] || 'inherit'}">${esc(t('req.st.' + z.status))}</td>
            <td>${esc(z.punkty ?? '—')}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${z.rozpatrzone_przez_kod ? `${esc(z.rozpatrzone_przez_imie)} ${esc(z.rozpatrzone_przez_nazwisko)}` : '—'}</td>
            <td>${akcja}</td>
        </tr>`;
    }).join('') || wierszKomunikat(7, t('req.none'));
}
$('btn-zg-odswiez').addEventListener('click', odswiezZgloszenia);
$('zg-filtr-status').addEventListener('change', odswiezZgloszenia);

AKCJE['zg-zatwierdz'] = (d) => rozpatrzZgloszenie(d.id, 'zatwierdz');
AKCJE['zg-odrzuc'] = (d) => rozpatrzZgloszenie(d.id, 'odrzuc');

async function rozpatrzZgloszenie(id, decyzja) {
    let punkty = null;
    if (decyzja === 'zatwierdz') {
        const pole = $(`zg-pkt-${id}`);
        punkty = parseInt(pole.value);
        if (isNaN(punkty) || punkty < 0) { alert(t('req.need_points')); return; }
    }
    if (decyzja === 'odrzuc' && !confirm(t('req.confirm_reject'))) return;

    const wynik = await wywolajRPC('rozpatrz_zgloszenie', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
        p_zgloszenie_id: id, p_decyzja: decyzja, p_punkty: punkty
    });
    if (!wynik.sukces) alert('❌ ' + blad(wynik));
    await odswiezZgloszenia();
}

