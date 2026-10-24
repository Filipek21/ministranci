// ============================================================================
// Inicjalizacja klienta Supabase — UZUPEŁNIJ swoimi danymi z Project Settings > API
// ============================================================================
const SUPABASE_URL = 'https://jwreoglzabawaubjfqse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3cmVvZ2x6YWJhd2F1YmpmcXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMTYxMzAsImV4cCI6MjEwNDc5MjEzMH0.pwfkf2xcNpNSBAPJdyiVQ-cLd2qitmZfLxmYN7SEDkM';

// Biblioteka supabase-js jest wczytana z CDN w <head> każdej strony (patrz index.html/kiosk.html/app.html)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
