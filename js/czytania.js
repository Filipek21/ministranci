// ============================================================================
// v2.16.00 — „Czytania na dziś”: przycisk (atrybut data-czytania-otworz) otwiera okno z widgetem Niedziela.pl.
//
// BEZPIECZEŃSTWO: widget to obcy skrypt (document.write + obrazki z obcych serwerów). Dlatego NIE jest wstawiany do aplikacji:
// działa w ramce <iframe sandbox="allow-scripts"> (bez allow-same-origin, bez allow-popups, bez allow-top-navigation) ładującej
// czytania.html — ma własną politykę CSP i nie ma dostępu do PIN-ów, sesji, localStorage ani DOM aplikacji.
// Ramka jest tworzona dopiero PO kliknięciu (brak połączeń z Niedziela.pl, dopóki ktoś nie otworzy okna) i niszczona po zamknięciu.
// Obsługa: Esc zamyka, kliknięcie tła zamyka, fokus wraca na przycisk, przewijanie strony pod spodem jest zablokowane.
// ============================================================================
(function (global) {
    'use strict';
    const ADRES = 'czytania.html';
    const SANDBOX = 'allow-scripts';                  // CELOWO nic więcej
    const KLASA_BLOKADY = 'czyt-otwarte';

    function tlum(klucz, zapas) { try { if (typeof global.t === 'function') { const w = global.t(klucz); if (w && w !== klucz) return w; } } catch (e) { /* ignoruj */ } return zapas; }
    function kodJezyka(dok) { const l = String((dok && dok.documentElement && dok.documentElement.lang) || 'pl').slice(0, 2).toLowerCase(); return (l === 'en' || l === 'uk') ? l : 'pl'; }
    function adresRamki(dok) {
        let v = ''; try { v = typeof WERSJA_APLIKACJI === 'string' ? WERSJA_APLIKACJI : ''; } catch (e) { /* ignoruj */ }   // const z js/wersja.js jest widoczna globalnie (nie jako właściwość window)
        return ADRES + '?v=' + encodeURIComponent(v) + '&j=' + kodJezyka(dok);
    }

    // Tworzy kontroler okna dla podanego dokumentu (parametr — żeby dało się testować w Node na atrapie DOM).
    function utworz(dok) {
        let nakladka = null, ostatniFokus = null;
        const obsluzKlawisz = (e) => { if (e && (e.key === 'Escape' || e.key === 'Esc')) zamknij(); };

        function zbuduj() {
            const el = (tag, klasa) => { const x = dok.createElement(tag); if (klasa) x.className = klasa; return x; };
            const n = el('div', 'czyt-nakladka');
            n.setAttribute('role', 'dialog'); n.setAttribute('aria-modal', 'true'); n.setAttribute('aria-label', tlum('czyt.title', 'Czytania na dziś'));
            const okno = el('div', 'czyt-okno');
            const pasek = el('div', 'czyt-pasek');
            const tytul = el('h3', 'czyt-tytul'); tytul.textContent = tlum('czyt.title', 'Czytania na dziś');
            const zamk = el('button', 'czyt-zamknij'); zamk.setAttribute('type', 'button'); zamk.setAttribute('aria-label', tlum('czyt.close', 'Zamknij')); zamk.textContent = '✕';
            zamk.addEventListener('click', () => zamknij());
            pasek.appendChild(tytul); pasek.appendChild(zamk);
            const ramka = el('iframe', 'czyt-iframe');
            ramka.setAttribute('sandbox', SANDBOX);                       // izolacja: opaque origin, brak dostępu do aplikacji
            ramka.setAttribute('referrerpolicy', 'origin');
            ramka.setAttribute('title', tlum('czyt.title', 'Czytania na dziś'));
            ramka.setAttribute('src', adresRamki(dok));
            const nota = el('p', 'czyt-nota'); nota.textContent = tlum('czyt.note', 'Treść pochodzi z serwisu Niedziela.pl i wymaga internetu. Po otwarciu okna Twoje urządzenie łączy się z serwerami Niedziela.pl.');
            okno.appendChild(pasek); okno.appendChild(ramka); okno.appendChild(nota); n.appendChild(okno);
            n.addEventListener('click', (e) => { if (e && e.target === n) zamknij(); });
            n._zamk = zamk; n._ramka = ramka;
            return n;
        }
        function otworz(zrodlo) {
            if (nakladka) return nakladka;
            ostatniFokus = zrodlo || null;
            nakladka = zbuduj();
            dok.body.appendChild(nakladka);
            dok.documentElement.classList.add(KLASA_BLOKADY);
            dok.addEventListener('keydown', obsluzKlawisz);
            try { nakladka._zamk.focus(); } catch (e) { /* ignoruj */ }
            return nakladka;
        }
        function zamknij() {
            if (!nakladka) return false;
            try { nakladka._ramka.setAttribute('src', 'about:blank'); } catch (e) { /* ignoruj */ }   // zatrzymuje widget, zanim ramka zniknie
            try { nakladka.remove(); } catch (e) { if (nakladka.parentNode) nakladka.parentNode.removeChild(nakladka); }
            nakladka = null;
            dok.documentElement.classList.remove(KLASA_BLOKADY);
            dok.removeEventListener('keydown', obsluzKlawisz);
            try { if (ostatniFokus && ostatniFokus.focus) ostatniFokus.focus(); } catch (e) { /* ignoruj */ }
            ostatniFokus = null;
            return true;
        }
        function podepnij() {
            if (!dok.querySelectorAll) return 0;
            let n = 0;
            dok.querySelectorAll('[data-czytania-otworz]').forEach((b) => { b.addEventListener('click', (e) => { if (e && e.preventDefault) e.preventDefault(); otworz(b); }); n++; });
            return n;
        }
        return { otworz, zamknij, podepnij, czyOtwarte: () => !!nakladka, adresRamki: () => adresRamki(dok) };
    }

    const API = { utworz, ADRES, SANDBOX, KLASA_BLOKADY, adresRamki, kodJezyka };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && global === window) {
        const kontroler = utworz(document);
        global.EMCzytania = Object.freeze({ otworz: kontroler.otworz, zamknij: kontroler.zamknij, czyOtwarte: kontroler.czyOtwarte });
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kontroler.podepnij); else kontroler.podepnij();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
