# Raport v2.15.03

## Zmiany
1. **Edycja i usuwanie danych w panelu Admina i Księdza** (wcześniej część danych dało się tylko usunąć albo tylko zmienić nazwę):
   * Wydarzenia (Kalendarz i kalendarz interaktywny): nowy przycisk **✏️ Edytuj** — nazwa, typ (msza / nabożeństwo / zbiórka), data i godzina, okno obecności przed/po. Działa dla Admina **i Księdza** (też „Zmień nazwę” i „Usuń”).
   * Zakładka **Obecności (miesiąc)**: przy każdym wpisie **Edytuj** i **Usuń** (Admin i Ksiądz; Ksiądz nie rrusza wpisów kont Admina).
   * Wiadomości (Admin): **✏️ Edytuj notatkę** przy każdej wiadomości (pusty tekst kasuje notatkę), obok istniejącego usuwania.
2. **Wersja 2.15.03** (`js/wersja.js` — jedno miejsce; cache service workera i adresy plików podbijają się same).
3. **Listy papierowe — zbiórki:** w kolumnie „Typ” można wpisać **Z** (zbiórka) obok M / N / O. Serwer szuka zbiórki w dniu wiersza (albo w dniu wydarzenia wybranego dla listy). Lista wyboru wydarzeń pokazuje ikony typu (⛪ 🕯️ 👥), więc zbiórkę można wybrać jako wydarzenie całej listy. Wydrukowana lista i podpowiedzi (PL/EN/UK) wspominają o Z.
4. **Prawy dolny róg w panelu Admina:** przycisk „Kontakt z Adminem” **usunięty dla zalogowanego Admina** (Ksiądz i ministrant nadal go mają). Miejsce czeka na nową funkcję.
5. **Ekran logowania (`app.html`):** przycisk **✉️ Kontakt z Adminem** także przed zalogowaniem. Wiadomość bez zrzutu ekranu, z opcjonalnym podpisem i danymi kontaktowymi; w skrzynce Admina oznaczona jako **niezweryfikowana** („Ekran logowania”). Limit 20 wiadomości / godzinę + globalny bezpiecznik z sql/35.
6. **Audyt — naprawa:** nie miałem dostępu do bazy, więc nie mogłem wskazać jednej przyczyny awarii; zrobiłem więc dwie rzeczy:
   * `sql/36`: funkcja `admin_audyt_zdarzenia` przepisana tak, że **każde źródło (historia PIN, plakietek, księga punktów, dziennik, RODO, blokady) jest odpytywane osobno** — uszkodzone jest pomijane i wymienione w ostrzeżeniu, reszta się ładuje; brak tabeli `audyt_cofniecia` też nie psuje listy; zdublowane wersje funkcji (PGRST203) są usuwane.
   * Przeglądarka: gdy serwer odrzuci zapytanie z filtrami (daty/szukanie), Audyt ponawia je bez filtrów i filtruje lokalnie; wadliwy wiersz nie blokuje tabeli; komunikat błędu wskazuje `sql/36` i „🩺 Diagnostyka”.

## WDROŻENIE (ważne)
Uruchom w bazie **`sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql`** (po plikach 14–35; najpierw kopia/staging). Bez niego: edycja wydarzeń, litera Z, kontakt z logowania, edycja przez Księdza i nowy Audyt nie zadziałają (aplikacja pokaże komunikat „wymaga sql/36”), reszta działa jak dotąd.

## Czego NIE sprawdziłem
* SQL 36 nie był uruchomiony (brak PostgreSQL), a zmiany w przeglądarce nie były testowane w żywej przeglądarce — tylko `npm test` (66 testów przechodzi, w tym nowe) i kontrola składni wszystkich plików JS.
* Przyczyna awarii Audytu u Ciebie nie jest potwierdzona. Jeśli po sql/36 nadal będzie błąd, wciśnij „🩺 Diagnostyka” i „Odśwież” w Audycie i prześlij mi treść komunikatu.
* Zgłoszenia specjalnych obecności (Pogrzeb/Ślub): decyzji nie da się cofnąć ani edytować — celowo nie ruszałem rozliczeń punktów. Punkty po zatwierdzeniu poprawisz w „Obecności (miesiąc)”.
* `AUTOR_SYSTEMU` w `js/wersja.js` nadal „Imię Nazwisko”.
