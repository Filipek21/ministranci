# Raport v2.15.09 — pomoc: prostsza, żywsza, „idiotoodporna”

## Zmiany względem 2.15.08
**Idiotoodporność (od 9-latka po 76-latka i proboszcza)**
* **Zapis obecności na kiosku w jednym temacie, bez odsyłania gdzie indziej.** Krok 1 pokazuje OBA sposoby naraz: *A) PRZYŁÓŻ kartę do czytnika* albo *B) KLIKNIJ „📷 Skanuj kamerą”* (druga ramka na przycisku kamery). Gdy otworzy się kamera — pomoc sama przechodzi do kroku „Pokaż kartę kamerze”; gdy kamera się zamknie — wraca.
* Prosty język, krótkie zdania, numerowane kroki („1. … 5.”), emoji 🟢/🔴, podpowiedź przy każdym kroku, co dokładnie zrobić.
* Każdy krok ma plakietkę **👆 Kliknij / ⌨️ Wpisz / 🔽 Wybierz / 📲 Pokaż kartę / 👀 Spójrz** i **skaczący palec** wskazujący element.
* **A+** — większy tekst (2 stopnie), **🔊** — czytanie kroku na głos (PL/EN/UK, jeśli przeglądarka ma syntezator), **▾** — zwinięcie karty, żeby zobaczyć ekran.
* Pomoc **podąża za człowiekiem**: jeśli kiosk zmieni ekran albo ktoś cofnie się w kioskowym przepływie, karta przeskakuje do właściwego kroku.

**Pomijanie spełnionych kroków**
* Krok, który jest już zrobiony, jest pomijany z dymkiem „✓ Pomijam … — to już zrobione”: otwarta zakładka, filtr zgłoszeń ustawiony na „Oczekujące”. Mechanizm `pomin` jest ogólny (łatwo dopisać do kolejnych kroków).
* Wpisanie tekstu (po opuszczeniu pola lub Enter) i wybranie wartości z listy przechodzą dalej same; kliknięcie podświetlonego przycisku też.

**Żywiej**
* Animacje wejścia karty, zielony błysk i pochwała po wykonaniu kroku („Świetnie! 👍”), kropki postępu, powitanie „🚀 Zaczynamy”, na końcu **gratulacje + konfetti** 🎉 (wyłączone przy „ogranicz ruch” w systemie).

**Wygodniej**
* Menu: sekcja **💡 Polecam teraz** (zależna od otwartej zakładki / ekranu), **🕘 Ostatnio**, **✓** przy ukończonych tematach, liczba kroków, **szukajka** (gdy tematów > 8; nie na kiosku, żeby nie kolidowała ze skanerem).
* Przyciski „▶ …” w krokach uruchamiają powiązany temat jednym dotknięciem.

**Więcej tematów (66 definicji tematów; w 2.15.08 było 44)**
* Kiosk: pierwszy raz, kolory i komunikaty, nie widzę mojej mszy, zapisałem się dwa razy, ile punktów, kiosk nie reaguje; tryb awaryjny: przegląd.
* Logowanie: pierwsze logowanie, nie mogę się zalogować, instalacja aplikacji. Ministrant: zasady punktów, brakuje punktów, asystent, instalacja. Start: kim jestem, instalacja.
* Ksiądz: przed mszą, po mszy, zmiana godziny/usunięcie wydarzenia, edycja/dezaktywacja ministranta, poprawa obecności. Admin: rola Księdza, cofnięcie zmiany z audytu, blokada kiosku, koniec miesiąca.

## Zmienione pliki
`js/pomoc.js` (rozbudowany, wszystkie funkcje z 2.15.08 zachowane), `css/style.css` (dopisany blok na końcu), `js/wersja.js` (2.15.09), `package.json`, nowe `tests/pomoc-silnik.test.mjs`, rozszerzone `tests/pomoc.test.mjs`, ten raport. Żaden plik logiki aplikacji nie został zmieniony.

## Testy
Test statyczny: każdy selektor #id istnieje w HTML; przyciski „▶” wskazują istniejące tematy; wersje EN/UK. Test silnika na atrapie DOM: pełny przepływ kiosku (karta → kamera → PIN → wybór mszy → wynik → gratulacje) oraz pomijanie kroków w panelu Księdza.

## Czego NIE sprawdzono
Nie uruchamiano w prawdziwej przeglądarce — wygląd, położenie palca/ramek, animacje i głos (synteza mowy zależy od urządzenia) sprawdź na tablecie kiosku i telefonie. Nazwy przycisków wierszy tabel (np. „Edytuj”) opisane według kodu, nie według zrzutów ekranu.
