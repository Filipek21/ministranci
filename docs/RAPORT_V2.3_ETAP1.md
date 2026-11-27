# Raport v2.3 — Etap 1 (aplikacja 2.13.00)

## Zmienione / nowe pliki
Zmienione: `js/kiosk.js`, `js/bezpieczny-magazyn.js`, `js/i18n.js`, `js/wersja.js`, `kiosk.html`, `sw.js`, `docs/SZYFR_MINISTRANCKI.md` (§12), `tests/synchronizacja.test.mjs`, `tests/magazyn.test.mjs`.
Nowe: `sql/31_offline_token_tryb_cache_v23.sql`, `sql/32_cache_bez_pin_hash_wymus.sql`, `docs/RAPORT_V2.3_ETAP1.md`.

## Testy
**Uruchomione (Node 22, `npm test`): 46/46.** Nowe: obecnosc_token bez PIN-u, blokada duplikatów, trwałe odrzucenie PIN-u (jedna próba, PIN usunięty), brak `pin_hash` w cache (zapis i samoleczenie starego rekordu), ścieżka tokenowa synchronizacji (ACK po zapisie, utrata sieci po zapisie, brak tokenu, odrzucenia, clamp zegara — na **modelu JS reguł z sql/31**), prawdziwy kod `zapiszOffline` z `kiosk.js` (PIN tylko zaszyfrowany, tryb token bez PIN, odmowa kont uprzywilejowanych, duplikat), brak `bcrypt`/`pin_hash` w kodzie wykonywalnym kiosku (kontrola mutacyjna: wykryła celowy błąd).
**Nieuruchomione:** SQL 31/32 (brak PostgreSQL) — w tym samo egzekwowanie tokenu, okna, limitu i idempotencji po stronie serwera; Kiosk w przeglądarce; IndexedDB; migracja istniejących kiosków; testy MFA/remote wipe (Etap 2).

## Zmiany zachowania (do akceptacji)
1. Offline zły PIN wykrywany dopiero po synchronizacji (brak lokalnej weryfikacji). 2. Konta Admina/Księdza nie zapiszą obecności offline. 3. Jeden oczekujący zapis na osobę i wydarzenie. 4. `sql/32` po wdrożeniu odcina hashe także od starszych Kiosków (≤ 2.12.08 przestaną działać offline).

## Nierozwiązane
R3 (PIN oczekujących w zaszyfrowanej kolejce, tryb domyślny), tryb tokenowy = plakietka jako jedyny czynnik, R12 (polecenia Kiosku bez tokenu), R2, R4, R6, R7, R8, R9; brak UI do przełączania trybu offline; założenia Z1–Z3 w sql/31 do weryfikacji względem `zapisz_obecnosc` (sql/01–13).

## Wdrożenie
1. staging: `sql/31` → weryfikacja z końca pliku. 2. Frontend 2.13.00 na wszystkie Kioski (online, aby zadziałała migracja cache i wycięcie `pin_hash`). 3. Dopiero potem `sql/32`. 4. Tryb `token_bez_pin` — wyłącznie po decyzji i weryfikacji Z1–Z3.
