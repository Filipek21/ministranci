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

## v2.3.01 — co nowego i co zrobić po wgraniu

1. Wgraj WSZYSTKIE pliki (w tym `sw.js`, `js/app.part1–4.js`, `js/i18n.js`); stary `js/app.js` został usunięty.
2. Wykonaj w Supabase `sql/14_dodatki12.sql` (jeśli jeszcze nie) — potrzebne do usuwania kiosków i odświeżania cache w tle.
3. Na każdym Kiosku: zaloguj się jako Admin → „Pobierz / odśwież dane do trybu offline”. To jednorazowo nadaje urządzeniu token; od tej chwili cache odświeża się samo w tle.
4. Kiosk otwórz raz z internetem — service worker zapisze stronę i biblioteki, dzięki czemu startuje także offline.
5. Dane offline są ważne 10 dni. Kolejkę może wyczyścić tylko Admin (panel awaryjny Kiosku).

## v2.4.00 — historia PIN/plakietek, blokada PIN v2, naprawa PDF

1. **PDF „Biblioteka PDF/QR nie została wczytana”** — biblioteki doładowują się teraz same przy każdej próbie (kilka źródeł po kolei).
   Dla pełnej niezawodności wrzuć pliki do `js/vendor/` (instrukcja w `js/vendor/README.txt`).
2. `sql/15_historia_pin_plakietek.sql` — historia PIN-ów, plakietek i użyć plakietek + odrzucanie zbyt prostych PIN-ów. Bezpieczny (tylko dodaje).
3. `sql/16_blokada_pin_v2.sql` — OPCJONALNY nowy system blokady (stopnie 1 min → 5 → 15 → 1 h → Admin). Najpierw na kopii bazy;
   cofnięcie: `sql/16_blokada_pin_v2_cofnij.sql`.
4. `archiwum/app.v2.2.js` — dawny, monolityczny panel (zachowany tylko dla porównania; nie jest ładowany).

## v2.5.00 — Ksiądz bez Bazy/Kiosków, edycja bazy przez Admina, księga punktów, blokada tylko dla jednej osoby

1. Wykonaj `sql/17_ksiega_punktow_edycja_bazy.sql` (po 01–16). Skrypt najpierw sprawdza, czy tabele `obecnosci` i `kalendarz`
   mają oczekiwane kolumny — jeśli nie, przerywa bez zmian i podaje, czego brakuje.
2. **Księga punktów** (`ksiega_punktow`) jest niezmienna: triggery blokują UPDATE/DELETE/TRUNCATE. Wypełnia się sama przy każdej
   zmianie w `obecnosci` (Kiosk, zgłoszenia, korekty, panel). Istniejące obecności są zaimportowane jednorazowo (źródło „import”).
3. Panel Admina → Ministranci / Baza danych → „📜 Historia punktów”: pełna historia; Admin może edytować, usuwać i dodawać punkty
   (każda zmiana + powód zostaje w księdze). Ksiądz widzi historię tylko do odczytu.
4. Ksiądz nie widzi zakładek **Baza danych** i **Kioski** (ukryte w panelu). Uwaga: to ukrycie w aplikacji — jeśli chcesz
   twardej blokady, funkcje `admin_lista_kioskow`, `admin_historia_pingow` itd. powinny po stronie SQL wymagać roli Admina.
5. Blokada PIN dotyczy wyłącznie jednego kodu: Kiosk nie zamraża już klawiatury innym osobom (hamulec jest per kod).

## v2.6.00 — Dashboard, statystyki, ustawienia, audyt, RODO, Ksiądz, porównanie miesięcy

1. Wykonaj `sql/18_ustawienia_audyt_rodo_ksiadz.sql` (po 01–17; skrypt sprawdza zależności i przerywa bez zmian, jeśli czegoś brakuje).
2. **Admin** — nowe zakładki: Dashboard (startowy: KPI, alerty, top 5, najbliższe wydarzenia), Statystyki (trend, typy, ranking; CSV/PDF),
   Frekwencja, Ustawienia (nazwa parafii, okno rejestracji, ważność cache Kiosku, retencja, język), Audyt (jedna oś czasu zmian),
   RODO (eksport JSON/PDF osoby, anonimizacja, czyszczenie logów, niezmienny rejestr operacji).
3. **Ksiądz** — widzi: Kalendarz, Ministranci (dodawanie i prowadzenie TYLKO zwykłych ministrantów: edycja, PIN, aktywność),
   Obecności, Zgłoszenia, Bezpieczeństwo, **Frekwencja** (raport + CSV/PDF). Nie widzi Dashboardu, Statystyk, Ustawień, Audytu, RODO, Bazy ani Kiosków.
4. **Ministrant** — karta „Porównanie z poprzednim miesiącem” (punkty i obecności).
5. Kioski pobierają ustawienia (ważność cache, częstość odświeżania, język domyślny) przy połączeniu i zapamiętują je do pracy offline.
6. Anonimizacja RODO jest NIEODWRACALNA. Księga punktów i dziennik audytu pozostają niezmienne — tylko procedura anonimizacji
   może poprawić w nich dane identyfikujące osobę (kod).

## v2.7.00 — stały kod weryfikacyjny (3 cyfry) dla Admina i Księdza

1. Wykonaj `sql/19_kod_weryfikacyjny_3cyfrowy.sql` (po 14–18). Zaktualizowano też `sql/16` (jedna linia) — jeśli już go uruchomiłeś, uruchom ponownie (jest idempotentny).
2. **Logowanie Admina/Księdza = kod + PIN (4) + kod weryfikacyjny (3).** Pole „Kod weryfikacyjny” jest na ekranie logowania; konta zwykłe go nie używają.
3. **Pierwsze logowanie po wdrożeniu:** Admin/Ksiądz musi na stałe ustawić własny kod (dwukrotnie). Potem NIE może go zmienić samodzielnie.
   Reset kodu Księdza wykonuje Admin (Ministranci → „Resetuj kod 3-cyfrowy”); osoba ustawia nowy przy następnym logowaniu.
4. **Kiosk:** po wpisaniu PIN-u i kliknięciu „Zaloguj jako Admin/Ksiądz” Kiosk prosi o 3 cyfry kodu. Jeśli kod nie jest jeszcze ustawiony —
   trzeba go najpierw ustawić w panelu (w przeglądarce).
5. **Ochrona przed zgadywaniem:** błędny kod → 3 błędy = 5 min, 5 = 30 min, 8 = 24 h, 10 = blokada do resetu przez Admina (liczone po poprawnym PIN-ie).
6. **Egzekwowanie na serwerze:** funkcje z plików 14–18 (admin_*, ksiadz_*) przyjmują kod doklejony do PIN-u (7 znaków) — sama znajomość PIN-u już nie wystarcza.
   Starsze funkcje z plików 01–13 nadal sprawdzają sam PIN (ich kodu nie znam, więc ich nie zmieniałem).
7. **Awaryjnie** (jedyny Admin zapomniał kod): w SQL Editorze
   `delete from public.kody_weryfikacyjne where ministrant_id = (select id::text from public.ministranci where kod = 'TWOJ_KOD');`

## 10. Wersja 2.8.00 — co nowego i co uruchomić

**Kolejność SQL (SQL Editor w Supabase):** `14` → `15` → `16` → `17` → `18` → `19` → `20`. Każdy plik jest idempotentny (można uruchomić ponownie).

### Naprawy SQL (pliki 14–19)
- **`search_path = public, extensions`** we wszystkich funkcjach — na Supabase rozszerzenie `pgcrypto` (`crypt`, `gen_salt`, `gen_random_bytes`) leży w schemacie `extensions`; bez tego funkcje z pliku 14 (autoryzacja Kiosku, cache offline) kończyły się błędem „function gen_salt(unknown) does not exist”.
- **`kalendarz` jest WIDOKIEM** — nie da się na nim robić `UPDATE`/`DELETE` ani zakładać wyzwalacza `AFTER` (to wywalało plik 18 i zmianę/usuwanie wydarzeń z pliku 17). Dodano funkcję `_tab_wydarzen()`, która wskazuje tabelę bazową (`wydarzenia`); wyzwalacz audytu i operacje zapisu idą teraz do niej.
- Plik 14 tworzy `pgcrypto` w schemacie `extensions` (jeśli jeszcze go nie ma).

### PDF plakietek bez internetu
- Plakietki (pobieranie, drukowanie, podgląd) generuje teraz **lokalny kod**: `js/vendor/qr-local.js` (enkoder QR) + `js/pdf-plakietki.js` (strona A4 → JPEG → własny zapis PDF). **Nie wymaga CDN ani jsPDF**, więc błąd „Biblioteka PDF/QR nie została wczytana” nie występuje.
- Pozostałe PDF-y (raporty, statystyki, log korekt, RODO) nadal używają jsPDF z CDN. Jeśli chcesz, by i one działały bez internetu, wrzuć pliki z `js/vendor/README.txt` do `js/vendor/`.

### Ręczna obecność (Admin + Ksiądz) — `sql/20`
- Panel (telefon, komputer): zakładka **Ręczna obecność** — wybierasz osobę, rodzaj (**msza/wydarzenie** albo **obecność specjalna = zgłoszenie**: pogrzeb / ślub / inne), punkty i opcjonalny powód.
- Kiosk: po zalogowaniu Admina/Księdza (plakietka → PIN → kod 3-cyfrowy → „Zaloguj się jako…”) w panelu awaryjnym jest wybór rodzaju obecności (msza / zgłoszenie), punkty i typ zgłoszenia.
- Zgłoszenie specjalne dodane w ten sposób jest od razu zatwierdzane istniejącą funkcją `rozpatrz_zgloszenie` (punktowanie identyczne jak w zakładce Zgłoszenia). Wszystko trafia do księgi punktów i dziennika audytu. Ksiądz nie może dodawać obecności kontom Admina.

### Ping kiosku na żywo — `sql/20`
- Zakładka **Kioski** → przycisk **📡 Ping** (tylko Admin): otwiera okno, które w kilka sekund pokazuje, czy Kiosk odpowiada, **czas reakcji w ms**, wersję, sieć, długość kolejki offline, wiek danych offline i różnicę zegarów. Kiosk sprawdza zlecenia co 5 s.

## 11. Wersja 2.9.00

- **sql/21_bez_kodu3_naprawa_uprawnien.sql** (uruchom jako ostatni, po 14–20): wyłącza kod 3-cyfrowy i naprawia „Brak uprawnień do tej czynności” w panelu Admina (sprawdzanie roli nie wymaga już kodu 3-cyfrowego i ma zapas przez `zaloguj()`).
- **Kod 3-cyfrowy WYCOFANY (v2.12.08)**: usunięty z frontendu, a `sql/29_wycofaj_kod3.sql` wycofuje go z bazy. Logowanie to kod + PIN. Szczegóły: `docs/SZYFR_MINISTRANCKI.md`. Kod i tabela z pliku 19 zostają w repozytorium/bazie.
- **Kiosk: „📷 Skanuj kamerą”** — kamera tabletu/telefonu/komputera czyta QR plakietki i uzupełnia dane jak czytnik USB (BarcodeDetector, a gdy go brak — jsQR doczytywany z CDN). Wymaga HTTPS.
- **Nowe konto (ministrant/ksiądz):** puste pole PIN = PIN losuje się sam i jest pokazany po dodaniu; Admin/Ksiądz może go zmienić w edycji, a właściciel konta w „Zmień PIN”.

## 12. Wersja 2.10.00 — Kiosk: „Zatwierdź” i wybór mszy

- Na klawiaturze PIN (3. kolumna, 4. wiersz) jest przycisk **Zatwierdź**; PIN nie zatwierdza się już sam po 4 cyfrach.
- Po „Zatwierdź” pojawia się **lista mszy/wydarzeń z otwartym oknem** — osoba klika swoją. Gdy żadnego nie ma, Kiosk pokazuje, że brak wydarzenia albo okienko jest zamknięte.
- **Msza połączona z nabożeństwem** → po kliknięciu wybór: *tylko msza* / *tylko nabożeństwo (+1 pkt)* / *oba* (inne kolory przycisków).
- Zgłoszenia specjalne (pogrzeb/ślub/inne) i tryb offline działają jak dotąd, ale też wymagają „Zatwierdź” (offline wydarzenie dobiera się z danych zapisanych w pamięci Kiosku).
- Wyłączniki w `js/kiosk.js`: `AUTO_ZATWIERDZ_PIN`, `WYBOR_WYDARZENIA_NA_EKRANIE`.

## 13. Wersja 2.11.00 — Listy papierowe (OCR) → „System (Lista)”

- Uruchom **sql/22_listy_papierowe.sql** (po 14–21).
- Zakładka **Listy papierowe** (Admin i Ksiądz): 1) pobierasz PDF pustej listy (powstaje lokalnie; w rogu kod QR wydarzenia), 2) po wypełnieniu robisz zdjęcie/skan i wczytujesz je, 3) system odczytuje wiersze (OCR — Tesseract.js doczytywany z CDN, wymaga internetu), 4) widzisz tabelę: poprawnie odczytane, niepewne i **numery wierszy niedoczytanych**; kody możesz poprawić ręcznie, 5) „Dodaj do systemu” zapisuje wpisy jako **System (Lista)** (księga punktów + historia importów, z informacją, kto zatwierdził).
- Kolumny listy: Nr · MIN-___ (3 cyfry) · Data (dd.mm, opcjonalnie — wtedy wpis trafia do wydarzenia z tego dnia) · Typ M/N/O (dla mszy połączonej z nabożeństwem: msza / nabożeństwo / oba; zakładam, że `polaczone_id` wskazuje parę wydarzeń).
- Najlepsza skuteczność: pismo DRUKOWANE, ciemny długopis, zdjęcie równo z góry. Odczyt ręcznego pisma bywa błędny — dlatego przed dodaniem zawsze jest tabela do sprawdzenia, a nieczytelne wiersze są wyraźnie wskazane.

## 14. Wersja 2.11.01 — zapis i odczyt danych

Objaw: „dodaję coś, zapisuje się w bazie, a na stronie tego nie widać”. Poprawki:
- **Brak cache odczytów** — klient Supabase pobiera dane z `cache: 'no-store'`, więc przeglądarka nie podaje starej kopii.
- **Automatyczne odświeżenie po zapisie** — po każdej udanej operacji zapisu panel sam odświeża aktywną zakładkę (a także po powrocie na kartę i po odzyskaniu internetu).
- **Błędy odczytu są widoczne** — wcześniej błąd (np. brak uprawnienia do widoku) dawał po prostu pustą listę; teraz pojawia się czerwony komunikat z kodem błędu.
- **Limity list** — kalendarz pokazuje do 300 wydarzeń (było 50), a lista „połącz z” 60 (było 15), więc wydarzenia z datami wstecz nie znikają.
- **sql/23_odczyt_widokow_naprawa.sql** — nadaje SELECT na widoki czytane przez stronę, przeładowuje schemat PostgREST i wypisuje diagnostykę (w zakładce Messages), ile wierszy widzi rola `anon`.

## 15. Wersja 2.12.00 — Narzędzia Admina, blokada Kiosku, sterowanie, audyt z cofaniem

**Kolejność SQL:** `…` → `22` → `23` → `24` → `25` → `26` (każdy idempotentny).

### Audyt — naprawa i cofanie (`sql/24`)
- `admin_audyt_zdarzenia` jest teraz odporny: każde źródło (PIN, plakietki, księga, dziennik, RODO, blokady) sprawdzane osobno; uszkodzone jest pomijane i zgłaszane żółtym ostrzeżeniem, reszta działa. Dodano filtry **od / do / szukaj**. (Stara 4-argumentowa wersja jest usuwana — dwie wersje dawały błąd PGRST203.)
- Przy wpisach, które da się odwrócić, jest przycisk **↩️ Cofnij**: przyznanie / zmiana / usunięcie punktów, zmiana lub dodanie/usunięcie wydarzeń, zmiana danych konta, zmiana ustawienia. Cofnięcie jest zapisane w audycie, a wpis oznaczony „cofnięto”. Nie da się cofnąć m.in. usunięcia konta (brak PIN-u w audycie) ani zmian PIN-ów.
- Zmiany w wydarzeniach i kontach zapisują od teraz `_id` rekordu (starsze wpisy cofają się po kodzie konta / unikalnej nazwie wydarzenia).

### Zakładka Narzędzia (`sql/25`, tylko Admin)
- **Stan bazy** — samotest: funkcje, tabele, wyzwalacze, pgcrypto, uprawnienia odczytu, RLS, dane; przy braku pokazuje, który plik SQL uruchomić.
- **Spójność punktów** — porównanie obecności z księgą, duplikaty, osierocone i ujemne wpisy; naprawa jednym kliknięciem (wyrównanie księgi wpisami korygującymi, usunięcie duplikatów/osieroconych).
- **Duplikaty kont** — ta sama osoba mimo polskich liter/spacji; **scalanie** przenosi obecności na wybrane konto, a pozostałe dezaktywuje (konta Admina nie są scalane automatycznie).
- **Eksport / import całej bazy** (JSON): opcjonalnie z haszami PIN; import najpierw w trybie próby (nic nie zapisuje), tryb „tylko dodaj brakujące” albo „nadpisz” (PIN-ów nie rusza). Księga punktów i audyt są tylko eksportowane.

### Awaryjna blokada Kiosku + zdalne sterowanie (`sql/26`)
- **Zablokuj Kiosk** (jeden albo wszystkie), do odwołania lub na 15 min…8 h: Kiosk pokazuje pełnoekranowy komunikat „wpisz się na papierowej liście”, skany są ignorowane, blokada przeżywa odświeżenie strony i wygasa sama.
- **🎛 Steruj** (zakładka Kioski): Ping, pełna diagnostyka, odśwież stronę, synchronizuj kolejkę, pobierz dane offline, wyczyść pamięć, wymuś aktualizację, komunikat na ekran, schowaj komunikat, język PL/EN/UK, test czytnika, restart czytnika, test kamery, zablokuj, odblokuj — także dla wszystkich Kiosków naraz. Wynik wraca do okna w kilka sekund (Kiosk pyta serwer co 5 s).

## v2.12.01 — naprawa błędu kalendarza, punkty połówkowe, zasady tygodnia, animacje

1. W Supabase (SQL Editor) uruchom `sql/27_napraw_wydarzenia_polowki_tydzien.sql` (po plikach 14–26). Skrypt jest idempotentny i w razie błędu cofa swoją część.
   - **Błąd „permission denied for table wydarzenia” (42501)** — nadaje SELECT na `wydarzenia` rolom `anon` i `authenticated` (+ politykę odczytu, jeśli RLS jej nie ma).
   - **Punkty połówkowe** — kolumny punktów zmieniają typ na `numeric(6,1)`; krok 0,5 w formularzach (edycja punktów, ręczna obecność, lista papierowa, Kiosk awaryjnie).
   - **Zasady naliczania** (puste pole „Punkty” = automatycznie): tydzień pon–sob; msza pon–sob — 1. w tygodniu 1 pkt, 2. i kolejne 2 pkt; msza w niedzielę 0 pkt (nie wlicza się); nabożeństwo (np. różaniec) 1 pkt także w niedzielę; zbiórka 1 pkt.
2. Podczas uruchamiania skrypt wypisuje NOTICE „[27] DO SPRAWDZENIA …” dla funkcji spoza paczki (pliki 01–13), które zwracają punkty jako INT — jeśli się pojawią, trzeba w nich zmienić typ na `numeric`.
3. Animacje: `css/style.css` (sekcja v2.12.01) i `js/animacje.js`; wyłączają się przy ustawieniu systemowym „ogranicz ruch”.

## v2.12.06 — powiadomienia (prawy dolny róg, max 3)

`js/powiadomienia.js` (ładowany w app.html, kiosk.html, index.html): potwierdzenie ✅ / odrzucenie ❌ każdej operacji serwera (opakowanie `wywolajRPC`),
błędy odczytu (np. brak uprawnień) oraz pobrania plików/PDF. Nowe powiadomienie jest na dole, starsze unoszą się w górę, naraz max 3.
Czasy: sukces 4,5 s · ostrzeżenie 6,5 s · odrzucenie 7,5 s. Ręcznie: `powiadom('ok'|'err'|'warn'|'info', 'tekst')`.

## v2.12.07 — skalowanie na telefonie, czuwanie Kiosku, naprawa Audytu

1. Uruchom w Supabase `sql/28_napraw_audyt.sql` (po 27): usuwa zdublowane wersje funkcji audytu (błąd PGRST203), odtwarza `admin_audyt_zdarzenia` / `admin_audyt_cofnij` i dodaje diagnostykę (przycisk „🩺 Diagnostyka” w zakładce Audyt).
2. Telefon: twarde obcięcie poziomego przepełnienia (css/style.css) + strażnik w js/skalowanie.js, który wykrywa i zawęża elementy szersze od ekranu.
3. Kiosk: `js/kiosk-czuwanie.js` — blokada wygaszania ekranu (Wake Lock) i natychmiastowe wznowienie po uśpieniu (ping, polecenia, kolejka offline, dane offline).
   Dodatkowo w ustawieniach tabletu: wygaszanie „Nigdy” / „Nie wyłączaj podczas ładowania”, zasilacz podłączony, wyłączone oszczędzanie baterii dla przeglądarki.

## v2.15.07 — plakietki Księdza, okno kiosku 20/5, zmiana kamery
1. `sql/40_ksiadz_plakietki_v2_15_07.sql` (po `sql/39`) — Ksiądz może generować i unieważniać plakietki zwykłych ministrantów; domyślne okno `okno_przed_min` = 20 (tylko jeśli nikt go nie zmieniał).
2. Wgraj pliki aplikacji (wersja 2.15.07). Szczegóły i lista tego, czego nie sprawdzono: `docs/RAPORT_V2.15.07.md`.
3. Kiosk: w oknie skanera kamery jest przycisk „🔄 Zmień kamerę” (przód / tył); wybór jest pamiętany na urządzeniu.
