// ============================================================================
// START (v2.15.14) — wspólny, KOŃCOWY skrypt wszystkich stron (index / app / kiosk).
// Zastępuje dawne bloki <script> inline (które trzeba było dopuszczać w CSP):
//  • ustawNumerWersji() — numer wersji i autor w stopce,
//  • rejestracja service workera (po zdarzeniu load; atrybut data-sw="1"),
//  • OPÓŹNIONE ładowanie pomocy i asystenta (atrybut data-opoznione="js/a.js js/b.js"): pliki dokładane
//    po załadowaniu strony, w stanie bezczynności procesora, W TEJ SAMEJ KOLEJNOŚCI (async = false).
//    Pomoc i asystent to ok. 330 kB skryptów, które nie są potrzebne do pierwszego ekranu.
// ============================================================================
(function () {
    'use strict';
    const tag = document.currentScript;
    const wersja = (typeof WERSJA_APLIKACJI !== 'undefined') ? WERSJA_APLIKACJI : '';
    const przyrostek = wersja ? '?v=' + wersja : '';

    try { if (typeof ustawNumerWersji === 'function') ustawNumerWersji(); } catch (e) { console.warn('Wersja:', e && e.name); }

    function dolaczSkrypty(lista) {
        lista.forEach(function (sciezka) {
            const s = document.createElement('script');
            s.src = sciezka + przyrostek;
            s.async = false;                                   // zachowuje kolejność wykonania
            s.onerror = function () { console.warn('Nie wczytano (opóźnione):', sciezka); };
            document.body.appendChild(s);
        });
    }

    function poZaladowaniu(fn) {
        if (document.readyState === 'complete') fn(); else window.addEventListener('load', fn, { once: true });
    }

    const opoznione = tag && tag.dataset && tag.dataset.opoznione ? tag.dataset.opoznione.split(/\s+/).filter(Boolean) : [];
    if (opoznione.length) {
        poZaladowaniu(function () {
            const uruchom = function () { dolaczSkrypty(opoznione); };
            if ('requestIdleCallback' in window) window.requestIdleCallback(uruchom, { timeout: 2500 }); else setTimeout(uruchom, 400);
        });
    }

    if (tag && tag.dataset && tag.dataset.sw === '1' && 'serviceWorker' in navigator) {
        poZaladowaniu(function () { navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('SW:', e && e.name); }); });
    }
})();
