# E-Ministranci — Instrukcja wdrożenia

## 1. Konfiguracja Supabase

1. Załóż projekt na [supabase.com](https://supabase.com).
2. Wejdź w **SQL Editor** i uruchom po kolei:
   - `sql/01_schema.sql` (tabele, RLS, funkcje RPC)
   - `sql/02_widoki.sql` (widoki: ranking, historia, kalendarz)
   - `sql/03_dodatki.sql` (zmiana PIN-u, trigger spójności bloków, blokada po nieudanych próbach PIN-u)
   - `sql/04_dodatki2.sql` (ręczne odblokowanie kodu przez Admina, log audytowy korekt ręcznych)
   - `sql/05_dodatki3.sql` (webhook powiadomień e-mail o blokadzie, raport za dowolny miesiąc)
   - `sql/06_dodatki4.sql` (pełny log wszystkich prób logowania — udanych i nieudanych)
3. W **Project Settings > API** skopiuj `Project URL` oraz `anon public key`.
4. Wklej je do `js/supabase-client.js`:
   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
5. Dodaj pierwsze konto Admina **ręcznie w SQL Editorze** (bo `admin_dodaj_ministranta` wymaga już istniejącego admina):
   ```sql
   insert into public.ministranci (kod, imie, nazwisko, pin_hash, is_admin)
   values ('ADMIN-001', 'Jan', 'Kowalski', crypt('1234', gen_salt('bf')), true);
   ```
   Zmień PIN `1234` na własny od razu po pierwszym zalogowaniu (przez korektę SQL lub dodaj funkcję zmiany PIN-u analogiczną do `admin_dodaj_ministranta`).

## 2. Wdrożenie na GitHub Pages

1. Utwórz repozytorium na GitHubie i wrzuć całą zawartość tego folderu (`index.html`, `app.html`, `kiosk.html`, `css/`, `js/`, `manifest.json`).
2. W ustawieniach repo: **Settings > Pages > Source: Deploy from branch**, wybierz `main` i folder `/root`.
3. Po chwili strona będzie dostępna pod `https://twoja-nazwa.github.io/nazwa-repo/`.
4. Na tablecie w zakrystii otwórz `.../kiosk.html` i dodaj do ekranu głównego (żeby działał w trybie pełnoekranowym / PWA).

## 3. Czytnik kodów QR na tablecie (Kiosk)

- Kiosk nasłuchuje wejścia z **dowolnego czytnika USB/Bluetooth działającego jako klawiatura (HID)** — czytnik "wpisuje" zawartość kodu QR i wysyła Enter, dokładnie jak klawiatura.
- Ustaw czytnik w trybie odczytu **wyłącznie QR** (w instrukcji czytnika zwykle da się wyłączyć obsługę kodów kreskowych 1D) — w tym systemie generujemy i drukujemy tylko kody QR, więc obsługa kodów kreskowych nie jest potrzebna.
- Karta ministranta = wydrukowana wizytówka z kodem QR zawierającym **wyłącznie tekst kodu** (np. `MIN-014`) — bez dodatkowych danych, dla bezpieczeństwa i kompatybilności z każdym czytnikiem.
- Upewnij się, że po otwarciu `kiosk.html` na tablecie kursor/focus jest w ukrytym polu (kliknięcie gdziekolwiek na ekranie automatycznie go przywraca).

## 4. Generator wizytówek (PDF, tylko QR)

- W panelu Admina, zakładka **Generator kart QR**, wpisujesz imię/nazwisko/kod/PIN każdego ministranta (PIN wpisujesz ręcznie, bo w bazie trzymany jest tylko hash — zapisz go sobie w momencie tworzenia konta).
- PDF generowany jest w przeglądarce (biblioteki `jsPDF` + `qrcode.js` z CDN) — każda wizytówka zawiera kod QR z samym kodem ministranta, imię, nazwisko, kod tekstowy i PIN do wycięcia i zalaminowania.
- **Żadne kody kreskowe (1D) nie są generowane w żadnym miejscu systemu** — wyłącznie QR.

## 5. Bloki połączone (Nabożeństwo + Msza)

Aby połączyć dwa wydarzenia w blok:
1. Dodaj pierwsze wydarzenie (np. Nabożeństwo 17:45) zaznaczając "część bloku połączonego", wybierając "— nie łącz, zacznij nowy blok —". System nada mu nowy `polaczone_id`.
2. Dodaj drugie wydarzenie (np. Msza 18:00), zaznacz "część bloku", wybierz z listy pierwsze wydarzenie — sparuje się po tym samym `polaczone_id`.
3. Kiosk automatycznie wykryje blok po `polaczone_id` i pokaże ministrantowi 3 przyciski wyboru.

> Uwaga: obecna wersja frontendu upraszcza parowanie — dla pełnej pewności warto dodać w Supabase mały trigger, który przy insertowaniu drugiego wydarzenia z wybranym `polaczone_id` nadpisuje to samo `polaczone_id` na pierwszym rekordzie (na wypadek gdyby pierwszy nie miał go jeszcze ustawionego). Przykład triggera można dopisać w `sql/03_trigger_blokow.sql` w razie potrzeby.

## 6. Bezpieczeństwo — dlaczego to jest bezpieczne

- Frontend (GitHub Pages) **nigdy nie liczy punktów ani nie zapisuje obecności bezpośrednio**. Wszystko idzie przez funkcje RPC `security definer` w Supabase, które same weryfikują PIN (hash bcrypt) i uprawnienia.
- RLS na tabelach `ministranci`, `wydarzenia`, `obecnosci` blokuje **wszystkie** bezpośrednie zapisy z klucza `anon` — jedyna droga zapisu to RPC.
- Unikalny klucz `(ministrant_id, wydarzenie_id)` w `obecnosci` uniemożliwia podwójne naliczenie punktów za to samo wydarzenie.
- Pula miesięczna liczona jest "w locie" filtrem `date_trunc('month', ...)` na widoku — historia w bazie nigdy nie jest kasowana.

## 7. Zmiana PIN-u, ochrona przed brute-force i ikony PWA

- **Zmiana PIN-u**: ministrant może zmienić swój PIN w panelu (`app.html` → sekcja "Zmień PIN" pod rankingiem), przez RPC `zmien_pin` (wymaga podania starego PIN-u).
- **Ochrona przed brute-force**: tabela `proby_logowania` liczy nieudane próby na każdy kod. Po **5 błędnych próbach** kod zostaje zablokowany na **15 minut** (parametry `v_max_prob` / `v_czas_blokady` w `sql/03_dodatki.sql`, do zmiany w razie potrzeby). Dotyczy to zarówno logowania w PWA (`zaloguj`), jak i Kiosku (`zapisz_obecnosc`, `admin_dodaj_ministranta`, itd.) — wszystkie idą przez tę samą funkcję `_weryfikuj_pin`.
- **Ikony PWA**: `manifest.json` wskazuje na `icons/icon-192.png` i `icons/icon-512.png` (dołączone w folderze `icons/`) — dzięki temu instalacja na ekranie głównym telefonu/tabletu ma właściwą ikonę zamiast domyślnej.
- **Spójność bloków**: trigger `trg_normalizuj_polaczenie_bloku` na tabeli `wydarzenia` automatycznie naprawia `polaczone_id`, jeśli ktoś przez pomyłkę poda tam ID drugiego wydarzenia zamiast wspólnego identyfikatora grupy (patrz komentarz w `sql/03_dodatki.sql`, sekcja 5).

## 8. Ręczne odblokowanie kodu i log audytowy korekt

- **Ręczne odblokowanie**: w panelu Admina, zakładka **Bezpieczeństwo**, widoczna jest lista aktualnie zablokowanych kodów (nieudane próby PIN-u) z przyciskiem "Odblokuj" — działa przez RPC `admin_odblokuj_kod` (wymaga uprawnień `is_admin`, Moderator tego nie zrobi). Blokada i tak mija sama po 15 minutach, to opcja na "już teraz, bez czekania".
- **Log audytowy korekt ręcznych**: każda korekta wykonana przez `korekta_obecnosci` (Admin lub Moderator ręcznie dopisujący/poprawiający punkty) trafia teraz też do tabeli `log_korekt`. W tej samej zakładce **Bezpieczeństwo** widoczna jest czytelna tabela: kto, komu, za jakie wydarzenie, ile punktów było przed i po korekcie, oraz kiedy to zrobił. Log jest widoczny zarówno dla Admina, jak i Moderatora — nikt nie może go edytować ani usunąć z poziomu klienta (RLS blokuje zapis, insert idzie wyłącznie z wnętrza funkcji `korekta_obecnosci`).

## 9. Eksport logu korekt (CSV / PDF)

W zakładce **Bezpieczeństwo** panelu Admina, nad tabelą logu korekt, są dwa przyciski:
- **Eksportuj log do CSV** — pobiera plik `.csv` (średnik jako separator, kodowanie UTF-8 z BOM, żeby polskie znaki poprawnie otwierały się w Excelu).
- **Eksportuj log do PDF** — generuje w przeglądarce (biblioteka `jsPDF`, już wczytana) prostą tabelaryczną wersję logu do wydruku/archiwizacji.

Oba eksporty biorą pod uwagę ostatnie 200 wpisów logu (limit w zapytaniu w `js/app.js`, `odswiezBezpieczenstwo()`) — zwiększ liczbę w razie potrzeby.

## 10. Raport miesięczny (PDF) za dowolny miesiąc

W tej samej zakładce **Bezpieczeństwo**, sekcja "Raport miesięczny": wybierasz miesiąc i rok (nie tylko bieżący — widoki `ranking_miesiac`/`historia_miesiac` pokazują tylko obecny miesiąc, dlatego dodano osobną funkcję RPC `raport_miesiac(kod, pin, rok, miesiac)`, która liczy ranking i pełną historię obecności dla dowolnego zakresu dat). Przycisk "Generuj raport PDF" tworzy dwustronicowy dokument: strona 1 — ranking miesiąca, kolejne strony — pełna chronologiczna historia obecności wszystkich ministrantów w tym miesiącu.

## 11. Powiadomienie e-mail o zablokowanym kodzie

Mechanizm działa w trzech krokach: Postgres (trigger na `proby_logowania`, rozszerzenie `pg_net`) → wywołanie HTTP do Twojej Supabase Edge Function → Edge Function wysyła e-mail przez [Resend](https://resend.com) (darmowy plan wystarczy do tego zastosowania).

Kroki wdrożenia (wymaga [Supabase CLI](https://supabase.com/docs/guides/cli)):

1. `supabase functions new powiadom-o-blokadzie`, następnie podmień wygenerowany `index.ts` treścią z `supabase/functions/powiadom-o-blokadzie/index.ts` z tego projektu.
2. Załóż konto na [resend.com](https://resend.com), zweryfikuj domenę nadawcy, skopiuj API key.
3. `supabase secrets set RESEND_API_KEY=re_xxxxxxxx`
4. `supabase secrets set ADMIN_EMAIL=twoj@email.pl`
5. `supabase functions deploy powiadom-o-blokadzie --no-verify-jwt`
6. W SQL Editorze Supabase:
   ```sql
   insert into public.ustawienia_systemowe (klucz, wartosc)
   values ('webhook_blokada_url', 'https://TWOJ-PROJEKT.supabase.co/functions/v1/powiadom-o-blokadzie')
   on conflict (klucz) do update set wartosc = excluded.wartosc;
   ```

Jeśli pominiesz ten krok, system działa dokładnie tak jak wcześniej — brak wpisu w `ustawienia_systemowe` sprawia, że trigger po prostu nic nie robi (nigdy nie blokuje logowania z powodu problemu z powiadomieniem).

## 12. Pełny log prób logowania (nie tylko licznik blokad)

Wcześniejszy mechanizm blokady (`proby_logowania`) trzymał tylko bieżący licznik nieudanych prób na kod — nie było widać historii. Teraz każda pojedyncza próba weryfikacji kodu+PIN-u (z Kiosku **i** z PWA, bo obie ścieżki przechodzą przez tę samą funkcję `_weryfikuj_pin`) zapisywana jest do tabeli `log_logowan`: kod, czy się udała, powód (`ok` / `zly_pin` / `nieznany_kod` / `zablokowany`) i znacznik czasu.

W panelu Admina/Moderatora, zakładka **Bezpieczeństwo**, sekcja "Historia logowań" pokazuje ostatnie 200 prób (z opcjonalnym filtrem po konkretnym kodzie) przez RPC `historia_logowan`. Przydatne np. żeby sprawdzić, czy ktoś regularnie myli PIN, albo czy ktoś obcy próbuje zgadywać cudzy kod.

## 13. Co nadal warto rozważyć w przyszłości

- Automatyczne cykliczne wysyłanie raportu miesięcznego (np. 1. dnia miesiąca) mailem do Księdza/Opiekuna — wymagałoby dodatkowej zaplanowanej funkcji (`pg_cron` + kolejna Edge Function generująca PDF po stronie serwera).
- Eksport historii logowań do CSV (analogicznie do eksportu logu korekt).
- Automatyczne czyszczenie bardzo starych wpisów `log_logowan` (np. starszych niż rok), żeby tabela nie rosła w nieskończoność.
