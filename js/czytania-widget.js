// ============================================================================
// v2.16.01 — ładowarka widgetu Niedziela.pl dla strony czytania.html (działa wewnątrz odizolowanej ramki, nie w aplikacji).
// Widget obsługuje parametr „data” (ilość dni od dziś: 0 = dziś, 1 = jutro, 2 = pojutrze — patrz niedziela.pl/webmaster/liturgia).
// Strona dostaje dzień w adresie (?d=1 / ?d=2) od okna czytań (js/czytania.js). Dozwolone są WYŁĄCZNIE wartości 1 i 2 (inne = dziś),
// więc nic z adresu strony nie trafia do adresu widgetu poza jedną cyfrą. Skrypt musi być wczytany synchronicznie w miejscu,
// w którym ma pojawić się treść (widget używa document.write), dlatego jest zwykłym <script src> wewnątrz #czyt-tresc.
// Dla „dziś” adres widgetu jest taki sam jak w wersji 2.16.00 (bez parametru).
// ============================================================================
(function (global) {
    'use strict';
    const BAZA = 'https://widget.niedziela.pl/liturgia_out.js.php';
    function dzien(search) {
        try { const d = new URLSearchParams(search || '').get('d'); return (d === '1' || d === '2') ? d : '0'; } catch (e) { return '0'; }
    }
    function adres(search) { const d = dzien(search); return d === '0' ? BAZA : BAZA + '?data=' + d; }
    const API = { BAZA, dzien, adres };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && global === window) {
        document.write('<script src="' + adres(window.location.search) + '"><\/script>');
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
