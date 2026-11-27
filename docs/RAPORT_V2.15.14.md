# Raport v2.15.14 — szybsze ładowanie i szyfrowanie tokenu Kiosku (Szyfr Ministrancki, etap 3a)

Nic nie zostało usunięte z funkcjonalności: wszystkie moduły (`app.part1–13`, `kiosk*`, `pomoc*`, `asystent*`, `kontakt`, `i18n` …) są w tych samych plikach i ładują się w tej samej kolejności.

## 1. Szybsze ładowanie
| Zmiana | Dlaczego przyspiesza | Ryzyko |
|---|---|---|
| **Statyczne `<script src>` zamiast `document.write`** w `index/app/kiosk.html` | `document.write` ukrywał skrypty przed przeglądarką: ok. 30 plików pobierało się **jeden po drugim**. Teraz przeglądarka widzi je od razu i pobiera równolegle; kolejność wykonania bez zmian | niskie (ta sama kolejność, pilnuje jej test) |
| **Pomoc i asystent ładowane po starcie** (`js/start.js`, `data-opoznione`): `pomoc-ai.js`, `pomoc.js`, `asystent*.js` ≈ 330 kB | nie są potrzebne do pierwszego ekranu; dokładane w bezczynności, po zdarzeniu `load`, w tej samej kolejności (`async=false`) | średnie: przycisk pomocy pojawia się ułamek sekundy później. Moduły same obsługują późny start (`readyState`) |
| **jsPDF i QRCode nie blokują startu panelu** (były w `<head>`, ok. 400 kB z CDN) | ładowarka w `app.part4.js` już dociągała je z kilku źródeł przy pierwszym użyciu — tagi w `<head>` były zdublowane | niskie; pierwszy PDF może zająć chwilę dłużej (jednorazowo) |
| **`supabase-js` z `<head>` na koniec `<body>`** + `preconnect` do CDN | skrypt nie blokuje już renderowania; kolejność względem zależnych plików zachowana | niskie |
| **Service worker: „najpierw zapis” dla plików z `?v=`** | wersja jest w adresie, więc zapis jest zawsze aktualny — powtórne wejścia nie czekają na sieć (wcześniej każdy plik pytał sieć, do 3 s) | średnie: wymaga przetestowania aktualizacji w przeglądarce (patrz „Nie sprawdzono”) |
| `supabase-client.js` dostał `?v=` | bez tego nie dałoby się go bezpiecznie trzymać „najpierw z zapisu” | — |

Nie zmieniono: `i18n.js` (264 kB, wszystkie 3 języki w jednym pliku) — dzielenie go wymagałoby asynchronicznej zmiany języka w całej aplikacji; zysk po wprowadzeniu service workera jest mały (plik jest pobierany raz na wersję). Pozostaje do rozważenia.

**Panel (`app.html`) nie rejestruje service workera** (jak dotąd — tylko Kiosk). Gdy chcesz przyspieszyć też powtórne wejścia do panelu, dopisz `data-sw="1"` w znaczniku `start.js` w `app.html`. Koszt: pierwsza wizyta pobiera w tle ok. 2 MB (po kompresji znacznie mniej).

## 2. Bezpieczeństwo
| Co | Stan przed | Stan po |
|---|---|---|
| **CSP** (R6, częściowo) | tylko `object-src/base-uri/form-action` | pełne: `default-src 'self'`; skrypty tylko z własnego źródła + jsDelivr/cdnjs/unpkg (jak ładowarki bibliotek); **brak `unsafe-inline` i `unsafe-eval` dla skryptów** (wszystkie bloki inline wyniesiono do plików); `connect-src` tylko własne + `*.supabase.co` + CDN Tesseract; `frame-src 'none'` |
| **Token Kiosku** (R4) | jawnie w `localStorage` | **AES-256-GCM**, klucz niewyeksportowalny w osobnym IndexedDB (`js/sekrety.js`); AAD wiąże rekord z nazwą; migracja jawnego tokenu z kasowaniem dopiero po odszyfrowaniu kopii; błąd zapisu **nie** kasuje jawnego tokenu (brak utraty dostępu); bez WebCrypto/IndexedDB działa jak dawniej i zgłasza `tryb() === 'localStorage'` |
| **Logi** | `console.*` mogło wypisać PIN/token w obiektach błędów | `js/ochrona-start.js` zasłania `p_pin`, `pin`, `token`, `authorization`, JWT, `Bearer …` we wszystkich `console.*` |
| **Clickjacking** | brak | strona zasłania się, gdy jest w ramce **obcej** domeny (meta-CSP nie obsługuje `frame-ancestors`, GitHub Pages nie pozwala na nagłówki) |
| **SRI + przypięcie wersji CDN** (R6) | brak | **narzędzie** `tools/sri.mjs` (patrz niżej) — sum **nie wpisano ręcznie**, bo nie mam dostępu do internetu, a błędna suma wyłączyłaby aplikację |

### SRI — zrób raz u siebie
```
node tools/sri.mjs            # raport
node tools/sri.mjs --zapisz   # przypina supabase-js do dokładnej wersji, dopisuje integrity, poprawia sw.js
npm test
```
Uwaga: po włączeniu SRI service worker musi trzymać bibliotekę w trybie CORS (jsDelivr to wspiera); `sw.js` pobiera ją obecnie jako `no-cors` (nieprzejrzysta odpowiedź nie przejdzie weryfikacji SRI). **Po `--zapisz` zmień w `sw.js` `fetch(new Request(u, { mode: 'no-cors' }))` na `mode: 'cors'`** — nie zmieniałem tego z góry, bo bez SRI obecne zachowanie działa.

## 3. Nowe pliki
`js/sekrety.js`, `js/ochrona-start.js`, `js/kiosk-flagi.js`, `js/start.js`, `tools/sri.mjs`, `tools/stempluj-wersje.mjs`, `tests/bezpieczenstwo-ladowanie.test.mjs` (22 testy), ten raport.
Zmienione: `index.html`, `app.html`, `kiosk.html`, `sw.js`, `js/kiosk.js` (token przez `EMSekrety`), `js/kontakt.js` (to samo), `js/wersja.js` (2.15.14), `package.json`, testy (`synchronizacja`, `paczki`, `kontakt`, `pomoc`, `asystent2` — dostosowane do nowej struktury stron i odczytu tokenu).

## 4. Wydawanie nowej wersji
Wersja jest teraz w adresach `?v=` w HTML (statyczne tagi). Po zmianie `js/wersja.js` uruchom `node tools/stempluj-wersje.mjs`; test pilnuje spójności.

## 5. Nie sprawdzono (uczciwie)
* **Żadna zmiana nie była uruchomiona w prawdziwej przeglądarce.** Testy działają w Node (przez `vm` i atrapy). Dotyczy to zwłaszcza: skutków CSP (kamera/jsQR, Tesseract — jego worker, rdzeń WASM i dane języka; dopuszczono `blob:` i `'wasm-unsafe-eval'`, ale nie zweryfikowano), strategii service workera przy **aktualizacji** wersji, `IdbAdapter` w `sekrety.js` na prawdziwym IndexedDB (w testach jest `MemAdapter`), opóźnionego ładowania pomocy.
* Pierwszy test w przeglądarce: otwórz DevTools → Console i szukaj komunikatów „Refused to …” (CSP) przy: logowaniu, wydruku PDF plakietek, imporcie listy ze zdjęcia, skanie kamerą w Kiosku.
* Nie mierzono czasu ładowania — korzyść wynika z usunięcia łańcucha `document.write`, ok. 400 kB bibliotek z `<head>`, 330 kB opóźnionych skryptów i zapisu z service workera; to wnioski z kodu, nie pomiar.
* Sum SRI nie wyliczono (brak internetu).

## 6. Nadal otwarte (bez zmian względem docs/SZYFR_MINISTRANCKI.md)
R2 `pin_jawny` w bazie i na plakietkach (funkcja biznesowa, wymaga decyzji i zmiany schematu — ciała funkcji `sql/01–13` nie ma w repozytorium), R5 liczniki blokad w `localStorage` (kasowalne), R7 MFA, R8 zdalne czyszczenie, R9 łańcuch hashy audytu, R12 weryfikacja tokenu w `kiosk_polecenia_*`. Szyfrowanie lokalne nie chroni przed XSS ani kopią całego profilu przeglądarki (docs §6).
