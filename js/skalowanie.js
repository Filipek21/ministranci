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
