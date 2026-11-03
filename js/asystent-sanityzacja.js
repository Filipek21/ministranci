// ============================================================================
// asystent-sanityzacja.js — v2.15.05 — maskowanie danych PRZED wysłaniem do modelu AI (Asystent Admina)
// Czyste funkcje, bez sieci i DOM. Ten plik działa: (1) w przeglądarce (window.EMSanityzacja), (2) w testach Node (require),
// (3) w Edge Function (Deno: import "./sanityzacja.js" → globalThis.EMSanityzacja). Kopia dla Edge Function:
// supabase/functions/asystent/sanityzacja.js — MUSI być identyczna (pilnuje tego test).
// Zasada: do modelu nie trafiają PIN-y, kody kont, e-maile, numery telefonów / PESEL, daty z rokiem (np. urodzenia),
// obrazy (data:…;base64) ani żadne pola o nazwach sugerujących dane osobowe. Imion i nazwisk w dowolnym tekście nie da się
// wykryć automatycznie — dlatego Admin zawsze widzi i zatwierdza tekst, który ma opuścić ekran.
// ============================================================================
(function (korzen, fabryka) {
    const api = fabryka();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else korzen.EMSanityzacja = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const MAKS_TEKST = 4000, MAKS_EKRAN = 3000, MAKS_WIADOMOSCI = 12;

    const PROMPT_SYSTEMOWY = [
        'Jesteś pomocnym asystentem Administratora systemu parafialnego „E-Ministranci”. Odpowiadaj po polsku, chyba że Admin pisze w innym języku (angielski / ukraiński) — wtedy w jego języku.',
        'Pomagasz: wyjaśniasz Raport Dnia, audyt, kolejkę offline i akceptacje wpisów starszych niż 36 godzin; podsumowujesz liczby i anomalie; przypominasz procedury (RODO, retencja, blokady, synchronizacja); tworzysz checklisty i krótkie raporty tekstowe; redagujesz PROPOZYCJE odpowiedzi na wiadomości (Admin zawsze sam decyduje, czy ich użyć).',
        'Nie podejmujesz decyzji i nie wykonujesz żadnych akcji: nie akceptujesz ani nie odrzucasz obecności, nie blokujesz kont, nie zmieniasz punktów. Gdy Admin o to prosi, wyjaśnij, że decyzję i działanie wykonuje on sam w panelu.',
        'Nie oceniasz charakteru ani zachowania konkretnych osób; mówisz o liczbach, statusach i procedurach. Nie zgaduj tożsamości osób. Dane w rozmowie są zanonimizowane (znaczniki typu [KOD], [EMAIL], [NUMER], [DATA]) — nie próbuj ich odtwarzać.',
        'Nigdy nie proś o PIN-y, hasła, pełne listy osób ani zrzuty ekranu. Opieraj się wyłącznie na dostarczonych danych; gdy czegoś nie wiesz lub brakuje danych — powiedz to wprost. Odpowiadaj zwięźle.'
    ].join('\n');

    // v2.15.06: krótka, ZWERYFIKOWANA z kodem wiedza o systemie — używana do procedur i diagnostyki, żeby model nie zgadywał funkcji, których nie ma
    const WIEDZA_SYSTEMU = [
        'Wiedza o systemie E-Ministranci (opieraj się TYLKO na niej; jeśli czegoś tu nie ma, powiedz że nie masz pewności i wskaż zakładkę lub dokumentację, zamiast zgadywać):',
        '• Kiosk zapisuje obecności lokalnie w szyfrowanej kolejce offline i wysyła je paczkami (maks. 5 wpisów i 8 KB w paczce). Statusy wpisu: oczekuje, wysłano, pominięto (już istniało), błąd (odrzucony PIN albo 5 nieudanych prób), przeterminowany, do akceptacji.',
        '• Reguła 36 godzin: wpis starszy niż 36 h nie dodaje obecności sam — trafia do zakładki Akceptacje, a decyzję podejmuje Admin. Młodsze wpisy synchronizują się same. Admin może na Kiosku przedłużyć przeterminowane wpisy (o 24 godziny lub 7 dni), zdarzenie trafia do audytu.',
        '• Limity synchronizacji: serwer przyjmuje do 25 paczek na minutę na kiosk przy 1–2 aktywnych kioskach i do 20 przy 3 lub więcej. Komunikat „serwer chwilowo ogranicza synchronizację” i ponowienie po 15–30 s to NIE awaria; wpisy zostają w kolejce.',
        '• Token Kiosku autoryzuje urządzenie i ma ważność (domyślnie 180 dni). Po wygaśnięciu lub unieważnieniu Admin musi autoryzować kiosk ponownie; bez tokenu kiosk nie pobiera danych offline i nie wysyła paczek. Tryby offline: pin_na_serwerze (PIN sprawdzany online) i token_bez_pin (zwykli ministranci bez PIN-u offline; konta uprzywilejowane zawsze wymagają PIN-u).',
        '• Kolejne błędne PIN-y blokują konto stopniowo (blokada_pin_log); Admin odblokowuje kody w zakładce Bezpieczeństwo. Wpis z odrzuconym PIN-em nie jest ponawiany.',
        '• Audyt: zakładka Audyt pokazuje zdarzenia (PIN, plakietki, punkty, kalendarz, ministranci, ustawienia, RODO, kontakt, asystent) i pozwala cofnąć wybrane zmiany; „Diagnostyka” sprawdza stan bazy. Komunikat o braku funkcji w bazie (PGRST202) oznacza, że nie uruchomiono odpowiedniego pliku z katalogu sql/.',
        '• RODO: zakładka RODO zawiera rejestr operacji na danych i czyszczenie danych po okresie retencji; wiadomości do Admina można czyścić (załatwione i stare). Dane osobowe nie opuszczają systemu przez asystenta — widzi on tylko zagregowane liczby.',
        '• Wiadomości z ekranu logowania są niezweryfikowane (nadawca nie jest zalogowany).'
    ].join('\n');

    function maskuj(tekst, maks) {
        let t = String(tekst == null ? '' : tekst);
        t = t.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+/gi, '[OBRAZ USUNIĘTY]');
        t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
        t = t.replace(/\b(?:MIN|ADMIN|KS|KSIADZ)\s*-\s*\d{3}\b/gi, '[KOD]');
        t = t.replace(/\b(pin|hasło|haslo|password)\b\s*[:=]?\s*\d{3,8}/gi, '$1 [PIN]');
        t = t.replace(/(?:\+?\d[\s-]?){9,}/g, '[NUMER]');                                  // telefon, PESEL, długie numery
        t = t.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/g, '[DATA]');                      // dd.mm.rrrr
        t = t.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '[DATA]');                              // rrrr-mm-dd
        const lim = maks || MAKS_TEKST;
        return t.length > lim ? t.slice(0, lim) + '…' : t;
    }

    // klucze o nazwach sugerujących dane osobowe są wycinane z agregatów (obrona w głąb — serwer i tak zwraca same liczby)
    const ZAKAZANE_KLUCZE = /imi[eę]|nazwisk|kod|pin|e-?mail|telefon|urodz|pesel|adres|token|haslo|hasło|password|zrzut/i;
    function czystyAgregat(v, glebokosc) {
        const g = glebokosc || 0;
        if (g > 5 || v == null) return null;
        if (typeof v === 'number') return isFinite(v) ? v : null;
        if (typeof v === 'boolean') return v;
        if (typeof v === 'string') return maskuj(v, 80);
        if (Array.isArray(v)) return v.slice(0, 60).map(x => czystyAgregat(x, g + 1)).filter(x => x !== null);
        if (typeof v === 'object') {
            const o = {};
            for (const k of Object.keys(v)) { if (ZAKAZANE_KLUCZE.test(k)) continue; const c = czystyAgregat(v[k], g + 1); if (c !== null) o[k] = c; }
            return o;
        }
        return null;
    }

    function sanityzujEkran(ekran) {
        if (!ekran || typeof ekran !== 'object') return null;
        const zakladka = String(ekran.zakladka || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
        const tekst = maskuj(ekran.tekst, MAKS_EKRAN);
        return tekst.trim() ? { zakladka, tekst } : null;
    }

    function sanityzujKontakt(k) {
        if (!k || typeof k !== 'object') return null;
        const kategoria = ['usterka', 'pytanie', 'pomysl', 'pilne', 'inne'].includes(k.kategoria) ? k.kategoria : 'inne';   // BEZ imienia autora, kodu i kontekstu przeglądarki
        const tresc = maskuj(k.tresc, MAKS_TEKST);
        return tresc.trim() ? { kategoria, tresc } : null;
    }

    function sanityzujWiadomosci(lista) {
        if (!Array.isArray(lista)) return [];
        return lista.filter(m => m && (m.rola === 'user' || m.rola === 'assistant') && typeof m.tresc === 'string' && m.tresc.trim())
            .slice(-MAKS_WIADOMOSCI).map(m => ({ role: m.rola, content: maskuj(m.tresc, MAKS_TEKST) }));
    }

    // Komunikaty dla modelu. Argumenty to WYŁĄCZNIE dane już zatwierdzone przez Admina (zgoda) — nigdy kod ani PIN Admina.
    function zbudujKomunikaty(o) {
        const msgs = [{ role: 'system', content: PROMPT_SYSTEMOWY }];
        if (o.wiedza === true) msgs.push({ role: 'system', content: WIEDZA_SYSTEMU });
        const opisDanych = o.zakres === 'miesiac' ? 'Dane zagregowane za wybrany miesiąc (same liczby, bez danych osobowych), JSON:' : (o.zakres === 'trendy' ? 'Zagregowane dane systemu wraz z seriami czasowymi (same liczby, bez danych osobowych), JSON:' : 'Zagregowane dane systemu (same liczby, bez danych osobowych), JSON:');
        if (o.agregaty) msgs.push({ role: 'system', content: opisDanych + '\n' + JSON.stringify(czystyAgregat(o.agregaty)) });
        const ekran = sanityzujEkran(o.ekran);
        if (ekran) msgs.push({ role: 'system', content: `Fragment ekranu, który Admin zatwierdził do wysłania (zakładka: ${ekran.zakladka || '?'}; dane zamaskowane):\n${ekran.tekst}` });
        const kontakt = sanityzujKontakt(o.kontakt);
        if (kontakt) msgs.push({ role: 'system', content: `Wiadomość do Admina (kategoria: ${kontakt.kategoria}), na którą Admin chce szkic odpowiedzi — dane zamaskowane:\n${kontakt.tresc}` });
        return msgs.concat(sanityzujWiadomosci(o.wiadomosci));
    }

    // Błędy API Mistral → kod dla interfejsu. zapasowy=true: warto spróbować mniejszego modelu (brak dostępu do modelu w tym planie).
    function mapujBladMistral(status, tekst) {
        const t = String(tekst || '').toLowerCase();
        if (status === 429) return { kod_bledu: 'limit', zapasowy: false };
        if (status === 402 || /insufficient|quota|credit|billing|payment/.test(t)) return { kod_bledu: 'brak_srodkow', zapasowy: false };
        if (status === 403 || status === 404 || /not available|subscription|tier|model.*not.*found|unknown model/.test(t)) return { kod_bledu: 'tier', zapasowy: true };
        if (status === 401) return { kod_bledu: 'klucz', zapasowy: false };
        return { kod_bledu: 'api', zapasowy: false };
    }

    const ZAKRESY = ['podstawowy', 'trendy', 'miesiac'];

    return { MAKS_TEKST, MAKS_EKRAN, MAKS_WIADOMOSCI, PROMPT_SYSTEMOWY, WIEDZA_SYSTEMU, ZAKRESY, maskuj, czystyAgregat, sanityzujEkran, sanityzujKontakt, sanityzujWiadomosci, zbudujKomunikaty, mapujBladMistral };
});
