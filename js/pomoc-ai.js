// ============================================================================
// v2.15.13 — MINI-ASYSTENT: ulepszona sieć (haszowanie ze znakiem, dropout cech, wygładzanie etykiet, niższe tempo uczenia, strojenie wag sygnałów na walidacji krzyżowej).
// v2.15.12 — MINI-ASYSTENT (ok. 120 000 parametrów, ok. 1 000 pytań wzorcowych, szerszy słownik; wcześniej 70 000, sąsiedzi w przestrzeni osadzeń, sąsiedzi w przestrzeni osadzeń, augmentacja synonimami, uczenie na wyborach, zapis wag) (lokalny „mini-silnik AI” bez prawdziwej sztucznej inteligencji)
//
// Co to jest (uczciwie):
//  • Działa w całości w przeglądarce — bez internetu, bez serwera, bez zewnętrznego modelu językowego.
//  • Sercem jest MAŁA SIEĆ NEURONOWA typu „fastText”: wspólna tablica osadzeń cech (słowa, ich rdzenie, grupy synonimów,
//    pary słów, trójki liter) → warstwa wyjściowa (softmax) po tematach pomocy. Ma ok. 120 000 parametrów
//    (dokładną liczbę zwraca model.parametry). Uczy się przy pierwszym użyciu z wiedzy o systemie (tematy, kroki, pytania wzorcowe),
//    deterministycznie (stałe ziarno), porcjami po kilka ms, żeby nie zawieszać kiosku.
//  • Do sieci dochodzą: dopasowanie leksykalne TF-IDF, poprawianie literówek, słownik synonimów, baza wiedzy (pytania i odpowiedzi),
//    rozpoznawanie poleceń („kliknij za mnie”, „przeczytaj”), wykrywanie języka (PL/EN/UK), roli, pilności i kontekstu ekranu.
//  • To NIE jest model generatywny: nie wymyśla odpowiedzi. Gdy nie wie — mówi, że nie wie, i pokazuje, co może zrobić.
// Moduł jest czystą logiką (bez DOM) — testowany w Node.
// ============================================================================
(function (root, fabryka) {
    'use strict';
    const api = fabryka();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.EMPomocAI = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const T = (pl, en, uk) => ({ pl: pl, en: en || pl, uk: uk || pl });

    // ------------------------------------------------------------------ NORMALIZACJA / TOKENY ----
    function norm(s) { return String(s === null || s === undefined ? '' : s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
    function rdzen(w) { if (w.length <= 3) return w; return w.slice(0, Math.max(3, Math.min(5, w.length - 1))); }
    const STOP = new Set(['i', 'w', 'z', 'na', 'do', 'sie', 'to', 'jest', 'czy', 'ze', 'mi', 'mnie', 'a', 'o', 'u', 'po', 'od', 'the', 'an', 'is', 'of', 'my', 'me', 'it', 'in', 'on', 'and', 'what', 'how', 'що', 'як', 'я', 'і', 'в', 'це', 'мені', 'до', 'jak', 'co', 'by', 'ten', 'ta', 'te', 'sa', 'si', 'oraz', 'tez', 'juz', 'tylko', 'bardzo', 'prosze']);

    // Grupy synonimów: każde słowo z grupy dodaje do zapytania wspólną cechę „@grupa”.
    const GRUPY = {
        obecnosc: 'sluzyl sluzylem sluzyla sluzylam sluzba sluzyc sluzymy lso odbic odbij odbijac odbilem odbijalem wbic wbilem klepnac klepniecie zameldowac zameldowal zarejestrowac zarejestrowalem zarejestrowac zaliczylo zaliczy bylem byla byli wpis wpisu odbil odbic odbijac odbilem odbijalem zaliczyl obecnosc obecnosci zapis zapisac zapisuje zapisanie zapisalem zaliczyc zaliczenie attendance record присутність записати присутності',
        karta: 'karteczka kartka kartke identyfikator identyfikatora brelok chip tag nfc plakietke plakietce plakietka kodem kod qr karta karte karty plakietka plakietki plakietke qr wizytowka legitymacja card badge картка картку плакетка',
        pin: 'kodzik haselko szyfr sekret sekretny numer numeru czterocyfrowy czterocyfrowe cyfra cyfre cyfry cyfr kod dostepu pin pinu haslo hasla password пін',
        zgubic: 'zgubil zgubic zgubilem zgubilam zgubiona zgubiony zgubione zapomnial zapomnialem zapomnialam zapomniec stracil stracilem zginela lost forgot forgotten загубив загубила забув забула втратив',
        blokada: 'uwolnic uwolnij uwolnic odwiesic zdjac zawieszony zawieszona zawiesic zablokowaly zablokowalem wylaczyc wylacz wylaczenie czasowo zablokowany zablokowana zablokowal zablokowac blokada locked blocked lock заблокований заблокована odblokowac odblokuj odblokowanie unlock розблокувати',
        punkty: 'oczka oczek oczko oczkami ptk punkciki zaliczenia zebrane stan konto wynik wyniki wynikow score zebrane zebralem uzbieralem punkt punkty punktow punktami pkt points point бали бал балів ranking rankingu',
        msza: 'roraty rorat nieszpory nieszporow majowe rozaniec rozanca adoracja adoracji pasterka pasterce rezurekcja rezurekcji procesja procesji droga krzyzowa gorzkie zale komunia mszalny mszalna sumie sumy niedzielna niedzielny niedziele niedziela suma sume sumie sumy msza mszy msze nabozenstwo nabozenstwa liturgia mass service меса меси богослужіння',
        kiosk: 'kiosk kiosku kioski tablet tabletu zakrystia zakrystii kiosque кіоск планшет',
        kamera: 'kamera kamerka kamere kamera aparat camera камера камери',
        czytnik: 'czytnik czytnika skaner skanera skanowac skanuje skan scanner reader scan сканер сканувати',
        blad: 'laguje lagi muli wiesi wiesza zawiesilo zacina zacinam wariuje swiruje glupieje lapie chwyta reaguje nie reaguje milczy pika pikanie stoi dotyk zamarl zamarzl zacial zacina zawisl blad bledy awaria zepsuty zepsul problem error bug zawiesza zawiesil zawiesilo broken glitch помилка проблема',
        dziala: 'dziala dzialac dziala dzialaja working work працює',
        ksiadz: 'wikary wikarego wikaremu proboszczowi proboszczem opiekuna opiekunowi opiekunem opiekunka parafia parafii ksiadz ksiedza ksiedzu ksiezy proboszcz proboszcza proboszczu opiekun priest священник',
        admin: 'informatyk informatyka programista tworca tworcy techniczny admin admina adminem adminowi administrator administratora administratorze',
        ministrant: 'lektor lektora lektorem lektorzy chlopiec chlopca chlopcu chlopcy chlopcow chlopak chlopaka chlopakowi chlopakow dzieciak dziecko mlody mlodzi ministrantka ministrantki podopieczny ministrant ministranta ministranci ministrantow ministrantem server servers служитель служителі',
        kalendarz: 'kalendarz kalendarza harmonogram terminarz calendar календар wydarzenie wydarzenia wydarzeniu event подія',
        dodac: 'wpisac wpisz wpisuje wprowadzic wprowadz zalozyc zaloz zaloze utworz stworz umiescic dopisac wstawic dopisac dopisz dopisze dopisanie dodac dodaj dodawanie stworzyc utworzyc nowy nowe nowa nowego add create додати створити',
        usunac: 'wymazac wywalic usuwam anulowac skasuj skreslic usunac usun skasowac kasuj wykasowac usuwanie delete remove видалити',
        zmienic: 'przestawic przeniesc przesunac podmienic zamienic zamien inny inna inne innego innym przeniesiona przesunieta przesunac przeniesc przelozyc przelozona przeniesiony zmienic zmien edytowac edycja edytuj poprawic popraw korekta edit change змінити',
        zgloszenie: 'chrzest chrztu chrzciny rekolekcje rekolekcji odpust odpustu uroczystosc uroczystosci rodzinna sasiada babci pogrzebie slubie wesela zgloszenie zgloszenia zgloszen pogrzeb pogrzeby slub sluby wesele specjalna specjalne funeral wedding похорон весілля',
        lista: 'arkusz arkusza kartka kartke podpisy podpisami skan skanu zdjecie zdjecia lista listy papierowa papierowe papier wydruk drukowac druk drukuj print paper список',
        raport: 'zestawienie zestawienia zestawieniem podsumowac wykaz wykazy wykaz spis raport raporty frekwencja frekwencji statystyki statystyka podsumowanie report stats звіт',
        jezyk: 'angielsku angielski ukrainsku ukrainski ukrainskim polsku polski english ukrainian ang ukr jezyk jezyka language angielski ukrainski english мова',
        telefon: 'samsung huawei xiaomi ipad komorce komorki komorke smartfonie telefonu telefon telefonie komorka smartfon iphone android phone мобільний телефон',
        instalacja: 'skrot skrotu pulpit pulpicie pulpitu przypiac przypnij ikonka ikonke ikonki dodac ekranu glownego poczatkowego instalacja zainstalowac zainstaluj ikona pwa install ekran',
        internet: 'laczyc lacz laczy polaczenie polaczenia lacznosc zasieg zasiegu laczyc lacz polaczyc laczy serwerem serwer przestal laczyc internet siec wifi offline online polaczenie sieci kolejka synchronizacja sync інтернет',
        wylogowac: 'wylogowac wyloguj wylogowanie logout вийти',
        zalogowac: 'wejsc wejdz wchodze wchodzic dostac dostep dostepu wpuszcza wpuszcza zalogowac logowanie login zaloguj zalogowany zaloguje увійти вхід',
        kontakt: 'powiadomic powiadomienie poinformowac zawiadomic napisz napisac wyslac wyslij zgloszenie kontakt napisac wiadomosc wiadomosci zglosic skarga mail contact message написати',
        rodo: 'dane danych danymi skasowanie rodo osobowe anonimizacja prywatnosc gdpr privacy',
        audyt: 'zmienial zmienil zmienia wczoraj audyt cofnac undo',
        czas: 'pozno wczesnie spoznilem spoznilam spozniony spoznilem termin terminu terminie terminy godzine godzinie godzin przeniesc przeniesiona przeniesiony dluzej dluzszy wydluz wydluzyc przedluz wczesnie pozno spoznilem spoznilam godzina okno window early late',
        duplikat: 'dwukrotnie podwojnie duplikat dwa razy twice double',
        pomoc: 'wytlumacz wyjasnij objasnij objasnic tlumaczyc nie wiem zagubilem gubie sie krok po kroku instrukcja poradnik pomoc pomocy help ratunku pogubilem pogubilam допомога',
        ranking: 'pozycje pozycja pozycje pozycji najlepszych najlepsi tabela klasyfikacja ranking miejsce miejsca top najlepsi',
        historia: 'wykaz zestawienie spis lista wpisy dniach dni dzien dniach wpisy zapisane przeszlosc kiedy bylem historia historii historie history історія',
        cyfry: 'cyfra cyfry cyfr klawiatura numpad',
        bezpieczenstwo: 'bezpieczenstwo bezpieczny bezpiecznie ochrona safe security',
        dziecko: 'dziecko dzieci maluch maly mlody kid child',
        wiekszy: 'wiekszy wieksza powieksz powiekszyc czcionka czcionke literki small zoom',
        rekolekcje: 'rekolekcje odpust chrzest uroczystosc wydarzenie inne specjalne nadzwyczajne',
        zapis: 'zapis zapisu zapisac zapisalem zapisana zapisane zapisany zapisywanie rejestracja rejestracji',
        cyfry2: 'cyfra cyfre cyfry cyfr cyfrze klawiatura klawiature numpad kropki',
        cudze: 'cudze cudzy cudza innego inny innej innych kolegi kolega kolezanki nazwisko nazwiska imie imienia obcy obca',
        naduzycie: 'psoci naduzywa naduzycie naduzywac wyglupia psuje zart zartuje psoty nieuczciwie',
        brak: 'brakuje brak brakowalo zniknela zniknal znikly zniknelo przepadla przepadl niewidoczna',
        rola: 'dostep uprawnienia uprawnien rola role rola nadac odebrac',
        reczne: 'reczny recznie recznego manualnie manual',
        wczytac: 'wczytac wczytaj import importuj odczytac skan zdjecie',
        kopia: 'zabezpieczenie zabezpieczyc zabezpieczenia dysk dysku plik pliku zapisac wszystko caly cala kopia zapasowa backup eksport export import'
    };
    const GRUPY_MAPA = {};
    Object.keys(GRUPY).forEach((g) => GRUPY[g].split(/\s+/).forEach((w) => { const r = rdzen(norm(w)); if (!r) return; (GRUPY_MAPA[r] = GRUPY_MAPA[r] || []); if (GRUPY_MAPA[r].indexOf(g) < 0) GRUPY_MAPA[r].push(g); }));

    const GRUPY_LISTY = {};
    Object.keys(GRUPY).forEach((g) => { GRUPY_LISTY[g] = GRUPY[g].split(/\s+/).map(norm).filter((w) => w.length >= 3); });

    // ------------------------------------------------------------------ HASH / LOSOWOŚĆ ----
    function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function lcg(seed) { let s = seed >>> 0; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

    // ------------------------------------------------------------------ JĘZYK / ANALIZA ZAPYTANIA ----
    const EN_SLOWA = new Set(['the', 'is', 'how', 'my', 'can', 'what', 'where', 'card', 'lost', 'forgot', 'add', 'help', 'why', 'does', 'not', 'work', 'working', 'points', 'attendance', 'please', 'i', 'do', 'to', 'a', 'it', 'when', 'who']);
    function wykryjJezyk(q, domyslny) {
        if (/[а-яіїєґ]/i.test(q)) return 'uk';
        const w = norm(q).split(' ').filter(Boolean); if (!w.length) return domyslny || 'pl';
        let en = 0; w.forEach((x) => { if (EN_SLOWA.has(x)) en++; });
        const pl = /[ąćęłńóśźż]/i.test(q);
        if (!pl && en >= 2 && en / w.length >= 0.3) return 'en';
        return domyslny || 'pl';
    }
    function analiza(q, domyslnyJezyk) {
        const n = norm(q);
        const tokeny = n.split(' ').filter(Boolean);
        const jezyk = wykryjJezyk(q, domyslnyJezyk);
        let rola = null;
        if (/\bjestem (ksiedzem|proboszczem|opiekunem|priestem)\b|jako ksiadz|as a priest|я священник/.test(n)) rola = 'ksiadz';
        else if (/\bjestem (adminem|administratorem)\b|jako admin|i am (the )?admin|я адмін/.test(n)) rola = 'admin';
        else if (/\bjestem (ministrantem|ministrantka|dzieckiem)\b|jako ministrant|i am an? (altar )?server|я служитель/.test(n)) rola = 'ministrant';
        let urzadzenie = null;
        if (/\b(telefon|telefonie|komorka|smartfon|iphone|android|phone|телефон)\b/.test(n)) urzadzenie = 'telefon';
        else if (/\b(tablet|kiosk|kiosku|zakrystii|планшет|кіоск)\b/.test(n)) urzadzenie = 'kiosk';
        else if (/\b(komputer|laptop|pc|computer)\b/.test(n)) urzadzenie = 'komputer';
        const pilnosc = (/!{2,}/.test(q) || /\b(pilne|szybko|natychmiast|ratunku|pomocy|urgent|asap|terminova)\b/.test(n)) ? 'wysoka' : 'normalna';
        const negacja = /\b(nie|nigdy|brak|bez|not|cant|cannot|не)\b/.test(n);
        const emocja = /\b(irytuj|wkurz|denerwuj|nie moge juz|zepsul|bez sensu|beznadziej|angry|annoyed)\b/.test(n) || /!{3,}/.test(q);
        return { n: n, tokeny: tokeny, jezyk: jezyk, rola: rola, urzadzenie: urzadzenie, pilnosc: pilnosc, negacja: negacja, emocja: emocja };
    }

    // ------------------------------------------------------------------ PYTANIA WZORCOWE (uczą sieć) ----
    // Krótkie, naturalne pytania — po 3–5 na temat. Reszta wiedzy pochodzi z tytułów, opisów i kroków tematów.
    const PYTANIA = {
        'l-cudzy-telefon': ['logowanie na cudzym telefonie', 'zalogowałem się na komputerze kolegi', 'czy wylogować się na wspólnym komputerze', 'signing in on a shared computer'],
        'l-jezyk': ['zmień język logowania', 'logowanie po angielsku', 'change the language on the login screen'],
        'l-kontakt': ['napisz do admina z logowania', 'nie mogę się zalogować chcę zgłosić problem'],
        'm-do-panelu': ['przejdź do panelu administracyjnego', 'jak wejść do panelu księdza', 'gdzie jest panel zarządzania'],
        'w-jezyk': ['zmień język panelu zarządzania', 'panel księdza po angielsku'],
        'k-obecnosc': ['jak dodać obecność', 'chcę zapisać obecność na mszy', 'jak się zapisać na kiosku', 'gdzie mam kliknąć żeby dostać punkty', 'how do I record my attendance', 'як записати присутність', 'przyłożyć kartę do czytnika co dalej', 'zeskanowałem kartę i co teraz', 'jak zaliczyć mszę na kiosku', 'dodaj mi obecność na dzisiaj'],
        'k-kamera': ['czytnik nie działa jak zeskanować kartę', 'skanowanie kartą kamerą', 'jak użyć aparatu zamiast czytnika', 'scan with camera instead of reader', 'сканувати камерою'],
        'k-specjalna': ['jak zapisać pogrzeb', 'obecność na ślubie', 'pogrzeb ślub inne zgłoszenie', 'funeral attendance', 'obecność poza mszą'],
        'k-zgubione': ['straciłem kartę', 'zgubiłem kartę', 'zapomniałem pinu', 'nie pamiętam kodu pin', 'mój kod jest zablokowany', 'lost my card', 'забув пін', 'nie mam karty co robić'],
        'k-wejscie-roli': ['jak wejść w tryb księdza na kiosku', 'tryb awaryjny kiosku', 'jestem księdzem chcę zalogować się na kiosku', 'tryb admina na tablecie'],
        'k-jezyk': ['zmień język na angielski', 'jak przełączyć język kiosku', 'change language', 'змінити мову'],
        'k-status': ['co oznacza kropka na górze', 'co to jest kolejka offline', 'kiosk nie ma internetu', 'pasek statusu kiosku'],
        'k-kontakt': ['jak napisać do administratora', 'zgłoś problem adminowi', 'contact the administrator'],
        'k-pierwszy-raz': ['pierwszy raz na kiosku', 'jak to wszystko działa', 'nie wiem co robić', 'first time here', 'я тут вперше', 'wytłumacz mi od początku'],
        'k-kolory': ['co znaczy czerwony napis', 'zielony komunikat co to', 'co oznaczają kolory na kiosku', 'what does the red message mean'],
        'k-za-wczesnie': ['dlaczego lista mszy jest pusta', 'nie widzę mojej mszy', 'lista mszy jest pusta', 'przyszedłem za późno', 'za wcześnie na zapis', 'kiedy mogę się zapisać', 'why is the Mass list empty'],
        'k-dwa-razy': ['zapisałem się dwa razy', 'obecność już zapisana', 'duplikat obecności', 'did I register twice'],
        'k-punkty': ['ile dostanę punktów za mszę', 'ile punktów za nabożeństwo', 'jak liczone są punkty na kiosku', 'how many points do I get'],
        'k-nie-reaguje': ['kiosk się zawiesił', 'czytnik nic nie robi', 'tablet nie reaguje', 'kiosk nie działa', 'the kiosk is frozen', 'не працює кіоск'],
        'k-zly-pin': ['wpisałem zły pin', 'pomyliłem się przy pinie', 'jak poprawić cyfrę w pinie', 'wrong pin entered'],
        'k-cudze-imie': ['pokazało się cudze imię', 'to nie moje imię na ekranie', 'zeskanowałem cudzą kartę', 'someone else name on screen'],
        'k-karta-uszkodzona': ['kod qr na karcie jest wytarty', 'karta się nie skanuje', 'kod qr jest zniszczony', 'karta jest pognieciona', 'card does not scan'],
        'k-prywatnosc': ['czy ktoś zobaczy mój pin', 'kto widzi mój pin', 'czy kiosk pokazuje moje dane', 'czy to bezpieczne', 'is my data safe at the kiosk'],
        'l-logowanie': ['jak się zalogować', 'gdzie wpisać kod i pin', 'logowanie do panelu', 'how do I sign in', 'як увійти'],
        'l-zapomnialem': ['zapomniałem pin do panelu', 'kod zablokowany przy logowaniu', 'nie mogę wejść bo zapomniałem hasła'],
        'l-pierwsze': ['skąd wziąć kod i pin', 'pierwsze logowanie', 'nie dostałem pinu', 'where do I get my code'],
        'l-nie-dziala': ['nie mogę się zalogować', 'logowanie nie działa', 'pin nie pasuje', 'cannot sign in'],
        'l-instalacja': ['jak zainstalować aplikację na telefonie', 'ikona na ekranie telefonu', 'install the app on my phone', 'додати на головний екран'],
        'm-punkty': ['ile mam punktów', 'sprawdź moje punkty', 'gdzie zobaczę swoje punkty', 'how many points do I have', 'мої бали'],
        'm-historia': ['w jakich dniach byłem', 'historia moich obecności', 'na których mszach byłem', 'pokaż moje obecności w miesiącu', 'my attendance history'],
        'm-kalendarz': ['kiedy są msze', 'kalendarz wydarzeń', 'terminarz mszy', 'when is the next Mass'],
        'm-ranking': ['ranking ministrantów', 'na którym jestem miejscu', 'porównanie z poprzednim miesiącem', 'my ranking position'],
        'm-pin': ['jak zmienić pin', 'zmiana mojego pinu', 'chcę nowy pin', 'change my pin', 'змінити пін'],
        'm-jak-obecnosc': ['jak zapisać obecność w panelu', 'gdzie dodać obecność', 'czy mogę zapisać obecność z telefonu'],
        'm-jezyk': ['zmień język panelu', 'panel po angielsku', 'switch language'],
        'm-kontakt': ['napisz do admina', 'zgłoszenie błędu', 'chcę zgłosić problem'],
        'm-zasady': ['jak są liczone punkty', 'za co są punkty', 'zasady punktacji', 'how are points counted'],
        'm-blad': ['brakuje obecności z niedzieli', 'brakuje mi punktów', 'nie ma mojej obecności', 'błąd w moich punktach', 'my attendance is missing'],
        'm-asystent': ['zapytaj asystenta', 'czy jest jakiś robot do pytań'],
        'm-instalacja': ['aplikacja na telefon', 'jak dodać do ekranu głównego'],
        'm-bezpieczenstwo-pin': ['jak chronić pin', 'czy mogę pożyczyć kartę koledze', 'komu mogę powiedzieć pin'],
        'm-nowy-miesiac': ['dlaczego punkty zaczęły się od zera', 'nowy miesiąc zerowanie punktów', 'gdzie się podziały moje punkty'],
        'm-strona-nie-laduje': ['strona się nie ładuje', 'panel nie otwiera się na telefonie', 'biała strona', 'page does not load'],
        'm-wyloguj': ['jak się wylogować', 'wyloguj mnie', 'sign out'],
        'p-wydarzenie': ['chcę dodać nową mszę na niedzielę', 'jak dodać mszę do kalendarza', 'dodaj nowe wydarzenie', 'utworzyć nabożeństwo', 'add a new event', 'jak zaplanować mszę'],
        'p-edytuj-wydarzenie': ['zmień godzinę mszy', 'usuń wydarzenie z kalendarza', 'edytuj mszę', 'msza przesunięta'],
        'p-zgloszenia': ['zatwierdź pogrzeb', 'jak przyznać punkty za ślub', 'zgłoszenia oczekujące', 'approve funeral request', 'odrzucić zgłoszenie'],
        'p-reczna': ['dodaj obecność ręcznie', 'ministrant zapomniał się zapisać', 'ręczny zapis obecności', 'manual attendance'],
        'p-ministrant': ['jak dodać nowego ministranta', 'założyć konto ministrantowi', 'nowy ministrant kod pin', 'add a new altar server'],
        'p-edytuj-ministranta': ['zmień pin ministrantowi', 'wyłącz konto ministranta', 'dezaktywuj ministranta', 'ministrant odszedł'],
        'p-plakietka': ['wygeneruj nową kartę', 'unieważnij zgubioną plakietkę', 'ministrant zgubił kartę', 'nowa plakietka'],
        'p-karty': ['wydrukuj karty qr', 'jak wydrukować wizytówki', 'generator kart pdf', 'print QR cards'],
        'p-listy': ['lista papierowa', 'kiosk nie działał wczytaj listę', 'zdjęcie listy obecności', 'wydrukuj pustą listę'],
        'p-obecnosci': ['kto był na mszy', 'obecności w miesiącu', 'pełna historia obecności', 'who attended'],
        'p-punkty-popraw': ['popraw punkty', 'usuń błędną obecność', 'ktoś dostał złe punkty', 'edytuj obecność'],
        'p-frekwencja': ['raport frekwencji', 'pobierz frekwencję pdf', 'jaka była frekwencja', 'attendance report'],
        'p-odblokuj': ['odblokuj kod ministranta', 'ministrant jest zablokowany', 'zablokowane kody', 'unlock a code'],
        'p-przed-msza': ['co sprawdzić przed mszą', 'lista kontrolna rano', 'przygotowanie do mszy'],
        'p-po-mszy': ['co zrobić po zakończeniu mszy', 'co zrobić po mszy', 'lista kontrolna po mszy', 'zamknięcie dnia'],
        'p-okno-rejestracji': ['zmień okno rejestracji', 'ministranci nie mogą się zapisać za wcześnie', 'wydłuż czas zapisu na mszę', 'registration window'],
        'p-blok-polaczony': ['msza połączona z nabożeństwem', 'nabożeństwo plus msza razem', 'blok połączony'],
        'p-tydzien': ['jak dodać kilka mszy naraz', 'zaplanuj cały tydzień', 'wiele wydarzeń w jednym tygodniu'],
        'w-kontakt': ['napisz do administratora', 'kontakt z adminem'],
        'w-do-ministranta': ['przejdź do panelu ministranta', 'chcę zobaczyć własne punkty jako ksiądz'],
        'w-wyloguj': ['wyloguj mnie z panelu', 'wylogowanie'],
        'a-dashboard': ['co wymaga uwagi', 'dashboard przegląd', 'szybki przegląd systemu', 'overview of the system'],
        'a-raport': ['raport dnia', 'co się wydarzyło dzisiaj', 'podsumowanie dnia'],
        'a-akceptacje': ['akceptacje 36 godzin', 'stare wpisy z kolejki', 'zaakceptuj spóźnione obecności'],
        'a-wiadomosci': ['wiadomości od użytkowników', 'zgłoszenia z przycisku kontakt', 'skrzynka admina'],
        'a-kioski': ['stan kiosków', 'czy kiosk jest online', 'monitoring tabletów', 'kiosk status for admin'],
        'a-baza': ['podgląd bazy danych', 'edycja użytkowników w bazie', 'tabela użytkowników'],
        'a-statystyki': ['statystyki za kilka miesięcy', 'wykres obecności', 'trend frekwencji'],
        'a-ustawienia': ['ustawienia systemu', 'zmień zasady punktów', 'konfiguracja'],
        'a-audyt': ['kto zmienił dane', 'historia zmian', 'audyt systemu', 'who changed this'],
        'a-narzedzia': ['samotest bazy', 'spójność punktów', 'narzędzia administratora'],
        'a-rodo': ['anonimizacja danych', 'eksport danych osoby', 'rodo usuń dane', 'gdpr export'],
        'a-raport-mies': ['raport miesięczny pdf', 'wygeneruj raport miesiąca', 'monthly report'],
        'a-konto-ksiedza': ['nadać księdzu uprawnienia', 'nadaj rolę księdza', 'jak zrobić kogoś księdzem w systemie', 'odbierz uprawnienia księdza', 'grant priest role'],
        'a-cofnij-zmiane': ['cofnij zmianę z audytu', 'przywróć poprzedni stan', 'napraw pomyłkę', 'undo a change'],
        'a-blokada-kiosku': ['zablokuj kiosk', 'ktoś nadużywa kiosku', 'awaryjna blokada tabletu', 'lock the kiosk'],
        'a-nowy-miesiac': ['koniec miesiąca co zrobić', 'podsumowanie miesiąca', 'zamknięcie miesiąca'],
        'a-kopia-zapasowa': ['kopia zapasowa bazy', 'jak zrobić backup', 'eksport całej bazy', 'database backup'],
        'a-diagnostyka-kiosku': ['kiosk nie działa jako admin', 'diagnostyka kiosku', 'tablet nie wysyła obecności', 'kiosk offline od rana'],
        'a-ustawienia-okno': ['zmień domyślne okno zapisu', 'ile minut przed mszą można się zapisać', 'domyślne okno rejestracji'],
        'a-odpowiedz-wiadomosc': ['jak odpowiedzieć na wiadomość', 'obsłuż wiadomość od ministranta', 'zmień status wiadomości'],
        'e-przeglad': ['co mogę zrobić w trybie awaryjnym', 'przegląd panelu awaryjnego'],
        'e-reczna': ['zapisz obecność ręcznie na kiosku', 'wpisz kod ministranta ręcznie', 'ministrant zgubił kartę zapisz mu obecność'],
        'e-cofnij': ['cofnij ostatnią obecność', 'pomyłka na kiosku', 'wycofaj wpis'],
        'e-odblokuj': ['odblokuj kod na kiosku', 'zablokowany kod ministranta'],
        'e-offline': ['tryb offline kiosku', 'pobierz dane offline', 'synchronizuj kolejkę'],
        'e-czysc': ['wyczyść kolejkę', 'usuń zakończone wpisy', 'przedłuż przeterminowane'],
        'e-wyjdz': ['wyloguj z trybu awaryjnego', 'zamknij panel awaryjny'],
        's-wybor': ['którą opcję wybrać', 'panel czy kiosk', 'co kliknąć na stronie startowej'],
        's-kim-jestem': ['jestem księdzem co wybrać', 'jestem ministrantem gdzie się logować', 'gdzie loguje się admin'],
        's-instalacja': ['zainstaluj aplikację', 'ikona na telefonie']
    };


    // ------------------------------------------------------------------ PYTANIA WZORCOWE — CZĘŚĆ 2 (v2.15.12) ----
    // Więcej sformułowań na temat: potoczne, skrótowe, z literówkami typowymi dla telefonu, wersje EN/UK dla kiosku i panelu ministranta.
    const PYTANIA_2 = {
        's-wybor': ['co mam kliknąć na samym początku', 'panel czy kiosk co wybrać', 'dwa przyciski na stronie startowej który mój', 'gdzie mam wejść żeby zobaczyć swoje punkty', 'która opcja jest dla ministranta', 'po co jest tryb kiosk', 'otworzyłem stronę i nie wiem co dalej', 'which button should I tap on the first page'],
        's-kim-jestem': ['gdzie loguje się proboszcz', 'czy ksiądz wchodzi w panel czy w kiosk', 'jestem opiekunem gdzie mam się zalogować', 'administrator którą opcję wybiera', 'czy ministrant i ksiądz logują się tak samo', 'mam konto księdza co wybrać na początku', 'gdzie wchodzą dorośli opiekunowie', 'I am the priest where do I sign in'],
        's-instalacja': ['jak mieć stronę jako aplikację', 'dodać do ekranu głównego telefonu', 'ikonka na pulpicie telefonu', 'zainstalować ministrantów na komórce', 'czy da się szybciej wchodzić na stronę', 'skrót do strony na androidzie', 'dodaj do ekranu początkowego w safari', 'strona jak aplikacja w telefonie'],
        'l-logowanie': ['gdzie wpisać kod i pin żeby wejść', 'jak wejść na swoje konto', 'logowanie do panelu ministranta', 'co wpisać w polu kod', 'wchodzę do systemu i nie wiem od czego zacząć', 'jak się zalogować na telefonie', 'zalogować się swoim kodem z karty', 'jak wejść do panelu księdza', 'ekran logowania co tu wpisać', 'how to sign in with my code', 'де вводити код і пін'],
        'l-zapomnialem': ['nie pamiętam pinu do logowania', 'wyleciał mi z głowy kod dostępu', 'kod mi się zablokował bo wpisałem źle', 'system mnie zablokował po kilku próbach', 'jak odzyskać dostęp do konta', 'kto ustawi mi nowy pin', 'pin przepadł', 'nie mogę wejść bo nie znam pinu', 'zablokowane konto ministranta', 'I forgot my sign in PIN', 'не пам’ятаю пін'],
        'l-pierwsze': ['dostałem kartę a nie wiem jak zacząć', 'jaki pin mam na początku', 'od kogo dostanę pin', 'gdzie jest mój kod konta', 'mam nowe konto i nie wiem co wpisać', 'pierwszy raz loguję się do systemu', 'czy kod to to samo co numer na karcie', 'startowy pin od księdza'],
        'l-nie-dziala': ['logowanie nie przechodzi', 'system pisze że zły pin a jestem pewien', 'nie wpuszcza mnie do panelu', 'wpisuję dobre dane i nic', 'błąd przy logowaniu', 'przycisk zaloguj nie działa', 'dlaczego nie mogę wejść do systemu', 'sign in fails every time', 'вхід не працює'],
        'l-instalacja': ['zrobić z tej strony aplikację', 'ikona na ekranie głównym iphone', 'jak dodać skrót na androidzie', 'żeby nie wpisywać adresu za każdym razem', 'przypiąć stronę do telefonu', 'zainstaluj aplikację w chrome', 'dodać do ekranu początkowego w safari', 'add this site to my home screen'],
        'l-cudzy-telefon': ['loguję się na telefonie mamy', 'komputer w szkole a chcę sprawdzić punkty', 'czy bezpiecznie logować się u kolegi', 'jak się wylogować żeby nikt nie zobaczył', 'przeglądarka pyta czy zapamiętać hasło', 'zalogowałem się na cudzym laptopie', 'wspólny komputer w salce', 'using a shared computer'],
        'l-jezyk': ['przełącz język na ekranie logowania', 'ekran logowania po ukraińsku', 'angielska wersja logowania', 'chcę żeby było po polsku', 'gdzie zmienić język przed zalogowaniem', 'zmiana języka z poziomu logowania'],
        'l-kontakt': ['napisać do administratora z ekranu logowania', 'kogo poprosić o pomoc z kontem', 'nie mogę wejść a chcę zgłosić problem', 'przycisk kontakt na logowaniu', 'jak skontaktować się z administratorem gdy nie mogę się zalogować'],
        'k-pierwszy-raz': ['nigdy nie używałem tego kiosku', 'jak działa ten tablet w zakrystii', 'wytłumacz mi po kolei jak się zapisać', 'jestem nowym ministrantem co mam robić', 'pierwszy dzień służby jak się zapisuję', 'jak to w ogóle działa', 'co trzeba mieć żeby zapisać obecność', 'objaśnij mi obsługę tabletu', 'I am new here how does the kiosk work', 'я новенький як це працює'],
        'k-obecnosc': ['jak się zapisać na mszę', 'odbić się na kiosku', 'zaliczyć dzisiejszą mszę', 'co robić po przyłożeniu karty', 'jak wpisać że byłem na mszy', 'gdzie dotknąć żeby dostać punkt', 'zapisanie obecności krok po kroku', 'kiosk poprosił o pin co dalej', 'jak zarejestrować służbę przy ołtarzu', 'moja obecność na dzisiejszej mszy', 'chcę żeby mi zaliczyło że służyłem', 'klepnąć obecność', 'jak zameldować się na mszy', 'where do I tap to record I served', 'як зарахувати присутність на Месі', 'як відмітитися на кіоску'],
        'k-kamera': ['użyć aparatu w tablecie do karty', 'czytnik nie chce przyjąć karty a mam kamerę', 'zeskanować kod qr kamerą', 'jak włączyć kamerkę do skanowania', 'czytnik jest zepsuty co zamiast niego', 'pokazać kartę do kamery tabletu', 'skaner nie działa a karta jest dobra', 'jak zmienić kamerę na tylną', 'przycisk skanuj kamerą', 'camera instead of the card reader', 'сканувати картку камерою планшета'],
        'k-specjalna': ['jak zgłosić służbę na pogrzebie', 'obecność na ślubie jak wpisać', 'rekolekcje albo odpust jak zapisać punkty', 'chrzest w niedzielę a nie ma go na liście', 'msza specjalna poza kalendarzem', 'zapisać obecność na uroczystości rodzinnej', 'pogrzeb sąsiada służyłem', 'inne wydarzenie niż msza', 'kto przyzna punkty za pogrzeb', 'I served at a funeral how do I record it', 'я служив на похороні'],
        'k-zgubione': ['nie mam karty przy sobie', 'zostawiłem plakietkę w domu', 'karta przepadła', 'zapomniałem pinu do kiosku', 'kod się zablokował na kiosku', 'bez karty nie mogę się zapisać co robić', 'kto zapisze mnie jak zgubiłem kartę', 'nie pamiętam czterech cyfr', 'zablokowana karta po błędnych pinach', 'I lost my card and PIN what now', 'у мене немає картки', 'забув код на кіоску'],
        'k-wejscie-roli': ['jak ksiądz wchodzi w tryb awaryjny na kiosku', 'logowanie administratora na tablecie', 'panel awaryjny kiosku jak otworzyć', 'jestem proboszczem chcę zapisać kogoś ręcznie na kiosku', 'przycisk zaloguj się jako ksiądz', 'gdzie jest tryb admina na kiosku', 'wejść w panel ręcznego zapisu', 'priest mode on the kiosk'],
        'k-jezyk': ['zmienić język na kiosku', 'kiosk po angielsku', 'przełącz na ukraiński', 'gdzie są przyciski pl en ua', 'switch the kiosk language', 'English version please', 'змінити мову кіоска', 'chcę po polsku', 'ukraiński interfejs'],
        'k-status': ['co oznacza kolorowa kropka u góry', 'kiosk bez internetu czy zapisze', 'czym jest kolejka na kiosku', 'pasek statusu zrobił się czerwony', 'ile wpisów czeka na wysłanie', 'synchronizacja na kiosku', 'kiosk pokazuje offline', 'what does the status bar mean', 'що означає смужка статусу'],
        'k-kolory': ['czerwony napis na ekranie', 'zielony komunikat co znaczy', 'co oznacza błąd na kiosku', 'dlaczego wyświetliło się na czerwono', 'jak rozumieć komunikaty kiosku', 'wynik zapisu co mówią kolory', 'czy zielony znaczy że już po wszystkim', 'what do the green and red messages mean', 'що означає червоний напис'],
        'k-za-wczesnie': ['nie ma mszy na liście wyboru', 'lista wydarzeń na kiosku jest pusta', 'zbyt wcześnie na zapis', 'spóźniłem się i nie mogę się zapisać', 'kiedy otwiera się zapis na mszę', 'msza nie wyświetla się do wyboru', 'ile minut przed mszą mogę się odbić', 'okno zapisu już zamknięte', 'no Mass on the list', 'немає Меси у списку', 'зарано записуватись'],
        'k-dwa-razy': ['obecność została już zapisana', 'czy dwa razy mi zaliczy', 'wyskoczyło że mam wpis', 'zapisałem się podwójnie', 'komunikat o duplikacie', 'przypadkiem kliknąłem drugi raz', 'czy punkty się podwoją', 'it says I am already registered', 'вже записано двічі'],
        'k-punkty': ['ile punktów za mszę w tygodniu', 'ile za niedzielną mszę', 'ile oczek dostanę za służbę', 'czy nabożeństwo ma dodatkowy punkt', 'punktacja za msze', 'ile punktów za roraty', 'jak policzone są punkty na kiosku', 'how many points for Sunday Mass', 'скільки балів за Месу'],
        'k-nie-reaguje': ['tablet nie reaguje na dotyk', 'kiosk zamarł', 'ekran się zawiesił', 'czytnik nie pika', 'nic się nie dzieje po przyłożeniu karty', 'tablet jest zablokowany', 'kiosk muli i laguje', 'strona na tablecie nie odpowiada', 'the kiosk screen is frozen', 'кіоск завис'],
        'k-zly-pin': ['źle wpisałem pin', 'pomyliłem cyfry kodu', 'jak skasować cyfrę w pinie', 'wprowadziłem zły numer', 'czy mogę poprawić pin przed zatwierdzeniem', 'co jak się pomylę w kodzie', 'ile razy mogę się pomylić', 'I typed the wrong digit', 'ввів не ту цифру'],
        'k-cudze-imie': ['ekran pokazuje imię kolegi', 'to nie moja karta', 'wyskoczyło nazwisko innej osoby', 'wziąłem cudzą kartę przez pomyłkę', 'jak zacząć od nowa po błędnej karcie', 'przycisk to nie ja', 'kiosk rozpoznał kogoś innego', 'wrong name on the screen', 'на екрані чуже прізвище'],
        'k-karta-uszkodzona': ['karta jest pognieciona', 'kod qr się wytarł', 'plakietka mokra i nie czyta', 'czytnik nie skanuje zniszczonej karty', 'zabrudzony kod na karcie', 'karta porwana', 'nieczytelny kod', 'kod na karcie wyblakł', 'the QR code is damaged', 'картка пошкоджена'],
        'k-prywatnosc': ['czy mój pin jest bezpieczny', 'kto może zobaczyć moje punkty', 'czy ktoś podejrzy kod na kiosku', 'czy dane są chronione', 'czy mogę pożyczyć kartę koledze', 'co kiosk pokazuje o mnie', 'is my PIN safe at the kiosk', 'чи безпечні мої дані'],
        'k-kontakt': ['napisać do admina z kiosku', 'zgłosić błąd z tabletu', 'przycisk kontakt na kiosku', 'jak powiadomić administratora o awarii', 'report a problem from the kiosk', 'написати адміністратору з кіоска'],
        'e-przeglad': ['co potrafi tryb awaryjny', 'jakie opcje ma panel księdza na kiosku', 'do czego służy tryb admina na tablecie', 'przegląd funkcji awaryjnych', 'co mogę zrobić na kiosku jako ksiądz'],
        'e-reczna': ['wpisać obecność ministrantowi na kiosku', 'ręczny zapis na tablecie', 'zapisać kogoś kto nie ma karty', 'dopisać obecność po kodzie', 'zapisz chłopaka po jego kodzie', 'ręcznie zaliczyć mszę z kiosku', 'wpisz kod ministranta i zapisz', 'record attendance manually on the kiosk'],
        'e-cofnij': ['wycofać obecność zapisaną przez pomyłkę', 'cofnąć ostatni wpis na tablecie', 'usunąć błędną obecność z kiosku', 'ostatnie obecności i cofanie', 'pomyłka przy ręcznym zapisie', 'undo the last attendance on the kiosk'],
        'e-wyjdz': ['jak wyjść z trybu awaryjnego', 'wylogować się z panelu na kiosku', 'zamknąć panel księdza na tablecie', 'powrót do ekranu skanowania', 'przycisk wyloguj w trybie awaryjnym'],
        'e-odblokuj': ['uwolnić zablokowany kod z kiosku', 'odblokować kartę ministranta na tablecie', 'zdjąć blokadę z kodu', 'ministrant zablokowany po błędnych pinach', 'odblokowanie kodu w trybie admina', 'unlock a code on the kiosk'],
        'e-offline': ['pobrać dane na tryb bez internetu', 'synchronizuj kolejkę teraz', 'kiosk offline co zrobić', 'dane offline do kiosku', 'wysłać zaległe wpisy', 'sync the offline queue'],
        'e-czysc': ['posprzątać kolejkę offline', 'usunąć zakończone wpisy z kolejki', 'przedłużyć stare wpisy o dobę', 'wyczyścić zablokowane wpisy', 'kolejka jest pełna starych rzeczy'],
        'm-punkty': ['ile mam punktów', 'mój wynik w tym miesiącu', 'ile oczek zebrałem', 'gdzie zobaczyć punkty', 'sprawdzić stan punktów', 'czy mam już dużo punktów', 'suma punktów za miesiąc', 'how many points do I have this month', 'скільки в мене балів цього місяця'],
        'm-historia': ['kiedy byłem na mszach', 'lista moich służb', 'pokaż obecności z zeszłego miesiąca', 'w które dni zapisała się obecność', 'moje wpisy z października', 'historia mszy na których służyłem', 'przejrzeć swoje obecności', 'show my past attendance', 'історія моєї присутності'],
        'm-kalendarz': ['kiedy najbliższa msza', 'jaki jest plan mszy', 'terminy nabożeństw', 'rozpiska wydarzeń w parafii', 'gdzie sprawdzę godziny mszy', 'what Masses are coming up', 'коли наступна Меса'],
        'm-ranking': ['kto ma najwięcej punktów', 'na którym jestem miejscu', 'czy jestem w czołówce', 'porównaj mnie z innymi', 'ranking miesiąca', 'czy mam więcej niż w zeszłym miesiącu', 'tabela najlepszych ministrantów', 'where am I in the ranking', 'моє місце в рейтингу'],
        'm-pin': ['zmienić pin w panelu', 'chcę nowy kod', 'jak ustawić własny pin', 'nowy pin zamiast starego', 'zmiana kodu dostępu', 'inny numer pin', 'how do I set a new PIN', 'як змінити пін'],
        'm-jak-obecnosc': ['czy w panelu mogę zapisać obecność', 'gdzie się zapisuje obecność', 'czy obecność zapisuje się z telefonu', 'dlaczego nie ma przycisku zapisz obecność', 'gdzie dodać wpis o mszy', 'can I record attendance in the panel'],
        'm-zasady': ['za co są punkty', 'jak są przyznawane punkty', 'ile warte jest nabożeństwo', 'zasady liczenia punktów w miesiącu', 'co daje więcej punktów', 'punkty za pogrzeb', 'how do points work', 'як нараховуються бали'],
        'm-blad': ['nie widzę swojej obecności', 'brakuje wpisu z mszy', 'punkty się nie zgadzają', 'miałem służyć a nie ma punktów', 'zapis z kiosku nie dotarł', 'liczba punktów jest za mała', 'mój wpis zniknął', 'my attendance is not showing', 'бракує мого запису'],
        'm-asystent': ['czy jest czat z pomocą', 'zapytać robota o pomoc', 'asystent w panelu', 'gdzie jest przycisk z robotem', 'ask the assistant'],
        'm-instalacja': ['aplikacja ministranta na telefon', 'dodać panel do ekranu głównego', 'skrót do panelu na komórce', 'zainstalować panel jak aplikację'],
        'm-bezpieczenstwo-pin': ['jak zadbać o bezpieczeństwo pinu', 'czy mogę podać pin koledze', 'czy pożyczać kartę', 'ktoś zna mój pin co robić', 'zasady bezpiecznego korzystania z karty', 'keep my PIN safe', 'як захистити пін'],
        'm-nowy-miesiac': ['wszystkie punkty zeszły do zera', 'czy punkty przepadają po miesiącu', 'zero na liczniku po zmianie miesiąca', 'gdzie są moje punkty z poprzedniego miesiąca', 'resetowanie punktów w nowym miesiącu', 'why did my points reset', 'чому бали обнулилися'],
        'm-strona-nie-laduje': ['panel się nie otwiera', 'biała strona po wejściu', 'strona się wiesza na telefonie', 'nie ładuje się panel ministranta', 'ekran ładowania bez końca', 'brak internetu w panelu', 'the page will not load', 'сторінка не відкривається'],
        'm-jezyk': ['zmienić język w panelu', 'panel po ukraińsku', 'przełącznik pl en ua w panelu', 'chcę angielską wersję panelu', 'change the panel language'],
        'm-kontakt': ['napisać wiadomość do admina', 'zgłosić uwagę do panelu', 'przycisk kontakt w panelu', 'jak wysłać wiadomość z zrzutem ekranu', 'contact the admin from the panel'],
        'm-do-panelu': ['przejść do widoku księdza', 'gdzie jest panel administracyjny', 'przycisk panelu zarządzania', 'jak wejść w panel zarządzania jako ksiądz', 'switch to the admin panel'],
        'm-wyloguj': ['wylogować się z panelu', 'zakończyć sesję', 'jak wyjść z konta', 'przycisk wyloguj', 'sign out of the panel', 'вийти з акаунта'],
        'p-przed-msza': ['przygotowanie do dzisiejszej mszy', 'co sprawdzić rano w systemie', 'lista rzeczy przed rozpoczęciem mszy', 'czy kiosk jest gotowy na mszę', 'poranne sprawdzenie systemu', 'checklist before Mass'],
        'p-po-mszy': ['co zrobić na koniec dnia w systemie', 'po zakończeniu mszy zamknięcie', 'czy są zgłoszenia do rozpatrzenia po mszy', 'ktoś zapomniał się zapisać po mszy', 'wieczorna lista kontrolna', 'checklist after Mass'],
        'p-wydarzenie': ['dodać mszę do kalendarza', 'nowa msza w grafiku', 'stworzyć nabożeństwo na piątek', 'wpisać wydarzenie z godziną', 'utworzyć zbiórkę ministrantów', 'jak zaplanować mszę na święta', 'dodawanie wydarzenia krok po kroku', 'add a new Mass to the calendar', 'додати Месу до календаря'],
        'p-edytuj-wydarzenie': ['zmienić godzinę mszy', 'przesunąć wydarzenie na inny termin', 'usunąć mszę z kalendarza', 'poprawić nazwę wydarzenia', 'odwołana msza usuń', 'edycja wpisu w kalendarzu', 'change the time of a Mass'],
        'p-okno-rejestracji': ['zmienić czas zapisu na jedną mszę', 'dłuższe okno rejestracji', 'ile minut po mszy można się zapisać', 'wcześniejszy zapis na uroczystość', 'okno zapisu dla pojedynczego wydarzenia', 'ministranci spóźnieni nie mogą się zapisać chcę wydłużyć', 'extend the registration window'],
        'p-blok-polaczony': ['nabożeństwo i msza jedno po drugim', 'połączyć dwa wydarzenia', 'wybór nabożeństwo czy msza na kiosku', 'blok nabożeństwa z mszą', 'jak ustawić dwa wydarzenia razem', 'combine a service and a Mass'],
        'p-tydzien': ['dodać wiele mszy naraz', 'zaplanować cały tydzień mszy', 'seria wydarzeń w kalendarzu', 'szybkie dodawanie kilku terminów', 'harmonogram na kolejne dni'],
        'p-zgloszenia': ['zatwierdzić pogrzeb ministranta', 'przyznać punkty za ślub', 'oczekujące zgłoszenia specjalne', 'odrzucić zgłoszenie', 'zgłoszenia z kiosku do akceptacji', 'ile punktów dać za pogrzeb', 'rozpatrzyć wniosek o punkty', 'approve a funeral request'],
        'p-reczna': ['dopisać obecność ręcznie', 'ministrant zapomniał odbić kartę', 'zaliczyć obecność bez kiosku', 'ręczny wpis obecności w panelu', 'dodać obecność z opóźnieniem', 'uzupełnić brakującą obecność', 'manually add attendance'],
        'p-ministrant': ['założyć konto nowemu ministrantowi', 'dodać chłopca do systemu', 'nowy ministrant imię nazwisko kod', 'zarejestrować kolejnego ministranta', 'utworzyć konto dla lektora', 'jak dać pin nowemu ministrantowi', 'create a new altar server account'],
        'p-edytuj-ministranta': ['zmienić pin ministrantowi', 'ustawić nowy pin dla chłopca', 'wyłączyć konto ministranta który odszedł', 'edytować imię w koncie', 'przywrócić dezaktywowane konto', 'poprawić dane ministranta', 'reset pin for a server'],
        'p-plakietka': ['wygenerować nową plakietkę', 'unieważnić zgubioną kartę', 'ministrant zgubił plakietkę wydać nową', 'dezaktywować starą kartę', 'ile plakietek może mieć konto', 'nowa karta dla ministranta', 'issue a new badge'],
        'p-karty': ['wydrukować wizytówki z kodami qr', 'przygotować karty dla ministrantów', 'pdf z kartami do wycięcia', 'generator kart', 'drukowanie plakietek hurtem', 'print the QR cards'],
        'p-listy': ['wydrukować pustą listę obecności', 'zaimportować listę z papieru', 'zdjęcie listy z podpisami', 'kiosk padł a mamy kartkę', 'wczytać obecności ze skanu', 'odczytać listę ze zdjęcia', 'upload a paper attendance list'],
        'p-obecnosci': ['przejrzeć obecności z miesiąca', 'kto był na której mszy', 'tabela wszystkich obecności', 'historia obecności wszystkich ministrantów', 'wszystkie wpisy z listopada', 'attendance table for the month'],
        'p-punkty-popraw': ['poprawić punkty ministrantowi', 'usunąć omyłkowy wpis', 'zmienić liczbę punktów za obecność', 'ktoś dostał za dużo punktów', 'błędna obecność do skasowania', 'edit points for an attendance'],
        'p-frekwencja': ['pobierz zestawienie frekwencji', 'frekwencja z miesiąca w pdf', 'raport obecności csv', 'kto ile razy służył', 'podsumowanie frekwencji za miesiąc', 'attendance report to PDF'],
        'p-odblokuj': ['ministrant zablokował kod', 'odblokować konto po błędnych pinach', 'zablokowane kody w systemie', 'zdjąć blokadę z kodu', 'uwolnić zablokowanego ministranta', 'unlock a locked code'],
        'w-jezyk': ['zmienić język panelu księdza', 'panel zarządzania po angielsku', 'przełączyć na ukraiński w panelu admina', 'language switch in the admin panel'],
        'w-kontakt': ['napisać do administratora z panelu', 'zgłosić problem z poziomu panelu księdza', 'przycisk kontakt w panelu zarządzania', 'contact the administrator'],
        'w-do-ministranta': ['zobaczyć swoje punkty jako ksiądz', 'przejść do panelu ministranta z panelu zarządzania', 'mam własne konto ministranta', 'switch to my altar server view'],
        'w-wyloguj': ['wylogować się z panelu zarządzania', 'zakończyć pracę w panelu', 'jak się wylogować jako admin', 'sign out as admin'],
        'a-dashboard': ['co dziś wymaga uwagi administratora', 'przegląd systemu na dziś', 'liczniki i alerty', 'szybki rzut oka na wszystko', 'najważniejsze liczby w systemie', 'ranking pięciu najlepszych', 'overview of what needs attention'],
        'a-raport': ['podsumowanie jednego dnia', 'raport dzienny z alertami', 'co się działo wczoraj w systemie', 'oznaczyć sprawy jako przejrzane', 'wszystko z wybranego dnia', 'daily report'],
        'a-akceptacje': ['stare wpisy z kolejki do zaakceptowania', 'akceptacja spóźnionych obecności', 'wpisy starsze niż 36 godzin', 'dlaczego wpis czeka na admina', 'zaakceptować wszystkie zaległe', 'approve late queued entries'],
        'a-wiadomosci': ['skrzynka z wiadomościami od ministrantów', 'przeczytać zgłoszenia z przycisku kontakt', 'zrzuty ekranu od użytkowników', 'zmienić status wiadomości', 'inbox of user messages'],
        'a-kioski': ['czy kiosk jest online', 'ostatni ping kiosku', 'stan wszystkich tabletów', 'wersja aplikacji na kiosku', 'wysłać polecenie do kiosku', 'monitor the kiosks'],
        'a-baza': ['podgląd tabeli użytkowników', 'przeglądać bazę danych', 'poprawić dane użytkownika w bazie', 'wyszukać wpis w bazie', 'zobaczyć plakietki i logowania', 'browse the database'],
        'a-statystyki': ['wykres obecności z kilku miesięcy', 'trend frekwencji', 'statystyki zaawansowane', 'podział obecności według typu', 'pobrać statystyki do csv', 'statistics for several months'],
        'a-ustawienia': ['zmienić ustawienia systemu', 'konfiguracja zasad punktów', 'edytować parametry systemu', 'ustawienia retencji i okien', 'system settings'],
        'a-audyt': ['historia wszystkich zmian', 'kto co zmienił w systemie', 'szukać w audycie po kodzie', 'log zmian', 'cofnięcie zmiany z audytu', 'audit log'],
        'a-narzedzia': ['samotest bazy danych', 'sprawdzić spójność punktów', 'narzędzia naprawcze administratora', 'awaryjna blokada kiosku w narzędziach', 'eksport i import bazy', 'admin tools'],
        'a-rodo': ['wymazać dane osobowe jednej osoby', 'anonimizacja ministranta', 'eksport danych osobowych do pdf', 'czyszczenie starych logów', 'zgodnie z rodo skasować dane', 'GDPR erase a person'],
        'a-raport-mies': ['wygenerować raport miesięczny', 'miesięczne zestawienie pdf', 'raport za poprzedni miesiąc', 'pobrać pdf z miesiąca', 'monthly PDF report'],
        'a-konto-ksiedza': ['nadać komuś uprawnienia księdza', 'odebrać rolę opiekuna', 'zrobić z konta księdza', 'nowy proboszcz dostęp do panelu', 'rola moderatora w systemie', 'grant the priest role'],
        'a-cofnij-zmiane': ['cofnąć zmianę z historii audytu', 'przywrócić poprzednią wartość', 'naprawić omyłkową edycję', 'przycisk cofnij w audycie', 'undo an audit change'],
        'a-blokada-kiosku': ['zablokować kiosk na jakiś czas', 'ktoś nadużywa tabletu w zakrystii', 'wyłączyć kiosk awaryjnie', 'blokada z powodem i czasem', 'jak odblokować zablokowany kiosk', 'lock a kiosk temporarily'],
        'a-nowy-miesiac': ['co zrobić na koniec miesiąca', 'zamknięcie miesiąca w systemie', 'podsumowanie miesiąca krok po kroku', 'czy wszystko jest rozliczone w miesiącu', 'month end checklist'],
        'a-kopia-zapasowa': ['zrobić backup bazy', 'zapisać dane do pliku', 'eksport całej bazy', 'jak często robić kopię zapasową', 'bezpieczne przechowywanie kopii', 'back up the database'],
        'a-diagnostyka-kiosku': ['kiosk nie wysyła obecności', 'tablet w zakrystii jest offline', 'sprawdzić dlaczego kiosk nie działa', 'ostatni ping sprzed kilku godzin', 'kolejka kiosku rośnie', 'kiosk troubleshooting'],
        'a-ustawienia-okno': ['domyślne okno zapisu na msze', 'zmienić minuty przed i po rozpoczęciu', 'jak długo można się zapisywać', 'globalne okno rejestracji', 'default registration window'],
        'a-odpowiedz-wiadomosc': ['jak odpowiedzieć na zgłoszenie ministranta', 'obsłużyć wiadomość z kontaktu', 'dopisać uwagi do wiadomości', 'oznaczyć wiadomość jako załatwioną', 'handle a user message']
    };
    Object.keys(PYTANIA_2).forEach((id) => { PYTANIA[id] = (PYTANIA[id] || []).concat(PYTANIA_2[id]); });

    // ------------------------------------------------------------------ BAZA WIEDZY (pytanie → krótka odpowiedź) ----
    // „tematy” = które przewodniki pomogą (pierwszy dostępny w bieżącym ekranie jest proponowany jako przycisk).
    const WIEDZA = [
        { id: 'okno', pytania: ['od kiedy do kiedy mogę zapisać obecność', 'okno rejestracji na mszę', 'ile minut przed mszą mogę się zapisać', 'when can I register', 'коли можна записатися', 'kiedy kończy się zapis na mszę'],
          odp: T('Zapis na mszę jest możliwy **od 20 minut przed do 5 minut po** jej rozpoczęciu. Admin może zmienić te wartości w ustawieniach, a Ksiądz — dla pojedynczej mszy.', 'You can register for a Mass **from 20 minutes before to 5 minutes after** it starts. The Admin can change this in the settings.', 'Записатися на Месу можна **від 20 хвилин до і до 5 хвилин після** початку. Адміністратор може змінити це в налаштуваннях.'), tematy: ['k-za-wczesnie', 'p-okno-rejestracji', 'a-ustawienia-okno'] },
        { id: 'punkty', pytania: ['ile punktów za mszę', 'za co dostaję punkty', 'jak liczone są punkty', 'how are points counted', 'скільки балів за Месу'],
          odp: T('Za **mszę** zwykle **1 lub 2 punkty** (zależy od dnia i zasad parafii), **nabożeństwo** dodaje **+1**, a **pogrzeb / ślub / inne** — punkty przyznaje Ksiądz po zatwierdzeniu. Punkty liczą się **w miesiącu**.', 'A **Mass** is usually **1 or 2 points**, a **service** adds **+1**, and for **funerals / weddings / other** the priest awards points after approval. Points are counted **per month**.', 'За **Месу** зазвичай **1 або 2 бали**, **богослужіння** додає **+1**, а за **похорон / весілля / інше** бали надає Священник після підтвердження. Бали рахуються **за місяць**.'), tematy: ['k-punkty', 'm-zasady'] },
        { id: 'blokada', pytania: ['dlaczego kod jest zablokowany', 'ile prób pinu mam', 'kto odblokuje kod', 'why is my code locked', 'чому код заблоковано'],
          odp: T('Po **kilku błędnych PIN-ach z rzędu** kod zostaje zablokowany (ochrona przed zgadywaniem). Odblokuje go **Ksiądz lub Admin** — w panelu (zakładka Bezpieczeństwo) albo na kiosku w trybie awaryjnym.', 'After **several wrong PINs in a row** the code is locked (protection against guessing). The **priest or the Admin** can unlock it.', 'Після **кількох хибних PIN поспіль** код блокується (захист від підбору). Розблокувати його може **Священник або Адміністратор**.'), tematy: ['k-zgubione', 'l-zapomnialem', 'p-odblokuj', 'e-odblokuj'] },
        { id: 'offline', pytania: ['czy kiosk działa bez internetu', 'co się dzieje gdy nie ma sieci', 'kolejka offline', 'does the kiosk work offline', 'чи працює кіоск без інтернету'],
          odp: T('Tak. **Bez internetu kiosk nadal działa** — zapisuje obecności w kolejce i sam wysyła je na serwer, gdy sieć wróci. Wpisy starsze niż 36 godzin wymagają potem akceptacji Admina.', 'Yes. **Without internet the kiosk keeps working** — it queues attendances and sends them when the network returns.', 'Так. **Без інтернету кіоск працює** — зберігає присутності в черзі й надсилає їх, коли зв’язок повертається.'), tematy: ['k-status', 'e-offline', 'a-akceptacje'] },
        { id: 'plakietka', pytania: ['co to jest plakietka', 'czym jest karta ministranta', 'co to kod qr na karcie', 'what is a badge', 'що таке плакетка'],
          odp: T('**Plakietka** to karta z kodem QR przypisana do ministranta. Kiosk rozpoznaje po niej osobę, a potem prosi o PIN. Jedno konto może mieć najwyżej 10 aktywnych plakietek; zgubioną unieważnia Ksiądz lub Admin.', 'A **badge** is a card with a QR code assigned to an altar server. The kiosk recognises the person by it and then asks for the PIN.', '**Плакетка** — це картка з QR-кодом, закріплена за служителем. Кіоск розпізнає за нею людину і просить PIN.'), tematy: ['p-plakietka', 'p-karty'] },
        { id: 'kiosk', pytania: ['co to jest kiosk', 'czym jest tablet w zakrystii', 'do czego służy kiosk', 'what is the kiosk', 'що таке кіоск'],
          odp: T('**Kiosk** to tablet w zakrystii, na którym ministranci zapisują obecność: karta QR (lub kamera) → PIN → wybór mszy. Zajmuje to kilka sekund.', 'The **kiosk** is the tablet in the sacristy where altar servers record attendance: QR card (or camera) → PIN → choose the Mass.', '**Кіоск** — це планшет у захристії, де служителі записують присутність: картка QR (або камера) → PIN → вибір Меси.'), tematy: ['k-pierwszy-raz', 's-wybor'] },
        { id: 'kto-dodaje', pytania: ['kto może dodać ministranta', 'kto zakłada konta', 'kto tworzy nowe konto', 'who can add an altar server'],
          odp: T('Konta ministrantów dodaje **Ksiądz lub Admin**. Ksiądz zarządza zwykłymi ministrantami, a **rolę Księdza** nadaje tylko Admin.', 'Altar-server accounts are added by the **priest or the Admin**. Only the Admin grants the priest role.'), tematy: ['p-ministrant', 'a-konto-ksiedza'] },
        { id: 'ksiadz-admin', pytania: ['jaka jest różnica między księdzem a adminem', 'co może admin a czego nie ksiądz', 'uprawnienia księdza', 'priest vs admin permissions'],
          odp: T('**Ksiądz**: kalendarz, zgłoszenia, ręczna obecność, ministranci i plakietki, karty QR, listy papierowe, obecności i frekwencja. **Admin** robi to samo, a dodatkowo: dashboard, raport dnia, akceptacje 36 h, kioski, baza danych, ustawienia, audyt, narzędzia, RODO i nadawanie ról.', '**Priest**: calendar, requests, manual attendance, altar servers and badges, QR cards, paper lists, attendance and reports. The **Admin** can do all that plus the dashboard, daily report, 36 h approvals, kiosks, database, settings, audit, tools, GDPR and roles.'), tematy: ['s-kim-jestem'] },
        { id: 'zgloszenie-kto', pytania: ['kto zatwierdza pogrzeb', 'kto przyznaje punkty za ślub', 'dlaczego nie mam punktów za pogrzeb', 'who approves a funeral request'],
          odp: T('Zgłoszenia specjalne (**pogrzeb, ślub, inne**) zatwierdza **Ksiądz** i dopiero wtedy ministrant dostaje punkty. Zgłoszenia Admina rozpatruje Admin.', 'Special requests (**funeral, wedding, other**) are approved by the **priest**; only then does the altar server get points.', 'Особливі заявки (**похорон, весілля, інше**) підтверджує **Священник** — лише тоді служитель отримує бали.'), tematy: ['p-zgloszenia', 'k-specjalna'] },
        { id: 'zerowanie', pytania: ['dlaczego punkty zaczęły się od zera', 'czy punkty się zerują', 'nowy miesiąc punkty', 'do points reset every month'],
          odp: T('Punkty i ranking liczą się **miesiącami** — nowy miesiąc zaczyna od zera. Historię poprzednich miesięcy zobaczysz w „Historii obecności”.', 'Points and the ranking are counted **per month** — a new month starts from zero. Earlier months are in the attendance history.', 'Бали й рейтинг рахуються **за місяць** — новий місяць починається з нуля. Попередні місяці є в історії присутності.'), tematy: ['m-nowy-miesiac', 'm-historia'] },
        { id: 'pin-zasady', pytania: ['jaki może być pin', 'ile cyfr ma pin', 'zasady pinu', 'what is a valid pin', 'який може бути пін'],
          odp: T('PIN ma **4 cyfry**. System odrzuca zbyt proste (np. 1234, 0000). Nie mów go nikomu — nawet koledze.', 'The PIN has **4 digits**. Overly simple ones (e.g. 1234, 0000) are rejected. Never tell it to anyone.', 'PIN має **4 цифри**. Надто прості (напр. 1234, 0000) відхиляються. Нікому його не кажіть.'), tematy: ['m-pin', 'm-bezpieczenstwo-pin'] },
        { id: 'zmiana-pin', pytania: ['kto może zmienić pin', 'jak ustawić nowy pin ministrantowi', 'zapomniany pin kto pomoże'],
          odp: T('Swój PIN **zmienisz sam** w panelu ministranta („Zmień PIN”). Gdy go **zapomniałeś**, nowy ustawi Ci Ksiądz lub Admin (edycja konta).', 'You can **change your own PIN** in the altar-server panel. If you **forgot** it, the priest or Admin sets a new one.'), tematy: ['m-pin', 'p-edytuj-ministranta', 'l-zapomnialem'] },
        { id: 'akceptacje', pytania: ['co to są akceptacje 36 godzin', 'dlaczego wpis czeka na akceptację', 'stare wpisy z kolejki offline'],
          odp: T('Obecności, które z kiosku dotarły z opóźnieniem **większym niż 36 godzin** (np. po długiej awarii sieci), czekają na **akceptację Admina** — żeby nikt nie dopisał sobie starych punktów bez kontroli.', 'Attendances that reached the server **more than 36 hours late** wait for the **Admin’s approval**.'), tematy: ['a-akceptacje'] },
        { id: 'rodo', pytania: ['czy anonimizacja jest odwracalna', 'jak usunąć dane osoby', 'rodo eksport danych', 'is anonymisation reversible'],
          odp: T('**Anonimizacja jest nieodwracalna** — system wymaga wpisania potwierdzenia. Przed nią możesz pobrać dane osoby (JSON lub PDF). Zakładka RODO jest tylko dla Admina.', '**Anonymisation is irreversible** — the system asks for a confirmation. You can download the person’s data first.'), tematy: ['a-rodo'] },
        { id: 'audyt', pytania: ['co to jest audyt', 'gdzie zobaczę kto co zmienił', 'jak cofnąć zmianę', 'what is the audit log'],
          odp: T('**Audyt** to historia wszystkich zmian w systemie (kto, kiedy, co). Przy zmianach, które da się wycofać, jest przycisk **„Cofnij”**; samo cofnięcie też trafia do audytu.', 'The **audit** is the history of all changes (who, when, what). Reversible changes have an **“Undo”** button.'), tematy: ['a-audyt', 'a-cofnij-zmiane'] },
        { id: 'duplikat', pytania: ['czy mogę zapisać się dwa razy', 'co jak zapiszę się dwa razy', 'czy obecność się zdubluje'],
          odp: T('Nie — system **nie doda drugi raz** tej samej obecności na tę samą mszę. Zobaczysz komunikat, że już jest zapisana (punkty masz).', 'No — the system **will not add** the same attendance twice. You will see a message that it is already recorded.', 'Ні — система **не додасть удруге** ту саму присутність. Ви побачите повідомлення, що вона вже записана.'), tematy: ['k-dwa-razy'] },
        { id: 'jezyk', pytania: ['w jakich językach działa system', 'czy jest po angielsku', 'czy jest po ukraińsku', 'which languages are supported'],
          odp: T('System działa po **polsku, angielsku i ukraińsku**. Przełącznik **PL / EN / UA** jest w rogu ekranu (na kiosku u góry).', 'The system works in **Polish, English and Ukrainian**. The **PL / EN / UA** switch is in the corner.', 'Система працює **польською, англійською та українською**. Перемикач **PL / EN / UA** — у куті екрана.'), tematy: ['k-jezyk', 'm-jezyk', 'l-jezyk'] },
        { id: 'kontakt', pytania: ['jak skontaktować się z administratorem', 'gdzie jest przycisk kontakt', 'jak zgłosić błąd', 'how do I contact the admin'],
          odp: T('Użyj przycisku **„Kontakt”** (prawy dolny róg). Opisz problem — system dołączy **zrzut ekranu**, a Admin odpowie.', 'Use the **“Contact”** button (bottom-right). Describe the problem — the system attaches a **screenshot**.', 'Скористайтеся кнопкою **«Контакт»** (внизу праворуч). Опишіть проблему — система додасть **знімок екрана**.'), tematy: ['k-kontakt', 'm-kontakt', 'w-kontakt', 'l-kontakt'] },
        { id: 'listy', pytania: ['co to są listy papierowe', 'kiedy używać listy papierowej', 'kiosk padł co robić z obecnościami'],
          odp: T('**Lista papierowa** to plan awaryjny, gdy kiosk nie działa: drukujesz pustą listę, ministranci wpisują się długopisem, a potem wczytujesz **zdjęcie** — wpisy dostają oznaczenie „System (Lista)”.', 'A **paper list** is a fallback when the kiosk is down: print an empty list, servers sign it, then upload a **photo**.'), tematy: ['p-listy'] },
        { id: 'bezpieczenstwo', pytania: ['czy moje dane są bezpieczne', 'kto widzi mój pin', 'czy mogę pożyczyć kartę', 'is my data safe'],
          odp: T('PIN znasz **tylko Ty** — system przechowuje go w postaci zaszyfrowanej, a kiosk go nie wyświetla. Karta jest osobista: **nie pożyczaj jej** i nikomu nie mów PIN-u. Zgubioną kartę Ksiądz unieważnia.', 'Only **you** know your PIN — it is stored encrypted and never displayed. The card is personal: **do not lend it** and never tell your PIN.', 'PIN знаєте **лише ви** — він зберігається в зашифрованому вигляді й ніколи не показується. Картка особиста: **не позичайте її** і нікому не кажіть PIN.'), tematy: ['k-prywatnosc', 'm-bezpieczenstwo-pin'] },
        { id: 'raport-dnia', pytania: ['co to jest raport dnia', 'co pokazuje dashboard', 'gdzie zobaczę co wymaga uwagi'],
          odp: T('**Dashboard** pokazuje liczniki i rzeczy do załatwienia (zgłoszenia, blokady, kioski). **Raport Dnia** zbiera wszystko z jednego dnia i pozwala oznaczać sprawy jako przejrzane. Oba są dla Admina.', 'The **dashboard** shows counters and things to handle; the **Daily Report** gathers everything from one day. Both are for the Admin.'), tematy: ['a-dashboard', 'a-raport'] },
        { id: 'plakietki-limit', pytania: ['ile plakietek może mieć ministrant', 'limit kart na konto', 'czy można mieć dwie karty'],
          odp: T('Jedno konto może mieć **najwyżej 10 aktywnych plakietek**. Zgubioną lub zniszczoną unieważnij, a nową wygeneruj.', 'One account can have **at most 10 active badges**.'), tematy: ['p-plakietka'] },
        { id: 'instalacja', pytania: ['czy jest aplikacja na telefon', 'jak mieć ikonę na telefonie', 'is there a mobile app'],
          odp: T('Osobnej aplikacji ze sklepu nie ma — stronę **dodajesz do ekranu głównego** i działa jak aplikacja (Android: ⋮ → „Zainstaluj aplikację”; iPhone: Udostępnij → „Do ekranu początkowego”).', 'There is no store app — you **add the page to your home screen** and it works like an app.', 'Окремого застосунку з магазину немає — сторінку **додають на головний екран**, і вона працює як застосунок.'), tematy: ['l-instalacja', 'm-instalacja', 's-instalacja'] },
        { id: 'kolor-czerwony', pytania: ['co znaczy czerwony komunikat', 'dlaczego kiosk pokazał błąd', 'what does a red message mean'],
          odp: T('**Czerwony** komunikat = coś nie wyszło. Zwykle: zły PIN, zablokowany kod, za wcześnie lub za późno na zapis albo obecność już zapisana. **Przeczytaj treść** — jest tam powód.', 'A **red** message means something went wrong — usually a wrong PIN, a locked code, too early / too late, or an already-recorded attendance. **Read the text** — the reason is there.', '**Червоне** повідомлення = щось не вийшло. Зазвичай: хибний PIN, заблокований код, зарано/запізно або присутність уже записана. **Прочитайте текст** — там причина.'), tematy: ['k-kolory'] },
        { id: 'za-kolege', pytania: ['czy mogę zapisać obecność za kolegę', 'czy mogę użyć karty kolegi', 'zapisać kogoś innego na kiosku', 'can I record attendance for a friend'],
          odp: T('Nie. Każdy zapisuje **tylko siebie**: własną kartą i własnym PIN-em. Obecność „za kogoś” to nadużycie — a zapomnianą obecność dopisuje po mszy **Ksiądz** ręcznie.', 'No. Everyone records **only themselves**, with their own card and PIN. A forgotten attendance is added manually by the **priest** after Mass.', 'Ні. Кожен записує **лише себе** власною карткою й власним PIN. Забуту присутність після Меси вручну додає **Священник**.'), tematy: ['k-prywatnosc', 'p-reczna'] },
        { id: 'zapomnialem-zapisac', pytania: ['zapomniałem zapisać obecność', 'nie zapisałem się na kiosku a byłem', 'co jeśli nie odbiłem karty', 'I forgot to record my attendance'],
          odp: T('Powiedz o tym **Księdzu** (najlepiej od razu po mszy) — dopisze Ci obecność ręcznie. Gdy minie dużo czasu, napisz do Admina przyciskiem „Kontakt”.', 'Tell the **priest** (best right after Mass) — he will add it manually. If a lot of time has passed, write to the Admin with the “Contact” button.', 'Скажіть **Священнику** (найкраще одразу після Меси) — він запише вручну. Якщо минуло багато часу, напишіть Адміністратору кнопкою «Контакт».'), tematy: ['p-reczna', 'm-blad', 'e-reczna'] },
        { id: 'tryb-awaryjny', pytania: ['co to jest tryb awaryjny kiosku', 'do czego służy tryb księdza na kiosku', 'czym jest tryb admina na tablecie'],
          odp: T('**Tryb awaryjny** to panel na kiosku dla Księdza lub Admina (po zeskanowaniu własnej karty i PIN-u): ręczny zapis obecności, cofanie pomyłek, a dla Admina także odblokowanie kodów, tryb offline i czyszczenie kolejki.', 'The **emergency mode** is a panel on the kiosk for the priest or Admin: manual attendance, undoing mistakes and, for the Admin, unlocking codes, offline mode and queue clean-up.'), tematy: ['k-wejscie-roli', 'e-przeglad'] },
        { id: 'nowa-karta', pytania: ['jak dostać nową kartę', 'kto wydaje karty ministrantom', 'gdzie wziąć nową plakietkę', 'how do I get a new card'],
          odp: T('Nową kartę (plakietkę) wydaje **Ksiądz lub Admin**: unieważnia starą i generuje nową z kodem QR. Kod konta i PIN zostają te same.', 'A new card (badge) is issued by the **priest or Admin**: they cancel the old one and generate a new QR code. Your account code and PIN stay the same.', 'Нову картку (плакетку) видає **Священник або Адміністратор**: анулює стару й генерує нову з QR-кодом. Код акаунта та PIN лишаються тими самими.'), tematy: ['p-plakietka', 'p-karty', 'k-zgubione'] },
        { id: 'ranking', pytania: ['jak działa ranking', 'co oznacza ranking ministrantów', 'kto widzi ranking', 'how does the ranking work'],
          odp: T('**Ranking** ustawia ministrantów według punktów w bieżącym miesiącu; Twój wiersz jest podświetlony. Nowy miesiąc zaczyna ranking od zera.', 'The **ranking** orders altar servers by points in the current month; your row is highlighted. A new month starts from zero.', '**Рейтинг** упорядковує служителів за балами поточного місяця; ваш рядок підсвічено. Новий місяць починається з нуля.'), tematy: ['m-ranking', 'm-nowy-miesiac'] },
        { id: 'oczekujace', pytania: ['co znaczy zgłoszenie oczekujące', 'dlaczego mam zero punktów za pogrzeb', 'zgłoszenie czeka na zatwierdzenie'],
          odp: T('**Oczekujące** zgłoszenie (pogrzeb, ślub, inne) czeka, aż **Ksiądz** je zatwierdzi i przyzna punkty. Do tego czasu punktów nie ma — to normalne.', 'A **pending** request (funeral, wedding, other) waits for the **priest** to approve it and award points. Until then there are no points — that is normal.', '**Очікувана** заявка (похорон, весілля, інше) чекає, поки **Священник** її підтвердить і надасть бали. До того часу балів немає — це нормально.'), tematy: ['p-zgloszenia', 'k-specjalna'] },
        { id: 'ile-trwa', pytania: ['ile trwa zapis obecności', 'czy to zajmuje dużo czasu', 'jak szybko się zapisuję', 'how long does it take to record attendance'],
          odp: T('Zapis na kiosku trwa **kilka sekund**: pokazujesz kartę, wpisujesz 4 cyfry PIN-u i wybierasz mszę. Dlatego warto zrobić to tuż przed mszą, zanim zacznie się kolejka.', 'Recording takes **a few seconds**: show the card, enter the 4-digit PIN and choose the Mass.', 'Запис триває **кілька секунд**: покажіть картку, введіть 4 цифри PIN і оберіть Месу.'), tematy: ['k-obecnosc', 'k-pierwszy-raz'] },
        { id: 'kto-widzi-obecnosci', pytania: ['kto widzi moje obecności', 'czy inni ministranci widzą moje wpisy', 'kto ma dostęp do mojej historii', 'who can see my attendance'],
          odp: T('Swoje obecności i punkty widzisz **Ty**, a także **Ksiądz i Admin**. Inni ministranci widzą tylko ogólny ranking miesiąca.', 'Your attendance and points are visible to **you**, the **priest and the Admin**. Other servers see only the monthly ranking.', 'Ваші присутності й бали бачите **ви**, **Священник і Адміністратор**. Інші служителі бачать лише загальний рейтинг місяця.'), tematy: ['k-prywatnosc', 'm-historia'] },
        { id: 'zmiana-godziny', pytania: ['co jeśli msza zmieniła godzinę', 'msza została przesunięta a okno zapisu', 'jak okno rejestracji działa po zmianie godziny', 'the Mass time changed what about registration'],
          odp: T('Ksiądz zmienia godzinę w kalendarzu (edycja wydarzenia). Okno zapisu liczy się **od godziny rozpoczęcia wpisanej w kalendarzu**, więc po poprawce przesuwa się razem z mszą.', 'The priest edits the time in the calendar; the registration window follows the **start time stored in the calendar**.'), tematy: ['p-edytuj-wydarzenie', 'p-okno-rejestracji'] },
        { id: 'bez-karty', pytania: ['czy mogę zapisać się bez karty', 'czy da się zapisać obecność samym pinem', 'zapis bez plakietki', 'can I record without a card'],
          odp: T('Na kiosku potrzebna jest **karta (lub kamera) i PIN**. Bez karty obecność dopisuje po mszy **Ksiądz lub Admin** ręcznie — wystarczy, że poda Twój kod.', 'You need a **card (or camera) and the PIN**. Without a card the **priest or Admin** adds the attendance manually using your code.', 'На кіоску потрібні **картка (або камера) і PIN**. Без картки присутність вручну додає **Священник чи Адміністратор** за вашим кодом.'), tematy: ['k-zgubione', 'p-reczna', 'e-reczna'] },
        { id: 'dwa-konta', pytania: ['czy mogę mieć dwa konta', 'jedno konto na dwie osoby', 'rodzeństwo na jednym koncie', 'can two people share an account'],
          odp: T('**Jedna osoba = jedno konto** z własnym kodem i PIN-em. Wspólne konto zniekształca punkty i ranking. Rodzeństwo ma osobne konta i osobne karty.', 'One person = one account with its own code and PIN. Siblings have separate accounts and cards.'), tematy: ['p-ministrant'] },
        { id: 'wersja', pytania: ['jaka to wersja aplikacji', 'gdzie sprawdzę numer wersji', 'która wersja systemu', 'what version is this'],
          odp: T('Numer wersji jest wyświetlany **w lewym dolnym rogu** ekranu (drobnym drukiem nad przyciskiem pomocy). Przyda się, gdy zgłaszasz problem Adminowi.', 'The version number is shown in the **bottom-left corner** in small print. It helps when reporting a problem.'), tematy: ['k-kontakt', 'w-kontakt'] },
        { id: 'iphone', pytania: ['czy działa na iphonie', 'czy system działa na telefonie z androidem', 'jakiej przeglądarki użyć', 'does it work on iPhone'],
          odp: T('Tak — system działa w **zwykłej przeglądarce** na iPhonie, Androidzie i komputerze (np. Safari, Chrome). Możesz też dodać stronę do ekranu głównego jak aplikację.', 'Yes — it works in an **ordinary browser** on iPhone, Android and computers.', 'Так — система працює у **звичайному браузері** на iPhone, Android і комп’ютері.'), tematy: ['l-instalacja', 'm-instalacja', 's-instalacja'] },
        { id: 'panel-internet', pytania: ['czy panel działa bez internetu', 'brak sieci w telefonie a chcę zobaczyć punkty', 'panel ministranta offline', 'does the panel work offline'],
          odp: T('**Panel** (punkty, historia, zarządzanie) wymaga internetu — pobiera dane z serwera. Bez internetu działa tylko **kiosk**, który zapisuje obecności w kolejce.', 'The **panel** needs internet. Only the **kiosk** works offline, queueing attendances.', '**Панель** потребує інтернету. Без нього працює лише **кіоск**, що ставить присутності в чергу.'), tematy: ['m-strona-nie-laduje', 'k-status'] },
        { id: 'kto-blokuje-kiosk', pytania: ['kto może zablokować kiosk', 'czy ksiądz może wyłączyć kiosk', 'kto odblokuje zablokowany kiosk', 'who can lock the kiosk'],
          odp: T('Awaryjną blokadę kiosku ustawia **Admin** (zakładka Narzędzia: kiosk, czas i powód). Odblokowuje ją tym samym przyciskiem albo z kiosku w trybie Admina.', 'The emergency kiosk lock is set by the **Admin** in the Tools tab.'), tematy: ['a-blokada-kiosku'] },
        { id: 'zrzut-ekranu', pytania: ['po co zrzut ekranu w kontakcie', 'co dołącza się do wiadomości do admina', 'czy admin widzi mój ekran', 'what does the screenshot in the contact form do'],
          odp: T('Przycisk **„Kontakt”** dołącza do wiadomości **zrzut ekranu** miejsca, w którym jesteś — Admin od razu widzi, o co chodzi. Nie ma w nim Twojego PIN-u (jest ukryty).', 'The **Contact** button attaches a **screenshot** of where you are, so the Admin sees the problem right away.', 'Кнопка **«Контакт»** додає **знімок екрана** місця, де ви перебуваєте, тож Адміністратор одразу бачить проблему.'), tematy: ['k-kontakt', 'm-kontakt', 'w-kontakt'] },
        { id: 'retencja', pytania: ['jak długo przechowywane są dane', 'czy stare logi się usuwają', 'czyszczenie starych danych', 'how long is data kept'],
          odp: T('Admin może w zakładce **RODO** wyczyścić stare logi starsze niż podana liczba dni (**retencja**). Operacja jest **nieodwracalna**, więc najpierw warto zrobić kopię zapasową.', 'The Admin can purge old logs older than a given number of days in the **GDPR** tab — irreversible, so back up first.'), tematy: ['a-rodo', 'a-kopia-zapasowa'] },
        { id: 'kopia-czestotliwosc', pytania: ['jak często robić kopię zapasową', 'kiedy zrobić backup', 'czy kopię trzeba robić regularnie', 'how often should I back up'],
          odp: T('Dobrą praktyką jest kopia **raz w miesiącu** (np. przy zamykaniu miesiąca) oraz **przed** anonimizacją, importem lub dużymi zmianami. Plik zawiera dane osobowe — trzymaj go bezpiecznie.', 'A good habit is a backup **once a month** and **before** any anonymisation or import.'), tematy: ['a-kopia-zapasowa', 'a-nowy-miesiac'] },
        { id: 'edytuj-po-fakcie', pytania: ['czy można edytować wydarzenie po fakcie', 'poprawić mszę która już była', 'zmiana wpisu z przeszłości', 'can I edit a past event'],
          odp: T('Tak — wydarzenia i obecności można poprawiać lub usuwać także po fakcie (Ksiądz i Admin). Każda zmiana zostaje w **historii zmian** razem z kodem osoby, która ją zrobiła.', 'Yes — events and attendances can be corrected afterwards; every change stays in the audit history.'), tematy: ['p-edytuj-wydarzenie', 'p-punkty-popraw', 'a-audyt'] },
        { id: 'edytuj-obecnosc', pytania: ['czy można poprawić obecność', 'jak usunąć błędny wpis', 'ktoś dostał za dużo punktów'],
          odp: T('Tak — Ksiądz i Admin mogą **poprawić lub usunąć** wpis w zakładce Obecności; na kiosku w trybie awaryjnym są „ostatnie obecności” z przyciskiem cofnięcia. Każda zmiana zostaje w historii.', 'Yes — the priest and the Admin can **edit or delete** an entry; every change stays in the history.'), tematy: ['p-punkty-popraw', 'e-cofnij'] }
    ];

    // ------------------------------------------------------------------ TEKSTY ODPOWIEDZI ----
    const S = {
        powitanie: T('Cześć! 👋 Jestem mini-asystentem. Napisz, w czym mam pomóc — np. „zgubiłem kartę” albo „jak dodać mszę”.', 'Hi! 👋 I am the mini assistant. Tell me what you need — e.g. “I lost my card” or “how do I add a Mass”.', 'Привіт! 👋 Я міні-асистент. Напишіть, з чим допомогти — напр. «загубив картку» або «як додати Месу».'),
        dzieki: T('Proszę! 🙂 Gdyby coś jeszcze — pytaj.', 'You are welcome! 🙂 Ask me anything else.', 'Прошу! 🙂 Якщо щось ще — питайте.'),
        pusty: T('Napisz pytanie, np. „jak zmienić PIN”.', 'Type a question, e.g. “how do I change my PIN”.', 'Напишіть запитання, напр. «як змінити PIN».'),
        ktoja: T('Jestem **mini-asystentem pomocy**. Działam lokalnie w przeglądarce — bez internetu i **bez prawdziwej sztucznej inteligencji**: mam małą sieć neuronową (**{p} parametrów**) do rozpoznawania pytań, bazę wiedzy o tym systemie ({w} odpowiedzi) i {t} przewodników krok po kroku. Nie zmyślam — gdy nie wiem, powiem to.',
            'I am a **small help assistant**. I run locally in your browser — offline and **without real artificial intelligence**: a small neural network (**{p} parameters**) recognises questions, plus a knowledge base ({w} answers) and {t} step-by-step guides. I do not make things up — if I do not know, I say so.',
            'Я **малий асистент допомоги**. Працюю локально в браузері — без інтернету й **без справжнього штучного інтелекту**: маленька нейромережа (**{p} параметрів**) розпізнає запитання, є база знань ({w} відповідей) і {t} покрокових посібників. Я не вигадую — якщо не знаю, скажу.'),
        model: T('Technicznie: **sieć typu fastText** — {b} cech (słowa, rdzenie, synonimy, pary słów, trójki liter) → wektor {d} liczb → {c} tematów. Razem **{p} parametrów**, uczona lokalnie z wiedzy o systemie. Do tego dopasowanie TF-IDF, poprawianie literówek i reguły. To nie jest model językowy — nie rozmawiam o wszystkim, tylko pomagam w tym systemie.',
            'Technically: a **fastText-style network** — {b} features → a {d}-number vector → {c} topics, **{p} parameters** in total, trained locally. Plus TF-IDF matching, typo correction and rules. It is not a language model — I only help with this system.',
            'Технічно: **мережа типу fastText** — {b} ознак → вектор із {d} чисел → {c} тем, разом **{p} параметрів**, навчена локально. Додатково TF-IDF, виправлення помилок і правила. Це не мовна модель — я допомагаю лише з цією системою.'),
        znalazlem: T('Najlepiej pomoże temat: 🎯 **{t}**{o}', 'The best help is the topic: 🎯 **{t}**{o}', 'Найкраще допоможе тема: 🎯 **{t}**{o}'),
        wybor: T('Chodzi o któryś z tych tematów? 🤔', 'Is it one of these topics? 🤔', 'Йдеться про одну з цих тем? 🤔'),
        nieZnam: T('Nie jestem pewien, o co chodzi 🤷 — nie chcę zgadywać. Spróbuj innymi słowami albo wybierz coś z listy. Mogę też przekazać sprawę Adminowi.', 'I am not sure what you mean 🤷 — I do not want to guess. Try other words or pick from the list. I can also pass this on to the Admin.', 'Не певен, що ви маєте на увазі 🤷 — не хочу вгадувати. Спробуйте іншими словами або оберіть зі списку. Можу також передати справу Адміністратору.'),
        spokojnie: T('Spokojnie, pomogę. 🙂', 'Do not worry, I will help. 🙂', 'Спокійно, допоможу. 🙂'),
        innyKontekst: T('\n📍 To robi się w: **{k}**. Tutaj nie ma takiego przewodnika — przejdź tam, a pokażę krok po kroku.', '\n📍 This is done in: **{k}**. There is no such guide on this screen — go there and I will show you step by step.', '\n📍 Це робиться в: **{k}**. На цьому екрані такого посібника немає — перейдіть туди, і я покажу крок за кроком.'),
        start: T('▶ Pokaż krok po kroku', '▶ Show me step by step', '▶ Показати крок за кроком'),
        kontakt: T('✉️ Napisz do Admina', '✉️ Write to the Admin', '✉️ Написати Адміністратору'),
        zadne: T('Żadne z tych', 'None of these', 'Жодне з цих'),
        auto_on: T('Dobrze 🤖 Włączam **tryb „klikaj za mnie”** — kliknę tylko to, co bezpieczne (zakładki, „Pokaż”, filtry). Przyciski, które zapisują lub usuwają dane, zawsze klikasz Ty.', 'OK 🤖 **Click-for-me mode is on** — I will only click safe things (tabs, “Show”, filters). Buttons that save or delete data are always yours to click.', 'Добре 🤖 Вмикаю **режим «клікай за мене»** — натискатиму лише безпечне (вкладки, «Показати», фільтри). Кнопки, що зберігають чи видаляють дані, завжди натискаєте ви.'),
        auto_off: T('Wyłączam klikanie 👀 — będę tylko pokazywać, co kliknąć.', 'Click mode is off 👀 — I will only show you what to tap.', 'Вимикаю клікання 👀 — лише показуватиму, що натиснути.'),
        czytaj: T('Czytam bieżący krok na głos 🔊', 'Reading the current step aloud 🔊', 'Читаю поточний крок уголос 🔊'),
        tekst: T('Zmieniam rozmiar tekstu 🔠 (skacze: normalny → większy → największy).', 'Changing the text size 🔠 (normal → larger → largest).', 'Змінюю розмір тексту 🔠 (звичайний → більший → найбільший).'),
        gdzie: T('Pokazuję to miejsce jeszcze raz 👆', 'Showing that spot again 👆', 'Показую це місце ще раз 👆'),
        powtorz: T('Jeszcze raz — oto bieżący krok.', 'Once more — here is the current step.', 'Ще раз — ось поточний крок.'),
        brakKroku: T('Żaden przewodnik nie jest teraz uruchomiony — wybierz temat z listy.', 'No guide is running right now — pick a topic from the list.', 'Зараз жоден посібник не запущено — оберіть тему зі списку.'),
        koniec: T('Kończę przewodnik. ✅', 'Ending the guide. ✅', 'Завершую посібник. ✅'),
        nie_rozumiem: T('Spokojnie — spróbujmy inaczej 🙂 Mogę **przeczytać krok na głos** 🔊, **pokazać palcem miejsce** 👆, **powiększyć tekst** 🔠 albo przekazać sprawę Adminowi. Wybierz, co pomoże.', 'No worries — let us try another way 🙂 I can **read the step aloud** 🔊, **point at the spot** 👆, **enlarge the text** 🔠 or pass this to the Admin. Pick what helps.', 'Спокійно — спробуймо інакше 🙂 Можу **прочитати крок уголос** 🔊, **показати місце пальцем** 👆, **збільшити текст** 🔠 або передати справу Адміністратору. Оберіть, що допоможе.'),
        zapomnij: T('Dobrze 🧹 Zapomniałem wszystko, czego nauczyłem się z Twoich wyborów. Wracam do wiedzy podstawowej.', 'OK 🧹 I forgot everything I learned from your choices. Back to the basic knowledge.', 'Добре 🧹 Я забув усе, чого навчився з ваших виборів. Повертаюся до базових знань.'),
        poza: T('To pytanie wygląda na dalekie od tego systemu 🤔 Pomagam w sprawach kiosku, panelu ministranta, Księdza i Admina — spróbuj opisać, co chcesz zrobić w systemie.', 'That looks unrelated to this system 🤔 I help with the kiosk and the altar server, priest and Admin panels — try describing what you want to do in the system.', 'Це схоже на щось поза цією системою 🤔 Я допомагаю з кіоском і панелями служителя, Священника та Адміністратора — спробуйте описати, що хочете зробити в системі.'),
        brakElementu: T('Nie widzisz podświetlonego miejsca? 🔍 Najczęstsze powody:\n1️⃣ jesteś w **innej zakładce** lub na innym ekranie,\n2️⃣ tabela jest **pusta** (nie ma jeszcze danych),\n3️⃣ ta opcja jest **tylko dla Admina** — Ksiądz jej nie zobaczy,\n4️⃣ strona jest **bardzo powiększona** — zmniejsz powiększenie w przeglądarce.\nMożesz też wrócić o krok albo napisać do Admina.', 'Cannot see the highlighted spot? 🔍 Common reasons:\n1️⃣ you are on **another tab** or screen,\n2️⃣ the table is **empty**,\n3️⃣ the option is **Admin-only**,\n4️⃣ the page is **zoomed in** a lot.\nYou can also go back a step or write to the Admin.', 'Не бачите підсвіченого місця? 🔍 Типові причини:\n1️⃣ ви на **іншій вкладці** чи екрані,\n2️⃣ таблиця **порожня**,\n3️⃣ опція **лише для Адміністратора**,\n4️⃣ сторінка **сильно збільшена**.\nМожна також повернутися на крок або написати Адміністратору.'),
        utknal: T('Widzę, że ten krok trwa długo 🙂 Mogę **przeczytać go na głos**, pokazać miejsce jeszcze raz albo (w trybie „klikaj za mnie”) kliknąć bezpieczne rzeczy za Ciebie.', 'This step is taking a while 🙂 I can **read it aloud**, show the spot again or (in click-for-me mode) click safe things for you.', 'Цей крок триває довго 🙂 Можу **прочитати його вголос**, показати місце ще раз або (у режимі «клікай за мене») натиснути безпечне за вас.')
    };
    const NAZWY_K = {
        start: T('Strona startowa', 'Start page', 'Головна сторінка'), login: T('Logowanie', 'Sign in', 'Вхід'), kiosk: T('Kiosk', 'Kiosk', 'Кіоск'),
        'kiosk-ksiadz': T('Kiosk — tryb Księdza', 'Kiosk — Priest mode', 'Кіоск — режим Священника'), 'kiosk-admin': T('Kiosk — tryb Admina', 'Kiosk — Admin mode', 'Кіоск — режим Адміністратора'),
        ministrant: T('Panel ministranta', 'Altar server panel', 'Панель служителя'), ksiadz: T('Panel Księdza', 'Priest panel', 'Панель Священника'), admin: T('Panel Admina', 'Admin panel', 'Панель Адміністратора')
    };
    const KOMENDY = [
        [/^(czesc|hej|witaj|siema|hello|hi|hey|dzien dobry|dobry wieczor|привіт|добрий день)( |$)/, 'powitanie'],
        [/(dziekuj|dzieki|thanks|thank you|дякую)/, 'dzieki'],
        [/(kim jestes|kto ty|co potrafisz|co umiesz|jak sie nazywasz|who are you|what can you do|хто ти)/, 'ktoja'],
        [/(parametr|jak dzialasz|jak jestes zbudowan|czy jestes (prawdziw\w+ )?(ai|sztuczn)|sieci neuronow|neural|jak sie uczysz)/, 'model'],
        [/(zapomnij (czego sie nauczyles|wszystko|moje wybory)|wyczysc (nauke|pamiec)|forget what you learned|reset learning)/, 'zapomnij'],
        [/(nie rozumiem|nie ogarniam|za trudne|prosciej|wytlumacz (to )?inaczej|i do not understand|i don t understand|не розумію)/, 'nie_rozumiem'],
        [/(nie klikaj|wylacz (tryb )?auto|sam(a)? klikne|turn off auto|stop click)/, 'auto_off'],
        [/(klik(aj|nij|ac) za mnie|sam(a)? klikaj|tryb auto|wlacz (tryb )?auto|click for me|auto ?click)/, 'auto_on'],
        [/(przeczytaj|czytaj na glos|read aloud|read it)/, 'czytaj'],
        [/(wiekszy tekst|powieksz|wieksza czcionk|nie widze literek|larger text|bigger text)/, 'tekst'],
        [/(pokaz gdzie|gdzie to jest|gdzie kliknac|show me where|where is it)/, 'gdzie'],
        [/^(powtorz|jeszcze raz|repeat)/, 'powtorz'],
        [/^(dalej|nastepny|next)$/, 'dalej'],
        [/^(wstecz|poprzedni|back|previous)$/, 'wstecz'],
        [/^(koniec|zakoncz|zamknij|stop|end|close)$/, 'koniec']
    ];
    function tpl(s, z) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (z && z[k] !== undefined) ? z[k] : ''); }
    function lok(o, L) { if (o === null || o === undefined) return ''; if (typeof o === 'string') return o; return o[L] || o.pl || ''; }

    // ------------------------------------------------------------------ MODEL ----
    function wszystkieTeksty(o) { if (o === null || o === undefined) return []; if (typeof o === 'string') return [o]; return ['pl', 'en', 'uk'].map((j) => o[j]).filter(Boolean); }
    function czysc(s) { return String(s).replace(/\*\*/g, '').replace(/\{\w+\}/g, ' '); }
    function zdania(s) { return czysc(s).split(/[\n.!?;:]+/).map((x) => x.trim()).filter((x) => x.length > 3); }
    function edyt(a, b, maks) {
        if (Math.abs(a.length - b.length) > maks) return maks + 1;
        let prev = []; for (let j = 0; j <= b.length; j++) prev[j] = j;
        for (let i = 1; i <= a.length; i++) {
            const cur = [i]; let min = i;
            for (let j = 1; j <= b.length; j++) {
                const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                cur[j] = v; if (v < min) min = v;
            }
            if (min > maks) return maks + 1;
            prev = cur;
        }
        return prev[b.length];
    }

    function utworz(opcje) {
        opcje = opcje || {};
        const przew = opcje.przewodniki || {};
        const cel = opcje.parametry || 120000;
        const DIM = opcje.dim || 16, EPOKI = opcje.epoki || 20, WAGA_NN = (opcje.wagaNN !== undefined) ? opcje.wagaNN : 0.2, LR0 = opcje.lr || 0.1,
            AUG = (opcje.aug !== undefined) ? opcje.aug : 1, WAGA_KNN = (opcje.wagaKnn !== undefined) ? opcje.wagaKnn : 0.3,
            HID = (opcje.ukryte !== undefined) ? opcje.ukryte : 0, DROP = (opcje.dropout !== undefined) ? opcje.dropout : 0.15, LS = (opcje.wygladzanie !== undefined) ? opcje.wygladzanie : 0.05,
            TYPY = opcje.typyCech || 'wgbc', ZNAK = (opcje.znak !== undefined) ? !!opcje.znak : true, PODW = !!opcje.podwojny, NORM_POOL = opcje.pooling || 'srednia',
            KROKI_W_SIECI = (opcje.krokiWSieci !== undefined) ? opcje.krokiWSieci : true, WAGI_KLAS = !!opcje.wagiKlas, ADAGRAD = !!opcje.adagrad,
            WAGA_ZNAKI = opcje.wagaZnaki || 0, KNN_K = opcje.knnK || 1,
            WSTRZ = opcje.wstrzymaj || null;   // zbiór znormalizowanych pytań wzorcowych pomijanych przy uczeniu (walidacja krzyżowa)

        // --- tematy (unikalne po id) i ich konteksty
        const tematy = []; const mapa = {};
        Object.keys(przew).forEach((k) => (przew[k] || []).forEach((t) => {
            let m = mapa[t.id];
            if (!m) { m = mapa[t.id] = { t: t, konteksty: [], c: tematy.length }; tematy.push(m); }
            if (m.konteksty.indexOf(k) < 0) m.konteksty.push(k);
        }));
        const C = tematy.length;
        const R = HID > 0 ? HID : DIM;                                   // szerokość reprezentacji przed warstwą wyjściową
        const reszta = (HID > 0 ? DIM * HID + HID : 0) + R * C + C;       // parametry poza tablicą osadzeń
        const B = Math.max(256, Math.floor((cel - reszta) / DIM));
        const parametry = B * DIM + reszta;

        // --- korpus uczący + słownik
        const znane = new Set(); const listaSlow = []; const slownikPelny = new Set();
        function zapamietaj(tekst) { norm(tekst).split(' ').forEach((w) => { if (w.length >= 3) slownikPelny.add(w); if (w.length >= 4 && !znane.has(w)) { znane.add(w); listaSlow.push(w); } }); }
        Object.keys(GRUPY).forEach((g) => zapamietaj(GRUPY[g]));
        const ZIARNO = opcje.ziarno || 0;
        const przyklady = []; const rnd = lcg(777 + ZIARNO);
        // Wariant z podmienionymi synonimami („zgubiłem” → „straciłem”): uczy sieć, że różne słowa znaczą to samo
        function zamienSynonimy(t) {
            const sl = t.split(/\s+/); let zmian = 0;
            for (let i = 0; i < sl.length && zmian < 2; i++) {
                const n0 = norm(sl[i]); if (!n0) continue;
                const gr = GRUPY_MAPA[rdzen(n0)]; if (!gr || rnd() < 0.35) continue;
                const lista = GRUPY_LISTY[gr[0]].filter((w) => rdzen(w) !== rdzen(n0)); if (!lista.length) continue;
                sl[i] = lista[Math.floor(rnd() * lista.length)]; zmian++;
            }
            return zmian ? sl.join(' ') : null;
        }
        function dodaj(tekst, c, kopii, wariant, aug, zKroku) {
            const t = czysc(tekst).trim(); if (t.length < 3) return;
            zapamietaj(t);
            if (zKroku && !KROKI_W_SIECI) return;     // zdania z kroków mogą uczyć tylko TF-IDF, nie sieć
            for (let i = 0; i < kopii; i++) przyklady.push({ tekst: t, c: c });
            for (let a = 0; a < (aug || 0) * AUG; a++) { const v = zamienSynonimy(t); if (v) przyklady.push({ tekst: v, c: c }); }
            if (wariant) {   // wariant z wyrzuconym co trzecim słowem — uczy odporności na skrót myślowy
                const sl = t.split(/\s+/); if (sl.length >= 4) { const w2 = sl.filter((_, i) => (i + Math.floor(rnd() * 3)) % 3 !== 0); if (w2.length >= 2) przyklady.push({ tekst: w2.join(' '), c: c }); }
            }
        }
        const dokTekst = tematy.map(() => []);
        tematy.forEach((m) => {
            const t = m.t, c = m.c;
            wszystkieTeksty(t.tytul).forEach((x) => { dodaj(x, c, 3, true, 1); dokTekst[c].push([x, 3]); });
            wszystkieTeksty(t.opis).forEach((x) => { dodaj(x, c, 2, true, 1); dokTekst[c].push([x, 2]); });
            if (t.slowa) { const sl = String(t.slowa).split(/\s+/); for (let i = 0; i < sl.length; i += 3) { const ch = sl.slice(i, i + 4).join(' '); dodaj(ch, c, 2, false); dokTekst[c].push([ch, 2]); } }
            (PYTANIA[t.id] || []).filter((x) => !(WSTRZ && WSTRZ.has(norm(x)))).forEach((x) => { dodaj(x, c, 3, true, 2); dokTekst[c].push([x, 3]); });
            let licz = 0;
            (t.kroki || []).forEach((s) => {
                wszystkieTeksty(s.tytul).forEach((x) => { if (licz++ < 40) { dodaj(x, c, 1, false, 0, true); dokTekst[c].push([x, 1]); } });
                wszystkieTeksty(s.tekst).forEach((x) => zdania(x).forEach((z) => { if (licz++ < 40) { dodaj(z, c, 1, false, 0, true); dokTekst[c].push([z, 1]); } }));
            });
        });
        // baza wiedzy też uczy sieć (pytania → powiązany temat)
        WIEDZA.forEach((w) => { const id = (w.tematy || []).filter((i) => mapa[i])[0]; if (!id) return; w.pytania.forEach((p) => { dodaj(p, mapa[id].c, 2, true, 1); dokTekst[mapa[id].c].push([p, 2]); }); });

        function poprawSlowo(w) {
            const maks = w.length >= 8 ? 2 : 1; let najl = null, nd = maks + 1;
            for (let i = 0; i < listaSlow.length; i++) { const k = listaSlow[i]; if (k[0] !== w[0]) continue; const d = edyt(w, k, maks); if (d < nd) { nd = d; najl = k; if (d === 1) break; } }
            return najl || w;
        }
        function cechy(tekst, popraw) {
            const slowa = norm(tekst).split(' ').filter((w) => w && !STOP.has(w));
            const f = []; let prev = null;
            slowa.forEach((w0) => {
                let w = w0; if (popraw && w.length >= 4 && !znane.has(w)) w = poprawSlowo(w);
                const r = rdzen(w);
                f.push('w:' + r);
                (GRUPY_MAPA[r] || []).forEach((g) => f.push('g:' + g));
                if (w.length >= 5) for (let i = 0; i <= w.length - 3 && i < 8; i++) f.push('c:' + w.substr(i, 3));
                if (prev) f.push('b:' + prev + '_' + r);
                prev = r;
            });
            return f;
        }
        const hash = (f) => fnv(f) % B;
        // Kodowanie cech dla sieci: (numer koszyka << 1) | bit znaku. Opcje: znak losowy (mniej szkodliwe kolizje), podwójne haszowanie (każda cecha w dwóch koszykach).
        function idsZ(f) {
            const out = [];
            for (let i = 0; i < f.length; i++) {
                if (TYPY.indexOf(f[i][0]) < 0) continue;
                const h1 = fnv(f[i]); out.push(((h1 % B) << 1) | (ZNAK ? ((h1 >>> 20) & 1) : 0));
                if (PODW) { const h2 = fnv('#' + f[i]); out.push(((h2 % B) << 1) | (ZNAK ? ((h2 >>> 20) & 1) : 0)); }
            }
            return Int32Array.from(out);
        }

        // --- TF-IDF (słowa, grupy, pary) po tematach
        const doc = tematy.map(() => ({})); const df = {};
        dokTekst.forEach((lista, c) => lista.forEach(([x, w]) => cechy(x, false).forEach((f) => { if (f[0] === 'c') return; doc[c][f] = (doc[c][f] || 0) + w; })));
        doc.forEach((d) => Object.keys(d).forEach((f) => { df[f] = (df[f] || 0) + 1; }));
        const idf = (f) => Math.log(1 + C / (df[f] || 0.5));
        const dnorm = doc.map((d) => { let s = 0; Object.keys(d).forEach((f) => { const v = Math.log(1 + d[f]) * idf(f); s += v * v; }); return Math.sqrt(s) || 1; });
        function cosinusy(tekst) {
            const q = {}; cechy(tekst, true).forEach((f) => { if (f[0] === 'c') return; q[f] = (q[f] || 0) + 1; });
            let qn = 0; const qv = {}; Object.keys(q).forEach((f) => { const v = (f[0] === 'g' ? 0.6 : (f[0] === 'b' ? 0.7 : 1)) * Math.log(1 + q[f]) * idf(f); qv[f] = v; qn += v * v; });
            qn = Math.sqrt(qn) || 1;
            return doc.map((d, c) => { let s = 0; Object.keys(qv).forEach((f) => { if (d[f]) s += qv[f] * Math.log(1 + d[f]) * idf(f); }); return s / (qn * dnorm[c]); });
        }

        // --- TF-IDF po trójkach liter (odporność na literówki i końcówki fleksyjne)
        const docC = tematy.map(() => ({})); const dfC = {};
        dokTekst.forEach((lista, c) => lista.forEach(([x, w]) => cechy(x, false).forEach((f) => { if (f[0] !== 'c') return; docC[c][f] = (docC[c][f] || 0) + w; })));
        docC.forEach((d) => Object.keys(d).forEach((f) => { dfC[f] = (dfC[f] || 0) + 1; }));
        const idfC = (f) => Math.log(1 + C / (dfC[f] || 0.5));
        const dnormC = docC.map((d) => { let sN = 0; Object.keys(d).forEach((f) => { const v = Math.log(1 + d[f]) * idfC(f); sN += v * v; }); return Math.sqrt(sN) || 1; });
        function cosinusyZnaki(tekst) {
            const q = {}; cechy(tekst, true).forEach((f) => { if (f[0] === 'c') q[f] = (q[f] || 0) + 1; });
            let qn = 0; const qv = {}; Object.keys(q).forEach((f) => { const v = Math.log(1 + q[f]) * idfC(f); qv[f] = v; qn += v * v; }); qn = Math.sqrt(qn) || 1;
            return docC.map((d, c) => { let sN = 0; Object.keys(qv).forEach((f) => { if (d[f]) sN += qv[f] * Math.log(1 + d[f]) * idfC(f); }); return sN / (qn * dnormC[c]); });
        }

        // --- baza wiedzy: wyszukiwanie po pytaniach
        const wPyt = [];   // każde pytanie wzorcowe z bazy wiedzy osobno (dopasowanie = najlepsze pojedyncze pytanie)
        WIEDZA.forEach((w, i) => w.pytania.forEach((p) => { const d = {}; cechy(p, false).forEach((f) => { if (f[0] !== 'c') d[f] = (d[f] || 0) + 1; }); wPyt.push({ i: i, d: d, n: 1 }); }));
        const wdf = {}; wPyt.forEach((x) => Object.keys(x.d).forEach((f) => { wdf[f] = (wdf[f] || 0) + 1; }));
        const widf = (f) => Math.log(1 + wPyt.length / (wdf[f] || 0.5));
        wPyt.forEach((x) => { let s = 0; Object.keys(x.d).forEach((f) => { const v = Math.log(1 + x.d[f]) * widf(f); s += v * v; }); x.n = Math.sqrt(s) || 1; });
        function szukajWiedzy(tekst) {
            const q = {}; cechy(tekst, true).forEach((f) => { if (f[0] !== 'c') q[f] = (q[f] || 0) + 1; });
            let qn = 0; const qv = {}; Object.keys(q).forEach((f) => { const v = (f[0] === 'g' ? 0.6 : 1) * Math.log(1 + q[f]) * widf(f); qv[f] = v; qn += v * v; }); qn = Math.sqrt(qn) || 1;
            let best = -1, bs = 0;
            wPyt.forEach((x) => { let s = 0; Object.keys(qv).forEach((f) => { if (x.d[f]) s += qv[f] * Math.log(1 + x.d[f]) * widf(f); }); s /= (qn * x.n); if (s > bs) { bs = s; best = x.i; } });
            return best < 0 ? null : { w: WIEDZA[best], wynik: bs };
        }

        // --- sieć: osadzenia E[B×DIM] (średnia) → warstwa wyjściowa Wo[C×DIM] + b[C] → softmax
        let E = null, W1 = null, b1 = null, Wo = null, bo = null, dane = null, stan = null;
        const h0 = new Float64Array(DIM), h = new Float64Array(R), gA = new Float64Array(R), gH0 = new Float64Array(DIM), dz = new Float64Array(Math.max(1, HID)), lg = new Float64Array(C);
        const rndTr = lcg(4242 + ZIARNO); let bufDrop = new Int32Array(512);
        function przygotujDane() { if (dane) return; dane = []; przyklady.forEach((p) => { const ids = idsZ(cechy(p.tekst, false)); if (ids.length) dane.push({ ids: ids, c: p.c }); }); }
        function inicjuj() {
            const r = lcg(12345 + ZIARNO); E = new Float32Array(B * DIM); for (let i = 0; i < E.length; i++) E[i] = (r() - 0.5) / DIM;
            if (HID > 0) { W1 = new Float32Array(DIM * HID); const sk = Math.sqrt(6 / (DIM + HID)); for (let i = 0; i < W1.length; i++) W1[i] = (r() * 2 - 1) * sk; b1 = new Float32Array(HID); }
            Wo = new Float32Array(C * R); bo = new Float32Array(C);
            przygotujDane();
            stan = { epoka: 0, i: 0, kolej: null, gotowe: false };
        }
        // Przejście w przód: średnia osadzeń cech → (opcjonalnie warstwa ukryta tanh) → warstwa wyjściowa → softmax. Reprezentacja trafia do `h`.
        function przod(ids) {
            const n = ids.length; h0.fill(0);
            for (let k = 0; k < n; k++) { const v = ids[k], o = (v >> 1) * DIM, sg = (v & 1) ? -1 : 1; for (let j = 0; j < DIM; j++) h0[j] += sg * E[o + j]; }
            const dz0 = NORM_POOL === 'pierwiastek' ? Math.sqrt(n) : n; for (let j = 0; j < DIM; j++) h0[j] /= dz0;
            if (HID > 0) { for (let u = 0; u < HID; u++) { let sU = b1[u]; for (let i = 0; i < DIM; i++) sU += h0[i] * W1[i * HID + u]; h[u] = Math.tanh(sU); } }
            else for (let j = 0; j < DIM; j++) h[j] = h0[j];
            let mx = -1e30;
            for (let c = 0; c < C; c++) { let sC = bo[c]; const o = c * R; for (let j = 0; j < R; j++) sC += Wo[o + j] * h[j]; lg[c] = sC; if (sC > mx) mx = sC; }
            let z = 0; for (let c = 0; c < C; c++) { lg[c] = Math.exp(lg[c] - mx); z += lg[c]; }
            for (let c = 0; c < C; c++) lg[c] /= z;
            return lg;
        }
        function krok(d, lr, trening) {
            let ids = d.ids;
            if (trening && DROP > 0 && ids.length > 1) {      // „dropout cech”: losowo gubimy część słów — sieć nie może polegać na jednym słowie
                if (ids.length > bufDrop.length) bufDrop = new Int32Array(ids.length * 2);
                let zn = 0; for (let k = 0; k < ids.length; k++) if (rndTr() >= DROP) bufDrop[zn++] = ids[k];
                if (!zn) bufDrop[zn++] = d.ids[Math.floor(rndTr() * d.ids.length)];
                ids = bufDrop.subarray(0, zn);
            }
            const n = ids.length; przod(ids); gA.fill(0);
            const tPoprawna = 1 - LS, tInna = C > 1 ? LS / (C - 1) : 0;      // wygładzanie etykiet
            for (let c = 0; c < C; c++) {
                const g = lg[c] - (c === d.c ? tPoprawna : tInna); if (g > -1e-4 && g < 1e-4) continue;
                const o = c * R;
                for (let j = 0; j < R; j++) { gA[j] += g * Wo[o + j]; Wo[o + j] -= lr * g * h[j]; }
                bo[c] -= lr * g * 0.1;
            }
            if (HID > 0) {
                for (let u = 0; u < HID; u++) dz[u] = gA[u] * (1 - h[u] * h[u]);
                for (let i = 0; i < DIM; i++) { let sI = 0; const o = i * HID; for (let u = 0; u < HID; u++) { sI += W1[o + u] * dz[u]; W1[o + u] -= lr * h0[i] * dz[u]; } gH0[i] = sI; }
                for (let u = 0; u < HID; u++) b1[u] -= lr * dz[u] * 0.1;
            } else for (let j = 0; j < DIM; j++) gH0[j] = gA[j];
            const dz1 = NORM_POOL === 'pierwiastek' ? Math.sqrt(n) : n;
            for (let k = 0; k < n; k++) { const v = ids[k], o = (v >> 1) * DIM, sg = (v & 1) ? -1 : 1; for (let j = 0; j < DIM; j++) E[o + j] -= lr * sg * gH0[j] / dz1; }
        }
        function trenujKawalek(ms) {
            if (!stan) inicjuj();
            const t0 = Date.now();
            while (!stan.gotowe) {
                if (!stan.kolej) { const r = lcg(99 + ZIARNO + stan.epoka); stan.kolej = dane.map((_, i) => i); for (let i = stan.kolej.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = stan.kolej[i]; stan.kolej[i] = stan.kolej[j]; stan.kolej[j] = t; } stan.i = 0; }
                const lr = LR0 * (1 - stan.epoka / EPOKI) + 0.04;
                const koniecKawalka = Math.min(stan.kolej.length, stan.i + 64);
                for (; stan.i < koniecKawalka; stan.i++) krok(dane[stan.kolej[stan.i]], lr, true);
                if (stan.i >= stan.kolej.length) { stan.kolej = null; stan.epoka++; if (stan.epoka >= EPOKI) stan.gotowe = true; }
                if (ms !== undefined && Date.now() - t0 > ms) break;
            }
            return stan.gotowe;
        }
        function trenuj() { while (!trenujKawalek(1000)) { /* synchronicznie do końca */ } return true; }
        function gotowy() { return !!(stan && stan.gotowe); }
        function postep() { return stan ? Math.min(1, (stan.epoka + (stan.kolej ? stan.i / stan.kolej.length : 0)) / EPOKI) : 0; }

        // --- uczenie na wyborach człowieka (online): zapytanie → temat, który faktycznie wybrał
        const uczone = [];
        function naucz(zapytanie, idTematu, powtorzen) {
            const m = mapa[idTematu]; if (!m || !gotowy()) return false;
            const ids = idsZ(cechy(zapytanie, true)); if (!ids.length) return false;
            const d = { ids: ids, c: m.c };
            for (let i = 0; i < (powtorzen || 6); i++) krok(d, 0.12);
            dane.push(d);
            if (knnH) { const nH = new Float32Array(knnH.length + R), nC = new Int32Array(knnC.length + 1); nH.set(knnH); nC.set(knnC); przod(ids); let nn = 0; for (let j = 0; j < R; j++) nn += h[j] * h[j]; nn = Math.sqrt(nn) || 1; for (let j = 0; j < R; j++) nH[knnH.length + j] = h[j] / nn; nC[knnC.length] = m.c; knnH = nH; knnC = nC; }
            cechy(zapytanie, true).forEach((f) => { if (f[0] !== 'c') doc[m.c][f] = (doc[m.c][f] || 0) + 3; });
            let sN = 0; Object.keys(doc[m.c]).forEach((f) => { const v = Math.log(1 + doc[m.c][f]) * idf(f); sN += v * v; }); dnorm[m.c] = Math.sqrt(sN) || 1;
            uczone.push({ q: zapytanie, id: idTematu });
            return true;
        }
        // --- zapis / odczyt wag (pamięć podręczna: po ponownym otwarciu nie trzeba uczyć sieci od nowa)
        const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        function doB64(u8) { let o = ''; for (let i = 0; i < u8.length; i += 3) { const a = u8[i], b = i + 1 < u8.length ? u8[i + 1] : 0, c2 = i + 2 < u8.length ? u8[i + 2] : 0; o += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < u8.length ? B64[((b & 15) << 2) | (c2 >> 6)] : '=') + (i + 2 < u8.length ? B64[c2 & 63] : '='); } return o; }
        function zB64(str) { const clean = str.replace(/=+$/, ''); const out = new Uint8Array(Math.floor(clean.length * 3 / 4)); let p = 0; for (let i = 0; i < clean.length; i += 4) { const a = B64.indexOf(clean[i]), b = B64.indexOf(clean[i + 1]), c2 = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0, d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0; out[p++] = (a << 2) | (b >> 4); if (i + 2 < clean.length) out[p++] = ((b & 15) << 4) | (c2 >> 2); if (i + 3 < clean.length) out[p++] = ((c2 & 3) << 6) | d; } return out; }
        function kwant(tab) { let mx = 0; for (let i = 0; i < tab.length; i++) { const v = Math.abs(tab[i]); if (v > mx) mx = v; } const sk = mx / 32767 || 1; const u = new Uint8Array(tab.length * 2); for (let i = 0; i < tab.length; i++) { const q = Math.max(-32767, Math.min(32767, Math.round(tab[i] / sk))) + 32768; u[2 * i] = q >> 8; u[2 * i + 1] = q & 255; } return { s: sk, d: doB64(u) }; }
        function odkwant(o, tab) { const u = zB64(o.d); for (let i = 0; i < tab.length; i++) tab[i] = (((u[2 * i] << 8) | u[2 * i + 1]) - 32768) * o.s; }
        const podpis = fnv(tematy.map((m) => m.t.id).join(',') + '|' + przyklady.length + '|' + B + '|' + DIM + '|' + EPOKI + '|' + LR0 + '|' + AUG + '|' + HID + '|' + DROP + '|' + LS + '|' + TYPY + '|' + ZNAK + '|' + PODW + '|' + NORM_POOL + '|v4');
        function eksportuj() { if (!gotowy()) return null; const o = { v: 4, podpis: podpis, E: kwant(E), Wo: kwant(Wo), bo: kwant(bo) }; if (HID > 0) { o.W1 = kwant(W1); o.b1 = kwant(b1); } return o; }
        function importuj(obj) {
            try {
                if (!obj || obj.v !== 4 || obj.podpis !== podpis) return false;
                przygotujDane(); E = new Float32Array(B * DIM); Wo = new Float32Array(C * R); bo = new Float32Array(C);
                odkwant(obj.E, E); odkwant(obj.Wo, Wo); odkwant(obj.bo, bo);
                if (HID > 0) { W1 = new Float32Array(DIM * HID); b1 = new Float32Array(HID); odkwant(obj.W1, W1); odkwant(obj.b1, b1); }
                stan = { epoka: EPOKI, i: 0, kolej: null, gotowe: true }; knnH = null; knnC = null; return true;
            } catch (e) { return false; }
        }

        // --- sąsiedzi w nauczonej przestrzeni osadzeń: podobieństwo do KONKRETNYCH przykładów (uzupełnia uśrednione prawdopodobieństwo sieci)
        let knnH = null, knnC = null;
        function przygotujKnn() {
            const uniq = {}; const idsH = [];
            dane.forEach((d) => { const k = d.c + ':' + Array.prototype.join.call(d.ids, ','); if (!uniq[k]) { uniq[k] = 1; idsH.push(d); } });
            knnH = new Float32Array(idsH.length * R); knnC = new Int32Array(idsH.length);
            idsH.forEach((d, i) => { przod(d.ids); let nn = 0; for (let j = 0; j < R; j++) nn += h[j] * h[j]; nn = Math.sqrt(nn) || 1; for (let j = 0; j < R; j++) knnH[i * R + j] = h[j] / nn; knnC[i] = d.c; });
        }
        function knnWyniki(ids) {
            const w = new Float64Array(C);
            if (!knnH) przygotujKnn();
            przod(ids); let nn = 0; for (let j = 0; j < R; j++) nn += h[j] * h[j]; nn = Math.sqrt(nn) || 1;
            const q = []; for (let j = 0; j < R; j++) q[j] = h[j] / nn;
            if (KNN_K <= 1) {
                for (let i = 0; i < knnC.length; i++) { let s = 0; const o = i * R; for (let j = 0; j < R; j++) s += q[j] * knnH[o + j]; if (s > w[knnC[i]]) w[knnC[i]] = s; }
                return w;
            }
            const top = []; for (let c = 0; c < C; c++) top.push([]);
            for (let i = 0; i < knnC.length; i++) { let s = 0; const o = i * R; for (let j = 0; j < R; j++) s += q[j] * knnH[o + j]; const L = top[knnC[i]]; L.push(s); if (L.length > KNN_K * 3) { L.sort((a, b) => b - a); L.length = KNN_K; } }
            for (let c = 0; c < C; c++) { const L = top[c].sort((a, b) => b - a).slice(0, KNN_K); w[c] = L.length ? L.reduce((a, b) => a + b, 0) / L.length : 0; }
            return w;
        }

        // --- ocena tematów dla zapytania
        function ocen(q, ctx) {
            ctx = ctx || {};
            const f = cechy(q, true);
            const idsQ = idsZ(f);
            const p = idsQ.length ? Array.from(przod(idsQ)) : new Array(C).fill(0);
            const cs = cosinusy(q);
            const cc = WAGA_ZNAKI > 0 ? cosinusyZnaki(q) : null;
            const kn = (WAGA_KNN > 0 && idsQ.length) ? knnWyniki(idsQ) : null;
            const dostepne = new Set(ctx.tematyKontekstu || []);
            return tematy.map((m, c) => {
                const wKtx = dostepne.size ? dostepne.has(m.t.id) : (ctx.kontekst ? m.konteksty.indexOf(ctx.kontekst) >= 0 : true);
                const csM = cc ? (1 - WAGA_ZNAKI) * cs[c] + WAGA_ZNAKI * cc[c] : cs[c];
                let s = WAGA_NN * p[c] + (1 - WAGA_NN) * Math.min(1, csM * 1.6);
                if (kn) { const k = Math.max(0, kn[c]); s = (1 - WAGA_KNN) * s + WAGA_KNN * (k * k * k); }
                if (!wKtx) s *= 0.35;
                if (ctx.temat && ctx.temat === m.t.id) s *= 1.08;
                if (ctx.polecany && ctx.polecany === m.t.id) s *= 1.12;   // temat pasujący do tego, co jest teraz na ekranie
                return { id: m.t.id, wynik: s, p: p[c], cos: cs[c], wKontekscie: wKtx, konteksty: m.konteksty };
            }).sort((a, b) => b.wynik - a.wynik);
        }

        function tytulTematu(id, L) { return mapa[id] ? lok(mapa[id].t.tytul, L) : id; }
        function opisTematu(id, L) { return mapa[id] ? lok(mapa[id].t.opis, L) : ''; }
        function przyciskTematu(id, L, ctx) {
            if (!mapa[id]) return null;
            const wKtx = (ctx.tematyKontekstu || []).indexOf(id) >= 0;
            return wKtx ? { e: '▶ ' + tytulTematu(id, L), a: 'temat', d: id } : null;
        }
        function nazwaKontekstow(id, L) { return mapa[id] ? mapa[id].konteksty.map((k) => lok(NAZWY_K[k], L)).filter((x, i, a) => a.indexOf(x) === i).join(', ') : ''; }

        function odpowiedz(q, ctx) {
            ctx = ctx || {};
            const a = analiza(q, ctx.jezyk || 'pl'); const L = a.jezyk;
            const wynik = { typ: 'temat', tekst: '', przyciski: [], ranking: [], analiza: a };
            if (!a.n) { wynik.typ = 'pusty'; wynik.tekst = lok(S.pusty, L); return wynik; }
            for (let i = 0; i < KOMENDY.length; i++) {
                if (KOMENDY[i][0].test(a.n)) {
                    const k = KOMENDY[i][1]; wynik.typ = 'komenda'; wynik.komenda = k;
                    const dane2 = { p: parametry, w: WIEDZA.length, t: C, b: B, d: DIM, c: C };
                    wynik.tekst = tpl(lok(S[k] || S.powitanie, L), dane2);
                    if (k === 'powitanie') wynik.przyciski = null;
                    return wynik;
                }
            }
            if (!gotowy()) trenuj();
            // znajomość słów: gdy prawie żadne słowo pytania nie występuje w wiedzy o systemie — to inna dziedzina
            const sl = a.tokeny.filter((w) => w.length >= 3 && !STOP.has(w));
            const znaneSl = sl.filter((w) => slownikPelny.has(w) || (w.length >= 4 && poprawSlowo(w) !== w) || GRUPY_MAPA[rdzen(w)]).length;
            wynik.znajomosc = sl.length ? znaneSl / sl.length : 1;
            const ranking = ocen(q, ctx); wynik.ranking = ranking.slice(0, 5);
            const faq = szukajWiedzy(q);
            wynik.faq = faq ? { id: faq.w.id, wynik: faq.wynik } : null;
            const top = ranking[0], drugi = ranking[1];
            const wstep = (a.emocja || a.pilnosc === 'wysoka') ? lok(S.spokojnie, L) + '\n' : '';
            const dostepne = ctx.tematyKontekstu || [];
            function przyciskiFaq(w) {
                const tk = (w.tematy || []).filter((i) => mapa[i]);
                const wKtx = tk.filter((i) => dostepne.indexOf(i) >= 0)[0];
                const btn = []; if (wKtx) btn.push(przyciskTematu(wKtx, L, ctx));
                return btn;
            }
            if (sl.length >= 2 && wynik.znajomosc < 0.34) {
                wynik.typ = 'nie-wiem'; wynik.tekst = wstep + lok(S.poza, L); wynik.przyciski = [{ e: lok(S.kontakt, L), a: 'kontakt' }]; return wynik;
            }
            // 1) odpowiedź z bazy wiedzy (jeśli pytanie wyraźnie o fakt)
            if (faq && faq.wynik >= 0.5 && faq.wynik >= (top.cos * 0.9)) {
                wynik.typ = 'wiedza'; wynik.wiedza = faq.w.id;
                wynik.tekst = wstep + lok(faq.w.odp, L); wynik.przyciski = przyciskiFaq(faq.w);
                if (top.wynik >= 0.4 && top.id !== (wynik.przyciski[0] && wynik.przyciski[0].d) && top.wKontekscie) wynik.przyciski.push(przyciskTematu(top.id, L, ctx));
                wynik.przyciski = wynik.przyciski.filter(Boolean); return wynik;
            }
            // 2) pewny temat
            if (top.wynik >= 0.40 && (top.wynik - drugi.wynik) >= 0.06) {
                wynik.typ = 'temat'; wynik.temat = top.id;
                const opis = opisTematu(top.id, L);
                let tekst = wstep + tpl(lok(S.znalazlem, L), { t: tytulTematu(top.id, L), o: opis ? ' — ' + opis : '' });
                const btn = przyciskTematu(top.id, L, ctx);
                if (btn) { btn.e = lok(S.start, L); wynik.przyciski = [btn]; }
                else tekst += tpl(lok(S.innyKontekst, L), { k: nazwaKontekstow(top.id, L) });
                wynik.tekst = tekst; return wynik;
            }
            // 3) kilka możliwości
            if (top.wynik >= 0.16) {
                wynik.typ = 'wybor';
                const kand = ranking.filter((r) => r.wynik >= top.wynik * 0.45).slice(0, 3);
                wynik.tekst = wstep + lok(S.wybor, L);
                wynik.przyciski = kand.map((r) => ({ e: (r.wKontekscie ? '' : '📍 ') + tytulTematu(r.id, L), a: 'temat', d: r.id, poza: !r.wKontekscie }));
                wynik.przyciski.push({ e: lok(S.zadne, L), a: 'nic' });
                return wynik;
            }
            // 4) nie wiem
            wynik.typ = 'nie-wiem'; wynik.tekst = wstep + lok(S.nieZnam, L);
            wynik.przyciski = ranking.slice(0, 3).filter((r) => r.wKontekscie).map((r) => ({ e: tytulTematu(r.id, L), a: 'temat', d: r.id }));
            wynik.przyciski.push({ e: lok(S.kontakt, L), a: 'kontakt' });
            return wynik;
        }

        return {
            parametry: parametry, tematy: C, cechy: B, wymiar: DIM, przyklady: przyklady.length, wiedza: WIEDZA.length,
            trenuj: trenuj, trenujKawalek: trenujKawalek, gotowy: gotowy, postep: postep, odpowiedz: odpowiedz, ocen: ocen,
            naucz: naucz, eksportuj: eksportuj, importuj: importuj, podpis: podpis, uczone: function () { return uczone.length; },
            statystyki: function () { return { parametry: parametry, tematy: C, cechy: B, wymiar: DIM, przyklady: przyklady.length, wiedza: WIEDZA.length, epoki: EPOKI, uczone: uczone.length, wagaKnn: WAGA_KNN, augmentacja: AUG, ukryte: HID, dropout: DROP, wygladzanie: LS, znak: ZNAK, wagaNN: WAGA_NN, tempoUczenia: LR0, slownik: slownikPelny.size, grupySynonimow: Object.keys(GRUPY).length, formSynonimow: Object.keys(GRUPY_MAPA).length, pytaniaWzorcowe: Object.keys(PYTANIA).reduce((a, k) => a + PYTANIA[k].length, 0) }; }
        };
    }

    return { utworz: utworz, norm: norm, analiza: analiza, wykryjJezyk: wykryjJezyk, PYTANIA: PYTANIA, WIEDZA: WIEDZA, GRUPY: GRUPY, S: S };
});
