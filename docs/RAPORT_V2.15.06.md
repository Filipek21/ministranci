# Raport v2.15.06 — rozszerzenia Asystenta AI i lokalna poprawa list papierowych

## Nowe
* **Asystent — 5 szybkich akcji:** 🌅 Poranny przegląd, 🩺 Diagnostyka kiosku, 📖 Procedury (8 tematów + własne pytanie), 📈 Anomalie w liczbach, 📄 Raport miesięczny dla proboszcza (z przyciskiem 📋 kopiowania odpowiedzi). Opis i zasady danych: `docs/ASYSTENT_AI.md`.
* **Serwer:** `sql/39_asystent_rozszerzenia_v2_15_06.sql` — serie czasowe, dane miesięczne (same liczby, kioski anonimowe), `asystent_przygotuj` z zakresem (`podstawowy` / `trendy` / `miesiac`). Edge Function przyjmuje zakres tylko z listy.
* **Wiedza o systemie** dla modelu (procedury, diagnostyka) — bez zgadywania funkcji spoza listy.
* **Listy papierowe (lokalnie):** `js/lista-poprawki.js` — podpowiedź poprawnego kodu przy pomyłkach OCR i oznaczanie powtórzonych kodów. Podpowiedź nigdy nie zaznacza się sama.

## Decyzja: AI przy odczycie list papierowych — NIE
Zdjęcie listy to dane obecności małoletnich i nie da się go zamaskować przed wysłaniem poza urządzenie, co łamie zasady z `docs/ASYSTENT_AI.md`. Odczyt zostaje w przeglądarce.

## Testy
`npm test`: 107 przechodzi (11 nowych w `tests/asystent2.test.mjs`): zakresy danych, anonimowość kiosku, wiedza o systemie, kontrakt SQL 39, dopasowanie kodów i duplikaty, brak wysyłania z listy papierowej, tłumaczenia.

## Wdrożenie
Uruchom `sql/39` po `sql/38` (kopia/staging). Bez 39 asystent pokaże komunikat o brakującym SQL. Edge Function trzeba wdrożyć ponownie (`supabase functions deploy asystent`) — zmienił się `index.ts` i `sanityzacja.js`.

## Czego NIE sprawdzono
* SQL 39 i Edge Function nie były uruchomione (brak PostgreSQL / Deno / sieci). Nazwy kolumn (`operacje_offline.kiosk_id`, `utworzono`, `kontakt_admin.utworzono`, `oczekujace_akceptacji.utworzono`) wpisałem z lektury kodu; sekcje z błędem są pomijane, więc przegląd zadziała z tym, co się uda.
* Modale (diagnostyka, procedury, raport) sprawdzono statycznie i przez atrapę DOM tylko dla przycisków „poranny” i „anomalie”; pełny przebieg obejrzyj w przeglądarce.
* Diagnostyka kiosku zależy od pól listy kiosków (`online`, `ostatni_ping`, `wersja`, `ostatnie_dane`) — jeśli któreś ma inną nazwę, w opisie pojawi się „?” albo „brak”.
* Skuteczność dopasowania kodów na prawdziwych zdjęciach list nie była mierzona (brak Tesseracta i zdjęć); testy obejmują tylko logikę dopasowania.
* Jakość odpowiedzi modelu (np. raportu dla proboszcza) zależy od Mistral — przeczytaj ją przed użyciem.
