// ============================================================================
// CENTRALNE ŹRÓDŁO WERSJI APLIKACJI
// To JEDYNE miejsce, które trzeba zmienić przy wydawaniu nowej wersji.
// Format: X.X.XX (np. 1.0.00, 1.2.05, 2.0.10).
//
// Ten plik jest wczytywany jako PIERWSZY <script> na każdej stronie
// (index.html, app.html, kiosk.html) — pozostałe własne pliki (JS/CSS)
// doczepiają do swoich adresów "?v=<ta wersja>", więc podbicie numeru TUTAJ
// automatycznie wymusza w przeglądarce pobranie świeżych plików (cache busting)
// bez ręcznej edycji czegokolwiek poza tym jednym miejscem.
// ============================================================================
const WERSJA_APLIKACJI = '2.15.07';

// ----------------------------------------------------------------------------
// AUTOR SYSTEMU — pokazuje się po najechaniu myszką (lub dotknięciu / fokusie) na numer wersji.
// ▶▶▶ WPISZ TUTAJ SWOJE IMIĘ I NAZWISKO (jedyne miejsce do zmiany) ◀◀◀
// ----------------------------------------------------------------------------
const AUTOR_SYSTEMU = 'Filip Głuch';

// Wstawia numer wersji i podpowiedź z autorem. Wołana z każdej strony (index / app / kiosk) zamiast ręcznego textContent.
function ustawNumerWersji() {
    if (typeof document === 'undefined') return;
    const numer = document.getElementById('app-version-numer');
    if (!numer) return;
    numer.textContent = WERSJA_APLIKACJI;
    const pole = numer.closest('.app-version');
    if (!pole) return;
    function odswiez() {
        let etykieta = 'Autor systemu';
        try { if (typeof t === 'function') { const e = t('app.author'); if (e && e !== 'app.author') etykieta = e; } } catch (e) { /* i18n jeszcze niewczytane */ }
        const tekst = etykieta + ': ' + AUTOR_SYSTEMU;
        pole.setAttribute('data-autor-tekst', tekst);
        pole.setAttribute('title', tekst);
        pole.setAttribute('aria-label', 'v' + WERSJA_APLIKACJI + ' — ' + tekst);
    }
    pole.classList.add('z-autorem');
    pole.setAttribute('tabindex', '0');
    odswiez();
    window.addEventListener('load', odswiez);
    document.addEventListener('zmiana-jezyka', odswiez);
}
