# Raport v2.15.05 — Asystent AI tylko dla Admina

## Zakres
Zgodnie ze specyfikacją: chat 🤖 w prawym dolnym rogu (tylko `is_admin`), domyślnie wyłączony i zwinięty; Edge Function `asystent` z Mistral Large 4 i zapasowymi modelami; zagregowane dane przez bazę; maskowanie danych; historia tylko w pamięci karty; audyt bez treści; własny limit 12/min i 300/dobę; szkic odpowiedzi na wiadomość z podglądem i zgodą; teksty PL/EN/UK. Wdrożenie i zasady: `docs/ASYSTENT_AI.md`.

## Pliki
`js/asystent.js`, `js/asystent-sanityzacja.js` (+ identyczna kopia `supabase/functions/asystent/sanityzacja.js`), `supabase/functions/asystent/index.ts`, `sql/38_asystent_ai_v2_15_05.sql`, przycisk 🤖 w Wiadomościach (`app.part13.js`), kategoria „Asystent AI” w Audycie, style, i18n, `tests/asystent.test.mjs`.

## Testy
`npm test`: 96 przechodzi — widoczność tylko dla Admina, historia znika po wylogowaniu, brak klucza w froncie, maskowanie danych, agregaty bez danych osobowych, błędy 429 / 403 / 402 / sieć, zgoda i podgląd przed użyciem szkicu, brak akcji w systemie, tłumaczenia.

## Czego NIE sprawdzono (ważne)
* **Edge Function (`index.ts`) nie była uruchomiona** — brak Deno i sieci; weryfikowałem ją tylko jako tekst i przez wspólny, testowany moduł maskowania. Nie wywołałem prawdziwego API Mistral, więc nie wiem, czy Twoje konto ma dostęp do `mistral-large-4`, ani jakie nagłówki limitów zwraca (pokazywanie „pozostałego limitu” działa tylko, jeśli je zwróci).
* `sql/38` nie był uruchomiony (brak PostgreSQL). Agregaty są tolerancyjne (brak tabeli = pominięta sekcja), ale nazwy kolumn z plików 33/30 wpisałem z lektury kodu.
* Widżet testowany na atrapie DOM, nie w prawdziwej przeglądarce — wygląd i położenie okna sprawdź ręcznie na telefonie.
* „Zero data retention” i opt-out treningu to ustawienia konta w konsoli Mistral — kodem ich nie włączę.
* Maskowanie nie wykryje imion i nazwisk wpisanych w wolnym tekście; zabezpieczeniem jest podgląd i zgoda Admina.
* „Wyślij” szkic: system nie ma kanału odpowiedzi do nadawcy, więc „użycie” szkicu to kopiowanie albo zapis jako notatka.
