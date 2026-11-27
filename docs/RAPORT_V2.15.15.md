# Raport v2.15.15 — ochrona danych osobowych dzieci (minimalizacja)

Nic nie usunięto z funkcji: wydruk plakietek nadal używa PIN-u, wszystkie ekrany i moduły działają jak w 2.15.14. Zmiany dotyczą tego, **ile danych jest widocznych i przechowywanych** na urządzeniach.

| # | Zmiana | Co chroni | Czego NIE chroni |
|---|---|---|---|
| 1 | **Maska PIN-ów w panelu** (`js/prywatnosc.js`): trzy tabele (Baza użytkowników, lista ministrantów, wybór do wydruku) pokazują „••••”; dotknięcie / Enter odsłania na 8 s; maska wraca po schowaniu karty, zamknięciu strony i blokadzie bezczynności | podglądanie zza pleców, zrzuty ekranu, przypadkowe pokazanie PIN-ów rodzicom/dzieciom przy projektorze | DevTools (PIN jest w atrybucie `data-pin`, bo aplikacja potrzebuje go do wydruku). Sam `pin_jawny` w bazie — patrz „Otwarte” |
| 2 | **Kiosk pokazuje „Jan K.”** zamiast pełnego nazwiska na wspólnym ekranie w zakrystii | osoby stojące obok / widoczne na zdjęciach ekranu | ekran kolejki w trybie awaryjnym Admina nadal pokazuje pełne dane (to widok Admina) |
| 3 | **Cache offline Kiosku: tylko inicjał nazwiska**, bez pól `email`, `telefon`, `pesel`, `data_urodzenia`, `adres` (gdyby serwer je kiedyś zwrócił). Starszy cache jest skracany i zapisywany ponownie przy starcie | skradziony/zgubiony tablet (po odszyfrowaniu cache ujawnia mniej) | pełne nazwisko, które Kiosk dostał z serwera, zanim je skrócił, jest tylko w pamięci karty |
| 4 | **Pola formularzy:** `autocomplete="off"`, `spellcheck="false"`, `autocorrect="off"` (tylko tam, gdzie pole nie ustawia ich samo — logowanie zostaje bez zmian) | słowniki klawiatury i autouzupełnianie przeglądarki nie zapamiętują imion/nazwisk dzieci | przeglądarki/klawiatury, które ignorują te atrybuty |
| 5 | **`noindex, nofollow, noarchive, nosnippet`** na trzech stronach + `robots.txt` | indeksowanie przez wyszukiwarki publicznej strony (GitHub Pages) | `robots.txt` działa tylko na głównym adresie domeny; stronę nadal może otworzyć każdy, kto zna adres — dostęp chroni kod + PIN |
| 6 | **Test higieny HTML** (heurystyka): pola `imie/nazwisko/tresc/podpis/kontakt/…` w szablonach HTML muszą być owinięte `esc()/h()/…` | wstrzyknięcie skryptu przez dane wpisane przez użytkownika | heurystyka nie jest dowodem — zbadano wszystkie `app.part*`, `kiosk*`, `kontakt`; **nie znaleziono** nieescapowanych miejsc, ale to analiza statyczna |

Asystent AI (Edge Function) już wcześniej maskował PIN-y, kody, e-maile, telefony, PESEL i daty z rokiem przed wysłaniem do modelu (`asystent-sanityzacja.js`); nie zmieniano. Imion i nazwisk w dowolnym tekście nie da się wykryć automatycznie — Admin zatwierdza tekst przed wysłaniem.

## Pliki
Nowe: `js/prywatnosc.js`, `robots.txt`, `tests/prywatnosc.test.mjs` (9 testów), ten raport. Zmienione: `index/app/kiosk.html`, `sw.js`, `css/style.css` (dopisek), `js/i18n.js` (2 klucze × 3 języki), `js/app.part2/3/4.js` (maska), `js/kiosk.js`, `js/blokada-bezczynnosci.js`, `js/wersja.js` (2.15.15), `package.json`, testy (numer wersji).

## Nie sprawdzono
Nic nie uruchamiano w prawdziwej przeglądarce (testy w Node z atrapami). Zwłaszcza: dotykowe odsłanianie PIN-u na tablecie, `MutationObserver` na dynamicznie dodawanych polach, ponowny zapis starego cache przy starcie Kiosku, wygląd maski w trzech tabelach.

## Otwarte — wymaga decyzji i zmian w bazie (poza zasięgiem samego frontendu)
* **R2: `pin_jawny` leży w bazie jawnie** — frontend go tylko maskuje. Prawdziwe rozwiązanie: PIN pokazywany raz przy tworzeniu/resecie i nieprzechowywany (zmiana funkcji SQL, której ciał z `sql/01–13` nie ma w repozytorium).
* **RLS i uprawnienia tabel z danymi dzieci** nie były analizowane (brak `sql/01–13`); klucz `anon` jest publiczny z założenia, więc cała ochrona leży w funkcjach RPC i politykach RLS.
* **Podstawa prawna i obowiązki RODO wobec dzieci** (zgoda opiekuna, rejestr czynności, okresy przechowywania, procedura incydentu) to decyzje organizacyjne parafii — kod ich nie zastępuje. Ten dokument nie jest oceną zgodności z RODO.
* MFA, zdalne czyszczenie tabletu, łańcuch hashy audytu, sumy SRI — jak w `docs/RAPORT_V2.15.14.md` §6.
