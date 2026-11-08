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

// Opakowanie na wywołania RPC z jednolitą obsługą błędów.
// Zwraca zawsze obiekt. Przy błędzie:
//   { sukces:false, blad:'...', siec:true }                  — brak sieci / timeout (można zapisać offline)
//   { sukces:false, blad:'...', kod_pg:'PGRST202' }          — serwer odpowiedział błędem (np. brak funkcji w bazie)
async function wywolajRPC(nazwaFunkcji, parametry, opcje) {
    const kontroler = new AbortController();
    const limit = (opcje && opcje.timeoutMs) || RPC_TIMEOUT_MS;
    const timer = setTimeout(() => kontroler.abort(), limit);
    try {
        const { data, error } = await supabaseClient.rpc(nazwaFunkcji, parametry || {}).abortSignal(kontroler.signal);
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
// v2.12.05: dopisano odczyty, które wcześniej były liczone jak zapisy i wywoływały pętlę odświeżania panelu (np. Audyt co ~0,7 s)
const RPC_ODCZYTY = /(kontakt|lista|historia|status|pobierz|moja_|ranking|zaloguj|ping|zadania|eksport|czy_|sprawdz|odczyt|podglad|audyt_zdarzenia|stan_bazy|spojnosc_punktow|duplikat|raport|statystyk|dashboard|frekwencj)/i;
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

// v2.12.01: punkty mogą być połówkowe (0,5 · 1,5 · 2,5 …) — wspólne parsowanie (przecinek lub kropka) i walidacja kroku 0,5
function parsujPunkty(tekst) {
    const n = parseFloat(String(tekst == null ? '' : tekst).trim().replace(',', '.'));
    return (isNaN(n) || Math.round(n * 2) !== n * 2) ? NaN : n;
}
function formatPunkty(n) {   // 1.5 → „1,5”, 2 → „2”
    const x = Number(n);
    return isNaN(x) ? String(n == null ? '' : n) : String(Math.round(x * 10) / 10).replace('.', ',');
}

function pokazBladOdczytu(opis, error) {
    console.error('Błąd odczytu ' + opis + ':', error);
    // v2.12.06: jeśli działa system powiadomień (prawy dolny róg, max 3) — używamy go; poniższy dymek zostaje jako rozwiązanie awaryjne
    if (typeof window.powiadom === 'function') {
        const tekstP = (typeof t === 'function') ? t('e.read_failed', { opis, kod: error.code || '', msg: error.message || '' }) : ('Nie udało się odczytać danych (' + opis + '): ' + (error.message || ''));
        window.powiadom('err', tekstP + ((error.code === '42501') ? ' — brak uprawnień SELECT w bazie: uruchom w Supabase plik sql/27_napraw_wydarzenia_polowki_tydzien.sql' : ''));
        return;
    }
    let el = document.getElementById('toast-blad-odczytu');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-blad-odczytu';
        el.style.cssText = 'position:fixed; left:50%; bottom:20px; transform:translateX(-50%); z-index:3000; max-width:90vw; background:#7f1d1d; color:#fff; padding:10px 16px; border-radius:12px; font-size:0.9rem; box-shadow:0 6px 24px rgba(0,0,0,0.5);';
        document.body.appendChild(el);
    }
    const tekst = (typeof t === 'function') ? t('e.read_failed', { opis, kod: error.code || '', msg: error.message || '' }) : ('Nie udało się odczytać danych (' + opis + '): ' + (error.message || ''));
    el.textContent = '❌ ' + tekst + ((error.code === '42501') ? ' — brak uprawnień SELECT w bazie: uruchom w Supabase plik sql/27_napraw_wydarzenia_polowki_tydzien.sql' : '');
    el.style.display = 'block';
    el.classList.remove('toast-wejscie'); void el.offsetWidth; el.classList.add('toast-wejscie');
    clearTimeout(pokazBladOdczytu._t);
    pokazBladOdczytu._t = setTimeout(() => { el.style.display = 'none'; }, 9000);
}
// Użycie: const { data } = await odczytajZBledem(supabaseClient.from('kalendarz').select('*'), 'kalendarz');
async function odczytajZBledem(zapytanie, opis) {
    const wynik = await zapytanie;
    if (wynik && wynik.error) pokazBladOdczytu(opis, wynik.error);
    return wynik;
}
