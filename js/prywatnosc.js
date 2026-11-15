// ============================================================================
// PRYWATNOŚĆ (v2.15.15) — minimalizacja danych osobowych (w tym DZIECI) wyświetlanych i trzymanych na urządzeniach.
//  1) PIN-y w panelu Admina są domyślnie ZAMASKOWANE (••••); dotknięcie/Enter odsłania na 8 s, potem znów maska.
//     Maska znika też po schowaniu karty, zamknięciu strony i blokadzie bezczynności. Chroni przed podglądaniem
//     zza pleców i przed zrzutami ekranu — NIE przed DevTools (PIN jest w atrybucie data-pin, bo aplikacja musi go znać
//     do wydruku plakietek).
//  2) Kiosk (wspólny ekran w zakrystii) pokazuje „Jan K.” zamiast pełnego nazwiska.
//  3) Cache offline Kiosku trzyma tylko inicjał nazwiska i nie trzyma e-maili / telefonów / PESEL / dat urodzenia
//     (gdyby kiedyś trafiły do odpowiedzi serwera). Skradziony tablet ujawnia mniej.
//  5) (v2.15.17) Ekran prywatności: gdy karta trafia do tła, cała zawartość jest zasłonięta (migawki przełącznika aplikacji).
//  4) Pola formularzy: wyłączone autouzupełnianie, sprawdzanie pisowni i autokorekta (przeglądarka/klawiatura nie
//     zapamiętuje imion i nazwisk dzieci w swoich słownikach, o ile pole samo nie ustawia tych atrybutów).
// Czyste funkcje (testowane w Node) + cienka warstwa DOM. Niczego nie usuwa z istniejących funkcji.
// ============================================================================
(function (global) {
    'use strict';
    const CZAS_ODSLONIECIA_MS = 8000;
    const POLA_USUWANE_Z_CACHE = ['email', 'e_mail', 'telefon', 'tel', 'pesel', 'data_urodzenia', 'adres', 'rodzic_email', 'rodzic_telefon',
        // v2.15.17: kolejne pola, które mogłyby kiedyś trafić do odpowiedzi serwera (nic z tego Kiosk nie potrzebuje)
        'nr_telefonu', 'numer_telefonu', 'telefon_rodzica', 'opiekun', 'opiekun_email', 'opiekun_telefon', 'rodzic', 'imie_rodzica', 'nazwisko_rodzica',
        'ulica', 'miejscowosc', 'kod_pocztowy', 'data_ur', 'rok_urodzenia', 'zdjecie', 'foto', 'avatar', 'uwagi_zdrowotne', 'alergie'];

    function ucieknij(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function pierwszaLitera(s) { const z = Array.from(String(s == null ? '' : s).trim()); return z.length ? z[0].toUpperCase() : ''; }

    // „Jan Kowalski” → „Jan K.”; nazwisko już skrócone („K.”) zostaje; brak nazwiska → samo imię.
    function skrocNazwisko(imie, nazwisko) {
        const i = String(imie == null ? '' : imie).trim();
        const l = pierwszaLitera(nazwisko);
        return (i + (l ? ' ' + l + '.' : '')).trim();
    }

    function etykieta(klucz, domyslna) {
        try { if (typeof global.t === 'function') { const e = global.t(klucz); if (e && e !== klucz) return e; } } catch (e) { /* i18n jeszcze niewczytane */ }
        return domyslna;
    }

    // HTML maski PIN-u (do wstawienia w szablonie). Wartość trafia do atrybutu przez ucieczkę HTML.
    function pinMaska(pin) {
        if (pin == null || pin === '') return '—';
        return '<span class="pin-maska" role="button" tabindex="0" data-pin="' + ucieknij(pin) + '" title="' + ucieknij(etykieta('priv.pin_show', 'Dotknij, aby pokazać PIN')) + '">••••</span>';
    }

    // Kopia danych cache bez pól wrażliwych i z nazwiskiem skróconym do inicjału. Nie zmienia wejścia. Idempotentna.
    function zminimalizujCache(dane) {
        if (!dane || typeof dane !== 'object') return { dane, zmieniono: false };
        let zmieniono = false;
        const kopia = Object.assign({}, dane);
        for (const klucz of Object.keys(kopia)) {
            if (!Array.isArray(kopia[klucz])) continue;
            kopia[klucz] = kopia[klucz].map((el) => {
                if (!el || typeof el !== 'object' || Array.isArray(el)) return el;
                let q = el;
                const kopiuj = () => { if (q === el) q = Object.assign({}, el); };
                if (typeof el.nazwisko === 'string' && el.nazwisko !== '') {
                    const skrot = pierwszaLitera(el.nazwisko) + '.';
                    if (el.nazwisko !== skrot) { kopiuj(); q.nazwisko = skrot; zmieniono = true; }
                }
                for (const p of POLA_USUWANE_Z_CACHE) if (p in el) { kopiuj(); delete q[p]; zmieniono = true; }
                return q;
            });
        }
        return { dane: kopia, zmieniono };
    }

    // --- warstwa DOM -----------------------------------------------------------------------
    function odslon(el, ustawTimer) {
        if (!el || !el.dataset || el.dataset.pin == null) return;
        el.textContent = el.dataset.pin;
        el.classList.add('odslonieto');
        if (el.__emTimer) clearTimeout(el.__emTimer);
        el.__emTimer = (ustawTimer || setTimeout)(() => zamaskuj(el), CZAS_ODSLONIECIA_MS);
    }
    function zamaskuj(el) {
        if (!el) return;
        if (el.__emTimer) { clearTimeout(el.__emTimer); el.__emTimer = null; }
        el.textContent = '••••';
        if (el.classList) el.classList.remove('odslonieto');
    }
    function zamaskujWszystko() {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('.pin-maska.odslonieto').forEach(zamaskuj);
    }

    function utwardzPole(el) {
        if (!el || typeof el.setAttribute !== 'function' || typeof el.hasAttribute !== 'function') return;
        if (!el.hasAttribute('autocomplete')) el.setAttribute('autocomplete', 'off');
        if (!el.hasAttribute('spellcheck')) el.setAttribute('spellcheck', 'false');
        if (!el.hasAttribute('autocorrect')) el.setAttribute('autocorrect', 'off');
    }
    function utwardzPola(korzen) {
        if (!korzen || typeof korzen.querySelectorAll !== 'function') return;
        korzen.querySelectorAll('input, textarea').forEach(utwardzPole);
    }

    // --- v2.15.17: EKRAN PRYWATNOŚCI -------------------------------------------------------------------
    // Gdy karta/aplikacja trafia do tła (przełącznik aplikacji na telefonie, minimalizacja okna), system robi jej migawkę —
    // bez tego na niej widać listy dzieci, punkty i PIN-y. Klasa em-ukryj-tresc (css/style.css) zasłania całą zawartość
    // na czas, gdy strona jest niewidoczna; po powrocie klasa znika. To ochrona przed PODGLĄDEM, nie przed DevTools.
    const KLASA_EKRANU = 'em-ukryj-tresc';
    function ustawEkranPrywatnosci(wlaczony, dok) {
        const d = dok || (typeof document !== 'undefined' ? document : null);
        if (!d || !d.documentElement || !d.documentElement.classList) return false;
        if (wlaczony) d.documentElement.classList.add(KLASA_EKRANU); else d.documentElement.classList.remove(KLASA_EKRANU);
        return true;
    }

    // Wspólny „wyłącznik awaryjny”: maski PIN, zasłona ekranu. Wołany przy schowaniu strony i zamknięciu.
    function wygaszDaneNaEkranie() { zamaskujWszystko(); ustawEkranPrywatnosci(true); }

    const API = { skrocNazwisko, pinMaska, zminimalizujCache, odslon, zamaskuj, zamaskujWszystko, utwardzPole, utwardzPola, ucieknij, CZAS_ODSLONIECIA_MS, POLA_USUWANE_Z_CACHE, ustawEkranPrywatnosci, wygaszDaneNaEkranie, KLASA_EKRANU };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;

    if (typeof document !== 'undefined') {
        global.EMPrywatnosc = API;
        const reaguj = (e) => { const el = e.target && e.target.closest ? e.target.closest('.pin-maska') : null; if (el) odslon(el); };
        document.addEventListener('click', reaguj);
        document.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const el = e.target && e.target.closest ? e.target.closest('.pin-maska') : null; if (el) { e.preventDefault(); odslon(el); } } });
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { zamaskujWszystko(); ustawEkranPrywatnosci(true); } else ustawEkranPrywatnosci(false); });
        global.addEventListener('pagehide', wygaszDaneNaEkranie);
        global.addEventListener('pageshow', () => ustawEkranPrywatnosci(false));   // powrót z pamięci podręcznej stron (bfcache) — zdejmij zasłonę
        const start = () => {
            utwardzPola(document);
            try { new MutationObserver((lista) => lista.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches && n.matches('input, textarea')) utwardzPole(n); utwardzPola(n); } }))).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* ignoruj */ }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
