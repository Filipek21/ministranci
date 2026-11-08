# Raport v2.15.13 — ulepszona sieć mini-asystenta

## Co zrobiono (i czego się dowiedziałem)
Rozmiar sieci zostaje ok. **120 tys. parametrów** (119 999). Zamiast dokładać parametry, sprawdziłem na **wewnętrznej walidacji krzyżowej** (co 4. pytanie wzorcowe każdego tematu jest wstrzymywane przy uczeniu, potem sprawdzane — bez „podglądania” zestawów testowych), co faktycznie poprawia sieć. Wyniki eksperymentów:

| Pomysł | Wynik | Decyzja |
|---|---|---|
| **Haszowanie cech ze znakiem** (kolizje się częściowo znoszą) | sieć sama: top-1 62,7% → 64,5% | **wdrożone** |
| **Dropout cech** (losowe gubienie słów przy uczeniu), **wygładzanie etykiet 0,05**, **niższe tempo uczenia 0,1** | sieć sama: do **66,5%** top-1 i 85% top-3 (z 80%) | **wdrożone** |
| **20 epok zamiast 26** | wynik taki sam lub lepszy, uczenie szybsze (ok. 2,3 s w Node zamiast 3,1 s) | **wdrożone** |
| **Przestrojone wagi sygnałów** (sieć 0,2 zamiast 0,5; reszta: TF-IDF i sąsiedzi w przestrzeni osadzeń) | walidacja krzyżowa: top-1 73,8% → **78,5–79%** | **wdrożone** |
| Warstwa ukryta (tanh, 32–96 neuronów) | **gorzej** (53–67% top-1), 3–5× wolniej | zostawiona jako opcja eksperymentalna, **wyłączona** |
| Podwójne haszowanie, mniej typów cech, wymiar 8/12, pooling √n | bez poprawy lub gorzej | niewdrożone (opcje zostają w kodzie) |
| Zdania z kroków poza treningiem sieci | gorzej | niewdrożone |
| TF-IDF po trójkach liter, kNN z K=2–3, zespół 2–4 sieci | różnice w granicach szumu (±1 pkt) | niewdrożone (opcje zostają w kodzie) |

**Ważny wniosek:** bezpośrednia odpowiedź sieci jest **najsłabszym** z sygnałów (sama: ok. 66% top-1), a dopasowanie TF-IDF samo daje ok. 80% na walidacji krzyżowej. Sieć wnosi głównie **reprezentację dla porównania z konkretnymi przykładami (kNN)** i odporność na synonimy; w mieszance dostała więc mniejszą wagę. Większa liczba parametrów lub głębsza sieć nie pomaga bez większej ilości danych.

## Jakość — uczciwie
Zestaw `held7` (47 pytań) napisałem **przed** ulepszaniem sieci:
| Wersja | Właściwy temat jest 1. | W pierwszej trójce | Odpowiedź końcowa |
|---|---|---|---|
| v2.15.12 | 39/47 (83%) | 46/47 (98%) | 43/47 (91%) |
| **v2.15.13** | **42/47 (89%)** | 45/47 (96%) | **45/47 (96%)** |

Odczytałem go **dwa razy**: raz po wdrożeniu dropoutu i wag (26 epok: 42 / 45 / 44), drugi raz po zmianie na 20 epok (42 / 45 / 45); zmianę epok wybrałem na podstawie walidacji krzyżowej, nie `held7`. Pierwsza trójka praktycznie bez zmian (−1 pytanie to szum). Na pięciu starszych zestawach (636 odpowiedzi, 3 ziarna losowe) wynik to ok. 91–92% top-1, 98–99% top-3, 96–97% odpowiedzi końcowej (wcześniej ok. 91% / 99% / 95%) — te zestawy były jednak oglądane przy strojeniu, więc to tylko kontrola.
**Poprawa jest realna, ale niewielka (kilka punktów procentowych)** — na tym poziomie pojedyncze pytania i ziarno losowe zmieniają wynik o 1–3 punkty.

## Zmienione pliki
`js/pomoc-ai.js` (rozbudowany, nic nie usunięto; zapis wag jest teraz w formacie v4 — stare wagi w pamięci przeglądarki są automatycznie odrzucane i sieć uczy się od nowa), `js/wersja.js` (2.15.13), testy (`pomoc-ai`, `pomoc-auto`, wersje), ten raport. Interfejs (`js/pomoc.js`) bez zmian.

## Testy
`npm test`: 191 zielonych. Nowe: jakość na `held7`; domyślne ustawienia sieci (znak, dropout, wygładzanie, epoki, tempo, waga); opcje eksperymentalne nie psują budżetu parametrów; wstrzymywanie pytań (walidacja krzyżowa); stabilność na różnych ziarnach; strażnik wycieku obejmuje `held7`.

## Czego NIE sprawdzono
Nie uruchamiano w prawdziwej przeglądarce (czas uczenia na tablecie; wagi ok. 320 kB w pamięci przeglądarki). Zestawy testowe pisałem sam; prawdziwi użytkownicy mogą pytać inaczej. Eksperymenty miały po 2 foldy walidacji (ok. 520 pytań), więc różnice poniżej ok. 1–2 punktów są szumem.
