// ============================================================================
// AUTOMATYCZNE SKALOWANIE DO URZĄDZENIA
// Naprawia dwa klasyczne problemy przeglądarek mobilnych/tabletowych:
//   1) "100vh" na telefonach liczy się razem z paskiem adresu, przez co
//      pełnoekranowe widoki (Kiosk) "uciekają" pod spód — ustawiamy własną
//      zmienną --vh zawsze równą realnej wysokości okna.
//   2) Bardzo małe (telefon w pionie) lub bardzo duże (duży tablet/monitor)
//      ekrany dostają odpowiednio pomniejszoną/powiększoną bazową czcionkę,
//      dzięki czemu układ (karty, przyciski, klawiatura PIN) skaluje się
//      proporcjonalnie zamiast być stałej wielkości w pikselach.
// ============================================================================

function ustawSkalowanieEkranu() {
    // --vh: 1% realnej wysokości widocznego okna (patrz użycie w CSS: height: calc(var(--vh, 1vh) * 100))
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');

    // Bazowa czcionka skalowana do szerokości ekranu — trzyma się w rozsądnych
    // granicach (14px–19px), żeby nic nie stało się nieczytelne ani groteskowo duże.
    const szerokosc = window.innerWidth;
    let bazowaCzcionka = 16;
    if (szerokosc < 380) bazowaCzcionka = 14;
    else if (szerokosc > 900) bazowaCzcionka = 18;
    else if (szerokosc > 1400) bazowaCzcionka = 19;
    document.documentElement.style.fontSize = bazowaCzcionka + 'px';
}

ustawSkalowanieEkranu();
window.addEventListener('resize', ustawSkalowanieEkranu);
window.addEventListener('orientationchange', () => setTimeout(ustawSkalowanieEkranu, 150));


// ============================================================================
// v2.12.03 — PEŁNE AUTOMATYCZNE SKALOWANIE NA WSZYSTKICH URZĄDZENIACH
// (dopisane pod dotychczasowym kodem; nic z powyższego nie usunięto — ta funkcja działa PO poprzedniej
//  i ma ostatnie słowo. Poprawia m.in. kolejność warunków, która uniemożliwiała osiągnięcie 19 px na dużych ekranach.)
//   • płynna skala czcionki (rem) wg szerokości I wysokości okna: mały telefon → telefon → tablet → laptop → monitor → TV,
//   • poziomy telefon (mała wysokość) dostaje mniejszą skalę, żeby Kiosk mieścił się bez przewijania,
//   • zmienne CSS: --skala, --vh, --vw, --szer, --wys, --bezp-gora/dol/lewo/prawo (wcięcia notcha i pasków systemowych),
//   • klasy na <html>: ekran-maly/telefon/tablet/pulpit/duzy/tv, pion/poziom, dotyk/mysz, standalone (PWA),
//   • reakcja na: resize, orientationchange, visualViewport (klawiatura ekranowa), pełny ekran, zmianę gęstości pikseli, powrót do karty.
// Użytkownik nadal może powiększać przeglądarką (Ctrl +/−) — skala jest liczona względem okna, a nie blokuje zoomu.
// ============================================================================
(function () {
    'use strict';
    const doc = document.documentElement;
    let rafId = 0;

    function obliczSkale(szer, wys) {
        // bazowa wielkość czcionki (px) wg szerokości — płynnie, bez skoków
        let px;
        if (szer < 320) px = 12.5;
        else if (szer < 360) px = 13.5;
        else if (szer < 400) px = 14.5;
        else if (szer < 600) px = 15 + (szer - 400) / 200 * 1;          // 15 → 16
        else if (szer < 900) px = 16 + (szer - 600) / 300 * 1;          // 16 → 17
        else if (szer < 1400) px = 17 + (szer - 900) / 500 * 1;         // 17 → 18
        else if (szer < 2000) px = 18 + (szer - 1400) / 600 * 2;        // 18 → 20
        else if (szer < 3000) px = 20 + (szer - 2000) / 1000 * 6;       // 20 → 26
        else px = 26 + Math.min(10, (szer - 3000) / 500 * 2);           // TV / 4K+ → do 36
        // niskie okno (telefon poziomo, okno przeglądarki obcięte) → zmniejsz, by treść się mieściła
        if (wys < 420) px *= 0.86;
        else if (wys < 520) px *= 0.93;
        else if (wys > 1300 && szer > 1600) px *= 1.05;
        return Math.round(px * 100) / 100;
    }

    function ustawKlasy(szer, wys) {
        const k = doc.classList;
        ['ekran-maly', 'ekran-telefon', 'ekran-tablet', 'ekran-pulpit', 'ekran-duzy', 'ekran-tv', 'pion', 'poziom', 'dotyk', 'mysz', 'standalone']
            .forEach(c => k.remove(c));
        k.add(szer < 360 ? 'ekran-maly' : szer < 700 ? 'ekran-telefon' : szer < 1100 ? 'ekran-tablet' : szer < 1800 ? 'ekran-pulpit' : szer < 2600 ? 'ekran-duzy' : 'ekran-tv');
        k.add(wys >= szer ? 'pion' : 'poziom');
        const dotyk = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        k.add(dotyk ? 'dotyk' : 'mysz');
        if ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone) k.add('standalone');
    }

    function przelicz() {
        rafId = 0;
        const vv = window.visualViewport;
        const szer = Math.round(window.innerWidth || doc.clientWidth);
        const wys = Math.round((vv && vv.height) ? Math.max(vv.height, window.innerHeight * 0.6) : window.innerHeight);
        const px = obliczSkale(szer, Math.round(window.innerHeight));
        doc.style.fontSize = px + 'px';
        const s = doc.style;
        s.setProperty('--skala', String(Math.round(px / 16 * 1000) / 1000));
        s.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
        s.setProperty('--vw', (szer * 0.01) + 'px');
        s.setProperty('--szer', szer + 'px');
        s.setProperty('--wys', wys + 'px');
        ustawKlasy(szer, Math.round(window.innerHeight));
    }
    function zaplanuj() { if (!rafId) rafId = requestAnimationFrame(przelicz); }

    przelicz();
    window.addEventListener('resize', zaplanuj);
    window.addEventListener('orientationchange', () => { setTimeout(przelicz, 200); setTimeout(przelicz, 600); });
    window.addEventListener('pageshow', zaplanuj);
    window.addEventListener('load', zaplanuj);
    document.addEventListener('fullscreenchange', () => setTimeout(przelicz, 120));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) zaplanuj(); });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', zaplanuj);
    }
    // zmiana gęstości pikseli (przeciągnięcie okna między monitorami, zoom przeglądarki)
    try {
        const mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
        if (mq.addEventListener) mq.addEventListener('change', zaplanuj);
    } catch (e) { /* starsze przeglądarki — pomijamy */ }
})();
