# Raport wdrożenia — Szyfr Ministrancki v2.2 (wersja aplikacji 2.12.08)

## Zmodyfikowane / nowe pliki
Nowe: `js/bezpieczny-magazyn.js`, `js/blokada-bezczynnosci.js`, `sql/29_wycofaj_kod3.sql`, `sql/30_idempotencja_retencja_audyt.sql`, `tests/magazyn.test.mjs`, `tests/synchronizacja.test.mjs`, `tests/bench-lokalny.mjs`, `package.json`, `docs/SZYFR_MINISTRANCKI.md`, `docs/RAPORT_WDROZENIA_v2.2.md`.
Zmienione: `js/kiosk.js`, `js/supabase-client.js`, `js/app.part1.js`, `js/app.part3.js`, `js/i18n.js`, `js/powiadomienia.js`, `js/wersja.js`, `app.html`, `kiosk.html`, `css/style.css`, `sw.js`, `docs/WDROZENIE.md`.
Usunięte: `js/app.part7.js` (wyłącznie kod 3). Historyczne `sql/01–28` i `archiwum/` bez zmian.

## Zmiany w schemacie (NIEURUCHOMIONE — brak PostgreSQL w środowisku)
* sql/30: tabele `operacje_offline`, `kolejka_retencja_audyt` (append‑only, wyzwalacze); funkcje `zapisz_obecnosc_idem`, `zglos_obecnosc_specjalna_idem`, `kiosk_audyt_retencji`.
* sql/29: DROP 7 funkcji kodu 3; tabela `kody_weryfikacyjne` → `kody_weryfikacyjne_wycofane` bez uprawnień.
Założenia sql/30 (migracja sama je sprawdza i przerywa): `zapisz_obecnosc` i `zglos_obecnosc_specjalna` mają 4 argumenty i zwracają jsonb z polem `sukces`; istnieje `kioski_tokeny`.

## Wyniki testów
**Uruchomione (Node 22, `npm test`): 29/29 zaliczonych** — 23 jednostkowe modułu magazynu + 6 integracyjnych uruchamiających prawdziwy kod `probojSynchronizacje` z `kiosk.js` z atrapą serwera. Kontrola mutacyjna: celowy błąd ACK został wykryty.
`node --check` — wszystkie pliki JS bez błędów składni.
**Nieuruchomione / zablokowane brakiem środowiska:** SQL 29/30 (brak PostgreSQL), `IdbAdapter` na prawdziwym IndexedDB, Kiosk i panel w przeglądarce, Service Worker, blokada bezczynności, wymuszenie MFA przez RPC (MFA nie istnieje), test „brak elementów MFA u ministranta” (MFA nie istnieje), remote wipe.
**Benchmark (tylko lokalna warstwa, pamięć zamiast IndexedDB, bez sieci):** dodanie wpisu p95 ≤ 0,4 ms; odczyt+odszyfrowanie 100/500/1000 wpisów: 25/45/72 ms. **Nie zmierzono** p50/p95 synchronizacji przez sieć ani scenariusza 1 Mbps/RTT 50 ms. Synchronizacja nadal wysyła **1 RPC na wpis** (100 wpisów ≈ 100 × RTT; cel p95 ≤ 1,5 s dla 100 operacji **nie jest osiągalny bez paczkowania** — to szacunek arytmetyczny, nie pomiar). Paczkowanie wymaga nowej funkcji SQL i nie zostało zrobione.

## Zmiany zachowania widoczne dla użytkowników
* Panel: po odświeżeniu karty trzeba zalogować się ponownie (PIN nie jest już w sessionStorage). Wylogowanie po 7 min bezczynności.
* Kiosk: wpis offline starszy niż 36 h → „przeterminowane”, nie synchronizuje się, dopóki Admin go nie przedłuży.
* Jeśli magazyn IndexedDB jest niedostępny, zapis offline jest **odrzucany** (komunikat), zamiast wracać do jawnego localStorage.

## Wymagane ręczne działania
1. Kopia bazy → uruchom `sql/30` na stagingu, sprawdź zapytania weryfikacyjne z końca pliku, test dwukrotnego `p_id_operacji`.
2. Wdróż frontend 2.12.08 (wersja w `wersja.js` wymusza odświeżenie cache SW).
3. Na każdym kiosku: otwórz online, aby wykonać migrację localStorage → IndexedDB (sprawdź w konsoli brak ostrzeżenia o zachowanym localStorage). Po synchronizacji sprawdź w DevTools→Application, że `em_offline_kolejka`/`em_offline_dane` zniknęły.
4. Po okresie karencji `sql/29`; później ewentualny `drop table kody_weryfikacyjne_wycofane`.
5. Zdecyduj o R1–R3 (pin_hash w cache, pin_jawny) — wymaga dostarczenia `sql/01–13`.
