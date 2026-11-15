// Flagi startowe Kiosku (ładowane w <head> PRZED i18n.js). Wcześniej był to blok <script> w kiosk.html —
// wydzielony, żeby CSP mogło zablokować wszystkie skrypty inline (v2.15.14).
// Kiosk sam wybiera język startowy (zapisany na urządzeniu, domyślnie polski) — patrz js/kiosk.js
window.__EM_BEZ_AUTO_JEZYKA = true;
