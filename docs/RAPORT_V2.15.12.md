# Raport v2.15.12 — mini-asystent 120 tys. parametrów, ponad 1000 pytań wzorcowych, szersze słownictwo

## Co zrobiono
* **Model: 119 999 parametrów** (7 399 cech × 16 wymiarów + warstwa wyjściowa na 95 tematów). Zapis wag w pamięci przeglądarki ma ok. 320 kB.
* **Pytania wzorcowe: 1 031** (było 358 — średnio ok. 11 na temat zamiast 4). Każdy temat ma ich teraz co najmniej 4–5; tematy kiosku i panelu ministranta mają też wersje angielskie i ukraińskie. Formy potoczne: „odbić się na kiosku”, „klepnąć obecność”, „ile oczek”, „tablet laguje / muli”, „lektor”, „skrót na pulpicie”, „uwolnić zablokowanego”, literówki typowe dla telefonu.
* **Szersze słownictwo:** 50 grup synonimów (było 47), 877 słów w grupach (było 522); doszły m.in. słownictwo parafialne (roraty, nieszpory, majowe, pasterka, rekolekcje, odpust, chrzest, lektor, wikary), potoczne określenia kart, PIN-u i punktów, awarii („laguje”, „muli”, „zamarł”), czynności („wpisać”, „wprowadzić”, „przestawić”, „uwolnić”, „zabezpieczyć”) i nazwy urządzeń. Uczenie obejmuje 9 140 przykładów (było 5 344), w słowniku asystenta jest 3 189 słów.
* **Baza wiedzy: 44 odpowiedzi** (było 31): ile trwa zapis, kto widzi obecności, zmiana godziny mszy a okno zapisu, zapis bez karty, jedno konto na osobę, numer wersji, działanie na iPhonie, panel bez internetu, kto blokuje kiosk, po co zrzut ekranu, retencja danych, jak często robić kopię, edycja po fakcie.
* Zachowane wszystkie funkcje z 2.15.11: uczenie na wyborach, zapis wag, kNN, augmentacja synonimami, tryb „klikam za Ciebie”, czat, czuwanie.

## Jakość — uczciwie (zmierzone)
Liczby to pytania napisane innymi słowami niż dane uczące; „odpowiedź końcowa” = pewny temat, właściwy temat wśród proponowanych przycisków albo trafna odpowiedź z bazy wiedzy.

**Zestaw `held6` — 48 pytań napisanych PO zamrożeniu danych, uruchomiony jednorazowo (najuczciwszy):**
| Model | Właściwy temat jest 1. | W pierwszej trójce | Odpowiedź końcowa |
|---|---|---|---|
| v2.15.11 (70 tys., mniej danych) | 30/48 (63%) | 40/48 (83%) | 36/48 (75%) |
| **v2.15.12 (120 tys., więcej danych)** | **42/48 (88%)** | **47/48 (98%)** | **46/48 (96%)** |

Drugi zestaw (`held5`, 44 pytania) pokazał podobny skok (top-1 70% → 91%, odpowiedź końcowa 73% → 98%), ale **jest zawyżony**: napisałem go przed rozbudową danych, a słownictwo rozszerzałem już po jego obejrzeniu. Ufaj raczej `held6`.

**Czy sama liczba parametrów pomaga?** Po rozbudowie danych — tym razem tak, ale tylko do pewnego momentu. Ten sam zestaw danych, `held6` (top-1 / top-3 / odpowiedź końcowa): 70 tys. 37 / 46 / 42; **120 tys. 42 / 47 / 46**; 200 tys. 37 / 46 / 41. Wcześniej, przy małej ilości danych, parametry nie miały znaczenia — teraz 120 tys. wypada najlepiej, a 200 tys. już nie. Różnice kilku pytań mogą być szumem, więc nie traktuj tego jako twardej reguły. Głównym źródłem poprawy są **dane i słownictwo**, nie rozmiar sieci.

## Zmienione pliki
`js/pomoc-ai.js` (rozbudowany; nic nie usunięto), `js/wersja.js` (2.15.12), testy (`pomoc-ai`, `pomoc-auto`, wersje), ten raport. `js/pomoc.js` i pliki logiki aplikacji bez zmian merytorycznych.

## Testy
`npm test`: wszystkie zielone (186). Nowe: parametry 118–122 tys.; jakość na `held5` i `held6`; **strażnik wycieku** (żadne pytanie testowe z zestawów świeżych/held3–6 nie występuje w danych uczących); ≥ 1000 pytań wzorcowych, ≥ 4 na każdy temat, słownik ≥ 3000 słów, ≥ 50 grup synonimów; słownictwo potoczne; nowe odpowiedzi z bazy wiedzy.

## Czego NIE sprawdzono
* Nie uruchamiano w prawdziwej przeglądarce: czas uczenia na tablecie (w Node ok. 1,9 s; zapis wag ok. 320 kB w `localStorage`).
* Zestawy testowe pisałem sam — realni użytkownicy będą formułować pytania inaczej, więc skuteczność w praktyce może być niższa niż 88–96%.
* Pierwszy zestaw testowy (`held`, 48 pytań) był używany do strojenia w poprzednich wersjach; nie liczę go jako dowodu jakości.
