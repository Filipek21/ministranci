# Raport v2.15.18 — wydajność i bezpieczeństwo (kolejna runda)

**Zastrzeżenie:** nie miałem przeglądarki, więc **nie zmierzyłem czasów ładowania** — zmiany wydajnościowe wynikają z analizy kodu i rozmiarów, a jedyną mierzalną liczbą jest rozmiar (narzędzie `npm run wydajnosc`). Czasy sprawdź w Chrome DevTools → Lighthouse przed i po. Nic nie usunięto z kodu; testy z poprzednich wersji przechodzą (zmieniono tylko asercje numeru wersji).

## A. Wydajność
| # | Zmiana | Efekt (oczekiwany) |
|---|---|---|
| 1 | `animacje.js`: obserwator DOM tylko zbiera mutacje i przetwarza je **raz na klatkę**, pomija je w ukrytej karcie | Mniej pracy przy renderze dużych tabel (wcześniej zapytania `querySelectorAll` przy każdej partii mutacji, synchronicznie) |
| 2 | Odświeżanie widoczności przycisków (Asystent, Kontakt) co 1 s oraz odświeżanie kart (`app.part11`, w tym zapytania do bazy co 5 min) **wstrzymane w ukrytej karcie** | Mniej CPU, baterii i zapytań w tle. Licznik bezczynności (blokada konta) celowo **nie** jest wstrzymywany |
| 3 | Service worker: **navigation preload** | Żądanie strony rusza równolegle ze startem SW (przy zimnym SW krótszy czas do pierwszego bajtu) |
| 4 | `tools/analiza-wydajnosci.mjs` + `tools/budzet-wydajnosci.json` + `npm run wydajnosc` + test budżetu | Rozmiar ścieżki krytycznej (gzip) jest pilnowany; nowy ciężki skrypt przekroczy budżet i test zgłosi to |

Stan wyjściowy (gzip, ścieżka krytyczna): index 98,6 kB · app 208,5 kB · kiosk 159,7 kB; pomoc i asystent (97–112 kB) już były ładowane z opóźnieniem.

**Czego świadomie NIE zrobiłem:** nie minifikowałem plików (usunęłoby to czytelność kodu, a GitHub Pages i tak kompresuje gzip); nie dzieliłem `i18n.js` (266 kB — największy pojedynczy skrypt krytyczny) na pliki językowe ani nie opóźniałem modułów aplikacji, bo bez przeglądarki nie da się wiarygodnie sprawdzić kolejności zależności; nie dodawałem `<link rel=preload>` (skaner preload przeglądarki już wcześnie odkrywa skrypty z końca `<body>`). To najbardziej obiecujące kierunki na kolejną rundę — wymagają jednak pomiaru w DevTools.

## B. Bezpieczeństwo
| # | Zmiana |
|---|---|
| 1 | **Strażnik sieci blokuje nawigację** na obce adresy (Navigation API; `location.href = 'https://obcy/?dane=…'`) — luka opisana w raporcie 2.15.17. Dozwolone: własne pochodzenie, `blob:`, `about:`, `mailto:`/`tel:`/`sms:`. **Działa tylko w przeglądarkach z Navigation API (Chrome/Edge/Opera, nowsze Safari); Firefox — nie.** |
| 2 | **Hamulec ruchu do bazy:** max 1500 żądań i 20 MB wysyłanych na minutę (okno przesuwne). Limity są hojne, żeby nie psuć synchronizacji kolejki Kiosku; zmienisz je w stałych `MAKS_*` w `straznik-sieci.js`. Mierzy ruch *wychodzący* — nie ogranicza ilości danych *odczytywanych* z bazy |
| 3 | Service worker: do cache trafia tylko odpowiedź ze statusem ok i typem innym niż „opaque”, a **pod adresem skryptu/stylu/obrazu nigdy strona HTML** (strona błędu zwrócona z kodem 200 nie zatruje pamięci offline Kiosku). Dotyczy też CDN |
| 4 | Identyfikator Kiosku w trybie zapasowym z `crypto.getRandomValues` zamiast `Math.random` |

## C. Ograniczenia i ryzyka
* Strażnik (w tym nawigacja i hamulec) jest testowany na atrapach, **nie w żywej przeglądarce** — sprawdź Kiosk, synchronizację offline po dłuższej przerwie (hurtowe wysłanie kolejki), PDF/QR/OCR. Wycofanie: usuń `js/straznik-sieci.js` z 3 stron HTML.
* Hamulec ruchu mógłby zablokować wyjątkowo dużą jednorazową synchronizację (>1500 wpisów w minucie); wpisy zostają w kolejce i zostaną wysłane po upływie okna.
* Nadal aktualne z 2.15.17: `pin_jawny` w bazie, brak SRI dla CDN, nieznane `sql/01–13`, skrypty SQL 43–46 nieuruchomione na prawdziwej bazie.

## D. Zmiany w istniejących testach (jawnie)
Asercje numeru wersji → 2.15.18 (8 plików) oraz dwie asercje o service workerze (`audyt-luki`, `bezpieczenstwo-ladowanie`): wzorzec `if (odp.ok) cache.put` zastąpiony równoważnym `if (bezpiecznaDoZapisu(...)) cache.put` — nowa funkcja nadal wymaga `ok` i dodaje kontrolę typu odpowiedzi i Content-Type.
