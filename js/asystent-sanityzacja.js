// ============================================================================
// asystent-sanityzacja.js — v2.15.05 — maskowanie danych PRZED wysłaniem do modelu AI (Asystent Admina)
// Czyste funkcje, bez sieci i DOM. Ten plik działa: (1) w przeglądarce (window.EMSanityzacja), (2) w testach Node (require),
// (3) w Edge Function (Deno: import "./sanityzacja.js" → globalThis.EMSanityzacja). Kopia dla Edge Function:
// supabase/functions/asystent/sanityzacja.js — MUSI być identyczna (pilnuje tego test).
// Zasada: do modelu nie trafiają PIN-y, kody kont, e-maile, numery telefonów / PESEL, daty z rokiem (np. urodzenia),
// obrazy (data:…;base64) ani żadne pola o nazwach sugerujących dane osobowe. (v2.15.17: + URL-e, IP, UUID, tokeny, IBAN, adresy, kody pocztowe,
// zaciemnione e-maile, znane imiona i nazwiska oraz niezależna kontrola wyjścia — patrz maskuj / zawieraDaneOsobowe.) Imion i nazwisk w dowolnym tekście nie da się
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
        'Nie oceniasz charakteru ani zachowania konkretnych osób; mówisz o liczbach, statusach i procedurach. Nie zgaduj tożsamości osób. Dane w rozmowie są zanonimizowane (znaczniki typu [KOD], [EMAIL], [NUMER], [DATA], [OSOBA], [ADRES], [URL]) — nie próbuj ich odtwarzać.',
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

    // ---------------------------------------------------------------------------------------------
    // v2.15.17 — MASKOWANIE UTWARDZONE. Wszystkie dotychczasowe maski działają jak wcześniej ([OBRAZ USUNIĘTY], [EMAIL], [KOD],
    // [PIN], [NUMER], [DATA]); doszły: normalizacja Unicode (cyfry pełnoszerokie/arabskie, niewidoczne znaki wstawiane, żeby
    // oszukać wzorce), URL-e, adresy IP, UUID, tokeny/JWT, IBAN, kody pocztowe, adresy ulic, daty z 2-cyfrowym rokiem i z nazwą
    // miesiąca, „ur. 2010”, zaciemnione e-maile ([at], małpa) oraz maskowanie ZNANYCH imion i nazwisk (opcje.znaneNazwy).
    // Maskowanie jest „best effort” — dlatego po nim działa niezależna KONTROLA WYJŚCIA (zawieraDaneOsobowe / znajdzNaruszenia),
    // a Edge Function ODMAWIA wysyłki do modelu (kod „pii”), gdy cokolwiek podejrzanego zostało (fail-closed).
    // ---------------------------------------------------------------------------------------------
    function normalizuj(wejscie) {
        let t = String(wejscie == null ? '' : wejscie);
        try { t = t.normalize('NFKC'); } catch (e) { /* stare środowisko */ }
        t = t.replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');                    // niewidoczne znaki
        t = t.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0));   // cyfry arabsko-indyjskie / perskie
        return t;
    }

    const MIESIACE = 'stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|wrze[sś]nia|pa[zź]dziernika|listopada|grudnia';
    const RE_ADRES = new RegExp('(?:\\b(?:ul|al|os|pl)\\.|\\b(?:ulica|aleja|osiedle|plac))\\s*[\\p{L}.\'-]+(?:\\s+[\\p{L}.\'-]+){0,2}?\\s+\\d{1,4}[A-Za-z]?(?:\\s*\\/\\s*\\d{1,4}[A-Za-z]?)?', 'giu');

    // dd.mm.rr z poprawnym dniem (1–31) i miesiącem (1–12). „2.15.17” (wersja aplikacji) nie jest datą: miesiąc 15; „wersja 2.12.05” / „v2.12.05” też zostają.
    const RE_DATA_KROTKA = /(?<![\d.])(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-]\d{2}(?![\d.])/g;
    function poprzedzonoWersja(tekst, offset) { return /(?:\bv|wersj[a-zęó]*:?)\s*$/i.test(String(tekst).slice(Math.max(0, offset - 20), offset)); }

    // Poprawny PESEL (suma kontrolna wag 1-3-7-9 + miesiąc kodujący wiek + dzień 1–31)
    function peselPoprawny(s) {
        if (!/^\d{11}$/.test(s)) return false;
        const d = s.split('').map(Number), w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
        let suma = 0; for (let i = 0; i < 10; i++) suma += d[i] * w[i];
        if ((10 - (suma % 10)) % 10 !== d[10]) return false;
        const mm = d[2] * 10 + d[3], dd = d[4] * 10 + d[5], wiek = Math.floor(mm / 20), mies = mm % 20;
        return mies >= 1 && mies <= 12 && wiek <= 4 && dd >= 1 && dd <= 31;
    }
    const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');

    // Wyrażenie dla znanych imion i nazwisk. Rdzeń: słowo bez ostatniej litery (odmiana: Kowalski → Kowalskiego), dopuszczalne do 5 liter końcówki.
    function budujWyrazenieNazw(nazwy) {
        const tokeny = new Set();
        (Array.isArray(nazwy) ? nazwy : []).slice(0, 4000).forEach((n) => {
            String(n == null ? '' : n).split(/[\s,;]+/).forEach((tok) => {
                const czysty = tok.replace(/[^\p{L}'-]/gu, '');
                if (Array.from(czysty).length >= 3) tokeny.add(czysty.toLowerCase());
            });
        });
        if (!tokeny.size) return null;
        const rdzenie = Array.from(tokeny).map((t) => { const z = Array.from(t); return escRe((z.length >= 5 ? z.slice(0, -1) : z).join('')); }).sort((a, b) => b.length - a.length);
        try { return new RegExp('(?<![\\p{L}])(?:' + rdzenie.join('|') + ')[\\p{L}]{0,5}(?![\\p{L}])', 'giu'); } catch (e) { return null; }
    }
    // Wygodny pomocnik: lista obiektów { imie, nazwisko } → tablica napisów dla opcje.znaneNazwy
    function nazwyZListy(lista) {
        const w = [];
        (Array.isArray(lista) ? lista : []).forEach((o) => { if (o && typeof o === 'object') { if (o.imie) w.push(String(o.imie)); if (o.nazwisko) w.push(String(o.nazwisko)); } });
        return w;
    }

    function maskuj(tekst, maks, opcje) {
        let t = normalizuj(tekst);
        t = t.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+/gi, '[OBRAZ USUNIĘTY]');
        t = t.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[SEKRET]');                         // JWT
        t = t.replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/gi, '[SEKRET]');
        t = t.replace(/\b(?:sb_(?:secret|publishable)_|sk-|pk_|api[_-]?key[=:]\s*)[A-Za-z0-9_-]{8,}/gi, '[SEKRET]');
        t = t.replace(/\bhttps?:\/\/[^\s<>"')]+/gi, '[URL]').replace(/\bwww\.[^\s<>"')]+/gi, '[URL]');
        t = t.replace(/[A-Za-z0-9._%+-]+\s*[\[({]\s*(?:at|małpa|malpa)\s*[\])}]\s*[A-Za-z0-9.-]+\s*[\[({]?\s*(?:dot|kropka|\.)\s*[\])}]?\s*[A-Za-z]{2,}/gi, '[EMAIL]');   // jan [at] x [dot] pl
        t = t.replace(/[A-Za-z0-9._%+-]+\s+(?:małpa|malpa)\s+[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi, '[EMAIL]');
        t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]');
        t = t.replace(/\b(?:MIN|ADMIN|KS|KSIADZ)\s*-\s*\d{3}\b/gi, '[KOD]');
        t = t.replace(/\b(pin|hasło|haslo|password)\b\s*[:=]?\s*\d{3,8}/gi, '$1 [PIN]');
        t = t.replace(/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,4})?\b/g, '[NUMER]');                       // IBAN
        t = t.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[ID]');                          // UUID (np. kiosk_id)
        t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]').replace(/\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b/gi, '[IP]');
        t = t.replace(/\b(?=[A-Za-z0-9_+\/=-]*\d)(?=[A-Za-z0-9_+\/=-]*[A-Za-z])[A-Za-z0-9_+\/=-]{40,}\b/g, '[SEKRET]');                                                              // długie ciągi (tokeny, hashe)
        t = t.replace(/\b(tel\.?|telefon|kom\.?|komórka|komorka|numer)\s*:?\s*\+?\d[\d\s()-]{3,}\d/gi, '$1 [NUMER]');           // numery krótsze niż 9 cyfr z etykietą
        t = t.replace(/\+?\d(?:[\s-]?\d){8,}/g, '[NUMER]');                                                                     // telefon, PESEL, długie numery (bez „połykania” spacji za numerem)
        t = t.replace(/\b\d{3}[ -]\d{2}[ -]\d{2}\b/g, '[NUMER]').replace(/\b\d{3}\.\d{3}\.\d{3}\b/g, '[NUMER]');
        t = t.replace(/\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/g, '[DATA]');                                                         // dd.mm.rrrr
        t = t.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '[DATA]');                                                                 // rrrr-mm-dd
        t = t.replace(RE_DATA_KROTKA, (m, ...r) => (poprzedzonoWersja(r[r.length - 1], r[r.length - 2]) ? m : '[DATA]'));         // dd.mm.rr (poprawny dzień i miesiąc; numery wersji zostają)
        t = t.replace(new RegExp('\\b\\d{1,2}\\s+(?:' + MIESIACE + ')\\s+\\d{4}\\b', 'gi'), '[DATA]');                           // 12 marca 2008
        t = t.replace(/\b(ur\.|urodz\w*|rocznik|r\.\s*ur\.)\s*:?\s*(?:19|20)\d{2}\b/gi, '$1 [DATA]');                          // ur. 2010
        t = t.replace(/\b\d{2}-\d{3}\b/g, '[KOD_POCZTOWY]');
        t = t.replace(RE_ADRES, '[ADRES]');
        const re = opcje && opcje.znaneNazwy ? budujWyrazenieNazw(opcje.znaneNazwy) : null;
        if (re) t = t.replace(re, '[OSOBA]');
        const lim = maks || MAKS_TEKST;
        return t.length > lim ? t.slice(0, lim) + '…' : t;
    }

    // ---------------------------------------------------------------------------------------------
    // KONTROLA WYJŚCIA — niezależna od maskuj(): szuka tego, co NIE powinno już być w tekście wysyłanym do modelu.
    // Zwraca tablicę rodzajów (puste = czysto). tryb 'agregat' pomija regułę „długi ciąg cyfr” (w JSON liczby są normalne).
    // ---------------------------------------------------------------------------------------------
    function zawieraDaneOsobowe(tekst, tryb) {
        const t = normalizuj(tekst);
        const w = [];
        if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) w.push('email');
        if (/[A-Za-z0-9._%+-]+\s*[\[({]\s*(?:at|małpa|malpa)\s*[\])}]/i.test(t)) w.push('email_zaciemniony');
        if (/data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(t)) w.push('obraz');
        if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(t) || /\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/i.test(t)) w.push('token');
        if (/\bhttps?:\/\//i.test(t) || /\bwww\./i.test(t)) w.push('url');
        if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(t)) w.push('ip');
        if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(t)) w.push('uuid');
        if (/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}\b/.test(t)) w.push('iban');
        if (/\b(?:MIN|ADMIN|KS|KSIADZ)\s*-\s*\d{3}\b/i.test(t)) w.push('kod_konta');
        if (/\b(pin|hasło|haslo|password)\b\s*[:=]?\s*\d{3,8}/i.test(t)) w.push('pin');
        if (/\b\d{2}-\d{3}\b/.test(t)) w.push('kod_pocztowy');
        const re11 = /(?<![0-9A-Za-z])\d{11}(?![0-9A-Za-z])/g; let m;
        while ((m = re11.exec(t)) !== null) { if (peselPoprawny(m[0])) { w.push('pesel'); break; } }
        if (/\+48[\s-]?\d/.test(t) || /(?<![0-9A-Za-z])\d{3}[\s-]\d{3}[\s-]\d{3}(?![0-9A-Za-z])/.test(t)) w.push('telefon');
        if (tryb !== 'agregat' && /(?:\d[\s-]?){9,}/.test(t)) w.push('dlugi_numer');
        if (tryb !== 'agregat') {
            let d = /\b\d{4}-\d{1,2}-\d{1,2}\b/.test(t) || /\b\d{1,2}[./-]\d{1,2}[./-]\d{4}\b/.test(t);
            if (!d) { const re = new RegExp(RE_DATA_KROTKA.source, 'g'); let q; while ((q = re.exec(t)) !== null) { if (!poprzedzonoWersja(t, q.index)) { d = true; break; } } }
            if (d) w.push('data');
        }
        return w;
    }

    // Sprawdza komunikaty złożone przez zbudujKomunikaty(). Statyczne prompty pomijamy (testowane osobno),
    // opis zagregowanych liczb sprawdzamy łagodniej. Zwraca [{ indeks, rola, rodzaje }].
    function znajdzNaruszenia(komunikaty) {
        const wynik = [];
        (Array.isArray(komunikaty) ? komunikaty : []).forEach((m, i) => {
            if (!m || typeof m.content !== 'string') return;
            if (m.content === PROMPT_SYSTEMOWY || m.content === WIEDZA_SYSTEMU) return;
            const agregat = m.role === 'system' && /^(Dane zagregowane|Zagregowane dane)/.test(m.content);
            const rodzaje = zawieraDaneOsobowe(m.content, agregat ? 'agregat' : 'tekst');
            if (rodzaje.length) wynik.push({ indeks: i, rola: m.role, rodzaje });
        });
        return wynik;
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

    return { MAKS_TEKST, MAKS_EKRAN, MAKS_WIADOMOSCI, PROMPT_SYSTEMOWY, WIEDZA_SYSTEMU, ZAKRESY, maskuj, normalizuj, nazwyZListy, peselPoprawny, zawieraDaneOsobowe, znajdzNaruszenia, czystyAgregat, sanityzujEkran, sanityzujKontakt, sanityzujWiadomosci, zbudujKomunikaty, mapujBladMistral };
});
