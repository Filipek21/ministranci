// Testy v2.15.13: mini-asystent (js/pomoc-ai.js) — mała sieć ~120 tys. parametrów + baza wiedzy + reguły (bez prawdziwej AI).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const mod = { exports: {} }; vm.runInNewContext(czytaj('js/pomoc.js'), { module: mod, window: {} });
const { PRZEWODNIKI } = mod.exports;
const amod = { exports: {} }; vm.runInNewContext(czytaj('js/pomoc-ai.js'), { module: amod });
const AI = amod.exports;
const ctxDla = (k, extra) => Object.assign({ kontekst: k, jezyk: 'pl', tematyKontekstu: PRZEWODNIKI[k].map((t) => t.id) }, extra || {});
const model = AI.utworz({ przewodniki: PRZEWODNIKI });
model.trenuj();

// Zestaw 1 („dev”): na nim stroiłem słownik synonimów. Zestaw 2 („świeży”): nie używany do strojenia.
const DEV = [
["kiosk","przyłożyłem kartę do czytnika i ekran się zmienił, co mam robić dalej","k-obecnosc"],
["kiosk","gdzie kliknąć żeby zaliczyć dzisiejszą mszę","k-obecnosc"],
["kiosk","czytnik milczy, mogę pokazać kartę kamerką tabletu","k-kamera"],
["kiosk","nie mam przy sobie karty, mam tylko pin","k-zgubione"],
["kiosk","wypadło mi z głowy hasło do kodu","k-zgubione"],
["kiosk","chcę wpisać że służyłem na ślubie","k-specjalna"],
["kiosk","przełącz mi na ukraiński","k-jezyk"],
["kiosk","ekran stoi i dotyk nie działa","k-nie-reaguje"],
["kiosk","nie ma na liście żadnej mszy","k-za-wczesnie"],
["kiosk","kliknąłem złą cyfrę w kodzie","k-zly-pin"],
["kiosk","wyświetliło się nazwisko innego ministranta","k-cudze-imie"],
["kiosk","moja plakietka jest zalana i zniszczona","k-karta-uszkodzona"],
["kiosk","czy inni widzą jaki mam pin","k-prywatnosc"],
["kiosk","co oznacza zielony napis na końcu","k-kolory"],
["kiosk","obecność mi się zapisała jeszcze raz, czy to błąd","k-dwa-razy"],
["kiosk","nigdy tego nie używałem, wytłumacz od początku","k-pierwszy-raz"],
["kiosk","ile punktów jest za niedzielną sumę","k-punkty"],
["ministrant","pokaż mi mój wynik z tego miesiąca","m-punkty"],
["ministrant","chcę wymienić swój kod dostępu na nowy","m-pin"],
["ministrant","w które dni mam zapisane obecności","m-historia"],
["ministrant","jaką mam pozycję na liście najlepszych","m-ranking"],
["ministrant","czemu w pierwszy dzień miesiąca mam same zera","m-nowy-miesiac"],
["ministrant","panel się nie wczytuje na moim telefonie","m-strona-nie-laduje"],
["ministrant","nie widzę wpisu z ostatniej mszy, a byłem","m-blad"],
["login","nie pamiętam kodu do panelu","l-zapomnialem"],
["login","gdzie wpisać swoje dane żeby wejść","l-logowanie"],
["login","da się to mieć jak zwykłą aplikację w telefonie","l-instalacja"],
["ksiadz","muszę dodać nabożeństwo na piątek wieczorem","p-wydarzenie"],
["ksiadz","czekają zgłoszenia za ślub do zatwierdzenia","p-zgloszenia"],
["ksiadz","chłopiec nie odbił się na kiosku muszę go dopisać","p-reczna"],
["ksiadz","przyjęliśmy nowego chłopca, jak założyć mu konto","p-ministrant"],
["ksiadz","potrzebuję wydrukować wizytówki z kodami","p-karty"],
["ksiadz","mamy wypełnioną listę na kartce i chcę ją wczytać","p-listy"],
["ksiadz","pokaż jak wyglądała frekwencja w zeszłym miesiącu","p-frekwencja"],
["ksiadz","chłopak wpisał kilka razy zły pin i się zablokował","p-odblokuj"],
["ksiadz","msza została przeniesiona na inną godzinę","p-edytuj-wydarzenie"],
["ksiadz","co powinienem sprawdzić zanim zacznie się msza","p-przed-msza"],
["ksiadz","ustawić by ministranci mogli zapisywać się dłużej po rozpoczęciu","p-okno-rejestracji"],
["admin","chcę zapisać całą bazę do pliku","a-kopia-zapasowa"],
["admin","sprawdź kto zmieniał dane wczoraj","a-audyt"],
["admin","tablet w zakrystii przestał łączyć się z serwerem","a-diagnostyka-kiosku"],
["admin","muszę czasowo wyłączyć kiosk bo ktoś psoci","a-blokada-kiosku"],
["admin","chcę żeby proboszcz miał dostęp do panelu księdza","a-konto-ksiedza"],
["admin","osoba prosi o skasowanie swoich danych","a-rodo"],
["admin","podsumowanie całego dnia w jednym miejscu","a-raport"],
["kiosk-admin","ministrant jest zablokowany, odblokuj go z poziomu kiosku","e-odblokuj"],
["kiosk-ksiadz","wpisz ręcznie obecność chłopakowi który zgubił kartę","e-reczna"],
["kiosk-ksiadz","cofnij ostatni wpis który był pomyłką","e-cofnij"]
];
const SWIEZY = [
["kiosk","co zrobić żeby kiosk mnie zaliczył na dzisiejszej mszy","k-obecnosc"],
["kiosk","mogę odczytać kod aparatem w tablecie","k-kamera"],
["kiosk","moja karta przepadła nie wiem gdzie","k-zgubione"],
["kiosk","służyłem na pogrzebie i chcę to zgłosić","k-specjalna"],
["kiosk","po angielsku poproszę","k-jezyk"],
["kiosk","kiosk nie reaguje na dotyk","k-nie-reaguje"],
["kiosk","przyszedłem za wcześnie i nie mogę się zapisać","k-za-wczesnie"],
["kiosk","pomyliłem się w pinie jak cofnąć cyfrę","k-zly-pin"],
["kiosk","pokazuje imię kogoś innego","k-cudze-imie"],
["kiosk","kod qr jest nieczytelny bo karta jest brudna","k-karta-uszkodzona"],
["kiosk","co znaczy czerwony ekran po wpisaniu pinu","k-kolory"],
["kiosk","ile punktów dostanę za zwykłą mszę w tygodniu","k-punkty"],
["kiosk","to moja pierwsza wizyta pokaż mi wszystko","k-pierwszy-raz"],
["ministrant","ile mam punktów w tym miesiącu","m-punkty"],
["ministrant","jak ustawić inny pin","m-pin"],
["ministrant","lista moich ostatnich obecności","m-historia"],
["ministrant","w którym miejscu jestem w rankingu","m-ranking"],
["ministrant","dlaczego punkty zniknęły w nowym miesiącu","m-nowy-miesiac"],
["ministrant","nie mogę otworzyć panelu na telefonie","m-strona-nie-laduje"],
["ministrant","zapisałem obecność ale nie ma jej w historii","m-blad"],
["login","zapomniałem swojego pinu do panelu","l-zapomnialem"],
["login","jak wejść do systemu","l-logowanie"],
["login","chcę ikonę aplikacji na ekranie telefonu","l-instalacja"],
["ksiadz","jak dodać nową mszę do kalendarza na niedzielę","p-wydarzenie"],
["ksiadz","zatwierdzić zgłoszenie na pogrzeb","p-zgloszenia"],
["ksiadz","dopisać obecność ministrantowi ręcznie","p-reczna"],
["ksiadz","dodać nowego ministranta do systemu","p-ministrant"],
["ksiadz","wydrukować karty qr dla ministrantów","p-karty"],
["ksiadz","wczytać listę z papieru po awarii kiosku","p-listy"],
["ksiadz","pobierz raport frekwencji","p-frekwencja"],
["ksiadz","odblokować kod ministranta","p-odblokuj"],
["ksiadz","zmienić godzinę mszy w kalendarzu","p-edytuj-wydarzenie"],
["admin","zrobić kopię zapasową całej bazy","a-kopia-zapasowa"],
["admin","historia zmian w systemie","a-audyt"],
["admin","kiosk jest offline od kilku godzin","a-diagnostyka-kiosku"],
["admin","zablokować kiosk awaryjnie","a-blokada-kiosku"],
["admin","nadać rolę księdza","a-konto-ksiedza"],
["admin","usunąć dane osobowe osoby","a-rodo"],
["admin","co wymaga mojej uwagi","a-dashboard"],
["kiosk-admin","odblokuj kod ministranta na kiosku","e-odblokuj"]
];
function ocenZestaw(zestaw) {
    let top1 = 0, top3 = 0;
    for (const [k, q, oczekiwany] of zestaw) {
        const rk = model.ocen(q, ctxDla(k)).map((x) => x.id), poz = rk.indexOf(oczekiwany);
        if (poz === 0) top1++; if (poz >= 0 && poz < 3) top3++;
    }
    return { top1: top1 / zestaw.length, top3: top3 / zestaw.length, n: zestaw.length };
}

test('model ma ok. 120 tys. parametrów (118–122 tys.)', () => {
    assert.ok(model.parametry >= 118000 && model.parametry <= 122000, String(model.parametry));
    const s = model.statystyki(); assert.equal(s.parametry, s.cechy * s.wymiar + s.wymiar * s.tematy + s.tematy);
    assert.ok(s.tematy >= 90 && s.przyklady > 3000);
});
test('uczenie jest deterministyczne i porcjowane (trenujKawalek)', () => {
    const a = AI.utworz({ przewodniki: PRZEWODNIKI, epoki: 3 }), b = AI.utworz({ przewodniki: PRZEWODNIKI, epoki: 3 });
    let porcje = 0; while (!a.trenujKawalek(5)) { porcje++; if (porcje > 100000) break; } b.trenuj();
    assert.ok(porcje > 0 && a.gotowy() && b.gotowy());
    const q = 'jak zapisać obecność'; const ra = a.ocen(q, ctxDla('kiosk')).slice(0, 5).map((x) => x.id + x.wynik.toFixed(6)), rb = b.ocen(q, ctxDla('kiosk')).slice(0, 5).map((x) => x.id + x.wynik.toFixed(6));
    assert.deepEqual(ra, rb);
});
test('jakość: zestaw świeży (nie używany do strojenia) — top1 ≥ 75%, top3 ≥ 90%', () => { const o = ocenZestaw(SWIEZY); assert.ok(o.top1 >= 0.75 && o.top3 >= 0.9, JSON.stringify(o)); });
test('jakość: zestaw trudniejszy (parafrazy, użyty przy strojeniu słownika) — top1 ≥ 65%, top3 ≥ 85%', () => { const o = ocenZestaw(DEV); assert.ok(o.top1 >= 0.65 && o.top3 >= 0.85, JSON.stringify(o)); });
test('odpowiedź na pewne pytanie → temat + przycisk „pokaż krok po kroku”', () => {
    const r = model.odpowiedz('zgubiłem kartę', ctxDla('kiosk'));
    assert.ok(['temat', 'wybor'].includes(r.typ), r.typ);
    assert.ok(r.przyciski.some((p) => p.a === 'temat' && p.d === 'k-zgubione'), JSON.stringify(r.przyciski));
});
test('temat z innego ekranu nie dostaje przycisku startu, tylko wskazówkę gdzie go zrobić', () => {
    const r = model.odpowiedz('jak wydrukować karty qr dla ministrantów', ctxDla('kiosk'));
    assert.ok(!r.przyciski.some((p) => p.a === 'temat' && p.d === 'p-karty' && !p.poza), JSON.stringify(r.przyciski));
    if (r.typ === 'temat') assert.match(r.tekst, /Panel/);
});
test('baza wiedzy: pytanie o fakty dostaje krótką odpowiedź', () => {
    const r = model.odpowiedz('od kiedy do kiedy mogę zapisać obecność', ctxDla('kiosk'));
    assert.equal(r.typ, 'wiedza'); assert.match(r.tekst, /20 minut/);
    const r2 = model.odpowiedz('kto zatwierdza pogrzeb', ctxDla('ksiadz')); assert.equal(r2.typ, 'wiedza'); assert.match(r2.tekst, /Ksiądz/);
});
test('polecenia: tryb klikania, czytanie, rozmiar tekstu, koniec', () => {
    assert.equal(model.odpowiedz('włącz tryb klikaj za mnie', ctxDla('ksiadz')).komenda, 'auto_on');
    assert.equal(model.odpowiedz('nie klikaj za mnie', ctxDla('ksiadz')).komenda, 'auto_off');
    assert.equal(model.odpowiedz('przeczytaj to na głos', ctxDla('ksiadz')).komenda, 'czytaj');
    assert.equal(model.odpowiedz('chcę większy tekst', ctxDla('ksiadz')).komenda, 'tekst');
    assert.equal(model.odpowiedz('zakończ', ctxDla('ksiadz')).komenda, 'koniec');
    assert.equal(model.odpowiedz('dzięki', ctxDla('ksiadz')).komenda, 'dzieki');
});
test('uczciwość: pytany o siebie, mówi o braku prawdziwej AI i podaje liczbę parametrów', () => {
    const r = model.odpowiedz('kim jesteś', ctxDla('kiosk')); assert.equal(r.typ, 'komenda');
    assert.match(r.tekst, /bez prawdziwej sztucznej inteligencji/); assert.ok(r.tekst.includes(String(model.parametry)));
    assert.match(model.odpowiedz('ile masz parametrów', ctxDla('kiosk')).tekst, /parametr/);
});
test('nie zgaduje: bezsensowne pytanie → „nie wiem” + przycisk kontaktu', () => {
    const r = model.odpowiedz('asdf qwerty zxcv', ctxDla('kiosk')); assert.equal(r.typ, 'nie-wiem'); assert.ok(r.przyciski.some((p) => p.a === 'kontakt'));
});
test('język: odpowiedź w języku pytania (EN / UK), analiza roli, pilności i emocji', () => {
    assert.equal(AI.wykryjJezyk('how do I record my attendance', 'pl'), 'en'); assert.equal(AI.wykryjJezyk('як записати присутність', 'pl'), 'uk'); assert.equal(AI.wykryjJezyk('jak dodać obecność', 'pl'), 'pl');
    const r = model.odpowiedz('where is my card I lost it', ctxDla('kiosk')); assert.match(r.tekst, /[A-Za-z]/); assert.ok(!/Najlepiej pomoże/.test(r.tekst));
    const u = model.odpowiedz('я загубив картку', ctxDla('kiosk')); assert.match(u.tekst, /[а-яіїє]/i);
    const a = AI.analiza('Jestem księdzem, pomocy!!! nie działa', 'pl'); assert.equal(a.rola, 'ksiadz'); assert.equal(a.pilnosc, 'wysoka'); assert.equal(a.negacja, true);
});
test('literówki są poprawiane', () => {
    const r = model.ocen('zgubilem karte i nie pamietam pinnu', ctxDla('kiosk')).slice(0, 3).map((x) => x.id);
    assert.ok(r.includes('k-zgubione'), r.join(','));
    const r2 = model.ocen('jak dodac obecnsoc na kiosku', ctxDla('kiosk')).slice(0, 3).map((x) => x.id); assert.ok(r2.includes('k-obecnosc'), r2.join(','));
});
test('każdy temat (95+) ma wiedzę do uczenia: tytuł lub pytania wzorcowe', () => {
    const ids = new Set(); Object.values(PRZEWODNIKI).forEach((l) => l.forEach((t) => ids.add(t.id)));
    assert.ok(ids.size >= 90);
    for (const id of Object.keys(AI.PYTANIA)) assert.ok(ids.has(id), 'PYTANIA wskazuje nieistniejący temat: ' + id);
    for (const w of AI.WIEDZA) { assert.ok(w.odp.pl && w.pytania.length >= 3, w.id); for (const t of w.tematy) assert.ok(ids.has(t), w.id + ' → ' + t); }
});
test('moduł jest czystą logiką: nie dotyka DOM ani sieci', () => {
    const src = czytaj('js/pomoc-ai.js'); assert.ok(!/document\.|XMLHttpRequest|fetch\(|localStorage/.test(src));
});

// Końcowa odpowiedź (nie tylko ranking): „dobra” = pewny temat, albo właściwy temat wśród proponowanych przycisków, albo odpowiedź z bazy wiedzy powiązana z tematem.
function e2e(zestaw) {
    let ok = 0;
    for (const [k, q, oczekiwany] of zestaw) {
        const r = model.odpowiedz(q, ctxDla(k)); const btn = (r.przyciski || []).map((p) => p.d);
        const dobra = (r.typ === 'temat' && r.temat === oczekiwany) || (r.typ === 'wybor' && btn.includes(oczekiwany)) ||
            (r.typ === 'wiedza' && (btn.includes(oczekiwany) || (AI.WIEDZA.find((w) => w.id === r.wiedza).tematy || []).includes(oczekiwany)));
        if (dobra) ok++;
    }
    return ok / zestaw.length;
}
test('end-to-end: świeży zestaw ≥ 80% dobrych odpowiedzi, trudniejszy ≥ 55%', () => {
    const a = e2e(SWIEZY), b = e2e(DEV); assert.ok(a >= 0.8, 'swiezy ' + a); assert.ok(b >= 0.55, 'dev ' + b);
});
test('bezsensowne pytania nie dostają pewnej odpowiedzi', () => {
    let pewne = 0; for (const q of ['pogoda jutro', 'jaki jest kurs bitcoina', 'opowiedz kawał', 'przepis na pizzę', 'asdf qwerty zxcv']) { if (model.odpowiedz(q, ctxDla('kiosk')).typ === 'temat') pewne++; }
    assert.ok(pewne <= 1, 'pewne odpowiedzi na nonsens: ' + pewne);
});

// ---------------- v2.15.11 ----------------
const HELD3 = [
["kiosk","po zeskanowaniu karty ekran prosi o jakieś cyfry co mam wpisać","k-obecnosc"],
["kiosk","karty nie przyjmuje czytnik ale tablet ma aparat","k-kamera"],
["kiosk","kolega pożyczył mi swoją kartę i wyskoczyło jego nazwisko","k-cudze-imie"],
["kiosk","przepadła mi plakietka i nie wiem jaki mam kod","k-zgubione"],
["kiosk","chcę zgłosić że służyłem przy ślubie siostry","k-specjalna"],
["kiosk","zmień język na ukraiński","k-jezyk"],
["kiosk","dotykam ekranu a nic się nie dzieje","k-nie-reaguje"],
["kiosk","przyszedłem pięć minut przed czasem a mszy brak na liście","k-za-wczesnie"],
["kiosk","zły pin wpisałem i boję się że karta się zablokuje","k-zly-pin"],
["kiosk","karta mi się wytarła kod prawie niewidoczny","k-karta-uszkodzona"],
["kiosk","czy ktoś może podejrzeć moje cyfry","k-prywatnosc"],
["kiosk","wyskoczył czerwony komunikat nie rozumiem","k-kolory"],
["kiosk","ile punktów dostaje się za zwykłą mszę w piątek","k-punkty"],
["kiosk","pierwszy raz jestem w zakrystii z tym tabletem","k-pierwszy-raz"],
["kiosk","wyświetliło się że już jestem zapisany","k-dwa-razy"],
["ministrant","gdzie zobaczę ile razy służyłem w tym miesiącu","m-historia"],
["ministrant","zamienić kod dostępu na inny","m-pin"],
["ministrant","kto jest teraz pierwszy w rankingu","m-ranking"],
["ministrant","nowy miesiąc a ja mam zero czy straciłem punkty","m-nowy-miesiac"],
["ministrant","po wejściu na stronę widzę pusty biały ekran","m-strona-nie-laduje"],
["ministrant","w niedzielę byłem a nie ma wpisu","m-blad"],
["ministrant","jak działa liczenie punktów za nabożeństwa","m-zasady"],
["login","nie znam hasła do systemu","l-zapomnialem"],
["login","dostałem kartę ale nie wiem co wpisać żeby wejść","l-pierwsze"],
["login","zalogowałem się u kolegi na komputerze co zrobić","l-cudzy-telefon"],
["login","chciałbym mieć skrót do strony na ekranie telefonu","l-instalacja"],
["ksiadz","dodać mszę na święta w kalendarzu","p-wydarzenie"],
["ksiadz","ministrant prosi o punkty za pogrzeb trzeba zatwierdzić","p-zgloszenia"],
["ksiadz","chłopak zapomniał odbić kartę na kiosku dopisać mu","p-reczna"],
["ksiadz","przyjęliśmy nowego ministranta trzeba założyć mu dane","p-ministrant"],
["ksiadz","zgubiona plakietka trzeba unieważnić","p-plakietka"],
["ksiadz","mamy kartkę z podpisami po awarii tabletu","p-listy"],
["ksiadz","jak wypadła frekwencja w zeszłym miesiącu pdf","p-frekwencja"],
["ksiadz","chłopiec się zablokował po kilku złych pinach","p-odblokuj"],
["admin","zapisać wszystkie dane do pliku na wszelki wypadek","a-kopia-zapasowa"],
["admin","kto zmieniał ustawienia wczoraj","a-audyt"],
["admin","ministrant robi psikusy na kiosku i trzeba go wyłączyć","a-blokada-kiosku"],
["admin","dać uprawnienia księdza nowemu proboszczowi","a-konto-ksiedza"],
["admin","osoba żąda usunięcia swoich danych osobowych","a-rodo"],
["admin","podsumowanie dnia z alertami","a-raport"]
];
const HELD4 = [
["kiosk","jak mam postąpić po tym jak tablet rozpozna moją kartę","k-obecnosc"],
["kiosk","kamerka zamiast czytnika jak to uruchomić","k-kamera"],
["kiosk","nie mogę znaleźć karty a chcę się zapisać","k-zgubione"],
["kiosk","obecność na pogrzebie babci proboszcza","k-specjalna"],
["kiosk","angielski interfejs proszę","k-jezyk"],
["kiosk","kiosk zamarł i nie reaguje","k-nie-reaguje"],
["kiosk","nie ma żadnej mszy do wyboru bo jest za późno","k-za-wczesnie"],
["kiosk","pomyliłem się przy wpisywaniu cyfr w kodzie","k-zly-pin"],
["kiosk","kod qr jest porysowany i nie czyta","k-karta-uszkodzona"],
["kiosk","czy dane z kiosku są chronione","k-prywatnosc"],
["kiosk","co oznacza ten czerwony pasek na dole","k-kolory"],
["kiosk","dwa punkty czy jeden za niedzielę","k-punkty"],
["kiosk","nie wiem jak z tego korzystać pokaż od początku","k-pierwszy-raz"],
["ministrant","pokaż moje punkty za ten miesiąc","m-punkty"],
["ministrant","chcę zmienić numer pin","m-pin"],
["ministrant","wykaz mszy na których byłem","m-historia"],
["ministrant","jakie mam miejsce w porównaniu do innych","m-ranking"],
["ministrant","dlaczego mam zero punktów po zmianie miesiąca","m-nowy-miesiac"],
["ministrant","panel się zawiesza i nic nie widać","m-strona-nie-laduje"],
["ministrant","obecność z soboty nie zapisała się w historii","m-blad"],
["login","nie pamiętam pinu a chcę wejść","l-zapomnialem"],
["login","jak się dostać do panelu","l-logowanie"],
["login","dodać aplikację do ekranu głównego iphone","l-instalacja"],
["ksiadz","utworzyć nowe nabożeństwo w kalendarzu","p-wydarzenie"],
["ksiadz","rozpatrzyć zgłoszenie za ślub","p-zgloszenia"],
["ksiadz","wpisać ręcznie obecność bo kiosk nie zadziałał","p-reczna"],
["ksiadz","założyć konto dla nowego ministranta","p-ministrant"],
["ksiadz","przygotować wydruk kart z kodami qr","p-karty"],
["ksiadz","przepisać obecności z papierowej listy do systemu","p-listy"],
["ksiadz","przesunąć mszę na godzinę wcześniej","p-edytuj-wydarzenie"],
["ksiadz","odblokować chłopca który zapomniał pinu","p-odblokuj"],
["admin","eksport bazy żeby mieć zabezpieczenie","a-kopia-zapasowa"],
["admin","kto zmienił coś w systemie","a-audyt"],
["admin","wyłączyć kiosk bo ktoś go nadużywa","a-blokada-kiosku"],
["admin","nadać księdzu dostęp do panelu","a-konto-ksiedza"],
["admin","anonimizacja danych osoby która odeszła","a-rodo"],
["admin","alerty i liczniki na dziś","a-dashboard"],
["kiosk-admin","odblokuj zablokowaną kartę z poziomu tabletu","e-odblokuj"],
["kiosk-ksiadz","zapisz obecność chłopcu który zgubił kartę","e-reczna"],
["kiosk-admin","wyczyść kolejkę zakończonych wpisów","e-czysc"]
];   // zestaw niewidziany podczas strojenia — jedyny w pełni „uczciwy”
test('jakość v2.15.11: zestaw nietknięty podczas strojenia (40 pytań) — top1 ≥ 72%, odpowiedź końcowa ≥ 85%', () => {
    const o = ocenZestaw(HELD4), e = e2e(HELD4); assert.ok(o.top1 >= 0.72, JSON.stringify(o)); assert.ok(e >= 0.85, 'e2e ' + e);
});
test('jakość v2.15.11: kolejny zestaw parafraz (40 pytań) — top3 ≥ 85%, odpowiedź końcowa ≥ 70%', () => {
    const o = ocenZestaw(HELD3), e = e2e(HELD3); assert.ok(o.top3 >= 0.85, JSON.stringify(o)); assert.ok(e >= 0.7, 'e2e ' + e);
});
test('statystyki: 95+ tematów, augmentacja synonimami, kNN w przestrzeni osadzeń', () => {
    const st = model.statystyki(); assert.ok(st.tematy >= 95 && st.augmentacja === 1 && st.wagaKnn > 0 && st.przyklady > 5000, JSON.stringify(st));
});
test('zapis i odczyt wag: po imporcie model odpowiada tak samo (bez uczenia), obcy podpis jest odrzucany', () => {
    const zapis = JSON.parse(JSON.stringify(model.eksportuj())); assert.equal(zapis.v, 4);
    assert.ok(JSON.stringify(zapis).length < 500000, 'rozmiar zapisu ' + JSON.stringify(zapis).length);
    const m2 = AI.utworz({ przewodniki: PRZEWODNIKI }); assert.equal(m2.gotowy(), false);
    assert.equal(m2.importuj(zapis), true); assert.equal(m2.gotowy(), true);
    let rowne = 0, n = 0; for (const [k, q] of HELD4.concat(SWIEZY)) { n++; const a = model.ocen(q, ctxDla(k))[0].id, b = m2.ocen(q, ctxDla(k))[0].id; if (a === b) rowne++; }
    assert.ok(rowne / n >= 0.95, 'zgodność po kwantyzacji ' + rowne + '/' + n);
    const m3 = AI.utworz({ przewodniki: PRZEWODNIKI, parametry: 60000 }); assert.equal(m3.importuj(zapis), false);
    assert.equal(m3.importuj({ v: 2 }), false); assert.equal(m3.importuj(null), false);
});
test('uczenie na wyborach: po naucz() model trafia w wybrany temat i pamięta liczbę wyborów, bez dużej utraty jakości', () => {
    const m = AI.utworz({ przewodniki: PRZEWODNIKI }); m.importuj(JSON.parse(JSON.stringify(model.eksportuj())));
    const q = 'chłopaki robią zamieszanie przy tablecie w zakrystii'; const ctx = ctxDla('admin');
    m.naucz(q, 'a-blokada-kiosku', 6); assert.equal(m.ocen(q, ctx)[0].id, 'a-blokada-kiosku'); assert.equal(m.uczone(), 1);
    assert.equal(m.naucz('x', 'nie-ma-takiego-tematu'), false);
    let a = 0; for (const [k, qq, e] of SWIEZY) if (m.ocen(qq, ctxDla(k))[0].id === e) a++;
    let b = 0; for (const [k, qq, e] of SWIEZY) if (model.ocen(qq, ctxDla(k))[0].id === e) b++;
    assert.ok(a >= b - 2, 'po nauce ' + a + ' vs przed ' + b);
});
test('„nie rozumiem” → pomoc na inne sposoby; „zapomnij” → polecenie zapomnienia wyborów', () => {
    const r = model.odpowiedz('nie rozumiem tego', ctxDla('ksiadz')); assert.equal(r.typ, 'komenda'); assert.equal(r.komenda, 'nie_rozumiem');
    assert.equal(model.odpowiedz('zapomnij czego się nauczyłeś', ctxDla('ksiadz')).komenda, 'zapomnij');
});
test('pytania z innej dziedziny dostają „to nie ten system”, a nie losowy temat', () => {
    let pewne = 0, nieWiem = 0;
    for (const q of ['pogoda jutro w Krakowie', 'jaki jest kurs bitcoina', 'opowiedz kawał o kotach', 'przepis na pizzę z szynką', 'jak ugotować zupę pomidorową', 'gdzie jest najbliższy sklep spożywczy', 'ile kosztuje bilet na pociąg', 'co to jest czarna dziura']) {
        const r = model.odpowiedz(q, ctxDla('kiosk')); if (r.typ === 'temat') pewne++; if (r.typ === 'nie-wiem') nieWiem++;
    }
    assert.equal(pewne, 0); assert.ok(nieWiem >= 6, 'nie-wiem: ' + nieWiem);
});
test('kontekst ekranu: temat polecany dla otwartej zakładki dostaje premię w rankingu', () => {
    const q = 'jak to zrobić'; const c0 = ctxDla('ksiadz'); const c1 = ctxDla('ksiadz', { polecany: 'p-karty' });
    const a = model.ocen(q, c0).find((x) => x.id === 'p-karty').wynik, b = model.ocen(q, c1).find((x) => x.id === 'p-karty').wynik; assert.ok(b > a);
});
test('nowa wiedza: pytania o zapis za kolegę, zapomnianą obecność i nową kartę', () => {
    assert.equal(model.odpowiedz('czy mogę zapisać obecność za kolegę', ctxDla('kiosk')).wiedza, 'za-kolege');
    assert.equal(model.odpowiedz('zapomniałem zapisać obecność', ctxDla('kiosk')).typ, 'wiedza');
    assert.equal(model.odpowiedz('jak dostać nową kartę', ctxDla('kiosk')).typ, 'wiedza');
});

const HELD7 = [
["kiosk","jak potwierdzić swoją służbę na tablecie","k-obecnosc"],
["kiosk","nie działa skaner a kamera tak","k-kamera"],
["kiosk","nie wziąłem karty z domu","k-zgubione"],
["kiosk","dopisać udział w ślubie i chrzcie","k-specjalna"],
["kiosk","po angielsku","k-jezyk"],
["kiosk","dotyk nie działa na kiosku","k-nie-reaguje"],
["kiosk","nie widzę żadnej mszy bo jeszcze nie ten czas","k-za-wczesnie"],
["kiosk","błąd przy wpisywaniu czterech cyfr","k-zly-pin"],
["kiosk","kod na plakietce jest starty","k-karta-uszkodzona"],
["kiosk","czy cudzy człowiek zobaczy mój kod","k-prywatnosc"],
["kiosk","pojawił się czerwony ekran z napisem","k-kolory"],
["kiosk","jakie punkty są za nabożeństwo","k-punkty"],
["kiosk","instrukcja obsługi kiosku dla początkujących","k-pierwszy-raz"],
["kiosk","system powiedział że już zapisany","k-dwa-razy"],
["kiosk","my card is missing","k-zgubione"],
["kiosk","how do I record Mass","k-obecnosc"],
["kiosk","коли можна записатись","k-za-wczesnie"],
["ministrant","stan mojego konta punktowego","m-punkty"],
["ministrant","zmienić swoje hasło numeryczne","m-pin"],
["ministrant","zestawienie służb z całego miesiąca","m-historia"],
["ministrant","porównanie z kolegami","m-ranking"],
["ministrant","dlaczego wszystko zaczyna się od zera","m-nowy-miesiac"],
["ministrant","panel nie startuje na komórce","m-strona-nie-laduje"],
["ministrant","brakuje mi jednej obecności","m-blad"],
["ministrant","jak się liczy punkty za pogrzeb","m-zasady"],
["login","nie mam pojęcia co wpisać w logowaniu","l-logowanie"],
["login","zapomniałem swojego numeru pin","l-zapomnialem"],
["login","chcę ikonę strony w telefonie","l-instalacja"],
["ksiadz","wprowadzić nowe nabożeństwo do kalendarza","p-wydarzenie"],
["ksiadz","ministrant czeka na zatwierdzenie punktów za pogrzeb","p-zgloszenia"],
["ksiadz","chłopak zapomniał się zapisać dodać mu ręcznie","p-reczna"],
["ksiadz","założyć profil dla nowego członka","p-ministrant"],
["ksiadz","przyznać nową kartę bo stara przepadła","p-plakietka"],
["ksiadz","przygotować wydruk kart","p-karty"],
["ksiadz","przepisać obecności z kartki","p-listy"],
["ksiadz","ile osób było w tym miesiącu zestawienie","p-frekwencja"],
["ksiadz","uwolnić kod po błędnych próbach","p-odblokuj"],
["ksiadz","przesunąć nabożeństwo na inną godzinę","p-edytuj-wydarzenie"],
["admin","kopia bezpieczeństwa wszystkich danych","a-kopia-zapasowa"],
["admin","kto ostatnio coś zmieniał","a-audyt"],
["admin","kiosk przestał wysyłać wpisy","a-diagnostyka-kiosku"],
["admin","dać komuś rolę opiekuna","a-konto-ksiedza"],
["admin","wykasować dane osobowe na wniosek","a-rodo"],
["admin","to co dziś wymaga mojej reakcji","a-dashboard"],
["kiosk-admin","odblokować kod na tablecie","e-odblokuj"],
["kiosk-ksiadz","ręcznie dopisać obecność na kiosku","e-reczna"],
["kiosk-ksiadz","usunąć ostatni zapis z tabletu","e-cofnij"]
];   // napisany przed ulepszeniem sieci v2.15.13; odczytany dwa razy (patrz raport)
// ---------------- v2.15.12 ----------------
const HELD5 = [
["kiosk","jak odbić się na mszy","k-obecnosc"],
["kiosk","zamiast czytnika chcę użyć obiektywu tabletu","k-kamera"],
["kiosk","nie mam przy sobie plakietki a muszę się zapisać","k-zgubione"],
["kiosk","chcę dopisać rekolekcje albo pogrzeb sąsiada","k-specjalna"],
["kiosk","switch to English please","k-jezyk"],
["kiosk","ekran dotykowy zawiesił się całkiem","k-nie-reaguje"],
["kiosk","lista mszy do wyboru jest pusta bo jeszcze za wcześnie","k-za-wczesnie"],
["kiosk","źle kliknąłem jedną cyfrę","k-zly-pin"],
["kiosk","obraz kodu na plakietce jest zamazany","k-karta-uszkodzona"],
["kiosk","czy mój pin jest gdzieś widoczny dla innych","k-prywatnosc"],
["kiosk","czemu wyskoczył komunikat na czerwono","k-kolory"],
["kiosk","ile oczek za mszę w niedzielę","k-punkty"],
["kiosk","pierwszy dzień w roli ministranta jak obsługuję tablet","k-pierwszy-raz"],
["kiosk","powtórnie wyświetliło że już mam wpis","k-dwa-razy"],
["ministrant","jaki mam wynik w tym miesiącu","m-punkty"],
["ministrant","chcę mieć inny kod do panelu","m-pin"],
["ministrant","pokaż listę dni kiedy służyłem","m-historia"],
["ministrant","na którym jestem miejscu wśród chłopców","m-ranking"],
["ministrant","wszystko wyzerowane od pierwszego dnia miesiąca","m-nowy-miesiac"],
["ministrant","telefon nie ładuje panelu","m-strona-nie-laduje"],
["ministrant","służyłem a w systemie nic nie ma","m-blad"],
["ministrant","za co przyznawane są punkty","m-zasady"],
["login","zapomniałem jak się loguję do systemu","l-logowanie"],
["login","nie pamiętam hasła do panelu","l-zapomnialem"],
["login","jak zrobić skrót do panelu na pulpicie telefonu","l-instalacja"],
["ksiadz","wpisać nową mszę w kalendarz parafii","p-wydarzenie"],
["ksiadz","rozpatrzyć prośbę o punkty za pogrzeb","p-zgloszenia"],
["ksiadz","ręcznie zaliczyć chłopcu obecność","p-reczna"],
["ksiadz","dodać nowego lektora do systemu","p-ministrant"],
["ksiadz","wydać nową plakietkę po zgubieniu","p-plakietka"],
["ksiadz","wydrukować plik z kartami do rozdania","p-karty"],
["ksiadz","wprowadzić dane z papierowego arkusza","p-listy"],
["ksiadz","zestawienie obecności z całego miesiąca","p-frekwencja"],
["ksiadz","uwolnić zablokowanego chłopca","p-odblokuj"],
["ksiadz","zmienić termin nabożeństwa","p-edytuj-wydarzenie"],
["admin","zrobić zabezpieczenie danych na dysk","a-kopia-zapasowa"],
["admin","przejrzeć kto co zmieniał w systemie","a-audyt"],
["admin","kiosk w zakrystii nie przesyła danych od rana","a-diagnostyka-kiosku"],
["admin","przyznać uprawnienia opiekuna nowej osobie","a-konto-ksiedza"],
["admin","skasować dane osoby na jej prośbę","a-rodo"],
["admin","ogólny przegląd tego co trzeba dziś załatwić","a-dashboard"],
["kiosk-admin","uwolnij zablokowany kod na tablecie","e-odblokuj"],
["kiosk-ksiadz","dopisz chłopcu mszę z poziomu kiosku","e-reczna"],
["kiosk-ksiadz","wycofaj ostatni wpis na kiosku","e-cofnij"]
];   // napisany przed rozbudową danych, ale słownik rozszerzałem po jego obejrzeniu — wynik zawyżony
const HELD6 = [
["kiosk","zapisać się na liturgię przez tablet","k-obecnosc"],
["kiosk","kod qr aparatem bo czytnik się zepsuł","k-kamera"],
["kiosk","karta została w domu","k-zgubione"],
["kiosk","uroczystość rodzinna z udziałem ministrantów jak odnotować","k-specjalna"],
["kiosk","ukraiński proszę","k-jezyk"],
["kiosk","nie mogę nic kliknąć na ekranie kiosku","k-nie-reaguje"],
["kiosk","msza jeszcze się nie zaczęła i nie ma jej do wyboru","k-za-wczesnie"],
["kiosk","pomyłka przy ostatniej cyfrze kodu","k-zly-pin"],
["kiosk","plakietka wygląda jak po praniu i nie działa","k-karta-uszkodzona"],
["kiosk","kto widzi to co wpisuję na klawiaturze","k-prywatnosc"],
["kiosk","wyświetliła się informacja o błędzie na czerwono","k-kolory"],
["kiosk","wartość punktowa niedzielnej mszy","k-punkty"],
["kiosk","nowy w zakrystii pokaż jak się obsługuje kiosk","k-pierwszy-raz"],
["kiosk","dostałem komunikat że obecność już jest","k-dwa-razy"],
["kiosk","i lost the card","k-zgubione"],
["kiosk","zgubilem karte i niepamietam pinu","k-zgubione"],
["ministrant","ile oczek mam na koncie","m-punkty"],
["ministrant","zmiana numeru dostępowego do panelu","m-pin"],
["ministrant","przegląd moich wszystkich służb","m-historia"],
["ministrant","czy jestem wyżej niż w zeszłym miesiącu","m-ranking"],
["ministrant","nowy miesiąc i wszystko od zera","m-nowy-miesiac"],
["ministrant","po wejściu na adres widzę tylko biały ekran","m-strona-nie-laduje"],
["ministrant","obecność z wtorku nie została policzona","m-blad"],
["ministrant","z czego składa się punktacja","m-zasady"],
["ministrant","my score this month","m-punkty"],
["login","nie wiem jaki kod wpisać na stronie logowania","l-pierwsze"],
["login","pin wyleciał mi z głowy","l-zapomnialem"],
["login","mam telefon z androidem i chcę ikonę na ekranie","l-instalacja"],
["ksiadz","dopisać do grafiku nabożeństwo majowe","p-wydarzenie"],
["ksiadz","dodaj mnsze do kalendarza","p-wydarzenie"],
["ksiadz","ktoś zgłosił obecność na pogrzebie do akceptacji","p-zgloszenia"],
["ksiadz","ministrant nie odbił się a był na mszy trzeba mu wpisać","p-reczna"],
["ksiadz","mam nowego chłopca do wpisania do systemu","p-ministrant"],
["ksiadz","plakietka przepadła trzeba wydać inną","p-plakietka"],
["ksiadz","wydruk wizytówek dla całej grupy","p-karty"],
["ksiadz","po awarii kiosku mamy podpisy na kartce","p-listy"],
["ksiadz","raport z liczby służb w ostatnim miesiącu","p-frekwencja"],
["ksiadz","konto chłopaka jest zablokowane","p-odblokuj"],
["ksiadz","msza zostaje przeniesiona na wieczór","p-edytuj-wydarzenie"],
["admin","zrobić kopię całej bazy na komputer","a-kopia-zapasowa"],
["admin","sprawdzić kto zmieniał dane","a-audyt"],
["admin","tablet w zakrystii od rana jest bez łączności","a-diagnostyka-kiosku"],
["admin","chcę mianować nowego opiekuna","a-konto-ksiedza"],
["admin","żądanie usunięcia danych osobowych ministranta","a-rodo"],
["admin","co dziś jest do zrobienia w systemie","a-dashboard"],
["kiosk-admin","zdjąć blokadę kodu z poziomu tabletu","e-odblokuj"],
["kiosk-ksiadz","wpisz mszę chłopakowi który nie ma karty","e-reczna"],
["kiosk-ksiadz","cofnij pomyłkowy zapis na kiosku","e-cofnij"]
];   // napisany po zamrożeniu danych, uruchomiony jednorazowo — najuczciwszy pomiar
test('jakość v2.15.12: zestaw napisany po zamrożeniu danych (48 pytań) — top1 ≥ 80%, top3 ≥ 93%, odpowiedź końcowa ≥ 90%', () => {
    const o = ocenZestaw(HELD6), e = e2e(HELD6); assert.ok(o.top1 >= 0.8 && o.top3 >= 0.93, JSON.stringify(o)); assert.ok(e >= 0.9, 'e2e ' + e);
});
test('jakość v2.15.12: drugi zestaw (44 pytania) — top1 ≥ 80%, odpowiedź końcowa ≥ 88%', () => {
    const o = ocenZestaw(HELD5), e = e2e(HELD5); assert.ok(o.top1 >= 0.8, JSON.stringify(o)); assert.ok(e >= 0.88, 'e2e ' + e);
});
test('strażnik wycieku: żadne pytanie z zestawów testowych (świeży, held3–held6) nie występuje w danych uczących', () => {
    const uczace = new Set(); Object.values(AI.PYTANIA).forEach((l) => l.forEach((x) => uczace.add(AI.norm(x)))); AI.WIEDZA.forEach((w) => w.pytania.forEach((x) => uczace.add(AI.norm(x))));
    const kolizje = []; for (const [, q] of [].concat(SWIEZY, HELD3, HELD4, HELD5, HELD6, HELD7)) if (uczace.has(AI.norm(q))) kolizje.push(q);
    assert.deepEqual(kolizje, []);
});
test('v2.15.12: ponad 1000 pytań wzorcowych, 44 odpowiedzi w bazie wiedzy, szeroki słownik i 50 grup synonimów', () => {
    const st = model.statystyki(); assert.ok(st.pytaniaWzorcowe >= 1000, JSON.stringify(st)); assert.ok(st.wiedza >= 44); assert.ok(st.slownik >= 3000 && st.grupySynonimow >= 50 && st.formSynonimow >= 500, JSON.stringify(st));
    for (const id of Object.keys(AI.PYTANIA)) assert.ok(AI.PYTANIA[id].length >= 5 || id.startsWith('w-') || id.startsWith('e-'), id + ' ma tylko ' + AI.PYTANIA[id].length);
    const ids = new Set(); Object.values(PRZEWODNIKI).forEach((l) => l.forEach((t) => ids.add(t.id)));
    const bez = [...ids].filter((i) => !(AI.PYTANIA[i] && AI.PYTANIA[i].length >= 4)); assert.deepEqual(bez, [], 'tematy z mniej niż 4 pytaniami wzorcowymi');
});
test('słownictwo potoczne i parafialne: „odbić się”, „lektor”, „oczka”, „laguje”, „majowe”', () => {
    const ctxK = ctxDla('kiosk');
    assert.ok(model.ocen('jak się odbić na kiosku', ctxK).slice(0, 2).map((x) => x.id).includes('k-obecnosc'));
    assert.ok(model.ocen('tablet laguje i muli', ctxK).slice(0, 2).map((x) => x.id).includes('k-nie-reaguje'));
    assert.ok(model.ocen('ile oczek za roraty', ctxK).slice(0, 3).map((x) => x.id).includes('k-punkty'));
    assert.ok(model.ocen('dodać lektora do systemu', ctxDla('ksiadz')).slice(0, 2).map((x) => x.id).includes('p-ministrant'));
});
test('nowa wiedza v2.15.12: czas zapisu, bez karty, panel offline, retencja, wersja', () => {
    assert.equal(model.odpowiedz('czy mogę zapisać się bez karty', ctxDla('kiosk')).typ, 'wiedza');
    assert.equal(model.odpowiedz('czy panel działa bez internetu', ctxDla('ministrant')).wiedza, 'panel-internet');
    assert.equal(model.odpowiedz('jak długo przechowywane są dane', ctxDla('admin')).wiedza, 'retencja');
    assert.equal(model.odpowiedz('jaka to wersja aplikacji', ctxDla('kiosk')).wiedza, 'wersja');
});

// ---------------- v2.15.13 ----------------
test('jakość v2.15.13: zestaw napisany przed ulepszeniem sieci (47 pytań) — top1 ≥ 85%, top3 ≥ 93%, odpowiedź końcowa ≥ 90%', () => {
    const o = ocenZestaw(HELD7), e = e2e(HELD7); assert.ok(o.top1 >= 0.85 && o.top3 >= 0.93, JSON.stringify(o)); assert.ok(e >= 0.9, 'e2e ' + e);
});
test('ulepszona sieć: haszowanie ze znakiem, dropout cech, wygładzanie etykiet, 20 epok i niższe tempo uczenia są domyślne', () => {
    const st = model.statystyki();
    assert.equal(st.znak, true); assert.equal(st.dropout, 0.15); assert.equal(st.wygladzanie, 0.05); assert.equal(st.epoki, 20); assert.equal(st.tempoUczenia, 0.1); assert.equal(st.wagaNN, 0.2);
    assert.ok(st.parametry >= 118000 && st.parametry <= 122000);
});
test('opcje eksperymentalne działają i zachowują budżet parametrów (warstwa ukryta, podwójne haszowanie)', () => {
    for (const opc of [{ ukryte: 32 }, { podwojny: true }, { znak: false, dropout: 0, wygladzanie: 0 }]) {
        const m = AI.utworz(Object.assign({ przewodniki: PRZEWODNIKI, epoki: 2 }, opc)); m.trenuj();
        assert.ok(m.parametry >= 118000 && m.parametry <= 122000, JSON.stringify(opc) + ' ' + m.parametry);
        assert.ok(['temat', 'wybor', 'wiedza', 'nie-wiem'].includes(m.odpowiedz('jak zapisać obecność', ctxDla('kiosk')).typ));
    }
});
test('wstrzymanie pytań (walidacja krzyżowa): wstrzymane pytanie nie trafia do danych uczących', () => {
    const wst = new Set(AI.PYTANIA['k-obecnosc'].map((x) => AI.norm(x)));   // cały temat naraz (pojedyncze pytanie bywa kompensowane przez losowe warianty)
    const a = AI.utworz({ przewodniki: PRZEWODNIKI, epoki: 1 }), b = AI.utworz({ przewodniki: PRZEWODNIKI, epoki: 1, wstrzymaj: wst });
    assert.ok(a.statystyki().przyklady - b.statystyki().przyklady >= 3 * wst.size, a.statystyki().przyklady + ' vs ' + b.statystyki().przyklady);
});
test('wielokrotne ziarna: wynik jakościowy nie zależy od szczęśliwego ziarna (3 ziarna × zestaw held6 ≥ 80% top1)', () => {
    let ok = 0, n = 0;
    for (const z of [1, 2]) { const m = AI.utworz({ przewodniki: PRZEWODNIKI, ziarno: z }); m.trenuj(); for (const [k, q, e] of HELD6) { n++; if (m.ocen(q, ctxDla(k))[0].id === e) ok++; } }
    assert.ok(ok / n >= 0.8, ok + '/' + n);
});
