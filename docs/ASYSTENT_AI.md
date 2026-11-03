# Asystent AI (tylko Admin) — wdrożenie i zasady — v2.15.05

## Co to jest
Pływający chat 🤖 w prawym dolnym rogu panelu — widoczny **wyłącznie dla zalogowanego Admina**. Domyślnie zwinięty, a sam asystent jest **WYŁĄCZONY**, dopóki Admin go świadomie nie włączy (przycisk „Włącz asystenta”, z potwierdzeniem). Model: Mistral Large 4 (`mistral-large-4`) przez oficjalne API, wywoływany **wyłącznie z Edge Function** — klucz nigdy nie trafia do przeglądarki.
Asystent odpowiada tekstem. **Niczego nie wykonuje w systemie** (nie akceptuje obecności, nie blokuje kont, nie zmienia punktów). Stałe ostrzeżenie w oknie: „Odpowiedź AI ma charakter pomocniczy. Ostateczną decyzję podejmujesz Ty.”

## Wdrożenie (kolejność)
1. Baza: uruchom `sql/38_asystent_ai_v2_15_05.sql`, a po nim `sql/39_asystent_rozszerzenia_v2_15_06.sql` (po 14–37; najpierw kopia/staging). Plik 39 jest wymagany od v2.15.06 — zastępuje funkcję `asystent_przygotuj` wersją z zakresem danych; bez niego asystent pokaże komunikat „wymaga sql/38 i sql/39”.
2. Klucz: `supabase secrets set MISTRAL_API_KEY=<klucz z konsoli Mistral>` (opcjonalnie `ASYSTENT_MODEL=<nazwa>`, domyślnie `mistral-large-4`).
3. Funkcja: `supabase functions deploy asystent` (katalog `supabase/functions/asystent`: `index.ts` + `sanityzacja.js`). Zostaw domyślną weryfikację JWT — przeglądarka wysyła klucz anon automatycznie.
4. Konsola Mistral: włącz **opt-out treningu / zero data retention** (to ustawienie konta, nie parametr API — kodem go nie włączysz) i sprawdź zakładkę **Limits**.
5. W aplikacji: 🤖 → „Włącz asystenta”.

## Test po wdrożeniu (nie byłem w stanie go wykonać)
* Jako Admin: 🤖 → włącz → „Podsumuj Raport Dnia” → powinna wrócić odpowiedź; w Audycie kategoria „Asystent AI” ma wpis „Użycie asystenta (bez treści)”.
* Jako Ksiądz / ministrant: ikony 🤖 nie ma; wywołanie funkcji z konsoli bez kodu i PIN-u Admina → „Brak uprawnień”.
* Wymuszony błąd: tymczasowo ustaw nieprawidłowy `MISTRAL_API_KEY` → komunikat o kluczu; status w oknie „błąd API”.

## Dane i prywatność
| Do modelu | Nie trafia nigdy |
|---|---|
| zamaskowane pytania z rozmowy (bieżąca sesja strony), zagregowane liczby z bazy, **za Twoją zgodą**: zamaskowany fragment ekranu albo treść wiadomości z Kontaktu (bez imienia, kodu nadawcy i danych przeglądarki) | PIN-y, kody kont, imiona, pełne listy osób, daty urodzenia, e-maile, telefony, zrzuty ekranu |
* Maskowanie (`js/asystent-sanityzacja.js`, w Edge ta sama kopia): kody `MIN-001`, e-maile, numery 9+ cyfr (telefon, PESEL), daty z rokiem, „PIN: …”, obrazy `data:`; klucze o nazwach osobowych są wycinane z agregatów. **Imion i nazwisk w dowolnym tekście nie da się wykryć automatycznie** — dlatego przy „Wyjaśnij ten wpis” i „Pomóż odpowiedzieć” widzisz i zatwierdzasz dokładny tekst, który wyjdzie, i możesz go edytować.
* Agregaty (`_asystent_agregaty_38`): same liczby — ministranci aktywni/nieaktywni, obecności z 7 dni i miesiąca, najbliższe wydarzenia wg typu, wiadomości do Admina wg statusu, akceptacje > 36 h, kioski, audyt wg kategorii, operacje offline, blokady PIN.
* Historia rozmowy: tylko w zmiennej JS tej karty; znika po odświeżeniu, a po wylogowaniu jest czyszczona od razu. Nie ma localStorage / sessionStorage / IndexedDB, nie ma zapisu na serwerze.
* Audyt (`dziennik_audytu`, kategoria `asystent`): kto, kiedy, czy użyto danych systemowych / ekranu / wiadomości, model, wynik (ok / limit / tier / …). **Bez treści pytania i odpowiedzi.** Edge Function nie loguje treści.
* PIN Admina jest przesyłany do Edge Function (HTTPS) wyłącznie po to, by baza zweryfikowała Admina — tak samo jak w pozostałych wywołaniach panelu; nie trafia do modelu.

## Limity i błędy
* Własny limit (niezależny od Mistral): **12 zapytań/min i 300/dobę na Admina** (stałe w `asystent_przygotuj`; zmień w SQL, jeśli trzeba).
* Limity Mistral to limity Twojego konta (konsola → Limits); aplikacja ich nie zna. Gdy API zwraca nagłówki `ratelimit-remaining*`, pokazujemy je pod rozmową.
* Obsługa: `429` → „limit wyczerpany”; `403`/`404`/„tier” → próba modelu zapasowego `mistral-large-latest`, potem `mistral-medium-latest` (z informacją, który model odpowiedział), a jeśli żaden nie działa — komunikat o planie; `402`/brak środków; `401`/klucz; sieć. Status w oknie: włączony / limit wyczerpany / błąd API / wyłączony.

## Kontakt z Adminem
Przy wiadomości (zakładka Wiadomości) jest 🤖 „Pomóż odpowiedzieć”. Okno pokazuje **zamaskowaną** treść; generowanie możliwe dopiero po zaznaczeniu zgody. Szkic jest edytowalny, a „użycie” oznacza **kopiowanie** albo **zapis jako notatka** przy wiadomości. System nie ma kanału odpowiedzi do nadawcy, więc nic nie jest wysyłane automatycznie — wysyłasz samodzielnie.

## Rozszerzenia v2.15.06 (szybkie akcje)
| Akcja | Dane dla modelu | Uwagi |
|---|---|---|
| 🌅 Poranny przegląd | agregaty podstawowe + wiedza o systemie | co wymaga uwagi dziś: akceptacje > 36 h, pilne wiadomości, kioski, blokady |
| 🩺 Diagnostyka kiosku | stan techniczny wybranego kiosku jako „kiosk #N” (bez nazwy i identyfikatora) + Twój opis objawu + agregaty | jak przy „Wyjaśnij ten wpis”: widzisz dokładny tekst, zaznaczasz zgodę, możesz edytować; najpierw otwórz zakładkę Kioski, żeby lista była wczytana |
| 📖 Procedury | tylko wiedza o systemie (bez danych z bazy) | 8 tematów + własne pytanie; model ma zakaz zgadywania funkcji spoza wiedzy |
| 📈 Anomalie w liczbach | agregaty + serie czasowe (`_asystent_trendy_38`: 8 tygodni obecności i wydarzeń, 14 dni blokad i operacji offline, kioski anonimowo, wiadomości, akceptacje) | model dostaje średnią i odchylenie poprzednich tygodni; ma mówić o liczbach, nie o osobach, i zaznaczać za małą próbę |
| 📄 Raport miesięczny | agregaty za wybrany miesiąc i poprzedni (`_asystent_miesiac_38`) | wynik kopiujesz przyciskiem 📋 przy odpowiedzi; nic nie jest nigdzie wysyłane |

**Wiedza o systemie** (`WIEDZA_SYSTEMU` w `js/asystent-sanityzacja.js`) to krótka lista faktów sprawdzonych w kodzie (reguła 36 h, paczki i limity, token kiosku, blokady PIN, audyt, RODO). Jeśli zmienisz zachowanie systemu, zaktualizuj ją — inaczej asystent będzie podawał nieaktualne procedury.

## Odczyt list papierowych — decyzja: BEZ zewnętrznego AI
Zdjęcie listy papierowej to dane obecności małoletnich (kody ministrantów + pismo ręczne, czasem imiona, podpisy lub telefony). Maskowanie działa na tekście; **na obrazie nie da się go zastosować przed wysłaniem**, więc wysłanie zdjęcia do Mistral łamałoby zasadę „do modelu nie trafiają dane osobowe i zrzuty bez świadomej zgody”. Dlatego odczyt dalej odbywa się wyłącznie w przeglądarce (Tesseract), a ulepszenie jest **lokalne** (`js/lista-poprawki.js`):
* nieznany kod z OCR jest dopasowywany do jedynego bardzo podobnego znanego kodu (pomyłki O/0, I/1/L, S/5, B/8, Z/2, G/6 są „tańsze”); wiersz jest oznaczony „poprawiono z … — sprawdź” i **nie jest zaznaczony do dodania**, dopóki go nie zaznaczysz;
* ręczna edycja kodu wyłącza dopasowanie dla tego wiersza;
* powtórzone kody są oznaczone 🔁, a ich kolejne wystąpienia nie są domyślnie zaznaczone.
