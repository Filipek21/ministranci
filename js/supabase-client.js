// ============================================================================
// Inicjalizacja klienta Supabase — UZUPEŁNIJ swoimi danymi z Project Settings > API
// ============================================================================
const SUPABASE_URL = 'https://jwreoglzabawaubjfqse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3cmVvZ2x6YWJhd2F1YmpmcXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMTYxMzAsImV4cCI6MjEwNDc5MjEzMH0.pwfkf2xcNpNSBAPJdyiVQ-cLd2qitmZfLxmYN7SEDkM';

// Biblioteka supabase-js jest wczytana z CDN w <head> każdej strony (patrz index.html/kiosk.html/app.html)
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Proste opakowanie na wywołania RPC z jednolitą obsługą błędów sieciowych
async function wywolajRPC(nazwaFunkcji, parametry) {
    const { data, error } = await supabaseClient.rpc(nazwaFunkcji, parametry);
    if (error) {
        console.error(`Błąd RPC ${nazwaFunkcji}:`, error);
        return { sukces: false, blad: 'Błąd połączenia z serwerem. Sprawdź internet.' };
    }
    return data;
}
