// ============================================================================
// v2.16.00 — skrypt STRONY czytania.html (działa wewnątrz odizolowanej ramki, nie w aplikacji).
//  • sprawdza, czy widget Niedziela.pl się załadował (brak internetu / domena niezgłoszona / blokada → czytelny komunikat zamiast pustej ramki),
//  • odczytuje z nagłówka widgetu „Kolor szat: …” i ustawia kolor paska liturgicznego (zmienna CSS --kolor-szat, atrybut data-kolor).
// Czyste funkcje (normalizuj, kolorSzat) są testowane w Node (tests/czytania-2160.test.mjs).
// ============================================================================
(function (global) {
    'use strict';
    const TEKSTY = {
        pl: { ladowanie: 'Ładowanie czytań…', blad: 'Nie udało się pobrać czytań. Sprawdź połączenie z internetem i spróbuj ponownie. Jeśli problem się powtarza, adres tej strony może nie być zgłoszony w serwisie Niedziela.pl — powiadom administratora.' },
        en: { ladowanie: 'Loading readings…', blad: 'Could not load the readings. Check your internet connection and try again. If the problem persists, the address of this site may not be registered with Niedziela.pl — tell the administrator.' },
        uk: { ladowanie: 'Завантаження читань…', blad: 'Не вдалося завантажити читання. Перевірте інтернет і спробуйте ще раз. Якщо проблема повторюється, адреса цього сайту може бути не зареєстрована в Niedziela.pl — повідомте адміністратора.' }
    };
    // Kolory szat liturgicznych (klucz = nazwa bez polskich znaków, jak zwraca widget: „bialy”, „zielony”…)
    const KOLORY = { bialy: '#ffffff', czerwony: '#c62828', zielony: '#2e7d32', fioletowy: '#6a1b9a', rozowy: '#e8579a', zloty: '#d4af37', czarny: '#222222' };

    function normalizuj(s) {
        let t = String(s == null ? '' : s).toLowerCase();
        try { t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* stare środowisko */ }
        return t.replace(/ł/g, 'l');
    }
    // „… Kolor szat: bialy Rok A, II …” → { klucz: 'bialy', hex: '#ffffff' }; nieznany lub brak → null
    function kolorSzat(tekst) {
        const m = /kolor szat:\s*([a-z]+)/.exec(normalizuj(tekst));
        if (!m || !Object.prototype.hasOwnProperty.call(KOLORY, m[1])) return null;
        return { klucz: m[1], hex: KOLORY[m[1]] };
    }
    function jezyk(search) {
        try { const j = new URLSearchParams(search || '').get('j'); return Object.prototype.hasOwnProperty.call(TEKSTY, j) ? j : 'pl'; } catch (e) { return 'pl'; }
    }
    function uruchom(dok, search) {
        const j = jezyk(search);
        dok.documentElement.lang = j === 'uk' ? 'uk' : (j === 'en' ? 'en-GB' : 'pl');
        const status = dok.getElementById('czyt-status');
        const liturgia = dok.getElementById('nd_liturgia');
        if (!liturgia) { if (status) { status.textContent = TEKSTY[j].blad; status.className = 'blad'; } return false; }
        if (status) status.hidden = true;
        const dzien = dok.querySelector('p.nd_dzien');
        const k = dzien ? kolorSzat(dzien.textContent) : null;
        if (k) { dok.documentElement.style.setProperty('--kolor-szat', k.hex); dok.documentElement.setAttribute('data-kolor', k.klucz); }
        return true;
    }
    const API = { TEKSTY, KOLORY, normalizuj, kolorSzat, jezyk, uruchom };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && global === window) {
        const start = () => uruchom(document, window.location.search);
        const ladowanie = document.getElementById('czyt-status');
        if (ladowanie) ladowanie.textContent = TEKSTY[jezyk(window.location.search)].ladowanie;
        if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
