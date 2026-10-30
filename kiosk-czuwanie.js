// ============================================================================
// v2.12.07 — KIOSK: CZUWANIE (ekran tabletu nie gaśnie) I SZYBKIE WZNOWIENIE PO UŚPIENIU
//
// Problem: gdy ekran tabletu zgaśnie (wygaszanie, przycisk zasilania, oszczędzanie baterii), przeglądarka ZAMRAŻA stronę Kiosku —
//   zatrzymują się wszystkie liczniki (ping co 15 min, pytanie o polecenia co 5 s, dosyłanie kolejki offline co 20 s),
//   więc Admin widzi Kiosk jako „nieaktywny” i nie dociera do niego żadne polecenie (blokada, ping, synchronizacja).
//   Po ponownym włączeniu ekranu liczniki ruszają dalej, ale mogło minąć wiele minut.
//
// Co robi ten moduł:
//  1) Screen Wake Lock — prosi przeglądarkę, by NIE wygaszała ekranu, dopóki Kiosk jest otwarty (ponawia po powrocie do karty).
//     Gdy tablet tego nie obsługuje (starszy Android/Safari, adres bez HTTPS) lub system odmawia (tryb oszczędzania baterii) —
//     pokazuje jednorazowe ostrzeżenie z radą, jak wyłączyć wygaszanie w ustawieniach tabletu.
//  2) Wykrywanie uśpienia — co sekundę mierzy upływ czasu; przerwa > 25 s (lub zdarzenia visibilitychange / pageshow / resume /
//     online) oznacza, że tablet spał. Wtedy NATYCHMIAST: sprawdza łączność, wysyła ping, odbiera zlecenia Admina,
//     dosyła kolejkę offline i odświeża dane offline (zamiast czekać na następny cykl licznika).
//  3) Informuje obsługę powiadomieniem: „Kiosk wznowiony po X min”.
// Moduł niczego nie zapisuje w bazie poza tym, co i tak robi Kiosk (ping, synchronizacja).
// ============================================================================
(function () {
    'use strict';

    const PROG_USPIENIA_MS = 25000;       // przerwa dłuższa niż 25 s = tablet spał
    const KLUCZ = 'em_kiosk_wznowienie';
    let blokada = null, ostrzezono = false, ostatniTik = Date.now(), wToku = false;

    function pow(typ, tekst) { if (typeof window.powiadom === 'function') window.powiadom(typ, tekst); }
    function jezykPl() { try { return (typeof jezykBiezacy === 'undefined') || jezykBiezacy === 'pl'; } catch (e) { return true; } }
    const TX = {
        pl: { nowake: 'Ten tablet nie blokuje wygaszania ekranu. Ustaw w systemie: Ekran → Wygaszanie → „Nigdy” (albo „Nie wyłączaj ekranu podczas ładowania”) i podłącz zasilacz — wygaszony ekran zatrzymuje Kiosk.',
              resumed: 'Kiosk wznowiony po {m} min uśpienia — łączę się z serwerem i dosyłam dane.', resumed_s: 'Kiosk wznowiony po {s} s — sprawdzam łączność.', on: 'Ekran Kiosku pozostanie włączony.' },
        en: { nowake: 'This tablet does not keep the screen awake. In system settings set Display → Screen timeout → “Never” (or “Stay awake while charging”) and keep it plugged in — a dimmed screen pauses the Kiosk.',
              resumed: 'Kiosk resumed after {m} min asleep — reconnecting and sending queued data.', resumed_s: 'Kiosk resumed after {s} s — checking the connection.', on: 'The Kiosk screen will stay on.' },
        uk: { nowake: 'Цей планшет не утримує екран увімкненим. У налаштуваннях: Екран → Вимкнення екрана → «Ніколи» (або «Не вимикати під час зарядки») і підключіть живлення — згаслий екран зупиняє Кіоск.',
              resumed: 'Кіоск відновлено після {m} хв сну — підключаюся до сервера й надсилаю дані.', resumed_s: 'Кіоск відновлено після {s} с — перевіряю зв’язок.', on: 'Екран Кіоску залишатиметься ввімкненим.' }
    };
    function tx(k, zm) {
        let l = 'pl'; try { if (typeof jezykBiezacy !== 'undefined' && TX[jezykBiezacy]) l = jezykBiezacy; } catch (e) { /* pl */ }
        return (TX[l][k] || TX.pl[k] || k).replace(/\{(\w+)\}/g, (_, n) => (zm && zm[n] !== undefined) ? zm[n] : '{' + n + '}');
    }

    // ------------------------------------------------------------------ 1) WAKE LOCK ----
    async function zajmijBlokade(zGestu) {
        if (document.visibilityState !== 'visible') return;
        if (!('wakeLock' in navigator)) {
            if (!ostrzezono) { ostrzezono = true; pow('warn', tx('nowake')); }
            return;
        }
        if (blokada && !blokada.released) return;
        try {
            blokada = await navigator.wakeLock.request('screen');
            blokada.addEventListener('release', () => { blokada = null; });   // system może ją zabrać (np. niski poziom baterii) — odnowimy po powrocie do karty
            if (!window.__emWakeInfo) { window.__emWakeInfo = true; pow('info', tx('on')); }
        } catch (e) {
            // odmowa (oszczędzanie baterii / brak gestu użytkownika) — ostrzegamy raz, ponawiamy przy pierwszym dotyku
            if (!zGestu && !ostrzezono) { ostrzezono = true; pow('warn', tx('nowake')); }
        }
    }

    // ------------------------------------------------------------------ 2) WZNOWIENIE ----
    async function nadrob(przerwaMs) {
        if (wToku) return; wToku = true;
        try {
            const s = Math.round(przerwaMs / 1000), m = Math.round(przerwaMs / 60000);
            try { localStorage.setItem(KLUCZ, JSON.stringify({ kiedy: new Date().toISOString(), przerwa_s: s })); } catch (e) { /* brak miejsca */ }
            pow('info', m >= 1 ? tx('resumed', { m }) : tx('resumed_s', { s }));
            const polaczenie = (typeof sprawdzPolaczenie === 'function') ? await sprawdzPolaczenie() : navigator.onLine;
            if (typeof ustawStanPolaczenia === 'function') ustawStanPolaczenia(polaczenie, { bezSynchronizacji: true });
            if (polaczenie) {
                if (typeof wyslijPing === 'function') wyslijPing();                                  // Admin od razu widzi, że Kiosk żyje
                if (typeof sprawdzZadaniaPing === 'function') sprawdzZadaniaPing();                 // ewentualne zlecenia „Ping” z panelu
                if (typeof probojSynchronizacje === 'function') await probojSynchronizacje();       // kolejka offline
                if (typeof odswiezCacheWTle === 'function') odswiezCacheWTle(false);                // dane offline, jeśli stare
                if (typeof pobierzUstawieniaKiosku === 'function') pobierzUstawieniaKiosku();
                if (typeof sprawdzAktualizacje === 'function') sprawdzAktualizacje();
            }
        } catch (e) { console.error('Wznowienie Kiosku:', e); }
        finally { wToku = false; ostatniTik = Date.now(); }
    }

    // tik co sekundę: duża luka między tikami = uśpienie (liczniki były zamrożone)
    setInterval(() => {
        const teraz = Date.now(), luka = teraz - ostatniTik;
        ostatniTik = teraz;
        if (luka > PROG_USPIENIA_MS) { zajmijBlokade(false); nadrob(luka); }
    }, 1000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            zajmijBlokade(false);
            const luka = Date.now() - ostatniTik;
            if (luka > PROG_USPIENIA_MS / 2) nadrob(Math.max(luka, PROG_USPIENIA_MS));
        }
    });
    window.addEventListener('pageshow', (e) => { zajmijBlokade(false); if (e.persisted) nadrob(PROG_USPIENIA_MS); });
    document.addEventListener('resume', () => nadrob(PROG_USPIENIA_MS));          // Page Lifecycle API (Chrome)
    window.addEventListener('online', () => zajmijBlokade(false));
    // niektóre przeglądarki wymagają gestu użytkownika — ponawiamy przy pierwszym dotyku / skanie
    ['pointerdown', 'keydown'].forEach(z => document.addEventListener(z, () => { if (!blokada) zajmijBlokade(true); }, { passive: true }));

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => zajmijBlokade(false)); else zajmijBlokade(false);
    window.EMCzuwanie = { zajmij: zajmijBlokade, nadrob: nadrob, czyBlokada: () => !!(blokada && !blokada.released) };
})();
