// ============================================================================
// KIOSK (v2.3) — skaner QR (USB/HID), klawiatura PIN, bloki połączone, panel awaryjny,
//   • języki PL / EN-GB / UA (wszystkie teksty lokalnie w js/i18n.js — działają offline)
//   • tryb offline: cache ważny 10 dni, automatyczne odświeżanie w tle przy każdym połączeniu,
//     wyraźny pasek statusu, podgląd kolejki z ekranu oczekiwania, czyszczenie kolejki (Admin)
//   • jeśli internet zniknie w trakcie zapisu — wpis trafia do kolejki zamiast zginąć
//
// Zasada nadrzędna offline: NIC nie jest oznaczane jako „zsynchronizowane”, dopóki serwer
// nie potwierdzi tego realną odpowiedzią. Punkty przyznaje wyłącznie serwer.
// ============================================================================

const $ = (id) => document.getElementById(id);
const skanerInput = $('skaner-input');
const ekranCzekanie = $('ekran-czekanie');
const ekranPin = $('ekran-pin');
const ekranBlok = $('ekran-blok');
const ekranWybor = $('ekran-wybor-wydarzenia');   // v2.10: lista wydarzeń do kliknięcia po „Zatwierdź”
// v2.10: PIN NIE zatwierdza się już sam po 4 cyfrach — trzeba kliknąć „Zatwierdź”; potem wybór mszy z listy
const AUTO_ZATWIERDZ_PIN = false;
const WYBOR_WYDARZENIA_NA_EKRANIE = true;
const ekranWynik = $('ekran-wynik');
const ekranKolejka = $('ekran-kolejka');
const ekranAdminAwaryjny = $('ekran-admin-awaryjny');

let biezacyKod = null;       // KOD LOGOWANIA ministranta (np. MIN-001) — NIE kod plakietki z QR!
let biezacyProfil = null;
let pinBufor = '';
let aktywneWydarzenie = null;
let rolaAwaryjna = null;     // 'admin' | 'moderator' | null
let trybZgloszenia = null;   // 'pogrzeb' | 'slub' | 'inne' | null
let biezacaPlakietka = null; // kod plakietki z QR (do audytu i do wyszukania w cache offline)

// Stan tekstów zależnych od języka (żeby dało się je przerysować po zmianie języka w trakcie)
let pinInfoTryb = null;      // null | 'offline' | 'offline_report' | 'report'
let przyciskResetTryb = 'reset'; // 'reset' | 'cancel' | 'logout'
let biezacyKomunikat = null; // { stan, tresc } — tresc: string albo funkcja zwracająca string
let czasZmianyJezyka = 0;
// Stały kod weryfikacyjny (3 cyfry) Admina/Księdza — drugi etap logowania do trybu awaryjnego

// ---------------------------------------------------------------- JĘZYK --------
function jezykDomyslnyKiosku() {
    try { const z = localStorage.getItem(KLUCZ_JEZYKA); if (z && JEZYKI[z]) return z; } catch (e) { /* ignoruj */ }
    try { const u = JSON.parse(localStorage.getItem(KLUCZ_USTAWIEN_KIOSKU) || '{}'); if (u.domyslny_jezyk && JEZYKI[u.domyslny_jezyk]) return u.domyslny_jezyk; } catch (e) { /* ignoruj */ }
    return 'pl';
}

// Ustawienia systemowe z serwera (ważność cache, częstość odświeżania, język) — zapamiętane lokalnie, działają offline
function zastosujUstawieniaKiosku(u) {
    if (!u || typeof u !== 'object') return;
    if (Number.isFinite(Number(u.cache_offline_dni)) && u.cache_offline_dni >= 1 && u.cache_offline_dni <= 30) {
        DNI_WAZNOSCI_CACHE = Number(u.cache_offline_dni);
        OFFLINE_MAKS_WIEK_MS = DNI_WAZNOSCI_CACHE * 24 * 60 * 60 * 1000;
    }
    if (Number.isFinite(Number(u.cache_odswiez_min)) && u.cache_odswiez_min >= 5 && u.cache_odswiez_min <= 720) {
        CACHE_ODSWIEZ_CO_MS = Number(u.cache_odswiez_min) * 60 * 1000;
    }
}
function wczytajUstawieniaKiosku() {
    try { zastosujUstawieniaKiosku(JSON.parse(localStorage.getItem(KLUCZ_USTAWIEN_KIOSKU) || '{}')); } catch (e) { /* ignoruj */ }
}
async function pobierzUstawieniaKiosku() {
    const w = await wywolajRPC('ustawienia_publiczne', {});
    if (w && !w.siec && !w.kod_pg && typeof w === 'object' && (w.cache_offline_dni !== undefined || w.nazwa_parafii !== undefined)) {
        try { localStorage.setItem(KLUCZ_USTAWIEN_KIOSKU, JSON.stringify(w)); } catch (e) { /* ignoruj */ }
        zastosujUstawieniaKiosku(w);
        odswiezTekstyEkranu();
    }
}

// Błąd z serwera → tekst w aktualnym języku (z wyciągnięciem liczby pozostałych prób)
function bladT(wynik) {
    const zBlokady = tekstBlokadyZOdpowiedzi(wynik); // blokada PIN v2 z serwera (stopnie)
    if (zBlokady) return zBlokady;
    const surowy = wynik && wynik.blad;
    if (surowy && /Nieprawidłowy PIN/i.test(surowy)) {
        const m = surowy.match(/(\d+)\s*\.?\s*$/);
        if (/Pozosta/i.test(surowy) && m) return t('e.wrong_pin_left', { n: parseInt(m[1]) });
    }
    return tlumaczBlad(surowy);
}

// ============================================================================
// MONITORING KIOSKU — sygnał kontrolny co 15 minut, wyrównany do zegara.
// Wysyłamy WYŁĄCZNIE dane, które przeglądarka faktycznie udostępnia (brak = null, nic zmyślonego).
// ============================================================================
const KLUCZ_KIOSK_ID = 'em_kiosk_id';
function pobierzIdKiosku() {
    let id = localStorage.getItem(KLUCZ_KIOSK_ID);
    if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : ('kiosk-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
        localStorage.setItem(KLUCZ_KIOSK_ID, id);
    }
    return id;
}
const ID_KIOSKU = pobierzIdKiosku();

async function zbierzDaneDiagnostyczne() {
    const kolejka = wczytajKolejkeOffline();
    const cache = wczytajCacheOffline();
    const dane = {
        czas_urzadzenia: new Date().toISOString(),
        online_navigator: navigator.onLine,
        online_zweryfikowane: !jestOffline,
        user_agent: navigator.userAgent || null,
        jezyk: navigator.language || null,
        rozdzielczosc: (typeof screen !== 'undefined') ? `${screen.width}x${screen.height}` : null,
        karta_widoczna: (typeof document !== 'undefined') ? (document.visibilityState === 'visible') : null,
        siec_typ: (navigator.connection && navigator.connection.type) || null,
        siec_effective_type: (navigator.connection && navigator.connection.effectiveType) || null,
        siec_downlink_mbps: (navigator.connection && typeof navigator.connection.downlink === 'number') ? navigator.connection.downlink : null,
        siec_rtt_ms: (navigator.connection && typeof navigator.connection.rtt === 'number') ? navigator.connection.rtt : null,
        pamiec_gb: (typeof navigator.deviceMemory === 'number') ? navigator.deviceMemory : null,
        rdzenie_cpu: (typeof navigator.hardwareConcurrency === 'number') ? navigator.hardwareConcurrency : null,
        bateria_procent: null,
        bateria_ladowanie: null,
        offline_kolejka_dlugosc: kolejka.filter(z => z.status === ST_OCZEKUJE).length,
        offline_kolejka_bledy: kolejka.filter(z => (z.status || '').startsWith('błąd')).length,
        // panel Admina → Kioski pokazuje wiek danych offline (wcześniej to pole nie było wysyłane)
        offline_cache_pobrano: cache ? (czasCache(cache) || null) : null,
        auto_odswiezanie_cache: autoStan
    };
    try {
        if (navigator.getBattery) {
            const bateria = await navigator.getBattery();
            dane.bateria_procent = Math.round(bateria.level * 100);
            dane.bateria_ladowanie = bateria.charging;
        }
    } catch (e) { /* API niedostępne — zostaje null */ }
    return dane;
}

async function wyslijPing() {
    const dane = await zbierzDaneDiagnostyczne();
    try {
        await wywolajRPC('kiosk_ping', { p_kiosk_id: ID_KIOSKU, p_nazwa: null, p_wersja: WERSJA_APLIKACJI, p_dane: dane });
    } catch (e) { /* brak sieci — spróbujemy przy następnym cyklu */ }
}

// --- v2.8: PING NA ŻYWO. Admin klika „Ping” w panelu → Kiosk (co kilka sekund) zauważa zlecenie i od razu odsyła dane. ---
let sprawdzaZadaniaPing = false;
async function sprawdzZadaniaPing() {
    if (sprawdzaZadaniaPing || jestOffline || !navigator.onLine) return;
    sprawdzaZadaniaPing = true;
    try {
        const odp = await wywolajRPC('kiosk_pobierz_zadania', { p_kiosk_id: ID_KIOSKU }, { timeoutMs: 6000 });
        const lista = (odp && odp.sukces && odp.zadania) || [];
        if (lista.length === 0) return;
        const dane = await zbierzDaneDiagnostyczne();
        dane.wersja = WERSJA_APLIKACJI;
        dane.cache_pobrano = dane.offline_cache_pobrano || null;
        for (const id of lista) await wywolajRPC('kiosk_odpowiedz_ping', { p_kiosk_id: ID_KIOSKU, p_zadanie_id: id, p_dane: dane }, { timeoutMs: 6000 });
        wyslijPing();   // przy okazji odśwież też wpis w monitoringu
    } catch (e) { /* brak sieci / brak sql/20 — spróbujemy za chwilę */ }
    finally { sprawdzaZadaniaPing = false; }
}
// v2.12: pytanie o ping robi teraz js/kiosk-sterowanie.js (jedno zapytanie na cykl); stary poller działa tylko, gdy serwer nie ma sql/26
let _pollerPingStary = setInterval(() => { if (typeof window.__EM_STEROWANIE_AKTYWNE === 'undefined' || window.__EM_STEROWANIE_AKTYWNE === false) sprawdzZadaniaPing(); }, 5000);

function msDoNastepnegoKwadransa() {
    const teraz = new Date();
    const minuty = teraz.getMinutes();
    const docelowy = new Date(teraz);
    docelowy.setSeconds(0, 0);
    docelowy.setMinutes(minuty - (minuty % 15) + 15);
    return Math.max(1000, docelowy.getTime() - teraz.getTime());
}

// ============================================================================
// AKTUALIZACJE — Kiosk odświeża się sam, ale WYŁĄCZNIE na ekranie oczekiwania i z internetem
// ============================================================================
let oczekujeNaAktualizacje = false;

function czyBezpiecznyMomentNaAktualizacje() {
    return !ekranCzekanie.classList.contains('hidden') && !jestOffline;
}
function wykonajBezpiecznaAktualizacje() {
    window.location.href = window.location.pathname + '?odswiezono=' + Date.now();
}
async function sprawdzAktualizacje() {
    try {
        const odpowiedz = await fetch('js/wersja.js?sprawdz=' + Date.now(), { cache: 'no-store' });
        if (!odpowiedz.ok) return;
        const dopasowanie = (await odpowiedz.text()).match(/WERSJA_APLIKACJI\s*=\s*['"]([^'"]+)['"]/);
        if (!dopasowanie) return;
        if (dopasowanie[1] !== WERSJA_APLIKACJI) {
            oczekujeNaAktualizacje = true;
            $('app-update-dostepna').classList.remove('hidden');
            if (czyBezpiecznyMomentNaAktualizacje()) wykonajBezpiecznaAktualizacje();
        }
    } catch (e) { /* brak sieci — następny cykl */ }
}
setInterval(sprawdzAktualizacje, 5 * 60 * 1000);

// ============================================================================
// TRYB OFFLINE
// ============================================================================
// Wartości domyślne; Admin zmienia je w Ustawieniach systemowych (sql/18) — Kiosk pobiera je przy połączeniu z internetem
let DNI_WAZNOSCI_CACHE = 10;                                     // dane offline ważne 10 dni
let OFFLINE_MAKS_WIEK_MS = DNI_WAZNOSCI_CACHE * 24 * 60 * 60 * 1000;
let CACHE_ODSWIEZ_CO_MS = 30 * 60 * 1000;                        // w tle: odśwież, jeśli dane starsze niż 30 min
const KLUCZ_USTAWIEN_KIOSKU = 'em_kiosk_ustawienia';
const CACHE_PROBA_CO_MS = 2 * 60 * 1000;                         // po nieudanej próbie nie ponawiaj częściej niż co 2 min
const OFFLINE_KLUCZ_DANE = 'em_offline_dane';
const OFFLINE_KLUCZ_KOLEJKA = 'em_offline_kolejka';
const OFFLINE_KLUCZ_LOKALNE_BLOKADY = 'em_offline_blokady';
const KLUCZ_TOKEN_KIOSKU = 'em_kiosk_token';
// Blokada PIN v2 (te same progi co na serwerze, sql/16): im więcej błędów, tym dłuższa przerwa.
//   3 błędy → 1 min, 5 → 5 min, 7 → 15 min, 10 → 1 h, 15 → do ręcznego odblokowania przez Admina.
const STOPNIE_BLOKADY = [
    { proby: 3, ms: 60 * 1000 }, { proby: 5, ms: 5 * 60 * 1000 }, { proby: 7, ms: 15 * 60 * 1000 },
    { proby: 10, ms: 60 * 60 * 1000 }, { proby: 15, ms: null }
];
const RESET_PROB_PO_MS = 24 * 60 * 60 * 1000;  // doba bez prób zeruje licznik
// Hamulec: próg błędnych PIN-ów dla JEDNEGO kodu (patrz zarejestrujBlednyPin) — nie dotyczy innych osób
const HAMULEC_PROB = 5, HAMULEC_OKNO_MS = 5 * 60 * 1000, HAMULEC_PRZERWA_MS = 30 * 1000;
let bledneProbyKiosku = [];
let hamulecDo = 0;

// Statusy wpisów kolejki — zapisane po polsku w localStorage (zgodność z wcześniejszymi wersjami);
// na ekranie tłumaczone przez statusT().
const ST_OCZEKUJE = 'oczekujące';
const ST_OK = 'zsynchronizowane';
const ST_POMINIETE = 'pominięte (już istniało na serwerze)';
const ST_BLAD = 'błąd — wymaga ręcznego sprawdzenia przez Admina';
const ST_PRZET = EMMagazyn.ST.PRZETERMINOWANE;
const ST_DOAKC = EMMagazyn.ST.DO_AKCEPTACJI;   // v2.14: wpis > 36 h wysłany do akceptacji Admina
const ST_USZKODZONE = EMMagazyn.ST.USZKODZONE;

let jestOffline = false;
let autoStan = localStorage.getItem(KLUCZ_TOKEN_KIOSKU) ? 'on' : 'off'; // 'on' | 'off' | 'niedostepne'

function odczytJson(klucz, domyslna) {
    try { const w = JSON.parse(localStorage.getItem(klucz)); return (w === null || w === undefined) ? domyslna : w; }
    catch (e) { return domyslna; }
}
// v2.12.08 (Szyfr Ministrancki v2.2): kolejka i cache NIE leżą już w localStorage. Są w zaszyfrowanym IndexedDB
// (js/bezpieczny-magazyn.js, AES-256-GCM). Pamięć podręczna poniżej to kopia robocza w RAM (PIN-y żyją tylko do ACK).
const magazyn = EMMagazyn.utworz({});
let kolejkaPamiec = [];
let cachePamiec = null;
let magazynGotowy = false;
let magazynBlad = null;
function wczytajCacheOffline() { return cachePamiec; }
function zapiszCacheOffline(dane) {
    dane.pobrano_lokalnie = new Date().toISOString();
    dane = magazyn.oczyscCache(dane).dane;   // pin_hash nie jest przechowywany nawet w pamięci roboczej
    cachePamiec = dane;
    magazyn.zapiszCache(dane).catch(e => { magazynBlad = e; console.error('Zapis cache nie powiódł się:', e && e.name); });
    odswiezTekstyEkranu();
}
function czasCache(cache) { return cache && (cache.pobrano_lokalnie || cache.pobrano); }
function wczytajKolejkeOffline() { return kolejkaPamiec; }
// Zapis zmian wpisów (status, próby). Uszkodzonych rekordów nie nadpisujemy — zostają jako dowód dla Admina.
async function zapiszKolejkeOffline(kolejka) {
    kolejkaPamiec = kolejka;
    for (const z of kolejka) { if (z.status !== ST_USZKODZONE) await magazyn.zapiszElement(z); }
    odswiezTekstyEkranu();
}
function wczytajLokalneBlokady() { return odczytJson(OFFLINE_KLUCZ_LOKALNE_BLOKADY, {}); }
function zapiszLokalneBlokady(obj) { localStorage.setItem(OFFLINE_KLUCZ_LOKALNE_BLOKADY, JSON.stringify(obj)); }

function cacheJestSwiezy(cache) {
    const kiedy = czasCache(cache);
    if (!kiedy) return false;
    return (Date.now() - new Date(kiedy).getTime()) < OFFLINE_MAKS_WIEK_MS;
}

// Realne sprawdzenie łączności (nie ufamy samemu navigator.onLine). Zapytanie ma twardy limit
// czasu — wcześniej AbortController był tworzony, ale nie podpinany, więc sieć „bez internetu”
// potrafiła wisieć minutami i Kiosk nie przechodził w tryb offline.
async function sprawdzPolaczenie() {
    const kontroler = new AbortController();
    const limit = setTimeout(() => kontroler.abort(), 4000);
    try {
        const { error } = await supabaseClient.from('kalendarz').select('id').limit(1).abortSignal(kontroler.signal);
        return !error || !bladJestSieciowy(error); // odpowiedź serwera (nawet z błędem) = jest połączenie
    } catch (e) {
        return false;
    } finally {
        clearTimeout(limit);
    }
}

// ---------------------------------------------------------- PASEK STATUSU ------
function opisKiedy(iso) {
    const d = new Date(iso), dzis = new Date();
    const tenSamDzien = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const godz = formatGodzina(iso);
    if (tenSamDzien(d, dzis)) return `${t('k.today')} ${godz}`;
    const wczoraj = new Date(dzis); wczoraj.setDate(dzis.getDate() - 1);
    if (tenSamDzien(d, wczoraj)) return `${t('k.yesterday')} ${godz}`;
    return `${formatData(iso)} ${godz}`;
}

function tekstCache() {
    const cache = wczytajCacheOffline();
    if (!cache || !czasCache(cache)) return t('k.cache_none');
    if (!cacheJestSwiezy(cache)) return t('k.cache_stale');
    return t('k.cache_from', { kiedy: opisKiedy(czasCache(cache)) });
}

function odswiezStatusKiosku() {
    const kolejka = wczytajKolejkeOffline();
    const oczekujace = kolejka.filter(z => z.status === ST_OCZEKUJE).length;
    const bledy = kolejka.filter(z => (z.status || '').startsWith('błąd') || z.status === ST_USZKODZONE).length;
    const przeterminowane = kolejka.filter(z => z.status === ST_PRZET).length;
    const cache = wczytajCacheOffline();
    const cacheOk = cacheJestSwiezy(cache);

    let tekst = `${jestOffline ? t('k.st_offline') : t('k.st_online')} · ${t('k.pending', { n: oczekujace })} · ${tekstCache()}`;
    if (bledy > 0) tekst += ` · ⚠️ ${bledy}`;
    if (przeterminowane > 0) tekst += ` · ⏰ ${t('k.q_expired_n', { n: przeterminowane })}`;
    const doAkceptacjiN = kolejka.filter(z => z.status === ST_DOAKC).length;
    if (doAkceptacjiN > 0) tekst += ` · 📨 ${t('k.q_approval_n', { n: doAkceptacjiN })}`;
    $('kiosk-status-tekst').textContent = tekst;

    const pasek = $('kiosk-status');
    pasek.classList.remove('stan-online', 'stan-offline', 'stan-alarm', 'stan-uwaga');
    if (jestOffline) pasek.classList.add(cacheOk ? 'stan-offline' : 'stan-alarm');
    else pasek.classList.add(cacheOk ? 'stan-online' : 'stan-uwaga');

    const znaczek = $('kolejka-licznik');
    znaczek.textContent = String(oczekujace + bledy + przeterminowane);
    znaczek.classList.toggle('hidden', oczekujace + bledy + przeterminowane === 0);
    znaczek.classList.toggle('alarm', bledy > 0 || przeterminowane > 0);
}

// ---------------------------------------------------------- KOLEJKA (widok) ----
function statusT(status) {
    if (status === ST_OCZEKUJE) return t('k.q_st_pending');
    if (status === ST_OK) return t('k.q_st_synced');
    if ((status || '').startsWith('pominięte')) return t('k.q_st_skipped');
    if ((status || '').startsWith('błąd')) return t('k.q_st_error');
    if (status === ST_PRZET) return t('k.q_st_expired');
    if (status === ST_DOAKC) return t('k.q_st_approval');
    if (status === ST_USZKODZONE) return t('k.q_st_corrupt');
    return status || '';
}
function rodzajT(rodzaj) { return rodzaj === 'zgloszenie' ? t('k.q_kind_zgloszenie') : t('k.q_kind_obecnosc'); }

function wierszeKolejki() {
    const kolejka = wczytajKolejkeOffline();
    return kolejka.slice().reverse().map(z => {
        const kolor = z.status === ST_OCZEKUJE ? 'var(--accent-4)' : (((z.status || '').startsWith('błąd') || z.status === ST_PRZET || z.status === ST_USZKODZONE) ? 'var(--err)' : 'var(--ok)');
        return `<tr>
            <td>${esc(formatDataCzas(z.kiedy_lokalnie))}</td>
            <td>${esc((z.payload && z.payload.p_kod) || '—')}</td>
            <td>${esc(rodzajT(z.rodzaj))}</td>
            <td style="color:${kolor}">${esc(statusT(z.status))}${z.ostatni_blad ? ` <small>(${esc(tlumaczBlad(z.ostatni_blad))})</small>` : ''}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="4">${esc(t('k.q_empty'))}</td></tr>`;
}
function odswiezTabeleKolejki() {
    const html = wierszeKolejki();
    ['tabela-kolejka-ekran', 'tabela-kolejka-offline'].forEach(id => { const el = $(id); if (el) el.innerHTML = html; });
}

// ---------------------------------------------------- Weryfikacja offline ------
// Funkcje offline zwracają { sukces, msg } — msg to FUNKCJA (tekst budowany w chwili wyświetlenia),
// więc komunikat zmienia język razem z interfejsem.
function offlineSzukajPlakietki(kodPlakietki) {
    const cache = wczytajCacheOffline();
    if (!cache || !czasCache(cache)) return { sukces: false, brakCache: true, msg: () => t('k.e_cache_none') };
    if (!cacheJestSwiezy(cache)) return { sukces: false, msg: () => t('k.e_cache_old', { d: DNI_WAZNOSCI_CACHE }) };
    const wpis = (cache.plakietki || []).find(p => p.kod_plakietki === kodPlakietki);
    if (!wpis) return { sukces: false, msg: () => t('k.e_badge_unknown_off') };
    if (!wpis.aktywny) return { sukces: false, msg: () => t('k.e_inactive') };
    return { sukces: true, wpis };
}

function offlineSprawdzBlokade(kod) {
    const wpis = wczytajLokalneBlokady()[kod];
    if (!wpis) return { zablokowany: false };
    if (wpis.trwala) return { zablokowany: true, trwala: true };
    if (wpis.zablokowane_do && wpis.zablokowane_do > Date.now()) return { zablokowany: true, do: wpis.zablokowane_do };
    return { zablokowany: false };
}
function offlineZanotujNieudanaProbe(kod) {
    const blokady = wczytajLokalneBlokady();
    let wpis = blokady[kod] || { proby: 0, zablokowane_do: null, trwala: false, ostatnia: 0 };
    if (!wpis.trwala && wpis.ostatnia && Date.now() - wpis.ostatnia > RESET_PROB_PO_MS) wpis = { proby: 0, zablokowane_do: null, trwala: false, ostatnia: 0 };
    wpis.proby += 1;
    wpis.ostatnia = Date.now();
    const stopien = STOPNIE_BLOKADY.filter(s => wpis.proby >= s.proby).pop();
    if (stopien) {
        if (stopien.ms === null) { wpis.trwala = true; wpis.zablokowane_do = null; }
        else wpis.zablokowane_do = Date.now() + stopien.ms;
    }
    blokady[kod] = wpis;
    zapiszLokalneBlokady(blokady);
    return wpis;
}
// Ile błędnych prób zostało do następnego, dłuższego progu blokady
function probyDoNastepnegoProgu(proby) {
    const nastepny = STOPNIE_BLOKADY.find(s => s.proby > proby);
    return nastepny ? nastepny.proby - proby : 0;
}

// Hamulec POJEDYNCZEGO KODU: wiele błędnych PIN-ów dla TEGO SAMEGO kodu → ten kod czeka chwilę.
// Blokada jednej osoby NIGDY nie zamraża Kiosku — inni ministranci logują się normalnie (v2.5).
let hamulecDoKodu = {};   // kod → timestamp końca przerwy
let bledneProbyKodu = {}; // kod → [timestampy błędnych prób]
function zarejestrujBlednyPin(kod) {
    kod = kod || biezacyKod;
    if (!kod) return;
    const teraz = Date.now();
    const lista = (bledneProbyKodu[kod] || []).filter(x => teraz - x < HAMULEC_OKNO_MS);
    lista.push(teraz);
    bledneProbyKodu[kod] = lista;
    if (lista.length >= HAMULEC_PROB) { hamulecDoKodu[kod] = teraz + HAMULEC_PRZERWA_MS; bledneProbyKodu[kod] = []; }
}
// true = ten kod jest chwilowo wstrzymany (komunikat pokazany); inne kody nie są dotknięte
function hamulecAktywny() {
    const kod = biezacyKod;
    if (!kod) return false;
    const koniec = hamulecDoKodu[kod] || 0;
    if (koniec <= Date.now()) return false;
    pokazKomunikatWyniku(false, () => t('k.e_brake', { s: Math.max(1, Math.ceil(((hamulecDoKodu[kod] || 0) - Date.now()) / 1000)) }));
    return true;
}function offlineWyczyscBlokade(kod) {
    const blokady = wczytajLokalneBlokady();
    delete blokady[kod];
    zapiszLokalneBlokady(blokady);
}

// v2.3: Kiosk NIE weryfikuje PIN-u offline (nie ma już pin_hash w cache). PIN sprawdza serwer przy synchronizacji
// (tryb „pin_na_serwerze”) albo operacja jest autoryzowana tokenem Kiosku (tryb „token_bez_pin”, włączany przez Admina).
function offlineTrybToken(wpis) {
    const c = wczytajCacheOffline();
    return !!c && c.tryb_offline === 'token_bez_pin' && !(wpis && wpis.uprzywilejowany);
}

function offlineAktywneWydarzenie() {
    const cache = wczytajCacheOffline();
    const teraz = Date.now();
    return ((cache && cache.kalendarz) || []).find(w => teraz >= new Date(w.okno_start).getTime() && teraz <= new Date(w.okno_koniec).getTime()) || null;
}

// Zwraca true dopiero PO trwałym, zaszyfrowanym zapisie. Przy błędzie magazynu operacja NIE jest uznana za zapisaną.
async function dodajDoKolejkiOffline(rodzaj, payload) {
    try {
        const it = await magazyn.dodaj(rodzaj, payload, { kod_plakietki: biezacaPlakietka });   // meta: do historii użyć plakietek
        kolejkaPamiec.push(it);
        odswiezTekstyEkranu();
        return true;
    } catch (e) {
        if (e && e.kod === 'DUPLIKAT_LOKALNY') return 'duplikat';   // ta osoba ma już oczekujący zapis na to wydarzenie
        magazynBlad = e; console.error('Zapis do kolejki nie powiódł się:', e && e.name);
        return false;
    }
}

// Historia użyć plakietek (sql/15). Strzał „fire and forget”: brak funkcji / sieci nigdy nie blokuje Kiosku.
function zapiszSkanPlakietki(kodPlakietki, wynik, kiedyLokalnie) {
    try {
        wywolajRPC('kiosk_zapisz_skan', {
            p_kiosk_id: ID_KIOSKU, p_kod_plakietki: String(kodPlakietki).slice(0, 80), p_wynik: wynik,
            p_kiedy_lokalnie: kiedyLokalnie || new Date().toISOString()
        }).catch(() => {});
    } catch (e) { /* ignoruj */ }
}

// ---------------------------------------------------- Synchronizacja kolejki ----
let synchronizacjaWTrakcie = false;
let idemDostepne = true;

// Zwraca { polaczenie:boolean } — UI pokazuje, czy faktycznie był internet
async function probojSynchronizacje() {
    if (synchronizacjaWTrakcie) return { polaczenie: !jestOffline };
    const polaczenie = await sprawdzPolaczenie();
    ustawStanPolaczenia(polaczenie, { bezSynchronizacji: true });
    if (!polaczenie) return { polaczenie: false };

    await magazyn.przeterminuj();                        // 36 h: wpis dostaje status „przeterminowane” — nie jest kasowany
    kolejkaPamiec = await magazyn.wczytajKolejke();
    odswiezTekstyEkranu();
    const doWyslania = kolejkaPamiec.filter(z => z.status === ST_OCZEKUJE && z.proby_synchronizacji < 5);
    // v2.14: wpisy starsze niż 36 h (status „przeterminowane”) trafiają do systemu jako OCZEKUJĄCE NA AKCEPTACJĘ ADMINA (sql/33).
    // Wpisy młodsze niż 36 h synchronizują się normalnie i NIE wymagają akceptacji.
    const doAkceptacji = kolejkaPamiec.filter(z => z.status === ST_PRZET && z.proby_synchronizacji < 5 && z.payload);
    if (doWyslania.length === 0 && doAkceptacji.length === 0) { await wyslijAudytRetencji(); return { polaczenie: true }; }

    synchronizacjaWTrakcie = true;
    let siecPadla = false;
    try {
        for (const item of doWyslania) {
            // Operacja ma STABILNY identyfikator (p_id_operacji) — serwer (sql/30) rozpoznaje powtórzenie i nie zapisuje drugi raz.
            const tokenKiosku = localStorage.getItem(KLUCZ_TOKEN_KIOSKU);
            if (item.rodzaj === 'obecnosc_token' && !tokenKiosku) continue;   // bez tokenu nie ma jak autoryzować — wpis zostaje, bez zmian
            const wersjaIdem = item.rodzaj === 'obecnosc_token' ? 'kiosk_zapisz_obecnosc_token' : item.rodzaj === 'obecnosc' ? 'zapisz_obecnosc_idem' : (item.rodzaj === 'zgloszenie' ? 'zglos_obecnosc_specjalna_idem' : null);
            const wersjaStara = item.rodzaj === 'obecnosc' ? 'zapisz_obecnosc' : 'zglos_obecnosc_specjalna';
            let wynik;
            if (!wersjaIdem) wynik = { sukces: false, blad: 'Nieznany rodzaj operacji w kolejce.' };
            else if (item.rodzaj === 'obecnosc_token') {
                const p = item.payload;
                wynik = await wywolajRPC('kiosk_zapisz_obecnosc_token', {
                    p_kiosk_id: ID_KIOSKU, p_token: tokenKiosku, p_id_operacji: item.id, p_kod: p.p_kod,
                    p_wydarzenie_id: String(p.p_wydarzenie_id), p_wybor: p.p_wybor, p_kiedy_klient: p.p_kiedy_klient
                });
            } else {
                wynik = idemDostepne ? await wywolajRPC(wersjaIdem, Object.assign({}, item.payload, { p_id_operacji: item.id })) : null;
                if (!wynik || (!wynik.sukces && (wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883'))) {
                    idemDostepne = false;   // serwer bez sql/30 — działa stara ścieżka (ochrona przed duplikatem tylko z unikalnego klucza w bazie)
                    wynik = await wywolajRPC(wersjaStara, item.payload);
                }
            }
            if (wynik.siec) { siecPadla = true; break; }   // sieć padła w trakcie — NIC nie oznaczamy jako wysłane

            const meta = item.meta;
            const klasa = magazyn.klasyfikujOdpowiedz(wynik);
            if ((klasa === 'zapisano' || klasa === 'istnialo') && meta && meta.kod_plakietki) {
                zapiszSkanPlakietki(meta.kod_plakietki, 'offline', item.kiedy_lokalnie);   // historia: którą plakietką zapisano
            }
            await magazyn.zastosujOdpowiedz(item, wynik);   // ACK tylko po potwierdzonym zapisie / rozpoznaniu operacji
            if (jestZakonczony(item)) { item.payload = null; item.meta = {}; }   // PIN znika z pamięci roboczej
        }
        if (!siecPadla && doAkceptacji.length > 0) await wyslijDoAkceptacji(doAkceptacji);
        await wyslijAudytRetencji();
        odswiezTekstyEkranu();
    } finally {
        synchronizacjaWTrakcie = false;
    }
    return { polaczenie: true };
}

// v2.14: wysyła wpisy > 36 h do kolejki akceptacji Admina (sql/33: kiosk_zglos_przeterminowana). PIN NIE jest wysyłany —
// o dodaniu obecności decyduje Admin. Po przyjęciu przez serwer wpis dostaje status „wysłane do akceptacji”, a PIN znika z urządzenia.
// Zwraca false, gdy padła sieć (reszta zostaje na kolejną próbę).
async function wyslijDoAkceptacji(lista) {
    const tokenKiosku = localStorage.getItem(KLUCZ_TOKEN_KIOSKU);
    if (!tokenKiosku) return true;   // bez tokenu nie ma jak autoryzować — wpisy zostają „przeterminowane” (jak dotąd)
    for (const item of lista) {
        const p = item.payload || {};
        const wynik = await wywolajRPC('kiosk_zglos_przeterminowana', {
            p_kiosk_id: ID_KIOSKU, p_token: tokenKiosku, p_id_operacji: item.id, p_rodzaj: item.rodzaj, p_kod: p.p_kod,
            p_wydarzenie_id: p.p_wydarzenie_id == null ? null : String(p.p_wydarzenie_id), p_wybor: p.p_wybor || null,
            p_typ: p.p_typ || null, p_kod_plakietki: p.p_kod_plakietki || null, p_kiedy_klient: item.kiedy_lokalnie
        });
        if (wynik.siec) return false;
        if (!wynik.sukces && (wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883')) return true;   // serwer bez sql/33 — wpisy zostają „przeterminowane”
        if (!wynik.sukces && wynik.kod_bledu === 'token_nieprawidlowy') return true;                   // problem z tokenem Kiosku — nie spalamy prób wpisu
        await magazyn.zastosujOdpowiedz(item, wynik);
        if (jestZakonczony(item)) { item.payload = null; item.meta = {}; }
    }
    return true;
}

// ---------------------------------------------- Stan połączenia + cache w tle ---
function ustawStanPolaczenia(polaczenie, opcje) {
    const byloOffline = jestOffline;
    jestOffline = !polaczenie;
    odswiezStatusKiosku();
    if (byloOffline && polaczenie) {
        // Właśnie wróciło połączenie: dosyłamy kolejkę, odświeżamy dane offline i meldujemy się serwerowi
        if (!(opcje && opcje.bezSynchronizacji)) probojSynchronizacje();
        odswiezCacheWTle(true);
        pobierzUstawieniaKiosku();
        wyslijPing();
    }
}

function ustawAutoStan(stan) {
    autoStan = stan;
    odswiezTekstyEkranu();
}

// Odświeżanie danych offline w tle — bez udziału człowieka (token urządzenia nadany raz przez Admina)
let odswiezanieCache = false;
let ostatniaProbaCache = 0;
async function odswiezCacheWTle(wymus) {
    if (odswiezanieCache || jestOffline) return;
    const token = localStorage.getItem(KLUCZ_TOKEN_KIOSKU);
    if (!token) { if (autoStan !== 'niedostepne') ustawAutoStan('off'); return; }
    const cache = wczytajCacheOffline();
    const kiedy = czasCache(cache);
    const wiek = kiedy ? Date.now() - new Date(kiedy).getTime() : Infinity;
    if (!wymus && wiek < CACHE_ODSWIEZ_CO_MS) return;
    if (!wymus && Date.now() - ostatniaProbaCache < CACHE_PROBA_CO_MS) return;

    odswiezanieCache = true;
    ostatniaProbaCache = Date.now();
    try {
        let w = await wywolajRPC('kiosk_pobierz_cache_v23', { p_kiosk_id: ID_KIOSKU, p_token: token }, { timeoutMs: 20000 });
        if (!w.sukces && (w.kod_pg === 'PGRST202' || w.kod_pg === '42883')) w = await wywolajRPC('kiosk_pobierz_cache', { p_kiosk_id: ID_KIOSKU, p_token: token }, { timeoutMs: 20000 });   // serwer bez sql/31
        if (w.sukces) {
            zapiszCacheOffline(w);
            ustawAutoStan('on');
        } else if (w.kod_bledu === 'token_nieprawidlowy') {
            localStorage.removeItem(KLUCZ_TOKEN_KIOSKU);   // token wygasł lub unieważniony — Admin musi autoryzować ponownie
            ustawAutoStan('off');
        } else if (w.kod_pg === 'PGRST202' || w.kod_pg === '42883') {
            ustawAutoStan('niedostepne');                  // na serwerze brakuje sql/14_dodatki12.sql
        }
        // błąd sieci: po cichu, spróbujemy ponownie przy następnym cyklu
    } finally {
        odswiezanieCache = false;
        odswiezStatusKiosku();
    }
}

// Cykl co 20 s: sprawdź łączność → dosyłaj kolejkę → odśwież cache, jeśli stary → odbierz polecenia Admina
setInterval(async () => {
    const polaczenie = await sprawdzPolaczenie();
    ustawStanPolaczenia(polaczenie);
    if (polaczenie) {
        await odswiezCacheWTle(false);
        await sprawdzPolecenieSynchronizacji();
        // v2.15.01: także wpisy „przeterminowane” (> 36 h) czekają na wysłanie do akceptacji Admina — wcześniej cykl ich nie wywoływał
        if (wczytajKolejkeOffline().some(z => z.status === ST_OCZEKUJE || (z.status === ST_PRZET && z.payload && z.proby_synchronizacji < 5))) probojSynchronizacje();
    }
}, 20000);
window.addEventListener('online', () => { probojSynchronizacje(); });
window.addEventListener('offline', () => ustawStanPolaczenia(false));

const KLUCZ_OSTATNIE_POLECENIE_SYNC = 'em_ostatnie_polecenie_sync';
async function sprawdzPolecenieSynchronizacji() {
    try {
        const { data, error } = await supabaseClient.rpc('kiosk_sprawdz_polecenie_sync');
        if (error || !data || !data.wymus_sync_o) return;
        if (data.wymus_sync_o !== localStorage.getItem(KLUCZ_OSTATNIE_POLECENIE_SYNC)) {
            localStorage.setItem(KLUCZ_OSTATNIE_POLECENIE_SYNC, data.wymus_sync_o);
            await probojSynchronizacje();
            await wyslijPing();
        }
    } catch (e) { /* brak sieci — następny cykl */ }
}

// ============================================================================
// EKRANY, TEKSTY ZALEŻNE OD JĘZYKA
// ============================================================================
let widokKolejkiTimer = null;
let wynikTimer = null;

function pokazEkran(ekran) {
    [ekranCzekanie, ekranPin, ekranWybor, ekranBlok, ekranWynik, ekranKolejka, ekranAdminAwaryjny].forEach(e => e.classList.add('hidden'));
    ekran.classList.remove('hidden');
    clearTimeout(widokKolejkiTimer);
    if (ekran === ekranKolejka) widokKolejkiTimer = setTimeout(resetDoCzekania, 90 * 1000); // nie zostawiaj kolejki otwartej
}

// Przerysowuje wszystko, co zależy od języka lub stanu — wywoływane po każdej zmianie
function odswiezTekstyEkranu() {
    if (typeof t !== 'function') return;
    odswiezStatusKiosku();
    odswiezTabeleKolejki();

    if (trybZgloszenia) $('tryb-specjalny-nazwa').textContent = t('k.special_mode', { nazwa: t('k.type.' + trybZgloszenia) });

    const info = $('pin-tryb-specjalny-info');
    const typ = trybZgloszenia ? t('k.type.' + trybZgloszenia) : '';
    if (pinInfoTryb === 'offline') info.textContent = t('k.info_offline');
    else if (pinInfoTryb === 'offline_report') info.textContent = t('k.info_offline_report', { typ });
    else if (pinInfoTryb === 'report') info.textContent = t('k.info_report', { typ });
    info.classList.toggle('hidden', !pinInfoTryb);

    $('btn-to-nie-ja').textContent = przyciskResetTryb === 'cancel' ? t('k.cancel') : (przyciskResetTryb === 'logout' ? t('k.logout') : t('k.not_me'));

    $('awaryjny-tytul').textContent = rolaAwaryjna === 'admin' ? t('k.emerg_admin') : t('k.emerg_priest');
    $('btn-wyczysc-zablokowane').textContent = t('k.clear_stuck_btn', { d: DNI_WAZNOSCI_CACHE });

    const cache = wczytajCacheOffline();
    $('offline-ostatnia-data').textContent = (cache && czasCache(cache)) ? formatDataCzas(czasCache(cache)) : t('k.off_never');
    $('offline-auto-status').textContent = autoStan === 'on' ? t('k.auto_on') : (autoStan === 'niedostepne' ? t('k.auto_unavailable') : t('k.auto_off'));

    if (!ekranWynik.classList.contains('hidden') && biezacyKomunikat) {
        const el = $('wynik-tresc');
        const tr = biezacyKomunikat.tresc;
        el.textContent = typeof tr === 'function' ? tr() : tr;
    }
}

document.addEventListener('zmiana-jezyka', () => {
    czasZmianyJezyka = Date.now();
    odswiezTekstyEkranu();
    if (rolaAwaryjna && !ekranAdminAwaryjny.classList.contains('hidden')) odswiezPanelAwaryjnyTresc();
});

// Wynik operacji. stan: true = potwierdzone przez serwer (zielony), false = błąd (czerwony),
// 'offline' = zapisane lokalnie, jeszcze NIE potwierdzone (bursztynowy). tresc: string lub () => string.
function pokazKomunikatWyniku(stan, tresc) {
    biezacyKomunikat = { stan, tresc };
    const el = $('wynik-tresc');
    el.textContent = typeof tresc === 'function' ? tresc() : tresc;
    el.className = 'status-msg ' + (stan === true ? 'ok' : stan === 'offline' ? 'offline' : 'err');
    pokazEkran(ekranWynik);
    clearTimeout(wynikTimer);
    // Timer jest kasowany przy każdym resecie — wcześniej stary timer potrafił skasować PIN następnej osoby
    wynikTimer = setTimeout(resetDoCzekania, stan === true ? 2500 : 4500);
}

// ============================================================================
// ZGŁOSZENIA SPECJALNE (Pogrzeb / Ślub / Inne)
// ============================================================================
$('btn-zg-pogrzeb').addEventListener('click', () => aktywujTrybZgloszenia('pogrzeb'));
$('btn-zg-slub').addEventListener('click', () => aktywujTrybZgloszenia('slub'));
$('btn-zg-inne').addEventListener('click', () => aktywujTrybZgloszenia('inne'));
$('btn-zg-anuluj').addEventListener('click', () => {
    trybZgloszenia = null;
    $('tryb-specjalny-nieaktywny').classList.remove('hidden');
    $('tryb-specjalny-aktywny').classList.add('hidden');
});

function aktywujTrybZgloszenia(typ) {
    trybZgloszenia = typ;
    $('tryb-specjalny-nieaktywny').classList.add('hidden');
    $('tryb-specjalny-aktywny').classList.remove('hidden');
    odswiezTekstyEkranu();
    skanerInput.focus();
}

// ---- Utrzymuj focus na ukrytym inpucie (skaner USB musi trafiać w pole) ----
// v2.15.01: okno „Kontakt z Adminem” (js/kontakt.js) musi móc przejąć fokus — inaczej skaner odbierałby każdy znak z klawiatury
function kontaktOknoOtwarte() { const o = document.getElementById('kontakt-okno'); return !!o && !o.classList.contains('hidden'); }
function przywrocFocus() {
    if (ekranCzekanie.classList.contains('hidden')) return;
    if (kontaktOknoOtwarte()) return;
    skanerInput.focus();
}
setInterval(() => {
    przywrocFocus();
    // Język wybrany przez ministranta wraca do domyślnego, jeśli nikt nic nie robi
    if (!ekranCzekanie.classList.contains('hidden') && jezykBiezacy !== jezykDomyslnyKiosku() && Date.now() - czasZmianyJezyka > 60000) {
        ustawJezyk(jezykDomyslnyKiosku(), { zapisz: false });
    }
}, 500);
document.addEventListener('click', (e) => { if (!e.target.closest('input, select, textarea')) przywrocFocus(); });

function resetDoCzekania() {
    clearTimeout(wynikTimer);
    biezacyKod = null;
    biezacyProfil = null;
    pinBufor = '';
    aktywneWydarzenie = null;
    rolaAwaryjna = null;
    trybZgloszenia = null;
    biezacaPlakietka = null;
    pinInfoTryb = null;
    przyciskResetTryb = 'reset';
    biezacyKomunikat = null;
    odswiezPinKropki();
    skanerInput.value = '';
    $('btn-ok').classList.remove('hidden');
    $('btn-tryb-admin').classList.add('hidden');
    $('btn-tryb-moderator').classList.add('hidden');
    $('tryb-specjalny-nieaktywny').classList.remove('hidden');
    $('tryb-specjalny-aktywny').classList.add('hidden');
    // Każda kolejna osoba zaczyna w domyślnym języku Kiosku
    if (jezykBiezacy !== jezykDomyslnyKiosku()) ustawJezyk(jezykDomyslnyKiosku(), { zapisz: false });
    pokazEkran(ekranCzekanie);
    odswiezTekstyEkranu();
    setTimeout(() => { if (!kontaktOknoOtwarte()) skanerInput.focus(); }, 50);
    if (oczekujeNaAktualizacje && czyBezpiecznyMomentNaAktualizacje()) wykonajBezpiecznaAktualizacje();
}

// ============================================================================
// 1. SKAN
// ============================================================================
skanerInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const kodPlakietki = skanerInput.value.trim();
        skanerInput.value = '';
        if (kodPlakietki.length === 0) return;
        await obslugaZeskanowanegoKodu(kodPlakietki);
    }
});

function pokazEkranPinDlaWpisu(imie, nazwisko, kod) {
    $('pin-imie').textContent = `${imie} ${nazwisko}`;
    $('pin-kod').textContent = kod;
    pinBufor = '';
    odswiezPinKropki();
    pokazEkran(ekranPin);
}

async function obslugaZeskanowanegoKodu(kodPlakietki) {
    if (jestOffline) {
        // --- OFFLINE: rozpoznanie wyłącznie z lokalnego cache ---
        const szukaj = offlineSzukajPlakietki(kodPlakietki);
        if (!szukaj.sukces) { pokazKomunikatWyniku(false, szukaj.msg); return; }
        const wpis = szukaj.wpis;
        biezacyKod = wpis.ministrant_kod;
        biezacyProfil = wpis;
        biezacaPlakietka = kodPlakietki;

        // v2.3: tryb „token_bez_pin” (włączony przez Admina dla tego Kiosku) — zwykły ministrant bez ekranu PIN
        if (offlineTrybToken(wpis) && !trybZgloszenia) { pinBufor = ''; await zapiszOffline({ rodzaj: 'obecnosc' }); return; }

        // Offline NIGDY nie daje wejścia do panelu Admina/Księdza (brak wiarygodnej, bieżącej weryfikacji roli)
        $('btn-tryb-admin').classList.add('hidden');
        $('btn-tryb-moderator').classList.add('hidden');
        $('btn-ok').classList.remove('hidden');
        przyciskResetTryb = trybZgloszenia ? 'cancel' : 'reset';
        pinInfoTryb = trybZgloszenia ? 'offline_report' : 'offline';
        pokazEkranPinDlaWpisu(wpis.imie, wpis.nazwisko, wpis.ministrant_kod);
        odswiezTekstyEkranu();
        return;
    }

    // --- ONLINE ---
    const wynik = await wywolajRPC('pobierz_po_kodzie', { p_kod: kodPlakietki });
    if (wynik.siec) {
        // Internet zniknął dokładnie teraz — przełącz na offline i spróbuj z cache
        ustawStanPolaczenia(false);
        setTimeout(async () => ustawStanPolaczenia(await sprawdzPolaczenie()), 5000);
        const cache = wczytajCacheOffline();
        if (cache && czasCache(cache)) return obslugaZeskanowanegoKodu(kodPlakietki);
        pokazKomunikatWyniku(false, () => t('k.e_net_no_cache'));
        return;
    }
    if (!wynik.sukces) {
        zapiszSkanPlakietki(kodPlakietki, /uniewa|nieaktyw/i.test(wynik.blad || '') ? 'revoked' : 'unknown');
        pokazKomunikatWyniku(false, () => bladT(wynik) || t('e.unknown_qr'));
        return;
    }
    zapiszSkanPlakietki(kodPlakietki, 'ok');

    // Od tej chwili do weryfikacji PIN-u używamy KODU LOGOWANIA ministranta (wynik.kod), nie kodu plakietki
    biezacyKod = wynik.kod;
    biezacyProfil = wynik;
    biezacaPlakietka = kodPlakietki;

    if (trybZgloszenia) {
        $('btn-tryb-admin').classList.add('hidden');
        $('btn-tryb-moderator').classList.add('hidden');
        $('btn-ok').classList.remove('hidden');   // v2.10.01: „Zatwierdź” zawsze widoczny (zgłoszenie specjalne też go potrzebuje)
        przyciskResetTryb = 'cancel';
        pinInfoTryb = 'report';
    } else {
        const rolaSpecjalna = wynik.is_admin || wynik.is_moderator;
        $('btn-tryb-admin').classList.toggle('hidden', !wynik.is_admin);
        $('btn-tryb-moderator').classList.toggle('hidden', !wynik.is_moderator);
        // v2.10.01: „Zatwierdź” widoczny także dla Admina i Księdza — oni też zbierają punkty (przyciski roli obok służą do wejścia do panelu)
        $('btn-ok').classList.remove('hidden');
        przyciskResetTryb = rolaSpecjalna ? 'logout' : 'reset';
        pinInfoTryb = null;
    }
    pokazEkranPinDlaWpisu(wynik.imie, wynik.nazwisko, wynik.kod);
    odswiezTekstyEkranu();
}

// ============================================================================
// 2. KLAWIATURA PIN
// ============================================================================
document.querySelectorAll('.numpad button[data-n]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (pinBufor.length >= 4) return;
        pinBufor += btn.dataset.n;
        odswiezPinKropki();
        if (pinBufor.length === 4) {
            if (!AUTO_ZATWIERDZ_PIN) return;     // v2.10: czekamy na przycisk „Zatwierdź”
            if (trybZgloszenia) { setTimeout(() => (jestOffline ? zapiszOffline({ rodzaj: 'zgloszenie' }) : wyslijZgloszenieSpecjalne()), 150); return; }
            if (jestOffline) { setTimeout(() => zapiszOffline({ rodzaj: 'obecnosc' }), 150); return; }
            const rolaSpecjalna = biezacyProfil && (biezacyProfil.is_admin || biezacyProfil.is_moderator);
            // Admin/Ksiądz: czekamy na jawne kliknięcie przycisku roli, nie zapisujemy obecności automatycznie
            if (!rolaSpecjalna) setTimeout(() => zatwierdzPin(null), 150);
        }
    });
});
$('btn-wyczysc').addEventListener('click', () => {
    pinBufor = pinBufor.slice(0, -1);
    odswiezPinKropki();
});
$('btn-ok').addEventListener('click', () => {
    if (pinBufor.length !== 4) return;       // v2.10: „Zatwierdź” działa dopiero po wpisaniu 4 cyfr
    if (jestOffline) { zapiszOffline({ rodzaj: trybZgloszenia ? 'zgloszenie' : 'obecnosc' }); return; }
    if (trybZgloszenia) { wyslijZgloszenieSpecjalne(); return; }   // zgłoszenie specjalne (pogrzeb / ślub / inne) — bez wyboru mszy
    zatwierdzPin(null);
});
$('btn-tryb-admin').addEventListener('click', () => zatwierdzPin('admin'));
$('btn-tryb-moderator').addEventListener('click', () => zatwierdzPin('moderator'));
$('btn-to-nie-ja').addEventListener('click', resetDoCzekania);
$('btn-to-nie-ja-2').addEventListener('click', resetDoCzekania);
$('btn-to-nie-ja-3').addEventListener('click', resetDoCzekania);

function odswiezPinKropki() {
    const dlugosc = pinBufor.length;
    document.querySelectorAll('#pin-kropki .pin-dot').forEach((k, i) => k.classList.toggle('filled', i < dlugosc));
}

// ============================================================================
// ZAPIS OFFLINE (v2.3) — BEZ lokalnej weryfikacji PIN-u (cache nie ma pin_hash). Kolejka zaszyfrowana; PIN sprawdza serwer.
// Używane zarówno, gdy Kiosk JEST offline, jak i gdy internet zniknął w trakcie operacji online.
// Punktów nigdy nie pokazujemy offline — przyznaje je wyłącznie serwer po synchronizacji.
// ============================================================================
async function zapiszOffline({ rodzaj, wybor, utrataSieci }) {
    if (hamulecAktywny()) return;
    const szukaj = offlineSzukajPlakietki(biezacaPlakietka);
    if (!szukaj.sukces) {
        pokazKomunikatWyniku(false, (utrataSieci && szukaj.brakCache) ? () => t('k.e_net_no_cache') : szukaj.msg);
        return;
    }
    // Konta Admina/Księdza: ich PIN nie trafi do kolejki, a bez PIN-u offline ich nie autoryzujemy.
    if (szukaj.wpis.uprzywilejowany) { pokazKomunikatWyniku(false, () => t('k.e_priv_offline')); return; }
    const imie = szukaj.wpis.imie;
    const tokenTryb = offlineTrybToken(szukaj.wpis) && rodzaj !== 'zgloszenie';
    const odrzucenie = (zapisano) => {
        if (zapisano === true) return false;
        pokazKomunikatWyniku(false, () => t(zapisano === 'duplikat' ? 'k.e_already_queued' : 'k.e_queue_store'));
        return true;
    };

    if (rodzaj === 'zgloszenie') {
        const typ = trybZgloszenia;
        // PIN weryfikuje SERWER przy synchronizacji; do tego czasu leży wyłącznie zaszyfrowany w kolejce
        if (odrzucenie(await dodajDoKolejkiOffline('zgloszenie', { p_kod: biezacyKod, p_pin: pinBufor, p_typ: typ, p_kod_plakietki: biezacaPlakietka }))) return;
        trybZgloszenia = null;
        pokazKomunikatWyniku('offline', () => utrataSieci ? t('k.net_lost_saved') : t('k.offline_report_saved', { typ: t('k.type.' + typ) }));
        return;
    }

    // Wydarzenie: znane z serwera (utrata sieci w trakcie) albo z cache offline
    const wydarzenie = aktywneWydarzenie || offlineAktywneWydarzenie();
    if (!wydarzenie) { pokazKomunikatWyniku(false, () => t('k.e_no_event_off')); return; }
    aktywneWydarzenie = wydarzenie;

    if (wydarzenie.polaczone_id && !wybor) { pokazEkran(ekranBlok); return; }

    const zapisano = tokenTryb
        ? await dodajDoKolejkiOffline('obecnosc_token', { p_kod: biezacyKod, p_wydarzenie_id: wydarzenie.id, p_wybor: wybor || 'auto', p_kiedy_klient: new Date().toISOString() })
        : await dodajDoKolejkiOffline('obecnosc', { p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: wydarzenie.id, p_wybor: wybor || 'auto' });
    if (odrzucenie(zapisano)) return;
    pokazKomunikatWyniku('offline', () => utrataSieci ? t('k.net_lost_saved') : t(tokenTryb ? 'k.offline_saved_nopin' : 'k.offline_saved_pin_later', { imie }));
}

// ============================================================================
// ONLINE: zapis obecności / zgłoszenia / logowanie ról
// ============================================================================
async function wyslijZgloszenieSpecjalne() {
    if (hamulecAktywny()) return;
    const typ = trybZgloszenia;
    const wynik = await wywolajRPC('zglos_obecnosc_specjalna', { p_kod: biezacyKod, p_pin: pinBufor, p_typ: typ, p_kod_plakietki: biezacaPlakietka });
    if (wynik.siec) {
        ustawStanPolaczenia(false);
        zapiszOffline({ rodzaj: 'zgloszenie', utrataSieci: true });
        return;
    }
    if (wynik.sukces) pokazKomunikatWyniku(true, () => t('k.report_sent', { typ: t('k.type.' + typ) }));
    else { if (/Nieprawidłowy PIN/i.test(wynik.blad || '')) zarejestrujBlednyPin(biezacyKod); pokazKomunikatWyniku(false, () => bladT(wynik)); }
    trybZgloszenia = null;
}

async function zatwierdzPin(rolaDoZalogowania) {
    if (pinBufor.length !== 4) return;
    if (hamulecAktywny()) return;

    // Logowanie rolą jest jednoetapowe (plakietka → PIN → „Zaloguj się jako…”)
    if (rolaDoZalogowania) {
        const wynik = await wywolajRPC('zaloguj', { p_kod: biezacyKod, p_pin: pinBufor, p_zrodlo: 'kiosk' });
        if (wynik.siec) { pokazKomunikatWyniku(false, () => t('e.network')); return; }
        const rolaOk = (rolaDoZalogowania === 'admin' && wynik.is_admin) || (rolaDoZalogowania === 'moderator' && wynik.is_moderator);
        if (!wynik.sukces || !rolaOk) {
            if (!wynik.sukces && /Nieprawidłowy PIN/i.test(wynik.blad || '')) zarejestrujBlednyPin(biezacyKod);
            pokazKomunikatWyniku(false, () => (wynik.sukces ? t('e.wrong_pin') : bladT(wynik)));
            return;
        }
        rolaAwaryjna = rolaDoZalogowania;
        await wejdzWTrybAwaryjny();
        return;
    }

    // Aktywne wydarzenie z otwartym oknem. Błąd SIECI to nie „brak wydarzenia” — wtedy przechodzimy na offline.
    const kontroler = new AbortController();
    const limit = setTimeout(() => kontroler.abort(), 8000);
    let kalendarz = null, error = null;
    try {
        ({ data: kalendarz, error } = await supabaseClient.from('kalendarz').select('*').eq('okno_aktywne', true).abortSignal(kontroler.signal));
    } catch (e) { error = { message: String(e), code: '' }; }
    clearTimeout(limit);

    if (error) {
        if (bladJestSieciowy(error)) {
            ustawStanPolaczenia(false);
            zapiszOffline({ rodzaj: 'obecnosc', utrataSieci: true });
        } else {
            pokazKomunikatWyniku(false, () => t('e.server'));
        }
        return;
    }
    if (!kalendarz || kalendarz.length === 0) { pokazKomunikatWyniku(false, () => t('e.no_event')); return; }

    // v2.10: po „Zatwierdź” pokazujemy listę wydarzeń z otwartym oknem — osoba klika swoją mszę
    if (WYBOR_WYDARZENIA_NA_EKRANIE) { pokazWyborWydarzenia(kalendarz); return; }

    aktywneWydarzenie = kalendarz[0];
    if (aktywneWydarzenie.polaczone_id) { pokazEkran(ekranBlok); return; }

    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', { p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: 'auto' });
    obsluzWynikZapisu(wynikZapisu);
}

// Lista wydarzeń do wyboru. Msza połączona z nabożeństwem → po kliknięciu pytamy: tylko msza / tylko nabożeństwo / oba.
function pokazWyborWydarzenia(lista) {
    const kont = $('wybor-wydarzen-lista');
    kont.innerHTML = '';
    lista.forEach(w => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        let godz = '';
        try { godz = new Date(w.data_wydarzenia).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { /* brak godziny */ }
        const nazwa = document.createElement('span');
        nazwa.textContent = (w.polaczone_id ? '⛪🙏 ' : '⛪ ') + (w.nazwa || '');
        b.appendChild(nazwa);
        const male = document.createElement('small');
        male.textContent = [godz, w.polaczone_id ? t('k.event_combined') : ''].filter(Boolean).join(' · ');
        if (male.textContent) b.appendChild(male);
        b.addEventListener('click', () => wybierzWydarzenie(w));
        kont.appendChild(b);
    });
    pokazEkran(ekranWybor);
}

async function wybierzWydarzenie(w) {
    if (hamulecAktywny()) return;
    aktywneWydarzenie = w;
    if (w.polaczone_id) { pokazEkran(ekranBlok); return; }     // wybór: tylko msza / tylko nabożeństwo / oba
    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', { p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: w.id, p_wybor: 'auto' });
    obsluzWynikZapisu(wynikZapisu);
}

// Etap 2 logowania do trybu awaryjnego: PIN (już wpisany) + stały kod 3-cyfrowy
// --- 3. Blok połączony ---
$('btn-tylko-nabozenstwo').addEventListener('click', () => zapiszBlok('tylko_nabozenstwo'));
$('btn-tylko-msza').addEventListener('click', () => zapiszBlok('tylko_msza'));
$('btn-oba').addEventListener('click', () => zapiszBlok('oba'));

async function zapiszBlok(wybor) {
    if (jestOffline) { zapiszOffline({ rodzaj: 'obecnosc', wybor }); return; }
    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', { p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: wybor });
    obsluzWynikZapisu(wynikZapisu, wybor);
}

function obsluzWynikZapisu(wynik, wybor) {
    if (wynik.siec) {
        ustawStanPolaczenia(false);
        zapiszOffline({ rodzaj: 'obecnosc', wybor, utrataSieci: true });
        return;
    }
    if (wynik.sukces) pokazKomunikatWyniku(true, () => t('k.ok_scored', { imie: wynik.imie, pkt: wynik.punkty_przyznane }));
    else { if (/Nieprawidłowy PIN/i.test(wynik.blad || '')) zarejestrujBlednyPin(biezacyKod); pokazKomunikatWyniku(false, () => bladT(wynik)); }
}
$('btn-dalej').addEventListener('click', resetDoCzekania);

// ============================================================================
// 4. KOLEJKA — ekran dostępny z ekranu oczekiwania (dla każdego)
// ============================================================================
function otworzKolejke() {
    if (ekranCzekanie.classList.contains('hidden')) return; // nie przerywamy trwającej operacji
    $('kolejka-sync-status').textContent = '';
    odswiezTabeleKolejki();
    pokazEkran(ekranKolejka);
}
$('btn-kolejka').addEventListener('click', otworzKolejke);
$('kiosk-status').addEventListener('click', otworzKolejke);
$('btn-kolejka-wstecz').addEventListener('click', resetDoCzekania);

async function synchronizujZKomunikatem(statusEl) {
    statusEl.style.color = '';
    statusEl.textContent = '⏳ ' + t('k.q_syncing');
    const wynik = await probojSynchronizacje();
    statusEl.style.color = wynik.polaczenie ? 'var(--ok)' : 'var(--err)';
    statusEl.textContent = wynik.polaczenie ? '✅ ' + t('k.st_online') : '❌ ' + t('k.q_no_net');
    odswiezTekstyEkranu();
}
$('btn-kolejka-sync').addEventListener('click', () => synchronizujZKomunikatem($('kolejka-sync-status')));
$('btn-synchronizuj-teraz').addEventListener('click', () => synchronizujZKomunikatem($('wyczysc-status')));

// ============================================================================
// 5. PANEL AWARYJNY ADMINA / KSIĘDZA
// ============================================================================
async function wejdzWTrybAwaryjny() {
    pokazEkran(ekranAdminAwaryjny);
    const czyAdmin = rolaAwaryjna === 'admin';
    document.querySelectorAll('.tylko-admin-awaryjny').forEach(el => el.classList.toggle('hidden', !czyAdmin));
    odswiezTekstyEkranu();
    await odswiezPanelAwaryjnyTresc();
}

async function odswiezPanelAwaryjnyTresc() {
    const { data: kalendarz } = await supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(20);
    const wybrane = $('awaryjny-wydarzenie').value;
    $('awaryjny-wydarzenie').innerHTML = (kalendarz || []).map(w =>
        `<option value="${esc(w.id)}">${esc(w.nazwa)} (${esc(formatDataCzas(w.data_wydarzenia))})</option>`).join('');
    if (wybrane) $('awaryjny-wydarzenie').value = wybrane;
    await odswiezOstatnieObecnosci();
}

async function odswiezOstatnieObecnosci() {
    const wynik = await wywolajRPC('admin_ostatnie_obecnosci', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_limit: 20 });
    const tbody = $('tabela-ostatnie-obecnosci');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="5">❌ ${esc(bladT(wynik))}</td></tr>`; return; }
    tbody.innerHTML = (wynik.dane || []).map(o => `
        <tr>
            <td>${esc(formatGodzina(o.data_zapisu))}</td>
            <td>${esc(o.imie)} ${esc(o.nazwisko)} (${esc(o.kod)})</td>
            <td>${esc(o.wydarzenie)}</td>
            <td>+${esc(o.punkty)}</td>
            <td><button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-cofnij="${esc(o.id)}">${esc(t('k.undo'))}</button></td>
        </tr>`).join('') || `<tr><td colspan="5">${esc(t('k.r_none'))}</td></tr>`;
}

$('tabela-ostatnie-obecnosci').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-cofnij]');
    if (!btn) return;
    const wynik = await wywolajRPC('admin_cofnij_obecnosc', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_obecnosc_id: btn.dataset.cofnij });
    $('awaryjny-status').textContent = wynik.sukces ? '✅ ' + t('k.undone') : ('❌ ' + bladT(wynik));
    await odswiezOstatnieObecnosci();
});

$('awaryjny-rodzaj').addEventListener('change', () => {
    const zgl = $('awaryjny-rodzaj').value === 'zgloszenie';
    $('awaryjny-wydarzenie').classList.toggle('hidden', zgl);
    $('awaryjny-typ-zgloszenia').classList.toggle('hidden', !zgl);
});

$('btn-awaryjny-zapisz').addEventListener('click', async () => {
    const kodDocelowy = $('awaryjny-kod').value.trim();
    const wydarzenieId = $('awaryjny-wydarzenie').value;
    const rodzaj = $('awaryjny-rodzaj').value;
    const punkty = parsujPunkty($('awaryjny-punkty').value);   // v2.12.01: połówki (krok 0,5)
    const statusEl = $('awaryjny-status');
    if (!kodDocelowy || (rodzaj === 'msza' && !wydarzenieId)) { statusEl.textContent = t('k.manual_need'); return; }
    if (isNaN(punkty) || punkty < 0 || punkty > 100) { statusEl.textContent = t('man.need_points'); return; }
    // Szukamy po KODZIE LOGOWANIA (np. MIN-007) w widoku rankingu — nie przez pobierz_po_kodzie (to kod PLAKIETKI)
    const { data: wpis } = await supabaseClient.from('ranking_miesiac').select('ministrant_id').eq('kod', kodDocelowy).maybeSingle();
    if (!wpis) { statusEl.textContent = t('k.manual_notfound'); return; }

    // v2.8: Admin i Ksiądz dodają obecność na mszy ALBO obecność specjalną (zgłoszenie) — sql/20
    let wynik = await wywolajRPC('admin_dodaj_obecnosc_reczna', {
        p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_ministrant_id: wpis.ministrant_id, p_rodzaj: rodzaj,
        p_wydarzenie_id: rodzaj === 'msza' ? wydarzenieId : null, p_punkty: punkty, p_zaliczone_jako: 'zbiorka',
        p_typ_zgloszenia: $('awaryjny-typ-zgloszenia').value, p_powod: 'Kiosk — ręcznie'
    });
    // zapas: serwer bez sql/20 → dotychczasowa korekta (tylko msza, 1 punkt)
    if (!wynik.sukces && (wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883')) {
        if (rodzaj !== 'msza') { statusEl.textContent = '❌ ' + t('man.need_sql'); return; }
        wynik = await wywolajRPC('korekta_obecnosci', {
            p_kod: biezacyKod, p_pin: pinBufor, p_ministrant_id: wpis.ministrant_id,
            p_wydarzenie_id: wydarzenieId, p_punkty: 1, p_zaliczone_jako: 'zbiorka'
        });
    }
    statusEl.textContent = wynik.sukces ? '✅ ' + t('k.manual_saved') : ('❌ ' + bladT(wynik));
    if (wynik.sukces) { $('awaryjny-kod').value = ''; await odswiezOstatnieObecnosci(); }
});

$('btn-odblokuj-kiosk').addEventListener('click', async () => {
    const kod = $('odblokuj-kiosk-input').value.trim();
    const statusEl = $('odblokuj-kiosk-status');
    if (!kod) return;
    const wynik = await wywolajRPCZAudytem('admin_odblokuj_pin_v2', 'admin_odblokuj_kod', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_kod_do_odblokowania: kod });
    if (wynik.sukces) offlineWyczyscBlokade(kod); // ta sama osoba nie zostaje zablokowana lokalnie (offline)
    statusEl.textContent = wynik.sukces ? ('✅ ' + (wynik.informacja || t('k.unlocked'))) : ('❌ ' + bladT(wynik));
    $('odblokuj-kiosk-input').value = '';
});

$('btn-wyjdz-admin').addEventListener('click', resetDoCzekania);

// --- Pobranie danych offline (Admin) + jednorazowa autoryzacja urządzenia do odświeżania w tle ---
$('btn-pobierz-offline').addEventListener('click', async () => {
    if (rolaAwaryjna !== 'admin') return;
    const statusEl = $('offline-pobierz-status');
    statusEl.style.color = '';
    statusEl.textContent = t('k.off_pulling');
    const wynik = await wywolajRPC('pobierz_cache_offline', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor }, { timeoutMs: 20000 });
    if (!wynik.sukces) {
        statusEl.style.color = 'var(--err)';
        statusEl.textContent = '❌ ' + (wynik.siec ? t('k.off_pull_fail') : bladT(wynik));
        return;
    }
    zapiszCacheOffline(wynik);
    statusEl.style.color = 'var(--ok)';
    statusEl.textContent = '✅ ' + t('k.off_pulled', { n: (wynik.plakietki || []).length });

    // Token urządzenia: dzięki niemu Kiosk sam odświeża dane w tle, bez PIN-u Admina
    const aut = await wywolajRPC('admin_autoryzuj_kiosk', { p_kod: biezacyKod, p_pin: pinBufor, p_kiosk_id: ID_KIOSKU });
    if (aut.sukces && aut.token) {
        localStorage.setItem(KLUCZ_TOKEN_KIOSKU, aut.token);
        ustawAutoStan('on');
    } else if (aut.kod_pg === 'PGRST202' || aut.kod_pg === '42883') {
        ustawAutoStan('niedostepne');
    } else {
        ustawAutoStan(localStorage.getItem(KLUCZ_TOKEN_KIOSKU) ? 'on' : 'off');
    }
});

// --- Audyt retencji (przedłużenia / usunięcia) — lokalnie w magazynie, do serwera wysyłany tokenem Kiosku ---
async function wyslijAudytRetencji() {
    const token = localStorage.getItem(KLUCZ_TOKEN_KIOSKU);
    if (!token) return;
    const wpisy = await magazyn.audytDoWyslania();
    if (wpisy.length === 0) return;
    const w = await wywolajRPC('kiosk_audyt_retencji', { p_kiosk_id: ID_KIOSKU, p_token: token, p_wpisy: wpisy });
    if (w.sukces) for (const e of wpisy) await magazyn.audytPotwierdz(e.aid);
}
async function przedluzPrzeterminowane(godziny) {
    if (rolaAwaryjna !== 'admin') return;
    const statusEl = $('wyczysc-status'); statusEl.style.color = '';
    const lista = kolejkaPamiec.filter(z => z.status === ST_PRZET);
    if (lista.length === 0) { statusEl.textContent = t('k.nothing_to_clear'); return; }
    if (!confirm(t('k.extend_confirm', { n: lista.length, h: godziny }))) return;
    try {
        for (const z of lista) await magazyn.przedluz(z.id, godziny, biezacyKod, ID_KIOSKU);
        kolejkaPamiec = await magazyn.wczytajKolejke();
        await wyslijAudytRetencji().catch(() => {});   // brak sieci: wpis audytu zostaje lokalnie i poleci przy następnej synchronizacji
        statusEl.style.color = 'var(--ok)'; statusEl.textContent = '✅ ' + t('k.extended', { n: lista.length, h: godziny });
        odswiezTekstyEkranu();
    } catch (e) { statusEl.style.color = 'var(--err)'; statusEl.textContent = '❌ ' + (e && e.message); }
}
$('btn-przedluz-24h').addEventListener('click', () => przedluzPrzeterminowane(24));
$('btn-przedluz-7d').addEventListener('click', () => przedluzPrzeterminowane(24 * 7));

// --- Czyszczenie kolejki — wyłącznie Admin; dotyczy tylko kolejki zapisanej na tym urządzeniu ---
function jestZakonczony(z) { return z.status === ST_OK || z.status === ST_DOAKC || (z.status || '').startsWith('pominięte'); }
function jestUtkniety(z) {
    if (jestZakonczony(z)) return false;
    const stary = Date.now() - new Date(z.kiedy_lokalnie).getTime() > OFFLINE_MAKS_WIEK_MS;
    return (z.status || '').startsWith('błąd') || z.status === ST_PRZET || z.status === ST_USZKODZONE || stary;
}
async function wyczyscKolejke(czyDoUsuniecia, kluczPotwierdzenia) {
    if (rolaAwaryjna !== 'admin') return;
    const statusEl = $('wyczysc-status');
    const kolejka = wczytajKolejkeOffline();
    const n = kolejka.filter(czyDoUsuniecia).length;
    statusEl.style.color = '';
    if (n === 0) { statusEl.textContent = t('k.nothing_to_clear'); return; }
    if (!confirm(t(kluczPotwierdzenia, { n }))) return;
    // Usunięcie niezakończonych wpisów jest NIEODWRACALNE i audytowane (kto, kiedy, który wpis/kiosk).
    for (const z of kolejka.filter(czyDoUsuniecia)) {
        if (jestZakonczony(z)) await magazyn.usunZnacznik(z.id); else await magazyn.usunNieodwracalnie(z.id, biezacyKod, ID_KIOSKU);
    }
    kolejkaPamiec = kolejka.filter(z => !czyDoUsuniecia(z));
    odswiezTekstyEkranu();
    wyslijAudytRetencji().catch(() => {});
    statusEl.style.color = 'var(--ok)';
    statusEl.textContent = '✅ ' + t('k.cleared', { n });
}
$('btn-wyczysc-zakonczone').addEventListener('click', () => wyczyscKolejke(jestZakonczony, 'k.clear_confirm_done'));
$('btn-wyczysc-zablokowane').addEventListener('click', () => wyczyscKolejke(jestUtkniety, 'k.clear_confirm_stuck'));

// ============================================================================
// START
// ============================================================================
wczytajUstawieniaKiosku();   // zapisane lokalnie ustawienia systemowe (działają offline)
inicjujJezyk({ jezyk: jezykDomyslnyKiosku() });
resetDoCzekania();
(async () => {
    try {
        await magazyn.init();
        try { localStorage.removeItem(OFFLINE_KLUCZ_LOKALNE_BLOKADY); } catch (e) { /* ignoruj */ }   // v2.3: lokalne liczniki PIN nie są już potrzebne
        const mig = await magazyn.migrujLegacy(localStorage);   // jawne PIN-y/dane z localStorage → zaszyfrowany IndexedDB
        if (mig.zachowano_localStorage) console.warn('Migracja kolejki: część wpisów zostawiona w localStorage do decyzji Admina.');
        await magazyn.przeterminuj();
        kolejkaPamiec = await magazyn.wczytajKolejke();
        cachePamiec = await magazyn.wczytajCache();
        if (await magazyn.czyRotacjaPotrzebna(30)) await magazyn.rotujKlucz();   // wersjonowana rotacja; stare rekordy przeszyfrowane
        magazynGotowy = true;
    } catch (e) {
        magazynBlad = e; console.error('Bezpieczny magazyn niedostępny:', e && e.name);
        // Bez magazynu NIE wracamy do localStorage z jawnym PIN-em: zapis offline jest odrzucany (dodajDoKolejkiOffline → false).
    }
    odswiezTekstyEkranu();
    const polaczenie = await sprawdzPolaczenie();
    ustawStanPolaczenia(polaczenie);
    if (polaczenie) { probojSynchronizacje(); odswiezCacheWTle(false); pobierzUstawieniaKiosku(); }
})();
setInterval(() => { if (!jestOffline) pobierzUstawieniaKiosku(); }, 30 * 60 * 1000);

// Monitoring: pierwszy ping od razu, potem wyrównanie do siatki :00/:15/:30/:45 i co 15 minut.
wyslijPing();
setTimeout(() => {
    wyslijPing();
    setInterval(wyslijPing, 15 * 60 * 1000);
}, msDoNastepnegoKwadransa());
