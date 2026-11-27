# Raport v2.15.01 — przegląd i naprawa błędów (wersje 2.14.00 i 2.15.00)

Metoda: ponowna weryfikacja moich zmian względem faktycznego kodu i migracji (kolumny tabel, wartości, sygnatury funkcji, kolejność ładowania skryptów, stałe globalne, selektory CSS, struktura HTML), dopisanie testów regresji.

## Błędy znalezione i naprawione
1. **Kiosk: wpisy > 36 h nie były wysyłane do akceptacji w cyklu 20 s.** Cykl uruchamiał synchronizację tylko dla wpisów „oczekujących”. Wpis oznaczony „przeterminowany” przy starcie Kiosku czekał na ponowne uruchomienie lub zdarzenie „online”. Naprawa: cykl obejmuje też „przeterminowane” z danymi i < 5 próbami (`js/kiosk.js`).
2. **Kiosk: skaner kradł fokus oknu „Kontakt z Adminem”.** Co chwilę wymuszał fokus na ukrytym polu skanera, więc pisanie wiadomości mogło być niemożliwe. Naprawa: `kontaktOknoOtwarte()` — fokus nie jest przywracany, gdy okno jest otwarte (`js/kiosk.js`).
3. **Zrzut ekranu mógł zawieszać stronę przy dużych tabelach** (pełne kopiowanie ~350 stylów dla każdego elementu poza ekranem, np. 2000 wierszy audytu). Naprawa: elementy poza ekranem dostają tylko rozmiar i układ (`js/kontakt.js`).
4. **Brak etykiet audytu w EN/UK dla nowych zdarzeń** (`aud.a.status`, `aud.a.usunieto`); przy poprawianiu tego błędu popełniłem własny — klucz trafił początkowo tylko do PL; poprawione i objęte testem (`js/i18n.js`).

## Zweryfikowane i poprawne (bez zmian)
Nazwy i kolumny wszystkich tabel użytych w `sql/33` i `sql/34` zgodne z migracjami 14–31; wartości `zdarzenie`/`wynik`/`rodzaj` zgodne; sygnatury `_obecnosc_dodaj_20(numeric)`, `_zgloszenie_reczne_20`, `_ustaw_audyt_17`, `_czy_admin_14` zgodne; ograniczenie `operacje_offline.rodzaj` dopuszcza używane rodzaje; `dziennik_audytu.kategoria` bez ograniczenia; klasa `.hidden` ma `!important` (znaczki i okna chowają się poprawnie); struktura HTML `app.html`/`kiosk.html` zbilansowana; kolejność ładowania (`kiosk.js` przed `kontakt.js`); helpery używane w nowych modułach istnieją; wyrażenie regularne `RPC_ODCZYTY` dopasowuje nazwy `kontakt_*`.

## Nadal otwarte (nie da się ich naprawić z tego miejsca)
* **`AUTOR_SYSTEMU` w `js/wersja.js` nadal ma wartość „Imię Nazwisko”** — wpisz własne dane.
* **`sql/33` i `sql/34` nie były uruchomione** (brak PostgreSQL) — sprawdzono tylko składnię cytowania i nawiasy oraz zgodność z migracjami. Najpierw kopia/staging.
* **Zachowanie w przeglądarce nie było testowane** (zrzut ekranu, układ przycisku względem klawiatury ekranowej Kiosku, wygląd nowych zakładek).
* **Tłumaczenia EN/UK** są maszynowe, bez przeglądu osoby władającej językiem.
* Kiosk w trybie czuwania może wrócić do ekranu oczekiwania po bezczynności, gdy ktoś długo pisze wiadomość; treść wtedy zostaje w oknie, ale okno nie wydłuża limitu bezczynności.
* Wiadomości podpisane zawierają dane osobowe i nie mają automatycznej retencji — Admin usuwa je ręcznie (RODO).
