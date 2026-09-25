// ============================================================================
// LOGIKA KIOSKU — nasłuchiwanie skanera QR (USB, działa jako klawiatura HID),
// klawiatura PIN, obsługa bloków połączonych, tryb awaryjny Admina/Księdza.
// ============================================================================

const skanerInput = document.getElementById('skaner-input');
const ekranCzekanie = document.getElementById('ekran-czekanie');
const ekranPin = document.getElementById('ekran-pin');
const ekranBlok = document.getElementById('ekran-blok');
const ekranWynik = document.getElementById('ekran-wynik');
const ekranAdminAwaryjny = document.getElementById('ekran-admin-awaryjny');

let biezacyKod = null;      // KOD LOGOWANIA ministranta (np. MIN-001) — NIE kod plakietki z QR!
let biezacyProfil = null;
let pinBufor = '';
let aktywneWydarzenie = null;
let rolaAwaryjna = null;    // 'admin' | 'moderator' | null
let trybZgloszenia = null;  // 'pogrzeb' | 'slub' | 'inne' | null — zgłoszenie specjalne (wymaga zatwierdzenia)
let biezacaPlakietka = null; // kod plakietki użytej przy zgłoszeniu (audyt)

// ============================================================================
// MONITORING KIOSKU — sygnał kontrolny co 15 minut, wyrównany do zegara
// (15:00, 15:15, 15:30...). Wysyłamy WYŁĄCZNIE dane, które przeglądarka
// faktycznie i wiarygodnie udostępnia — żadnych zmyślonych parametrów sieci.
// ============================================================================

const WERSJA_APLIKACJI = 'v2.1.00'; // trzymaj zgodnie z .app-version w HTML

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
    const dane = {
        czas_urzadzenia: new Date().toISOString(),
        online_navigator: navigator.onLine,
        online_zweryfikowane: !jestOffline, // wynik naszego realnego sprawdzenia połączenia (patrz sprawdzPolaczenie)
        user_agent: navigator.userAgent || null,
        jezyk: navigator.language || null,
        rozdzielczosc: (typeof screen !== 'undefined') ? `${screen.width}x${screen.height}` : null,
        karta_widoczna: (typeof document !== 'undefined') ? (document.visibilityState === 'visible') : null,
        // Poniższe API są dostępne tylko w części przeglądarek (głównie Chromium) —
        // jeśli niedostępne, jawnie zostaje null, NIGDY zmyślona wartość.
        siec_typ: (navigator.connection && navigator.connection.type) || null,
        siec_effective_type: (navigator.connection && navigator.connection.effectiveType) || null,
        siec_downlink_mbps: (navigator.connection && typeof navigator.connection.downlink === 'number') ? navigator.connection.downlink : null,
        siec_rtt_ms: (navigator.connection && typeof navigator.connection.rtt === 'number') ? navigator.connection.rtt : null,
        pamiec_gb: (typeof navigator.deviceMemory === 'number') ? navigator.deviceMemory : null,
        rdzenie_cpu: (typeof navigator.hardwareConcurrency === 'number') ? navigator.hardwareConcurrency : null,
        bateria_procent: null,
        bateria_ladowanie: null,
        offline_kolejka_dlugosc: wczytajKolejkeOffline().filter(z => z.status === 'oczekujące').length
    };

    // Battery Status API — asynchroniczne, wycofywane w wielu przeglądarkach,
    // więc opakowane w try/catch: brak wsparcia = po prostu null, nic więcej.
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
    // Ping ma sens tylko jako REALNE potwierdzenie połączenia — próbujemy go
    // wysłać niezależnie od stanu jestOffline (mogliśmy właśnie odzyskać sieć
    // między sprawdzeniami), ale nigdy nie udajemy, że dotarł, jeśli RPC się nie powiedzie.
    try {
        await wywolajRPC('kiosk_ping', {
            p_kiosk_id: ID_KIOSKU,
            p_nazwa: null,
            p_wersja: WERSJA_APLIKACJI,
            p_dane: dane
        });
    } catch (e) { /* brak sieci — po prostu nie dotarł, spróbujemy przy następnym cyklu */ }
}

function msDoNastepnegoKwadransa() {
    const teraz = new Date();
    const minuty = teraz.getMinutes();
    const doNastepnego = 15 - (minuty % 15 === 0 ? 0 : minuty % 15);
    const docelowy = new Date(teraz);
    docelowy.setSeconds(0, 0);
    docelowy.setMinutes(minuty + (minuty % 15 === 0 ? 15 : doNastepnego));
    return Math.max(1000, docelowy.getTime() - teraz.getTime());
}
// Uwaga: faktyczne uruchomienie harmonogramu pingów (wyslijPing() + setInterval)
// znajduje się na samym końcu pliku, w sekcji "Start" — dopiero tam wszystkie
// zmienne trybu offline (jestOffline, wczytajKolejkeOffline) są już zainicjowane.

// ============================================================================
// TRYB OFFLINE — Kiosk musi działać bez internetu, korzystając z ostatnio
// pobranych i zweryfikowanych danych (patrz sql/13_dodatki11.sql).
// Zasada nadrzędna: NIC nie jest oznaczane jako "zsynchronizowane", jeśli
// serwer faktycznie nie potwierdził tego realną odpowiedzią sieciową.
// ============================================================================

const OFFLINE_KLUCZ_DANE = 'em_offline_dane';
const OFFLINE_KLUCZ_KOLEJKA = 'em_offline_kolejka';
const OFFLINE_KLUCZ_LOKALNE_BLOKADY = 'em_offline_blokady';
const OFFLINE_MAKS_WIEK_MS = 24 * 60 * 60 * 1000; // dane starsze niż 24h uznajemy za zbyt nieaktualne do autoryzacji
const OFFLINE_MAX_PROB_LOKALNIE = 3;
const OFFLINE_BLOKADA_MS = 15 * 60 * 1000;

let jestOffline = false;

function wczytajCacheOffline() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KLUCZ_DANE)) || null; }
    catch (e) { return null; }
}
function zapiszCacheOffline(dane) {
    localStorage.setItem(OFFLINE_KLUCZ_DANE, JSON.stringify(dane));
}
function wczytajKolejkeOffline() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KLUCZ_KOLEJKA)) || []; }
    catch (e) { return []; }
}
function zapiszKolejkeOffline(kolejka) {
    localStorage.setItem(OFFLINE_KLUCZ_KOLEJKA, JSON.stringify(kolejka));
    aktualizujBanerOffline();
}
function wczytajLokalneBlokady() {
    try { return JSON.parse(localStorage.getItem(OFFLINE_KLUCZ_LOKALNE_BLOKADY)) || {}; }
    catch (e) { return {}; }
}
function zapiszLokalneBlokady(obj) {
    localStorage.setItem(OFFLINE_KLUCZ_LOKALNE_BLOKADY, JSON.stringify(obj));
}

// Realne sprawdzenie łączności — nie ufamy samemu navigator.onLine (np. tablet
// może być podłączony do sieci lokalnej bez faktycznego dostępu do internetu).
async function sprawdzPolaczenie() {
    try {
        const kontroler = new AbortController();
        const limit = setTimeout(() => kontroler.abort(), 4000);
        const { error } = await supabaseClient.from('kalendarz').select('id').limit(1);
        clearTimeout(limit);
        return !error;
    } catch (e) {
        return false;
    }
}

function aktualizujBanerOffline() {
    const baner = document.getElementById('offline-baner');
    const kolejka = wczytajKolejkeOffline().filter(z => z.status === 'oczekujące');
    document.getElementById('offline-licznik-kolejki').textContent = kolejka.length;
    const cache = wczytajCacheOffline();
    document.getElementById('offline-data-cache').textContent = cache ? new Date(cache.pobrano).toLocaleString('pl-PL') : 'brak';
    baner.classList.toggle('hidden', !jestOffline);

    const ostatniaDataEl = document.getElementById('offline-ostatnia-data');
    if (ostatniaDataEl) {
        ostatniaDataEl.textContent = cache ? new Date(cache.pobrano).toLocaleString('pl-PL') : '— brak, nigdy nie pobrano —';
    }
}

function cacheJestSwiezy(cache) {
    if (!cache || !cache.pobrano) return false;
    return (Date.now() - new Date(cache.pobrano).getTime()) < OFFLINE_MAKS_WIEK_MS;
}

// --- Szukanie plakietki w lokalnym cache (offline) ---
function offlineSzukajPlakietki(kodPlakietki) {
    const cache = wczytajCacheOffline();
    if (!cacheJestSwiezy(cache)) return { sukces: false, blad: 'Brak aktualnych danych offline (starsze niż 24h lub nigdy nie pobrane). Poproś Admina o odświeżenie przy najbliższej okazji z internetem.' };
    const wpis = (cache.plakietki || []).find(p => p.kod_plakietki === kodPlakietki);
    if (!wpis) return { sukces: false, blad: 'Nieznany kod QR (offline — brak w ostatnio pobranych danych).' };
    if (!wpis.aktywny) return { sukces: false, blad: 'To konto jest nieaktywne (dane offline).' };
    return { sukces: true, wpis };
}

// --- Lokalna, best-effort blokada po 3 błędnych PIN-ach offline (mirror serwera) ---
function offlineSprawdzBlokade(kod) {
    const blokady = wczytajLokalneBlokady();
    const wpis = blokady[kod];
    if (wpis && wpis.zablokowane_do && wpis.zablokowane_do > Date.now()) {
        return { zablokowany: true, do: wpis.zablokowane_do };
    }
    return { zablokowany: false };
}
function offlineZanotujNieudanaProbe(kod) {
    const blokady = wczytajLokalneBlokady();
    const wpis = blokady[kod] || { proby: 0, zablokowane_do: null };
    if (wpis.zablokowane_do && wpis.zablokowane_do <= Date.now()) { wpis.proby = 0; wpis.zablokowane_do = null; }
    wpis.proby += 1;
    if (wpis.proby >= OFFLINE_MAX_PROB_LOKALNIE) wpis.zablokowane_do = Date.now() + OFFLINE_BLOKADA_MS;
    blokady[kod] = wpis;
    zapiszLokalneBlokady(blokady);
    return wpis;
}
function offlineWyczyscBlokade(kod) {
    const blokady = wczytajLokalneBlokady();
    delete blokady[kod];
    zapiszLokalneBlokady(blokady);
}

function pobierzBcrypt() {
    if (window.bcrypt) return window.bcrypt;
    if (window.dcodeIO && window.dcodeIO.bcrypt) return window.dcodeIO.bcrypt;
    return null;
}

// --- Weryfikacja PIN-u offline (bcrypt w przeglądarce, bez sieci) ---
function offlineWeryfikujPin(wpisPlakietki, pin) {
    const blokada = offlineSprawdzBlokade(wpisPlakietki.ministrant_kod);
    if (blokada.zablokowany) {
        return { sukces: false, blad: `Konto zablokowane (offline) do ${new Date(blokada.do).toLocaleTimeString('pl-PL')}.` };
    }
    const bcrypt = pobierzBcrypt();
    if (!bcrypt) {
        return { sukces: false, blad: 'Biblioteka weryfikująca PIN offline nie została wczytana (brak internetu przy pierwszym ładowaniu strony?).' };
    }
    const ok = bcrypt.compareSync(pin, wpisPlakietki.pin_hash);
    if (!ok) {
        offlineZanotujNieudanaProbe(wpisPlakietki.ministrant_kod);
        return { sukces: false, blad: 'Nieprawidłowy PIN.' };
    }
    offlineWyczyscBlokade(wpisPlakietki.ministrant_kod);
    return { sukces: true };
}

// --- Szukanie aktywnego okna wydarzenia w cache (offline) ---
function offlineAktywneWydarzenie() {
    const cache = wczytajCacheOffline();
    const teraz = Date.now();
    return (cache?.kalendarz || []).find(w => teraz >= new Date(w.okno_start).getTime() && teraz <= new Date(w.okno_koniec).getTime()) || null;
}

// --- Dodanie operacji do kolejki offline ---
function dodajDoKolejkiOffline(rodzaj, payload) {
    const kolejka = wczytajKolejkeOffline();
    kolejka.push({
        id: 'off-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        rodzaj, payload,
        kiedy_lokalnie: new Date().toISOString(),
        status: 'oczekujące',
        proby_synchronizacji: 0,
        ostatni_blad: null
    });
    zapiszKolejkeOffline(kolejka);
}

// --- Synchronizacja kolejki — WYŁĄCZNIE realne wywołania RPC, zero udawania ---
let synchronizacjaWTrakcie = false;
async function probojSynchronizacje() {
    if (synchronizacjaWTrakcie) return;
    const polaczenie = await sprawdzPolaczenie();
    ustawStanPolaczenia(polaczenie);
    if (!polaczenie) return;

    let kolejka = wczytajKolejkeOffline();
    const doWyslania = kolejka.filter(z => z.status === 'oczekujące' && z.proby_synchronizacji < 5);
    if (doWyslania.length === 0) return;

    synchronizacjaWTrakcie = true;
    for (const item of doWyslania) {
        let wynik;
        try {
            if (item.rodzaj === 'obecnosc') {
                wynik = await wywolajRPC('zapisz_obecnosc', item.payload);
            } else if (item.rodzaj === 'zgloszenie') {
                wynik = await wywolajRPC('zglos_obecnosc_specjalna', item.payload);
            } else {
                wynik = { sukces: false, blad: 'Nieznany rodzaj operacji w kolejce.' };
            }
        } catch (e) {
            wynik = { sukces: false, blad: 'Błąd sieci podczas synchronizacji.', siec: true };
        }

        if (wynik.siec) {
            // Sieć padła w trakcie synchronizacji — przerywamy, spróbujemy przy następnej okazji.
            // NIC nie oznaczamy jako zsynchronizowane.
            break;
        }

        if (wynik.sukces) {
            item.status = 'zsynchronizowane';
            item.wynik_serwera = wynik;
        } else if ((wynik.blad || '').includes('już została zaliczona') || (wynik.blad || '').includes('już rozpatrzone')) {
            // Realny konflikt/duplikat wykryty przez unikalny klucz w bazie —
            // bezpiecznie oznaczamy jako pominięte, NIE jako błąd i NIE tworzymy duplikatu.
            item.status = 'pominięte (już istniało na serwerze)';
        } else {
            item.proby_synchronizacji += 1;
            item.ostatni_blad = wynik.blad;
            if (item.proby_synchronizacji >= 5) {
                item.status = 'błąd — wymaga ręcznego sprawdzenia przez Admina';
            }
        }
    }

    // Zachowaj wpisy zakończone sukcesem/pominięciem do wglądu, ale usuń PIN z payloadu
    // (nie trzymajmy dłużej niż to konieczne wpisanego PIN-u w localStorage)
    kolejka = kolejka.map(z => {
        if (z.status !== 'oczekujące' && z.payload && z.payload.p_pin) {
            z.payload = { ...z.payload, p_pin: '••••' };
        }
        return z;
    });

    zapiszKolejkeOffline(kolejka);
    synchronizacjaWTrakcie = false;
    odswiezTabeleKolejki();
}

function ustawStanPolaczenia(polaczenie) {
    const byloOffline = jestOffline;
    jestOffline = !polaczenie;
    aktualizujBanerOffline();
    if (byloOffline && polaczenie) {
        // Właśnie wróciło połączenie — spróbuj zsynchronizować od razu
        probojSynchronizacje();
    }
}

function odswiezTabeleKolejki() {
    const tbody = document.getElementById('tabela-kolejka-offline');
    if (!tbody) return;
    const kolejka = wczytajKolejkeOffline();
    tbody.innerHTML = kolejka.slice().reverse().map(z => `
        <tr>
            <td>${new Date(z.kiedy_lokalnie).toLocaleString('pl-PL')}</td>
            <td>${z.payload?.p_kod || '—'}</td>
            <td>${z.rodzaj}</td>
            <td style="color:${z.status === 'oczekujące' ? 'var(--accent-4)' : (z.status.startsWith('błąd') ? 'var(--err)' : 'var(--ok)')}">${z.status}${z.ostatni_blad ? ` (${z.ostatni_blad})` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="4">Kolejka pusta.</td></tr>';
}

// Sprawdzaj połączenie regularnie i próbuj dosynchronizować w tle
setInterval(async () => {
    const polaczenie = await sprawdzPolaczenie();
    ustawStanPolaczenia(polaczenie);
    if (polaczenie) await sprawdzPolecenieSynchronizacji();
}, 20000);
window.addEventListener('online', () => probojSynchronizacje());
window.addEventListener('offline', () => ustawStanPolaczenia(false));

// --- Odbiór polecenia "Synchronizuj teraz" wysłanego z panelu Admina ---
// Best-effort: działa wyłącznie, gdy Kiosk akurat ma połączenie w momencie
// odpytania (co ~20 sekund) — nic tu nie jest udawane jako natychmiastowy push.
const KLUCZ_OSTATNIE_POLECENIE_SYNC = 'em_ostatnie_polecenie_sync';
async function sprawdzPolecenieSynchronizacji() {
    try {
        const { data, error } = await supabaseClient.rpc('kiosk_sprawdz_polecenie_sync');
        if (error || !data || !data.wymus_sync_o) return;
        const ostatnieZnane = localStorage.getItem(KLUCZ_OSTATNIE_POLECENIE_SYNC);
        if (data.wymus_sync_o !== ostatnieZnane) {
            localStorage.setItem(KLUCZ_OSTATNIE_POLECENIE_SYNC, data.wymus_sync_o);
            await probojSynchronizacje();
            await wyslijPing();
        }
    } catch (e) { /* brak sieci w tej chwili — spróbujemy przy następnym cyklu */ }
}

document.getElementById('btn-pobierz-offline').addEventListener('click', async () => {
    const statusEl = document.getElementById('offline-pobierz-status');
    statusEl.textContent = 'Pobieranie…';
    const wynik = await wywolajRPC('pobierz_cache_offline', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor });
    if (!wynik.sukces) {
        statusEl.textContent = '❌ ' + (wynik.blad || 'Nie udało się pobrać danych — sprawdź internet.');
        return;
    }
    zapiszCacheOffline(wynik);
    statusEl.textContent = `✅ Pobrano dane offline (${(wynik.plakietki || []).length} aktywnych plakietek).`;
    aktualizujBanerOffline();
});

document.getElementById('btn-synchronizuj-teraz').addEventListener('click', async () => {
    await probojSynchronizacje();
});



const NAZWY_ZGLOSZEN = { pogrzeb: '⚱️ Pogrzeb', slub: '💍 Ślub', inne: '📋 Inne' };

document.getElementById('btn-zg-pogrzeb').addEventListener('click', () => aktywujTrybZgloszenia('pogrzeb'));
document.getElementById('btn-zg-slub').addEventListener('click', () => aktywujTrybZgloszenia('slub'));
document.getElementById('btn-zg-inne').addEventListener('click', () => aktywujTrybZgloszenia('inne'));
document.getElementById('btn-zg-anuluj').addEventListener('click', () => {
    trybZgloszenia = null;
    document.getElementById('tryb-specjalny-nieaktywny').classList.remove('hidden');
    document.getElementById('tryb-specjalny-aktywny').classList.add('hidden');
});

function aktywujTrybZgloszenia(typ) {
    trybZgloszenia = typ;
    document.getElementById('tryb-specjalny-nazwa').textContent = NAZWY_ZGLOSZEN[typ];
    document.getElementById('tryb-specjalny-nieaktywny').classList.add('hidden');
    document.getElementById('tryb-specjalny-aktywny').classList.remove('hidden');
    skanerInput.focus();
}

// Utrzymuj focus na ukrytym inpucie, żeby skaner USB zawsze trafiał w pole
function przywrocFocus() {
    if (ekranCzekanie.classList.contains('hidden')) return;
    skanerInput.focus();
}
setInterval(przywrocFocus, 500);
skanerInput.focus();
document.addEventListener('click', przywrocFocus);

function pokazEkran(ekran) {
    [ekranCzekanie, ekranPin, ekranBlok, ekranWynik, ekranAdminAwaryjny].forEach(e => e.classList.add('hidden'));
    ekran.classList.remove('hidden');
}

function resetDoCzekania() {
    biezacyKod = null;
    biezacyProfil = null;
    pinBufor = '';
    aktywneWydarzenie = null;
    rolaAwaryjna = null;
    trybZgloszenia = null;
    biezacaPlakietka = null;
    odswiezPinKropki();
    skanerInput.value = '';
    // Przywróć domyślny stan ekranu PIN na potrzeby kolejnego skanu
    document.getElementById('btn-ok').classList.remove('hidden');
    document.getElementById('btn-to-nie-ja').textContent = 'To nie ja — reset';
    document.getElementById('btn-tryb-admin').classList.add('hidden');
    document.getElementById('btn-tryb-moderator').classList.add('hidden');
    document.getElementById('pin-tryb-specjalny-info').classList.add('hidden');
    document.getElementById('tryb-specjalny-nieaktywny').classList.remove('hidden');
    document.getElementById('tryb-specjalny-aktywny').classList.add('hidden');
    pokazEkran(ekranCzekanie);
    setTimeout(() => skanerInput.focus(), 50);
}

// --- 1. Nasłuchiwanie skanera (skaner "wpisuje" kod plakietki i wysyła Enter) ---
skanerInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const kodPlakietki = skanerInput.value.trim();
        skanerInput.value = '';
        if (kodPlakietki.length === 0) return;
        await obslugaZeskanowanegoKodu(kodPlakietki);
    }
});

async function obslugaZeskanowanegoKodu(kodPlakietki) {
    const infoEl = document.getElementById('pin-tryb-specjalny-info');

    if (jestOffline) {
        // --- TRYB OFFLINE: rozpoznanie WYŁĄCZNIE z lokalnego cache, zero zapytań sieciowych ---
        const wynikOffline = offlineSzukajPlakietki(kodPlakietki);
        if (!wynikOffline.sukces) {
            pokazKomunikatWyniku(false, wynikOffline.blad);
            return;
        }
        const wpis = wynikOffline.wpis;
        biezacyKod = wpis.ministrant_kod;
        biezacyProfil = wpis;
        biezacaPlakietka = kodPlakietki;
        document.getElementById('pin-imie').textContent = `${wpis.imie} ${wpis.nazwisko}`;
        document.getElementById('pin-kod').textContent = wpis.ministrant_kod;

        // Offline NIGDY nie daje wejścia w panel Admina/Księdza (brak wiarygodnej,
        // bieżącej weryfikacji roli/blokad) — tylko zwykłe zaliczenie lub zgłoszenie.
        document.getElementById('btn-tryb-admin').classList.add('hidden');
        document.getElementById('btn-tryb-moderator').classList.add('hidden');
        document.getElementById('btn-ok').classList.remove('hidden');
        document.getElementById('btn-to-nie-ja').textContent = trybZgloszenia ? 'Anuluj' : 'To nie ja — reset';

        if (trybZgloszenia) {
            infoEl.textContent = `OFFLINE — Zgłoszenie: ${NAZWY_ZGLOSZEN[trybZgloszenia]} (czeka na internet)`;
        } else {
            infoEl.textContent = `OFFLINE — zapis czeka na synchronizację po odzyskaniu internetu`;
        }
        infoEl.classList.remove('hidden');

        pinBufor = '';
        odswiezPinKropki();
        pokazEkran(ekranPin);
        return;
    }

    // --- TRYB ONLINE: normalna weryfikacja przez serwer ---
    const wynik = await wywolajRPC('pobierz_po_kodzie', { p_kod: kodPlakietki });
    if (!wynik.sukces) {
        pokazKomunikatWyniku(false, wynik.blad || 'Nieznany kod QR.');
        return;
    }
    // WAŻNE: od tego momentu do weryfikacji PIN-u używamy KODU LOGOWANIA
    // ministranta (wynik.kod), a nie surowego kodu plakietki ze skanera!
    biezacyKod = wynik.kod;
    biezacyProfil = wynik;
    biezacaPlakietka = kodPlakietki;
    document.getElementById('pin-imie').textContent = `${wynik.imie} ${wynik.nazwisko}`;
    document.getElementById('pin-kod').textContent = wynik.kod;

    if (trybZgloszenia) {
        // Tryb zgłoszenia specjalnego: WYŁĄCZNIE zgłoszenie do zatwierdzenia —
        // żadnych przycisków ról ani zwykłego zaliczenia obecności.
        document.getElementById('btn-tryb-admin').classList.add('hidden');
        document.getElementById('btn-tryb-moderator').classList.add('hidden');
        document.getElementById('btn-ok').classList.add('hidden');
        document.getElementById('btn-to-nie-ja').textContent = 'Anuluj';
        infoEl.textContent = `Zgłoszenie: ${NAZWY_ZGLOSZEN[trybZgloszenia]} — wymaga zatwierdzenia przez Księdza/Admina`;
        infoEl.classList.remove('hidden');
    } else {
        const czyRolaSpecjalna = wynik.is_admin || wynik.is_moderator;
        document.getElementById('btn-tryb-admin').classList.toggle('hidden', !wynik.is_admin);
        document.getElementById('btn-tryb-moderator').classList.toggle('hidden', !wynik.is_moderator);
        document.getElementById('btn-ok').classList.toggle('hidden', czyRolaSpecjalna);
        document.getElementById('btn-to-nie-ja').textContent = czyRolaSpecjalna ? '🚪 Wyloguj' : 'To nie ja — reset';
        infoEl.classList.add('hidden');
    }

    pinBufor = '';
    odswiezPinKropki();
    pokazEkran(ekranPin);
}

// --- 2. Klawiatura PIN ---
document.querySelectorAll('.numpad button[data-n]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (pinBufor.length >= 4) return;
        pinBufor += btn.dataset.n;
        odswiezPinKropki();
        if (pinBufor.length === 4) {
            if (jestOffline) {
                setTimeout(() => obslugaPinOffline(), 150);
                return;
            }
            if (trybZgloszenia) {
                setTimeout(() => wyslijZgloszenieSpecjalne(), 150);
                return;
            }
            const czyRolaSpecjalna = biezacyProfil && (biezacyProfil.is_admin || biezacyProfil.is_moderator);
            // Dla Admina/Księdza NIE wywołujemy automatycznie normalnego zapisu
            // obecności — czekamy wyłącznie na jawne kliknięcie przycisku roli.
            if (!czyRolaSpecjalna) {
                setTimeout(() => zatwierdzPin(null), 150);
            }
        }
    });
});
document.getElementById('btn-wyczysc').addEventListener('click', () => {
    pinBufor = pinBufor.slice(0, -1);
    odswiezPinKropki();
});
document.getElementById('btn-ok').addEventListener('click', () => {
    if (jestOffline) { obslugaPinOffline(); return; }
    zatwierdzPin(null);
});
document.getElementById('btn-tryb-admin').addEventListener('click', () => zatwierdzPin('admin'));
document.getElementById('btn-tryb-moderator').addEventListener('click', () => zatwierdzPin('moderator'));
document.getElementById('btn-to-nie-ja').addEventListener('click', resetDoCzekania);
document.getElementById('btn-to-nie-ja-2').addEventListener('click', resetDoCzekania);

// --- Obsługa PIN-u w trybie OFFLINE: weryfikacja lokalna (bcrypt) + kolejka ---
// KLUCZOWA ZASADA: nigdy nie pokazujemy "zaliczono X pkt" offline — punkty
// i ostateczne zaliczenie ustala WYŁĄCZNIE serwer przy realnej synchronizacji.
async function obslugaPinOffline() {
    const weryfikacja = offlineWeryfikujPin(biezacyProfil, pinBufor);
    if (!weryfikacja.sukces) {
        pokazKomunikatWyniku(false, weryfikacja.blad);
        return;
    }

    if (trybZgloszenia) {
        dodajDoKolejkiOffline('zgloszenie', {
            p_kod: biezacyKod, p_pin: pinBufor, p_typ: trybZgloszenia, p_kod_plakietki: biezacaPlakietka
        });
        pokazKomunikatWyniku('offline', `⏳ Zgłoszenie (${NAZWY_ZGLOSZEN[trybZgloszenia]}) zapisane OFFLINE — zostanie wysłane do zatwierdzenia po odzyskaniu internetu.`);
        trybZgloszenia = null;
        odswiezTabeleKolejki();
        return;
    }

    const wydarzenie = offlineAktywneWydarzenie();
    if (!wydarzenie) {
        pokazKomunikatWyniku(false, 'Brak aktywnego wydarzenia w danych offline. Skontaktuj się z opiekunem.');
        return;
    }
    aktywneWydarzenie = wydarzenie;

    if (wydarzenie.polaczone_id) {
        pokazEkran(ekranBlok);
        return;
    }

    dodajDoKolejkiOffline('obecnosc', {
        p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: wydarzenie.id, p_wybor: 'auto'
    });
    pokazKomunikatWyniku('offline', `⏳ Zapisano OFFLINE dla ${biezacyProfil.imie}. Punkty zostaną przyznane dopiero po synchronizacji z internetem.`);
    odswiezTabeleKolejki();
}

async function wyslijZgloszenieSpecjalne() {
    const wynik = await wywolajRPC('zglos_obecnosc_specjalna', {
        p_kod: biezacyKod, p_pin: pinBufor, p_typ: trybZgloszenia, p_kod_plakietki: biezacaPlakietka
    });
    if (wynik.sukces) {
        pokazKomunikatWyniku(true, `✅ Zgłoszenie (${NAZWY_ZGLOSZEN[trybZgloszenia]}) wysłane. Punkty przyzna Ksiądz lub Admin.`);
    } else {
        pokazKomunikatWyniku(false, wynik.blad);
    }
    trybZgloszenia = null;
}

function odswiezPinKropki() {
    const kropki = document.querySelectorAll('#pin-kropki .pin-dot');
    kropki.forEach((k, i) => k.classList.toggle('filled', i < pinBufor.length));
}

async function zatwierdzPin(rolaDoZalogowania) {
    if (pinBufor.length !== 4) return;

    if (rolaDoZalogowania) {
        // Weryfikujemy logując się normalnie (zaloguj) — jeśli PIN poprawny i rola się zgadza, wchodzimy w panel awaryjny
        const wynik = await wywolajRPC('zaloguj', { p_kod: biezacyKod, p_pin: pinBufor, p_zrodlo: 'kiosk' });
        const rolaOk = (rolaDoZalogowania === 'admin' && wynik.is_admin) || (rolaDoZalogowania === 'moderator' && wynik.is_moderator);
        if (!wynik.sukces || !rolaOk) {
            pokazKomunikatWyniku(false, 'Nieprawidłowy PIN.');
            return;
        }
        rolaAwaryjna = rolaDoZalogowania;
        await wejdzWTrybAwaryjny();
        return;
    }

    // Sprawdź czy jest aktywne wydarzenie z otwartym oknem
    const { data: kalendarz, error } = await supabaseClient
        .from('kalendarz')
        .select('*')
        .eq('okno_aktywne', true);

    if (error || !kalendarz || kalendarz.length === 0) {
        pokazKomunikatWyniku(false, 'Brak aktywnego wydarzenia w tym momencie. Skontaktuj się z opiekunem.');
        return;
    }

    aktywneWydarzenie = kalendarz[0];

    if (aktywneWydarzenie.polaczone_id) {
        pokazEkran(ekranBlok);
        return;
    }

    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', {
        p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: 'auto'
    });
    obsluzWynikZapisu(wynikZapisu);
}

// --- 3. Obsługa bloku połączonego ---
document.getElementById('btn-tylko-nabozenstwo').addEventListener('click', () => zapiszBlok('tylko_nabozenstwo'));
document.getElementById('btn-tylko-msza').addEventListener('click', () => zapiszBlok('tylko_msza'));
document.getElementById('btn-oba').addEventListener('click', () => zapiszBlok('oba'));

async function zapiszBlok(wybor) {
    if (jestOffline) {
        dodajDoKolejkiOffline('obecnosc', {
            p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: wybor
        });
        pokazKomunikatWyniku('offline', `⏳ Zapisano OFFLINE. Punkty zostaną przyznane dopiero po synchronizacji z internetem.`);
        odswiezTabeleKolejki();
        return;
    }
    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', {
        p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: wybor
    });
    obsluzWynikZapisu(wynikZapisu);
}

function obsluzWynikZapisu(wynik) {
    if (wynik.sukces) {
        pokazKomunikatWyniku(true, `✅ ${wynik.imie}, zaliczono! +${wynik.punkty_przyznane} pkt`);
    } else {
        pokazKomunikatWyniku(false, wynik.blad);
    }
}

// stan: true = potwierdzony sukces (zielony), false = błąd (czerwony),
// 'offline' = zapisano lokalnie, jeszcze NIE potwierdzone przez serwer (bursztynowy)
function pokazKomunikatWyniku(stan, tresc) {
    const el = document.getElementById('wynik-tresc');
    el.textContent = tresc;
    el.className = 'status-msg ' + (stan === true ? 'ok' : stan === 'offline' ? 'offline' : 'err');
    pokazEkran(ekranWynik);
    setTimeout(resetDoCzekania, stan === true ? 2500 : 3500);
}
document.getElementById('btn-dalej').addEventListener('click', resetDoCzekania);

// --- 4. Tryb awaryjny Admina LUB ograniczony panel Księdza (moderatora) ---
async function wejdzWTrybAwaryjny() {
    pokazEkran(ekranAdminAwaryjny);

    const czyAdmin = rolaAwaryjna === 'admin';
    document.getElementById('awaryjny-tytul').textContent = czyAdmin ? '🔑 Panel awaryjny — Admin' : '⛪ Panel Księdza';

    // Sekcje dostępne WYŁĄCZNIE dla Admina (odblokowanie kodu) — dla Księdza ukryte,
    // zgodnie z wymogiem: Ksiądz ma tylko możliwość dodania/cofnięcia obecności.
    document.querySelectorAll('.tylko-admin-awaryjny').forEach(el => el.classList.toggle('hidden', !czyAdmin));

    const { data: kalendarz } = await supabaseClient
        .from('kalendarz')
        .select('*')
        .order('data_wydarzenia', { ascending: false })
        .limit(20);
    const sel = document.getElementById('awaryjny-wydarzenie');
    sel.innerHTML = (kalendarz || []).map(w =>
        `<option value="${w.id}">${w.nazwa} (${new Date(w.data_wydarzenia).toLocaleString('pl-PL')})</option>`
    ).join('');

    await odswiezOstatnieObecnosci();
}

async function odswiezOstatnieObecnosci() {
    const wynik = await wywolajRPC('admin_ostatnie_obecnosci', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_limit: 20 });
    const tbody = document.getElementById('tabela-ostatnie-obecnosci');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="5">❌ ${wynik.blad}</td></tr>`; return; }
    tbody.innerHTML = (wynik.dane || []).map(o => `
        <tr>
            <td>${new Date(o.data_zapisu).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}</td>
            <td>${o.imie} ${o.nazwisko} (${o.kod})</td>
            <td>${o.wydarzenie}</td>
            <td>+${o.punkty}</td>
            <td><button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="cofnijObecnosc('${o.id}')">Cofnij</button></td>
        </tr>`).join('') || '<tr><td colspan="5">Brak zapisanych obecności.</td></tr>';
}

async function cofnijObecnosc(id) {
    const wynik = await wywolajRPC('admin_cofnij_obecnosc', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_obecnosc_id: id });
    document.getElementById('awaryjny-status').textContent = wynik.sukces ? '✅ Cofnięto obecność.' : ('❌ ' + wynik.blad);
    await odswiezOstatnieObecnosci();
}

document.getElementById('btn-awaryjny-zapisz').addEventListener('click', async () => {
    const kodDocelowy = document.getElementById('awaryjny-kod').value.trim();
    const wydarzenieId = document.getElementById('awaryjny-wydarzenie').value;
    const statusEl = document.getElementById('awaryjny-status');

    if (!kodDocelowy || !wydarzenieId) {
        statusEl.textContent = 'Podaj kod ministranta i wybierz wydarzenie.';
        return;
    }
    // Szukamy po KODZIE LOGOWANIA ministranta (np. MIN-007) w widoku rankingu —
    // NIE przez pobierz_po_kodzie, bo to przyjmuje kod PLAKIETKI, nie kod konta.
    const { data: wpis } = await supabaseClient.from('ranking_miesiac').select('ministrant_id').eq('kod', kodDocelowy).maybeSingle();
    if (!wpis) {
        statusEl.textContent = 'Nie znaleziono aktywnego ministranta o takim kodzie.';
        return;
    }
    const wynik = await wywolajRPC('korekta_obecnosci', {
        p_kod: biezacyKod, p_pin: pinBufor,
        p_ministrant_id: wpis.ministrant_id,
        p_wydarzenie_id: wydarzenieId,
        p_punkty: 1,
        p_zaliczone_jako: 'zbiorka'
    });
    statusEl.textContent = wynik.sukces ? '✅ Zapisano ręcznie.' : ('❌ ' + wynik.blad);
    if (wynik.sukces) document.getElementById('awaryjny-kod').value = '';
});

// --- Odblokowanie kodu — WYŁĄCZNIE Admin (sekcja ukryta dla Księdza w wejdzWTrybAwaryjny) ---
document.getElementById('btn-odblokuj-kiosk').addEventListener('click', async () => {
    const kod = document.getElementById('odblokuj-kiosk-input').value.trim();
    const statusEl = document.getElementById('odblokuj-kiosk-status');
    if (!kod) return;
    const wynik = await wywolajRPC('admin_odblokuj_kod', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_kod_do_odblokowania: kod });
    statusEl.textContent = wynik.sukces ? ('✅ ' + (wynik.informacja || 'Odblokowano.')) : ('❌ ' + wynik.blad);
    document.getElementById('odblokuj-kiosk-input').value = '';
});

document.getElementById('btn-wyjdz-admin').addEventListener('click', resetDoCzekania);

// Start
resetDoCzekania();
aktualizujBanerOffline();
odswiezTabeleKolejki();
(async () => {
    const polaczenie = await sprawdzPolaczenie();
    ustawStanPolaczenia(polaczenie);
    if (polaczenie) probojSynchronizacje();
})();

// Monitoring: pierwszy ping od razu (rejestracja urządzenia), potem wyrównanie
// do siatki zegara :00/:15/:30/:45 i regularne wysyłanie co 15 minut.
wyslijPing();
setTimeout(() => {
    wyslijPing();
    setInterval(wyslijPing, 15 * 60 * 1000);
}, msDoNastepnegoKwadransa());
