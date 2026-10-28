# Raport v2.14 (aplikacja 2.14.00)

## Nowe / zmienione pliki
Nowe: `sql/33_akceptacja_36h_raport_dnia.sql`, `js/app.part12.js`, `docs/RAPORT_V2.14.md`.
Zmienione: `js/wersja.js`, `js/kiosk.js`, `js/bezpieczny-magazyn.js`, `js/app.part1.js`, `js/app.part6.js`, `js/powiadomienia.js`, `js/i18n.js`, `app.html`, `index.html`, `kiosk.html`, `css/style.css`, `sw.js`, `tests/synchronizacja.test.mjs`. Nic nie usunięto z istniejących funkcji.

## 1. Autor przy numerze wersji
Najechanie (lub dotknięcie/fokus) na numer wersji pokazuje „Autor systemu: …”. Imię i nazwisko ustawiasz w JEDNYM miejscu: `AUTOR_SYSTEMU` w `js/wersja.js`.

## 2. Akceptacja Admina dla wpisów > 36 h
* Wpis offline z Kiosku **młodszy niż 36 h** synchronizuje się sam (bez zmian, bez akceptacji).
* Wpis **starszy niż 36 h** po odzyskaniu sieci trafia do systemu (`oczekujace_akceptacji`), ale obecność dodaje się **dopiero po Twojej akceptacji** (zakładka „Akceptacje (36 h)”). Odrzucenie niczego nie dodaje.
* PIN nie jest wysyłany na serwer i znika z urządzenia po przyjęciu wpisu. Skutek: PIN wpisu > 36 h nie jest weryfikowany — weryfikacją jest Twoja decyzja.
* Wymaga tokenu Kiosku; bez tokenu lub bez sql/33 wpis zostaje „przeterminowany” jak dotąd (przedłużanie 24 h/7 d nadal działa).
* Zmiana zachowania: stary test „przeterminowany nie jest wysyłany” zastąpiono testami nowej ścieżki.

## 3. Raport Dnia
Zakładka Admina: kafelki, alarmy, 19 sekcji (konta, PIN-y, obecności/punkty, skany, plakietki, Kioski, polecenia, blokady, kolejki offline, retencja, akceptacje, zgłoszenia, RODO, importy, cofnięcia, pełny audyt), nawigacja po dniach, eksport CSV, automatyczne odświeżanie.
„Nic nie może umknąć”: dzień można oznaczyć jako przejrzany; dni z aktywnością bez oznaczenia są stale wyświetlane (30 dni wstecz) i liczone na znaczku zakładki. Monitor co minutę: znaczki, powiadomienia po zalogowaniu i o nowych zdarzeniach/akceptacjach.

## Testy
Uruchomione (`npm test`): **51/51** (nowe: ścieżka akceptacji — bez PIN-u, brak dodania obecności, utrata sieci, brak sql/33, brak tokenu, zły token, duplikat).
**Nieuruchomione:** `sql/33` (brak PostgreSQL — sprawdzono tylko składnię cytowania i nawiasy), UI w przeglądarce, tłumaczenia przejrzane tylko maszynowo.

## Wdrożenie
1. Kopia/staging: `sql/33`; weryfikacja z końca pliku. 2. Wpisz imię i nazwisko w `js/wersja.js`. 3. Wgraj frontend 2.14.00 (Kioski online). 4. Sprawdź akceptację na danych testowych.
Założenie Z1 (jak sql/31): „auto” → zaliczone jako zbiórka; w razie potrzeby wybierasz msza/zbiórka przy akceptacji.
