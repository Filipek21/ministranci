// ============================================================================
// v2.15.08 — INTERAKTYWNA POMOC („❓ Pomoc” w lewym dolnym rogu)
//
// Przycisk jest widoczny ZAWSZE (Kiosk, logowanie, panel ministranta, panel Księdza, panel Admina, strona startowa).
// Po kliknięciu pokazuje listę tematów dopasowaną do tego, KTO i GDZIE jest (kontekst), np. „Chcę zapisać obecność”.
// Po wyborze tematu system prowadzi krok po kroku: podświetla element, który trzeba kliknąć, i opisuje, co zrobić.
//
// Jak to działa (ważne):
//  • Pomoc NICZEGO nie klika i niczego nie zapisuje w bazie — tylko pokazuje i opisuje. Wszystko robi człowiek.
//  • Kontekst: Kiosk · Kiosk — tryb awaryjny Księdza · Kiosk — tryb awaryjny Admina · logowanie · panel ministranta ·
//    panel Księdza · panel Admina · strona startowa. Każdy kontekst ma własną listę tematów (PRZEWODNIKI poniżej).
//  • Krok może czekać na ekran (np. „wpisz PIN”) — gdy kiosk przejdzie na inny ekran, pomoc sama przeskoczy do pasującego kroku.
//  • Krok może przejść dalej sam, gdy człowiek wykona czynność (np. wejdzie w zakładkę, wpisze 4 cyfry PIN-u).
//  • Kiosk: po 90 s bez dotyku przewodnik sam się zamyka (następna osoba nie zobaczy cudzej pomocy).
//  • Moduł nie zmienia żadnego istniejącego pliku logiki — korzysta tylko z odczytu stanu (sesja, rolaAwaryjna, pinBufor).
//  • Teksty: PL / EN / UK dla Kiosku, logowania, panelu ministranta i strony startowej; panele Księdza i Admina — PL
//    (przy EN/UK pokazują się po polsku — brak tłumaczenia nie psuje działania).
// ============================================================================
(function () {
    'use strict';

    const D = (typeof document !== 'undefined') ? document : null;

    // ------------------------------------------------------------------ POMOCNIKI ----
    const T = (pl, en, uk) => ({ pl: pl, en: en || pl, uk: uk || pl });
    const K = (cel, tytul, tekst, o) => Object.assign({ cel: cel, tytul: tytul, tekst: tekst }, o || {});
    const $ = (id) => (D ? D.getElementById(id) : null);

    function bezpiecznie(f, d) { try { return f(); } catch (e) { return d; } }
    function jez() { return bezpiecznie(() => (typeof jezykBiezacy !== 'undefined' && (jezykBiezacy === 'en' || jezykBiezacy === 'uk' || jezykBiezacy === 'pl')) ? jezykBiezacy : 'pl', 'pl'); }
    function tx(o) { if (o === null || o === undefined) return ''; if (typeof o === 'string') return o; return o[jez()] || o.pl || ''; }
    function tpl(s, z) { return String(s).replace(/\{(\w+)\}/g, (_, k) => (z && z[k] !== undefined) ? z[k] : ''); }
    function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }

    function widoczny(el) { return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }
    function ekranWidoczny(id) { return widoczny($(id)); }
    function pierwszyWidoczny(sel) {
        if (!sel || !D) return null;
        if (typeof sel === 'function') return bezpiecznie(sel, null);
        const lista = D.querySelectorAll(sel);
        for (let i = 0; i < lista.length; i++) if (widoczny(lista[i])) return lista[i];
        return null;
    }
    function sesjaTeraz() { return bezpiecznie(() => (typeof sesja !== 'undefined' ? sesja : null), null); }
    function rolaAwaryjnaTeraz() { return bezpiecznie(() => (typeof rolaAwaryjna !== 'undefined' ? rolaAwaryjna : null), null); }
    function pinDlugosc() { return bezpiecznie(() => (typeof pinBufor === 'string' ? pinBufor.length : 0), 0); }
    function jestAdminem() { const s = sesjaTeraz(); return !!(s && s.is_admin); }

    // ------------------------------------------------------------------ TEKSTY INTERFEJSU ----
    const UI = {
        przycisk: T('Pomoc', 'Help', 'Допомога'),
        przyciskTytul: T('Interaktywna pomoc — podpowiem krok po kroku, co kliknąć', 'Interactive help — I will show you step by step what to tap', 'Інтерактивна допомога — підкажу крок за кроком, що натиснути'),
        menuNaglowek: T('W czym pomóc?', 'What do you need help with?', 'З чим допомогти?'),
        menuStopka: T('Pomoc tylko pokazuje, co kliknąć — niczego nie zmienia w systemie.', 'Help only shows what to tap — it never changes anything in the system.', 'Допомога лише показує, що натиснути — вона нічого не змінює в системі.'),
        zamknij: T('Zamknij', 'Close', 'Закрити'),
        wstecz: T('← Wstecz', '← Back', '← Назад'),
        dalej: T('Dalej →', 'Next →', 'Далі →'),
        gotowe: T('Gotowe ✓', 'Done ✓', 'Готово ✓'),
        tematy: T('☰ Tematy', '☰ Topics', '☰ Теми'),
        krok: T('Krok {n} z {m}', 'Step {n} of {m}', 'Крок {n} з {m}'),
        czekam: T('⏳ Ten krok pojawi się na ekranie, gdy wykonasz poprzedni.', '⏳ This step will appear on screen once you finish the previous one.', '⏳ Цей крок з’явиться на екрані, коли ви виконаєте попередній.'),
        brakCelu: T('Nie widzę tego elementu na ekranie — może jest ukryty albo nie masz do niego uprawnień (część opcji ma tylko Admin). Możesz przejść dalej.', 'I cannot see this item on the screen — it may be hidden or you may not have permission (some options are Admin-only). You can continue.', 'Не бачу цього елемента на екрані — він може бути прихований або у вас немає доступу (деякі опції лише для Адміністратора). Можна продовжити.'),
        brakTematow: T('Dla tego ekranu nie ma jeszcze tematów pomocy.', 'There are no help topics for this screen yet.', 'Для цього екрана ще немає тем допомоги.'),
        zakoncz: T('Zakończ przewodnik', 'End the guide', 'Завершити посібник'),
        tylkoPl: T('', '', '')
    };
    const NAZWY_KONTEKSTU = {
        start: T('Strona startowa', 'Start page', 'Головна сторінка'),
        login: T('Logowanie', 'Sign in', 'Вхід'),
        kiosk: T('Kiosk', 'Kiosk', 'Кіоск'),
        'kiosk-ksiadz': T('Kiosk — tryb Księdza', 'Kiosk — Priest mode', 'Кіоск — режим Священника'),
        'kiosk-admin': T('Kiosk — tryb Admina', 'Kiosk — Admin mode', 'Кіоск — режим Адміністратора'),
        ministrant: T('Panel ministranta', 'Altar server panel', 'Панель служителя'),
        ksiadz: T('Panel Księdza', 'Priest panel', 'Панель Священника'),
        admin: T('Panel Admina', 'Admin panel', 'Панель Адміністратора')
    };

    // ------------------------------------------------------------------ KROKI WSPÓLNE ----
    const kafelek = (n) => '.tabs button[data-tab="' + n + '"]';
    function tabAktywna(n) { return () => { const b = D && D.querySelector(kafelek(n)); return !!b && b.classList.contains('active'); }; }
    // Pierwszy krok większości tematów w panelu: wejdź w zakładkę (przejdzie dalej sam, gdy zakładka jest otwarta)
    function zak(n, nazwa) {
        return K(kafelek(n), 'Zakładka „' + nazwa + '”',
            'Kliknij zakładkę **„' + nazwa + '”** na górnym pasku. Jeśli pasek jest szeroki, przewiń go w bok. Gdy zakładka jest już otwarta — przejdziemy dalej automatycznie.',
            { dalejGdy: tabAktywna(n) });
    }
    const KROK_KONTAKT = K('#btn-kontakt', T('Napisz do Administratora', 'Write to the Administrator', 'Напишіть Адміністратору'),
        T('Przycisk **„Kontakt”** (prawy dolny róg) otwiera okno wiadomości do Administratora — opisz problem, a system dołączy zrzut ekranu. Odpowiedź dostaniesz od Admina.',
            'The **“Contact”** button (bottom-right) opens a message window to the Administrator — describe the problem and the system attaches a screenshot.',
            'Кнопка **«Контакт»** (внизу праворуч) відкриває вікно повідомлення Адміністратору — опишіть проблему, і система додасть знімок екрана.'));

    // ============================================================================
    // PRZEWODNIKI — tematy dla każdego kontekstu
    // ============================================================================

    // ------------------------------------------------------------------ KIOSK (każdy) ----
    const KIOSK = [
        {
            id: 'k-obecnosc', ikona: '✅',
            tytul: T('Chcę zapisać obecność', 'I want to record my attendance', 'Хочу записати присутність'),
            opis: T('Karta QR → PIN → wybór mszy', 'QR card → PIN → choose the Mass', 'Картка QR → PIN → вибір Меси'),
            kroki: [
                K('#ekran-czekanie h2', T('Zeskanuj swoją kartę', 'Scan your card', 'Відскануйте свою картку'),
                    T('Przyłóż kartę ministranta z kodem QR do czytnika. Kiosk sam ją rozpozna — nic nie musisz klikać. **Nie masz czytnika albo karta nie działa?** Otwórz w pomocy temat „Skanowanie kamerą”.',
                        'Hold your altar-server card with the QR code to the reader. The kiosk recognises it by itself — you do not need to tap anything. **No reader, or the card does not work?** Open the help topic “Scanning with the camera”.',
                        'Піднесіть картку служителя з QR-кодом до сканера. Кіоск розпізнає її сам — нічого натискати не треба. **Немає сканера або картка не працює?** Відкрийте тему допомоги «Сканування камерою».'),
                    { ekran: 'ekran-czekanie' }),
                K('.profile-badge', T('Sprawdź, czy to Ty', 'Check that it is you', 'Перевірте, що це ви'),
                    T('Na górze widać imię i nazwisko właściciela karty. Jeśli to **nie Ty**, kliknij na dole „To nie ja — reset” i zacznij od nowa.',
                        'The card owner’s name is shown at the top. If it is **not you**, tap “Not me — reset” at the bottom and start again.',
                        'Угорі видно ім’я власника картки. Якщо це **не ви**, натисніть унизу «Це не я — скинути» і почніть заново.'),
                    { ekran: 'ekran-pin' }),
                K('.numpad', T('Wpisz swój PIN', 'Enter your PIN', 'Введіть свій PIN'),
                    T('Dotknij czterech cyfr swojego PIN-u. Kropki nad klawiaturą pokazują, ile cyfr już wpisano. Pomyłka? Kliknij ⌫ i wpisz cyfrę jeszcze raz.',
                        'Tap the four digits of your PIN. The dots above the keypad show how many digits you have entered. Made a mistake? Tap ⌫ and enter the digit again.',
                        'Натисніть чотири цифри свого PIN. Крапки над клавіатурою показують, скільки цифр уже введено. Помилка? Натисніть ⌫ і введіть цифру ще раз.'),
                    { ekran: 'ekran-pin', dalejGdy: () => pinDlugosc() === 4 }),
                K('#btn-ok', T('Zatwierdź', 'Confirm', 'Підтвердити'),
                    T('Gdy świecą się 4 kropki, kliknij **„Zatwierdź”**. Uwaga: kilka błędnych PIN-ów zablokuje kartę — wtedy zgłoś się do Księdza.',
                        'When all 4 dots are filled, tap **“Confirm”**. Note: several wrong PINs will lock the card — then ask the priest for help.',
                        'Коли заповнені 4 крапки, натисніть **«Підтвердити»**. Увага: кілька хибних PIN заблокують картку — тоді зверніться до Священника.'),
                    { ekran: 'ekran-pin', dalejGdy: () => !ekranWidoczny('ekran-pin') }),
                K('#wybor-wydarzen-lista', T('Wybierz mszę', 'Choose the Mass', 'Оберіть Месу'),
                    T('Kliknij mszę lub wydarzenie, w którym uczestniczysz. Widać tylko te, dla których okno rejestracji jest teraz otwarte (zwykle od 20 minut przed do 5 minut po rozpoczęciu). Pusta lista = jeszcze za wcześnie albo już za późno.',
                        'Tap the Mass or event you are attending. Only events with an open registration window are shown (usually from 20 minutes before to 5 minutes after the start). An empty list means it is too early or too late.',
                        'Натисніть Месу або подію, у якій ви берете участь. Показано лише події з відкритим вікном реєстрації (зазвичай від 20 хв до початку до 5 хв після). Порожній список — ще зарано або вже пізно.'),
                    { ekran: 'ekran-wybor-wydarzenia' }),
                K('#ekran-blok', T('Msza połączona z nabożeństwem', 'Mass combined with a service', 'Меса, поєднана з богослужінням'),
                    T('Wybierz, w czym uczestniczyłeś: **tylko nabożeństwo** (+1 pkt), **tylko mszę** albo **oba**.',
                        'Choose what you attended: **service only** (+1 pt), **Mass only** or **both**.',
                        'Оберіть, у чому ви брали участь: **лише богослужіння** (+1 бал), **лише Меса** або **обидва**.'),
                    { ekran: 'ekran-blok' }),
                K('#wynik-tresc', T('Gotowe! ✅', 'Done! ✅', 'Готово! ✅'),
                    T('**Zielony komunikat** = obecność zapisana, punkty dodane. **Czerwony** = przeczytaj, co poszło nie tak (np. zły PIN albo okno zamknięte). Ekran sam wróci do skanowania po kilku sekundach.',
                        'A **green message** = attendance saved, points added. A **red one** = read what went wrong (e.g. wrong PIN or the window is closed). The screen returns to scanning by itself in a few seconds.',
                        '**Зелене повідомлення** = присутність записано, бали додано. **Червоне** = прочитайте, що пішло не так (напр. хибний PIN або вікно закрите). Екран сам повернеться до сканування за кілька секунд.'),
                    { ekran: 'ekran-wynik', koniec: true })
            ]
        },
        {
            id: 'k-kamera', ikona: '📷',
            tytul: T('Skanowanie kamerą (bez czytnika)', 'Scanning with the camera (no reader)', 'Сканування камерою (без сканера)'),
            opis: T('Gdy czytnik nie działa lub go nie ma', 'When the reader is missing or not working', 'Коли сканера немає або він не працює'),
            kroki: [
                K('#btn-skaner-kamery', T('Włącz skaner kamery', 'Open the camera scanner', 'Увімкніть сканер камери'),
                    T('Kliknij **„📷 Skanuj kamerą”**. Przeglądarka może zapytać o zgodę na kamerę — wybierz „Zezwól”.',
                        'Tap **“📷 Scan with camera”**. The browser may ask for camera permission — choose “Allow”.',
                        'Натисніть **«📷 Сканувати камерою»**. Браузер може запитати дозвіл на камеру — оберіть «Дозволити».'),
                    { ekran: 'ekran-czekanie', klik: true }),
                K('#skaner-kamery-okno', T('Pokaż kartę kamerze', 'Show the card to the camera', 'Покажіть картку камері'),
                    T('Trzymaj kartę z kodem QR przed obiektywem, w odległości ok. 15–25 cm, tak by cały kod był w kadrze. Jeśli widzisz złą kamerę (np. przednią), kliknij **„🔄 Zmień kamerę”**.',
                        'Hold the card with the QR code in front of the lens, about 15–25 cm away, so the whole code is in view. If the wrong camera is active (e.g. the front one), tap **“🔄 Change camera”**.',
                        'Тримайте картку з QR-кодом перед об’єктивом на відстані 15–25 см, щоб увесь код був у кадрі. Якщо активна не та камера (напр. фронтальна), натисніть **«🔄 Змінити камеру»**.'),
                    { dalejGdy: () => ekranWidoczny('ekran-pin') }),
                K('.numpad', T('Wpisz PIN i zatwierdź', 'Enter the PIN and confirm', 'Введіть PIN і підтвердьте'),
                    T('Po rozpoznaniu karty wpisz swój PIN i kliknij „Zatwierdź” — dalej tak samo jak w temacie „Chcę zapisać obecność”.',
                        'Once the card is recognised, enter your PIN and tap “Confirm” — then continue as in the topic “I want to record my attendance”.',
                        'Після розпізнавання картки введіть PIN і натисніть «Підтвердити» — далі так само, як у темі «Хочу записати присутність».'),
                    { ekran: 'ekran-pin', koniec: true })
            ]
        },
        {
            id: 'k-specjalna', ikona: '⚱️',
            tytul: T('Pogrzeb / Ślub / Inne (obecność specjalna)', 'Funeral / Wedding / Other (special attendance)', 'Похорон / Весілля / Інше (особлива присутність)'),
            opis: T('Zgłoszenie, które zatwierdza Ksiądz', 'A request the priest approves', 'Заявка, яку підтверджує Священник'),
            kroki: [
                K('#tryb-specjalny-nieaktywny', T('Wybierz rodzaj zgłoszenia', 'Choose the type of request', 'Оберіть тип заявки'),
                    T('Kliknij **⚱️ Pogrzeb**, **💍 Ślub** albo **📋 Inne**. To obecność poza zwykłą mszą — punkty przyznaje później Ksiądz, więc nie pojawią się od razu.',
                        'Tap **⚱️ Funeral**, **💍 Wedding** or **📋 Other**. This is attendance outside a regular Mass — the priest awards the points later, so they will not appear immediately.',
                        'Натисніть **⚱️ Похорон**, **💍 Весілля** або **📋 Інше**. Це присутність поза звичайною Месою — бали пізніше надає Священник, тож вони з’являться не одразу.'),
                    { ekran: 'ekran-czekanie', dalejGdy: () => ekranWidoczny('tryb-specjalny-aktywny') || ekranWidoczny('ekran-pin') }),
                K('#tryb-specjalny-aktywny', T('Tryb zgłoszenia włączony', 'Request mode is on', 'Режим заявки увімкнено'),
                    T('Widzisz nazwę zgłoszenia. Teraz **zeskanuj swoją kartę**. Pomyłka? Kliknij „Anuluj zgłoszenie”.',
                        'The request name is shown. Now **scan your card**. Wrong choice? Tap “Cancel request”.',
                        'Видно назву заявки. Тепер **відскануйте свою картку**. Помилка? Натисніть «Скасувати заявку».'),
                    { ekran: 'ekran-czekanie', dalejGdy: () => ekranWidoczny('ekran-pin') }),
                K('.numpad', T('Wpisz PIN', 'Enter your PIN', 'Введіть свій PIN'),
                    T('Wpisz 4 cyfry swojego PIN-u.', 'Enter the 4 digits of your PIN.', 'Введіть 4 цифри свого PIN.'),
                    { ekran: 'ekran-pin', dalejGdy: () => pinDlugosc() === 4 }),
                K('#btn-ok', T('Zatwierdź zgłoszenie', 'Confirm the request', 'Підтвердіть заявку'),
                    T('Kliknij **„Zatwierdź”**. Zgłoszenie trafi do Księdza, który je zatwierdzi i przyzna punkty.',
                        'Tap **“Confirm”**. The request goes to the priest, who approves it and awards the points.',
                        'Натисніть **«Підтвердити»**. Заявка потрапить до Священника, який підтвердить її і надасть бали.'),
                    { ekran: 'ekran-pin', dalejGdy: () => !ekranWidoczny('ekran-pin') }),
                K('#wynik-tresc', T('Zgłoszenie wysłane', 'Request sent', 'Заявку надіслано'),
                    T('Zielony komunikat oznacza, że zgłoszenie dotarło. Punkty dostaniesz po zatwierdzeniu przez Księdza.',
                        'A green message means the request was received. You get the points after the priest approves it.',
                        'Зелене повідомлення означає, що заявку отримано. Бали ви отримаєте після підтвердження Священником.'),
                    { ekran: 'ekran-wynik', koniec: true })
            ]
        },
        {
            id: 'k-zgubione', ikona: '🆘',
            tytul: T('Zgubiłem kartę / nie pamiętam PIN-u / kod zablokowany', 'Lost card / forgot PIN / code locked', 'Загубив картку / забув PIN / код заблоковано'),
            opis: T('Co zrobić, gdy skan nie działa', 'What to do when scanning fails', 'Що робити, коли сканування не працює'),
            kroki: [
                K(null, T('Zgłoś się do Księdza lub Admina', 'Ask the priest or the Admin', 'Зверніться до Священника або Адміністратора'),
                    T('Bez karty lub PIN-u nie zapiszesz obecności sam. **Poproś Księdza lub Admina** — zapisze Ci obecność ręcznie w trybie awaryjnym kiosku (to bezpieczne i nic nie tracisz).',
                        'You cannot record attendance on your own without the card or PIN. **Ask the priest or the Admin** — they will record it manually in the kiosk emergency mode (it is safe and you lose nothing).',
                        'Без картки чи PIN ви не запишете присутність самостійно. **Попросіть Священника або Адміністратора** — вони запишуть її вручну в аварійному режимі кіоску (це безпечно, нічого не втрачається).')),
                K(null, T('Nowa karta lub nowy PIN', 'New card or new PIN', 'Нова картка або новий PIN'),
                    T('Zgubioną kartę Ksiądz lub Admin **unieważnia** (przestaje działać) i wydaje nową. PIN też ustawia Ksiądz lub Admin — potem możesz zmienić go sam w panelu ministranta.',
                        'The priest or Admin **cancels** a lost card (it stops working) and issues a new one. They also set a new PIN — you can change it yourself later in the altar-server panel.',
                        'Втрачену картку Священник або Адміністратор **анулює** (вона перестає діяти) і видає нову. PIN також встановлюють вони — пізніше ви можете змінити його самі в панелі служителя.'),
                    { koniec: true })
            ]
        },
        {
            id: 'k-wejscie-roli', ikona: '⛪',
            tytul: T('Jestem Księdzem / Adminem — tryb awaryjny', 'I am the priest / Admin — emergency mode', 'Я Священник / Адміністратор — аварійний режим'),
            opis: T('Ręczna obecność, cofanie, odblokowanie…', 'Manual attendance, undo, unlock…', 'Ручна присутність, скасування, розблокування…'),
            kroki: [
                K('#ekran-czekanie h2', T('Zeskanuj swoją kartę', 'Scan your card', 'Відскануйте свою картку'),
                    T('Zeskanuj własną kartę (albo użyj kamery) — tak jak zwykły ministrant.', 'Scan your own card (or use the camera) — just like a regular altar server.', 'Відскануйте власну картку (або скористайтеся камерою) — як звичайний служитель.'),
                    { ekran: 'ekran-czekanie' }),
                K('.numpad', T('Wpisz PIN', 'Enter your PIN', 'Введіть свій PIN'),
                    T('Wpisz swój PIN. **Nie klikaj jeszcze „Zatwierdź”** — to zapisałoby Ci zwykłą obecność.', 'Enter your PIN. **Do not tap “Confirm” yet** — that would record a normal attendance for you.', 'Введіть свій PIN. **Поки не натискайте «Підтвердити»** — це запише вам звичайну присутність.'),
                    { ekran: 'ekran-pin', dalejGdy: () => pinDlugosc() === 4 }),
                K('#btn-tryb-moderator, #btn-tryb-admin', T('Zaloguj się swoją rolą', 'Sign in with your role', 'Увійдіть зі своєю роллю'),
                    T('Kliknij **„Zaloguj się jako Ksiądz”** albo **„Zaloguj się jako Admin”** (zobaczysz tylko ten, który Ci przysługuje). Otworzy się panel awaryjny.',
                        'Tap **“Sign in as Priest”** or **“Sign in as Admin”** (only the one you are entitled to is shown). The emergency panel opens.',
                        'Натисніть **«Увійти як Священник»** або **«Увійти як Адміністратор»** (видно лише ту, на яку ви маєте право). Відкриється аварійна панель.'),
                    { ekran: 'ekran-pin', dalejGdy: () => ekranWidoczny('ekran-admin-awaryjny') }),
                K('#ekran-admin-awaryjny', T('Jesteś w trybie awaryjnym', 'You are in emergency mode', 'Ви в аварійному режимі'),
                    T('Gotowe. Pomoc pokaże teraz tematy dla trybu awaryjnego (ręczna obecność, cofanie pomyłki…).', 'Done. Help now shows the emergency-mode topics (manual attendance, undoing a mistake…).', 'Готово. Тепер допомога покаже теми аварійного режиму (ручна присутність, скасування помилки…).'),
                    { koniec: true })
            ]
        },
        {
            id: 'k-jezyk', ikona: '🌐',
            tytul: T('Zmień język', 'Change the language', 'Змінити мову'),
            opis: T('Polski · English · Українська', 'Polski · English · Українська', 'Polski · English · Українська'),
            kroki: [
                K('.kiosk-jezyk', T('Wybierz język', 'Choose a language', 'Оберіть мову'),
                    T('U góry kliknij przycisk swojego języka: **PL**, **EN** albo **UA**. Po chwili bez dotykania kiosk wraca do języka domyślnego, a każda następna osoba zaczyna w nim od nowa.',
                        'At the top tap your language: **PL**, **EN** or **UA**. After a while without touching, the kiosk returns to its default language, and every next person starts in it.',
                        'Угорі натисніть кнопку своєї мови: **PL**, **EN** або **UA**. Через деякий час без дотиків кіоск повертається до мови за замовчуванням, і кожна наступна людина починає з неї.'),
                    { koniec: true })
            ]
        },
        {
            id: 'k-status', ikona: '📶',
            tytul: T('Pasek statusu i kolejka offline', 'Status bar and offline queue', 'Рядок стану і офлайн-черга'),
            opis: T('Co znaczy kolorowa kropka na górze', 'What the coloured dot at the top means', 'Що означає кольорова крапка вгорі'),
            kroki: [
                K('#kiosk-status', T('Pasek statusu', 'Status bar', 'Рядок стану'),
                    T('Pokazuje, czy kiosk ma połączenie z serwerem. **Bez internetu kiosk nadal działa** — zapisuje obecności w kolejce i sam je wyśle, gdy sieć wróci. Kliknięcie paska otwiera podgląd kolejki.',
                        'It shows whether the kiosk is connected to the server. **Without internet the kiosk keeps working** — it stores attendances in a queue and sends them automatically when the network returns. Tapping the bar opens the queue.',
                        'Показує, чи кіоск має зв’язок із сервером. **Без інтернету кіоск працює** — зберігає присутності в черзі й надсилає їх, коли зв’язок повернеться. Натискання на рядок відкриває чергу.'),
                    { ekran: 'ekran-czekanie' }),
                K('#btn-kolejka', T('Podgląd kolejki', 'Queue view', 'Перегляд черги'),
                    T('Przycisk **„📋 Kolejka”** (z licznikiem) pokazuje obecności czekające na wysłanie. Każdy może je zobaczyć i kliknąć „Synchronizuj teraz”.',
                        'The **“📋 Queue”** button (with a counter) shows attendances waiting to be sent. Anyone can view them and tap “Synchronise now”.',
                        'Кнопка **«📋 Черга»** (з лічильником) показує присутності, що чекають на надсилання. Кожен може їх переглянути й натиснути «Синхронізувати зараз».'),
                    { ekran: 'ekran-czekanie', koniec: true })
            ]
        },
        { id: 'k-kontakt', ikona: '✉️', tytul: T('Zgłoś problem Administratorowi', 'Report a problem to the Administrator', 'Повідомити про проблему Адміністратору'), opis: T('Przycisk „Kontakt”', 'The “Contact” button', 'Кнопка «Контакт»'), kroki: [Object.assign({}, KROK_KONTAKT, { koniec: true })] }
    ];

    // ------------------------------------------------------------------ KIOSK: TRYB AWARYJNY ----
    const E_RECZNA = {
        id: 'e-reczna', ikona: '✍️', grupa: 'Codzienne',
        tytul: 'Zapisz obecność ręcznie (zgubiona karta)', opis: 'Wpisz kod ministranta i wybierz mszę',
        kroki: [
            K('#awaryjny-kod', 'Wpisz kod ministranta', 'Wpisz **kod z karty** ministranta, np. **MIN-007**. Kod jest też na liście w panelu Admina / Księdza.'),
            K('#awaryjny-rodzaj', 'Wybierz rodzaj obecności', '**Msza / wydarzenie** — zwykła obecność. **Obecność specjalna (zgłoszenie)** — pogrzeb, ślub lub inne.'),
            K('#awaryjny-wydarzenie, #awaryjny-typ-zgloszenia', 'Wybierz wydarzenie albo typ', 'Dla mszy wybierz wydarzenie z listy; dla obecności specjalnej — Pogrzeb / Ślub / Inne.'),
            K('#awaryjny-punkty', 'Punkty', 'Domyślnie **1**. Zmień tylko, gdy ma być inaczej (np. 0,5 albo 2).'),
            K('#btn-awaryjny-zapisz', 'Zapisz', 'Kliknij **„Zapisz obecność ręcznie”**. Wpis trafi do historii razem z Twoim kodem.', { klik: true }),
            K('#awaryjny-status', 'Sprawdź wynik', 'Pod przyciskiem zobaczysz potwierdzenie albo przyczynę błędu. Pomyłka? Użyj tematu „Cofnij pomyłkę”.', { koniec: true })
        ]
    };
    const E_COFNIJ = {
        id: 'e-cofnij', ikona: '↩️', grupa: 'Codzienne',
        tytul: 'Cofnij pomyłkę', opis: 'Lista ostatnio zapisanych obecności',
        kroki: [
            K('#tabela-ostatnie-obecnosci', 'Znajdź wpis', 'W tabeli „Ostatnio zapisane obecności” znajdź wiersz z pomyłką (kiedy, kto, wydarzenie, punkty).'),
            K('#tabela-ostatnie-obecnosci button', 'Cofnij', 'Kliknij przycisk w ostatniej kolumnie tego wiersza. Wpis zostanie wycofany, a punkty odjęte. Zmiana zapisuje się w historii.', { koniec: true })
        ]
    };
    const E_ODBLOKUJ = {
        id: 'e-odblokuj', ikona: '🔓', grupa: 'Tylko Admin',
        tytul: 'Odblokuj zablokowany kod', opis: 'Po zbyt wielu błędnych PIN-ach',
        kroki: [
            K('#odblokuj-kiosk-input', 'Wpisz kod do odblokowania', 'Wpisz kod zablokowanej osoby, np. **MIN-007**.'),
            K('#btn-odblokuj-kiosk', 'Odblokuj', 'Kliknij **„Odblokuj”**. Osoba może znów próbować PIN-u.', { klik: true }),
            K('#odblokuj-kiosk-status', 'Sprawdź wynik', 'Pod spodem pojawi się potwierdzenie albo błąd.', { koniec: true })
        ]
    };
    const E_OFFLINE = {
        id: 'e-offline', ikona: '📡', grupa: 'Tylko Admin',
        tytul: 'Tryb offline: dane i synchronizacja', opis: 'Gdy kiosk ma słaby internet',
        kroki: [
            K('#btn-pobierz-offline', 'Pobierz dane offline', 'Kliknij **„Pobierz / odśwież dane do trybu offline”** (najlepiej przy dobrym internecie). Dzięki temu kiosk rozpozna karty także bez sieci.', { klik: true }),
            K('#tabela-kolejka-offline', 'Kolejka offline', 'Tu widać obecności zapisane bez internetu i czekające na wysłanie oraz ich status.'),
            K('#btn-synchronizuj-teraz', 'Synchronizuj teraz', 'Kliknij, aby od razu wysłać kolejkę na serwer (kiosk robi to też sam co kilkanaście sekund, gdy jest sieć).', { koniec: true })
        ]
    };
    const E_CZYSC = {
        id: 'e-czysc', ikona: '🧹', grupa: 'Tylko Admin',
        tytul: 'Wyczyść starą kolejkę', opis: 'Zakończone, przeterminowane i zablokowane wpisy',
        kroki: [
            K('#btn-wyczysc-zakonczone', 'Usuń zakończone', '**„Usuń zakończone wpisy”** sprząta kolejkę z tego, co już poszło na serwer — bezpieczne.'),
            K('#btn-przedluz-24h, #btn-przedluz-7d', 'Przedłuż przeterminowane', 'Wpisy starsze niż okres ważności nie zostaną wysłane. **Przedłuż o 24 h / 7 dni**, jeśli chcesz dać im jeszcze szansę.'),
            K('#btn-wyczysc-zablokowane', 'Usuń zablokowane', 'Ostrożnie: usuwa wpisy, które utknęły i nigdy się nie wyślą — **tych obecności nie da się potem odzyskać z kolejki**. Najpierw sprawdź tabelę kolejki.', { koniec: true })
        ]
    };
    const E_WYJDZ = {
        id: 'e-wyjdz', ikona: '🚪', grupa: 'Codzienne',
        tytul: 'Wyloguj z trybu awaryjnego', opis: 'Kiosk wraca do skanowania',
        kroki: [K('#btn-wyjdz-admin', 'Wyloguj', 'Kliknij **„Wyloguj”** w prawym górnym rogu panelu. Kiosk wraca do ekranu skanowania. Zawsze wylogowuj się po skończeniu — inaczej panel zostanie otwarty dla każdego.', { koniec: true })]
    };

    // ------------------------------------------------------------------ LOGOWANIE ----
    const LOGIN = [
        {
            id: 'l-logowanie', ikona: '🔑',
            tytul: T('Jak się zalogować', 'How to sign in', 'Як увійти'),
            opis: T('Kod + PIN', 'Code + PIN', 'Код + PIN'),
            kroki: [
                K('#login-kod', T('Wpisz swój kod', 'Enter your code', 'Введіть свій код'),
                    T('Wpisz kod ze swojej karty, np. **MIN-001**.', 'Enter the code from your card, e.g. **MIN-001**.', 'Введіть код зі своєї картки, напр. **MIN-001**.')),
                K('#login-pin', T('Wpisz PIN', 'Enter your PIN', 'Введіть PIN'),
                    T('Wpisz swój 4-cyfrowy PIN. Cyfry są ukryte.', 'Enter your 4-digit PIN. The digits are hidden.', 'Введіть свій 4-цифровий PIN. Цифри приховано.')),
                K('#btn-zaloguj', T('Zaloguj się', 'Sign in', 'Увійти'),
                    T('Kliknij **„Zaloguj się”** (albo naciśnij Enter w polu PIN). Zły PIN kilka razy z rzędu zablokuje kod.', 'Tap **“Sign in”** (or press Enter in the PIN field). Several wrong PINs in a row will lock the code.', 'Натисніть **«Увійти»** (або Enter у полі PIN). Кілька хибних PIN поспіль заблокують код.'),
                    { koniec: true })
            ]
        },
        {
            id: 'l-zapomnialem', ikona: '🆘',
            tytul: T('Nie pamiętam PIN-u / kod zablokowany', 'I forgot my PIN / code locked', 'Забув PIN / код заблоковано'),
            opis: T('Kto może pomóc', 'Who can help', 'Хто може допомогти'),
            kroki: [K(null, T('Poproś Księdza lub Admina', 'Ask the priest or the Admin', 'Попросіть Священника або Адміністратора'),
                T('PIN-u nie da się odczytać. **Ksiądz lub Admin ustawi Ci nowy** albo odblokuje kod. Po zalogowaniu zmienisz go sam w panelu („Zmień PIN”).',
                    'A PIN cannot be read back. **The priest or Admin will set a new one** or unlock the code. After signing in you can change it yourself (“Change PIN”).',
                    'PIN не можна прочитати. **Священник або Адміністратор встановить новий** чи розблокує код. Після входу ви зможете змінити його самі («Змінити PIN»).'),
                { koniec: true })]
        },
        { id: 'l-jezyk', ikona: '🌐', tytul: T('Zmień język', 'Change the language', 'Змінити мову'), opis: T('Polski · English · Українська', 'Polski · English · Українська', 'Polski · English · Українська'),
            kroki: [K('#widok-login [data-jezyk-switch]', T('Wybierz język', 'Choose a language', 'Оберіть мову'), T('Kliknij **PL**, **EN** albo **UA** nad polem kodu.', 'Tap **PL**, **EN** or **UA** above the code field.', 'Натисніть **PL**, **EN** або **UA** над полем коду.'), { koniec: true })] },
        { id: 'l-kontakt', ikona: '✉️', tytul: T('Zgłoś problem Administratorowi', 'Report a problem to the Administrator', 'Повідомити про проблему Адміністратору'), opis: T('Przycisk „Kontakt”', 'The “Contact” button', 'Кнопка «Контакт»'), kroki: [Object.assign({}, KROK_KONTAKT, { koniec: true })] }
    ];

    // ------------------------------------------------------------------ PANEL MINISTRANTA ----
    const MINISTRANT = [
        {
            id: 'm-punkty', ikona: '⭐',
            tytul: T('Sprawdź swoje punkty', 'Check my points', 'Перевірити свої бали'),
            opis: T('Punkty w tym miesiącu', 'Points this month', 'Бали цього місяця'),
            kroki: [
                K('#mm-punkty', T('Twoje punkty', 'Your points', 'Ваші бали'),
                    T('Duża liczba na górze to **punkty zebrane w tym miesiącu**. Nowe punkty pojawiają się po zapisaniu obecności w kiosku (czasem po zatwierdzeniu przez Księdza).',
                        'The big number at the top is the **points collected this month**. New points appear after your attendance is recorded at the kiosk (sometimes after the priest approves it).',
                        'Велике число вгорі — **бали, зібрані цього місяця**. Нові бали з’являються після запису присутності в кіоску (іноді після підтвердження Священником).'),
                    { koniec: true })
            ]
        },
        {
            id: 'm-historia', ikona: '📜',
            tytul: T('Zobacz historię obecności', 'See my attendance history', 'Переглянути історію присутності'),
            opis: T('Które msze i ile punktów', 'Which Masses and how many points', 'Які Меси й скільки балів'),
            kroki: [
                K('#mm-hist-miesiac', T('Wybierz miesiąc i rok', 'Choose month and year', 'Оберіть місяць і рік'),
                    T('Wybierz miesiąc z listy i wpisz rok.', 'Choose a month from the list and enter the year.', 'Оберіть місяць зі списку й введіть рік.')),
                K('#btn-mm-pokaz-historie', T('Pokaż', 'Show', 'Показати'),
                    T('Kliknij **„Pokaż”**, żeby wczytać historię za ten miesiąc.', 'Tap **“Show”** to load the history for that month.', 'Натисніть **«Показати»**, щоб завантажити історію за цей місяць.'),
                    { klik: true }),
                K('#mm-historia', T('Twoje obecności', 'Your attendances', 'Ваші присутності'),
                    T('Tabela: wydarzenie, data, jak zaliczono i ile punktów. Nad tabelą jest suma za miesiąc. Widzisz błąd? Napisz do Administratora (przycisk „Kontakt”).',
                        'The table shows the event, date, how it was counted and the points. Above it is the monthly total. Spotted a mistake? Write to the Administrator (the “Contact” button).',
                        'Таблиця: подія, дата, як зараховано і скільки балів. Над нею — сума за місяць. Помітили помилку? Напишіть Адміністратору (кнопка «Контакт»).'),
                    { koniec: true })
            ]
        },
        {
            id: 'm-kalendarz', ikona: '📅',
            tytul: T('Kiedy są msze i wydarzenia', 'When are the Masses and events', 'Коли Меси та події'),
            opis: T('Kalendarz', 'Calendar', 'Календар'),
            kroki: [K('#kal-int-ministrant-karta', T('Kalendarz', 'Calendar', 'Календар'),
                T('Tu widać nadchodzące msze, nabożeństwa i zbiórki. Przewijaj kalendarz i klikaj wydarzenia, żeby zobaczyć szczegóły.', 'Upcoming Masses, services and meetings are shown here. Scroll the calendar and tap events to see details.', 'Тут видно найближчі Меси, богослужіння й збори. Прокручуйте календар і натискайте на події, щоб побачити деталі.'),
                { koniec: true })]
        },
        {
            id: 'm-ranking', ikona: '🏆',
            tytul: T('Ranking i porównanie z poprzednim miesiącem', 'Ranking and comparison with last month', 'Рейтинг і порівняння з минулим місяцем'),
            opis: T('Na którym miejscu jestem', 'Where I stand', 'На якому я місці'),
            kroki: [
                K('#mm-porownanie-karta', T('Porównanie miesięcy', 'Month comparison', 'Порівняння місяців'),
                    T('Pokazuje, czy w tym miesiącu zebrałeś więcej, czy mniej punktów niż w poprzednim.', 'Shows whether you collected more or fewer points this month than last month.', 'Показує, чи цього місяця ви набрали більше чи менше балів, ніж минулого.')),
                K('#mm-ranking', T('Ranking', 'Ranking', 'Рейтинг'),
                    T('Lista wszystkich ministrantów według punktów w tym miesiącu. **Twój wiersz jest podświetlony.**', 'All altar servers ordered by points this month. **Your row is highlighted.**', 'Усі служителі за балами цього місяця. **Ваш рядок підсвічено.**'),
                    { koniec: true })
            ]
        },
        {
            id: 'm-pin', ikona: '🔐',
            tytul: T('Zmień swój PIN', 'Change my PIN', 'Змінити свій PIN'),
            opis: T('4 cyfry, nie za proste', '4 digits, not too simple', '4 цифри, не надто прості'),
            kroki: [
                K('#pin-stary', T('Obecny PIN', 'Current PIN', 'Поточний PIN'), T('Wpisz swój dotychczasowy PIN.', 'Enter your current PIN.', 'Введіть свій поточний PIN.')),
                K('#pin-nowy', T('Nowy PIN', 'New PIN', 'Новий PIN'),
                    T('Wpisz nowy PIN — **4 cyfry**. System odrzuci zbyt proste (np. 1234, 0000). Nie mów PIN-u nikomu.', 'Enter a new PIN — **4 digits**. Overly simple ones (e.g. 1234, 0000) are rejected. Never share your PIN.', 'Введіть новий PIN — **4 цифри**. Надто прості (напр. 1234, 0000) буде відхилено. Нікому не кажіть свій PIN.')),
                K('#btn-zmien-pin', T('Zapisz', 'Save', 'Зберегти'), T('Kliknij **„Zapisz nowy PIN”**. Pod przyciskiem pojawi się potwierdzenie.', 'Tap **“Save new PIN”**. A confirmation appears below the button.', 'Натисніть **«Зберегти новий PIN»**. Під кнопкою з’явиться підтвердження.'),
                    { klik: true }),
                K('#zmien-pin-status', T('Wynik', 'Result', 'Результат'), T('Zielone ✅ = PIN zmieniony. Czerwone ❌ = przeczytaj powód (np. zły obecny PIN).', 'Green ✅ = PIN changed. Red ❌ = read the reason (e.g. wrong current PIN).', 'Зелене ✅ = PIN змінено. Червоне ❌ = прочитайте причину (напр. хибний поточний PIN).'),
                    { koniec: true })
            ]
        },
        {
            id: 'm-jak-obecnosc', ikona: '⛪',
            tytul: T('Jak zapisać obecność na mszy?', 'How do I record my attendance at Mass?', 'Як записати присутність на Месі?'),
            opis: T('Robi się to w kiosku w zakrystii', 'It is done at the sacristy kiosk', 'Це робиться в кіоску в захристії'),
            kroki: [
                K(null, T('Obecność zapisujesz w kiosku', 'You record attendance at the kiosk', 'Присутність записують у кіоску'),
                    T('W tym panelu tylko oglądasz punkty. **Obecność zapisujesz w kiosku w zakrystii**: zeskanuj kartę QR → wpisz PIN → wybierz mszę. Zrób to od ok. 20 minut przed do 5 minut po rozpoczęciu mszy.',
                        'In this panel you only view your points. **You record attendance at the kiosk in the sacristy**: scan your QR card → enter your PIN → choose the Mass. Do it from about 20 minutes before to 5 minutes after the Mass begins.',
                        'У цій панелі ви лише переглядаєте бали. **Присутність записують у кіоску в захристії**: скануйте картку QR → введіть PIN → оберіть Месу. Робіть це приблизно від 20 хв до початку до 5 хв після початку Меси.'),
                    { koniec: true })
            ]
        },
        { id: 'm-jezyk', ikona: '🌐', tytul: T('Zmień język', 'Change the language', 'Змінити мову'), opis: T('Polski · English · Українська', 'Polski · English · Українська', 'Polski · English · Українська'),
            kroki: [K('#widok-ministrant [data-jezyk-switch]', T('Wybierz język', 'Choose a language', 'Оберіть мову'), T('Kliknij **PL**, **EN** albo **UA** w prawym górnym rogu.', 'Tap **PL**, **EN** or **UA** in the top-right corner.', 'Натисніть **PL**, **EN** або **UA** у верхньому правому куті.'), { koniec: true })] },
        { id: 'm-kontakt', ikona: '✉️', tytul: T('Zgłoś problem Administratorowi', 'Report a problem to the Administrator', 'Повідомити про проблему Адміністратору'), opis: T('Przycisk „Kontakt”', 'The “Contact” button', 'Кнопка «Контакт»'), kroki: [Object.assign({}, KROK_KONTAKT, { koniec: true })] },
        { id: 'm-do-panelu', ikona: '🛠️', jesli: () => { const s = sesjaTeraz(); return !!(s && (s.is_admin || s.is_moderator)); },
            tytul: T('Przejdź do panelu administracyjnego', 'Go to the administration panel', 'Перейти до адміністративної панелі'), opis: T('Dla Księdza i Admina', 'For the priest and Admin', 'Для Священника й Адміністратора'),
            kroki: [K('#btn-panel-admina', T('Panel administracyjny', 'Administration panel', 'Адміністративна панель'), T('Na dole kliknij **„Przejdź do Panelu Administracyjnego →”**.', 'At the bottom tap **“Go to the Administration Panel →”**.', 'Унизу натисніть **«Перейти до адміністративної панелі →»**.'), { klik: true, koniec: true })] },
        { id: 'm-wyloguj', ikona: '🚪', tytul: T('Wyloguj się', 'Sign out', 'Вийти'), opis: T('Zawsze po skończeniu na wspólnym urządzeniu', 'Always on a shared device', 'Завжди на спільному пристрої'),
            kroki: [K('#btn-wyloguj', T('Wyloguj', 'Sign out', 'Вийти'), T('Kliknij **„Wyloguj”** w prawym górnym rogu. Na cudzym lub wspólnym urządzeniu rób to zawsze.', 'Tap **“Sign out”** in the top-right corner. Always do this on someone else’s or a shared device.', 'Натисніть **«Вийти»** у верхньому правому куті. На чужому чи спільному пристрої робіть це завжди.'), { koniec: true })] }
    ];

    // ------------------------------------------------------------------ PANEL KSIĘDZA (współdzielony z Adminem) ----
    const PANEL_KSIADZ = [
        {
            id: 'p-wydarzenie', ikona: '📅', grupa: 'Codzienne',
            tytul: 'Dodaj mszę lub wydarzenie', opis: 'Kalendarz — nowe wydarzenie',
            kroki: [
                zak('kalendarz', 'Kalendarz'),
                K('#nowe-typ', 'Wybierz typ', '**Msza Święta**, **Nabożeństwo** albo **Zbiórka**.'),
                K('#nowe-data', 'Ustaw datę i godzinę', 'To jedyne pola obowiązkowe. Kliknij pole i wybierz dzień oraz godzinę **rozpoczęcia**.'),
                K('details.zaawansowane summary', 'Okno rejestracji (opcjonalnie)', 'W „Ustawieniach zaawansowanych” zmienisz nazwę i **okno rejestracji w kiosku**. Domyślnie ministranci mogą się zapisać od **20 minut przed do 5 minut po** rozpoczęciu. Tu też oznaczysz wydarzenie jako część bloku połączonego (np. nabożeństwo + msza).'),
                K('#btn-dodaj-wydarzenie', 'Dodaj wydarzenie', 'Kliknij **„Dodaj wydarzenie”**.', { klik: true }),
                K('#tabela-kalendarz', 'Sprawdź na liście', 'Nowe wydarzenie pojawi się w tabeli. W kolumnie **„Akcje”** możesz je edytować lub usunąć.', { koniec: true })
            ]
        },
        {
            id: 'p-zgloszenia', ikona: '📋', grupa: 'Codzienne',
            tytul: 'Zatwierdź zgłoszenie (pogrzeb / ślub / inne)', opis: 'Zgłoszenia z kiosku',
            kroki: [
                zak('zgloszenia', 'Zgłoszenia'),
                K('#zg-filtr-status', 'Pokaż „Oczekujące”', 'Ministranci zgłaszają w kiosku pogrzeb, ślub lub inną obecność specjalną. Wybierz filtr **„Oczekujące”**, żeby zobaczyć to, co czeka na decyzję.'),
                K('#tabela-zgloszenia', 'Rozpatrz zgłoszenie', 'W wierszu wpisz **liczbę punktów**, potem kliknij **„Zatwierdź”** lub **„Odrzuć”**. Zatwierdzone dodaje punkty ministrantowi. Zgłoszeń Admina rozpatruje tylko Admin.', { koniec: true })
            ]
        },
        {
            id: 'p-reczna', ikona: '✍️', grupa: 'Codzienne',
            tytul: 'Dodaj obecność ręcznie', opis: 'Np. zgubiona karta, awaria kiosku',
            kroki: [
                zak('reczna', 'Ręczna obecność'),
                K('#man-ministrant', 'Wybierz osobę', 'Wybierz ministranta z listy.'),
                K('#man-rodzaj', 'Rodzaj obecności', '**Msza / wydarzenie** albo **Obecność specjalna** (pogrzeb, ślub, inne).'),
                K('#man-blok-msza, #man-blok-zgloszenie', 'Wydarzenie lub typ zgłoszenia', 'Wybierz mszę z listy albo typ zgłoszenia — zależnie od rodzaju.'),
                K('#man-punkty', 'Punkty', '**Zostaw puste** — system policzy punkty według zasad tygodnia (msza: 1 lub 2 pkt). Albo wpisz własną liczbę, np. 1,5.'),
                K('#man-powod', 'Powód (opcjonalnie)', 'Krótka uwaga, np. „zgubiona karta”. Zostanie w historii.'),
                K('#btn-man-zapisz', 'Dodaj obecność', 'Kliknij **„Dodaj obecność”**.', { klik: true }),
                K('#man-status', 'Sprawdź wynik', 'Pod przyciskiem zobaczysz potwierdzenie albo powód odmowy (np. ta osoba już ma tę obecność).', { koniec: true })
            ]
        },
        {
            id: 'p-ministrant', ikona: '➕', grupa: 'Ministranci i karty',
            tytul: 'Dodaj nowego ministranta', opis: 'Konto: imię, nazwisko, kod, PIN',
            kroki: [
                zak('ministranci', 'Ministranci'),
                K('#mi-imie', 'Imię i nazwisko', 'Wpisz **imię** w tym polu, a **nazwisko** w polu poniżej.'),
                K('#mi-kod', 'Kod', 'Nadaj unikalny kod, np. **MIN-014**. Ministrant użyje go do logowania, a kiosk rozpozna po nim kartę.'),
                K('#mi-pin', 'PIN', 'Ustaw początkowy PIN — **4 cyfry**, nie za prosty (nie 1234, 0000). Ministrant zmieni go sam po zalogowaniu.'),
                K('#mi-moderator-wiersz', 'Rola Księdza (tylko Admin)', 'Zaznacz tylko, gdy zakładasz konto **Księdza / Opiekuna**. Zwykłego ministranta zostaw bez zaznaczenia.', { jesli: jestAdminem }),
                K('#btn-dodaj-ministranta', 'Dodaj', 'Kliknij **„Dodaj”**. Konto pojawi się na liście poniżej.', { klik: true }),
                K('#tabela-ministranci', 'Lista ministrantów', 'Tu edytujesz dane, dezaktywujesz i przywracasz konta. Ksiądz zarządza **tylko zwykłymi ministrantami** (nie kontami Księży i Admina).', { koniec: true })
            ]
        },
        {
            id: 'p-plakietka', ikona: '🏷️', grupa: 'Ministranci i karty',
            tytul: 'Wygeneruj lub unieważnij plakietkę (kartę)', opis: 'Gdy karta zgubiona albo potrzebna nowa',
            kroki: [
                zak('ministranci', 'Ministranci'),
                K('#tabela-ministranci tbody [data-akcja="mi-plakietki"]', 'Otwórz plakietki ministranta', 'W wierszu ministranta kliknij przycisk **„Plakietki”**. Pod tabelą otworzy się panel jego plakietek.', { klik: true }),
                K('#btn-nowa-plakietka', 'Wygeneruj nową', 'Kliknij **„+ Wygeneruj nową plakietkę (kartę)”**. Jedno konto może mieć najwyżej 10 aktywnych plakietek.'),
                K('#tabela-plakietki', 'Unieważnij zgubioną', 'W tabeli przy zgubionej plakietce kliknij **„Unieważnij”** — przestanie działać w kiosku. Każda zmiana trafia do historii z Twoim kodem.', { koniec: true })
            ]
        },
        {
            id: 'p-karty', ikona: '🖨️', grupa: 'Ministranci i karty',
            tytul: 'Wydrukuj karty QR (PDF)', opis: 'Generator wizytówek: QR + PIN',
            kroki: [
                zak('karty', 'Generator kart QR'),
                K('#karty-lista', 'Zaznacz ministrantów', 'Zaznacz osoby, dla których chcesz wydrukować karty.'),
                K('#btn-generuj-pdf', 'Generuj PDF', 'Kliknij **„Generuj PDF dla zaznaczonych”** i wydrukuj plik. Przetnij wizytówki wzdłuż linii.', { klik: true }),
                K('#tabela-wszystkie-plakietki', 'Wszystkie wydane plakietki', 'Poniżej widzisz wszystkie plakietki i ich status (aktywna / unieważniona).', { koniec: true })
            ]
        },
        {
            id: 'p-listy', ikona: '📄', grupa: 'Obecności i raporty',
            tytul: 'Listy papierowe: druk i wczytanie', opis: 'Gdy kiosk nie działał',
            kroki: [
                zak('listy', 'Listy papierowe'),
                K('#lst-wydarzenie-druk', '1. Wybierz wydarzenie do wydruku', 'Wybierz mszę, dla której drukujesz pustą listę, i liczbę wierszy.'),
                K('#btn-lst-pdf', 'Pobierz pustą listę', 'Kliknij **„Pobierz listę (PDF)”** i wydrukuj. Ministranci wpisują się odręcznie.', { klik: true }),
                K('#lst-wydarzenie-import', '2. Wczytaj wypełnioną listę', 'Po mszy wybierz to samo wydarzenie, jeśli chcesz zaimportować wypełnioną listę.'),
                K('#lst-plik', 'Zdjęcie lub skan', 'Wybierz zdjęcie lub skan listy (na telefonie otworzy aparat).'),
                K('#btn-lst-odczytaj', 'Odczytaj listę', 'Kliknij **„Odczytaj listę”**. System rozpozna kody i pokaże wynik do sprawdzenia.', { klik: true }),
                K('#lst-wyniki', 'Sprawdź odczyt', '**Sprawdź każdy wiersz** — odznacz błędnie odczytane. Nic nie trafi do systemu, dopóki nie klikniesz importu.'),
                K('#btn-lst-importuj', 'Dodaj do systemu', 'Kliknij **„Dodaj do systemu (System (Lista))”**. Obecności dostaną oznaczenie „System (Lista)”.', { koniec: true })
            ]
        },
        {
            id: 'p-obecnosci', ikona: '🗓️', grupa: 'Obecności i raporty',
            tytul: 'Obecności w miesiącu', opis: 'Pełna historia wszystkich ministrantów',
            kroki: [
                zak('obecnosci', 'Obecności (miesiąc)'),
                K('#ob-miesiac', 'Wybierz miesiąc i rok', 'Wybierz miesiąc z listy i wpisz rok.'),
                K('#btn-ob-pokaz', 'Pokaż', 'Kliknij **„Pokaż”**.', { klik: true }),
                K('#tabela-obecnosci-wszystkich', 'Tabela obecności', 'Kiedy, kto, wydarzenie, jak zaliczone i ile punktów. Jeśli masz kolumnę „Akcje”, możesz poprawić lub usunąć wpis.', { koniec: true })
            ]
        },
        {
            id: 'p-frekwencja', ikona: '📈', grupa: 'Obecności i raporty',
            tytul: 'Raport frekwencji', opis: 'Podsumowanie miesiąca, PDF / CSV',
            kroki: [
                zak('frekwencja', 'Frekwencja'),
                K('#fr-miesiac', 'Miesiąc i rok', 'Wybierz miesiąc i wpisz rok.'),
                K('#btn-fr-pokaz', 'Pokaż', 'Kliknij **„Pokaż”**, aby wyliczyć frekwencję.', { klik: true }),
                K('#tabela-frekwencja', 'Wynik', 'Tabela pokazuje frekwencję każdego ministranta. Nad nią jest podsumowanie.'),
                K('#btn-fr-pdf', 'Pobierz raport', 'Przyciski **PDF** i **CSV** zapisują raport do pliku.', { koniec: true })
            ]
        },
        {
            id: 'p-odblokuj', ikona: '🔓', grupa: 'Bezpieczeństwo',
            tytul: 'Odblokuj zablokowany kod', opis: 'Po zbyt wielu błędnych PIN-ach',
            kroki: [
                zak('bezpieczenstwo', 'Bezpieczeństwo'),
                K('#tabela-zablokowane', 'Zablokowane kody', 'Tu widać kody zablokowane po nieudanych próbach PIN-u.'),
                K('#odblokuj-kod-input', 'Kod do odblokowania', 'Wpisz kod osoby, np. **MIN-007**.'),
                K('#btn-odblokuj-recznie', 'Odblokuj', 'Kliknij **„Odblokuj”**. Jeśli system napisze o braku uprawnień, poproś o to Admina.', { klik: true, koniec: true })
            ]
        }
    ];

    // ------------------------------------------------------------------ PANEL: wspólne dla Księdza i Admina ----
    const PANEL_WSPOLNE = [
        { id: 'w-jezyk', ikona: '🌐', grupa: 'Inne', tytul: 'Zmień język panelu', opis: 'PL · EN · UA',
            kroki: [K('#widok-admin [data-jezyk-switch]', 'Wybierz język', 'Kliknij **PL**, **EN** albo **UA** w prawym górnym rogu.', { koniec: true })] },
        { id: 'w-kontakt', ikona: '✉️', grupa: 'Inne', tytul: 'Napisz do Administratora', opis: 'Przycisk „Kontakt”', kroki: [Object.assign({}, KROK_KONTAKT, { koniec: true })] },
        { id: 'w-do-ministranta', ikona: '👤', grupa: 'Inne', tytul: 'Przejdź do panelu ministranta', opis: 'Własne punkty i historia',
            kroki: [K('#btn-admin-do-panelu-ministranta', 'Panel ministranta', 'Kliknij **„Panel ministranta”** u góry, żeby zobaczyć własne punkty i historię. Wrócisz tym samym przyciskiem w panelu ministranta.', { koniec: true })] },
        { id: 'w-wyloguj', ikona: '🚪', grupa: 'Inne', tytul: 'Wyloguj się', opis: 'Zawsze na wspólnym urządzeniu',
            kroki: [K('#btn-admin-wyloguj', 'Wyloguj', 'Kliknij **„Wyloguj”** w prawym górnym rogu.', { koniec: true })] }
    ];

    // ------------------------------------------------------------------ PANEL ADMINA (dodatkowe tematy) ----
    const PANEL_ADMIN = [
        {
            id: 'a-dashboard', ikona: '🏠', grupa: 'Admin: przegląd',
            tytul: 'Dashboard — co wymaga uwagi', opis: 'Szybki przegląd dnia',
            kroki: [
                zak('dashboard', 'Dashboard'),
                K('#dash-kpi', 'Liczniki', 'Najważniejsze liczby: aktywni ministranci, punkty, obecności i inne wskaźniki.'),
                K('#dash-alerty', 'Wymaga uwagi', 'Lista rzeczy do załatwienia (np. oczekujące zgłoszenia, zablokowane kody, kioski bez kontaktu). Klikaj, żeby przejść do szczegółów.'),
                K('#dash-top', 'Top 5 miesiąca', 'Pięciu ministrantów z największą liczbą punktów w tym miesiącu.'),
                K('#btn-dash-odswiez', 'Odśwież', 'Kliknij, aby wczytać najnowsze dane.', { koniec: true })
            ]
        },
        {
            id: 'a-raport', ikona: '📋', grupa: 'Admin: przegląd',
            tytul: 'Raport Dnia', opis: 'Wszystko z jednego dnia',
            kroki: [
                zak('raport', 'Raport Dnia'),
                K('#rd-dzien-wstecz', 'Wybierz dzień', 'Strzałkami przesuwasz dzień wstecz lub do przodu, a przyciskiem „Dziś” wracasz do dzisiejszego dnia.'),
                K('#rd-kafelki', 'Podsumowanie', 'Kafelki pokazują, ile jest obecności, zgłoszeń i spraw wymagających reakcji.'),
                K('#rd-sekcje', 'Sekcje szczegółowe', 'Rozwiń sekcje, aby zobaczyć szczegóły. Przy pozycjach możesz oznaczyć sprawę jako przejrzaną albo ją cofnąć.'),
                K('#btn-rd-csv', 'Eksport', 'Przycisk CSV zapisuje raport dnia do pliku.', { koniec: true })
            ]
        },
        {
            id: 'a-akceptacje', ikona: '✅', grupa: 'Admin: przegląd',
            tytul: 'Akceptacje wpisów starszych niż 36 h', opis: 'Spóźnione obecności z kolejki',
            kroki: [
                zak('akceptacje', 'Akceptacje (36 h)'),
                K('#akc-licznik', 'Ile czeka', 'Licznik pokazuje, ile wpisów czeka na decyzję. Takie wpisy przyszły z kiosku z dużym opóźnieniem (np. po awarii sieci).'),
                K('#tabela-akceptacje', 'Zaakceptuj lub odrzuć', 'Sprawdź datę i osobę, potem kliknij **akceptuj** (punkty zostaną dodane) albo **odrzuć**.'),
                K('#btn-akc-wszystkie', 'Zbiorczo', 'Przycisk zbiorczy działa na wszystkie widoczne wpisy — użyj, gdy wszystkie sprawdziłeś.', { koniec: true })
            ]
        },
        {
            id: 'a-wiadomosci', ikona: '✉️', grupa: 'Admin: przegląd',
            tytul: 'Wiadomości od użytkowników', opis: 'Zgłoszenia z przycisku „Kontakt”',
            kroki: [
                zak('wiadomosci', 'Wiadomości'),
                K('#tabela-wiadomosci', 'Wiadomości', 'Każda wiadomość ma treść i zrzut ekranu. Możesz zmienić jej status, dopisać uwagi albo ją usunąć.'),
                K('#btn-kt-adm-odswiez', 'Odśwież', 'Wczytuje nowe wiadomości.', { koniec: true })
            ]
        },
        {
            id: 'a-kioski', ikona: '🖥️', grupa: 'Admin: system',
            tytul: 'Monitoring kiosków', opis: 'Status, ping, sterowanie',
            kroki: [
                zak('kioski', 'Kioski'),
                K('#btn-kioski-odswiez', 'Odśwież', 'Kliknij, aby wczytać aktualny stan kiosków.', { klik: true }),
                K('#tabela-kioski', 'Stan kiosków', 'Nazwa, status, ostatni ping, wersja i kolejka offline. W kolumnie „Akcja” wysyłasz polecenia (np. blokada, ping) i zmieniasz nazwę.', { koniec: true })
            ]
        },
        {
            id: 'a-baza', ikona: '📊', grupa: 'Admin: system',
            tytul: 'Baza danych — podgląd i edycja', opis: 'Użytkownicy, plakietki, obecności, logowania',
            kroki: [
                zak('baza', 'Baza danych'),
                K('.subtabs', 'Wybierz tabelę', 'Przełączaj podzakładki: Użytkownicy, Plakietki, Obecności, Logowania, Kioski, Oczekujące synchronizacje.'),
                K('#baza-szukaj', 'Szukaj', 'Wpisz fragment kodu lub nazwiska, żeby przefiltrować tabelę.'),
                K('#btn-baza-synchronizuj', 'Synchronizuj teraz', 'Odświeża dane z serwera.', { koniec: true })
            ]
        },
        {
            id: 'a-statystyki', ikona: '📉', grupa: 'Admin: przegląd',
            tytul: 'Statystyki i raporty zaawansowane', opis: 'Trendy, typy, ranking okresu',
            kroki: [
                zak('statystyki', 'Statystyki'),
                K('#st-miesiecy', 'Okres', 'Wybierz, ile miesięcy ma obejmować raport.'),
                K('#btn-st-odswiez', 'Odśwież', 'Kliknij, aby przeliczyć.', { klik: true }),
                K('#st-wykres', 'Wykres i tabele', 'Wykres i tabele pokazują trend, podział według typu i ranking okresu.'),
                K('#btn-st-pdf', 'Eksport', 'Przyciski **CSV** i **PDF** zapisują raport.', { koniec: true })
            ]
        },
        {
            id: 'a-ustawienia', ikona: '⚙️', grupa: 'Admin: system',
            tytul: 'Ustawienia systemowe', opis: 'Zasady punktów, okna, retencja',
            kroki: [
                zak('ustawienia', 'Ustawienia'),
                K('#ustawienia-lista', 'Zmień ustawienie', 'Każde ustawienie ma opis i pole wartości. Zmień wartość i kliknij **Zapisz** w jego wierszu. Zmiany wchodzą od razu i trafiają do audytu.', { koniec: true })
            ]
        },
        {
            id: 'a-audyt', ikona: '🧾', grupa: 'Admin: system',
            tytul: 'Audyt i cofanie zmian', opis: 'Kto, kiedy i co zmienił',
            kroki: [
                zak('audyt', 'Audyt'),
                K('#audyt-kategoria', 'Filtruj', 'Zawęź według kategorii, dat i tekstu (pola obok).'),
                K('#tabela-audyt', 'Historia zmian', 'Każda zmiana w systemie jest tu zapisana. Przy zmianach, które da się wycofać, jest przycisk **„Cofnij”**.'),
                K('#btn-audyt-csv', 'Eksport', 'Zapisz widoczny audyt do pliku CSV.', { koniec: true })
            ]
        },
        {
            id: 'a-narzedzia', ikona: '🧰', grupa: 'Admin: system',
            tytul: 'Narzędzia: samotest, blokada kiosku, kopia bazy', opis: 'Naprawa i bezpieczeństwo',
            kroki: [
                zak('narzedzia', 'Narzędzia'),
                K('#btn-nar-stan', 'Samotest bazy', 'Sprawdza, czy baza ma wszystkie potrzebne funkcje i widoki.'),
                K('#btn-nar-spoj', 'Spójność punktów', 'Porównuje punkty z obecnościami i wskazuje rozbieżności do naprawy.'),
                K('#nar-blokada-kiosk', 'Awaryjna blokada kiosku', 'W razie nadużycia wybierz kiosk, czas i powód, potem kliknij **Zablokuj**. Odblokujesz go tu samym przyciskiem.'),
                K('#btn-nar-eksport', 'Eksport całej bazy', 'Zapisuje kopię bazy do pliku. Import ma tryb próbny — **zawsze zacznij od próby**, zanim wykonasz właściwy import.', { koniec: true })
            ]
        },
        {
            id: 'a-rodo', ikona: '🛡️', grupa: 'Admin: system',
            tytul: 'RODO: eksport, anonimizacja, retencja', opis: 'Dane osobowe',
            kroki: [
                zak('rodo', 'RODO'),
                K('#rodo-osoba', 'Wybierz osobę', 'Wybierz osobę, której dotyczy operacja.'),
                K('#btn-rodo-json', 'Eksport danych', 'Pobierz dane osoby jako **JSON** lub **PDF**.'),
                K('#rodo-potwierdzenie', 'Anonimizacja — ostrożnie', '**Anonimizacja jest nieodwracalna.** Wpisz tekst potwierdzający i dopiero wtedy kliknij „Anonimizuj”.'),
                K('#btn-rodo-purge', 'Retencja', 'Czyszczenie starych logów (starszych niż podana liczba dni). Również nieodwracalne.', { koniec: true })
            ]
        },
        {
            id: 'a-raport-mies', ikona: '📑', grupa: 'Admin: przegląd',
            tytul: 'Raport miesięczny (PDF)', opis: 'Zakładka Bezpieczeństwo',
            kroki: [
                zak('bezpieczenstwo', 'Bezpieczeństwo'),
                K('#raport-miesiac', 'Miesiąc i rok', 'Wybierz miesiąc i rok raportu.'),
                K('#btn-generuj-raport', 'Generuj', 'Kliknij **generuj** — powstanie raport PDF do pobrania.', { koniec: true })
            ]
        }
    ];

    // ------------------------------------------------------------------ START ----
    const START = [
        {
            id: 's-wybor', ikona: '🧭',
            tytul: T('Którą opcję wybrać?', 'Which option should I pick?', 'Яку опцію обрати?'),
            opis: T('Panel czy Kiosk', 'Panel or Kiosk', 'Панель чи Кіоск'),
            kroki: [
                K('a[href="app.html"]', T('Panel Ministranta / Admina', 'Altar server / Admin panel', 'Панель служителя / Адміністратора'),
                    T('Wybierz to na **telefonie lub komputerze**, żeby zobaczyć swoje punkty (ministrant) albo zarządzać systemem (Ksiądz, Admin). Wymaga kodu i PIN-u.',
                        'Pick this on **your phone or computer** to see your points (altar server) or manage the system (priest, Admin). Requires a code and PIN.',
                        'Оберіть це на **телефоні чи комп’ютері**, щоб побачити свої бали (служитель) або керувати системою (Священник, Адміністратор). Потрібні код і PIN.')),
                K('a[href="kiosk.html"]', T('Tryb Kiosk (Zakrystia)', 'Kiosk mode (Sacristy)', 'Режим Кіоск (Захристія)'),
                    T('To **tablet w zakrystii**, na którym ministranci zapisują obecność kartą QR i PIN-em. Normalnie jest już włączony — nie musisz go uruchamiać.',
                        'This is the **tablet in the sacristy** where altar servers record attendance with a QR card and PIN. It is normally already running — you do not need to start it.',
                        'Це **планшет у захристії**, де служителі записують присутність карткою QR і PIN. Зазвичай він уже увімкнений — запускати його не треба.'),
                    { koniec: true })
            ]
        }
    ];

    // ------------------------------------------------------------------ MAPA KONTEKST → TEMATY ----
    const PRZEWODNIKI = {
        start: START,
        login: LOGIN,
        kiosk: KIOSK,
        'kiosk-ksiadz': [E_RECZNA, E_COFNIJ, E_WYJDZ],
        'kiosk-admin': [E_RECZNA, E_COFNIJ, E_ODBLOKUJ, E_OFFLINE, E_CZYSC, E_WYJDZ],
        ministrant: MINISTRANT,
        ksiadz: PANEL_KSIADZ.concat(PANEL_WSPOLNE),
        admin: PANEL_KSIADZ.concat(PANEL_ADMIN, PANEL_WSPOLNE)
    };

    // Dla testów w Node (bez przeglądarki): wystawiamy dane i kończymy.
    if (!D) {
        if (typeof module !== 'undefined' && module.exports) module.exports = { PRZEWODNIKI: PRZEWODNIKI, UI: UI, NAZWY_KONTEKSTU: NAZWY_KONTEKSTU };
        return;
    }
    if (window.__EM_POMOC) return;
    window.__EM_POMOC = true;

    // ============================================================================
    // KONTEKST — kto i gdzie
    // ============================================================================
    function kontekst() {
        if ($('ekran-czekanie')) {
            if (widoczny($('ekran-admin-awaryjny'))) return rolaAwaryjnaTeraz() === 'admin' ? 'kiosk-admin' : 'kiosk-ksiadz';
            return 'kiosk';
        }
        if ($('widok-login')) {
            if (widoczny($('widok-ministrant'))) return 'ministrant';
            if (widoczny($('widok-admin'))) return jestAdminem() ? 'admin' : 'ksiadz';
            return 'login';
        }
        return 'start';
    }
    function jestKioskiem(k) { return k === 'kiosk' || k === 'kiosk-ksiadz' || k === 'kiosk-admin'; }
    function tematyDla(k) { return (PRZEWODNIKI[k] || []).filter((t) => !t.jesli || bezpiecznie(t.jesli, true)); }
    function znajdzTemat(k, id) { return tematyDla(k).filter((t) => t.id === id)[0] || null; }

    // ============================================================================
    // STAN
    // ============================================================================
    let aktywny = null;             // { temat, kroki, i, kontekst, wstecz, wszedl }
    let menuOtwarte = false;
    let menuKontekst = null;
    let ostatniaAktywnosc = Date.now();
    const BEZCZYNNOSC_KIOSK_MS = 90 * 1000;

    function biezacyKrok() { return aktywny ? aktywny.kroki[aktywny.i] : null; }

    // ============================================================================
    // INTERFEJS
    // ============================================================================
    function zbuduj() {
        if ($('pomoc-przycisk')) return;
        const b = D.createElement('button');
        b.id = 'pomoc-przycisk'; b.type = 'button'; b.className = 'pomoc-przycisk';
        b.setAttribute('data-pomoc', 'menu'); b.setAttribute('data-zrzut-ukryj', '1'); b.setAttribute('aria-haspopup', 'dialog');
        let nowy = true; try { nowy = !localStorage.getItem('em_pomoc_uzyta'); } catch (e) { /* ignoruj */ }
        if (nowy) b.classList.add('pomoc-nowy');
        D.body.appendChild(b);

        const m = D.createElement('div');
        m.id = 'pomoc-menu'; m.className = 'pomoc-menu hidden'; m.setAttribute('role', 'dialog'); m.setAttribute('data-zrzut-ukryj', '1');
        D.body.appendChild(m);

        const s = D.createElement('div');
        s.id = 'pomoc-podswietlenie'; s.className = 'pomoc-podswietlenie hidden'; s.setAttribute('data-zrzut-ukryj', '1'); s.setAttribute('aria-hidden', 'true');
        D.body.appendChild(s);

        const c = D.createElement('div');
        c.id = 'pomoc-krok'; c.className = 'pomoc-krok hidden'; c.setAttribute('role', 'dialog'); c.setAttribute('aria-live', 'polite'); c.setAttribute('data-zrzut-ukryj', '1');
        D.body.appendChild(c);
        odswiezPrzycisk();
    }

    function odswiezPrzycisk() {
        const b = $('pomoc-przycisk'); if (!b) return;
        b.innerHTML = '<span class="pomoc-ikona" aria-hidden="true">❓</span><span class="pomoc-etykieta">' + esc(tx(UI.przycisk)) + '</span>';
        b.title = tx(UI.przyciskTytul);
        b.setAttribute('aria-label', tx(UI.przyciskTytul));
    }

    function renderMenu() {
        const m = $('pomoc-menu'); if (!m) return;
        const k = kontekst(); menuKontekst = k;
        const tematy = tematyDla(k);
        let html = '<div class="pomoc-menu-gora"><div><div class="pomoc-menu-tytul">' + esc(tx(UI.menuNaglowek)) + '</div><div class="pomoc-menu-kontekst">' + esc(tx(NAZWY_KONTEKSTU[k])) + '</div></div>' +
            '<button type="button" class="pomoc-x" data-pomoc="zamknij-menu" aria-label="' + esc(tx(UI.zamknij)) + '">✖</button></div>';
        if (aktywny) html += '<button type="button" class="pomoc-temat pomoc-temat-zakoncz" data-pomoc="zakoncz"><span class="pomoc-temat-ikona">⏹</span><span class="pomoc-temat-tekst"><b>' + esc(tx(UI.zakoncz)) + '</b></span></button>';
        let poprzedniaGrupa = null;
        tematy.forEach((t) => {
            if (t.grupa && t.grupa !== poprzedniaGrupa) { html += '<div class="pomoc-grupa">' + esc(tx(t.grupa)) + '</div>'; poprzedniaGrupa = t.grupa; }
            html += '<button type="button" class="pomoc-temat" data-pomoc="temat" data-temat="' + esc(t.id) + '"><span class="pomoc-temat-ikona" aria-hidden="true">' + esc(t.ikona || '•') + '</span>' +
                '<span class="pomoc-temat-tekst"><b>' + esc(tx(t.tytul)) + '</b>' + (t.opis ? '<small>' + esc(tx(t.opis)) + '</small>' : '') + '</span></button>';
        });
        if (!tematy.length) html += '<p class="pomoc-pusty">' + esc(tx(UI.brakTematow)) + '</p>';
        html += '<p class="pomoc-stopka">' + esc(tx(UI.menuStopka)) + '</p>';
        m.innerHTML = html;
    }

    function otworzMenu() {
        zbuduj();
        renderMenu();
        $('pomoc-menu').classList.remove('hidden');
        menuOtwarte = true;
        try { localStorage.setItem('em_pomoc_uzyta', '1'); } catch (e) { /* ignoruj */ }
        const b = $('pomoc-przycisk'); if (b) b.classList.remove('pomoc-nowy');
        pozycjonuj();
    }
    function zamknijMenu() { const m = $('pomoc-menu'); if (m) m.classList.add('hidden'); menuOtwarte = false; }

    function renderKrok() {
        const c = $('pomoc-krok'); if (!c || !aktywny) return;
        const krok = biezacyKrok();
        const n = aktywny.i + 1, m = aktywny.kroki.length;
        const ostatni = aktywny.i === m - 1;
        let uwaga = '';
        if (krok.ekran && !krok.koniec && !ekranWidoczny(krok.ekran)) uwaga = tx(UI.czekam);
        else if (krok.cel && !pierwszyWidoczny(krok.cel) && !krok.ekran) uwaga = tx(UI.brakCelu);
        c.innerHTML =
            '<div class="pomoc-krok-gora"><span class="pomoc-krok-numer">' + esc(tpl(tx(UI.krok), { n: n, m: m })) + ' · ' + esc(tx(aktywny.temat.tytul)) + '</span>' +
            '<button type="button" class="pomoc-x" data-pomoc="zakoncz" aria-label="' + esc(tx(UI.zamknij)) + '">✖</button></div>' +
            '<div class="pomoc-pasek"><span style="width:' + Math.round(n / m * 100) + '%"></span></div>' +
            '<h4 class="pomoc-krok-tytul">' + esc(tx(krok.tytul)) + '</h4>' +
            '<p class="pomoc-krok-tekst">' + fmt(tx(krok.tekst)) + '</p>' +
            (uwaga ? '<p class="pomoc-uwaga">' + esc(uwaga) + '</p>' : '') +
            '<div class="pomoc-przyciski">' +
            '<button type="button" class="pomoc-btn" data-pomoc="wstecz"' + (aktywny.i === 0 ? ' disabled' : '') + '>' + esc(tx(UI.wstecz)) + '</button>' +
            '<button type="button" class="pomoc-btn" data-pomoc="lista">' + esc(tx(UI.tematy)) + '</button>' +
            '<button type="button" class="pomoc-btn pomoc-btn-glowny" data-pomoc="dalej">' + esc(tx(ostatni ? UI.gotowe : UI.dalej)) + '</button></div>';
        c.classList.remove('hidden');
        aktywny.uwaga = uwaga;
    }

    // Pozycja podświetlenia i karty kroku (karta schodzi z drogi elementowi, który ma być klikany)
    function pozycjonuj() {
        const sp = $('pomoc-podswietlenie'), c = $('pomoc-krok'), menu = $('pomoc-menu');
        if (!sp || !c) return;
        const krok = biezacyKrok();
        const el = krok ? pierwszyWidoczny(krok.cel) : null;
        let r = null;
        if (el) {
            r = el.getBoundingClientRect();
            if (!(r.width > 0 && r.height > 0)) r = null;
        }
        if (r && aktywny) {
            const m = 6;
            sp.style.left = (r.left - m) + 'px'; sp.style.top = (r.top - m) + 'px';
            sp.style.width = (r.width + 2 * m) + 'px'; sp.style.height = (r.height + 2 * m) + 'px';
            sp.classList.toggle('pomoc-bez-tla', r.height > window.innerHeight * 0.75);
            sp.classList.remove('hidden');
        } else sp.classList.add('hidden');

        if (aktywny && !c.classList.contains('hidden')) {
            const h = c.offsetHeight, w = c.offsetWidth;
            const dol = Math.max(8, window.innerHeight - h - 96);
            let top = dol;
            if (r) {
                const kolizja = r.bottom > dol - 8 && r.top < dol + h + 8 && r.right > 12 && r.left < 12 + w + 8;
                if (kolizja) top = 12;
            }
            c.style.top = Math.max(8, top) + 'px';
        }
        if (menu && menuOtwarte) { /* menu ma stałą pozycję (CSS) */ }
    }

    // ============================================================================
    // PRZEWODNIK
    // ============================================================================
    function start(id) {
        const k = kontekst();
        const temat = znajdzTemat(k, id);
        if (!temat) return;
        const kroki = temat.kroki.filter((s) => !s.jesli || bezpiecznie(s.jesli, true));
        if (!kroki.length) return;
        aktywny = { temat: temat, kroki: kroki, i: 0, kontekst: k, wstecz: false, wszedl: Date.now() };
        zamknijMenu();
        wejdzWKrok(0, false);
    }

    function wejdzWKrok(i, wstecz) {
        if (!aktywny) return;
        aktywny.i = Math.max(0, Math.min(aktywny.kroki.length - 1, i));
        aktywny.wstecz = !!wstecz;      // po cofnięciu nie przeskakujemy automatycznie
        aktywny.wszedl = Date.now();
        renderKrok();
        const el = pierwszyWidoczny(biezacyKrok().cel);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.top < 60 || r.bottom > window.innerHeight - 100) {
                try { el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignoruj */ }
            }
        }
        pozycjonuj();
    }
    function nastepny() {
        if (!aktywny) return;
        if (aktywny.i >= aktywny.kroki.length - 1) { zakoncz(); return; }
        wejdzWKrok(aktywny.i + 1, false);
    }
    function poprzedni() { if (aktywny && aktywny.i > 0) wejdzWKrok(aktywny.i - 1, true); }
    function zakoncz() {
        aktywny = null;
        const c = $('pomoc-krok'); if (c) c.classList.add('hidden');
        const s = $('pomoc-podswietlenie'); if (s) s.classList.add('hidden');
    }

    // Co 300 ms: synchronizacja z ekranem, automatyczne przejścia, pozycje, bezczynność kiosku
    function tik() {
        const k = kontekst();
        if (jestKioskiem(k) && Date.now() - ostatniaAktywnosc > BEZCZYNNOSC_KIOSK_MS) {
            if (aktywny) zakoncz();
            if (menuOtwarte) zamknijMenu();
        }
        if (aktywny && k !== aktywny.kontekst) {          // np. wylogowanie albo wejście Księdza w tryb awaryjny
            zakoncz();
            if (jestKioskiem(k) || k === 'login') { renderMenu(); otworzMenu(); }
        } else if (menuOtwarte && k !== menuKontekst) renderMenu();

        if (aktywny) {
            const krok = biezacyKrok();
            // 1) kiosk przeszedł na inny ekran → przeskocz do pasującego kroku
            if (krok.ekran && !ekranWidoczny(krok.ekran)) {
                for (let j = aktywny.i + 1; j < aktywny.kroki.length; j++) {
                    const e = aktywny.kroki[j].ekran;
                    if (e && ekranWidoczny(e)) { wejdzWKrok(j, false); return; }
                }
            }
            // 2) człowiek wykonał czynność → następny krok (nie wcześniej niż po 0,7 s, żeby dało się przeczytać)
            if (krok.dalejGdy && !aktywny.wstecz && Date.now() - aktywny.wszedl > 700 && bezpiecznie(krok.dalejGdy, false)) { nastepny(); return; }
            // 3) odśwież notatkę o brakującym ekranie / elemencie (bez przerysowywania całej karty, gdy się nie zmieniła)
            const uwagaTeraz = (krok.ekran && !krok.koniec && !ekranWidoczny(krok.ekran)) ? tx(UI.czekam)
                : ((krok.cel && !pierwszyWidoczny(krok.cel) && !krok.ekran) ? tx(UI.brakCelu) : '');
            if (uwagaTeraz !== aktywny.uwaga) renderKrok();
            pozycjonuj();
        }
    }

    function obsluz(akcja, dane) {
        if (akcja === 'menu') { if (menuOtwarte) zamknijMenu(); else otworzMenu(); return; }
        if (akcja === 'zamknij-menu') { zamknijMenu(); return; }
        if (akcja === 'temat') { start(dane.temat); return; }
        if (akcja === 'dalej') { nastepny(); return; }
        if (akcja === 'wstecz') { poprzedni(); return; }
        if (akcja === 'zakoncz') { zakoncz(); if (menuOtwarte) renderMenu(); return; }
        if (akcja === 'lista') { zakoncz(); otworzMenu(); return; }
    }

    // ============================================================================
    // ZDARZENIA
    // ============================================================================
    ['pointerdown', 'keydown', 'touchstart'].forEach((z) => D.addEventListener(z, () => { ostatniaAktywnosc = Date.now(); }, true));

    D.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('[data-pomoc]') : null;
        if (a) { obsluz(a.getAttribute('data-pomoc'), { temat: a.getAttribute('data-temat') }); return; }
        if (aktywny) {
            const krok = biezacyKrok();
            if (krok && krok.klik) {
                const el = pierwszyWidoczny(krok.cel);
                if (el && el.contains(e.target)) { const idx = aktywny.i; setTimeout(() => { if (aktywny && aktywny.i === idx) nastepny(); }, 450); }
            }
        }
        if (menuOtwarte && !(e.target.closest && e.target.closest('#pomoc-menu'))) zamknijMenu();
    }, true);

    D.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (aktywny) zakoncz(); else if (menuOtwarte) zamknijMenu();
    });

    D.addEventListener('zmiana-jezyka', () => { odswiezPrzycisk(); if (menuOtwarte) renderMenu(); if (aktywny) { renderKrok(); pozycjonuj(); } });
    window.addEventListener('resize', () => { if (aktywny) pozycjonuj(); });
    window.addEventListener('scroll', () => { if (aktywny) pozycjonuj(); }, true);

    function uruchom() { zbuduj(); setInterval(tik, 300); }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', uruchom); else uruchom();

    // Podgląd dla testów i diagnostyki (konsola: EMPomoc.kontekst())
    window.EMPomoc = { kontekst: kontekst, otworz: otworzMenu, start: start, zakoncz: zakoncz, przewodniki: PRZEWODNIKI };
})();
