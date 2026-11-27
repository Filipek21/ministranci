// ============================================================================
// v2.16.00 — „Czytania na dziś”: przycisk (atrybut data-czytania-otworz) otwiera okno z widgetem Niedziela.pl.
// v2.16.01 — okno ma zakładki DZIŚ / JUTRO / POJUTRZE. Zmiana zakładki podmienia adres tej samej ramki (czytania.html?…&d=1 lub &d=2);
//            nadal istnieje najwyżej JEDNA ramka i łączy się z Niedziela.pl dopiero po kliknięciu (jutro/pojutrze — dopiero po wybraniu zakładki).
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
    function adresRamki(dok, dzien) {
        let v = ''; try { v = typeof WERSJA_APLIKACJI === 'string' ? WERSJA_APLIKACJI : ''; } catch (e) { /* ignoruj */ }   // const z js/wersja.js jest widoczna globalnie (nie jako właściwość window)
        const d = (dzien === 1 || dzien === 2) ? '&d=' + dzien : '';                                                      // v2.16.01: 0 (dziś) = adres jak dotąd, bez parametru
        return ADRES + '?v=' + encodeURIComponent(v) + '&j=' + kodJezyka(dok) + d;
    }
    // v2.16.01: podpis zakładki z datą (np. „wt., 25.11”) — liczony z zegara urządzenia; widget liczy dni od „dziś” po stronie Niedziela.pl.
    function dataDnia(dok, przesuniecie) {
        try {
            const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + przesuniecie);
            const j = kodJezyka(dok);
            return d.toLocaleDateString(j === 'uk' ? 'uk-UA' : (j === 'en' ? 'en-GB' : 'pl-PL'), { weekday: 'short', day: 'numeric', month: 'numeric' });
        } catch (e) { return ''; }
    }
    function nazwaDnia(przesuniecie) {
        return przesuniecie === 0 ? tlum('czyt.today', 'Dziś') : (przesuniecie === 1 ? tlum('czyt.tomorrow', 'Jutro') : tlum('czyt.after', 'Pojutrze'));
    }

    // Tworzy kontroler okna dla podanego dokumentu (parametr — żeby dało się testować w Node na atrapie DOM).
    function utworz(dok) {
        let nakladka = null, ostatniFokus = null, dzien = 0;   // dzien: 0 = dziś, 1 = jutro, 2 = pojutrze (v2.16.01)
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
            // v2.16.01: zakładki dni (Dziś / Jutro / Pojutrze) — każda to zwykły przycisk; strzałki ← → przełączają zakładki
            const zakladki = el('div', 'czyt-zakladki'); zakladki.setAttribute('role', 'tablist'); zakladki.setAttribute('aria-label', tlum('czyt.tabs', 'Wybierz dzień'));
            const przyciskiDni = [];
            [0, 1, 2].forEach((n) => {
                const b = el('button', 'czyt-zakladka' + (n === dzien ? ' czyt-aktywna' : '')); b.setAttribute('type', 'button'); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', n === dzien ? 'true' : 'false');
                const nazwa = el('span', 'czyt-zakl-nazwa'); nazwa.textContent = nazwaDnia(n);
                const data = el('small', 'czyt-zakl-data'); data.textContent = dataDnia(dok, n);
                b.appendChild(nazwa); b.appendChild(data);
                b.addEventListener('click', () => ustawDzien(n));
                zakladki.appendChild(b); przyciskiDni.push(b);
            });
            zakladki.addEventListener('keydown', (e) => {
                if (!e) return;
                const k = e.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight') return;
                if (e.preventDefault) e.preventDefault();
                const nowy = Math.max(0, Math.min(2, dzien + (k === 'ArrowRight' ? 1 : -1)));
                ustawDzien(nowy); try { przyciskiDni[nowy].focus(); } catch (x) { /* ignoruj */ }
            });
            const ramka = el('iframe', 'czyt-iframe');
            ramka.setAttribute('sandbox', SANDBOX);                       // izolacja: opaque origin, brak dostępu do aplikacji
            ramka.setAttribute('referrerpolicy', 'origin');
            ramka.setAttribute('title', tlum('czyt.title', 'Czytania na dziś'));
            ramka.setAttribute('src', adresRamki(dok, dzien));
            const nota = el('p', 'czyt-nota'); nota.textContent = tlum('czyt.note', 'Treść pochodzi z serwisu Niedziela.pl i wymaga internetu. Po otwarciu okna Twoje urządzenie łączy się z serwerami Niedziela.pl.');
            okno.appendChild(pasek); okno.appendChild(zakladki); okno.appendChild(ramka); okno.appendChild(nota); n.appendChild(okno);
            n.addEventListener('click', (e) => { if (e && e.target === n) zamknij(); });
            n._zamk = zamk; n._ramka = ramka; n._przyciskiDni = przyciskiDni;
            return n;
        }
        // v2.16.01: przełącza dzień w już otwartym oknie (podmienia adres tej samej ramki); poza oknem tylko zapamiętuje dzień na następne otwarcie
        function ustawDzien(n) {
            if (n !== 0 && n !== 1 && n !== 2) return false;
            if (n === dzien) return false;
            dzien = n;
            if (!nakladka) return true;
            try { nakladka._ramka.setAttribute('src', adresRamki(dok, dzien)); } catch (e) { /* ignoruj */ }
            (nakladka._przyciskiDni || []).forEach((b, i) => { b.className = 'czyt-zakladka' + (i === dzien ? ' czyt-aktywna' : ''); b.setAttribute('aria-selected', i === dzien ? 'true' : 'false'); });
            return true;
        }
        function otworz(zrodlo, dzienStartowy) {
            if (nakladka) return nakladka;
            ostatniFokus = zrodlo || null;
            dzien = (dzienStartowy === 1 || dzienStartowy === 2) ? dzienStartowy : 0;   // każde nowe otwarcie zaczyna od „dziś”
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
        return { otworz, zamknij, podepnij, ustawDzien, dzien: () => dzien, czyOtwarte: () => !!nakladka, adresRamki: () => adresRamki(dok, dzien) };
    }

    const API = { utworz, ADRES, SANDBOX, KLASA_BLOKADY, adresRamki, kodJezyka, dataDnia, nazwaDnia };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined' && typeof document !== 'undefined' && global === window) {
        const kontroler = utworz(document);
        global.EMCzytania = Object.freeze({ otworz: kontroler.otworz, zamknij: kontroler.zamknij, czyOtwarte: kontroler.czyOtwarte, ustawDzien: kontroler.ustawDzien });
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kontroler.podepnij); else kontroler.podepnij();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
