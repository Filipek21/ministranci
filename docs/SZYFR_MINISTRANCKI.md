# SZYFR MINISTRANCKI v2.2 → v2.3 — dokumentacja bezpieczeństwa E‑Ministrantów

Wersja aplikacji: 2.13.00 (v2.3, **Etap 1 z 3**; Etapy 2–3 — patrz §12.5). Sekcje §1–§11 opisują v2.2; zmiany v2.3 są w §12. Dokument opisuje **stan faktycznie wdrożony w repozytorium** oraz to, czego jeszcze nie ma.
Nie jest deklaracją zgodności z RODO ani oceną procentową bezpieczeństwa — patrz §11 (lista wymagań ze statusem).

## 1. Architektura (ustalona z kodu, nie założona)
* **Brak Supabase Auth.** Klient używa klucza `anon` (publiczny z założenia). Uwierzytelnianie = **kod + PIN w parametrach każdego RPC** (`p_kod`/`p_pin`, `p_kod_admina`/`p_pin_admina`). Serwer nie wydaje tokenu sesji.
  Konsekwencja: oficjalne MFA Supabase **nie zabezpiecza** tego przepływu (patrz §5).
* Panel (`app.html`) trzyma PIN w pamięci karty na czas sesji; Kiosk (`kiosk.html`) trzyma PIN w buforze tylko na czas operacji.
* Kiosk offline weryfikuje PIN lokalnie (`bcryptjs` na `pin_hash` z cache) i kolejkuje operację razem z PIN-em do późniejszej synchronizacji (`zapisz_obecnosc`).
* Migracje `sql/01–13` **nie są w repozytorium** — ciała `zapisz_obecnosc`, `zaloguj`, schemat bazowy i RLS nie były przeanalizowane.

## 2. Wyniki audytu (Etap 1)
| # | Komponent | Zachowanie przed zmianą | Ryzyko | Zmiana | Test / weryfikacja |
|---|---|---|---|---|---|
| A1 | `em_offline_kolejka` (localStorage) | Jawny `p_pin` + `p_kod` do synchronizacji; maskowany dopiero po ACK | **Wysokie** | Kolejka w zaszyfrowanym IndexedDB (AES‑256‑GCM); PIN usuwany po ACK | `magazyn.test` #6, #8; `synchronizacja.test` #3 |
| A2 | `em_offline_dane` (localStorage) | Cache z imionami, nazwiskami i **`pin_hash` wszystkich plakietek** w jawnym JSON | **Wysokie** | Szyfrowany cache; `pin_hash` nadal w cache (patrz R1) | `magazyn.test` #17 |
| A3 | `sessionStorage['sesja']` (panel) | Obiekt sesji z **jawnym PIN-em** Admina/Księdza | **Wysokie** | Usunięto zapis; PIN tylko w RAM; stary wpis kasowany przy starcie | przegląd kodu (`grep sessionStorage`) |
| A4 | Idempotencja | `id` wpisu tylko lokalny; duplikaty wykrywane przez dopasowanie tekstu błędu | Średnie | `p_id_operacji` + rejestr `operacje_offline` (sql/30) | `synchronizacja.test` #1–2 (model JS); SQL **nieuruchomione** |
| A5 | ACK | `wynik.sukces` lub tekst „już została zaliczona” | Niskie | Jawna klasyfikacja: błąd sieci i odrzucenie ≠ ACK | `magazyn.test` #8–10 |
| A6 | Kod 3‑cyfrowy | Wyłączony flagą, ale cały kod/SQL/i18n aktywny w repo | Średnie | Usunięty z frontendu; sql/29 wycofuje z bazy | `grep` (§3) |
| A7 | `pin_jawny` w `ministranci` | Jawny PIN w bazie, widoczny w panelu i drukowany na plakietkach | **Wysokie** | **Niezmienione** (funkcja biznesowa) → R2 | — |
| A8 | `em_kiosk_token` (localStorage) | Token kiosku (bearer) jawnie | Średnie | **Niezmienione** → R4 | — |
| A9 | `em_offline_blokady` (localStorage) | Liczniki prób PIN per kod, jawnie; kasowalne przez napastnika | Niskie/Średnie | **Niezmienione** → R5 | — |
| A10 | Skrypty z CDN | `supabase-js@2`, `bcryptjs` z jsDelivr bez przypięcia wersji i SRI | Średnie | **Niezmienione** → R6 | — |
| A11 | Audyt | Wyzwalacz generyczny (sql/24); brak łańcucha hashy, brak blokady UPDATE/DELETE/TRUNCATE | Średnie | Tylko nowa tabela audytu retencji jest „append‑only” (sql/30) | — |
| A12 | Blokady PIN | Serwer: progi 3/5/7/10/15 (sql/16); Kiosk: lokalnie te same progi + hamulec; **brak auto‑kasowania** | OK | Bez zmian (zgodne z wymaganiem) | przegląd kodu |
| A13 | Bezczynność | Panel: brak blokady | Średnie | `blokada-bezczynnosci.js` (7 min, visibilitychange, pagehide) | przegląd; test w przeglądarce **nieuruchomiony** |

## 3. Wycofanie kodu 3‑cyfrowego (Etap 2)
Usunięto: `KOD3_WLACZONY`, `RPC_Z_KODEM3`, `parametryZKodem3`, `ustawKod3Sesji` (klient RPC); pole `login-kod3`; logikę etapu 2 w Kiosku (`zatwierdzKod3`, bufor, kropki, CSS); `js/app.part7.js` (modal ustawiania, reset); przyciski i znaczniki w Ministrantach; klucze i18n (pl/en/uk) i mapowanie błędów; wpisy w `powiadomienia.js`.
Zachowano celowo: kategorię audytu `kod3` + `aud.c.kod3` (czytelność historii), historyczne `sql/19`, `sql/21`, `archiwum/`.
`sql/29_wycofaj_kod3.sql`: kontrola zależności (przerywa, gdy inna funkcja woła wycofywane), `drop` 7 funkcji, tabela `kody_weryfikacyjne` → **rename + odebranie uprawnień** (nie kasowana). **Wdrażać po frontendzie.**
Zwykły ministrant: nadal tylko plakietka → PIN → potwierdzenie (przepływ `zatwierdzPin` bez zmian dla nie‑ról).

## 4. Kolejka offline i cache (Etap 5)
**Moduł:** `js/bezpieczny-magazyn.js` (WebCrypto + IndexedDB, baza `em_bezpieczne`).
* **Rekord:** `{ v:1, kv:<wersja klucza>, iv:<96 bit b64>, ct:<b64> }` + jawny, minimalny indeks (`id`, `status`, `rodzaj`, `kiedy_lokalnie`, `wygasa_at`). Treść (PIN, kod, wydarzenie) wyłącznie w `ct`.
* **AAD** = `em|v1|<cel>|<id>|<kv>` — rekord nie może być przeniesiony pod inne `id`/cel (test #3).
* **Walidacja** schematu przy zapisie i odczycie (PIN `^\d{4}$`, długości, rodzaj). Zmieniony/uszkodzony rekord → status „uszkodzone”, **nie jest kasowany po cichu**.
* **Identyfikator operacji:** `op-<UUID v4>` (CSPRNG), wysyłany jako `p_id_operacji`; serwer (sql/30) zapisuje go w `operacje_offline` w tej samej transakcji co obecność (advisory lock na id → równoległe powtórzenia się serializują).
* **ACK** = `sukces:true` (w tym `duplikat_operacji:true`) albo rozpoznanie „już zaliczona/rozpatrzone”. Błąd sieci, timeout, 5xx i odrzucenia **nie** usuwają wpisu. Po ACK: payload kasowany, zostaje **znacznik bez danych osobowych** (`id`, rodzaj, status, czasy) przez 48 h.
* **Atomowość ACK:** znacznik zapisywany przed usunięciem payloadu; po awarii pomiędzy krokami odczyt uzgadnia stan (test #12).
* **Restart/zamknięcie karty:** `dodaj()` zwraca dopiero po trwałym zapisie; kiosk pokazuje „zapisano” dopiero po `true`. Przy błędzie magazynu operacja jest **odrzucana** (nie ma ukrytego powrotu do localStorage).
* **Migracja** z localStorage (`migrujLegacy`): przenosi oczekujące wpisy, kasuje klucze dopiero po odczytaniu i porównaniu kopii; wpisy z już zamaskowanym PIN‑em (`••••`) nie da się wysłać — są pomijane i liczone; uszkodzony JSON → nic nie jest kasowane.
* **Cache:** szyfrowany jako jeden rekord; `pobrano` jawnie (do 10‑dniowej ważności, `OFFLINE_MAKS_WIEK_MS` bez zmian). Retencja cache ≠ retencja kolejki.

### Retencja 36 h i konsekwencje długiej awarii
Wpis starszy niż 36 h dostaje status **„przeterminowane”**: przestaje być wysyłany, **nie jest usuwany**, pasek statusu pokazuje ⏰ i licznik, znaczek kolejki świeci alarmem. **Skutek:** obecności zapisane podczas awarii dłuższej niż 36 h **nie trafią na serwer**, dopóki Admin ich nie przedłuży (albo nie zdecyduje o usunięciu).
Procedura Admina (Kiosk → tryb awaryjny Admina → Kolejka): „⏰ Przedłuż przeterminowane o 24 h / 7 dni” — **bez limitu liczby przedłużeń** (jedno kliknięcie ≤ 8760 h). Każde przedłużenie/usunięcie → wpis audytu `{aid, akcja, op_id, kto, kiosk_id, godzin, wygasa_przed, wygasa_po, kiedy}` zapisany lokalnie i wysyłany tokenem kiosku do `kolejka_retencja_audyt` (idempotentnie po `aid`). Offline: wpis audytu czeka lokalnie na synchronizację.
**Uwaga:** pole `kto` pochodzi z kiosku i **nie jest weryfikowane przez serwer** (audyt wysyła token kiosku, nie PIN Admina).
**Usunięcie bezwarunkowe** (przyciski „Usuń zablokowane/zakończone”) jest **nieodwracalne** — utrata obecności, których nie zdążono zsynchronizować; audytowane.

## 5. MFA/TOTP (Etap 3) — **NIE WDROŻONE**
Powód: brak sesji serwerowej. Każdy uprzywilejowany RPC sam weryfikuje kod+PIN; „ostatnie_2fa_at” nie ma gdzie być egzekwowane bez zmiany ~30+ funkcji `admin_*`/`ksiadz_*` (część ich ciał jest w niedostępnych plikach 01–13).
Zaprojektowana droga (do wykonania):
1. Tabele `mfa_sekrety` (sekret szyfrowany po stronie bazy, np. Supabase Vault/pgsodium — **do potwierdzenia dostępności w projekcie**) i `mfa_proby` (limit prób, blokady).
2. Weryfikacja TOTP (RFC 6238, HMAC‑SHA1/30 s/6 cyfr, okno ±1) w funkcji `security definer` na czasie `now()` serwera; `ostatnie_2fa_at := now()` tylko po sukcesie; sekret nigdy w odpowiedzi/logu.
3. Token sesji serwerowej: `mfa_zaloguj(kod, pin, totp)` → losowy token (hash w tabeli, TTL), a każda funkcja uprzywilejowana woła wspólny `_wymagaj_mfa(kod, pin, token)` (odrzuca, gdy `now() - ostatnie_2fa_at > 14 dni`).
4. Odzyskiwanie: kody jednorazowe zapisywane jako hashe + reset przez Admina z audytem (Admin resetujący Admina wymaga drugiej osoby).
Alternatywa: migracja na Supabase Auth + oficjalne MFA (AAL2 w RLS/RPC) — większa zmiana architektury.
UI: elementy MFA mają być renderowane wyłącznie dla ról Admin/Ksiądz/Moderator; autoryzacja i tak po stronie serwera.

## 6. Kryptografia i klucze (Etap 4)
| Wymaganie | Stan |
|---|---|
| AES‑256‑GCM | **Wdrożone** (WebCrypto, tag 128 bit, AAD) |
| Osobne klucze do celów | **Wdrożone**: HKDF‑SHA‑256 z klucza głównego; `info=cel:<kolejka\|cache>\|kv:<n>` |
| CSPRNG, unikalny nonce | **Wdrożone**: `crypto.getRandomValues`; 96‑bit losowy IV + kontrola kolizji w sesji (test: 5000 unikalnych). Limit NIST dla losowych IV (~2³² wiadomości/klucz) jest o rzędy wielkości powyżej użycia; rotacja co 30 dni dodatkowo go ogranicza |
| Wersjonowanie formatu i klucza | **Wdrożone** (`v`, `kv`) |
| Rotacja co 30 dni | **Wdrożone**: `rotujKlucz()` tworzy kv+1, przeszyfrowuje kolejkę i cache; stary klucz oznaczony „wycofany”; `usunWycofaneKlucze()` kasuje klucz **tylko**, gdy żaden rekord go nie używa. Awaria w trakcie rotacji nie niszczy dostępu do starych rekordów (test #19). Rotacja uruchamia się przy starcie kiosku, gdy minęło 30 dni |
| Argon2id | **Niewdrożone.** Brak sieci do pobrania i zweryfikowania pochodzenia/wersji/integralności biblioteki. Obecna architektura **nie wyprowadza kluczy z hasła** (klucz jest losowy, nieeksportowalny), więc Argon2id nie jest potrzebny, dopóki nie wprowadzi się opakowania klucza hasłem/PIN‑em. **Argon2id nie czyni 4‑cyfrowego PIN‑u silnym hasłem** (10⁴ możliwości) |
| HMAC‑SHA‑512, Ed25519 | **Niewdrożone** — brak zastosowania w obecnej architekturze (brak bezpiecznego przechowywania kluczy podpisu i weryfikacji po stronie serwera) |
| Opakowanie klucza głównego / odblokowanie | **Niewdrożone.** Klucz jest nieeksportowalny w IndexedDB bez dodatkowego sekretu (urządzenie‑kiosk działa bez użytkownika). `zablokuj()` zrzuca pochodne klucze z pamięci |
| Identyfikator urządzenia | Nie jest używany jako sekret |

### Rozdział pojęć
* **TLS** — ochrona transmisji do Supabase (zarządza hosting; aplikacja nie negocjuje TLS i nie deklaruje TLS 1.3).
* **Szyfrowanie lokalne** — ten dokument §4/§6: ochrona „w spoczynku” w przeglądarce.
* **E2EE — NIE jest zapewnione.** Serwer musi znać PIN, by zweryfikować obecność i przyznać punkty; dane są jawne dla bazy.

### Ograniczenia PWA (realne)
* Skrypt z tego samego pochodzenia (XSS, złośliwy dodatek, skompromitowany CDN) wywoła te same funkcje WebCrypto na nieeksportowalnym kluczu i odszyfruje dane. Nieeksportowalność chroni przed **wyniesieniem** klucza, nie przed jego **użyciem**.
* Szyfrowanie chroni przed: odczytem plików profilu/zrzutu dysku, podglądem DevTools→Application przez osobę bez dostępu do działającej sesji kodu, dostępem do kopii zapasowej profilu bez klucza z IndexedDB (klucz leży jednak w tym samym profilu — kto skopiuje **cały** profil, skopiuje też klucz; to ochrona przed przypadkowym/powierzchownym wglądem, nie przed wyspecjalizowanym napastnikiem z pełnym dostępem do urządzenia).
* Nie ma gwarancji zerowania pamięci JS.
* `Content-Security-Policy`, SRI i przypięcie wersji CDN są **niewdrożone** (R6).

## 7. Kradzież urządzenia (Etap 6)
* **Blokada po 5 błędach PIN** — bez auto‑kasowania; istnieje narastająca blokada serwerowa (sql/16: 3→1 min, 5→5 min, 7→15 min, 10→1 h, 15→ręcznie) i lokalna kopia progów w Kiosku + hamulec 5 błędów/5 min. Zachowane.
* **Remote wipe — NIE WDROŻONY.** Projekt: tabela `kiosk_polecenia(kiosk_id, typ, utworzyl, utworzono, wykonano_at, potwierdzenie)`; utworzenie wymaga Admina + MFA (po §5); kiosk odpytuje przy kontakcie z serwerem, wykonuje `magazyn.wyczyscWszystko()` + usuwa token + rotuje klucze, po czym wysyła **potwierdzenie**; do potwierdzenia polecenie jest „oczekujące”. Przed wipe: lista wpisów niezsynchronizowanych (ryzyko nieodwracalnej utraty) i próba synchronizacji.
* **Blokada po bezczynności:** panel — 7 min (`js/blokada-bezczynnosci.js`); wylogowanie czyści sesję (PIN) i pola. Kiosk — istniejący mechanizm czuwania/ekranu głównego (`kiosk-czuwanie.js`) **nie został zmieniony ani przeanalizowany pod kątem 7 min**.

## 8. Transmisja, logi i audyt (Etap 7)
* HTTPS: zapewnia Supabase i hosting aplikacji (konfiguracji hostingu nie sprawdzano); aplikacja nie wymusza wersji TLS.
* Replay: ochrona opiera się na `p_id_operacji` + unikalnych kluczach w bazie, **nie** na zegarze tabletu.
* Logi: kod nie loguje PIN‑ów; `wywolajRPC` loguje obiekt błędu Supabase (komunikat serwera). Nowy kod loguje tylko `e.name`. **Nie przeprowadzono pełnego przeglądu** payloadu pingów diagnostycznych (`kiosk-sterowanie.js`).
* **Audyt z łańcuchem hashy — NIEWDROŻONY** dla głównego audytu (sql/18/24/28). Dla `kolejka_retencja_audyt` jest append‑only (wyzwalacze UPDATE/DELETE/TRUNCATE). Chroni to przed omyłkową/zwykłą modyfikacją przez role aplikacyjne; **nie chroni** przed właścicielem tabeli/superuserem/administratorem projektu Supabase, który może wyłączyć wyzwalacz lub zmienić dane. Łańcuch hashy wykryłby edycję historii tylko wtedy, gdy najnowszy hash jest przechowywany poza zasięgiem tego administratora.

## 9. Procedury
**Wdrożenie:** (1) frontend 2.12.08 → (2) `sql/30` → (3) test idempotencji → (4) `sql/29` po upewnieniu się, że nikt nie używa starych kart.
**Awaria sieci > 36 h:** Kiosk pokazuje ⏰; Admin przedłuża (24 h/7 d) i synchronizuje; w razie potrzeby eksport/ręczne wprowadzenie obecności z papierowych list (sql/22).
**Rotacja ręczna:** wywołanie `magazyn.rotujKlucz()` z konsoli; potem `usunWycofaneKlucze()`.
**Utrata klucza (np. wyczyszczenie danych witryny):** wpisy w kolejce są nieodzyskiwalne; cache zostanie pobrany ponownie po autoryzacji Admina.
**Odzyskiwanie po przerwanej migracji:** stare klucze localStorage są zachowane do zweryfikowanego zapisu; ponowne uruchomienie migruje ponownie (id zachowane → brak duplikatów).

## 10. Ryzyka nierozwiązane
* **R1 (wysokie):** `pin_hash` (bcrypt 4‑cyfrowego PIN‑u) jest w cache **każdego kiosku**. Zbiór 10⁴ PIN‑ów jest łamany offline w sekundach–minutach, więc szyfrowanie cache nie powstrzyma napastnika z dostępem do działającego kiosku. Rozwiązanie: autoryzacja operacji offline tokenem kiosku **bez** hashy PIN na urządzeniu (wymaga ciała `zapisz_obecnosc` z sql/01–13 i decyzji o modelu zaufania).
* **R2 (wysokie):** `pin_jawny` w bazie i panelu. Rozwiązanie: PIN pokazywany jednorazowo przy tworzeniu/resecie, bez przechowywania.
* **R3 (wysokie):** PIN nadal jest w payloadzie kolejki (zaszyfrowanym) do czasu ACK — autoryzacja serwerowa wymaga PIN‑u. Problem ograniczony, **nie rozwiązany** (jak R1).
* R4 token kiosku w localStorage; R5 liczniki blokad w localStorage (kasowalne); R6 CDN bez SRI/CSP; R7 brak MFA; R8 brak remote wipe; R9 brak łańcucha hashy; R10 `kto` w audycie retencji niezweryfikowany; R11 RLS i ciała funkcji 01–13 nieprzeanalizowane.

## 11. Lista wymagań ze statusem
Wdrożone i przetestowane w Node: szyfrowanie/odszyfrowanie, odrzucenie złego klucza i zmodyfikowanego ct, unikalność nonce, kolejka (restart, wygaśnięcie, przedłużenia, ACK), rotacja kluczy, migracja localStorage, brak jawnych PIN‑ów w magazynie, przerwanie sieci przed zapisem/po zapisie.
Wdrożone, **nieprzetestowane** (brak środowiska): SQL 29/30, `IdbAdapter` na prawdziwym IndexedDB, integracja UI Kiosku w przeglądarce, blokada bezczynności, Service Worker.
**Niewdrożone:** MFA/TOTP, remote wipe, łańcuch hashy audytu, Argon2id/HMAC/Ed25519, CSP/SRI, batch sync, testy „wymuszenie MFA przez RPC”, „brak elementów MFA u ministranta”, „błędne podpisy/sekwencje”.


---
# §12. v2.3 — Etap 1: model offline bez `pin_hash` (R1, R3)

## 12.1 Residual risks po v2.12.08 → plan
| Ryzyko | Stan po v2.12.08 | v2.3 — zmiana | Stan po Etapie 1 |
|---|---|---|---|
| R1 `pin_hash` w cache Kiosku | w zaszyfrowanym cache, łamany po zdobyciu klucza | usunięty z serwera (sql/31–32) i z klienta (czyszczenie przy zapisie/odczycie, także starych rekordów) | **Zamknięte** po wdrożeniu sql/32 i Kiosków ≥ 2.13.00 |
| R3 PIN w kolejce do ACK | PIN każdej oczekującej operacji | tryb domyślny: PIN tylko zaszyfrowany, usuwany po odrzuceniu; opcjonalnie tryb tokenowy bez PIN-u | **Zmniejszone, nie zamknięte** (patrz §12.3) |
| R2 `pin_jawny` | bez zmian | Etap 2 | otwarte |
| R7 MFA, R8 remote wipe | brak | Etap 2 | otwarte |
| R4 token Kiosku w localStorage | bez zmian | Etap 3 | otwarte |
| R6 CDN bez SRI/CSP | `bcryptjs` usunięty z Kiosku (mniej zależności); `supabase-js@2` bez przypięcia | Etap 3 | częściowo |
| R9 łańcuch hashy | brak | Etap 3 | otwarte |
| **R12 (nowe)** | `kiosk_polecenia_pobierz` i `kiosk_polecenie_wynik` (sql/26) **nie weryfikują tokenu Kiosku** — kto zna `kiosk_id`, może odbierać polecenia i fałszować „wykonano” | Etap 2 (obowiązkowo przed remote wipe) | **otwarte** |
| **R13 (nowe)** | PIN Admina/Księdza trafiał do kolejki offline | konta uprzywilejowane nie są obsługiwane offline (zapis wymaga sieci) | zamknięte |

## 12.2 Fundamentalny konflikt i jak go rozstrzygnięto
Cel „Kiosk nie potrzebuje PIN-u ani `pin_hash`” koliduje z zasadą „nie osłabiać kontroli dostępu”. **Weryfikator 4‑cyfrowego PIN-u na urządzeniu zawsze da się złamać offline** (10⁴ kandydatów; Argon2id tego nie zmienia). Zatem offline albo (a) nie weryfikujemy PIN-u lokalnie, albo (b) trzymamy weryfikator i akceptujemy R1. Wdrożono oba warianty (a):
* **Tryb `pin_na_serwerze` (domyślny, nie osłabia kontroli dostępu).** Offline: skan → PIN → zapis do zaszyfrowanej kolejki, **bez** lokalnej weryfikacji (nie ma hasha). Serwer weryfikuje PIN przy synchronizacji (`zapisz_obecnosc_idem`, sql/30). Skutki: zły PIN wykrywany dopiero po połączeniu (komunikat „PIN zostanie sprawdzony po połączeniu”); odrzucony PIN → status „błąd”, **bez ponawiania** (ponawianie blokowałoby konto ministranta) i **PIN usuwany natychmiast**; jeden oczekujący wpis na (ministrant, wydarzenie) ogranicza zgadywanie PIN-ów na urządzeniu.
* **Tryb `token_bez_pin` (opt-in per Kiosk, wyłączony domyślnie).** Operacja: `kiosk_zapisz_obecnosc_token(kiosk_id, token, id_operacji, kod, wydarzenie, wybór, czas_klienta)`. Serwer weryfikuje token (bcrypt przez `crypt`), a nie PIN. **Tu offline plakietka jest jedynym czynnikiem** — każdy, kto ma plakietkę (lub jej kod), zapisze obecność tej osoby. To świadome osłabienie, dlatego: włącza je tylko Admin z jawnym potwierdzeniem ryzyka; konta Admin/Ksiądz zawsze wymagają PIN-u; limit 200 op./h/Kiosk; czas zdarzenia ograniczony do `[ostatni kontakt serwera, teraz]` (zegar tabletu nie jest zaufany) i musi mieścić się w oknie zapisu wydarzenia; nigdy nie nadpisuje istniejącej obecności; ślad w `operacje_offline` (Kiosk, ministrant, wydarzenie) i w `dziennik_audytu`.
Włączenie (brak UI — wykonaj jako Admin w SQL Editor/RPC): `select public.admin_kiosk_tryb_offline_ustaw('<kod>','<pin>','<kiosk_id>','token_bez_pin', true);` Wyłączenie: tryb `pin_na_serwerze`. Kiosk dowiaduje się o trybie z cache (`tryb_offline`), więc zmiana działa po następnym odświeżeniu cache.
**Zalecenie:** zostaw tryb domyślny, dopóki nie zweryfikujesz założeń Z1–Z3 (sql/31, nagłówek) i nie zaakceptujesz ryzyka brakującego PIN-u.

## 12.3 Ścieżka uwierzytelnienia operacji offline (rzeczywista)
`skan plakietki → (tryb domyślny) PIN → zaszyfrowany wpis {id operacji, kod, PIN, wydarzenie} → sync: zapisz_obecnosc_idem(PIN weryfikuje serwer) → ACK dopiero po sukcesie/rozpoznaniu id → payload usunięty`
`skan plakietki → (tryb token) wpis {id operacji, kod, wydarzenie, czas} bez PIN-u → sync: kiosk_zapisz_obecnosc_token(token Kiosku weryfikuje serwer) → ACK → payload usunięty`
**R3 w trybie domyślnym nadal istnieje**: PIN oczekującej operacji leży (zaszyfrowany kluczem dostępnym tej samej aplikacji) do ACK lub odrzucenia. Zakres ekspozycji = tylko osoby z oczekującymi wpisami (nie wszyscy ministranci), czas ≤ 36 h (+ przedłużenia Admina). Pełne zamknięcie R3 = tryb tokenowy (kosztem §12.2) albo model z sesją serwerową (Etap 2+).
**Token Kiosku** nadal w `localStorage` (R4, Etap 3): jego kradzież pozwala w trybie tokenowym wysyłać operacje dopóki Admin nie unieważni tokenu (re‑autoryzacja Kiosku nadpisuje hash tokenu).

## 12.4 Zmiany w kodzie i schemacie
Klient: `js/kiosk.js` (brak `bcrypt`, `offlineWeryfikujPin`, `pin_hash`; nowe `offlineTrybToken`, ścieżka `obecnosc_token`), `js/bezpieczny-magazyn.js` (rodzaj `obecnosc_token`, blokada duplikatów, trwałe odrzucenie PIN-u z czyszczeniem, `oczyscCache`), `kiosk.html` i `sw.js` (bez `bcryptjs`), `js/i18n.js`, `js/wersja.js` → 2.13.00.
SQL (**nieuruchomione**): `sql/31_offline_token_tryb_cache_v23.sql` (addytywna), `sql/32_cache_bez_pin_hash_wymus.sql` (zmienia zachowanie: wdrażać po aktualizacji wszystkich Kiosków; opakowuje `pobierz_cache_offline` przez zmianę nazwy oryginału na `_pobierz_cache_offline_przed23`).
Założenia SQL: `pobierz_cache_offline(text,text)` zwraca `jsonb` z tablicą `plakietki` (migracja przerywa się/pomija, gdy nie); `kalendarz.okno_start/okno_koniec`, `kioski_tokeny.utworzono/ostatnie_uzycie`, `ministranci.is_admin/is_moderator/aktywny` istnieją (widoczne w migracjach 14/18/27).

## 12.5 Plan Etapów 2–3 (nie wykonano)
Etap 2: `pin_jawny` (jednorazowy podgląd PIN-u), **najpierw R12** (token w `kiosk_polecenia_pobierz/wynik`), remote wipe na istniejącym `kiosk_polecenia`, TOTP wg §5. Etap 3: SRI/przypięcie CDN + CSP, token Kiosku do magazynu, łańcuch hashy audytu, batch RPC.

# §13. v2.15.04 — Paczkowanie (batch) i rate-limit synchronizacji

## 13.1 Paczki (klient: `js/paczki.js` + `probojSynchronizacje` w `js/kiosk.js`)
* Jedna paczka: **maks. 5 wpisów** i **maks. 8 KB** (UTF-8, po `JSON.stringify` całego body: kiosk, token, rodzaj, wpisy). Przekroczenie któregokolwiek limitu zamyka paczkę i otwiera nową.
* Kolejność: od najstarszego wpisu (`kiedy_lokalnie`) do najnowszego. **Jeden rodzaj na paczkę** (`obecnosc`, `obecnosc_token`, `zgloszenie`) — rodzajów nie mieszamy.
* Idempotencja nadal **na wpis** (`p_id_operacji` = `id` wpisu) — paczka jest tylko transportem; ponowienie paczki jest bezpieczne.
* Wpisy w paczce zawierają wyłącznie znane pola danego rodzaju. PIN wysyłany jest tylko w paczkach `obecnosc` / `zgloszenie` (jak dotąd w pojedynczych wywołaniach) i znika z urządzenia po ACK.
* Paczki lecą sekwencyjnie. Wpisy `przeterminowane` (> 36 h → akceptacja Admina) **nie są paczkowane** — logika 36 h bez zmian.

## 13.2 Odpowiedź serwera i ACK (`kiosk_zapisz_paczke`)
`{"sukces":true,"wyniki":[{"id","sukces","duplikat",["kod_bledu","blad"]}, …]}` — każdy wpis przetwarzany niezależnie (własny podblok z obsługą wyjątku).
| Sytuacja | Zachowanie klienta |
|---|---|
| błąd sieci / timeout całej paczki | **brak ACK**, synchronizacja przerwana, próby bez zmian |
| częściowy sukces | ACK tylko wpisów z `sukces:true` (duplikat = sukces); reszta normalną ścieżką błędu (próby +1, PIN odrzucony → bez ponowień) |
| wpis bez wyniku w odpowiedzi | brak ACK, próby bez zmian |
| `rate_limit` | brak ACK, **próby bez zmian**; odczekanie 15–30 s (losowo), maks. 2 ponowienia w cyklu, potem wracamy przy następnej synchronizacji; pasek stanu pokazuje komunikat |
| `token_nieprawidlowy` | synchronizacja zatrzymana, próby bez zmian |
| brak funkcji / paczka odrzucona (`paczka_za_duza`) | klient przełącza się na starą ścieżkę (po 1 wpisie) do końca sesji strony |

## 13.3 Rate-limit (serwer, `sql/37`) — wyłącznie w Postgresie, PO weryfikacji tokenu, PRZED przetworzeniem wpisów
| Kierunek | Limit |
|---|---|
| paczki obecności + audyt retencji (`kiosk_audyt_retencji_limit_37`) — licznik `wysylka` | **25/min/kiosk** przy 1–2 aktywnych kioskach, **20/min/kiosk** przy ≥ 3 |
| pobieranie cache (`kiosk_pobierz_cache_limit_37`) — osobny licznik `cache` | 10/min/kiosk |
| ping / lekkie statusy | bez limitu |
* **Aktywny kiosk** = kontakt z serwerem (paczka, audyt, cache, użycie tokenu) w ciągu 10 minut.
* **Okno stałe** (minuta zegarowa), licznik zwiększany atomowo (`insert … on conflict do update … where licznik < limit`) — bezpieczne przy równoległej pracy wielu kiosków. Wybrano okno stałe jako prostsze od przesuwnego; koszt: na przełomie minut kiosk może krótko wysłać do 2× limitu.
* Serwer odrzuca paczkę > 5 wpisów lub > 9216 B `p_wpisy::text` (8 KB + 1 KB zapasu, bo `jsonb` dodaje spacje) niezależnie od klienta.
* Zgodność wsteczna: stare funkcje (pojedyncze wpisy) bez zmian i bez limitu paczek — stary klient działa; limity egzekwują nowe funkcje.
* Ograniczenie: ping (`kiosk_ping`) nie jest podpięty do licznika aktywności (jego definicji nie ma w repozytorium); aktywność liczą paczki, audyt, cache i `kioski_tokeny.ostatnie_uzycie`.
