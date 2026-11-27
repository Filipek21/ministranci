# Raport v2.15.08 — interaktywna pomoc („❓ Pomoc”)

## Nowe
* **Przycisk „❓ Pomoc” w lewym dolnym rogu**, widoczny zawsze: Kiosk, logowanie, panel ministranta, panel Księdza, panel Admina i strona startowa. Pierwsze uruchomienie na urządzeniu — przycisk delikatnie pulsuje.
* Po kliknięciu: lista tematów dopasowana do **kontekstu** (kto i gdzie): Kiosk · Kiosk w trybie awaryjnym Księdza · Kiosk w trybie awaryjnym Admina · logowanie · panel ministranta · panel Księdza · panel Admina · strona startowa.
* Wybrany temat prowadzi **krok po kroku**: ciemne tło z podświetloną ramką wokół elementu do kliknięcia, karta z opisem, pasek postępu, przyciski Wstecz / Tematy / Dalej.
* Kroki same przechodzą dalej, gdy człowiek wykona czynność (wejdzie w zakładkę, wpisze 4 cyfry PIN-u, kiosk zmieni ekran). Na kiosku pomoc **przeskakuje do kroku pasującego do ekranu** (PIN, wybór mszy, wynik).
* Kiosk: po 90 s bez dotyku przewodnik i menu zamykają się same. Gdy Ksiądz / Admin wejdzie w tryb awaryjny, menu samo przełącza się na tematy tego trybu.
* Pomoc **niczego nie klika i nie zapisuje** — tylko pokazuje.

## Tematy
* **Kiosk:** zapis obecności (karta → PIN → msza → wynik), skanowanie kamerą, pogrzeb/ślub/inne, zgubiona karta/PIN, wejście Księdza/Admina w tryb awaryjny, język, pasek statusu i kolejka offline, kontakt.
* **Kiosk — tryb awaryjny:** ręczna obecność, cofnięcie pomyłki, wylogowanie; tylko Admin: odblokowanie kodu, tryb offline i synchronizacja, czyszczenie kolejki.
* **Panel ministranta:** punkty, historia, kalendarz, ranking, zmiana PIN-u, jak zapisać obecność, język, kontakt, przejście do panelu admina (tylko dla Księdza/Admina), wylogowanie.
* **Panel Księdza:** dodanie wydarzenia, zgłoszenia, ręczna obecność, nowy ministrant, plakietki, karty QR (PDF), listy papierowe, obecności miesiąca, frekwencja, odblokowanie kodu.
* **Panel Admina:** wszystko co Ksiądz + Dashboard, Raport Dnia, Akceptacje 36 h, Wiadomości, Kioski, Baza danych, Statystyki, Ustawienia, Audyt, Narzędzia, RODO, raport miesięczny. Krok „Rola Księdza” widać tylko u Admina.

## Języki
Kiosk, logowanie, panel ministranta i strona startowa: PL / EN / UK. Panele Księdza i Admina oraz tryb awaryjny kiosku: tylko PL (przy EN/UK pomoc pokazuje polskie teksty).

## Zmienione pliki
Nowe: `js/pomoc.js`, `tests/pomoc.test.mjs`, `docs/RAPORT_V2.15.08.md`.
Dopisane (nic nie usunięto): `css/style.css` (blok na końcu), `kiosk.html`, `app.html`, `index.html` (po jednej linii ładującej `js/pomoc.js`), `sw.js` (`js/pomoc.js` w cache), `js/wersja.js` (2.15.08), `package.json` (nowy test), 3 asercje numeru wersji w testach.
Żaden plik logiki (`kiosk.js`, `app.part*.js` itd.) nie został zmieniony — pomoc tylko odczytuje stan (`sesja`, `rolaAwaryjna`, `pinBufor`).

## Testy
`npm test`: 134 zielone (dotychczasowe + 9 nowych: kompletność tematów, wersje EN/UK, **każdy selektor #id z przewodników istnieje w HTML-u**, role, wpięcie plików).

## Czego NIE sprawdzono
* Nie klikano w prawdziwej przeglądarce — położenie ramki i karty, przewijanie do elementu i automatyczne przejścia sprawdź na kiosku (tablet) i na telefonie.
* Selektory wierszy tabel (np. przycisk „Plakietki”) zależą od danych: gdy tabela jest pusta, krok pokaże uwagę „nie widzę tego elementu”.
* Opisy działania ekranów oparte na kodzie; zdania o uprawnieniach Księdza (np. odblokowanie kodu w zakładce Bezpieczeństwo) mogą wymagać korekty po próbie na żywo.
