# Raport v2.16.01 — czytania na dziś, jutro i pojutrze + nowy wygląd

**Zastrzeżenie:** nie miałem przeglądarki ani dostępu do widgetu Niedziela.pl z Twojej domeny, więc **nie widziałem działania tej wersji na żywo**. Logika (zakładki, adres ramki, ładowarka widgetu) jest sprawdzona testami na atrapach. Wygląd (CSS) napisałem na podstawie dwóch zrzutów ekranu i znanych klas `nd_*` — dokładnej budowy HTML-a widgetu nie znam, więc część reguł jest „ogólna” i warto obejrzeć efekt na telefonie.

## Co nowego
* **Zakładki Dziś / Jutro / Pojutrze** w oknie „Czytania” (z datą pod nazwą, np. „wt., 25.11”). Źródło: oficjalny parametr widgetu Niedziela.pl `data` (ilość dni od dziś; opis na niedziela.pl/webmaster/liturgia). Przycisk „📖 Czytania na dziś” otwiera zakładkę „Dziś”.
* **Nowy wygląd w motywie całej aplikacji:** fioletowe tło z gradientem, różowo-fioletowe paski sekcji (przyklejają się do góry przy przewijaniu), miętowe refreny i „Oto słowo…”, bursztynowe zakresy, większa czcionka czytań (17–18 px), kropka i pasek w kolorze szat liturgicznych (dla szat czarnych jaśniejszy odcień), animacja wejścia (wyłączana przy „mniej ruchu”), wersja do wydruku. Okno na telefonie jest pełnoekranowe.
* Wszystkie reguły `nd_*` ze starego stylu zostały (zmieniły się tylko wartości); logotypy i banery Niedziela.pl nadal się wyświetlają.

## Jak to działa i co z bezpieczeństwem
* Zmiana zakładki **podmienia adres tej samej ramki** (`czytania.html?…&d=1` lub `&d=2`) — nadal istnieje najwyżej jedna ramka, `sandbox="allow-scripts"` bez zmian, a połączenie z Niedziela.pl powstaje dopiero po kliknięciu (jutro/pojutrze — po wybraniu zakładki).
* Nowy plik `js/czytania-widget.js` zastąpił statyczny tag skryptu widgetu w `czytania.html` (nie da się dopisać parametru do statycznego tagu). Przyjmuje **tylko** wartości 1 i 2 (reszta = dziś), więc nic z adresu strony nie trafia do adresu widgetu poza jedną cyfrą. CSP strony `czytania.html` jest bez zmian.
* Dla „Dziś” adres widgetu jest identyczny jak w 2.16.00 (bez parametru).

## Ograniczenia
* Dzień liczy serwer Niedziela.pl (czas polski); podpisy dat w zakładkach — zegar urządzenia. Przy innej strefie czasowej w okolicy północy mogą się rozjechać o dzień.
* Zgłoszenie domeny w Niedziela.pl (opis w RAPORT_V2.16.00) dotyczy także jutra i pojutrza — to ta sama usługa.
* Dla przycisków w aplikacji tekst „Czytania na dziś” został bez zmian.

## Zmienione pliki (względem 2.16.00)
nowe — `js/czytania-widget.js`, `docs/RAPORT_V2.16.01.md`;
zmienione — `css/czytania.css`, `css/style.css` (tylko blok „Czytania”), `js/czytania.js`, `js/i18n.js` (+4 klucze × 3 języki: `czyt.today`, `czyt.tomorrow`, `czyt.after`, `czyt.tabs`), `czytania.html`, `sw.js` (nowy plik w pamięci offline), `js/wersja.js` (2.16.01) oraz adresy `?v=` w `index.html`, `app.html`, `kiosk.html` (narzędzie `stempluj-wersje`).
Testy: numer wersji 2.16.00 → 2.16.01 w asercjach; w `czytania-2160.test.mjs` zmieniona asercja o tagu skryptu w `czytania.html` (teraz ładowarka) i 3 nowe testy.

## Wdrożenie
Wgraj pliki z listy jednym commitem i odśwież aplikację (nowa wersja → świeże pliki). SQL nie jest potrzebny.

## Dodatek: favicon
Dodano ikonkę strony: `favicon.ico` (16/32/48 px, w katalogu głównym), `icons/favicon-32.png` i `icons/apple-touch-icon.png` (180 px, ikona po dodaniu do ekranu głównego iPhone'a) — wszystkie wygenerowane z istniejącego `icons/icon-512.png`. Tagi `<link rel="icon">` są w `index.html`, `app.html`, `kiosk.html` i `czytania.html`; pliki są w pamięci offline (`sw.js`). CSP bez zmian (`img-src 'self'`). Limit `htmlGz` dla `app.html` podniesiony z 11000 do 11300 B (nowe tagi).
