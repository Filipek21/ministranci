# Raport v2.15 (aplikacja 2.15.00) — „Skontaktuj się z Administratorem”

## Nowe pliki
`sql/34_kontakt_z_administratorem.sql`, `js/kontakt.js`, `js/app.part13.js`, `tests/kontakt.test.mjs`.
Zmienione (tylko dopisania): `js/wersja.js`, `app.html`, `kiosk.html`, `css/style.css`, `js/i18n.js`, `js/app.part1.js`, `js/app.part6.js`, `js/app.part12.js`, `js/powiadomienia.js`, `js/supabase-client.js`, `sw.js`, `package.json`.

## Działanie
* Przycisk „✉️ Kontakt z Adminem” (prawy dolny róg): w Kiosku zawsze, w Panelu po zalogowaniu (ministrant, ksiądz, admin).
* Okno: kategoria (usterka / pytanie / pomysł / pilne / inne), treść do 4000 znaków, opcjonalny zrzut ekranu z podglądem.
* **Panel: wiadomość nigdy nie jest anonimowa** — serwer weryfikuje kod i PIN z sesji i zapisuje autora (imię, kod, rola).
* **Kiosk: anonimowo (domyślnie) albo podpisana kodem + PIN-em.** Anonimowa wiadomość nie zawiera danych osoby (baza wymusza to więzem); Admin widzi tylko numer Kiosku. Dla anonimów nie zapisujemy też danych przeglądarki.
* **Zrzut ekranu**: robiony lokalnie, bez zewnętrznych bibliotek (DOM → obraz JPEG ≤ ~800 KB), PRZED otwarciem okna, żeby uchwycić to, co użytkownik widział. Pola haseł/PIN-ów są maskowane. Widzi go tylko Admin.
* **Admin**: zakładka „Wiadomości” (znaczek z liczbą nowych, powiadomienie po zalogowaniu i o nowych, osobny sygnał dla „pilne”), podgląd zrzutu, statusy nowe/przeczytane/załatwione z notatką, usuwanie. Zdarzenia (bez treści) trafiają do audytu, więc widać je też w Raporcie Dnia (sekcja audytu).
* Limity: panel 10 wiadomości/h na osobę, Kiosk 20/h.

## Ograniczenia (świadome)
* Brak internetu → wiadomość NIE jest kolejkowana offline; pokazuje się błąd, a treść zostaje w oknie (kolejka offline Kiosku jest szyfrowana osobnym mechanizmem i nie zmieniałem jej).
* Zrzut: nie odwzorowuje elementów ::before/::after, obrazów zewnętrznych i przewinięcia wewnątrz przewijanych kontenerów; w razie błędu przeglądarki wiadomość można wysłać bez zrzutu. Może nie działać w niektórych przeglądarkach (zrzut bywa blokowany jako „zabrudzony”).
* Ekran startowy (`index.html`) nie ma przycisku — nie ma tam ani sesji, ani tokenu Kiosku do autoryzacji (anonimowy endpoint bez tokenu = otwarte drzwi dla spamu).
* Podpisana wiadomość z Kiosku/Panelu używa `public.zaloguj`, więc liczy się jak próba logowania (blokady PIN działają).
* Zrzut może pokazywać dane innych osób widocznych na ekranie — ostrzeżenie jest w oknie.

## Testy
`npm test`: **54/54**. Nieuruchomione: `sql/34` (brak PostgreSQL), działanie w przeglądarce (w tym zrzut ekranu), tłumaczenia sprawdzone tylko maszynowo.

## Wdrożenie
1. `sql/34` na kopii/staging, potem produkcja (wymaga wcześniej sql/20, 31, 33). 2. Frontend 2.15.00. 3. Test: wiadomość anonimowa z Kiosku (autor_kod IS NULL), wiadomość z Panelu (autor wypełniony), zrzut widoczny w zakładce „Wiadomości”.
