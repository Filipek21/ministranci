# Raport v2.15.07 — plakietki Księdza, okno kiosku 20/5, zmiana kamery

## Nowe
* **Ksiądz dodaje i unieważnia plakietki.** Dotąd przyciski były widoczne, ale serwer odpowiadał „Brak uprawnień”, bo funkcje `admin_generuj_plakietke` / `admin_uniewaznij_plakietke` / `admin_lista_plakietek` przyjmują tylko Admina. Nowe funkcje w `sql/40_ksiadz_plakietki_v2_15_07.sql`: `ksiadz_lista_plakietek`, `ksiadz_generuj_plakietke`, `ksiadz_uniewaznij_plakietke`.
  * Ksiądz zarządza plakietkami **wyłącznie zwykłych ministrantów** (nie Admina i nie innego Księdza) — te same zasady co przy edycji kont (`_moze_zarzadzac_18`). Pilnuje tego serwer; panel dodatkowo ukrywa takie konta z listy.
  * Każde wygenerowanie i unieważnienie trafia do historii plakietek (trigger z `sql/15`) z kodem Księdza i powodem (opcjonalnym).
  * Księdzu odblokowana jest zakładka **Generator kart QR** (zaznaczanie ministrantów, PDF, lista wszystkich plakietek) oraz przyciski „+ Wygeneruj nową plakietkę” i „Unieważnij” w panelu Plakietki przy ministrancie.
  * Hamulec: konto może mieć najwyżej 10 aktywnych plakietek naraz. Plakietki nieaktywnego konta nie da się wygenerować.
  * Admin działa jak dotąd (funkcje `admin_*`, z audytem) — kod Admina nie zmienił zachowania.
* **Domyślny czas rejestracji w kiosku: od 20 min przed do 5 min po** rozpoczęciu (było 15 / 5). Zmienione w formularzu nowego wydarzenia, w edycji wydarzenia, w ustawieniach domyślnych, w podpowiedzi (PL/EN/UK) i w kalendarzu. `sql/40` ustawia też wartość `okno_przed_min` w bazie na 20 — **tylko jeśli nikt jej nigdy nie zmieniał** (`zmienil is null`). Ustawione ręcznie przez Admina zostaje. Istniejące wydarzenia zachowują swoje okna.
* **Zmiana kamery w skanerze QR kiosku** (`js/skaner-kamery.js`): przycisk „🔄 Zmień kamerę” w oknie skanera.
  * Telefon / tablet: przełącza tylną ↔ przednią kamerę.
  * Komputer lub urządzenie bez informacji o kierunku kamery: przechodzi do następnej kamery z listy.
  * Wybór jest pamiętany na urządzeniu — następne skanowanie startuje od tej samej kamery.
  * Stary strumień jest zamykany przed otwarciem nowego (wiele urządzeń nie otwiera dwóch kamer naraz). Gdy zmiana się nie uda, wraca poprzednia kamera i skaner działa dalej.
  * Przycisk jest ukryty, jeśli urządzenie ma jedną kamerę. Podgląd przedniej kamery jest odbity lustrzanie.

## Zmienione pliki
`js/skaner-kamery.js` (przepisany z zachowaniem całej dotychczasowej logiki), `js/app.part1.js`, `js/app.part3.js`, `js/app.part4.js`, `js/app.part5.js`, `js/app.part6.js`, `js/app.part11.js`, `js/i18n.js` (nowe klucze na końcu pliku + podpowiedź okna), `app.html`, `js/wersja.js`, `sql/25_narzedzia_admina.sql` (rejestr funkcji), `sql/36_...sql` (awaryjna wartość 15 → 20), `package.json`. Nowe: `sql/40_ksiadz_plakietki_v2_15_07.sql`, `tests/plakietki-ksiadz.test.mjs`. Nic nie zostało usunięte.

## Testy
`npm test`: wszystkie dotychczasowe (107) + 18 nowych w `tests/plakietki-ksiadz.test.mjs`: kontrakt SQL 40, uprawnienia zakładek, wybór funkcji Admin/Ksiądz, brak SQL 40, wartości 20/5, tłumaczenia, przełączanie kamery (tył→przód→tył, komputer z listą kamer, powrót do poprzedniej po porażce, jedna kamera, zamknięcie okna).

## Wdrożenie
1. Uruchom `sql/40_ksiadz_plakietki_v2_15_07.sql` po `sql/39` (najpierw na kopii/stagingu).
2. Wgraj pliki aplikacji. Numer wersji zmienia się na 2.15.07, więc przeglądarki same pobiorą świeże pliki (cache busting + nazwa cache service workera).
3. Zaloguj się jako Ksiądz: sprawdź, że widać zakładkę Generator kart QR, że da się wygenerować i unieważnić plakietkę zwykłego ministranta, a plakietki Admina nie ma na liście.
Bez kroku 1 Ksiądz zobaczy komunikat o brakującym SQL (nie ogólny błąd), a Admin i reszta aplikacji działają jak wcześniej.

## Czego NIE sprawdzono
* **SQL 40 nie był uruchomiony** (brak PostgreSQL w środowisku) — sprawdzony tylko przeglądem i testami tekstowymi. Opiera się na założeniach z kodu: tabela `plakietki` ma kolumny `kod_plakietki`, `ministrant_id`, `aktywna`; kolumny `wygenerowano` i `uniewazniona_kiedy` są wypełniane, jeśli istnieją. Funkcji `admin_generuj_plakietke` nie ma w repozytorium, więc nie wiem, jak dokładnie zbudowany jest jej kod plakietki. Nowa funkcja tworzy `PL-` + 16 losowych znaków szesnastkowych (albo UUID, gdy kolumna jest typu uuid); kiosk nie sprawdza formatu kodu, więc takie plakietki powinny działać, ale **sprawdź jedną wygenerowaną plakietkę skanem na kiosku**.
* Zmiana kamery była testowana tylko na atrapach przeglądarki. Na prawdziwych urządzeniach (zwłaszcza iPad/Safari i telefony z kilkoma tylnymi obiektywami) obejrzyj ją sam.
* Okna istniejących wydarzeń nie zostały zmienione — nowe 20/5 dotyczy wydarzeń tworzonych od teraz. Jeśli chcesz, żeby kalendarz już istniejących mszy też miał 20 min, trzeba je edytować lub zrobić osobną aktualizację.
* Nie mierzono działania panelu w przeglądarce — zmiany w `app.part*.js` sprawdzono składnią i testami logiki, nie klikaniem.
