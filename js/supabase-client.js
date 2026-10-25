// ============================================================================
// Inicjalizacja klienta Supabase — UZUPEŁNIJ swoimi danymi z Project Settings > API
// ============================================================================
const SUPABASE_URL = 'https://jwreoglzabawaubjfqse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3cmVvZ2x6YWJhd2F1YmpmcXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMTYxMzAsImV4cCI6MjEwNDc5MjEzMH0.pwfkf2xcNpNSBAPJdyiVQ-cLd2qitmZfLxmYN7SEDkM';

// Biblioteka supabase-js jest wczytana z CDN w <head> każdej strony (patrz index.html/kiosk.html/app.html)
// v2.11.01: odpowiedzi z bazy NIGDY nie są brane z pamięci przeglądarki (cache: 'no-store') — wcześniej odczyt mógł pokazywać
// starą wersję danych, mimo że zapis w bazie się udał.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: (url, opcje) => fetch(url, Object.assign({}, opcje || {}, { cache: 'no-store' })) }
});

// Maksymalny czas oczekiwania na odpowiedź serwera. Bez tego zapytanie na sieci "połączonej,
// ale bez internetu" potrafi wisieć minutami — a Kiosk musiałby czekać zamiast przejść w tryb offline.
const RPC_TIMEOUT_MS = 10000;

// Czy błąd z supabase-js to problem SIECI (brak połączenia / timeout), a nie odpowiedź serwera?
// Odpowiedzi PostgREST/Postgres zawsze mają niepusty "code" (np. PGRST202, 42883, 23505).
function bladJestSieciowy(error) {
    if (!error) return false;
    if (error.code) return false;
    return true;
}

// ----------------------------------------------------------------------------
// STAŁY KOD WERYFIKACYJNY (3 cyfry) dla Admina i Księdza (sql/19).
// Po zalogowaniu kod jest trzymany tylko w pamięci karty (oraz w sessionStorage panelu) i AUTOMATYCZNIE doklejany do PIN-u
// przy wywołaniach funkcji serwera, które go wymagają (PIN 4 + kod 3 = 7 znaków). Starsze funkcje (pliki 01–13) dostają
// sam PIN, tak jak dotąd.
// ----------------------------------------------------------------------------
const RPC_Z_KODEM3 = new Set([
    'admin_usun_kiosk', 'admin_autoryzuj_kiosk',
    'admin_historia_pin', 'admin_historia_plakietek', 'admin_historia_skanow',
    'admin_blokady_pin_lista', 'admin_odblokuj_pin_v2',
    'admin_historia_punktow', 'admin_obecnosci_lista', 'admin_punkty_edytuj', 'admin_punkty_usun', 'admin_punkty_dodaj',
    'admin_wydarzenie_zmien_nazwe', 'admin_wydarzenie_usun',
    'admin_ustawienia_pobierz', 'admin_ustawienia_zapisz', 'admin_audyt_zdarzenia',
    'admin_rodo_eksport', 'admin_rodo_anonimizuj', 'admin_rodo_wyczysc_logi', 'admin_rodo_rejestr',
    'ksiadz_dodaj_ministranta', 'ksiadz_edytuj_ministranta', 'ksiadz_ustaw_aktywnosc', 'ksiadz_zmien_pin_ministranta',
    'admin_kod3_reset', 'admin_kod3_status',
    'admin_dodaj_obecnosc_reczna', 'admin_ping_kiosk', 'admin_ping_status'   // v2.8 (sql/20)
]);
// v2.9: kod 3-cyfrowy WYŁĄCZONY (logowanie Admina/Księdza = kod + PIN, jak dawniej). Kod w repozytorium zostaje —
// ustawienie true przywraca drugi czynnik (wymaga też zmiany pliku sql/21 z powrotem na wersję z kodem).
const KOD3_WLACZONY = false;
let KOD3_SESJI = null;
function ustawKod3Sesji(kod3) { KOD3_SESJI = (KOD3_WLACZONY && kod3 && /^\d{3}$/.test(String(kod3))) ? String(kod3) : null; }
function parametryZKodem3(nazwaFunkcji, parametry) {
    if (!KOD3_SESJI || !RPC_Z_KODEM3.has(nazwaFunkcji) || !parametry) return parametry;
    const kopia = Object.assign({}, parametry);
    ['p_pin_admina', 'p_pin'].forEach(k => { if (typeof kopia[k] === 'string' && kopia[k].length === 4) kopia[k] = kopia[k] + KOD3_SESJI; });
    return kopia;
}

// Opakowanie na wywołania RPC z jednolitą obsługą błędów.
// Zwraca zawsze obiekt. Przy błędzie:
//   { sukces:false, blad:'...', siec:true }                  — brak sieci / timeout (można zapisać offline)
//   { sukces:false, blad:'...', kod_pg:'PGRST202' }          — serwer odpowiedział błędem (np. brak funkcji w bazie)
async function wywolajRPC(nazwaFunkcji, parametry, opcje) {
    const kontroler = new AbortController();
    const limit = (opcje && opcje.timeoutMs) || RPC_TIMEOUT_MS;
    const timer = setTimeout(() => kontroler.abort(), limit);
    try {
        const { data, error } = await supabaseClient.rpc(nazwaFunkcji, parametryZKodem3(nazwaFunkcji, parametry || {})).abortSignal(kontroler.signal);
        if (error) {
            console.error(`Błąd RPC ${nazwaFunkcji}:`, error);
            if (bladJestSieciowy(error)) {
                return { sukces: false, siec: true, blad: 'Błąd połączenia z serwerem. Sprawdź internet.' };
            }
            return { sukces: false, kod_pg: error.code, blad: 'Błąd serwera (' + error.code + '): ' + (error.message || '') };
        }
        if (!RPC_ODCZYTY.test(nazwaFunkcji) && !(data && data.sukces === false)) zaplanujOdswiezeniePanelu();   // po zapisie odśwież aktywną zakładkę
        return (data === null || data === undefined) ? { sukces: true } : data;
    } catch (e) {
        console.error(`Wyjątek RPC ${nazwaFunkcji}:`, e);
        return { sukces: false, siec: true, blad: 'Błąd połączenia z serwerem. Sprawdź internet.' };
    } finally {
        clearTimeout(timer);
    }
}

// Wywołanie funkcji "z audytem" (sql/15: zmien_pin_audyt, admin_uniewaznij_plakietke_audyt …), które zapisują w historii
// KTO i SKĄD wykonał operację. Jeśli serwer jeszcze nie ma tych funkcji (PGRST202 / 42883), wołamy zwykłą funkcję —
// aplikacja działa dalej, tylko bez dopisku w historii.
async function wywolajRPCZAudytem(nazwaAudytowa, nazwaZwykla, parametry, dodatkowe) {
    const w = await wywolajRPC(nazwaAudytowa, Object.assign({}, parametry, dodatkowe || {}));
    if (!w.sukces && (w.kod_pg === 'PGRST202' || w.kod_pg === '42883')) return wywolajRPC(nazwaZwykla, parametry);
    return w;
}


// ----------------------------------------------------------------------------
// v2.11.01 — SPÓJNY ODCZYT PO ZAPISIE
//  • Po każdej udanej operacji ZAPISU (RPC inne niż odczyt) panel odświeża aktywną zakładkę — dane z bazy od razu widać.
//  • Panel odświeża się też po powrocie na kartę / odzyskaniu internetu.
//  • Błędy odczytu tabel i widoków nie są już ciche: pokazuje je czerwony komunikat (wcześniej lista po prostu wyglądała na pustą).
// ----------------------------------------------------------------------------
const RPC_ODCZYTY = /(lista|historia|status|pobierz|moja_|ranking|zaloguj|ping|zadania|eksport|czy_|sprawdz|odczyt|podglad)/i;
let _odswiezPanelTimer = null;
function zaplanujOdswiezeniePanelu() {
    clearTimeout(_odswiezPanelTimer);
    _odswiezPanelTimer = setTimeout(() => {
        try {
            if (typeof odswiezAktywnaZakladke === 'function' && typeof sesja !== 'undefined' && sesja && document.visibilityState !== 'hidden') odswiezAktywnaZakladke();
        } catch (e) { console.error('Odświeżenie po zapisie:', e); }
    }, 700);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') zaplanujOdswiezeniePanelu(); });
window.addEventListener('online', zaplanujOdswiezeniePanelu);

function pokazBladOdczytu(opis, error) {
    console.error('Błąd odczytu ' + opis + ':', error);
    let el = document.getElementById('toast-blad-odczytu');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-blad-odczytu';
        el.style.cssText = 'position:fixed; left:50%; bottom:20px; transform:translateX(-50%); z-index:3000; max-width:90vw; background:#7f1d1d; color:#fff; padding:10px 16px; border-radius:12px; font-size:0.9rem; box-shadow:0 6px 24px rgba(0,0,0,0.5);';
        document.body.appendChild(el);
    }
    const tekst = (typeof t === 'function') ? t('e.read_failed', { opis, kod: error.code || '', msg: error.message || '' }) : ('Nie udało się odczytać danych (' + opis + '): ' + (error.message || ''));
    el.textContent = '❌ ' + tekst;
    el.style.display = 'block';
    clearTimeout(pokazBladOdczytu._t);
    pokazBladOdczytu._t = setTimeout(() => { el.style.display = 'none'; }, 9000);
}
// Użycie: const { data } = await odczytajZBledem(supabaseClient.from('kalendarz').select('*'), 'kalendarz');
async function odczytajZBledem(zapytanie, opis) {
    const wynik = await zapytanie;
    if (wynik && wynik.error) pokazBladOdczytu(opis, wynik.error);
    return wynik;
}
