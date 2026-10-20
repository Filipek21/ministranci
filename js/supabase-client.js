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
        return (data === null || data === undefined) ? { sukces: true } : data;
    } catch (e) {
        console.error(`Wyjątek RPC ${nazwaFunkcji}:`, e);
        return { sukces: false, siec: true, blad: 'Błąd połączenia z serwerem. Sprawdź internet.' };
    } finally {
        clearTimeout(timer);
    }
}
