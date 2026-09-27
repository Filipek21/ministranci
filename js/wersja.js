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
const WERSJA_APLIKACJI = '2.2.00';
