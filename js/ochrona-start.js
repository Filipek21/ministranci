// ============================================================================
// OCHRONA START (v2.15.14) — mały skrypt ładowany JAKO PIERWSZY na każdej stronie.
//  1) Zasłania stronę, gdy jest osadzona w ramce OBCEJ domeny (clickjacking). <meta> CSP nie
//     obsługuje frame-ancestors, a GitHub Pages nie pozwala ustawić nagłówków — to jedyna dostępna obrona.
//  2) Redaguje sekrety w konsoli (PIN-y, tokeny, JWT, nagłówki Authorization; od v2.15.17 także e-maile, telefony i PESEL), żeby zrzut ekranu
//     z konsoli, narzędzia diagnostyczne lub rozszerzenie przeglądarki nie wyniosły ich w logach.
// Nic nie zmienia w działaniu aplikacji: wywołania console.* działają jak dotąd, tylko z zasłoniętymi sekretami.
// ============================================================================
(function (global) {
    'use strict';
    const MASKA = '[ukryte]';
    const RE_KLUCZ_SEKRETU = /(^|_)(pin|pin_admina|pin_jawny|token|kod_admina|haslo|password|secret|authorization|apikey|api_key|jwt|bearer)(_|$)/i;
    const RE_JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
    const RE_BEARER = /(Bearer\s+)[A-Za-z0-9._~+\/=-]{8,}/gi;
    const RE_PIN_W_TEKSCIE = /((?:p_)?(?:pin|pin_admina|pin_jawny|token|kod_admina)["']?\s*[:=]\s*["']?)[^\s"',;}]{1,200}/gi;

    // v2.15.17: w logach konsoli zasłaniamy także dane osobowe o jednoznacznej strukturze: e-mail, polski numer telefonu
    // (+48 / 9 cyfr w grupach) i PESEL (z kontrolą sumy i daty — zwykłe liczby i znaczniki czasu zostają).
    const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const RE_TELEFON = /(?:\+48[\s-]?)?(?<![0-9A-Za-z])\d{3}[\s-]\d{3}[\s-]\d{3}(?![0-9A-Za-z])|\+48[\s-]?\d{9}(?![0-9A-Za-z])/g;
    const RE_11_CYFR = /(?<![0-9A-Za-z])\d{11}(?![0-9A-Za-z])/g;
    function peselPoprawny(s) {
        if (!/^\d{11}$/.test(s)) return false;
        const d = s.split('').map(Number), w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
        let suma = 0; for (let i = 0; i < 10; i++) suma += d[i] * w[i];
        if ((10 - (suma % 10)) % 10 !== d[10]) return false;
        const mm = d[2] * 10 + d[3], dd = d[4] * 10 + d[5], wiek = Math.floor(mm / 20), mies = mm % 20;
        return mies >= 1 && mies <= 12 && wiek <= 4 && dd >= 1 && dd <= 31;
    }

    function zredagujTekst(s) {
        return String(s).replace(RE_JWT, MASKA).replace(RE_BEARER, '$1' + MASKA).replace(RE_PIN_W_TEKSCIE, '$1' + MASKA)
            .replace(RE_EMAIL, MASKA).replace(RE_TELEFON, MASKA).replace(RE_11_CYFR, (m) => (peselPoprawny(m) ? MASKA : m));
    }

    function zredaguj(w, glebokosc, widziane) {
        glebokosc = glebokosc || 0;
        if (typeof w === 'string') return zredagujTekst(w);
        if (w === null || typeof w !== 'object') return w;
        if (w instanceof Error) {
            const tekst = zredagujTekst(w.message || '');
            return tekst === (w.message || '') ? w : (w.name || 'Error') + ': ' + tekst;
        }
        const proto = Object.getPrototypeOf(w);
        const zwykly = Array.isArray(w) || proto === Object.prototype || proto === null;
        if (!zwykly) return w;                         // węzły DOM, Mapy, zdarzenia itd. — bez zmian
        if (glebokosc >= 4) return w;
        widziane = widziane || new WeakSet();
        if (widziane.has(w)) return '[cykl]';
        widziane.add(w);
        if (Array.isArray(w)) return w.map(x => zredaguj(x, glebokosc + 1, widziane));
        const wynik = {};
        for (const k of Object.keys(w)) {
            wynik[k] = RE_KLUCZ_SEKRETU.test(k) && w[k] !== null && w[k] !== undefined && w[k] !== '' ? MASKA : zredaguj(w[k], glebokosc + 1, widziane);
        }
        return wynik;
    }

    function zabezpieczKonsole(konsola) {
        if (!konsola || konsola.__emOchrona) return;
        ['log', 'info', 'warn', 'error', 'debug', 'trace'].forEach(function (nazwa) {
            const oryg = konsola[nazwa];
            if (typeof oryg !== 'function') return;
            konsola[nazwa] = function () {
                let args;
                try { args = Array.prototype.map.call(arguments, function (a) { return zredaguj(a); }); } catch (e) { args = arguments; }
                return oryg.apply(konsola, args);
            };
        });
        try { Object.defineProperty(konsola, '__emOchrona', { value: true }); } catch (e) { /* ignoruj */ }
    }

    function zaslonDlaObcejRamki(okno) {
        try {
            if (okno.top === okno.self) return false;
            void okno.top.location.href;               // ta sama domena: wolno (rzuca wyjątek dla obcej)
            return false;
        } catch (e) {
            try {
                const st = okno.document.documentElement;
                st.style.setProperty('display', 'none', 'important');
                if (okno.top && okno.top.location) { /* próba ucieczki z ramki; zwykle zablokowana — zasłona i tak działa */ }
            } catch (x) { /* ignoruj */ }
            return true;
        }
    }

    const API = { zredaguj, zredagujTekst, zabezpieczKonsole, zaslonDlaObcejRamki, peselPoprawny, MASKA };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') {
        global.EMOchrona = API;
        zaslonDlaObcejRamki(global);
        zabezpieczKonsole(global.console);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
