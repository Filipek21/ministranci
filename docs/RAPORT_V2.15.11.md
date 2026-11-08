# Raport v2.15.11 — mini-asystent 70 tys. parametrów i ulepszenia

## Zmiany
**Model: 69 999 parametrów** (było 49 999). 4 274 cechy × 16 wymiarów + warstwa wyjściowa na 95 tematów. Więcej cech = mniej kolizji haszowania, więc sieć lepiej rozróżnia słowa. Wymiar osadzenia sprawdziłem na 16 / 24 / 32 — najlepiej wypadło 16, więc dodatkowe parametry poszły w liczbę cech, a nie w wymiar.

**Ulepszenia asystenta**
* **Sąsiedzi w nauczonej przestrzeni osadzeń (kNN):** obok uśrednionego prawdopodobieństwa sieci i TF-IDF asystent porównuje pytanie z konkretnymi przykładami — to największy zysk jakości.
* **Augmentacja synonimami:** przy uczeniu pytania są powielane z podmienionymi słowami („zgubiłem” → „straciłem”), więc sieć uczy się, że różne słowa znaczą to samo (5 344 przykłady uczące, było 4 436).
* **Uczenie na Twoich wyborach (na tym urządzeniu):** gdy po pytaniu w czacie wybierzesz temat, asystent zapamiętuje „pytanie → temat” (do 100 wyborów), od razu lepiej trafia w podobne pytania i pamięta to po odświeżeniu strony. **Na kiosku nie uczy się** (wspólne urządzenie). Polecenie „zapomnij czego się nauczyłeś” (albo w czacie) czyści wszystko.
* **Zapis wag w pamięci przeglądarki** (ok. 187 kB, skwantyzowane do 16 bitów): przy kolejnym otwarciu sieć **nie uczy się od nowa** — ważne na wolnych tabletach. Zapis jest sprawdzany podpisem (zmiana wiedzy lub parametrów = ponowne uczenie).
* **Wykrywanie pytań spoza systemu:** gdy prawie żadne słowo pytania nie występuje w wiedzy o systemie (pogoda, bitcoin, przepisy…), asystent mówi „to wygląda na coś poza tym systemem” zamiast zgadywać temat.
* **Kontekst ekranu:** temat pasujący do otwartej zakładki dostaje premię w rankingu.
* **Nowe polecenia:** „nie rozumiem / prościej” (proponuje czytanie na głos, pokazanie palcem, większy tekst, kontakt z Adminem), „zapomnij czego się nauczyłeś”.
* **Baza wiedzy: 31 odpowiedzi** (było 25) — dodane: zapis za kolegę (nie wolno), zapomniana obecność, tryb awaryjny kiosku, nowa karta, jak działa ranking, zgłoszenie oczekujące. Dopasowanie bierze teraz najlepsze **pojedyncze** pytanie wzorcowe (identyczne pytanie dostaje wysoki wynik).
* Progi pewności przekalibrowane na nowy sposób liczenia (pewny temat ≥ 0,40; kilka propozycji ≥ 0,16).

## Jakość — uczciwie (zmierzone)
Pytania napisane innymi słowami niż dane uczące. „Odpowiedź końcowa” = pewny temat, właściwy temat wśród proponowanych przycisków albo trafna odpowiedź z bazy wiedzy.

**Zestaw nietknięty podczas strojenia (40 pytań) — jedyny w pełni uczciwy:**
| Model | Właściwy temat jest 1. | W pierwszej trójce | Odpowiedź końcowa |
|---|---|---|---|
| 50 tys. (v2.15.10) | 28/40 (70%) | 38/40 (95%) | 29/40 (73%) |
| **70 tys. (v2.15.11)** | **32/40 (80%)** | 37/40 (93%) | **37/40 (93%)** |

Zestawy użyte do strojenia (świeższe: 80 pytań z dwóch zestawów; wyniki zależą od ziarna losowego o ±2–3 pytania): ranking top-1 ok. 74–80%, top-3 ok. 93–96%, odpowiedź końcowa ok. 80–88%.
Wniosek: **największa poprawa to trafność końcowej odpowiedzi i top-1**; pierwsza trójka była już dobra i praktycznie się nie zmieniła. Asystent nadal się myli na trudnych parafrazach — wtedy pokazuje kilka tematów do wyboru, a po Twoim wyborze uczy się.

## Zmienione pliki
`js/pomoc-ai.js` (rozbudowany; wszystkie funkcje zachowane), `js/pomoc.js` (cache wag, uczenie na wyborach, polecenia, status), `js/wersja.js` (2.15.11), testy (`pomoc-ai`, `pomoc-auto`: nowe przypadki + zaktualizowane wersje), ten raport. Żaden plik logiki aplikacji nie został zmieniony.

## Testy
`npm test`: 180 zielonych. Nowe: zakres parametrów 68–72 tys.; zapis/odczyt wag (zgodność ≥ 95% po kwantyzacji, obcy podpis odrzucany); uczenie na wyborach; „nie wiem” dla pytań spoza systemu; premia kontekstu; nowa wiedza; trafność na zestawach; zapamiętywanie wyborów tylko poza kioskiem; wczytanie wag bez ponownego uczenia; „zapomnij”.

## Czego NIE sprawdzono
* Nie uruchamiano w prawdziwej przeglądarce (czas uczenia na tablecie, rozmiar zapisu w `localStorage`, wygląd czatu).
* Zestaw „nietknięty” liczy 40 pytań — różnica 73% → 93% jest wyraźna, ale to próba mała; w żywym użyciu wynik zależy od tego, jak ludzie naprawdę piszą.
* To nadal nie jest model językowy — nie prowadzi swobodnej rozmowy, tylko pomaga w tym systemie.
