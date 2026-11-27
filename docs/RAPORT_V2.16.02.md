# Raport v2.16.02 — szybsze ładowanie + usunięcie AI

**Zastrzeżenie:** nie miałem przeglądarki ani dostępu do Twojego Supabase, więc **nie widziałem działania tej wersji na żywo**. Zmiany sprawdziłem testami (214, w tym 6 nowych o podziale tłumaczeń i 2 nowe o pomocy) oraz pomiarem rozmiarów (`npm run wydajnosc`). Czasów ładowania w przeglądarce nie mierzyłem.

## 1. Usunięte funkcje AI (zgodnie z prośbą)
* **Mini-asystent w pomocy (❓):** usunięty silnik `js/pomoc-ai.js` (ok. 125 kB; sieć neuronowa uczona w tle przy starcie), zakładka „💬 Zapytaj”, czat, szybkie pytania, zapamiętywanie wyborów i status „mini-silnika”. **Zostało:** tematy i przewodniki krok po kroku, tryb „klikam za Ciebie” (tylko bezpieczne czynności), czytanie na głos, czuwanie, powitanie. Przycisk 💬 „Pomóż mi z tym krokiem” na karcie kroku teraz podświetla miejsce na ekranie i pokazuje krótką wskazówkę (zamiast wiadomości w czacie).
* **Asystent AI dla Admina:** usunięte `js/asystent.js`, `js/asystent-sanityzacja.js`, przycisk 🤖 i okno, przycisk „Pomóż odpowiedzieć” w Kontakcie, przewodnik „Zapytaj asystenta”, wszystkie teksty `as.*`, styl CSS oraz Edge Function `supabase/functions/asystent`.
* **Sieć:** `js/straznik-sieci.js` nie przepuszcza już `/functions/v1/asystent` (zablokowane jako „ścieżka poza listą”). Dane z aplikacji nie mają już żadnej drogi do zewnętrznego modelu AI.
* **Zostawione celowo:** etykiety audytu „Asystent AI / Użycie asystenta” (`aud.c.asystent`, `aud.a.*`) — żeby stare wpisy w historii audytu nadal miały czytelne nazwy; pliki `sql/38`, `sql/39` (historia migracji); starsze raporty.
* **Do zrobienia po Twojej stronie w Supabase (nie ruszałem):** usuń wdrożoną funkcję `asystent` (Edge Functions → asystent → Delete) i sekret `MISTRAL_API_KEY` (oraz `ASYSTENT_MODEL`, jeśli ustawiony). Tabele/funkcje SQL z `sql/38–39` mogą zostać (nieużywane); jeśli chcesz je usunąć, zrób to osobną, świadomą migracją.

## 2. Wydajność (pomiar rozmiarów, po kompresji gzip)
| Strona | JS na ścieżce krytycznej: przed → po | Opóźnione (pomoc): przed → po |
|---|---|---|
| index.html | 106,3 → **59,0 kB** | ok. 105 → **51,7 kB** |
| app.html | 219,3 → **169,2 kB** | ok. 105 + asystent → **51,7 kB** |
| kiosk.html | 165,5 → **116,7 kB** | ok. 105 → **51,7 kB** |
CSS: 18,1 → 16,9 kB (usunięty martwy styl czatu i asystenta).

Co dało zysk:
1. **Usunięcie AI** (powyżej) — mniej do pobrania i do sparsowania, i **koniec uczenia sieci w tle** (na kiosku po 25 s, w panelu po 5 s od startu — to było realne obciążenie procesora).
2. **Podział tłumaczeń** (`js/i18n.js` 243 kB → 82 kB): polski zostaje w głównym pliku, angielski i ukraiński są w `js/i18n-en.js` i `js/i18n-uk.js`. Ładują się tylko wtedy, gdy ten język jest używany: przy starcie (synchronicznie, żeby pierwszy ekran był od razu po właściwemu) albo po kliknięciu przełącznika języka (zmiana następuje po wczytaniu słownika; przy awarii pobrania działa polski, bez pętli). Zawartość słowników porównałem przed/po: **identyczna** (1256 kluczy w każdym języku). Oba pliki są w pamięci offline (service worker), więc przełączanie języka działa też bez internetu.
3. **`<link rel="preconnect">` do Supabase** na `app.html` i `kiosk.html` — połączenie z bazą nawiązuje się równolegle z pobieraniem skryptów.
4. Budżety w `tools/budzet-wydajnosci.json` zaciśnięte do nowych wartości (żeby przyszłe zmiany nie cofnęły zysku).

Czego **nie** zrobiłem (świadomie): minifikacji ani sklejania plików (w kodzie jest dużo komentarzy i testy czytają źródła; wymagałoby narzędzia budującego), przenoszenia generatora PDF/QR do ładowania opóźnionego (przy szybkim kliknięciu włączyłby się zapasowy wariant z CDN) ani nagłówków cache (zależą od hostingu, którego nie znam).

## 3. Testy i wersja
* Wersja 2.16.02 (`js/wersja.js`, adresy `?v=`, numer w testach).
* Usunięte testy usuniętych funkcji: `asystent.test.mjs`, `asystent2.test.mjs`, `pomoc-ai.test.mjs`, a z `audyt-17`, `audyt-luki`, `pomoc-auto` — fragmenty o asystencie/czacie. Zmienione asercje: kolejność i skład skryptów opóźnionych (teraz tylko `js/pomoc.js`), blokada `/functions/asystent` w straźniku sieci, brak śladu AI w pomocy i service workerze.
* Nowe: `tests/i18n-podzial.test.mjs` (6 testów) oraz 2 testy w `pomoc-auto` (wskazówka kroku, brak czatu/silnika).
* Jednorazowo zdarzyła się porażka testu kolejki offline (`zapiszOffline`), której nie udało się powtórzyć w 4 kolejnych przebiegach — to test zależny od czasu, niezwiązany z tą zmianą; warto to mieć na oku.

## 4. Wdrożenie
Wgraj pliki jednym commitem (w tym **nowe** `js/i18n-en.js`, `js/i18n-uk.js` i **usuń** `js/pomoc-ai.js`, `js/asystent.js`, `js/asystent-sanityzacja.js`, `supabase/functions/asystent/*`), odśwież aplikację. SQL nie jest potrzebny.
