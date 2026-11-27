# Raport v2.15.10 — mini-asystent, tryb „klikam za Ciebie”, więcej tematów

## Nowe
**1. Mini-asystent („mini-silnik AI” bez prawdziwej AI)** — `js/pomoc-ai.js`
* Działa lokalnie w przeglądarce: bez internetu, bez serwera, bez zewnętrznego modelu. To **nie jest model językowy** — nie zmyśla odpowiedzi; gdy nie wie, mówi to i pokazuje, co można zrobić (kandydaci + „Napisz do Admina”).
* **Sieć neuronowa typu fastText: 49 999 parametrów** (3 024 cechy × 16 wymiarów + warstwa wyjściowa na 95 tematów). Uczy się przy pierwszym użyciu z wiedzy o systemie (tytuły, opisy, kroki, 4 436 przykładów), deterministycznie, **porcjami po kilka ms w tle** (kiosk nie zawiesza się). Pełne uczenie: ok. 1 s w Node; na tablecie dłużej, ale w tle.
* Wokół sieci: dopasowanie TF-IDF, poprawianie literówek, ~45 grup synonimów (PL/EN/UK), baza wiedzy (25 pytań i odpowiedzi: okno zapisu, zasady punktów, blokada kodu, kolejka offline, RODO, różnice Ksiądz/Admin…), rozpoznawanie poleceń, wykrywanie języka (odpowiada po polsku / angielsku / ukraińsku), roli, pilności i emocji („Spokojnie, pomogę”), świadomość kontekstu (ekran, otwarta zakładka, aktywny temat).
* Pytany „kim jesteś / ile masz parametrów” odpowiada prawdę, łącznie z liczbą parametrów.
* **Koncentruje się na pomocy:** czuwanie — po 35 s na jednym kroku proponuje pomoc (💬 / 🔊); przycisk 💬 w karcie daje konkretną pomoc do bieżącego kroku (także „nie widzę tego elementu” z listą przyczyn); polecenia: „kliknij za mnie”, „przeczytaj”, „większy tekst”, „pokaż gdzie”, „dalej”, „wstecz”, „zakończ”.
* **Czat:** w menu pomocy nowa zakładka **💬 Zapytaj**. W panelach — pole tekstowe; **na kiosku tylko szybkie pytania** (przyciski), żeby pisanie nie kolidowało ze skanerem.

**2. Tryb „klikam za Ciebie” (do wyboru w menu, domyślnie wyłączony)**
* Pomoc sama klika **wyłącznie bezpieczne rzeczy**: zakładki, „Pokaż/Odśwież”, rozwijane sekcje, ustawienie filtra (np. „Oczekujące”) — po 1,7 s, z podświetleniem i przyciskiem **⏸ Stop**.
* **Nigdy** nie klika przycisków zapisujących, usuwających, zatwierdzających, wylogowujących, odblokowujących, importujących, generujących itd. (lista `ZAKAZANE`, sprawdzana ponownie tuż przed kliknięciem) i nie wpisuje danych za człowieka — karta mówi wtedy „✋ ten krok wykonasz Ty”.
* **Na kiosku tryb jest niedostępny.**

**3. Więcej i intuicyjniej**
* **15 nowych tematów** (łącznie **95 unikalnych tematów, 286 kroków**): kiosk — zły PIN, cudze imię na ekranie, uszkodzona karta, prywatność; ministrant — ochrona PIN-u, punkty od zera w nowym miesiącu, strona się nie ładuje; logowanie — cudzy telefon; Ksiądz — okno rejestracji dla jednej mszy, msza połączona z nabożeństwem, kilka mszy z rzędu; Admin — kopia zapasowa, diagnostyka kiosku, domyślne okno rejestracji, obsługa wiadomości.
* Menu z zakładkami 📚 Tematy / 💬 Zapytaj, „Polecam teraz”, „Ostatnio”, szukajka, ✓ przy ukończonych; przycisk „👆 Pokaż gdzie” przy każdym kroku; powitanie przy pierwszym wejściu; karta zwija się, gdy otwierasz menu.

## Jakość mini-asystenta — uczciwie (zmierzone w testach)
Zestawy pytań napisane innymi słowami niż dane uczące; **ranking** = czy właściwy temat jest 1. / w pierwszej trójce; **odpowiedź końcowa** = pewny temat, właściwy temat wśród proponowanych przycisków albo trafna odpowiedź z bazy wiedzy.
| Zestaw | Ranking top-1 | top-3 | Odpowiedź końcowa |
|---|---|---|---|
| Świeży, 40 pytań (nie używany do strojenia) | 34/40 (85%) | 38/40 (95%) | 36/40 (90%) |
| Trudniejszy, 48 pytań (na nim stroiłem słownik synonimów, więc wynik jest optymistyczny) | 36/48 (75%) | 43/48 (90%) | 31/48 (65%) |
Pytania dalekie od tematyki systemu (pogoda, bitcoin) nie dostają pewnej odpowiedzi. Mniejsza trafność na trudnych parafrazach jest zamierzoną ceną braku „prawdziwej” AI — w razie niepewności asystent pokazuje kilka tematów do wyboru zamiast zgadywać.

## Zmienione pliki
Nowe: `js/pomoc-ai.js`, `tests/pomoc-ai.test.mjs`, `tests/pomoc-auto.test.mjs`, ten raport. Rozbudowane: `js/pomoc.js` (wszystkie funkcje z 2.15.09 zachowane), `css/style.css` (blok na końcu), `kiosk.html` / `app.html` / `index.html` (+1 linia ładująca `pomoc-ai.js`), `sw.js`, `js/wersja.js` (2.15.10), `package.json`, testy (numer wersji). Żaden plik logiki aplikacji (`kiosk.js`, `app.part*.js`…) nie został zmieniony.

## Testy
`npm test`: 167 zielonych (w tym: parametry 48–52 tys., deterministyczność i uczenie porcjami, jakość na dwóch zestawach, baza wiedzy, polecenia, uczciwość odpowiedzi o sobie, „nie wiem” przy nonsensie, język EN/UK, literówki; tryb auto na atrapie DOM: klika zakładkę i ustawia filtr, **nigdy nie klika „Dodaj wydarzenie”**, nie działa na kiosku; czat; czuwanie).

## Czego NIE sprawdzono
* Nie uruchamiano w prawdziwej przeglądarce — wygląd czatu i menu, położenie palca/ramek, przewijanie, głos (synteza mowy zależy od urządzenia), tryb auto na prawdziwych przyciskach i czas uczenia sieci na tablecie sprawdź na urządzeniach.
* Działanie auto-kliknięć opiera się na tym, że aplikacja reaguje na zwykłe kliknięcie/zmianę wartości (tak jest w kodzie), ale nie próbowano tego w żywym panelu.
* Panele Księdza i Admina oraz tryb awaryjny kiosku mają teksty tylko po polsku; asystent odpowiada po angielsku/ukraińsku, gdy pytanie jest w tym języku, ale tytuły tematów z paneli pozostają po polsku.
