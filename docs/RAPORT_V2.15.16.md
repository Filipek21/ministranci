# Raport v2.15.16 — audyt luk bezpieczeństwa (analiza statyczna kodu i skryptów SQL)

**Zakres i uczciwe ograniczenia.** Przeczytano: wszystkie `sql/14–42` (ok. 150 funkcji), Edge Function `asystent`, klienta (`supabase-client`, `kiosk*`, `app.part*`, `kontakt`, `sw.js`, strony HTML). **Nie** przeczytano `sql/01–13` (nie ma ich w repozytorium: tabele, RLS, ciała `zaloguj`/`zapisz_obecnosc`), **nie** uruchomiano PostgreSQL ani przeglądarki, **nie** wykonano testów penetracyjnych na żywym systemie. „Znaleźć wszystkie luki” nie da się zagwarantować — poniżej to, co znaleziono i sprawdzono.

## A. Znalezione luki
| # | Waga | Luka | Stan w 2.15.16 |
|---|---|---|---|
| V1 | **Średnia** | **R12:** `kiosk_polecenia_pobierz`, `kiosk_polecenie_wynik`, `kiosk_odpowiedz_ping`, `kiosk_pobierz_zadania` wywoływalne **anonimowo** po samym `kiosk_id` (UUID widoczny w panelu Admina i diagnostyce). Skutki: przechwytywanie poleceń Admina dla prawdziwego Kiosku (odmowa usługi kanału sterowania, w tym blokady), fałszowanie wyniku poleceń i odpowiedzi na ping, odczyt stanu blokady. Polecenia mógł nadal wydawać tylko Admin (PIN) | **Naprawione w kodzie:** `sql/41` (warianty `*_v2` z tokenem Kiosku, bcrypt jak `kiosk_pobierz_cache_v23`) + `sql/42` (krok 2: odebranie anonimowego dostępu do starych funkcji) + klient `wywolajRPCKiosku` (token, zapas na starą funkcję). **SQL nieuruchomiony** — wymaga testu na kopii bazy |
| V2 | Niska–średnia | CSP: `connect-src https://*.supabase.co` pozwalało XSS wysłać dane do **cudzego** projektu Supabase; `script-src` wpuszczał całe hosty `unpkg.com` i `cdnjs` | **Naprawione:** `connect-src` = dokładny host z `supabase-client.js` (test pilnuje zgodności); `unpkg`/`cdnjs` tylko jako dokładne adresy plików; strona startowa bez żadnych zewnętrznych skryptów i połączeń; Kiosk bez WASM i bez zapasowych CDN. **Pozostaje:** `cdn.jsdelivr.net` jako cały host (potrzebny Tesseractowi i redirectom `@2`) — zamknie to SRI + przypięcie (`tools/sri.mjs`) |
| V3 | Niska | Service worker zapisywał **nieprzejrzystą** odpowiedź CDN (no-cors) — strona błędu CDN mogła zostać zapamiętana do następnej wersji | **Naprawione:** tryb CORS + zapis tylko `ok` |
| V4 | Niska | Edge Function: biblioteka z `esm.sh` bez przypięcia wersji (łańcuch dostaw), `CORS *` bez możliwości zawężenia, treść czytana przed sprawdzeniem rozmiaru, brak limitu długości kodu/PIN | **Naprawione:** przypięta wersja (`2.45.4` — **sprawdź, czy istnieje, przed wdrożeniem**), sekret `ALLOWED_ORIGIN`, kontrola `content-length`, limit długości. CORS to nie uwierzytelnianie — chroni kod + PIN w bazie |
| V5 | Niska | `kiosk_zapisz_skan` anonimowe: globalny licznik 120/min można **wyczerpać** (utrata wpisów historii skanów) i zaśmiecać tabelę dowolnym `kiosk_id`/kodem | **Nienaprawione** — ten sam wzorzec co V1 (wariant z tokenem); zalecane w następnym wydaniu |
| V6 | Niska (projekt) | Blokada PIN jest per **kod konta**, a kody są przewidywalne (`MIN-001`…) — każdy może zablokować dowolne konto, także Admina (odmowa usługi), do ręcznego odblokowania | **Nienaprawione** (kompromis: bez blokady byłoby zgadywanie PIN-ów). Zawężenie wymagałoby limitu per urządzenie/IP po stronie serwera |
| V7 | Niska | `_rola_staff_21`: sprawdzenie blokady jest „fail-open” (`exception when others then null`), a udane logowanie ścieżką bcrypt nie zeruje licznika | **Nienaprawione** (wymaga zmiany funkcji w bazie; drobne) |
| V8 | Wysoka (znana) | R2: `pin_jawny` jawnie w bazie | Bez zmian — wymaga decyzji i zmian w bazie |

## B. Sprawdzone — bez luki
* Wszystkie `SECURITY DEFINER` mają `set search_path` (przegląd heurystyczny 183 definicji: 0 braków); pomocnicze `_…` mają `revoke` dla `anon`/`authenticated`.
* Dynamiczny SQL (`execute format`) używa `%I` i parametrów (`using`); typy z katalogu systemowego.
* Funkcje Admina/księdza/edycji przechodzą przez `_czy_admin_14` / `_rola_staff_21`, a **każdy błędny PIN trafia do opakowanego `zaloguj()`**, który liczy próby (sql/16) — blokada działa także dla funkcji `ksiadz_*` i edycji punktów.
* `ustaw_kod3`/`zaloguj_k3` usunięte (sql/29). `ustawienia_publiczne` zwraca tylko 6 jawnych, niewrażliwych kluczy.
* Token Kiosku: 192 bity (`gen_random_bytes(24)`), bcrypt, wygasanie.
* Wyjście asystenta AI i komunikaty z serwera trafiają do DOM przez `textContent`; polecenia Kiosku to biała lista; brak `eval`, `document.write`, `javascript:`.
* Szablony HTML: brak nieescapowanych pól użytkownika (test heurystyczny).

## C. Kolejność wdrożenia V1 (ważna!)
1. Wgraj frontend **2.15.16**; otwórz każdy Kiosk online (stary token zostanie użyty w wariantach v2 dopiero po `sql/41`, dotąd działa zapas).
2. Wykonaj `sql/41` na kopii bazy, zweryfikuj zapytaniami z końca pliku, potem na produkcji.
3. Upewnij się w panelu, że WSZYSTKIE Kioski mają wersję ≥ 2.15.16 i pobierają polecenia.
4. Dopiero wtedy `sql/42`. Cofnięcie: komentarz na końcu pliku.
Niezaktualizowany lub nieautoryzowany (bez tokenu) Kiosk po kroku 4 przestaje dostawać blokady/polecenia; zapis obecności działa dalej.

## D. Nie sprawdzono
Wszystkie skrypty SQL (brak PostgreSQL); zachowanie CSP w przeglądarce (zwłaszcza kamera, Tesseract, PDF); wersja `supabase-js@2.45.4` w `esm.sh`; wpływ bcrypt co 5 s na obciążenie bazy; RLS i uprawnienia tabel (brak `sql/01–13`).
## E. Pliki
Nowe: `sql/41…`, `sql/42…`, `tests/audyt-luki.test.mjs` (10 testów), ten raport. Zmienione: `js/supabase-client.js`, `js/kiosk.js`, `js/kiosk-sterowanie.js`, `sw.js`, `supabase/functions/asystent/index.ts`, `tools/sri.mjs`, trzy strony HTML (CSP), `js/wersja.js`, testy (CSP, wersja).
