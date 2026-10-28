// ============================================================================
// BLOKADA PANELU PO BEZCZYNNOŚCI (Szyfr Ministrancki v2.2, Etap 6)
//  • 7 minut bez dotyku/klawisza/myszy → wylogowanie: sesja (z PIN-em) znika z pamięci, pola formularzy są czyszczone.
//  • visibilitychange: karta schowana ≥ 7 min (liczone zegarem, bo timery w tle bywają wstrzymywane) → blokada po powrocie.
//  • pagehide (zamknięcie/nawigacja/bfcache): natychmiastowe czyszczenie sesji i pól.
// UWAGA: to ogranicza czas ekspozycji danych w stanie aplikacji. NIE gwarantuje fizycznego wyzerowania pamięci JavaScript
// (GC i silnik przeglądarki mogą zachować kopie ciągów znaków do czasu nadpisania).
// ============================================================================
(function () {
    'use strict';
    const LIMIT_MS = 7 * 60 * 1000;
    let ostatniaAktywnosc = Date.now();
    let ukryto = null;
    let timer = null;

    function wyczyscPola() {
        document.querySelectorAll('input[type="password"], input[type="tel"], #login-kod, #login-pin, #pin-stary, #pin-nowy').forEach(el => { try { el.value = ''; } catch (e) { /* ignoruj */ } });
    }
    function zablokuj(powod) {
        if (typeof sesja === 'undefined' || !sesja) return;
        try { if (typeof wyloguj === 'function') wyloguj(); else sesja = null; } catch (e) { sesja = null; }
        wyczyscPola();
        if (powod === 'bezczynnosc' && typeof window.powiadom === 'function' && typeof t === 'function') {
            try { window.powiadom('info', t('lock.idle')); } catch (e) { /* ignoruj */ }
        }
    }
    function aktywnosc() { ostatniaAktywnosc = Date.now(); }
    function sprawdz() { if (Date.now() - ostatniaAktywnosc >= LIMIT_MS) zablokuj('bezczynnosc'); }

    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input'].forEach(z => document.addEventListener(z, aktywnosc, { passive: true, capture: true }));
    timer = setInterval(sprawdz, 15 * 1000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { ukryto = Date.now(); return; }
        if (ukryto !== null && Date.now() - ukryto >= LIMIT_MS) zablokuj('bezczynnosc');
        ukryto = null; aktywnosc();
    });
    window.addEventListener('pagehide', () => { zablokuj('pagehide'); });
    window.EMBlokada = { LIMIT_MS, zablokuj, _sprawdz: sprawdz };
})();
