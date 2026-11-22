// ============================================================================
// Edge Function „asystent” — v2.15.05 — Asystent AI tylko dla Admina (E-Ministranci)
// Wdrożenie: patrz docs/ASYSTENT_AI.md. Sekrety: MISTRAL_API_KEY (obowiązkowy), opcjonalnie ASYSTENT_MODEL (domyślnie mistral-large-4).
// SUPABASE_URL i SUPABASE_ANON_KEY dostarcza platforma. Klucz Mistral NIGDY nie trafia do przeglądarki.
// Przepływ: (1) RPC asystent_przygotuj — weryfikacja Admina (kod + PIN), flaga „włączony”, limit niezależny od Mistral, agregaty;
// (2) maskowanie danych; (3) wywołanie Mistral (z zapasowym modelem przy błędzie tieru); (4) RPC asystent_audyt — kto + kiedy + czy użyto
// danych, BEZ treści promptu i odpowiedzi. Treści rozmowy nie są logowane ani zapisywane. PIN służy tylko do weryfikacji i nie trafia do modelu.
// NIE uruchomiono w środowisku pracy (brak Deno / sieci) — sprawdź po wdrożeniu (docs/ASYSTENT_AI.md, „Test po wdrożeniu”).
// ============================================================================
// v2.15.17: dodano KONTROLĘ WYJŚCIA (S.znajdzNaruszenia — odmowa wysyłki do modelu, gdy w komunikatach zostały dane osobowe), sprawdzanie nagłówka Origin
// względem ALLOWED_ORIGIN, nagłówki no-store/nosniff oraz limit czasu wywołania modelu.
// v2.15.16: wersja PRZYPIĘTA (wcześniej „@2” — każdy nowy wydanie biblioteki trafiało na serwer bez przeglądu; łańcuch dostaw).
// Przed wdrożeniem sprawdź, że ta wersja istnieje, i ewentualnie podbij świadomie.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import "./sanityzacja.js";

// deno-lint-ignore no-explicit-any
const S = (globalThis as any).EMSanityzacja;
// v2.15.16: origin można zawęzić sekretem ALLOWED_ORIGIN (np. https://twoja-parafia.github.io). Bez sekretu zachowanie jak dotąd („*”).
// Uwaga: to NIE jest uwierzytelnianie — dostęp chroni kod + PIN Admina weryfikowany w bazie (z blokadą po błędnych próbach).
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "";
const CORS = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
    "Cache-Control": "no-store",                 // v2.15.17: odpowiedzi z danymi Admina nie mogą trafić do żadnej pamięci podręcznej
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const MAKS_BODY = 64 * 1024;

const odp = (obj: unknown) => new Response(JSON.stringify(obj), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
const blad = (kod_bledu: string, tekst: string) => odp({ sukces: false, kod_bledu, blad: tekst });

function modele(): string[] {
    const glowny = Deno.env.get("ASYSTENT_MODEL") || "mistral-large-4";
    return [...new Set([glowny, "mistral-large-latest", "mistral-medium-latest"])];
}

// pozostały limit z nagłówków odpowiedzi Mistral (jeśli API je zwraca)
function limitZNaglowkow(h: Headers): Record<string, string> | null {
    const o: Record<string, string> = {};
    h.forEach((v, k) => { if (/^(x-)?ratelimit-(remaining|limit|reset)/i.test(k)) o[k.replace(/^x-/i, "")] = v; });
    return Object.keys(o).length ? o : null;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    // v2.15.17: gdy ustawiono ALLOWED_ORIGIN, żądania z INNEGO pochodzenia przeglądarkowego są odrzucane po stronie serwera (nie tylko przez CORS).
    // Brak nagłówka Origin (narzędzia serwerowe) nie jest blokowany — dostęp i tak chroni kod + PIN Admina weryfikowany w bazie.
    const origin = req.headers.get("origin");
    if (ALLOWED_ORIGIN && origin && origin !== ALLOWED_ORIGIN) return blad("brak_uprawnien", "Brak uprawnień.");
    if (req.method !== "POST") return blad("api", "Metoda niedozwolona.");
    if (Number(req.headers.get("content-length") || 0) > MAKS_BODY) return blad("api", "Zbyt duże zapytanie.");   // v2.15.16: odrzucenie przed wczytaniem treści
    const surowy = await req.text();
    if (surowy.length > MAKS_BODY) return blad("api", "Zbyt duże zapytanie.");
    // deno-lint-ignore no-explicit-any
    let b: any;
    try { b = JSON.parse(surowy); } catch { return blad("api", "Nieprawidłowe zapytanie."); }

    const klucz = Deno.env.get("MISTRAL_API_KEY");
    if (!klucz) return blad("klucz", "Brak klucza API po stronie serwera.");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const kod = String(b.kod || ""), pin = String(b.pin || "");
    if (kod.length > 64 || pin.length > 32) return blad("brak_uprawnien", "Brak uprawnień.");   // v2.15.16: nie przekazujemy absurdalnie długich danych do bazy
    const uzyjDanych = b.uzyj_danych === true;
    const ekran = b.zgoda_ekran === true ? S.sanityzujEkran(b.ekran) : null;           // tylko za jawną zgodą Admina
    const kontakt = b.zgoda_kontakt === true ? S.sanityzujKontakt(b.kontakt) : null;   // j.w.

    // 1) autoryzacja + flaga + limit + agregaty (jedno wywołanie, całość po stronie bazy)
    const zakres = S.ZAKRESY.includes(b.zakres) ? String(b.zakres) : "podstawowy";                 // v2.15.06: podstawowy | trendy | miesiac
    const rok = Number.isInteger(b.rok) ? b.rok : null, miesiac = Number.isInteger(b.miesiac) ? b.miesiac : null;
    const { data: prz, error: ePrz } = await sb.rpc("asystent_przygotuj", { p_kod: kod, p_pin: pin, p_dane: uzyjDanych, p_zakres: zakres, p_rok: rok, p_miesiac: miesiac });
    if (ePrz) return blad(ePrz.code === "PGRST202" ? "need_sql" : "api", "Błąd bazy danych.");
    if (!prz || prz.sukces !== true) return blad(String(prz?.kod_bledu || "brak_uprawnien"), String(prz?.blad || "Brak uprawnień."));

    // 2) komunikaty (maskowanie w S.*)
    const komunikaty = S.zbudujKomunikaty({ agregaty: uzyjDanych ? prz.dane : null, ekran, kontakt, wiadomosci: b.wiadomosci, zakres, wiedza: b.wiedza === true });
    if (!komunikaty.some((m: { role: string }) => m.role === "user")) return blad("api", "Brak pytania.");
    // 2b) KONTROLA WYJŚCIA (v2.15.17, fail-closed): niezależny przegląd gotowych komunikatów. Jeśli po maskowaniu zostało coś, co wygląda
    // na dane osobowe (e-mail, PESEL, telefon, adres IP, URL, token…), NIC nie jest wysyłane do modelu — pętla poniżej jest pomijana,
    // a zdarzenie trafia do audytu (bez treści i bez rodzajów — Edge Function niczego nie loguje).
    const naruszenia = S.znajdzNaruszenia(komunikaty);

    // 3) Mistral — model główny, a przy błędzie dostępu do modelu (tier) zapasowe
    let wynik = "api", tekstOdp = "", uzyty = "", zapasowy = false, limit: Record<string, string> | null = null, kodBledu = "api";
    const lista = modele();
    if (naruszenia.length) { wynik = "pii"; kodBledu = "pii"; }
    else for (let i = 0; i < lista.length; i++) {
        let r: Response;
        try {
            r = await fetch(MISTRAL_URL, {
                method: "POST", headers: { "Authorization": `Bearer ${klucz}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: lista[i], messages: komunikaty, temperature: 0.3, max_tokens: zakres === "miesiac" ? 1400 : 900 }),
                signal: AbortSignal.timeout(30000),   // v2.15.17: limit czasu — zawieszone połączenie nie blokuje funkcji ani nie trzyma danych w pamięci
            });
        } catch { wynik = "siec"; kodBledu = "siec"; break; }
        limit = limitZNaglowkow(r.headers) || limit;
        if (r.ok) {
            const j = await r.json().catch(() => null);
            tekstOdp = String(j?.choices?.[0]?.message?.content ?? "").trim();
            if (!tekstOdp) { wynik = "api"; kodBledu = "api"; break; }
            uzyty = lista[i]; zapasowy = i > 0; wynik = "ok"; break;
        }
        const m = S.mapujBladMistral(r.status, await r.text().catch(() => ""));   // treść błędu nie jest logowana
        kodBledu = m.kod_bledu; wynik = m.kod_bledu;
        if (!(m.zapasowy && i < lista.length - 1)) break;
    }

    // 4) audyt bez treści
    await sb.rpc("asystent_audyt", { p_kod: kod, p_pin: pin, p_dane: uzyjDanych, p_ekran: !!ekran, p_kontakt: !!kontakt, p_model: uzyty || lista[0], p_wynik: wynik });

    if (wynik !== "ok") return odp({ sukces: false, kod_bledu: kodBledu, blad: "Asystent niedostępny.", limit_pozostaly: limit });
    return odp({ sukces: true, odpowiedz: tekstOdp, model: uzyty, uzyty_zapasowy: zapasowy, limit_pozostaly: limit });
});
