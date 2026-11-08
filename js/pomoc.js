// ============================================================================
// v2.15.11 (rozbudowa; pierwsza wersja 2.15.08) — INTERAKTYWNA POMOC („❓ Pomoc” w lewym dolnym rogu)
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
    function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>'); }

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
            { dalejGdy: tabAktywna(n), pomin: tabAktywna(n) });
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
            slowa: 'obecność zapis karta qr pin msza kamera czytnik dodać zapisać',
            tytul: T('Chcę zapisać obecność', 'I want to record my attendance', 'Хочу записати присутність'),
            opis: T('Karta lub kamera → PIN → wybór mszy', 'Card or camera → PIN → choose the Mass', 'Картка або камера → PIN → вибір Меси'),
            kroki: [
                K('#ekran-czekanie h2', T('1. Pokaż swoją kartę', '1. Show your card', '1. Покажіть свою картку'),
                    T('Masz **dwa proste sposoby** — wybierz jeden:\n**A)** **PRZYŁÓŻ kartę** z kodem QR do czytnika. Nic nie klikaj — kiosk sam ją zobaczy.\n**B)** **KLIKNIJ** podświetlony przycisk **„📷 Skanuj kamerą”** i pokaż kartę kamerze.',
                        'You have **two easy ways** — pick one:\n**A)** **HOLD your card** with the QR code to the reader. Do not tap anything — the kiosk sees it by itself.\n**B)** **TAP** the highlighted button **“📷 Scan with camera”** and show the card to the camera.',
                        'Є **два простих способи** — оберіть один:\n**A)** **ПРИКЛАДІТЬ картку** з QR-кодом до сканера. Нічого не натискайте — кіоск побачить її сам.\n**B)** **НАТИСНІТЬ** підсвічену кнопку **«📷 Сканувати камерою»** і покажіть картку камері.'),
                    { ekran: 'ekran-czekanie', cele: ['#btn-skaner-kamery'], typ: 'skanuj',
                      podp: T('Czekam, aż pokażesz kartę. Przejdę dalej sama.', 'I am waiting for your card. I will move on by myself.', 'Чекаю, поки ви покажете картку. Перейду далі сама.') }),
                K('#skaner-kamery-okno', T('📷 Pokaż kartę kamerze', '📷 Show the card to the camera', '📷 Покажіть картку камері'),
                    T('Trzymaj kartę **kodem QR do kamery**, ok. 15–25 cm od niej. Cały kod ma być w ramce.\nWidzisz zły obraz (np. siebie)? Kliknij **„🔄 Zmień kamerę”**.\nKarta zostanie rozpoznana **sama** — nic więcej nie klikaj.',
                        'Hold the card **with the QR code towards the camera**, about 15–25 cm away. The whole code must be inside the frame.\nWrong picture (e.g. yourself)? Tap **“🔄 Change camera”**.\nThe card is recognised **by itself** — tap nothing else.',
                        'Тримайте картку **QR-кодом до камери** на відстані 15–25 см. Увесь код має бути в рамці.\nБачите не те (напр. себе)? Натисніть **«🔄 Змінити камеру»**.\nКартка розпізнається **сама** — більше нічого не натискайте.'),
                    { gdy: () => ekranWidoczny('skaner-kamery-okno'), typ: 'skanuj',
                      podp: T('Trzymaj kartę nieruchomo. Przejdę dalej sama.', 'Hold the card still. I will move on by myself.', 'Тримайте картку нерухомо. Перейду далі сама.') }),
                K('.profile-badge', T('2. Czy to Twoje imię?', '2. Is this your name?', '2. Це ваше ім’я?'),
                    T('Na górze widać **imię i nazwisko** właściciela karty.\n✅ To Ty? Kliknij **„Dalej”** poniżej i wpisz PIN.\n❌ To nie Ty? Kliknij na kiosku **„To nie ja — reset”** i zacznij od nowa.',
                        'The card owner’s **name** is shown at the top.\n✅ Is it you? Tap **“Next”** below and enter your PIN.\n❌ Not you? Tap **“Not me — reset”** on the kiosk and start again.',
                        'Угорі видно **ім’я** власника картки.\n✅ Це ви? Натисніть **«Далі»** нижче та введіть PIN.\n❌ Це не ви? Натисніть на кіоску **«Це не я — скинути»** і почніть заново.'),
                    { ekran: 'ekran-pin' }),
                K('.numpad', T('3. Wpisz swój PIN', '3. Enter your PIN', '3. Введіть свій PIN'),
                    T('Dotknij **4 cyfr** swojego PIN-u. Kropki u góry pokazują, ile już wpisałeś.\nPomyłka? Dotknij **⌫** i wpisz cyfrę jeszcze raz.\n🤫 Nie pokazuj PIN-u innym.',
                        'Tap the **4 digits** of your PIN. The dots at the top show how many you have entered.\nMistake? Tap **⌫** and enter the digit again.\n🤫 Do not show your PIN to others.',
                        'Натисніть **4 цифри** свого PIN. Крапки вгорі показують, скільки вже введено.\nПомилка? Натисніть **⌫** і введіть цифру ще раз.\n🤫 Не показуйте PIN іншим.'),
                    { ekran: 'ekran-pin', dalejGdy: () => pinDlugosc() === 4 }),
                K('#btn-ok', T('4. Kliknij „Zatwierdź”', '4. Tap “Confirm”', '4. Натисніть «Підтвердити»'),
                    T('Świecą się 4 kropki? Kliknij **„Zatwierdź”**.\nUwaga: kilka błędnych PIN-ów **zablokuje kartę** — wtedy poproś Księdza o pomoc.',
                        'Are 4 dots filled? Tap **“Confirm”**.\nNote: several wrong PINs will **lock the card** — then ask the priest for help.',
                        'Світяться 4 крапки? Натисніть **«Підтвердити»**.\nУвага: кілька хибних PIN **заблокують картку** — тоді попросіть допомоги у Священника.'),
                    { ekran: 'ekran-pin', dalejGdy: () => !ekranWidoczny('ekran-pin') }),
                K('#wybor-wydarzen-lista', T('5. Wybierz swoją mszę', '5. Choose your Mass', '5. Оберіть свою Месу'),
                    T('Dotknij **przycisku z mszą**, na której jesteś.\nNie ma żadnej mszy na liście? Jest **za wcześnie albo za późno** — zapisać się można od 20 minut przed do 5 minut po rozpoczęciu. Poczekaj chwilę albo zawołaj Księdza.',
                        'Tap the **button with your Mass**.\nNo Mass on the list? It is **too early or too late** — you can register from 20 minutes before to 5 minutes after the start. Wait a moment or call the priest.',
                        'Натисніть **кнопку зі своєю Месою**.\nНемає жодної Меси в списку? **Зарано або запізно** — записатися можна від 20 хв до початку до 5 хв після. Зачекайте або покличте Священника.'),
                    { ekran: 'ekran-wybor-wydarzenia', typ: 'dotknij' }),
                K('#ekran-blok', T('Msza z nabożeństwem', 'Mass with a service', 'Меса з богослужінням'),
                    T('Dotknij, w czym brałeś udział: **tylko nabożeństwo** (+1 pkt), **tylko msza** albo **oba**.',
                        'Tap what you took part in: **service only** (+1 pt), **Mass only** or **both**.',
                        'Натисніть, у чому ви брали участь: **лише богослужіння** (+1 бал), **лише Меса** або **обидва**.'),
                    { ekran: 'ekran-blok', typ: 'dotknij' }),
                K('#wynik-tresc', T('Gotowe! ✅ Obecność zapisana', 'Done! ✅ Attendance saved', 'Готово! ✅ Присутність записано'),
                    T('🟢 **Zielony** napis = **udało się**, punkty dodane. Możesz odejść.\n🔴 **Czerwony** napis = coś nie wyszło — **przeczytaj, co jest napisane** (np. zły PIN albo za późno).\nEkran sam wróci do początku po kilku sekundach.',
                        'A 🟢 **green** message = **it worked**, points added. You can leave.\nA 🔴 **red** message = something went wrong — **read what it says** (e.g. wrong PIN or too late).\nThe screen returns to the start by itself in a few seconds.',
                        '🟢 **Зелений** напис = **вдалося**, бали додано. Можна йти.\n🔴 **Червоний** напис = щось не вийшло — **прочитайте, що написано** (напр. хибний PIN або запізно).\nЕкран сам повернеться на початок за кілька секунд.'),
                    { ekran: 'ekran-wynik', koniec: true, typ: 'zobacz' })
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
                    { klik: true, auto: true }),
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
            kroki: [K('#btn-panel-admina', T('Panel administracyjny', 'Administration panel', 'Адміністративна панель'), T('Na dole kliknij **„Przejdź do Panelu Administracyjnego →”**.', 'At the bottom tap **“Go to the Administration Panel →”**.', 'Унизу натисніть **«Перейти до адміністративної панелі →»**.'), { klik: true, auto: true, koniec: true })] },
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
                K('#zg-filtr-status', 'Pokaż „Oczekujące”', 'Ministranci zgłaszają w kiosku pogrzeb, ślub lub inną obecność specjalną. Wybierz filtr **„Oczekujące”**, żeby zobaczyć to, co czeka na decyzję.', { auto: { wartosc: 'oczekujace' }, pomin: () => bezpiecznie(() => { const e = $('zg-filtr-status'); return !!e && e.value === 'oczekujace'; }, false) }),
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
            kroki: [K('#btn-admin-do-panelu-ministranta', 'Panel ministranta', 'Kliknij **„Panel ministranta”** u góry, żeby zobaczyć własne punkty i historię. Wrócisz tym samym przyciskiem w panelu ministranta.', { auto: true, koniec: true })] },
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

    // ============================================================================
    // v2.15.09 — DODATKOWE TEMATY, KOMUNIKATY „IDIOTOODPORNE” I NOWE TEKSTY INTERFEJSU
    // ============================================================================
    (function () {
        const dop = {
            akcja_klik: T('👆 Kliknij', '👆 Tap', '👆 Натисніть'),
            akcja_dotknij: T('👆 Dotknij', '👆 Tap', '👆 Торкніться'),
            akcja_wpisz: T('⌨️ Wpisz', '⌨️ Type', '⌨️ Введіть'),
            akcja_wybierz: T('🔽 Wybierz', '🔽 Choose', '🔽 Оберіть'),
            akcja_skanuj: T('📲 Pokaż kartę', '📲 Show the card', '📲 Покажіть картку'),
            akcja_zobacz: T('👀 Spójrz', '👀 Look', '👀 Подивіться'),
            podp_klik: T('Kliknij podświetlony element — przejdę dalej sama. Albo kliknij „Dalej”.', 'Tap the highlighted item — I will move on by myself. Or tap “Next”.', 'Натисніть підсвічений елемент — я перейду далі сама. Або натисніть «Далі».'),
            podp_dotknij: T('Dotknij podświetlonego miejsca. Albo kliknij „Dalej”.', 'Tap the highlighted spot. Or tap “Next”.', 'Торкніться підсвіченого місця. Або натисніть «Далі».'),
            podp_wpisz: T('Wpisz, a potem dotknij poza polem — przejdę dalej sama. Albo kliknij „Dalej”.', 'Type, then tap outside the field — I will move on by myself. Or tap “Next”.', 'Введіть, потім торкніться поза полем — я перейду далі сама. Або натисніть «Далі».'),
            podp_wybierz: T('Zmień wartość albo zostaw taką, jaka jest, i kliknij „Dalej”.', 'Change the value, or keep it as it is and tap “Next”.', 'Змініть значення або залиште як є та натисніть «Далі».'),
            podp_skanuj: T('Czekam na kartę. Przejdę dalej sama.', 'Waiting for the card. I will move on by myself.', 'Чекаю на картку. Перейду далі сама.'),
            podp_zobacz: T('Przeczytaj i kliknij „Dalej”.', 'Read it and tap “Next”.', 'Прочитайте та натисніть «Далі».'),
            pominieto: T('✓ Pomijam „{t}” — to już zrobione.', '✓ Skipping “{t}” — already done.', '✓ Пропускаю «{t}» — вже зроблено.'),
            koniec: T('Brawo! 🎉 Gotowe: {t}', 'Well done! 🎉 Done: {t}', 'Браво! 🎉 Готово: {t}'),
            start: T('🚀 Zaczynamy: {t}', '🚀 Let’s start: {t}', '🚀 Починаємо: {t}'),
            polecam: T('💡 Polecam teraz', '💡 Suggested now', '💡 Раджу зараз'),
            ostatnio: T('🕘 Ostatnio', '🕘 Recently', '🕘 Нещодавно'),
            szukaj: T('🔎 Szukaj tematu… (np. PIN, karta, punkty)', '🔎 Search a topic… (e.g. PIN, card, points)', '🔎 Шукати тему… (напр. PIN, картка, бали)'),
            brakWynikow: T('Nic nie znalazłem. Spróbuj innego słowa.', 'Nothing found. Try another word.', 'Нічого не знайдено. Спробуйте інше слово.'),
            czytaj: T('🔊 Przeczytaj na głos', '🔊 Read aloud', '🔊 Прочитати вголос'),
            zwin: T('Zwiń kartę', 'Collapse card', 'Згорнути картку'),
            rozwin: T('Rozwiń kartę', 'Expand card', 'Розгорнути картку'),
            rozmiar: T('Większy tekst', 'Larger text', 'Більший текст'),
            krokow: T('{n} kr.', '{n} steps', '{n} кр.'),
            ukonczono: T('ukończono', 'completed', 'завершено')
        };
        Object.keys(dop).forEach((k) => { UI[k] = dop[k]; });
        UI.pochwaly = {
            pl: ['Świetnie! 👍', 'Dobrze Ci idzie! ✨', 'Super! 🌟', 'Tak trzymaj! 💪', 'Brawo! 👏'],
            en: ['Great! 👍', 'You are doing well! ✨', 'Super! 🌟', 'Keep it up! 💪', 'Well done! 👏'],
            uk: ['Чудово! 👍', 'У вас добре виходить! ✨', 'Супер! 🌟', 'Так тримати! 💪', 'Браво! 👏']
        };
    })();

    function wstawPrzed(lista, idDocelowy, nowe) { const i = lista.findIndex((t) => t.id === idDocelowy); if (i < 0) Array.prototype.push.apply(lista, nowe); else Array.prototype.splice.apply(lista, [i, 0].concat(nowe)); }
    function wstawPo(lista, idDocelowy, nowe) { const i = lista.findIndex((t) => t.id === idDocelowy); if (i < 0) Array.prototype.push.apply(lista, nowe); else Array.prototype.splice.apply(lista, [i + 1, 0].concat(nowe)); }
    const wart = (id) => bezpiecznie(() => { const e = $(id); return e ? e.value : null; }, null);

    // Poradnik instalacji aplikacji na telefonie (wspólny dla strony startowej, logowania i panelu ministranta)
    function instalacja(id) {
        return {
            id: id, ikona: '📲', slowa: 'telefon aplikacja instalacja ekran główny ikona pwa',
            tytul: T('Zainstaluj aplikację na telefonie', 'Install the app on your phone', 'Встановити застосунок на телефон'),
            opis: T('Ikona na ekranie, bez wpisywania adresu', 'An icon on the screen, no typing the address', 'Іконка на екрані, без введення адреси'),
            kroki: [
                K(null, T('Android (Chrome)', 'Android (Chrome)', 'Android (Chrome)'),
                    T('Kliknij **⋮ (trzy kropki)** w prawym górnym rogu przeglądarki.\nPotem wybierz **„Zainstaluj aplikację”** albo **„Dodaj do ekranu głównego”**.',
                        'Tap the **⋮ (three dots)** in the top-right corner of the browser.\nThen choose **“Install app”** or **“Add to Home screen”**.',
                        'Натисніть **⋮ (три крапки)** у правому верхньому куті браузера.\nПотім оберіть **«Установити застосунок»** або **«Додати на головний екран»**.'), { typ: 'zobacz' }),
                K(null, T('iPhone (Safari)', 'iPhone (Safari)', 'iPhone (Safari)'),
                    T('Kliknij **przycisk „Udostępnij”** (kwadrat ze strzałką w górę).\nPrzewiń w dół i wybierz **„Do ekranu początkowego”**.',
                        'Tap the **“Share”** button (a square with an arrow pointing up).\nScroll down and choose **“Add to Home Screen”**.',
                        'Натисніть кнопку **«Поділитися»** (квадрат зі стрілкою вгору).\nПрокрутіть униз і оберіть **«На початковий екран»**.'), { typ: 'zobacz' }),
                K(null, T('Gotowe! 🎉', 'Done! 🎉', 'Готово! 🎉'),
                    T('Na ekranie telefonu pojawi się **ikona**. Otwierasz ją jak zwykłą aplikację — bez wpisywania adresu.',
                        'An **icon** appears on your phone screen. You open it like any app — no need to type the address.',
                        'На екрані телефона з’явиться **іконка**. Відкриваєте її як звичайний застосунок — без введення адреси.'), { koniec: true, typ: 'zobacz' })
            ]
        };
    }

    // ------------------------------------------------------------------ KIOSK: dodatkowe tematy ----
    KIOSK.unshift({
        id: 'k-pierwszy-raz', ikona: '🙋', slowa: 'pierwszy raz nowy jak działa wszystko od początku',
        tytul: T('Pierwszy raz? Pokaż wszystko po kolei', 'First time? Show me everything step by step', 'Вперше? Покажіть усе по порядку'),
        opis: T('Krótkie wprowadzenie dla każdego', 'A short introduction for everyone', 'Коротке вступ для кожного'),
        kroki: [
            K('#ekran-czekanie h2', T('To jest kiosk', 'This is the kiosk', 'Це кіоск'),
                T('To **tablet w zakrystii**. Dzięki niemu zapisujesz, że **byłeś na mszy**, i dostajesz punkty.\nWszystko trwa **kilka sekund** i jest bardzo proste.',
                    'This is the **tablet in the sacristy**. You use it to record that you **attended Mass** and get points.\nIt takes **a few seconds** and is very simple.',
                    'Це **планшет у захристії**. Через нього ви записуєте, що **були на Месі**, і отримуєте бали.\nЦе займає **кілька секунд** і дуже просто.')),
            K(null, T('Potrzebujesz dwóch rzeczy', 'You need two things', 'Вам потрібні дві речі'),
                T('1️⃣ **Karta z kodem QR** (Twoja własna).\n2️⃣ **PIN** — 4 cyfry, które znasz tylko Ty.\nNie masz karty lub PIN-u? Poproś Księdza.',
                    '1️⃣ **A card with a QR code** (your own).\n2️⃣ **A PIN** — 4 digits only you know.\nNo card or PIN? Ask the priest.',
                    '1️⃣ **Картка з QR-кодом** (ваша власна).\n2️⃣ **PIN** — 4 цифри, які знаєте лише ви.\nНемає картки чи PIN? Попросіть Священника.')),
            K(null, T('Kiedy to zrobić?', 'When should I do it?', 'Коли це робити?'),
                T('Zrób to **tuż przed mszą**: od **20 minut przed** do **5 minut po** jej rozpoczęciu. Wcześniej lub później kiosk nie pozwoli.',
                    'Do it **right before Mass**: from **20 minutes before** to **5 minutes after** it starts. Earlier or later the kiosk will not allow it.',
                    'Робіть це **перед Месою**: від **20 хвилин до** і до **5 хвилин після** початку. Раніше чи пізніше кіоск не дозволить.')),
            K('#ekran-czekanie h2', T('Gotowy?', 'Ready?', 'Готові?'),
                T('Kliknij duży przycisk poniżej — **poprowadzę Cię za rękę** krok po kroku.',
                    'Tap the big button below — **I will guide you by the hand** step by step.',
                    'Натисніть велику кнопку нижче — **я проведу вас за руку** крок за кроком.'),
                { koniec: true, przycisk: { temat: 'k-obecnosc', tekst: T('▶ Zapisz moją obecność', '▶ Record my attendance', '▶ Записати мою присутність') } })
        ]
    });
    wstawPrzed(KIOSK, 'k-kontakt', [
        {
            id: 'k-kolory', ikona: '🚦', slowa: 'kolory komunikat zielony czerwony błąd wynik co znaczy',
            tytul: T('Co znaczą kolory i komunikaty?', 'What do the colours and messages mean?', 'Що означають кольори й повідомлення?'),
            opis: T('Zielony, czerwony, napisy', 'Green, red, messages', 'Зелений, червоний, написи'),
            kroki: [
                K(null, T('🟢 Zielony = dobrze', '🟢 Green = good', '🟢 Зелений = добре'),
                    T('**Zielony napis** oznacza: **obecność zapisana** i punkty dodane. Nic więcej nie musisz robić.', 'A **green message** means: **attendance saved** and points added. You do not need to do anything else.', '**Зелений напис** означає: **присутність записано** і бали додано. Більше нічого робити не треба.'), { typ: 'zobacz' }),
                K(null, T('🔴 Czerwony = coś nie wyszło', '🔴 Red = something went wrong', '🔴 Червоний = щось не вийшло'),
                    T('**Przeczytaj, co jest napisane** — zwykle to: zły PIN, zablokowany kod, za wcześnie lub za późno, albo obecność już zapisana.\nPotem spróbuj jeszcze raz albo poproś Księdza.',
                        '**Read what it says** — usually: wrong PIN, locked code, too early or too late, or attendance already recorded.\nThen try again or ask the priest.',
                        '**Прочитайте, що написано** — зазвичай: хибний PIN, заблокований код, зарано чи запізно, або присутність уже записано.\nПотім спробуйте ще раз або попросіть Священника.'), { typ: 'zobacz', koniec: true })
            ]
        },
        {
            id: 'k-za-wczesnie', ikona: '⏰', slowa: 'za wcześnie za późno brak mszy pusta lista okno rejestracji',
            tytul: T('Nie widzę mojej mszy (za wcześnie / za późno)', 'I cannot see my Mass (too early / too late)', 'Не бачу своєї Меси (зарано / запізно)'),
            opis: T('Okno zapisu: 20 min przed – 5 min po', 'Registration window: 20 min before – 5 min after', 'Вікно запису: 20 хв до – 5 хв після'),
            kroki: [
                K('#wybor-wydarzen-lista', T('Lista jest pusta?', 'Is the list empty?', 'Список порожній?'),
                    T('Kiosk pokazuje **tylko te msze, na które zapis jest teraz otwarty** — od **20 minut przed** do **5 minut po** rozpoczęciu (Admin może to zmienić).',
                        'The kiosk shows **only Masses open for registration right now** — from **20 minutes before** to **5 minutes after** the start (the Admin can change this).',
                        'Кіоск показує **лише ті Меси, на які запис зараз відкрито** — від **20 хвилин до** до **5 хвилин після** початку (Адміністратор може це змінити).'), { typ: 'zobacz' }),
                K(null, T('Co zrobić?', 'What should I do?', 'Що робити?'),
                    T('**Za wcześnie?** Poczekaj i spróbuj za chwilę.\n**Za późno?** Poproś **Księdza** — zapisze Ci obecność ręcznie.\n**Mszy nie ma wcale?** Ksiądz musi dodać ją do kalendarza.',
                        '**Too early?** Wait and try again in a moment.\n**Too late?** Ask the **priest** — he will record it manually.\n**No Mass at all?** The priest must add it to the calendar.',
                        '**Зарано?** Зачекайте й спробуйте за мить.\n**Запізно?** Попросіть **Священника** — він запише вручну.\n**Меси немає взагалі?** Священник має додати її до календаря.'), { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'k-dwa-razy', ikona: '🔁', slowa: 'dwa razy podwójnie duplikat już zapisana ponownie',
            tytul: T('Zapisałem się dwa razy — co teraz?', 'I registered twice — what now?', 'Я записався двічі — що тепер?'),
            opis: T('Nic się nie stanie', 'Nothing bad will happen', 'Нічого поганого не станеться'),
            kroki: [K(null, T('Spokojnie 🙂', 'Do not worry 🙂', 'Спокійно 🙂'),
                T('System **nie doda drugi raz** tej samej obecności na tę samą mszę. Zobaczysz komunikat, że obecność jest już zapisana — to **dobra wiadomość**: punkty masz.',
                    'The system **will not add** the same attendance for the same Mass **twice**. You will see a message that it is already recorded — that is **good news**: you have the points.',
                    'Система **не додасть удруге** ту саму присутність на ту саму Месу. Ви побачите повідомлення, що вона вже записана — це **добра новина**: бали у вас є.'), { koniec: true, typ: 'zobacz' })]
        },
        {
            id: 'k-punkty', ikona: '⭐', slowa: 'punkty ile zasady liczone',
            tytul: T('Ile dostanę punktów?', 'How many points will I get?', 'Скільки балів я отримаю?'),
            opis: T('Zasady w skrócie', 'The rules in short', 'Правила коротко'),
            kroki: [K(null, T('Punkty w skrócie', 'Points in short', 'Бали коротко'),
                T('⛪ Za **mszę** zwykle **1 lub 2 punkty** (zależy od dnia i zasad parafii).\n🕯️ **Nabożeństwo** dodaje **+1 punkt**.\n⚱️ **Pogrzeb, ślub, inne** — punkty przyznaje **Ksiądz** po zatwierdzeniu.\n📱 Swoje punkty zobaczysz w panelu ministranta.',
                    '⛪ For a **Mass** usually **1 or 2 points** (depends on the day and parish rules).\n🕯️ A **service** adds **+1 point**.\n⚱️ **Funeral, wedding, other** — the **priest** awards points after approval.\n📱 You can see your points in the altar-server panel.',
                    '⛪ За **Месу** зазвичай **1 або 2 бали** (залежить від дня й правил парафії).\n🕯️ **Богослужіння** додає **+1 бал**.\n⚱️ **Похорон, весілля, інше** — бали надає **Священник** після підтвердження.\n📱 Свої бали ви побачите в панелі служителя.'), { koniec: true, typ: 'zobacz' })]
        },
        {
            id: 'k-nie-reaguje', ikona: '🛠️', slowa: 'nie działa awaria czytnik nie reaguje zawiesił internet',
            tytul: T('Kiosk lub czytnik nie reaguje', 'The kiosk or reader does not respond', 'Кіоск або сканер не реагує'),
            opis: T('Co sprawdzić po kolei', 'What to check, in order', 'Що перевірити по черзі'),
            kroki: [
                K('#kiosk-status', T('1. Spójrz na pasek statusu', '1. Look at the status bar', '1. Подивіться на рядок стану'),
                    T('Pasek na górze pokazuje, czy kiosk ma **internet**. Bez internetu kiosk **nadal działa** i zapisze obecność później — nie panikuj.',
                        'The bar at the top shows whether the kiosk has **internet**. Without internet the kiosk **still works** and saves attendance later — do not panic.',
                        'Рядок угорі показує, чи є в кіоску **інтернет**. Без інтернету кіоск **усе одно працює** й запише присутність пізніше — не хвилюйтеся.'), { typ: 'zobacz', ekran: 'ekran-czekanie' }),
                K('#btn-skaner-kamery', T('2. Użyj kamery zamiast czytnika', '2. Use the camera instead of the reader', '2. Скористайтеся камерою замість сканера'),
                    T('Czytnik milczy? Kliknij **„📷 Skanuj kamerą”** i pokaż kartę kamerze tabletu.',
                        'The reader is silent? Tap **“📷 Scan with camera”** and show the card to the tablet camera.',
                        'Сканер мовчить? Натисніть **«📷 Сканувати камерою»** і покажіть картку камері планшета.'), { ekran: 'ekran-czekanie', klik: true }),
                K(null, T('3. Poproś o pomoc', '3. Ask for help', '3. Попросіть допомоги'),
                    T('Nadal nie działa? Zawołaj **Księdza lub Admina** — zapisze obecność ręcznie. **Nic nie stracisz.**',
                        'Still not working? Call the **priest or the Admin** — they will record attendance manually. **You lose nothing.**',
                        'Досі не працює? Покличте **Священника або Адміністратора** — вони запишуть присутність вручну. **Ви нічого не втратите.**'), { koniec: true, typ: 'zobacz' })
            ]
        }
    ]);

    // ------------------------------------------------------------------ KIOSK: tryb awaryjny — przegląd ----
    const E_PRZEGLAD = {
        id: 'e-przeglad', ikona: '🧭', grupa: 'Codzienne', slowa: 'co mogę przegląd tryb awaryjny',
        tytul: 'Co mogę zrobić w trybie awaryjnym?', opis: 'Krótki przegląd panelu',
        kroki: [
            K('#awaryjny-kod', 'Ręczna obecność', 'Na górze wpisujesz **kod ministranta** i zapisujesz mu obecność — gdy zgubił kartę, zapomniał PIN-u albo kiosk miał awarię.', { typ: 'zobacz', przycisk: { temat: 'e-reczna', tekst: '▶ Pokaż krok po kroku' } }),
            K('#tabela-ostatnie-obecnosci', 'Cofanie pomyłek', 'Niżej widzisz **ostatnie obecności**. Pomyłka? Wycofasz ją przyciskiem w wierszu.', { typ: 'zobacz', przycisk: { temat: 'e-cofnij', tekst: '▶ Pokaż, jak cofnąć' } }),
            K('#btn-wyjdz-admin', 'Wyjście', 'Gdy skończysz — **zawsze kliknij „Wyloguj”**, żeby kiosk wrócił do zwykłego ekranu.', { koniec: true, typ: 'klik' })
        ]
    };

    // ------------------------------------------------------------------ LOGOWANIE: dodatkowe ----
    wstawPrzed(LOGIN, 'l-jezyk', [
        {
            id: 'l-pierwsze', ikona: '🙋', slowa: 'pierwsze logowanie nowy skąd kod pin',
            tytul: T('Pierwsze logowanie — skąd wziąć kod i PIN?', 'First sign-in — where do I get the code and PIN?', 'Перший вхід — де взяти код і PIN?'),
            opis: T('Dostajesz je od Księdza', 'You get them from the priest', 'Ви отримуєте їх від Священника'),
            kroki: [
                K('#login-kod', T('Twój kod', 'Your code', 'Ваш код'),
                    T('Kod wygląda np. tak: **MIN-001**. Jest wydrukowany **na Twojej karcie**. Przepisz go dokładnie.', 'The code looks like this: **MIN-001**. It is printed **on your card**. Copy it exactly.', 'Код виглядає, напр., так: **MIN-001**. Він надрукований **на вашій картці**. Перепишіть його точно.')),
                K('#login-pin', T('Twój PIN', 'Your PIN', 'Ваш PIN'),
                    T('PIN to **4 cyfry**. Początkowy PIN dostajesz **od Księdza**. Po pierwszym logowaniu **zmień go na swój** (temat „Zmień swój PIN”).',
                        'The PIN is **4 digits**. You get the starting PIN **from the priest**. After the first sign-in **change it to your own** (topic “Change my PIN”).',
                        'PIN — це **4 цифри**. Початковий PIN ви отримуєте **від Священника**. Після першого входу **змініть його на свій** (тема «Змінити свій PIN»).'),
                    { koniec: true })
            ]
        },
        {
            id: 'l-nie-dziala', ikona: '❓', slowa: 'nie mogę zalogować błąd nie działa zły pin',
            tytul: T('Nie mogę się zalogować', 'I cannot sign in', 'Не можу увійти'),
            opis: T('Lista kontrolna', 'A checklist', 'Список перевірки'),
            kroki: [
                K('#login-kod', T('1. Sprawdź kod', '1. Check the code', '1. Перевірте код'), T('Czy kod jest **identyczny jak na karcie**, np. **MIN-001**? Nie dodawaj spacji.', 'Is the code **identical to the one on the card**, e.g. **MIN-001**? Do not add spaces.', 'Чи код **такий самий, як на картці**, напр. **MIN-001**? Не додавайте пробілів.')),
                K('#login-pin', T('2. Sprawdź PIN', '2. Check the PIN', '2. Перевірте PIN'), T('PIN ma **dokładnie 4 cyfry**. Pamiętaj: kilka błędnych prób **blokuje kod**.', 'The PIN has **exactly 4 digits**. Remember: several wrong tries **lock the code**.', 'PIN має **рівно 4 цифри**. Пам’ятайте: кілька хибних спроб **блокують код**.')),
                K(null, T('3. Poproś o pomoc', '3. Ask for help', '3. Попросіть допомоги'), T('Dalej nic? Poproś **Księdza lub Admina** — odblokuje kod albo ustawi nowy PIN. Sprawdź też, czy masz **internet**.', 'Still nothing? Ask the **priest or the Admin** — they will unlock the code or set a new PIN. Also check that you have **internet**.', 'Досі нічого? Попросіть **Священника або Адміністратора** — вони розблокують код або встановлять новий PIN. Перевірте також, чи є **інтернет**.'), { koniec: true })
            ]
        },
        instalacja('l-instalacja')
    ]);

    // ------------------------------------------------------------------ PANEL MINISTRANTA: dodatkowe ----
    wstawPrzed(MINISTRANT, 'm-jezyk', [
        {
            id: 'm-zasady', ikona: '📘', slowa: 'zasady punkty liczone ile punktów mszę',
            tytul: T('Jak są liczone punkty?', 'How are points counted?', 'Як нараховуються бали?'),
            opis: T('Msze, nabożeństwa, pogrzeby', 'Masses, services, funerals', 'Меси, богослужіння, похорони'),
            kroki: [K('#mm-punkty', T('Punkty w skrócie', 'Points in short', 'Бали коротко'),
                T('⛪ **Msza**: zwykle **1 lub 2 punkty** (zależy od dnia i zasad parafii).\n🕯️ **Nabożeństwo**: **+1 punkt**.\n⚱️ **Pogrzeb / ślub / inne**: punkty przyznaje **Ksiądz**.\n📅 Punkty liczą się **w miesiącu** — nowy miesiąc zaczyna od zera.',
                    '⛪ **Mass**: usually **1 or 2 points** (depends on the day and parish rules).\n🕯️ **Service**: **+1 point**.\n⚱️ **Funeral / wedding / other**: the **priest** awards the points.\n📅 Points are counted **per month** — a new month starts from zero.',
                    '⛪ **Меса**: зазвичай **1 або 2 бали** (залежить від дня й правил парафії).\n🕯️ **Богослужіння**: **+1 бал**.\n⚱️ **Похорон / весілля / інше**: бали надає **Священник**.\n📅 Бали рахуються **за місяць** — новий місяць починається з нуля.'),
                { koniec: true, typ: 'zobacz' })]
        },
        {
            id: 'm-blad', ikona: '🧐', slowa: 'błąd brak punktów nie ma obecności zły wpis',
            tytul: T('Brakuje mi punktów lub widzę błąd', 'My points are missing or I see a mistake', 'Мені бракує балів або бачу помилку'),
            opis: T('Sprawdź historię i napisz do Admina', 'Check the history and write to the Admin', 'Перевірте історію й напишіть Адміністратору'),
            kroki: [
                K('#mm-historia', T('1. Zajrzyj do historii', '1. Check the history', '1. Зазирніть в історію'),
                    T('Najpierw sprawdź, czy **obecność jest na liście** dla właściwego miesiąca (temat „Zobacz historię obecności”).', 'First check whether **the attendance is on the list** for the right month (topic “See my attendance history”).', 'Спершу перевірте, чи **присутність є в списку** за потрібний місяць (тема «Переглянути історію присутності»).'), { typ: 'zobacz' }),
                K('#btn-kontakt', T('2. Napisz do Administratora', '2. Write to the Administrator', '2. Напишіть Адміністратору'),
                    T('Nie ma jej? Kliknij **„Kontakt”** i opisz: **kiedy** byłeś i **na której mszy**. Admin sprawdzi i poprawi.', 'Not there? Tap **“Contact”** and describe: **when** you attended and **which Mass**. The Admin will check and fix it.', 'Немає? Натисніть **«Контакт»** і опишіть: **коли** ви були та **на якій Месі**. Адміністратор перевірить і виправить.'), { koniec: true })
            ]
        },
        {
            id: 'm-asystent', ikona: '🤖', slowa: 'asystent ai pytanie robot',
            jesli: () => widoczny($('btn-asystent')),
            tytul: T('Zapytaj asystenta', 'Ask the assistant', 'Запитати асистента'),
            opis: T('Przycisk 🤖 po prawej stronie', 'The 🤖 button on the right', 'Кнопка 🤖 праворуч'),
            kroki: [K('#btn-asystent', T('Asystent', 'Assistant', 'Асистент'),
                T('Kliknij **🤖** i napisz pytanie własnymi słowami — asystent podpowie, jak coś zrobić w systemie.', 'Tap **🤖** and type your question in your own words — the assistant will tell you how to do something in the system.', 'Натисніть **🤖** і напишіть запитання своїми словами — асистент підкаже, як щось зробити в системі.'), { koniec: true })]
        },
        instalacja('m-instalacja')
    ]);

    // ------------------------------------------------------------------ START: dodatkowe ----
    START.push({
        id: 's-kim-jestem', ikona: '🙋', slowa: 'ministrant ksiądz admin kim jestem co wybrać',
        tytul: T('Jestem ministrantem / Księdzem / Adminem — co wybrać?', 'I am an altar server / priest / Admin — what do I pick?', 'Я служитель / Священник / Адміністратор — що обрати?'),
        opis: T('Wszyscy logują się tak samo', 'Everyone signs in the same way', 'Усі входять однаково'),
        kroki: [
            K('a[href="app.html"]', T('Wszyscy: Panel', 'Everyone: the Panel', 'Усі: Панель'),
                T('**Ministrant, Ksiądz i Admin** wybierają to samo: **Panel**. Po zalogowaniu system sam pokaże właściwy widok — ministrant zobaczy punkty, Ksiądz i Admin dodatkowo panel zarządzania.',
                    '**Altar servers, priests and Admins** all pick the same thing: the **Panel**. After signing in the system shows the right view — an altar server sees points, priests and Admins also get the management panel.',
                    '**Служителі, Священники й Адміністратори** обирають одне й те саме: **Панель**. Після входу система сама покаже потрібний вигляд — служитель бачить бали, Священник та Адміністратор додатково отримують панель керування.'),
                { klik: true, koniec: true })
        ]
    });
    START.push(instalacja('s-instalacja'));

    // ------------------------------------------------------------------ PANEL KSIĘDZA: dodatkowe ----
    PANEL_KSIADZ.unshift(
        {
            id: 'p-przed-msza', ikona: '🌅', grupa: 'Codzienne', slowa: 'przed mszą lista kontrolna poranek zakrystia',
            tytul: 'Przed mszą — lista kontrolna', opis: 'Trzy rzeczy do sprawdzenia',
            kroki: [
                zak('kalendarz', 'Kalendarz'),
                K('#tabela-kalendarz', '1. Czy dzisiejsza msza jest w kalendarzu?', 'Znajdź dzisiejszą datę. **Nie ma mszy?** Ministranci nie zapiszą się na wydarzenie, którego nie ma w kalendarzu.', { typ: 'zobacz', przycisk: { temat: 'p-wydarzenie', tekst: '▶ Pokaż, jak dodać mszę' } }),
                K(null, '2. Czy kiosk w zakrystii działa?', 'Spójrz na tablet: ma być **ekran „Zeskanuj kartę”** i **zielony pasek statusu**. Jeśli ekran jest czarny albo stoi — odśwież stronę kiosku.', { typ: 'zobacz' }),
                K(null, '3. Czy ministranci mają karty?', 'Nowy ministrant potrzebuje **karty z kodem QR** i PIN-u. Wydrukujesz je w zakładce „Generator kart QR”.', { koniec: true, typ: 'zobacz', przycisk: { temat: 'p-karty', tekst: '▶ Pokaż, jak wydrukować karty' } })
            ]
        },
        {
            id: 'p-po-mszy', ikona: '🌇', grupa: 'Codzienne', slowa: 'po mszy lista kontrolna wieczór zgłoszenia',
            tytul: 'Po mszy — lista kontrolna', opis: 'Zgłoszenia i brakujące obecności',
            kroki: [
                zak('zgloszenia', 'Zgłoszenia'),
                K('#zg-filtr-status', '1. Pokaż „Oczekujące”', 'Ustaw filtr na **„Oczekujące”**, żeby zobaczyć zgłoszenia czekające na Twoją decyzję.', { auto: { wartosc: 'oczekujace' }, pomin: () => wart('zg-filtr-status') === 'oczekujace' }),
                K('#tabela-zgloszenia', '2. Rozpatrz zgłoszenia', 'Przy każdym wpisz **punkty** i kliknij **„Zatwierdź”** albo **„Odrzuć”**. Lista pusta? Świetnie — nic nie czeka. 🎉', { typ: 'zobacz' }),
                K(null, '3. Ktoś się nie zapisał?', 'Jeśli ktoś **zapomniał zapisać się w kiosku**, dopisz mu obecność ręcznie.', { koniec: true, typ: 'zobacz', przycisk: { temat: 'p-reczna', tekst: '▶ Pokaż, jak dodać ręcznie' } })
            ]
        }
    );
    wstawPo(PANEL_KSIADZ, 'p-wydarzenie', [{
        id: 'p-edytuj-wydarzenie', ikona: '✏️', grupa: 'Codzienne', slowa: 'edytuj usuń zmień godzinę wydarzenie msza kalendarz',
        tytul: 'Zmień godzinę lub usuń wydarzenie', opis: 'Edycja istniejącego wpisu w kalendarzu',
        kroki: [
            zak('kalendarz', 'Kalendarz'),
            K('#tabela-kalendarz', 'Znajdź wydarzenie', 'Znajdź w tabeli właściwą mszę lub wydarzenie (data i godzina).', { typ: 'zobacz' }),
            K('#tabela-kalendarz tbody [data-akcja="cal-edytuj"], #tabela-kalendarz tbody [data-akcja="cal-usun"]', 'Edytuj albo usuń', 'W kolumnie **„Akcje”** kliknij **edytuj** (zmiana nazwy lub godziny) albo **usuń**. Usunięcie wydarzenia jest widoczne w historii zmian.', { koniec: true })
        ]
    }]);
    wstawPo(PANEL_KSIADZ, 'p-ministrant', [{
        id: 'p-edytuj-ministranta', ikona: '🧑‍🔧', grupa: 'Ministranci i karty', slowa: 'edytuj zmień pin dezaktywuj przywróć konto ministranta',
        tytul: 'Zmień dane, PIN lub wyłącz konto ministranta', opis: 'Edycja, dezaktywacja, przywracanie',
        kroki: [
            zak('ministranci', 'Ministranci'),
            K('#tabela-ministranci tbody [data-akcja="mi-edytuj"]', 'Edytuj', 'W wierszu ministranta kliknij **„Edytuj”** — zmienisz imię, nazwisko lub **ustawisz nowy PIN** (gdy ktoś go zapomniał).', { klik: true }),
            K('#tabela-ministranci tbody [data-akcja="mi-dezaktywuj"]', 'Dezaktywuj (opcjonalnie)', '**„Dezaktywuj”** wyłącza konto (np. ministrant odszedł) — historia zostaje. **„Przywróć”** włącza je z powrotem.', { koniec: true, typ: 'zobacz' })
        ]
    }]);
    wstawPo(PANEL_KSIADZ, 'p-obecnosci', [{
        id: 'p-punkty-popraw', ikona: '🛠️', grupa: 'Obecności i raporty', slowa: 'popraw usuń punkty błędna obecność zmień punkty',
        tytul: 'Popraw lub usuń błędną obecność', opis: 'Gdy ktoś dostał złe punkty',
        kroki: [
            zak('obecnosci', 'Obecności (miesiąc)'),
            K('#btn-ob-pokaz', 'Pokaż miesiąc', 'Wybierz miesiąc i kliknij **„Pokaż”**.', { klik: true }),
            K('#tabela-obecnosci-wszystkich tbody [data-akcja="pkt-edytuj-ob"], #tabela-obecnosci-wszystkich tbody [data-akcja="pkt-usun-ob"]', 'Edytuj lub usuń wpis', 'W wierszu kliknij **edytuj** (nowa liczba punktów) albo **usuń**. Zmiana zapisze się w historii razem z Twoim kodem.', { koniec: true })
        ]
    }]);

    // ------------------------------------------------------------------ PANEL ADMINA: dodatkowe ----
    PANEL_ADMIN.push(
        {
            id: 'a-konto-ksiedza', ikona: '🧑‍⚖️', grupa: 'Admin: system', slowa: 'konto księdza rola moderator nadaj odbierz',
            tytul: 'Nadaj lub odbierz rolę Księdza', opis: 'Tylko Admin',
            kroki: [
                zak('ministranci', 'Ministranci'),
                K('#tabela-ministranci tbody [data-akcja="mi-moderator"]', 'Zmień rolę', 'W wierszu osoby kliknij **przycisk roli** (Ksiądz / Opiekun). Osoba dostanie lub straci dostęp do panelu Księdza przy następnym logowaniu.', { klik: true }),
                K('#mi-moderator-wiersz', 'Nowe konto od razu jako Ksiądz', 'Przy **dodawaniu nowego konta** możesz od razu zaznaczyć rolę Księdza w tym wierszu.', { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'a-cofnij-zmiane', ikona: '↩️', grupa: 'Admin: system', slowa: 'cofnij zmianę audyt pomyłka przywróć',
            tytul: 'Cofnij zmianę z audytu', opis: 'Naprawa pomyłki jednym przyciskiem',
            kroki: [
                zak('audyt', 'Audyt'),
                K('#audyt-szukaj', 'Znajdź zmianę', 'Wpisz kod osoby albo fragment opisu, żeby zawęzić listę.'),
                K('#tabela-audyt tbody [data-akcja="audyt-cofnij"]', 'Cofnij', 'Kliknij **„Cofnij”** w wierszu zmiany. System przywróci poprzedni stan, a samo cofnięcie też trafi do audytu.', { koniec: true })
            ]
        },
        {
            id: 'a-blokada-kiosku', ikona: '🚫', grupa: 'Admin: system', slowa: 'blokada kiosku nadużycie zablokuj kiosk awaryjnie',
            tytul: 'Zablokuj kiosk awaryjnie', opis: 'Gdy ktoś nadużywa kiosku',
            kroki: [
                zak('narzedzia', 'Narzędzia'),
                K('#nar-blokada-kiosk', 'Wybierz kiosk i czas', 'Wybierz kiosk, na jak długo go blokujesz i podaj **powód**. Zablokowany kiosk nie przyjmie nowych obecności.'),
                K('#nar-blokada-kiosk button', 'Zablokuj / odblokuj', 'Kliknij przycisk blokady. **Odblokujesz** go tutaj samym przyciskiem albo z kiosku w trybie Admina.', { koniec: true })
            ]
        },
        {
            id: 'a-nowy-miesiac', ikona: '🗓️', grupa: 'Admin: przegląd', slowa: 'nowy miesiąc podsumowanie koniec miesiąca lista kontrolna',
            tytul: 'Koniec miesiąca — lista kontrolna', opis: 'Podsumowanie krok po kroku',
            kroki: [
                zak('akceptacje', 'Akceptacje (36 h)'),
                K('#akc-licznik', '1. Rozpatrz zaległe akceptacje', 'Licznik ma pokazywać **0**. Jeśli nie — rozpatrz wpisy.', { typ: 'zobacz', przycisk: { temat: 'a-akceptacje', tekst: '▶ Pokaż, jak je rozpatrzyć' } }),
                K(null, '2. Zatwierdź zgłoszenia specjalne', 'Wejdź w „Zgłoszenia” i rozpatrz oczekujące (pogrzeby, śluby, inne).', { typ: 'zobacz', przycisk: { temat: 'p-zgloszenia', tekst: '▶ Pokaż, jak zatwierdzać' } }),
                K(null, '3. Pobierz raport', 'Na koniec pobierz raport frekwencji lub raport miesięczny PDF.', { koniec: true, typ: 'zobacz', przycisk: { temat: 'a-raport-mies', tekst: '▶ Pokaż, jak pobrać raport' } })
            ]
        }
    );

    // ============================================================================
    // v2.15.10 — KILKANAŚCIE NOWYCH TEMATÓW (kiosk, logowanie, ministrant, Ksiądz, Admin)
    // ============================================================================
    wstawPrzed(KIOSK, 'k-kontakt', [
        {
            id: 'k-zly-pin', ikona: '🔢', slowa: 'zły pin pomyłka cyfra popraw wpisałem źle backspace',
            tytul: T('Wpisałem zły PIN', 'I entered the wrong PIN', 'Я ввів хибний PIN'),
            opis: T('Jak poprawić pomyłkę', 'How to fix a mistake', 'Як виправити помилку'),
            kroki: [
                K('.numpad', T('Pomyłka przed zatwierdzeniem', 'A mistake before confirming', 'Помилка до підтвердження'),
                    T('Dopóki nie klikniesz **„Zatwierdź”**, nic się nie stało. Dotknij **⌫**, żeby skasować ostatnią cyfrę, i wpisz ją jeszcze raz.', 'As long as you have not tapped **“Confirm”**, nothing has happened. Tap **⌫** to delete the last digit and enter it again.', 'Доки ви не натиснули **«Підтвердити»**, нічого не сталося. Натисніть **⌫**, щоб стерти останню цифру, і введіть її ще раз.'),
                    { ekran: 'ekran-pin', typ: 'dotknij' }),
                K('#btn-ok', T('Po zatwierdzeniu: czerwony napis', 'After confirming: a red message', 'Після підтвердження: червоний напис'),
                    T('Zły PIN = **czerwony komunikat**. Spróbuj jeszcze raz, ale **uważaj**: kilka błędnych PIN-ów z rzędu **blokuje kartę**. Nie pamiętasz PIN-u? Przestań próbować i poproś Księdza.', 'A wrong PIN = a **red message**. Try again, but **be careful**: several wrong PINs in a row **lock the card**. Cannot remember it? Stop trying and ask the priest.', 'Хибний PIN = **червоне повідомлення**. Спробуйте ще раз, але **обережно**: кілька хибних PIN поспіль **блокують картку**. Не пам’ятаєте? Припиніть спроби й попросіть Священника.'),
                    { ekran: 'ekran-pin', koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'k-cudze-imie', ikona: '🙈', slowa: 'cudze imię nie ja pomyłka kolegi reset obce nazwisko',
            tytul: T('Na ekranie jest cudze imię', 'Someone else’s name is on the screen', 'На екрані чуже ім’я'),
            opis: T('Zeskanowano nie tę kartę', 'The wrong card was scanned', 'Відскановано не ту картку'),
            kroki: [
                K('.profile-badge', T('To nie Ty? Nie wpisuj PIN-u!', 'Not you? Do not enter a PIN!', 'Це не ви? Не вводьте PIN!'),
                    T('Jeśli widzisz **imię innej osoby**, **nie wpisuj PIN-u**. Kliknij **„To nie ja — reset”**, żeby zacząć od nowa.', 'If you see **another person’s name**, **do not enter a PIN**. Tap **“Not me — reset”** to start over.', 'Якщо бачите **ім’я іншої людини**, **не вводьте PIN**. Натисніть **«Це не я — скинути»**, щоб почати заново.'),
                    { ekran: 'ekran-pin', typ: 'zobacz' }),
                K(null, T('Zeskanuj własną kartę', 'Scan your own card', 'Відскануйте власну картку'),
                    T('Oddaj cudzą kartę właścicielowi i zeskanuj **swoją**. Karty są osobiste — każdy używa tylko swojej.', 'Give the other card back to its owner and scan **your own**. Cards are personal — everyone uses only their own.', 'Поверніть чужу картку власникові й відскануйте **свою**. Картки особисті — кожен користується лише своєю.'),
                    { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'k-karta-uszkodzona', ikona: '🩹', slowa: 'karta zniszczona pognieciona nie skanuje się kod qr uszkodzony zabrudzona',
            tytul: T('Karta się nie skanuje', 'The card does not scan', 'Картка не сканується'),
            opis: T('Zniszczony lub brudny kod QR', 'A damaged or dirty QR code', 'Пошкоджений або брудний QR-код'),
            kroki: [
                K(null, T('1. Wyprostuj i wytrzyj kartę', '1. Flatten and wipe the card', '1. Розпрямте й протріть картку'),
                    T('Pognieciony lub brudny kod QR trudno odczytać. **Wyprostuj kartę** i **wytrzyj ją** suchą szmatką.', 'A creased or dirty QR code is hard to read. **Flatten the card** and **wipe it** with a dry cloth.', 'Зім’ятий або брудний QR-код важко прочитати. **Розпрямте картку** і **протріть** її сухою ганчіркою.'), { typ: 'zobacz' }),
                K('#btn-skaner-kamery', T('2. Spróbuj kamerą', '2. Try the camera', '2. Спробуйте камерою'),
                    T('Kliknij **„📷 Skanuj kamerą”** i trzymaj kartę w **dobrym świetle**, ok. 15–25 cm od kamery.', 'Tap **“📷 Scan with camera”** and hold the card in **good light**, about 15–25 cm from the camera.', 'Натисніть **«📷 Сканувати камерою»** і тримайте картку при **доброму світлі**, за 15–25 см від камери.'),
                    { ekran: 'ekran-czekanie' }),
                K(null, T('3. Poproś o nową kartę', '3. Ask for a new card', '3. Попросіть нову картку'),
                    T('Wciąż nic? Poproś **Księdza** o **nową plakietkę** — stara przestanie działać, a nowa będzie miała ten sam kod i PIN.', 'Still nothing? Ask the **priest** for a **new badge** — the old one stops working.', 'Досі нічого? Попросіть **Священника** про **нову плакетку** — стара перестане діяти.'),
                    { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'k-prywatnosc', ikona: '🔒', slowa: 'prywatność bezpieczeństwo dane pin kto widzi ukryty',
            tytul: T('Czy moje dane są bezpieczne?', 'Is my data safe?', 'Чи мої дані в безпеці?'),
            opis: T('PIN, karta i widoczność danych', 'PIN, card and who sees what', 'PIN, картка й хто що бачить'),
            kroki: [
                K('.numpad', T('PIN jest ukryty', 'The PIN is hidden', 'PIN приховано'),
                    T('Podczas wpisywania widać tylko **kropki** — cyfry nie pokazują się na ekranie. Mimo to **zasłoń klawiaturę**, jeśli ktoś stoi blisko.', 'While typing you see only **dots** — the digits never appear on screen. Still, **cover the keypad** if someone stands close.', 'Під час введення видно лише **крапки** — цифри не з’являються на екрані. Усе ж **прикривайте клавіатуру**, якщо хтось стоїть поруч.'),
                    { ekran: 'ekran-pin', typ: 'zobacz' }),
                K(null, T('Karta jest osobista', 'The card is personal', 'Картка особиста'),
                    T('**Nie pożyczaj karty** i nikomu nie mów PIN-u. Zgubioną kartę Ksiądz **unieważnia** — przestaje działać.', '**Do not lend your card** and never tell your PIN. The priest **cancels** a lost card — it stops working.', '**Не позичайте картку** і нікому не кажіть PIN. Втрачену картку Священник **анулює** — вона перестає діяти.'), { typ: 'zobacz' }),
                K(null, T('Kto widzi Twoje punkty?', 'Who sees your points?', 'Хто бачить ваші бали?'),
                    T('Swoje punkty widzisz **Ty** oraz **Ksiądz i Admin**. Inni ministranci widzą tylko ranking.', 'Your points are visible to **you**, the **priest and the Admin**. Other servers see only the ranking.', 'Ваші бали бачите **ви**, **Священник і Адміністратор**. Інші служителі бачать лише рейтинг.'),
                    { koniec: true, typ: 'zobacz' })
            ]
        }
    ]);

    wstawPrzed(MINISTRANT, 'm-jezyk', [
        {
            id: 'm-bezpieczenstwo-pin', ikona: '🛡️', slowa: 'pin bezpieczeństwo chronić pożyczyć kartę komu powiedzieć',
            tytul: T('Jak chronić swój PIN i kartę', 'How to protect your PIN and card', 'Як захистити свій PIN і картку'),
            opis: T('Kilka prostych zasad', 'A few simple rules', 'Кілька простих правил'),
            kroki: [
                K(null, T('Zasady', 'The rules', 'Правила'),
                    T('1️⃣ **Nikomu nie mów PIN-u** — nawet koledze.\n2️⃣ **Nie pożyczaj karty.**\n3️⃣ Wpisując PIN na kiosku, **zasłoń klawiaturę**.\n4️⃣ Na cudzym telefonie **zawsze się wyloguj**.', '1️⃣ **Never tell your PIN** — not even a friend.\n2️⃣ **Do not lend your card.**\n3️⃣ **Cover the keypad** when typing the PIN.\n4️⃣ On someone else’s phone **always sign out**.', '1️⃣ **Нікому не кажіть PIN** — навіть другові.\n2️⃣ **Не позичайте картку.**\n3️⃣ Вводячи PIN, **прикривайте клавіатуру**.\n4️⃣ На чужому телефоні **завжди виходьте**.'), { typ: 'zobacz' }),
                K('#pin-nowy', T('Ktoś znał Twój PIN?', 'Did someone learn your PIN?', 'Хтось дізнався ваш PIN?'),
                    T('Zmień go od razu na nowy — **4 cyfry**, nie za proste.', 'Change it to a new one right away — **4 digits**, not too simple.', 'Одразу змініть його на новий — **4 цифри**, не надто прості.'),
                    { koniec: true, przycisk: { temat: 'm-pin', tekst: T('▶ Pokaż, jak zmienić PIN', '▶ Show me how to change the PIN', '▶ Показати, як змінити PIN') } })
            ]
        },
        {
            id: 'm-nowy-miesiac', ikona: '🗓️', slowa: 'nowy miesiąc zero punkty zerowanie gdzie punkty',
            tytul: T('Punkty zaczęły się od zera — dlaczego?', 'My points started from zero — why?', 'Бали почалися з нуля — чому?'),
            opis: T('Punkty liczą się miesiącami', 'Points are counted per month', 'Бали рахуються за місяць'),
            kroki: [
                K('#mm-punkty', T('To normalne 🙂', 'That is normal 🙂', 'Це нормально 🙂'),
                    T('Punkty i ranking liczą się **w miesiącu** — nowy miesiąc zaczyna od zera. Nic nie przepadło!', 'Points and ranking are counted **per month** — a new month starts from zero. Nothing is lost!', 'Бали й рейтинг рахуються **за місяць** — новий місяць починається з нуля. Нічого не втрачено!'), { typ: 'zobacz' }),
                K('#mm-hist-miesiac', T('Poprzednie miesiące', 'Earlier months', 'Попередні місяці'),
                    T('Starsze punkty zobaczysz w **historii obecności** — wybierz poprzedni miesiąc i kliknij „Pokaż”.', 'You can see older points in the **attendance history** — choose an earlier month and tap “Show”.', 'Старіші бали видно в **історії присутності** — оберіть попередній місяць і натисніть «Показати».'),
                    { koniec: true, przycisk: { temat: 'm-historia', tekst: T('▶ Pokaż historię', '▶ Show the history', '▶ Показати історію') } })
            ]
        },
        {
            id: 'm-strona-nie-laduje', ikona: '🌐', slowa: 'strona nie ładuje się biała panel nie otwiera internet odśwież',
            tytul: T('Strona się nie ładuje', 'The page does not load', 'Сторінка не завантажується'),
            opis: T('Co sprawdzić po kolei', 'What to check, in order', 'Що перевірити по черзі'),
            kroki: [
                K(null, T('1. Odśwież stronę', '1. Reload the page', '1. Оновіть сторінку'),
                    T('Przeciągnij stronę **w dół** (telefon) albo naciśnij **F5** (komputer).', 'Pull the page **down** (phone) or press **F5** (computer).', 'Потягніть сторінку **вниз** (телефон) або натисніть **F5** (комп’ютер).'), { typ: 'zobacz' }),
                K(null, T('2. Sprawdź internet', '2. Check the internet', '2. Перевірте інтернет'),
                    T('Czy telefon ma **Wi-Fi albo zasięg**? Otwórz inną stronę, żeby sprawdzić.', 'Does the phone have **Wi-Fi or signal**? Open another page to check.', 'Чи є в телефона **Wi-Fi або зв’язок**? Відкрийте іншу сторінку, щоб перевірити.'), { typ: 'zobacz' }),
                K('#btn-wyloguj', T('3. Wyloguj się i zaloguj ponownie', '3. Sign out and in again', '3. Вийдіть і увійдіть знову'),
                    T('Kliknij **„Wyloguj”**, zamknij kartę przeglądarki i zaloguj się jeszcze raz.', 'Tap **“Sign out”**, close the browser tab and sign in again.', 'Натисніть **«Вийти»**, закрийте вкладку браузера й увійдіть знову.'), { auto: false }),
                Object.assign({}, KROK_KONTAKT, { koniec: true })
            ]
        }
    ]);
    wstawPrzed(LOGIN, 'l-jezyk', [{
        id: 'l-cudzy-telefon', ikona: '📱', slowa: 'cudzy telefon komputer wspólny bezpieczne logowanie wylogować nie zapamiętuj',
        tytul: T('Logowanie na cudzym telefonie lub komputerze', 'Signing in on someone else’s device', 'Вхід на чужому телефоні чи комп’ютері'),
        opis: T('Jak nie zostawić swoich danych', 'How not to leave your data behind', 'Як не залишити своїх даних'),
        kroki: [
            K('#login-kod', T('Zaloguj się jak zwykle', 'Sign in as usual', 'Увійдіть як зазвичай'),
                T('Wpisz kod i PIN. Jeśli przeglądarka **zapyta o zapamiętanie hasła** — wybierz **„Nie”**.', 'Enter the code and PIN. If the browser **offers to save the password**, choose **“No”**.', 'Введіть код і PIN. Якщо браузер **запропонує зберегти пароль** — оберіть **«Ні»**.')),
            K(null, T('Na koniec się wyloguj', 'Sign out at the end', 'Наприкінці вийдіть'),
                T('Po skończeniu **zawsze kliknij „Wyloguj”** (prawy górny róg panelu). Dzięki temu następna osoba nie zobaczy Twoich punktów.', 'When finished, **always tap “Sign out”** (top-right of the panel). Then the next person will not see your points.', 'Коли закінчите, **завжди натискайте «Вийти»** (вгорі праворуч у панелі). Тоді наступна людина не побачить ваших балів.'),
                { koniec: true, typ: 'zobacz' })
        ]
    }]);

    wstawPo(PANEL_KSIADZ, 'p-edytuj-wydarzenie', [
        {
            id: 'p-okno-rejestracji', ikona: '⏱️', grupa: 'Codzienne', slowa: 'okno rejestracji zapis za wcześnie za późno minuty przed po msza kiosk wydłuż',
            tytul: 'Zmień okno rejestracji dla jednej mszy', opis: 'Od kiedy do kiedy można się zapisać',
            kroki: [
                zak('kalendarz', 'Kalendarz'),
                K('details.zaawansowane summary', 'Otwórz „Ustawienia zaawansowane”', 'Kliknij **„Ustawienia zaawansowane”** pod polami daty — rozwinie się dodatkowy formularz.'),
                K('details.zaawansowane', 'Okno rejestracji', 'Ustaw, **ile minut przed i po rozpoczęciu** ministranci mogą zapisać się na **tę jedną** mszę. Puste pola = ustawienie domyślne od Admina (20 min przed, 5 min po).', { typ: 'wpisz', reczny: true }),
                K('#btn-dodaj-wydarzenie', 'Dodaj wydarzenie', 'Kliknij **„Dodaj wydarzenie”** (albo zapisz zmiany przy edycji istniejącego).', { koniec: true })
            ]
        },
        {
            id: 'p-blok-polaczony', ikona: '🔗', grupa: 'Codzienne', slowa: 'blok połączony msza nabożeństwo razem jedno wydarzenie plus',
            tytul: 'Msza połączona z nabożeństwem', opis: 'Dwa wydarzenia jako jeden blok',
            kroki: [
                zak('kalendarz', 'Kalendarz'),
                K('details.zaawansowane summary', 'Otwórz „Ustawienia zaawansowane”', 'W ustawieniach zaawansowanych oznaczysz wydarzenie jako **część bloku połączonego** (np. nabożeństwo + msza po sobie).'),
                K('details.zaawansowane', 'Oznacz blok', 'Dodaj **nabożeństwo** i **mszę** jako dwa wydarzenia i połącz je w jeden blok. Na kiosku ministrant zobaczy wtedy wybór: **tylko nabożeństwo (+1 pkt), tylko msza albo oba**.', { reczny: true }),
                K('#tabela-kalendarz', 'Sprawdź w tabeli', 'Oba wydarzenia pojawią się w kalendarzu obok siebie.', { koniec: true })
            ]
        },
        {
            id: 'p-tydzien', ikona: '📆', grupa: 'Codzienne', slowa: 'tydzień kilka mszy naraz zaplanować harmonogram wiele wydarzeń seria',
            tytul: 'Zaplanuj kilka mszy z rzędu', opis: 'Dodawanie wielu wydarzeń szybko',
            kroki: [
                zak('kalendarz', 'Kalendarz'),
                K('#nowe-typ', '1. Typ', 'Wybierz typ: **Msza**, **Nabożeństwo** albo **Zbiórka**.'),
                K('#nowe-data', '2. Data i godzina', 'Ustaw datę i godzinę **pierwszej** mszy.'),
                K('#btn-dodaj-wydarzenie', '3. Dodaj i powtórz', 'Kliknij **„Dodaj wydarzenie”**, potem zmień tylko datę i dodaj kolejną. Powtórz dla każdej mszy w tygodniu.'),
                K('#tabela-kalendarz', '4. Sprawdź całość', 'Wszystkie wydarzenia ułożą się w tabeli według daty — stąd je później edytujesz lub usuwasz.', { koniec: true })
            ]
        }
    ]);

    PANEL_ADMIN.push(
        {
            id: 'a-kopia-zapasowa', ikona: '💾', grupa: 'Admin: system', slowa: 'kopia zapasowa backup eksport bazy import zapis plik bezpieczeństwo danych',
            tytul: 'Kopia zapasowa bazy', opis: 'Eksport do pliku',
            kroki: [
                zak('narzedzia', 'Narzędzia'),
                K('#btn-nar-eksport', 'Eksportuj bazę', 'Kliknij eksport — system zapisze **kopię całej bazy** do pliku. Rób to regularnie, np. raz w miesiącu.'),
                K(null, 'Gdzie schować plik?', 'Plik zawiera **dane osobowe**: trzymaj go w bezpiecznym miejscu (nie wysyłaj mailem bez szyfrowania). Import ma tryb próbny — **zawsze zacznij od próby**.', { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'a-diagnostyka-kiosku', ikona: '🩺', grupa: 'Admin: system', slowa: 'diagnostyka kiosk nie działa offline od rana tablet nie wysyła obecności ping awaria',
            tytul: 'Kiosk nie działa — diagnostyka', opis: 'Sprawdź po kolei',
            kroki: [
                zak('kioski', 'Kioski'),
                K('#tabela-kioski', '1. Kiedy był ostatni ping?', 'Jeśli ostatni ping jest sprzed **kilku minut**, kiosk ma problem z siecią lub tabletem. Kolumna z kolejką pokazuje, ile obecności czeka na wysłanie.'),
                zak('narzedzia', 'Narzędzia'),
                K('#btn-nar-stan', '2. Samotest bazy', 'Kliknij samotest — sprawdzi, czy baza ma wszystkie potrzebne funkcje i widoki.'),
                K(null, '3. Na miejscu', 'Na tablecie **odśwież stronę kiosku** i sprawdź Wi-Fi. Kiosk i tak zapisuje obecności **offline** — po powrocie sieci wyśle je sam.', { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'a-ustawienia-okno', ikona: '🕒', grupa: 'Admin: system', slowa: 'domyślne okno zapisu minuty przed po rejestracja ustawienia kiosk zmień',
            tytul: 'Domyślne okno rejestracji', opis: 'Ile minut przed i po mszy',
            kroki: [
                zak('ustawienia', 'Ustawienia'),
                K('#ustawienia-lista', 'Znajdź ustawienia okna', 'Na liście poszukaj ustawień **okna rejestracji** (minuty **przed** i **po** rozpoczęciu). Domyślnie 20 minut przed i 5 po.'),
                K(null, 'Zapisz', 'Zmień wartość i kliknij **Zapisz** w jej wierszu. Dotyczy **wszystkich** mszy bez własnego okna. Zmiana trafia do audytu.', { koniec: true, typ: 'zobacz' })
            ]
        },
        {
            id: 'a-odpowiedz-wiadomosc', ikona: '📬', grupa: 'Admin: przegląd', slowa: 'odpowiedz wiadomość status obsłuż ministrant kontakt skrzynka uwagi',
            tytul: 'Obsłuż wiadomość od użytkownika', opis: 'Przeczytaj, zmień status, dopisz uwagi',
            kroki: [
                zak('wiadomosci', 'Wiadomości'),
                K('#tabela-wiadomosci', '1. Przeczytaj', 'Każda wiadomość ma **treść i zrzut ekranu** z miejsca, w którym ktoś miał problem — często od razu widać, o co chodzi.'),
                K(null, '2. Załatw sprawę', 'Rozwiąż problem (np. popraw obecność, odblokuj kod), a potem w wierszu wiadomości **zmień status** i dopisz uwagi.', { typ: 'zobacz' }),
                K('#btn-kt-adm-odswiez', '3. Odśwież', 'Odśwież listę, aby zobaczyć nowe wiadomości.', { koniec: true })
            ]
        }
    );

    // ============================================================================
    // v2.15.10 — NOWE TEKSTY: czat mini-asystenta, tryb „klikam za Ciebie”, czuwanie, powitanie
    // ============================================================================
    Object.assign(UI, {
        zakTematy: T('📚 Tematy', '📚 Topics', '📚 Теми'),
        zakZapytaj: T('💬 Zapytaj', '💬 Ask', '💬 Запитати'),
        tryb: T('Tryb pomocy', 'Help mode', 'Режим допомоги'),
        trybPokazuj: T('👀 Pokazuję, Ty klikasz', '👀 I show, you tap', '👀 Я показую, ви натискаєте'),
        trybAuto: T('🤖 Klikam za Ciebie (to, co bezpieczne)', '🤖 I click for you (safe things)', '🤖 Клікаю за вас (безпечне)'),
        trybOpis: T('W trybie „klikam za Ciebie” pomoc sama kliknie tylko bezpieczne rzeczy: zakładki, „Pokaż”, rozwijane sekcje i filtry. Przyciski, które zapisują lub usuwają dane, oraz pola do wpisania — zawsze robisz Ty.', 'In “I click for you” mode the help only clicks safe things: tabs, “Show”, expandable sections and filters. Buttons that save or delete data, and fields to type in, are always yours.', 'У режимі «клікаю за вас» допомога натискає лише безпечне: вкладки, «Показати», розкривні секції й фільтри. Кнопки, що зберігають чи видаляють дані, та поля для введення — завжди ваші.'),
        autoKiosk: T('Na kiosku nie klikam za nikogo — tu wszystko robisz Ty. 🙂', 'On the kiosk I do not click for anyone — you do everything here. 🙂', 'У кіоску я ні за кого не клікаю — тут усе робите ви. 🙂'),
        autoWlaczony: T('🤖 Tryb „klikam za Ciebie” włączony', '🤖 “I click for you” mode is on', '🤖 Режим «клікаю за вас» увімкнено'),
        autoWylaczony: T('👀 Tryb „pokazuję” — Ty klikasz', '👀 “I show” mode — you tap', '👀 Режим «показую» — ви натискаєте'),
        autoKlikam: T('🤖 Za chwilę kliknę to za Ciebie…', '🤖 I will click this for you in a moment…', '🤖 Зараз я натисну це за вас…'),
        autoStop: T('⏸ Stop', '⏸ Stop', '⏸ Стоп'),
        autoWstrzymano: T('⏸ Klikanie wstrzymane dla tego kroku — kliknij sam.', '⏸ Auto-click paused for this step — tap it yourself.', '⏸ Автоклік призупинено для цього кроку — натисніть самі.'),
        autoTyWpisz: T('⌨️ Tego nie wpiszę za Ciebie — to Twoje dane.', '⌨️ I will not type this for you — it is your data.', '⌨️ Цього я не введу за вас — це ваші дані.'),
        autoTyKlik: T('✋ Ten przycisk zapisuje lub zmienia dane — kliknij go sam.', '✋ This button saves or changes data — tap it yourself.', '✋ Ця кнопка зберігає чи змінює дані — натисніть її самі.'),
        pytajKrok: T('Pomóż mi z tym krokiem', 'Help me with this step', 'Допоможіть із цим кроком'),
        pokazGdzie: T('👆 Pokaż gdzie', '👆 Show where', '👆 Показати де'),
        czatPole: T('Napisz pytanie… (np. jak zmienić PIN)', 'Type a question… (e.g. how do I change my PIN)', 'Напишіть запитання… (напр. як змінити PIN)'),
        czatWyslij: T('Wyślij', 'Send', 'Надіслати'),
        czatChipy: T('Zapytaj na przykład:', 'Ask for example:', 'Запитайте, наприклад:'),
        czatMysle: T('⏳ Chwilę, uczę się z wiedzy o systemie…', '⏳ One moment, learning from the system knowledge…', '⏳ Хвилинку, вчуся зі знань про систему…'),
        czatBrakAI: T('Mini-asystent nie załadował się. Odśwież stronę albo wybierz temat z listy.', 'The mini assistant did not load. Reload the page or pick a topic.', 'Міні-асистент не завантажився. Оновіть сторінку або оберіть тему.'),
        czatInaczej: T('Dobrze — spróbuj opisać to innymi słowami albo przejrzyj listę tematów (zakładka 📚).', 'OK — try describing it in other words or browse the topics (the 📚 tab).', 'Добре — спробуйте описати іншими словами або перегляньте теми (вкладка 📚).'),
        czatStatus: T('🧠 Mini-silnik: {p} parametrów · {s}', '🧠 Mini engine: {p} parameters · {s}', '🧠 Міні-рушій: {p} параметрів · {s}'),
        czatGotowy: T('gotowy ✓', 'ready ✓', 'готовий ✓'),
        czatUczy: T('uczę się {x}%', 'learning {x}%', 'вчуся {x}%'),
        czatPowitanie: T('Cześć! 👋 Jestem mini-asystentem. Zapytaj, w czym mam pomóc — odpowiem krótko albo uruchomię przewodnik krok po kroku.', 'Hi! 👋 I am the mini assistant. Ask what you need — I will answer briefly or start a step-by-step guide.', 'Привіт! 👋 Я міні-асистент. Запитайте, з чим допомогти — відповім коротко або запущу покроковий посібник.'),
        poza: T('Tego tematu nie ma na tym ekranie — przejdź do właściwego panelu.', 'That topic is not on this screen — go to the right panel.', 'Цієї теми немає на цьому екрані — перейдіть до потрібної панелі.'),
        powitanie: T('👋 Cześć! Kliknij ❓ w lewym dolnym rogu — pokażę Ci krok po kroku, co robić.', '👋 Hi! Tap ❓ in the bottom-left corner — I will show you step by step what to do.', '👋 Привіт! Натисніть ❓ внизу ліворуч — я покажу крок за кроком, що робити.'),
        utknal: T('Ten krok trwa długo 🙂 Dotknij 💬, a pomogę — albo 🔊, a przeczytam go na głos.', 'This step is taking a while 🙂 Tap 💬 and I will help — or 🔊 and I will read it aloud.', 'Цей крок триває довго 🙂 Натисніть 💬 — допоможу, або 🔊 — прочитаю вголос.'),
        brakKroku: T('Żaden przewodnik nie jest teraz uruchomiony — wybierz temat z listy (zakładka 📚).', 'No guide is running right now — pick a topic (the 📚 tab).', 'Зараз жоден посібник не запущено — оберіть тему (вкладка 📚).'),
        krokTo: T('To krok **{t}**.\n{x}', 'This is the step **{t}**.\n{x}', 'Це крок **{t}**.\n{x}'),
        brakElementu: T('Nie widzisz podświetlonego miejsca? 🔍 Najczęstsze powody:\n1️⃣ jesteś w **innej zakładce** lub na innym ekranie,\n2️⃣ tabela jest **pusta** (nie ma jeszcze danych),\n3️⃣ ta opcja jest **tylko dla Admina**,\n4️⃣ strona jest **bardzo powiększona** — zmniejsz powiększenie w przeglądarce.', 'Cannot see the highlighted spot? 🔍 Common reasons:\n1️⃣ you are on **another tab or screen**,\n2️⃣ the table is **empty**,\n3️⃣ the option is **Admin-only**,\n4️⃣ the page is **zoomed in** a lot.', 'Не бачите підсвіченого місця? 🔍 Типові причини:\n1️⃣ ви на **іншій вкладці чи екрані**,\n2️⃣ таблиця **порожня**,\n3️⃣ опція **лише для Адміністратора**,\n4️⃣ сторінка **сильно збільшена**.'),
        kontaktBtn: T('✉️ Napisz do Admina', '✉️ Write to the Admin', '✉️ Написати Адміністратору'),
        zapamietalem: T('🧠 Zapamiętałem Twój wybór — następnym razem trafię szybciej.', '🧠 I remembered your choice — I will get it faster next time.', '🧠 Запам’ятав ваш вибір — наступного разу влучу швидше.'),
        czatUczone: T(' · zapamiętane wybory: {n}', ' · remembered choices: {n}', ' · запам’ятані вибори: {n}')
    });
    // Szybkie pytania (na kiosku to jedyny sposób zadawania pytań — bez klawiatury, żeby nie kolidować ze skanerem)
    const CHIPY = {
        kiosk: [T('Zgubiłem kartę', 'I lost my card', 'Загубив картку'), T('Czytnik nie działa', 'The reader does not work', 'Сканер не працює'), T('Nie widzę mojej mszy', 'I cannot see my Mass', 'Не бачу своєї Меси'), T('Wpisałem zły PIN', 'I entered the wrong PIN', 'Ввів хибний PIN'), T('Ile dostanę punktów?', 'How many points will I get?', 'Скільки балів я отримаю?'), T('Pierwszy raz tu jestem', 'First time here', 'Я тут вперше')],
        'kiosk-ksiadz': [T('Dopisz obecność ręcznie'), T('Cofnij pomyłkę'), T('Co mogę tu zrobić?')],
        'kiosk-admin': [T('Odblokuj kod ministranta'), T('Tryb offline i kolejka'), T('Wyczyść starą kolejkę'), T('Dopisz obecność ręcznie')],
        login: [T('Zapomniałem PIN-u', 'I forgot my PIN', 'Забув PIN'), T('Jak się zalogować?', 'How do I sign in?', 'Як увійти?'), T('Aplikacja na telefon', 'App on my phone', 'Застосунок на телефон')],
        ministrant: [T('Ile mam punktów?', 'How many points do I have?', 'Скільки в мене балів?'), T('Zmień mój PIN', 'Change my PIN', 'Змінити мій PIN'), T('Brakuje mi punktów', 'My points are missing', 'Мені бракує балів'), T('Mój ranking', 'My ranking', 'Мій рейтинг')],
        ksiadz: [T('Dodaj mszę do kalendarza'), T('Zatwierdź zgłoszenie pogrzebu'), T('Dopisz obecność ręcznie'), T('Dodaj nowego ministranta'), T('Wydrukuj karty QR')],
        admin: [T('Kopia zapasowa bazy'), T('Kiosk nie wysyła obecności'), T('Nadaj rolę księdza'), T('Cofnij zmianę z audytu'), T('Co wymaga uwagi?')],
        start: [T('Którą opcję wybrać?', 'Which option should I pick?', 'Яку опцію обрати?'), T('Jestem księdzem — co wybrać?', 'I am a priest — what do I pick?', 'Я священник — що обрати?')]
    };

    // ------------------------------------------------------------------ MAPA KONTEKST → TEMATY ----
    const PRZEWODNIKI = {
        start: START,
        login: LOGIN,
        kiosk: KIOSK,
        'kiosk-ksiadz': [E_PRZEGLAD, E_RECZNA, E_COFNIJ, E_WYJDZ],
        'kiosk-admin': [E_PRZEGLAD, E_RECZNA, E_COFNIJ, E_ODBLOKUJ, E_OFFLINE, E_CZYSC, E_WYJDZ],
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
    function norm(s) { return String(s || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
    function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignoruj */ } }
    function mniejRuchu() { return bezpiecznie(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, false); }

    // ============================================================================
    // STAN
    // ============================================================================
    let aktywny = null;             // { temat, kroki, i, kontekst, wstecz, wszedl, zalicza, zwiniety, uwaga }
    let menuOtwarte = false;
    let menuKontekst = null;
    let ostatniaAktywnosc = Date.now();
    let rozmiar = 0;                // 0 = normalny, 1 = większy, 2 = największy tekst
    let licznikPochwal = 0;
    let trybAuto = false;           // tryb „klikam za Ciebie” (tylko bezpieczne czynności; nigdy na kiosku)
    let widokMenu = 'tematy';       // 'tematy' | 'czat'
    let czat = [];                  // wiadomości czatu mini-asystenta
    let ai = null;                  // mini-silnik (js/pomoc-ai.js), tworzony leniwie
    let toastTimer = null;
    const BEZCZYNNOSC_KIOSK_MS = 90 * 1000;

    function biezacyKrok() { return aktywny ? aktywny.kroki[aktywny.i] : null; }
    function maWarunek(s) { return !!(s && (s.gdy || s.ekran)); }
    function zgodny(s) { if (s.gdy) return !!bezpiecznie(s.gdy, false); if (s.ekran) return ekranWidoczny(s.ekran); return true; }

    // Jaki to rodzaj kroku (podpowiada człowiekowi, CO ma zrobić: kliknąć, wpisać, wybrać, tylko zobaczyć)
    function typKroku(k) {
        if (k.typ) return k.typ;
        const el = pierwszyWidoczny(k.cel);
        if (el) {
            const tag = el.tagName;
            if (tag === 'SELECT') return 'wybierz';
            if (tag === 'TEXTAREA') return 'wpisz';
            if (tag === 'INPUT') { const ty = (el.type || '').toLowerCase(); return (ty === 'checkbox' || ty === 'radio' || ty === 'file' || ty === 'button' || ty === 'submit') ? 'klik' : 'wpisz'; }
            if (el.classList && el.classList.contains('numpad')) return 'dotknij';
            if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return 'klik';
        }
        return (k.klik || k.dalejGdy) ? 'klik' : 'zobacz';
    }
    // Czy kliknięcie w podświetlony element ma samo przeskoczyć dalej
    function czyKlik(k) {
        if (k.reczny || k.dalejGdy) return false;
        if (k.klik === true) return true;
        const el = pierwszyWidoczny(k.cel);
        return !!el && (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'SUMMARY') && !k.koniec;
    }

    // ============================================================================
    // INTERFEJS
    // ============================================================================
    function zastosujRozmiar() {
        ['pomoc-menu', 'pomoc-krok'].forEach((id) => { const e = $(id); if (e) { e.classList.toggle('pomoc-r1', rozmiar === 1); e.classList.toggle('pomoc-r2', rozmiar === 2); } });
    }

    function zbuduj() {
        if ($('pomoc-przycisk')) return;
        const dodaj = (tag, id, kl, atr) => { const e = D.createElement(tag); e.id = id; e.className = kl; e.setAttribute('data-zrzut-ukryj', '1'); Object.keys(atr || {}).forEach((k) => e.setAttribute(k, atr[k])); D.body.appendChild(e); return e; };
        const b = dodaj('button', 'pomoc-przycisk', 'pomoc-przycisk', { type: 'button', 'data-pomoc': 'menu', 'aria-haspopup': 'dialog' });
        let nowy = true; try { nowy = !localStorage.getItem('em_pomoc_uzyta'); } catch (e) { /* ignoruj */ }
        if (nowy) b.classList.add('pomoc-nowy');
        dodaj('div', 'pomoc-menu', 'pomoc-menu hidden', { role: 'dialog' });
        dodaj('div', 'pomoc-podswietlenie', 'pomoc-podswietlenie hidden', { 'aria-hidden': 'true' });
        dodaj('div', 'pomoc-dod', 'pomoc-dod', { 'aria-hidden': 'true' });
        dodaj('div', 'pomoc-wskaznik', 'pomoc-wskaznik hidden', { 'aria-hidden': 'true' });
        dodaj('div', 'pomoc-krok', 'pomoc-krok hidden', { role: 'dialog', 'aria-live': 'polite' });
        dodaj('div', 'pomoc-toast', 'pomoc-toast hidden', { role: 'status', 'aria-live': 'polite' });
        rozmiar = jestKioskiem(kontekst()) ? 0 : lsGet('em_pomoc_rozmiar', 0);
        trybAuto = jestKioskiem(kontekst()) ? false : !!lsGet('em_pomoc_auto', false);
        zastosujRozmiar();
        odswiezPrzycisk();
    }

    function odswiezPrzycisk() {
        const b = $('pomoc-przycisk'); if (!b) return;
        b.innerHTML = '<span class="pomoc-ikona" aria-hidden="true">❓</span><span class="pomoc-etykieta">' + esc(tx(UI.przycisk)) + '</span>';
        b.title = tx(UI.przyciskTytul);
        b.setAttribute('aria-label', tx(UI.przyciskTytul));
    }

    // Krótkie dymki: pochwały, „pomijam krok”, powitanie i gratulacje na koniec
    function toast(txt, typ, ms) {
        const t = $('pomoc-toast'); if (!t) return;
        t.textContent = txt;
        t.className = 'pomoc-toast pomoc-toast-' + (typ || 'info');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 2600);
    }
    function pochwala() { const l = UI.pochwaly[jez()] || UI.pochwaly.pl; licznikPochwal++; return l[licznikPochwal % l.length]; }
    function konfetti() {
        if (mniejRuchu()) return;
        const emoji = ['🎉', '⭐', '✨', '🎈', '🌟', '💫'];
        const w = D.createElement('div'); w.className = 'pomoc-konfetti'; w.setAttribute('aria-hidden', 'true'); w.setAttribute('data-zrzut-ukryj', '1');
        for (let i = 0; i < 24; i++) {
            const s = D.createElement('span'); s.textContent = emoji[i % emoji.length];
            s.style.left = (Math.random() * 100) + 'vw'; s.style.animationDelay = (Math.random() * 0.7) + 's'; s.style.fontSize = (18 + Math.random() * 20) + 'px';
            w.appendChild(s);
        }
        D.body.appendChild(w);
        setTimeout(() => { if (w.parentNode) w.parentNode.removeChild(w); }, 3400);
    }

    // Czytanie na głos (dla osób słabiej widzących i najmłodszych)
    function cisza() { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignoruj */ } }
    function czytaj() {
        const k = biezacyKrok(); if (!k || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
        cisza();
        const u = new SpeechSynthesisUtterance(tx(k.tytul) + '. ' + tx(k.tekst).replace(/\*\*/g, '').replace(/\n/g, '. '));
        u.lang = { pl: 'pl-PL', en: 'en-GB', uk: 'uk-UA' }[jez()] || 'pl-PL'; u.rate = 0.9;
        window.speechSynthesis.speak(u);
    }

    // ---- polecany temat: zależny od tego, co jest teraz na ekranie
    const TAB_TEMAT = { kalendarz: 'p-wydarzenie', zgloszenia: 'p-zgloszenia', reczna: 'p-reczna', ministranci: 'p-ministrant', karty: 'p-karty', listy: 'p-listy', obecnosci: 'p-obecnosci', frekwencja: 'p-frekwencja', bezpieczenstwo: 'p-odblokuj',
        dashboard: 'a-dashboard', raport: 'a-raport', akceptacje: 'a-akceptacje', wiadomosci: 'a-wiadomosci', kioski: 'a-kioski', baza: 'a-baza', statystyki: 'a-statystyki', ustawienia: 'a-ustawienia', audyt: 'a-audyt', narzedzia: 'a-narzedzia', rodo: 'a-rodo' };
    function podpowiedz(k) {
        let id = null;
        if (k === 'kiosk') id = (widoczny($('tryb-specjalny-aktywny'))) ? 'k-specjalna' : 'k-obecnosc';
        else if (k === 'ministrant') id = 'm-punkty';
        else if (k === 'login') id = 'l-logowanie';
        else if (k === 'start') id = 's-kim-jestem';
        else if (k === 'ksiadz' || k === 'admin') { const b = D.querySelector('.tabs button.active'); id = b ? TAB_TEMAT[b.getAttribute('data-tab')] : null; }
        else if (k === 'kiosk-ksiadz' || k === 'kiosk-admin') id = 'e-reczna';
        return id && znajdzTemat(k, id) ? id : null;
    }

    function przyciskTematu(t, ukonczone) {
        const n = t.kroki.length;
        return '<button type="button" class="pomoc-temat" data-pomoc="temat" data-temat="' + esc(t.id) + '"><span class="pomoc-temat-ikona" aria-hidden="true">' + esc(t.ikona || '•') + '</span>' +
            '<span class="pomoc-temat-tekst"><b>' + esc(tx(t.tytul)) + (ukonczone.indexOf(t.id) >= 0 ? ' <span class="pomoc-ptak" title="' + esc(tx(UI.ukonczono)) + '">✓</span>' : '') + '</b>' +
            '<small>' + esc(tx(t.opis || '')) + (t.opis ? ' · ' : '') + esc(tpl(tx(UI.krokow), { n: n })) + '</small></span></button>';
    }

    function odswiezListe(zapytanie) {
        const box = $('pomoc-lista'); if (!box) return;
        const k = kontekst();
        const ukonczone = jestKioskiem(k) ? [] : lsGet('em_pomoc_ukonczone', []);
        let tematy = tematyDla(k);
        const q = norm(zapytanie).trim();
        let html = '';
        if (q) {
            tematy = tematy.filter((t) => norm(tx(t.tytul) + ' ' + tx(t.opis || '') + ' ' + (t.slowa || '')).indexOf(q) >= 0);
            tematy.forEach((t) => { html += przyciskTematu(t, ukonczone); });
            if (!tematy.length) html = '<p class="pomoc-pusty">' + esc(tx(UI.brakWynikow)) + '</p>';
        } else {
            let poprzedniaGrupa = null;
            tematy.forEach((t) => {
                if (t.grupa && t.grupa !== poprzedniaGrupa) { html += '<div class="pomoc-grupa">' + esc(tx(t.grupa)) + '</div>'; poprzedniaGrupa = t.grupa; }
                html += przyciskTematu(t, ukonczone);
            });
            if (!tematy.length) html = '<p class="pomoc-pusty">' + esc(tx(UI.brakTematow)) + '</p>';
        }
        box.innerHTML = html;
    }

    function przyciskiZakladek(widok) {
        return '<div class="pomoc-zakladki" role="tablist">' +
            '<button type="button" role="tab" aria-selected="' + (widok === 'tematy') + '" class="pomoc-zak' + (widok === 'tematy' ? ' aktywna' : '') + '" data-pomoc="widok" data-widok="tematy">' + esc(tx(UI.zakTematy)) + '</button>' +
            '<button type="button" role="tab" aria-selected="' + (widok === 'czat') + '" class="pomoc-zak' + (widok === 'czat' ? ' aktywna' : '') + '" data-pomoc="widok" data-widok="czat">' + esc(tx(UI.zakZapytaj)) + '</button></div>';
    }
    function wierszTrybu() {
        if (jestKioskiem(kontekst())) return '';
        return '<div class="pomoc-tryb"><div class="pomoc-tryb-nazwa">' + esc(tx(UI.tryb)) + '</div>' +
            '<button type="button" class="pomoc-tryb-btn' + (trybAuto ? ' wlaczony' : '') + '" data-pomoc="auto-przelacz" aria-pressed="' + (!!trybAuto) + '">' + esc(tx(trybAuto ? UI.trybAuto : UI.trybPokazuj)) + '</button>' +
            '<p class="pomoc-pusty">' + esc(tx(UI.trybOpis)) + '</p></div>';
    }
    function renderTematy() {
        const box = $('pomoc-widok'); if (!box) return;
        const k = kontekst();
        const tematy = tematyDla(k);
        const ukonczone = jestKioskiem(k) ? [] : lsGet('em_pomoc_ukonczone', []);
        let html = '';
        if (aktywny) html += '<button type="button" class="pomoc-temat pomoc-temat-zakoncz" data-pomoc="zakoncz"><span class="pomoc-temat-ikona">⏹</span><span class="pomoc-temat-tekst"><b>' + esc(tx(UI.zakoncz)) + '</b></span></button>';
        const pol = podpowiedz(k);
        if (pol) { const t = znajdzTemat(k, pol); html += '<div class="pomoc-grupa">' + esc(tx(UI.polecam)) + '</div>' + przyciskTematu(t, ukonczone).replace('class="pomoc-temat"', 'class="pomoc-temat pomoc-temat-polecany"'); }
        if (!jestKioskiem(k)) {
            const ost = lsGet('em_pomoc_ostatnie', []).filter((id) => id !== pol && znajdzTemat(k, id));
            if (ost.length) { html += '<div class="pomoc-grupa">' + esc(tx(UI.ostatnio)) + '</div>'; ost.slice(0, 3).forEach((id) => { html += przyciskTematu(znajdzTemat(k, id), ukonczone); }); }
            if (tematy.length > 8) html += '<input type="search" id="pomoc-szukaj" class="pomoc-szukaj" autocomplete="off" placeholder="' + esc(tx(UI.szukaj)) + '" aria-label="' + esc(tx(UI.szukaj)) + '">';
        }
        html += '<div id="pomoc-lista"></div>';
        box.innerHTML = html;
        odswiezListe('');
    }
    function renderMenu() {
        const m = $('pomoc-menu'); if (!m) return;
        const k = kontekst(); menuKontekst = k;
        let html = '<div class="pomoc-menu-gora"><div><div class="pomoc-menu-tytul">' + esc(tx(UI.menuNaglowek)) + '</div><div class="pomoc-menu-kontekst">' + esc(tx(NAZWY_KONTEKSTU[k])) + '</div></div>' +
            '<div class="pomoc-narzedzia"><button type="button" class="pomoc-x" data-pomoc="rozmiar" title="' + esc(tx(UI.rozmiar)) + '" aria-label="' + esc(tx(UI.rozmiar)) + '">A+</button>' +
            '<button type="button" class="pomoc-x" data-pomoc="zamknij-menu" aria-label="' + esc(tx(UI.zamknij)) + '">✖</button></div></div>';
        html += przyciskiZakladek(widokMenu);
        html += '<div id="pomoc-widok" class="pomoc-widok"></div>';
        html += wierszTrybu();
        html += '<p class="pomoc-stopka">' + esc(tx(UI.menuStopka)) + '</p>';
        m.innerHTML = html;
        if (widokMenu === 'czat') renderCzat(); else renderTematy();
        zastosujRozmiar();
    }

    function otworzMenu() {
        zbuduj();
        renderMenu();
        $('pomoc-menu').classList.remove('hidden');
        menuOtwarte = true;
        if (aktywny && !aktywny.zwiniety) { aktywny.zwiniety = true; aktywny.zwinietyPrzezMenu = true; renderKrok(); }   // karta kroku nie zasłania menu
        try { localStorage.setItem('em_pomoc_uzyta', '1'); } catch (e) { /* ignoruj */ }
        const b = $('pomoc-przycisk'); if (b) b.classList.remove('pomoc-nowy');
        pozycjonuj();
    }
    function zamknijMenu() {
        const m = $('pomoc-menu'); if (m) m.classList.add('hidden'); menuOtwarte = false;
        if (aktywny && aktywny.zwinietyPrzezMenu) { aktywny.zwinietyPrzezMenu = false; aktywny.zwiniety = false; renderKrok(); pozycjonuj(); }
    }

    function renderKrok() {
        const c = $('pomoc-krok'); if (!c || !aktywny) return;
        const krok = biezacyKrok();
        const n = aktywny.i + 1, m = aktywny.kroki.length;
        const ostatni = aktywny.i === m - 1;
        const typ = typKroku(krok);
        const el = pierwszyWidoczny(krok.cel);
        let uwaga = '';
        if (maWarunek(krok) && !krok.koniec && !zgodny(krok)) uwaga = tx(UI.czekam);
        else if (krok.cel && !el && !maWarunek(krok)) uwaga = tx(UI.brakCelu);
        const podp = krok.podp ? tx(krok.podp) : (UI['podp_' + typ] ? tx(UI['podp_' + typ]) : '');
        const mowa = !!(window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined');
        // tryb „klikam za Ciebie”: co zrobię sam, a czego nie
        let auto = '';
        if (trybAuto && !jestKioskiem(aktywny.kontekst) && el && !aktywny.wstecz) {
            const p = planAuto(krok, el);
            if (p && aktywny.autoStop) auto = '<p class="pomoc-uwaga">' + esc(tx(UI.autoWstrzymano)) + '</p>';
            else if (p) auto = '<p class="pomoc-auto">' + esc(tx(UI.autoKlikam)) + ' <button type="button" class="pomoc-mini" data-pomoc="auto-stop">' + esc(tx(UI.autoStop)) + '</button></p>';
            else if (typ === 'wpisz') auto = '<p class="pomoc-uwaga">' + esc(tx(UI.autoTyWpisz)) + '</p>';
            else if (typ === 'klik' && !krok.dalejGdy) auto = '<p class="pomoc-uwaga">' + esc(tx(UI.autoTyKlik)) + '</p>';
        }
        let kropki = ''; for (let i = 0; i < m; i++) kropki += '<i class="' + (i < aktywny.i ? 'zrobione' : (i === aktywny.i ? 'biezacy' : '')) + '"></i>';
        c.classList.remove('pomoc-ok');
        c.classList.toggle('pomoc-zwiniety', !!aktywny.zwiniety);
        const btn = (akcja, ikona, tytul) => '<button type="button" class="pomoc-x" data-pomoc="' + akcja + '" title="' + esc(tytul) + '" aria-label="' + esc(tytul) + '">' + ikona + '</button>';
        c.innerHTML =
            '<div class="pomoc-krok-gora"><span class="pomoc-krok-numer">' + esc(tpl(tx(UI.krok), { n: n, m: m })) + ' · ' + esc(tx(aktywny.temat.tytul)) + '</span>' +
            '<div class="pomoc-narzedzia">' + (mowa ? btn('czytaj', '🔊', tx(UI.czytaj)) : '') + btn('pytaj-krok', '💬', tx(UI.pytajKrok)) + btn('rozmiar', 'A+', tx(UI.rozmiar)) +
            btn('zwin', aktywny.zwiniety ? '▴' : '▾', tx(aktywny.zwiniety ? UI.rozwin : UI.zwin)) + btn('zakoncz', '✖', tx(UI.zamknij)) + '</div></div>' +
            '<div class="pomoc-kropki" aria-hidden="true">' + kropki + '</div>' +
            '<div class="pomoc-chip-wiersz"><span class="pomoc-chip pomoc-chip-' + esc(typ) + '">' + esc(tx(UI['akcja_' + typ] || UI.akcja_zobacz)) + '</span>' +
            (el ? ' <button type="button" class="pomoc-mini" data-pomoc="gdzie">' + esc(tx(UI.pokazGdzie)) + '</button>' : '') + '</div>' +
            '<h4 class="pomoc-krok-tytul">' + esc(tx(krok.tytul)) + '</h4>' +
            '<p class="pomoc-krok-tekst">' + fmt(tx(krok.tekst)) + '</p>' +
            (krok.przycisk ? '<button type="button" class="pomoc-btn pomoc-btn-glowny pomoc-btn-duzy" data-pomoc="temat" data-temat="' + esc(krok.przycisk.temat) + '">' + esc(tx(krok.przycisk.tekst)) + '</button>' : '') +
            auto +
            (uwaga ? '<p class="pomoc-uwaga">' + esc(uwaga) + '</p>' : '') +
            (podp && !ostatni ? '<p class="pomoc-podpowiedz">💬 ' + esc(podp) + '</p>' : '') +
            '<div class="pomoc-przyciski">' +
            '<button type="button" class="pomoc-btn" data-pomoc="wstecz"' + (aktywny.i === 0 ? ' disabled' : '') + '>' + esc(tx(UI.wstecz)) + '</button>' +
            '<button type="button" class="pomoc-btn" data-pomoc="lista">' + esc(tx(UI.tematy)) + '</button>' +
            '<button type="button" class="pomoc-btn pomoc-btn-glowny" data-pomoc="dalej">' + esc(tx(ostatni ? UI.gotowe : UI.dalej)) + '</button></div>';
        c.classList.remove('hidden');
        c.classList.remove('pomoc-wejscie'); void c.offsetWidth; if (!mniejRuchu()) c.classList.add('pomoc-wejscie');
        aktywny.uwaga = uwaga;
        zastosujRozmiar();
    }

    // Pozycja podświetlenia, dodatkowych ramek, palca-wskaźnika i karty kroku (karta schodzi z drogi elementowi)
    function pozycjonuj() {
        const sp = $('pomoc-podswietlenie'), c = $('pomoc-krok'), dod = $('pomoc-dod'), pal = $('pomoc-wskaznik');
        if (!sp || !c) return;
        const krok = biezacyKrok();
        const el = krok ? pierwszyWidoczny(krok.cel) : null;
        let r = null;
        if (el) { r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) r = null; }
        if (r && aktywny) {
            const m = 6;
            sp.style.left = (r.left - m) + 'px'; sp.style.top = (r.top - m) + 'px';
            sp.style.width = (r.width + 2 * m) + 'px'; sp.style.height = (r.height + 2 * m) + 'px';
            sp.classList.toggle('pomoc-bez-tla', r.height > window.innerHeight * 0.75);
            sp.classList.remove('hidden');
        } else sp.classList.add('hidden');

        // dodatkowe ramki (np. czytnik ORAZ przycisk kamery)
        if (dod) {
            dod.innerHTML = '';
            if (aktywny && krok && krok.cele) krok.cele.forEach((sel) => {
                const e2 = pierwszyWidoczny(sel); if (!e2) return;
                const r2 = e2.getBoundingClientRect(); if (!(r2.width > 0 && r2.height > 0)) return;
                const d = D.createElement('div'); d.className = 'pomoc-ramka-dod';
                d.style.left = (r2.left - 6) + 'px'; d.style.top = (r2.top - 6) + 'px'; d.style.width = (r2.width + 12) + 'px'; d.style.height = (r2.height + 12) + 'px';
                dod.appendChild(d);
            });
        }

        // palec wskazujący na element
        if (pal) {
            let cel2 = r;
            if (!cel2 && aktywny && krok && krok.cele) { for (let i = 0; i < krok.cele.length && !cel2; i++) { const e3 = pierwszyWidoczny(krok.cele[i]); if (e3) { const r3 = e3.getBoundingClientRect(); if (r3.width > 0) cel2 = r3; } } }
            if (aktywny && cel2 && cel2.height < window.innerHeight * 0.5 && !(aktywny.zwiniety && false)) {
                const pod = cel2.bottom + 50 < window.innerHeight - 8;
                pal.textContent = pod ? '👆' : '👇';
                pal.style.left = Math.max(4, Math.min(window.innerWidth - 44, cel2.left + cel2.width / 2 - 20)) + 'px';
                pal.style.top = (pod ? cel2.bottom + 2 : cel2.top - 46) + 'px';
                pal.classList.remove('hidden');
            } else pal.classList.add('hidden');
        }

        if (aktywny && !c.classList.contains('hidden')) {
            const h = c.offsetHeight, w = c.offsetWidth;
            const dol = Math.max(8, window.innerHeight - h - 96);
            let top = dol;
            if (r) {
                const kolizja = r.bottom > dol - 8 && r.top < dol + h + 8 && r.right > 12 && r.left < 12 + w + 8;
                if (kolizja) top = 12;
            }
            c.style.top = (menuOtwarte ? 12 : Math.max(8, top)) + 'px';
        }
    }
    let czekaPoz = false;
    function pozRaf() { if (czekaPoz) return; czekaPoz = true; requestAnimationFrame(() => { czekaPoz = false; pozycjonuj(); }); }

    // ============================================================================
    // PRZEWODNIK
    // ============================================================================
    function start(id) {
        const k = kontekst();
        const temat = znajdzTemat(k, id);
        if (!temat) return;
        const kroki = temat.kroki.filter((s) => !s.jesli || bezpiecznie(s.jesli, true));
        if (!kroki.length) return;
        cisza();
        aktywny = { temat: temat, kroki: kroki, i: 0, kontekst: k, wstecz: false, wszedl: Date.now(), zalicza: false, zwiniety: false, uwaga: '' };
        if (!jestKioskiem(k)) { const o = lsGet('em_pomoc_ostatnie', []).filter((x) => x !== id); o.unshift(id); lsSet('em_pomoc_ostatnie', o.slice(0, 5)); }
        zamknijMenu();
        toast(tpl(tx(UI.start), { t: tx(temat.tytul) }), 'info', 1800);
        wejdzWKrok(0, false);
    }

    function wejdzWKrok(i, wstecz) {
        if (!aktywny) return;
        aktywny.i = Math.max(0, Math.min(aktywny.kroki.length - 1, i));
        aktywny.wstecz = !!wstecz;      // po cofnięciu nie przeskakujemy automatycznie
        aktywny.wszedl = Date.now();
        aktywny.zalicza = false; aktywny.autoStop = false; aktywny.pomogl = false; anulujAuto();
        { const cc = $('pomoc-krok'); if (cc) cc.classList.remove('pomoc-potrzebuje'); }
        const krok = biezacyKrok();
        // Krok już spełniony (np. wybrany filtr „Oczekujące”, zakładka już otwarta) → pomijamy go bez pytania
        if (!wstecz && krok.pomin && aktywny.i < aktywny.kroki.length - 1 && bezpiecznie(krok.pomin, false)) {
            toast(tpl(tx(UI.pominieto), { t: tx(krok.tytul) }), 'ok', 1800);
            wejdzWKrok(aktywny.i + 1, false);
            return;
        }
        cisza();
        renderKrok();
        const el = pierwszyWidoczny(krok.cel);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.top < 60 || r.bottom > window.innerHeight - 100) {
                try { el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignoruj */ }
            }
        }
        pozycjonuj();
        zaplanujAuto();
    }
    function nastepny() {
        if (!aktywny) return;
        if (aktywny.i >= aktywny.kroki.length - 1) { ukoncz(true); return; }
        wejdzWKrok(aktywny.i + 1, false);
    }
    function poprzedni() { if (aktywny && aktywny.i > 0) wejdzWKrok(aktywny.i - 1, true); }
    function zakoncz() {
        anulujAuto();
        aktywny = null;
        cisza();
        ['pomoc-krok', 'pomoc-podswietlenie', 'pomoc-wskaznik'].forEach((id) => { const e = $(id); if (e) e.classList.add('hidden'); });
        const d = $('pomoc-dod'); if (d) d.innerHTML = '';
    }
    // Zakończenie tematu: gratulacje i konfetti (a nie tylko ciche zniknięcie karty)
    function ukoncz(celebruj) {
        const t = aktywny && aktywny.temat, k = aktywny && aktywny.kontekst;
        zakoncz();
        if (celebruj && t) {
            if (!jestKioskiem(k)) { const u = lsGet('em_pomoc_ukonczone', []); if (u.indexOf(t.id) < 0) { u.push(t.id); lsSet('em_pomoc_ukonczone', u); } }
            toast(tpl(tx(UI.koniec), { t: tx(t.tytul) }), 'wielki', 3400);
            konfetti();
        }
    }
    // Człowiek wykonał czynność → krótka pochwała i dopiero wtedy następny krok
    function zalicz(idx) {
        if (!aktywny || aktywny.i !== idx || aktywny.zalicza) return;
        aktywny.zalicza = true;
        const c = $('pomoc-krok'); if (c) c.classList.add('pomoc-ok');
        toast(pochwala(), 'ok', 1300);
        setTimeout(() => { if (aktywny && aktywny.i === idx) nastepny(); }, 450);
    }

    // Co 300 ms: podążanie za ekranem, automatyczne przejścia, pomijanie spełnionych kroków, pozycje, bezczynność kiosku
    function tik() {
        const k = kontekst();
        if (jestKioskiem(k) && Date.now() - ostatniaAktywnosc > BEZCZYNNOSC_KIOSK_MS) {
            if (aktywny) zakoncz();
            if (menuOtwarte) zamknijMenu();
            if (rozmiar !== 0) { rozmiar = 0; zastosujRozmiar(); }
        }
        if (aktywny && k !== aktywny.kontekst) {          // np. wylogowanie albo wejście Księdza w tryb awaryjny
            zakoncz();
            if (jestKioskiem(k) || k === 'login') { renderMenu(); otworzMenu(); }
        } else if (menuOtwarte && k !== menuKontekst) renderMenu();

        if (!aktywny) return;
        czuwaj();
        const krok = biezacyKrok();
        // 1) ekran/stan się zmienił → przeskocz do kroku, który do niego pasuje (najpierw w przód, potem wstecz)
        if (maWarunek(krok) && !zgodny(krok)) {
            let cel = -1;
            for (let j = aktywny.i + 1; j < aktywny.kroki.length; j++) { if (maWarunek(aktywny.kroki[j]) && zgodny(aktywny.kroki[j])) { cel = j; break; } }
            if (cel < 0 && !krok.koniec) { for (let j = aktywny.i - 1; j >= 0; j--) { if (maWarunek(aktywny.kroki[j]) && zgodny(aktywny.kroki[j])) { cel = j; break; } } }
            if (cel >= 0) { wejdzWKrok(cel, false); return; }
        }
        // 1b) krok późniejszy, który opisuje stan już zaistniały (np. otwarło się okno kamery) → wskocz do niego
        for (let j = aktywny.i + 1; j < aktywny.kroki.length; j++) { if (aktywny.kroki[j].gdy && zgodny(aktywny.kroki[j])) { wejdzWKrok(j, false); return; } }
        const dojrzaly = Date.now() - aktywny.wszedl > 700;   // dajemy chwilę na przeczytanie
        // 2) człowiek wykonał czynność → pochwała i następny krok
        if (krok.dalejGdy && !aktywny.wstecz && dojrzaly && !aktywny.zalicza && bezpiecznie(krok.dalejGdy, false)) { zalicz(aktywny.i); return; }
        // 3) krok został w międzyczasie spełniony (np. filtr już ustawiony) → pomiń
        if (krok.pomin && !aktywny.wstecz && dojrzaly && !aktywny.zalicza && aktywny.i < aktywny.kroki.length - 1 && bezpiecznie(krok.pomin, false)) {
            toast(tpl(tx(UI.pominieto), { t: tx(krok.tytul) }), 'ok', 1800); nastepny(); return;
        }
        // 4) odśwież notatkę o brakującym ekranie / elemencie (bez przerysowywania całej karty, gdy się nie zmieniła)
        const uwagaTeraz = (maWarunek(krok) && !krok.koniec && !zgodny(krok)) ? tx(UI.czekam)
            : ((krok.cel && !pierwszyWidoczny(krok.cel) && !maWarunek(krok)) ? tx(UI.brakCelu) : '');
        if (uwagaTeraz !== aktywny.uwaga && !aktywny.zalicza) renderKrok();
        pozycjonuj();
    }

    // ============================================================================
    // v2.15.10 — MINI-ASYSTENT (czat), TRYB „KLIKAM ZA CIEBIE”, CZUWANIE, POWITANIE
    // ============================================================================

    // ---- 1) Połączenie z mini-silnikiem (js/pomoc-ai.js)
    function zapewnijAI() {
        if (!ai && window.EMPomocAI) {
            try {
                ai = window.EMPomocAI.utworz({ przewodniki: PRZEWODNIKI });
                // wagi z poprzedniej wizyty (jeśli pasują do tej wersji wiedzy) — bez ponownego uczenia sieci
                const zapis = lsGet('em_pomoc_ai_wagi', null);
                if (zapis && ai.importuj(zapis)) powtorzWybory();
            } catch (e) { ai = null; }
        }
        return ai;
    }
    // Uczenie na wyborach człowieka: co wybrał po zadaniu pytania, tego asystent uczy się na tym urządzeniu (na kiosku — nie)
    function powtorzWybory() {
        if (!ai || !ai.gotowy() || jestKioskiem(kontekst())) return;
        lsGet('em_pomoc_ai_uczenie', []).forEach((p) => { try { ai.naucz(p.q, p.id, 3); } catch (e) { /* ignoruj */ } });
    }
    function zapamietajWybor(pytanie, idTematu) {
        if (!ai || !ai.gotowy() || !pytanie || jestKioskiem(kontekst())) return;
        if (!ai.naucz(pytanie, idTematu, 6)) return;
        const lista = lsGet('em_pomoc_ai_uczenie', []).filter((p) => !(p.q === pytanie && p.id === idTematu));
        lista.push({ q: pytanie, id: idTematu }); lsSet('em_pomoc_ai_uczenie', lista.slice(-100));
        toast(tx(UI.zapamietalem), 'ok', 1600);
        odswiezStatusAI();
    }
    function zapomnijWybory() {
        try { localStorage.removeItem('em_pomoc_ai_uczenie'); localStorage.removeItem('em_pomoc_ai_wagi'); } catch (e) { /* ignoruj */ }
        ai = null; zapewnijAI(); rozgrzejAI();
    }
    function ostatniePytanie() { for (let i = czat.length - 1; i >= 0; i--) if (czat[i].kto === 'ja') return czat[i].tekst; return ''; }
    // Uczenie w tle, po kilka milisekund naraz — żeby nie zawieszać kiosku ani telefonu
    function rozgrzejAI() {
        const a = zapewnijAI(); if (!a || a.gotowy()) return;
        const f = () => { if (a.trenujKawalek(8)) { zapiszWagi(); powtorzWybory(); odswiezStatusAI(); return; } odswiezStatusAI(); setTimeout(f, 70); };
        f();
    }
    function zapiszWagi() { try { if (ai && ai.gotowy()) { const e = ai.eksportuj(); if (e) lsSet('em_pomoc_ai_wagi', e); } } catch (err) { /* ignoruj */ } }
    function odswiezStatusAI() {
        const s = $('pomoc-ai-status'); if (!s || !ai) return;
        s.textContent = tpl(tx(UI.czatStatus), { p: ai.parametry.toLocaleString('pl-PL'), s: ai.gotowy() ? tx(UI.czatGotowy) : tpl(tx(UI.czatUczy), { x: Math.round(ai.postep() * 100) }) }) + (ai.uczone() ? tpl(tx(UI.czatUczone), { n: ai.uczone() }) : '');
    }
    function ctxAI() {
        const k = kontekst(); const b = bezpiecznie(() => D.querySelector('.tabs button.active'), null);
        return { kontekst: k, jezyk: jez(), tematyKontekstu: tematyDla(k).map((t) => t.id), temat: aktywny ? aktywny.temat.id : null, zakladka: b ? b.getAttribute('data-tab') : null, polecany: podpowiedz(k) };
    }

    // ---- 2) Czat
    function wiadomoscBota(tekst, przyciski) { czat.push({ kto: 'bot', tekst: tekst, przyciski: przyciski || [] }); }
    function renderCzat() {
        const box = $('pomoc-widok'); if (!box) return;
        const k = kontekst(); const kiosk = jestKioskiem(k);
        if (!czat.length) wiadomoscBota(tx(UI.czatPowitanie), []);
        let html = '<div id="pomoc-czat-lista" class="pomoc-czat-lista" aria-live="polite">';
        czat.forEach((msg) => {
            html += '<div class="pomoc-msg pomoc-msg-' + (msg.kto === 'ja' ? 'ja' : 'bot') + '">' + fmt(msg.tekst) + '</div>';
            if (msg.przyciski && msg.przyciski.length) {
                html += '<div class="pomoc-msg-przyciski">';
                msg.przyciski.forEach((p) => {
                    html += '<button type="button" class="pomoc-czat-btn' + (p.a === 'temat' && !p.poza ? ' glowny' : '') + '" data-pomoc="czat-btn" data-a="' + esc(p.a) + '" data-d="' + esc(p.d || '') + '" data-poza="' + (p.poza ? '1' : '') + '">' + esc(p.e) + '</button>';
                });
                html += '</div>';
            }
        });
        html += '</div>';
        const chipy = (CHIPY[k] || []);
        if (chipy.length) {
            html += '<div class="pomoc-grupa">' + esc(tx(UI.czatChipy)) + '</div><div class="pomoc-chipy">';
            chipy.forEach((c) => { html += '<button type="button" class="pomoc-czat-btn" data-pomoc="zapytaj" data-q="' + esc(tx(c)) + '">' + esc(tx(c)) + '</button>'; });
            html += '</div>';
        }
        if (!kiosk) html += '<div class="pomoc-czat-wiersz"><input type="text" id="pomoc-czat-pole" class="pomoc-szukaj" autocomplete="off" maxlength="200" placeholder="' + esc(tx(UI.czatPole)) + '" aria-label="' + esc(tx(UI.czatPole)) + '"><button type="button" class="pomoc-btn pomoc-btn-glowny pomoc-btn-wyslij" data-pomoc="wyslij">' + esc(tx(UI.czatWyslij)) + '</button></div>';
        html += '<div id="pomoc-ai-status" class="pomoc-ai-status"></div>';
        box.innerHTML = html;
        const l = $('pomoc-czat-lista'); if (l) l.scrollTop = l.scrollHeight;
        zapewnijAI(); odswiezStatusAI();
    }
    function odswiezCzat() { if (menuOtwarte && widokMenu === 'czat') renderCzat(); }
    function wyslij() { const p = $('pomoc-czat-pole'); if (!p) return; const q = p.value; p.value = ''; zapytaj(q); }
    function zapytaj(q) {
        q = String(q || '').trim(); if (!q) return;
        widokMenu = 'czat'; if (!menuOtwarte) otworzMenu();
        czat.push({ kto: 'ja', tekst: q });
        const a = zapewnijAI();
        if (!a) { wiadomoscBota(tx(UI.czatBrakAI), []); renderMenu(); return; }
        const odpowiedz = () => {
            let r; try { r = a.odpowiedz(q, ctxAI()); } catch (e) { r = { typ: 'nie-wiem', tekst: tx(UI.czatBrakAI), przyciski: [] }; }
            let tekst = r.tekst;
            if (r.typ === 'komenda') {
                const potrzebujeKroku = ['czytaj', 'gdzie', 'powtorz', 'dalej', 'wstecz'].indexOf(r.komenda) >= 0;
                if (potrzebujeKroku && !aktywny) tekst = tx(UI.brakKroku); else wykonajKomende(r.komenda);
            }
            wiadomoscBota(tekst, r.przyciski || []);
            if (!menuOtwarte) otworzMenu(); else if (widokMenu === 'czat') renderCzat();
        };
        if (a.gotowy()) { odpowiedz(); return; }
        czat.push({ kto: 'bot', tekst: tx(UI.czatMysle), przyciski: [], tymczas: true }); renderMenu();
        setTimeout(() => { czat = czat.filter((m) => !m.tymczas); odpowiedz(); }, 40);
    }
    function wykonajKomende(k) {
        if (k === 'auto_on') ustawAuto(true);
        else if (k === 'auto_off') ustawAuto(false);
        else if (k === 'czytaj') czytaj();
        else if (k === 'tekst') obsluz('rozmiar', {});
        else if (k === 'gdzie' || k === 'powtorz') pokazGdzie();
        else if (k === 'dalej') nastepny();
        else if (k === 'wstecz') poprzedni();
        else if (k === 'koniec') zakoncz();
        else if (k === 'zapomnij') zapomnijWybory();
    }
    function obsluzPrzyciskCzatu(a, d, poza) {
        if (a === 'temat') {
            if (poza) { wiadomoscBota(tx(UI.poza), []); renderCzat(); return; }
            zapamietajWybor(ostatniePytanie(), d);
            start(d); return;
        }
        if (a === 'nic') { wiadomoscBota(tx(UI.czatInaczej), []); renderCzat(); return; }
        if (a === 'kontakt') { const b = $('btn-kontakt'); zamknijMenu(); if (b) b.click(); return; }
        if (a === 'komenda') { wykonajKomende(d); return; }
    }
    // „Pomóż mi z tym krokiem”: konkretna pomoc do bieżącego kroku (nie zgadywanie tematu)
    function pomocKroku() {
        if (!aktywny) return;
        const krok = biezacyKrok(); const el = pierwszyWidoczny(krok.cel);
        const nazwa = tx(krok.tytul); const opis = tx(krok.tekst);
        let tekst = tpl(tx(UI.krokTo), { t: nazwa, x: opis });
        if (krok.cel && !el && !maWarunek(krok)) tekst += '\n\n' + tx(UI.brakElementu);
        const przyc = [];
        if (el) przyc.push({ e: tx(UI.pokazGdzie), a: 'komenda', d: 'gdzie' });
        if (window.speechSynthesis) przyc.push({ e: tx(UI.czytaj), a: 'komenda', d: 'czytaj' });
        if (!trybAuto && !jestKioskiem(aktywny.kontekst)) przyc.push({ e: tx(UI.trybAuto), a: 'komenda', d: 'auto_on' });
        przyc.push({ e: tx(UI.kontaktBtn), a: 'kontakt' });
        widokMenu = 'czat';
        if (!aktywny.zwiniety) { aktywny.zwinietyPrzezMenu = true; aktywny.zwiniety = true; renderKrok(); }
        wiadomoscBota(tekst, przyc);
        if (!menuOtwarte) otworzMenu(); else renderCzat();
        pozycjonuj();
    }
    function pokazGdzie() {
        if (!aktywny) return;
        const krok = biezacyKrok(); const el = pierwszyWidoczny(krok.cel);
        if (aktywny.zwiniety) { aktywny.zwiniety = false; renderKrok(); }
        if (menuOtwarte) zamknijMenu();
        if (el) { try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignoruj */ } }
        const sp = $('pomoc-podswietlenie');
        if (sp && !mniejRuchu()) { sp.classList.remove('pomoc-blysk'); void sp.offsetWidth; sp.classList.add('pomoc-blysk'); }
        pozycjonuj();
    }

    // ---- 3) Tryb „klikam za Ciebie” — TYLKO bezpieczne czynności
    // Nigdy nie klikamy w nic, co zapisuje, usuwa, zatwierdza, wylogowuje, odblokowuje, importuje ani generuje.
    const ZAKAZANE = /(zapisz|dodaj|zatwierdz|odrzuc|usun|odblokuj|anonim|purge|wyloguj|wyczysc|importuj|generuj|zablokuj|cofnij|akceptuj|wyslij|zmien-pin|reset|nadaj|odbierz|eksport|przywroc|dezaktywuj)/i;
    function planAuto(krok, el) {
        if (!trybAuto || !krok || !el || krok.auto === false || !aktywny || aktywny.wstecz) return null;
        if (jestKioskiem(aktywny.kontekst)) return null;
        const id = el.id || '';
        if (ZAKAZANE.test(id)) return null;
        if (krok.auto && typeof krok.auto === 'object' && krok.auto.wartosc !== undefined && el.tagName === 'SELECT') return { rodzaj: 'wybierz', wartosc: krok.auto.wartosc };
        if (typeof el.matches === 'function' && el.matches('.tabs button[data-tab]')) return { rodzaj: 'klik' };
        if (el.tagName === 'SUMMARY') return { rodzaj: 'klik' };
        if (/-(pokaz|odswiez)$/.test(id)) return { rodzaj: 'klik' };
        if (krok.auto === true && (el.tagName === 'BUTTON' || el.tagName === 'A')) return { rodzaj: 'klik' };
        return null;
    }
    function anulujAuto() { if (aktywny && aktywny.autoTimer) { clearTimeout(aktywny.autoTimer); aktywny.autoTimer = null; } }
    function zaplanujAuto() {
        anulujAuto();
        if (!aktywny || !trybAuto || aktywny.autoStop || aktywny.wstecz) return;
        const krok = biezacyKrok(); const el = pierwszyWidoczny(krok.cel);
        const plan = planAuto(krok, el); if (!plan) return;
        const idx = aktywny.i;
        aktywny.autoTimer = setTimeout(() => {
            if (!aktywny || aktywny.i !== idx || aktywny.autoStop || aktywny.zalicza || !trybAuto) return;
            const e2 = pierwszyWidoczny(krok.cel); if (!e2) return;
            const p2 = planAuto(krok, e2); if (!p2) return;            // ponowna kontrola bezpieczeństwa tuż przed kliknięciem
            try { e2.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* ignoruj */ }
            if (p2.rodzaj === 'wybierz') { e2.value = p2.wartosc; e2.dispatchEvent(new Event('change', { bubbles: true })); }
            else e2.click();
        }, 1700);
    }
    function ustawAuto(w) {
        if (w && jestKioskiem(kontekst())) { toast(tx(UI.autoKiosk), 'info', 3200); return; }
        trybAuto = !!w; lsSet('em_pomoc_auto', trybAuto);
        toast(tx(trybAuto ? UI.autoWlaczony : UI.autoWylaczony), trybAuto ? 'ok' : 'info', 2200);
        if (menuOtwarte) renderMenu();
        if (aktywny) { aktywny.autoStop = false; renderKrok(); zaplanujAuto(); }
    }

    // ---- 4) Czuwanie: mini-asystent pilnuje, czy człowiek nie utknął
    function czuwaj() {
        if (!aktywny || aktywny.zalicza) return;
        const t = Date.now() - aktywny.wszedl;
        if (!aktywny.pomogl && t > 35000) {
            aktywny.pomogl = true;
            toast(tx(UI.utknal), 'info', 8000);
            const c = $('pomoc-krok'); if (c) c.classList.add('pomoc-potrzebuje');
        }
    }
    function powitanie() {
        if (jestKioskiem(kontekst()) || aktywny || menuOtwarte) return;
        if (lsGet('em_pomoc_powitany', false)) return;
        lsSet('em_pomoc_powitany', true);
        toast(tx(UI.powitanie), 'info', 8000);
    }

    function obsluz(akcja, dane) {
        if (akcja === 'menu') { if (menuOtwarte) zamknijMenu(); else otworzMenu(); return; }
        if (akcja === 'zamknij-menu') { zamknijMenu(); return; }
        if (akcja === 'temat') { start(dane.temat); return; }
        if (akcja === 'dalej') { nastepny(); return; }
        if (akcja === 'wstecz') { poprzedni(); return; }
        if (akcja === 'zakoncz') { zakoncz(); if (menuOtwarte) renderMenu(); return; }
        if (akcja === 'lista') { zakoncz(); widokMenu = 'tematy'; otworzMenu(); return; }
        if (akcja === 'czytaj') { czytaj(); return; }
        if (akcja === 'zwin') { if (aktywny) { aktywny.zwiniety = !aktywny.zwiniety; renderKrok(); pozycjonuj(); } return; }
        if (akcja === 'widok') { widokMenu = dane.widok === 'czat' ? 'czat' : 'tematy'; renderMenu(); return; }
        if (akcja === 'zapytaj') { zapytaj(dane.q); return; }
        if (akcja === 'wyslij') { wyslij(); return; }
        if (akcja === 'czat-btn') { obsluzPrzyciskCzatu(dane.a, dane.d, dane.poza); return; }
        if (akcja === 'auto-przelacz') { ustawAuto(!trybAuto); return; }
        if (akcja === 'auto-stop') { if (aktywny) { aktywny.autoStop = true; anulujAuto(); renderKrok(); } return; }
        if (akcja === 'pytaj-krok') { pomocKroku(); return; }
        if (akcja === 'gdzie') { pokazGdzie(); return; }
        if (akcja === 'rozmiar') { rozmiar = (rozmiar + 1) % 3; if (!jestKioskiem(kontekst())) lsSet('em_pomoc_rozmiar', rozmiar); zastosujRozmiar(); pozycjonuj(); return; }
    }

    // ============================================================================
    // ZDARZENIA
    // ============================================================================
    ['pointerdown', 'keydown', 'touchstart'].forEach((z) => D.addEventListener(z, () => { ostatniaAktywnosc = Date.now(); }, true));

    D.addEventListener('click', (e) => {
        const a = e.target && e.target.closest ? e.target.closest('[data-pomoc]') : null;
        if (a) { obsluz(a.getAttribute('data-pomoc'), { temat: a.getAttribute('data-temat'), widok: a.getAttribute('data-widok'), q: a.getAttribute('data-q'), a: a.getAttribute('data-a'), d: a.getAttribute('data-d'), poza: a.getAttribute('data-poza') }); return; }
        if (aktywny) {
            const krok = biezacyKrok();
            if (krok && czyKlik(krok)) {
                const el = pierwszyWidoczny(krok.cel);
                if (el && el.contains(e.target)) zalicz(aktywny.i);
            }
        }
        if (menuOtwarte && !(e.target.closest && e.target.closest('#pomoc-menu'))) zamknijMenu();
    }, true);

    // Wpisanie tekstu / wybranie wartości w podświetlonym polu → pochwała i dalej
    D.addEventListener('change', (e) => {
        if (!aktywny) return;
        const krok = biezacyKrok(); if (!krok || krok.reczny) return;
        const t = typKroku(krok); if (t !== 'wpisz' && t !== 'wybierz') return;
        const el = pierwszyWidoczny(krok.cel);
        if (el && (el === e.target || el.contains(e.target))) zalicz(aktywny.i);
    }, true);
    D.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target && e.target.id === 'pomoc-czat-pole') { e.preventDefault(); wyslij(); return; }
        if (e.key === 'Enter' && aktywny) {
            const krok = biezacyKrok();
            if (krok && !krok.reczny && typKroku(krok) === 'wpisz') { const el = pierwszyWidoczny(krok.cel); if (el && el === e.target && String(el.value || '').trim()) zalicz(aktywny.i); }
        }
        if (e.key !== 'Escape') return;
        if (aktywny) zakoncz(); else if (menuOtwarte) zamknijMenu();
    });
    D.addEventListener('input', (e) => { if (e.target && e.target.id === 'pomoc-szukaj') odswiezListe(e.target.value); });

    D.addEventListener('zmiana-jezyka', () => { odswiezPrzycisk(); if (menuOtwarte) renderMenu(); if (aktywny) { renderKrok(); pozycjonuj(); } });
    window.addEventListener('resize', () => { if (aktywny) pozRaf(); });
    window.addEventListener('scroll', () => { if (aktywny) pozRaf(); }, true);

    function uruchom() { zbuduj(); setInterval(tik, 300); setTimeout(powitanie, 2500); setTimeout(rozgrzejAI, jestKioskiem(kontekst()) ? 25000 : 5000); }
    if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', uruchom); else uruchom();

    // Podgląd dla testów i diagnostyki (konsola: EMPomoc.kontekst())
    window.EMPomoc = { kontekst: kontekst, otworz: otworzMenu, start: start, zakoncz: zakoncz, przewodniki: PRZEWODNIKI, podpowiedz: podpowiedz, zapytaj: zapytaj, auto: ustawAuto, silnik: () => ai, zapomnij: zapomnijWybory };
})();
