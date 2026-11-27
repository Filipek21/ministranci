# Raport v2.16.00 — „Czytania na dziś”, diagnostyka Strażnika sieci i historia skanów

**Zastrzeżenie:** nie miałem przeglądarki, więc **nie widziałem działania tej wersji w żywym środowisku**. Logika (okno, ramka, kolor szat, strażnik, samotest) jest sprawdzona testami na atrapach (277 testów, wszystkie przechodzą). **Widget Niedziela.pl i jego warunki dostępu** sprawdziłem tylko tak, że pobrałem jego skrypt i przeczytałem go — nie ładowałem go w przeglądarce z Twojej domeny.

## A. Nowość: przycisk „📖 Czytania na dziś”

Gdzie jest: ekran startowy (`index.html`), logowanie w `app.html`, panel ministranta (pod licznikiem punktów) i panel Admina (górny pasek). Po kliknięciu otwiera się okno z widgetem Niedziela.pl: nagłówek z datą, dniem, uroczystością/świętem/wspomnieniem, **kolorem szat**, **rokiem liturgicznym** („Rok A, II”) i okresem („XXXIV Tydzień zwykły”), a pod nim **I czytanie, psalm z refrenem, II czytanie, aklamacja i Ewangelia** (zakres i treść). Pasek nad nagłówkiem jest w kolorze szat liturgicznych.

### Dlaczego w odizolowanej ramce (a nie wklejony skrypt)
Skrypt widgetu (`https://widget.niedziela.pl/liturgia_out.js.php`) to jedna linia `document.write(...)`: po załadowaniu strony taki skrypt **wymazałby całą aplikację**, a do tego wstawia HTML z obcego serwera, style inline i obrazki z innych hostów. Wklejenie go do `index.html` i `app.html` wymagałoby też zdjęcia zabezpieczeń CSP (skrypty, obrazy, style z obcych serwerów) w miejscach, gdzie są PIN-y i dane dzieci. Dlatego:

* widget działa **tylko** na stronie `czytania.html`, wyświetlanej w `<iframe sandbox="allow-scripts">` — **bez** `allow-same-origin`, `allow-popups`, `allow-top-navigation`, `allow-forms`. Ramka nie ma dostępu do sesji, PIN-ów, localStorage ani DOM aplikacji;
* `czytania.html` ma własne CSP: skrypty tylko z tej domeny i `widget.niedziela.pl`, **zero połączeń** (`connect-src 'none'`), brak ramek, brak formularzy;
* CSP stron głównych zmienione tylko w jednym miejscu: `frame-src 'none'` → `'self'` (w `index.html` i `app.html`; **Kiosk bez zmian**). Żaden host Niedzieli nie trafił do CSP aplikacji;
* ramka powstaje **dopiero po kliknięciu**, a po zamknięciu jest zatrzymywana i usuwana — dopóki nikt nie otworzy okna, aplikacja **nie łączy się z Niedziela.pl**;
* linki z widgetu są wyłączone (reklamy i „rozważania” nie otwierają obcych stron). Jeśli chcesz je włączyć, dodaj `allow-popups` w stałej `SANDBOX` w `js/czytania.js` (wtedy otwarta strona dziedziczy ograniczenia ramki).

### CO MUSISZ ZROBIĆ SAM — zgłoszenie domeny
Zgodnie z informacją o widgecie (zrzut ekranu, który dołączyłeś) **adres Twojej domeny trzeba zgłosić** w formularzu na stronie „Niedzieli” — bez tego widget nie załaduje treści. Zgłoś adres, pod którym działa aplikacja (np. `twojanazwa.github.io`). Widget sprawdza prawdopodobnie nagłówek `Referer`, więc `czytania.html` wysyła **tylko adres główny** (`<meta name="referrer" content="origin">`), a reszta aplikacji nadal nie wysyła żadnego adresu (`no-referrer`). **Nie wiem, jak dokładnie widget sprawdza domenę** — jeśli po zgłoszeniu ramka pokaże komunikat o błędzie, zapytaj Niedzielę, co weryfikują (tekst błędu w ramce jest po polsku, angielsku i ukraińsku).

### Prywatność
Po otwarciu okna urządzenie użytkownika łączy się z serwerami Niedziela.pl (widzą m.in. adres IP i domenę aplikacji). Dotyczy to też dzieci korzystających z telefonów — okno ma o tym krótką informację (`czyt.note`), a wpis do rejestru czynności/informacji dla rodziców warto uzupełnić. Nic z aplikacji (kody, PIN-y, imiona) do Niedzieli nie trafia — ramka nie ma do nich dostępu.

### Co NIE działa / ograniczenia
* Wymaga internetu (offline ramka pokaże komunikat — sama strona `czytania.html` jest zapisana w pamięci).
* Kolor szat jest odczytywany z tekstu nagłówka widgetu („Kolor szat: bialy”). Gdy Niedziela zmieni format, pasek zostanie w kolorze domyślnym — czytania i tak się wyświetlą.
* Wygląd (kolory, czcionki) zmieniasz w `css/czytania.css` (osobny plik — ramka nie widzi `style.css`); wszystkie klasy `nd_*` z Twojego wklejonego stylu są zachowane.
* Skrypt widgetu jest niepodpisany (brak SRI) i może się zmienić po stronie Niedzieli. Ramka ogranicza skutki, ale nie eliminuje ryzyka, że widget wyświetli niechciane treści (np. reklamę).

## B. Historia skanów plakietek (odpowiedź na pytanie)

**Gdzie:** panel Admina → zakładka **Bezpieczeństwo** → sekcja **„Użycia plakietek na Kioskach”** (widoczna tylko dla Admina; wymaga `sql/15`). Kolumny: kiedy, numer plakietki, ministrant (kod i imię), kiosk (pierwsze 8 znaków identyfikatora), wynik: **ok**, **revoked** (unieważniona), **unknown** (nieznana), **offline** (zapis offline, zgłoszony po synchronizacji). Lista pokazuje **100 najnowszych** wpisów, bez filtra i eksportu. Starsze (do 500 naraz) odczytasz zapytaniem w Supabase na tabeli `skany_plakietek`. Baza sama czyści wpisy starsze niż 400 dni (losowo przy zapisach).

**Co daje:** możesz zobaczyć, kto i na którym Kiosku skanował kartę, wykryć próby użycia unieważnionej lub nieznanej plakietki (czerwony wynik), nietypowe godziny lub Kiosk, oraz sprawdzić, czy zgubiona karta była jeszcze używana. Uwaga: zapis skanu jest „fire and forget” — skan, którego Kiosk nie zdołał wysłać (brak sieci), może się nie zapisać; skany offline zapisują się dopiero po synchronizacji, z godziną urządzenia.

## C. Czy Strażnik sieci w ogóle działa? — jak to sprawdzić

Do tej pory strażnik był testowany tylko na atrapach. **W tej wersji możesz sprawdzić go sam w przeglądarce:** panel Admina → Bezpieczeństwo → **„Strażnik sieci — status”**:

* status: „AKTYWNY” albo „NIEAKTYWNY w tej przeglądarce (działa tylko CSP)”,
* lista chronionych kanałów (fetch, xhr, beacon, websocket, eventsource, open, script, nawigacja — zależnie od przeglądarki),
* liczba zablokowanych połączeń w sesji oraz 10 ostatnich blokad (host, powód, metoda, czas — bez adresów i treści),
* przycisk **„Uruchom test strażnika”**: próbuje połączyć się z nieistniejącym obcym hostem (`straznik-test.invalid`) przez `fetch` i `sendBeacon`. ✅ = oba zablokował strażnik (znacznik w błędzie + wpisy w dzienniku); ❌ = coś przeszło lub zablokowała je tylko przeglądarka (CSP). Żadne żądanie nie opuszcza przeglądarki.

**Uczciwie:** zaliczony test pokazuje, że strażnik jest zainstalowany i reaguje na dwa kanały — nie dowodzi, że chroni przed *każdym* wyciekiem. Test nawigacji nie jest wykonywany (wymagałby opuszczenia strony). Jeśli test wyjdzie ❌, napisz, w jakiej przeglądarce i wersji.

## D. Zmienione pliki

Względem **2.15.18** (4 nowe + 9 zmienionych):
nowe — `czytania.html`, `css/czytania.css`, `js/czytania.js`, `js/czytania-ramka.js`;
zmienione — `index.html`, `app.html`, `kiosk.html` (tylko numer wersji), `sw.js`, `css/style.css`, `js/wersja.js`, `js/i18n.js`, `js/app.part4.js`, `js/straznik-sieci.js`.
Narzędzia/testy: `tools/stempluj-wersje.mjs` (obejmuje `czytania.html`), `tools/budzet-wydajnosci.json`, `package.json`, `tests/czytania-2160.test.mjs` (nowy) i 9 testów z nowym numerem wersji.

## E. Zmiany w istniejących testach (jawnie)
* Asercje numeru wersji → 2.16.00 (9 plików).
* `bezpieczenstwo-ladowanie`: `frame-src` — dla `index.html` i `app.html` oczekiwane `'self'` (ramka tylko na własną stronę `czytania.html`), dla `kiosk.html` nadal `'none'`.
* Budżet wydajności: liczba skryptów blokujących index 8→9, app 27→28 (dodany `js/czytania.js`), a limit JS gzip dla `index.html` 104 000 → 108 000 B. Test budżetu ZAREAGOWAŁ: strona startowa urosła z 98,6 do ok. 105 kB gzip (nowe teksty w trzech językach w `i18n.js`, `czytania.js`, rozszerzony strażnik) — wzrost ok. 6,5 kB, świadomie zaakceptowany.

## F. Wdrożenie
1. Wgraj pliki z listy (jednym commitem). SQL nie jest potrzebny w tej wersji.
2. **Zgłoś domenę w Niedziela.pl** (patrz A).
3. Odśwież aplikację/Kiosk (nowa wersja → świeże pliki). Sprawdź: przycisk, otwarcie okna, zamknięcie (✕, Esc, tło), brak błędów w konsoli, status strażnika (C).
4. Uzupełnij informację dla rodziców/rejestr o połączenie z Niedziela.pl.
