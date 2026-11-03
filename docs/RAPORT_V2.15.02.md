# Raport v2.15.02 — głębszy przegląd błędów i wzmocnienie ochrony danych

## Metoda
Ponowny przegląd systemu: skan wszystkich funkcji SQL (123) pod kątem `security definer` bez `search_path`, tabel bez RLS, funkcji `admin_*` bez kontroli uprawnień i `GRANT` dla `anon` na funkcje pomocnicze; skan kodu JS pod kątem nieescapowanych wartości wstawianych do HTML; przegląd service workera, przechowywania sesji i źródeł zewnętrznych.

## Wyniki przeglądu istniejącego kodu (bez zmian — poprawne)
* Wszystkie funkcje `security definer` mają `set search_path`; wszystkie tabele mają RLS; brak `GRANT` dla `anon` na funkcje `_*`; dwie funkcje `admin_*` oznaczone przez skan jako „bez kontroli” sprawdzają uprawnienia przez `_czy_staff_17` / `_rola_staff_18` (fałszywy alarm).
* Skan XSS: wszystkie wskazane interpolacje trafiają do tekstu/PDF/CSV albo są escapowane (`esc`).
* PIN nie jest zapisywany w przeglądarce; service worker nie przechwytuje zapytań do Supabase i cache'uje tylko GET z własnej domeny.

## Błędy i luki znalezione we własnych zmianach — naprawione
1. **Wyciek tożsamości w anonimowej wiadomości z Kiosku:** zrzut ekranu zrobiony na ekranie PIN/wyniku zawierał imię, kod i listę ostatnich obecności. Teraz te elementy są zastępowane szarym prostokątem o tym samym rozmiarze (`data-zrzut-ukryj` w `kiosk.html`, obsługa w `js/kontakt.js`).
2. **Treść pól formularzy trafiała do zrzutu** (maskowane były tylko pola typu hasło). Teraz wszystkie pola tekstowe i obszary tekstu są maskowane (•).
3. **Serwer przyjmował dowolne dane podpisane jako obraz.** Dodano walidację nagłówka (JPEG / PNG / WebP) — `sql/35`.
4. **Brak zabezpieczenia objętości:** globalny limit 2000 wiadomości / 24 h oraz ograniczenie długości pól w `kiosk_zglos_przeterminowana` — `sql/35`.
5. **Brak retencji wiadomości i zrzutów** (dane osobowe bez terminu): nowy przycisk „🧹 Wyczyść stare” i funkcja `admin_kontakt_czysc` usuwają załatwione wiadomości oraz zrzuty starsze niż N dni (z wpisem w audycie).

## Wzmocnienie bezpieczeństwa
* Wszystkie trzy strony: `Content-Security-Policy` z dyrektywami `object-src 'none'; base-uri 'self'; form-action 'self'` oraz `referrer: no-referrer`. Świadomie NIE ustawiono `script-src`/`connect-src`: aplikacja używa skryptów inline i kilku CDN (m.in. OCR), a błędna polityka mogłaby ją zepsuć bez możliwości przetestowania w przeglądarce.

## Zalecenia, których nie wdrożyłem (wymagają dostępu do sieci lub decyzji)
* Przypiąć wersję `@supabase/supabase-js` (obecnie `@2`) i dodać Subresource Integrity do skryptów z CDN — wymaga pobrania plików i obliczenia skrótów.
* Pełna polityka CSP (bez `unsafe-inline`) — wymaga przeniesienia skryptów inline do plików i testów w przeglądarce.

## Nadal otwarte
* `AUTOR_SYSTEMU` w `js/wersja.js` — nadal „Imię Nazwisko”.
* `sql/33`, `sql/34`, `sql/35` nie były uruchomione (brak PostgreSQL) — najpierw kopia/staging, w tej kolejności.
* Zachowanie w przeglądarce (zrzut, cenzura, CSP) nie było testowane.
* Anonimowość dotyczy osoby, nie urządzenia: Admin widzi numer Kiosku i godzinę wysłania.

## Testy
`npm test`: wszystkie przechodzą (w tym nowe testy cenzury, nagłówków, SQL 35 i tłumaczeń).
