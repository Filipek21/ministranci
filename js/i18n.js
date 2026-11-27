// ============================================================================
// WIELOJĘZYCZNOŚĆ — polski (pl), angielski brytyjski (en), ukraiński (uk)
//
// Wszystkie teksty interfejsu są w tym jednym pliku, wczytywanym lokalnie
// (nie z internetu) i zapisywanym przez service worker — dzięki temu wszystkie
// trzy języki działają także w Kiosku bez internetu.
//
// Użycie:
//   HTML:  <span data-i18n="klucz"></span>
//          <input data-i18n-placeholder="klucz">   <button data-i18n-title="klucz">
//   JS:    t('klucz', { n: 3 })
// Liczba mnoga: wartość będąca obiektem { one, few, many } + zmienna n.
// ============================================================================

const JEZYKI = {
    pl: { nazwa: 'Polski',     krotka: 'PL', locale: 'pl-PL' },
    en: { nazwa: 'English',    krotka: 'EN', locale: 'en-GB' },
    uk: { nazwa: 'Українська', krotka: 'UA', locale: 'uk-UA' }
};
const JEZYK_DOMYSLNY = 'pl';
const KLUCZ_JEZYKA = 'em_lang';

const SLOWNIK = { pl: {}, en: {}, uk: {} };

// ---------------------------------------------------------------- POLSKI ----
Object.assign(SLOWNIK.pl, {
    // --- wspólne ---
    'common.logout': 'Wyloguj',
    'common.show': 'Pokaż',
    'common.refresh': 'Odśwież',
    'common.close': 'Zamknij',
    'common.cancel': 'Anuluj',
    'common.never': '— nigdy —',
    'common.none': 'brak',
    'common.yes': 'tak',
    'common.no': 'nie',
    'common.active': 'aktywny',
    'common.inactive': 'nieaktywny',
    'common.unavailable': 'niedostępne',
    'common.loading': 'Ładowanie…',
    'common.no_results': 'Brak wyników.',
    'common.points_short': '{n} pkt',
    'common.language': 'Język',
    'common.error': 'Błąd',

    // --- strona główna ---
    'index.subtitle': 'System obecności i punktacji',
    'index.panel': 'Panel Ministranta / Admina',
    'index.kiosk': 'Tryb Kiosk (Zakrystia)',

    // --- logowanie ---
    'login.code_ph': 'Kod (np. MIN-001)',
    'login.pin_ph': 'PIN (4 cyfry)',
    'login.submit': 'Zaloguj się',
    'login.need_both': 'Podaj kod i 4-cyfrowy PIN.',

    // --- panel ministranta ---
    'mm.points_label': 'punktów w tym miesiącu',
    'mm.history': 'Historia obecności',
    'mm.col_event': 'Wydarzenie',
    'mm.col_date': 'Data',
    'mm.col_as': 'Zaliczone jako',
    'mm.col_points': 'Punkty',
    'mm.sum': 'Suma za {miesiac} {rok}: {n} pkt',
    'mm.none': 'Brak obecności w tym miesiącu.',
    'mm.ranking': 'Ranking (bieżący miesiąc)',
    'mm.change_pin': 'Zmień PIN',
    'mm.pin_old': 'Obecny PIN',
    'mm.pin_new': 'Nowy PIN (4 cyfry)',
    'mm.pin_save': 'Zapisz nowy PIN',
    'mm.pin_both4': 'Oba PIN-y muszą mieć 4 cyfry.',
    'mm.pin_changed': 'PIN zmieniony. Zapamiętaj nowy PIN — zaloguj się nim od teraz.',
    'mm.goto_admin': 'Przejdź do Panelu Administracyjnego →',

    // --- panel admina: ogólne ---
    'adm.title': 'Panel administracyjny',
    'adm.to_minister': 'Panel ministranta',
    'tab.calendar': 'Kalendarz',
    'tab.ministers': 'Ministranci',
    'tab.attendance': 'Obecności (miesiąc)',
    'tab.cards': 'Generator kart QR',
    'tab.requests': 'Zgłoszenia',
    'tab.kiosks': 'Kioski',
    'tab.database': 'Baza danych',
    'tab.security': 'Bezpieczeństwo',

    // --- kalendarz / dodawanie wydarzenia ---
    'cal.add': 'Dodaj wydarzenie',
    'cal.type': 'Typ',
    'cal.type.msza': '⛪ Msza Święta',
    'cal.type.nabozenstwo': '🕯️ Nabożeństwo',
    'cal.type.zbiorka': '👥 Zbiórka',
    'cal.short.msza': 'Msza',
    'cal.short.nabozenstwo': 'Nabożeństwo',
    'cal.short.zbiorka': 'Zbiórka',
    'cal.when': 'Data i godzina',
    'cal.name': 'Nazwa (opcjonalnie)',
    'cal.name_ph': 'Wpisze się sama, np. „Msza · ndz. 9:00”',
    'cal.advanced': 'Ustawienia zaawansowane',
    'cal.window': 'Okno rejestracji w Kiosku (minuty)',
    'cal.before': 'Przed',
    'cal.after': 'Po',
    'cal.window_hint': 'Domyślnie ministranci mogą się zeskanować od 20 min przed do 5 min po rozpoczęciu.',
    'cal.block': '🔗 Część bloku połączonego (np. Nabożeństwo + Msza tuż po nim)',
    'cal.block_hint': 'Dodaj najpierw pierwsze wydarzenie, potem drugie — wybierz tu pierwsze, aby je sparować.',
    'cal.block_none': '— nie łącz, zacznij nowy blok —',
    'cal.submit': 'Dodaj wydarzenie',
    'cal.need_date': 'Podaj datę i godzinę.',
    'cal.added': 'Dodano: {nazwa}.',
    'cal.upcoming': 'Nadchodzące / ostatnie wydarzenia',
    'cal.col_name': 'Nazwa',
    'cal.col_type': 'Typ',
    'cal.col_date': 'Data',
    'cal.col_window': 'Okno',

    // --- ministranci ---
    'mi.add': 'Dodaj ministranta',
    'mi.edit': 'Edytuj: {n}',
    'mi.first_name': 'Imię',
    'mi.last_name': 'Nazwisko',
    'mi.code_ph': 'Kod (np. MIN-014)',
    'mi.pin_ph': 'PIN (4 cyfry)',
    'mi.pin_edit_ph': 'Nowy PIN (zostaw puste, by nie zmieniać)',
    'mi.is_priest': 'To konto jest Księdzem / Opiekunem (nie bierze udziału w rankingu)',
    'mi.btn_add': 'Dodaj',
    'mi.btn_save': 'Zapisz zmiany',
    'mi.btn_cancel_edit': 'Anuluj edycję',
    'mi.fill': 'Uzupełnij imię, nazwisko i kod.',
    'mi.pin4': 'PIN musi mieć 4 cyfry.',
    'mi.saved': 'Zapisano zmiany.',
    'mi.added': 'Dodano {kod}.',
    'mi.pin_warn': 'Dane zapisane, ale PIN nie: {blad}',
    'mi.list': 'Lista ministrantów',
    'mi.list_hint': '„Ostatnie logowanie (dom)” = panel PWA. „Ostatni Kiosk” = ostatnie wejście Admina/Księdza w tryb specjalny na tablecie w zakrystii. To dwa niezależne źródła.',
    'mi.col_code': 'Kod',
    'mi.col_name': 'Imię i nazwisko',
    'mi.col_pin': 'PIN',
    'mi.col_points': 'Punkty (miesiąc)',
    'mi.col_last_home': 'Ostatnie logowanie (dom)',
    'mi.col_last_kiosk': 'Ostatni Kiosk',
    'mi.col_status': 'Status',
    'mi.col_badges': 'Plakietki',
    'mi.col_actions': 'Akcje',
    'mi.act_edit': 'Edytuj',
    'mi.act_badges': 'Plakietki',
    'mi.act_revoke_priest': 'Odbierz rolę Księdza',
    'mi.act_grant_priest': 'Nadaj rolę Księdza',
    'mi.act_deactivate': 'Dezaktywuj',
    'mi.act_restore': 'Przywróć',
    'mi.protected': 'konto chronione',
    'mi.confirm_deactivate': 'Dezaktywować to konto? Nie będzie mogło się logować, a jego karty (plakietki) przestaną działać w Kiosku. Historia obecności zostaje zachowana.',
    'mi.deactivated': 'Konto dezaktywowane.',
    'mi.restored': 'Przywrócono.',
    'mi.none': 'Brak ministrantów.',
    'role.admin': '👑 Admin',
    'role.priest': '⛪ Ksiądz',
    'role.minister': 'Ministrant',

    // --- plakietki ---
    'bdg.title': 'Plakietki: {n}',
    'bdg.new': '+ Wygeneruj nową plakietkę (kartę)',
    'bdg.col_code': 'Kod plakietki',
    'bdg.col_generated': 'Wygenerowano',
    'bdg.col_status': 'Status',
    'bdg.col_action': 'Akcja',
    'bdg.col_minister': 'Ministrant',
    'bdg.col_revoked': 'Unieważniono',
    'bdg.active': 'aktywna',
    'bdg.revoked': 'unieważniona',
    'bdg.preview': 'Podgląd',
    'bdg.revoke': 'Unieważnij',
    'bdg.confirm_revoke': 'Unieważnić plakietkę {kod}? Ten kod QR natychmiast przestanie działać w Kiosku.',
    'bdg.none': 'Brak wydanych plakietek.',
    'bdg.modal_title': 'Podgląd plakietki',
    'bdg.modal_revoked': 'Ta plakietka jest unieważniona — pobieranie/druk niedostępne.',
    'bdg.download': '📥 Pobierz',
    'bdg.print': '🖨️ Drukuj',

    // --- obecności ---
    'att.title': 'Pełna historia obecności — wszyscy ministranci',
    'att.hint': 'Admin i Ksiądz widzą to samo. Wybierz miesiąc, żeby przejrzeć dowolny okres, nie tylko bieżący.',
    'att.col_when': 'Kiedy',
    'att.col_who': 'Kto',
    'att.col_event': 'Wydarzenie',
    'att.col_as': 'Zaliczone jako',
    'att.col_points': 'Punkty',
    'att.none': 'Brak obecności w tym miesiącu.',

    // --- generator kart ---
    'card.title': 'Generator wizytówek (kod QR + PIN)',
    'card.hint': 'Zaznacz, którym ministrantom wydrukować nową kartę. Każda karta dostaje własny, unikalny kod plakietki (widoczny w QR) i datę wygenerowania — możesz ją później osobno unieważnić, jeśli ktoś ją zgubi, bez zmiany konta czy PIN-u.',
    'card.generate': 'Generuj PDF dla zaznaczonych',
    'card.none_active': 'Brak aktywnych ministrantów.',
    'card.pick_one': 'Zaznacz przynajmniej jednego ministranta.',
    'card.generating': 'Generuję plakietki…',
    'card.error_for': 'Błąd dla {kod}: {blad}',
    'card.done': 'Wygenerowano plakietek: {n}. Zobacz podgląd niżej, potem pobierz lub wydrukuj.',
    'card.preview_title': 'Podgląd wygenerowanych plakietek',
    'card.download_all': '📥 Pobierz wszystkie (PDF)',
    'card.print_all': '🖨️ Drukuj wszystkie',
    'card.all_badges': 'Wszystkie wydane plakietki',
    'card.pdf_building': 'Buduję PDF…',
    'card.pdf_ready': 'PDF gotowy.',
    'card.pdf_failed': 'Nie udało się zbudować PDF: {blad}',
    'card.libs_missing': 'Biblioteka PDF/QR nie została wczytana (brak internetu przy ładowaniu strony). Odśwież stronę przy działającym internecie.',
    'card.print_blocked': 'Przeglądarka zablokowała okno drukowania. Plik PDF został pobrany — wydrukuj go ręcznie.',
    'card.pdf_title': 'E-Ministranci — Karta Ministranta',
    'card.pdf_code': 'Kod: {kod}',
    'card.pdf_revoked': 'UNIEWAŻNIONA',
    'card.pdf_cut': '- - - odetnij i przechowuj osobno - - -',
    'card.pdf_pin': 'PIN — {kod}',
    'card.pdf_badge_no': 'Nr plakietki: {kod}',
    'card.pdf_generated': 'Wygenerowano: {data}',

    // --- zgłoszenia ---
    'req.title': 'Zgłoszenia specjalnych obecności (Pogrzeb / Ślub / Inne)',
    'req.hint': 'Ministrant tylko zgłasza w Kiosku — o liczbie punktów i zatwierdzeniu decyduje wyłącznie Admin lub Ksiądz.',
    'req.f_pending': 'Oczekujące',
    'req.f_approved': 'Zatwierdzone',
    'req.f_rejected': 'Odrzucone',
    'req.f_all': 'Wszystkie',
    'req.col_when': 'Kiedy',
    'req.col_who': 'Kto',
    'req.col_type': 'Typ',
    'req.col_status': 'Status',
    'req.col_points': 'Punkty',
    'req.col_by': 'Rozpatrzone przez',
    'req.col_action': 'Akcja',
    'req.st.oczekujace': 'oczekujące',
    'req.st.zatwierdzone': 'zatwierdzone',
    'req.st.odrzucone': 'odrzucone',
    'req.type.pogrzeb': '⚱️ Pogrzeb',
    'req.type.slub': '💍 Ślub',
    'req.type.inne': '📋 Inne',
    'req.approve': 'Zatwierdź',
    'req.reject': 'Odrzuć',
    'req.pts_ph': 'pkt',
    'req.cannot_admin': 'Nie można rozpatrzyć zgłoszenia Admina',
    'req.need_points': 'Podaj liczbę punktów (0 lub więcej).',
    'req.confirm_reject': 'Odrzucić to zgłoszenie?',
    'req.none': 'Brak zgłoszeń.',

    // --- kioski (panel admina) ---
    'kio.title': 'Monitoring Kiosków',
    'kio.hint': 'Każdy Kiosk wysyła sygnał kontrolny co 15 minut (wyrównany do zegara). Status OFFLINE oznacza brak sygnału od ponad 20 minut. Pola, których przeglądarka danego urządzenia nie udostępnia, pokazują „niedostępne” — nic tu nie jest zmyślane.',
    'kio.col_name': 'Nazwa',
    'kio.col_status': 'Status',
    'kio.col_ping': 'Ostatni ping',
    'kio.col_version': 'Wersja',
    'kio.col_diag': 'Diagnostyka',
    'kio.col_action': 'Akcja',
    'kio.online': '🟢 ONLINE',
    'kio.offline': '🔴 OFFLINE',
    'kio.save_name': 'Zapisz nazwę',
    'kio.history': 'Historia',
    'kio.delete': 'Usuń',
    'kio.delete_confirm': 'Usunąć Kiosk „{nazwa}” z monitoringu wraz z jego historią pingów?\n\nJeśli to urządzenie nadal działa i ma internet, pojawi się na liście ponownie przy najbliższym sygnale (do 15 min). Usuwaj kioski, których już nie używasz.',
    'kio.deleted': 'Kiosk usunięty.',
    'kio.delete_need_sql': 'Usuwanie kiosków wymaga uruchomienia sql/14_dodatki12.sql w Supabase.',
    'kio.none': 'Żaden Kiosk nie wysłał jeszcze pingu.',
    'kio.hist_title': 'Historia pingów — {nazwa}',
    'kio.h_server': 'Kiedy (serwer)',
    'kio.h_clock': 'Zegar urządzenia',
    'kio.h_version': 'Wersja',
    'kio.h_online': 'Online (navigator)',
    'kio.h_net': 'Sieć',
    'kio.h_queue': 'Kolejka offline',
    'kio.h_none': 'Brak historii.',
    'kio.d_online_nav': 'Online (navigator)',
    'kio.d_online_ok': 'Sieć potwierdzona (kiosk)',
    'kio.d_net_type': 'Typ sieci',
    'kio.d_speed': 'Prędkość / RTT',
    'kio.d_resolution': 'Rozdzielczość',
    'kio.d_visible': 'Karta widoczna',
    'kio.d_background': 'nie (w tle)',
    'kio.d_battery': 'Bateria',
    'kio.d_charging': 'ładuje się',
    'kio.d_cpu': 'Rdzenie CPU / RAM',
    'kio.d_cores': 'rdzeni',
    'kio.d_queue': 'Kolejka offline',
    'kio.d_queue_n': '{n} oczek.',
    'kio.d_lang': 'Język',
    'kio.d_cache': 'Dane offline',
    'kio.d_cache_age': 'sprzed {h} godz.',
    'kio.d_cache_none': 'brak',

    // --- baza danych ---
    'db.title': '📊 Baza danych — czytelny podgląd',
    'db.sync_now': '🔄 Synchronizuj teraz',
    'db.hint': 'Wszystkie dane systemu w jednym miejscu, bez surowego JSON-a. „Synchronizuj teraz” odświeża ten widok i zleca wszystkim Kioskom, które akurat mają połączenie, natychmiastowe sprawdzenie poleceń i wysłanie zaległych danych (urządzenia offline odbiorą je, gdy wrócą do sieci).',
    'db.sub.users': 'Użytkownicy',
    'db.sub.badges': 'Plakietki',
    'db.sub.attendance': 'Obecności',
    'db.sub.logins': 'Logowania',
    'db.sub.kiosks': 'Kioski / Pingi',
    'db.sub.sync': 'Oczek. synchronizacje',
    'db.search_ph': '🔍 Szukaj (kod, imię, nazwa, typ...)',
    'db.col_code': 'Kod',
    'db.col_name': 'Imię i nazwisko',
    'db.col_role': 'Rola',
    'db.col_status': 'Status',
    'db.col_badge': 'Blokada',
    'db.col_pin': 'PIN',
    'db.col_pts': 'Pkt (mies.)',
    'db.col_home': 'Log. dom',
    'db.col_kiosk': 'Log. Kiosk',
    'db.badge_active': '{n} aktywna',
    'db.syncing': '⏳ Zlecam synchronizację i odświeżam dane…',
    'db.sync_ok': 'Zlecono. Kioski, które mają teraz połączenie, odbiorą polecenie w ciągu ok. 20 sekund i wyślą zaległe dane. Urządzenia offline zrobią to, gdy wrócą do sieci.',
    'db.pending_requests': 'Oczekujące zgłoszenia specjalne (Pogrzeb/Ślub/Inne)',
    'db.no_pending_requests': 'Brak oczekujących zgłoszeń.',
    'db.kiosk_queues': 'Kolejki offline na Kioskach (wg ostatniego pingu)',
    'db.col_kiosk_name': 'Kiosk',
    'db.col_pending_ops': 'Oczekujące operacje',
    'db.no_kiosk_queues': 'Żaden Kiosk nie zgłasza obecnie zaległej kolejki offline.',

    // --- bezpieczeństwo ---
    'sec.locked_title': 'Zablokowane kody (nieudane próby PIN-u)',
    'sec.locked_hint': 'Blokada mija sama po 15 minutach. Ręcznie odblokować wcześniej może tylko Admin.',
    'sec.col_code': 'Kod',
    'sec.col_attempts': 'Nieudane próby',
    'sec.col_until': 'Zablokowany do',
    'sec.unlock': 'Odblokuj',
    'sec.unlock_ph': 'Kod do odblokowania',
    'sec.none_locked': 'Brak zablokowanych kodów.',
    'sec.unlocked': 'Odblokowano.',
    'sec.corr_title': 'Log korekt ręcznych',
    'sec.corr_hint': 'Kto i kiedy poprawił punkty ministrantowi.',
    'sec.export_csv': 'Eksportuj log do CSV',
    'sec.export_pdf': 'Eksportuj log do PDF',
    'sec.col_when': 'Kiedy',
    'sec.col_who': 'Kto',
    'sec.col_to': 'Komu',
    'sec.col_event': 'Wydarzenie',
    'sec.col_points': 'Punkty przed → po',
    'sec.none_corr': 'Brak korekt ręcznych.',
    'sec.no_export': 'Brak danych do eksportu.',
    'sec.pdf_corr_title': 'E-Ministranci — Log korekt ręcznych',
    'sec.report_title': 'Raport miesięczny (PDF)',
    'sec.report_hint': 'Ranking i pełna historia obecności za wybrany miesiąc — nie tylko bieżący.',
    'sec.year_ph': 'Rok',
    'sec.report_btn': 'Generuj raport PDF',
    'sec.report_bad_year': 'Podaj poprawny rok.',
    'sec.report_working': 'Generuję raport…',
    'sec.report_done': 'Raport pobrany.',
    'sec.report_h': 'Raport — {miesiac} {rok}',
    'sec.report_rank': 'Ranking miesiąca',
    'sec.report_hist': 'Historia obecności — {miesiac} {rok}',
    'sec.rp_pos': 'Poz.',
    'sec.rp_code': 'Kod',
    'sec.rp_name': 'Imię i nazwisko',
    'sec.rp_points': 'Punkty',
    'sec.rp_date': 'Data',
    'sec.rp_minister': 'Ministrant',
    'sec.rp_event': 'Wydarzenie',
    'sec.rp_as': 'Zaliczone jako',
    'sec.rp_pts': 'Pkt',
    'sec.logins_title': 'Historia logowań (pełny log — nie tylko licznik blokad)',
    'sec.logins_hint': 'Każda próba (udana i nieudana) weryfikacji kodu + PIN-u w całym systemie (Kiosk i PWA).',
    'sec.filter_ph': 'Filtruj po kodzie (opcjonalnie)',
    'sec.col_result': 'Wynik',
    'sec.col_reason': 'Powód',
    'sec.res_ok': '✅ sukces',
    'sec.res_fail': '❌ porażka',
    'sec.reason.ok': 'zalogowano',
    'sec.reason.zly_pin': 'zły PIN',
    'sec.reason.nieznany_kod': 'nieznany kod',
    'sec.reason.zablokowany': 'zablokowany (odrzucono)',
    'sec.none_logins': 'Brak zapisanych prób logowania.',
    'sec.admin_only': 'Ta czynność jest dostępna tylko dla Admina.',

    // --- komunikaty serwera / błędy (wspólne dla panelu i kiosku) ---
    'e.network': 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.',
    'e.server': 'Błąd serwera. Spróbuj ponownie za chwilę.',
    'e.wrong_pin': 'Nieprawidłowy PIN.',
    'e.wrong_pin_left': 'Nieprawidłowy PIN. Pozostało prób: {n}.',
    'e.locked': 'Konto zablokowane po zbyt wielu błędnych próbach. Spróbuj później lub poproś Admina o odblokowanie.',
    'e.already': 'Obecność została już zaliczona.',
    'e.no_event': 'Brak aktywnego wydarzenia w tym momencie. Skontaktuj się z opiekunem.',
    'e.unknown_qr': 'Nieznany kod QR.',
    'e.no_permission': 'Brak uprawnień do tej czynności.'
});

// --- POLSKI: Kiosk ---
Object.assign(SLOWNIK.pl, {
    'k.title': '📷 Zeskanuj kod QR',
    'k.hint': 'Zbliż kartę ministranta do czytnika…',
    'k.choose_lang': 'Język / Language / Мова',
    'k.special_hint': 'Zgłoszenie specjalnej obecności (wymaga zatwierdzenia przez Księdza/Admina):',
    'k.type.pogrzeb': '⚱️ Pogrzeb',
    'k.type.slub': '💍 Ślub',
    'k.type.inne': '📋 Inne',
    'k.special_mode': 'Tryb zgłoszenia: {nazwa}',
    'k.special_scan': 'Zeskanuj kod QR ministranta, który zgłasza udział.',
    'k.cancel_report': 'Anuluj zgłoszenie',
    'k.not_me': 'To nie ja — reset',
    'k.logout': '🚪 Wyloguj',
    'k.cancel': 'Anuluj',
    'k.login_admin': '🔑 Zaloguj się jako Admin',
    'k.login_priest': '⛪ Zaloguj się jako Ksiądz',
    'k.block_title': 'Wybierz, w czym uczestniczyłeś:',
    'k.only_service': 'Tylko Nabożeństwo (+1 pkt)',
    'k.only_mass': 'Tylko Msza',
    'k.both': 'Oba',
    'k.next': 'Dalej (nowy skan)',
    'k.back_home': '← Powrót do strony głównej',
    'k.update_waiting': '🔄 aktualizacja czeka',

    // pasek statusu
    'k.st_online': 'Online',
    'k.st_offline': 'Offline',
    'k.pending': { one: '{n} oczekująca', few: '{n} oczekujące', many: '{n} oczekujących' },
    'k.cache_from': 'cache z {kiedy}',
    'k.cache_none': 'brak cache',
    'k.cache_stale': 'dane stare — odśwież',
    'k.today': 'dzisiaj',
    'k.yesterday': 'wczoraj',
    'k.queue_btn': '📋 Kolejka',

    // podgląd kolejki
    'k.queue_title': 'Kolejka offline',
    'k.queue_hint': 'Te zapisy czekają na internet. Punkty zostaną przyznane dopiero po synchronizacji z serwerem.',
    'k.q_when': 'Kiedy',
    'k.q_who': 'Kto',
    'k.q_kind': 'Rodzaj',
    'k.q_status': 'Status',
    'k.q_kind_obecnosc': 'obecność',
    'k.q_kind_zgloszenie': 'zgłoszenie',
    'k.q_st_pending': 'oczekuje',
    'k.q_st_synced': 'zsynchronizowane',
    'k.q_st_skipped': 'pominięte (już było na serwerze)',
    'k.q_st_error': 'błąd — sprawdzi Admin',
    'k.q_st_expired': 'przeterminowane (36 h) — po połączeniu trafi do akceptacji Admina',
    'k.q_st_approval': 'wysłane do akceptacji Admina (> 36 h)',
    'k.q_approval_n': 'do akceptacji Admina: {n}',
    'k.q_st_corrupt': 'uszkodzone — sprawdzi Admin',
    'k.q_expired_n': 'przeterminowane: {n}',
    'k.e_queue_store': 'Nie udało się bezpiecznie zapisać obecności na tym urządzeniu. Spróbuj ponownie lub wezwij Admina.',
    'k.extend_confirm': 'Przedłużyć retencję danych osobowych dla {n} wpisów o {h} h? Zmiana zostanie zapisana w audycie (kto, kiedy, o ile).',
    'k.extended': 'Przedłużono wpisów: {n} (o {h} h).',
    'k.extend_24': '⏰ Przedłuż przeterminowane o 24 h',
    'k.extend_7d': '⏰ Przedłuż przeterminowane o 7 dni',
    'k.offline_saved_pin_later': 'Zapisano offline, {imie}. PIN zostanie sprawdzony po połączeniu z internetem.',
    'k.offline_saved_nopin': 'Zapisano offline, {imie}. Obecność zostanie potwierdzona po połączeniu.',
    'k.e_already_queued': 'Ta osoba ma już zapisaną obecność offline na to wydarzenie.',
    'k.e_priv_offline': 'Konta Admina i Księdza: zapis obecności wymaga połączenia z internetem.',
    'lock.idle': 'Wylogowano po 7 minutach bezczynności.',
    'priv.pin_show': 'Dotknij, aby pokazać PIN',
    'priv.pin_hint': 'PIN ukryty — odsłonięty na 8 s',
    'k.q_empty': 'Kolejka pusta.',
    'k.q_sync': '🔁 Synchronizuj teraz',
    'k.q_syncing': 'Łączenie z serwerem…',
    'k.q_no_net': 'Nadal brak internetu — wpisy zostają w kolejce.',

    // wyniki
    'k.ok_scored': '✅ {imie}, zaliczono! +{pkt} pkt',
    'k.report_sent': '✅ Zgłoszenie ({typ}) wysłane. Punkty przyzna Ksiądz lub Admin.',
    'k.offline_saved': '⏳ Zapisano OFFLINE dla {imie}. Punkty zostaną przyznane dopiero po synchronizacji z internetem.',
    'k.offline_saved_short': '⏳ Zapisano OFFLINE. Punkty zostaną przyznane dopiero po synchronizacji z internetem.',
    'k.offline_report_saved': '⏳ Zgłoszenie ({typ}) zapisane OFFLINE — zostanie wysłane do zatwierdzenia po odzyskaniu internetu.',
    'k.net_lost_saved': '📡 Internet zniknął w trakcie zapisu — wpis został bezpiecznie zachowany w kolejce i wyślemy go automatycznie. Punkty zostaną przyznane po synchronizacji.',
    'k.info_offline': 'OFFLINE — zapis czeka na synchronizację po odzyskaniu internetu',
    'k.info_offline_report': 'OFFLINE — Zgłoszenie: {typ} (czeka na internet)',
    'k.info_report': 'Zgłoszenie: {typ} — wymaga zatwierdzenia przez Księdza/Admina',

    // błędy offline
    'k.e_cache_none': 'Brak danych offline: ten Kiosk nigdy ich nie pobrał. Poproś Admina o odświeżenie, gdy tylko będzie internet.',
    'k.e_cache_old': 'Dane offline są starsze niż {d} dni i nie można ich już używać do potwierdzania PIN-u. Poproś Admina o odświeżenie przy najbliższej okazji z internetem.',
    'k.e_badge_unknown_off': 'Nieznany kod QR (offline — nie ma go w ostatnio pobranych danych). Jeśli karta jest nowa, spróbuj ponownie, gdy wróci internet.',
    'k.e_inactive': 'To konto jest nieaktywne.',
    'k.e_locked_until': 'Konto zablokowane (offline) do {godz}.',
    'k.e_no_bcrypt': 'Sprawdzanie PIN-u offline jest niedostępne (nie wczytano biblioteki). Poproś Admina o jednorazowe połączenie Kiosku z internetem.',
    'k.e_no_event_off': 'Brak aktywnego wydarzenia w danych offline. Skontaktuj się z opiekunem.',
    'k.e_net_try_again': 'Brak połączenia z serwerem. Spróbuj jeszcze raz — jeśli internetu nie ma, Kiosk za chwilę przełączy się na tryb offline.',
    'k.e_net_no_cache': 'Brak internetu, a Kiosk nie ma zapisanych danych offline. Poproś Admina o pomoc.',

    // panel awaryjny
    'k.emerg_admin': '🔑 Panel awaryjny — Admin',
    'k.emerg_priest': '⛪ Panel Księdza',
    'k.manual': 'Ręczne zaznaczenie obecności (np. zgubiona karta):',
    'k.manual_code_ph': 'Kod ministranta (np. MIN-007)',
    'k.manual_save': 'Zapisz obecność ręcznie',
    'k.manual_need': 'Podaj kod ministranta i wybierz wydarzenie.',
    'k.manual_notfound': 'Nie znaleziono aktywnego ministranta o takim kodzie.',
    'k.manual_saved': 'Zapisano ręcznie.',
    'k.recent': 'Ostatnio zapisane obecności — cofnij pomyłkę',
    'k.r_when': 'Kiedy',
    'k.r_who': 'Kto',
    'k.r_event': 'Wydarzenie',
    'k.r_pts': 'Pkt',
    'k.undo': 'Cofnij',
    'k.undone': 'Cofnięto obecność.',
    'k.r_none': 'Brak zapisanych obecności.',
    'k.unlock_title': 'Odblokuj zablokowany kod',
    'k.unlock_ph': 'Kod do odblokowania',
    'k.unlock_btn': 'Odblokuj',
    'k.unlocked': 'Odblokowano.',
    'k.off_title': 'Tryb offline',
    'k.off_hint': 'Kiosk sam odświeża dane w tle przy każdym połączeniu z internetem (po jednorazowej autoryzacji przez Admina). Dane offline ważne są 10 dni. Możesz też odświeżyć je ręcznie.',
    'k.off_last': 'Dane offline z:',
    'k.off_never': '— brak, nigdy nie pobrano —',
    'k.off_pull': '🔄 Pobierz / odśwież dane do trybu offline',
    'k.off_pulling': 'Pobieranie…',
    'k.off_pulled': 'Pobrano dane offline (aktywnych plakietek: {n}).',
    'k.off_pull_fail': 'Nie udało się pobrać danych — sprawdź internet.',
    'k.auto_on': '✅ Automatyczne odświeżanie w tle: włączone',
    'k.auto_off': '⚠️ Automatyczne odświeżanie w tle: wyłączone — kliknij przycisk powyżej jako Admin, aby je włączyć.',
    'k.auto_unavailable': '⚠️ Automatyczne odświeżanie niedostępne: na serwerze brakuje funkcji (uruchom sql/14_dodatki12.sql).',
    'k.qa_title': 'Kolejka offline (oczekujące na synchronizację)',
    'k.clear_title': 'Wyczyść starą kolejkę (tylko Admin)',
    'k.clear_hint': 'Czyszczenie dotyczy wyłącznie kolejki zapisanej na tym urządzeniu.',
    'k.clear_done_btn': '🧹 Usuń zakończone wpisy (zsynchronizowane i pominięte)',
    'k.clear_stuck_btn': '⚠️ Usuń wpisy z błędem lub starsze niż {d} dni',
    'k.clear_confirm_done': 'Usunąć z kolejki zakończone wpisy: {n}?',
    'k.clear_confirm_stuck': 'UWAGA: usuniesz wpisy, które NIE zostały zsynchronizowane ({n}). Te obecności/zgłoszenia przepadną bezpowrotnie. Kontynuować?',
    'k.cleared': 'Usunięto wpisów: {n}.',
    'k.nothing_to_clear': 'Brak wpisów do usunięcia.'
});

// ------------------------------------------------------------ ANGIELSKI -----
// [v2.16.02] Tłumaczenia EN są w js/i18n-en.js (ładowane tylko, gdy ten język jest używany).

// ----------------------------------------------------------- UKRAIŃSKI ------
// [v2.16.02] Tłumaczenia UK są w js/i18n-uk.js (ładowane tylko, gdy ten język jest używany).


// ---- dodatki v2.3.01 ----
Object.assign(SLOWNIK.pl, {
    "card.select_all": "Zaznacz wszystkich",
    "card.deselect_all": "Odznacz wszystkich",
    "card.pdf_working": "Pobieram czcionki i buduję PDF…",
    "bdg.pin_unknown": "----",
    "sec.load_error": "Nie udało się wczytać danych: {blad}",
    "sec.page": "Strona {n}"
});


// ---- dodatki v2.4.00 (historia PIN/plakietek, blokada PIN v2, loader PDF) ----
Object.assign(SLOWNIK.pl, {
    "sec.locked_hint": "Blokada rośnie z liczbą błędnych prób: 3 → 1 min, 5 → 5 min, 7 → 15 min, 10 → 1 h, 15 → do odblokowania przez Admina. Ręcznie odblokować może tylko Admin.",
    "sec.col_stage": "Stopień",
    "sec.col_left": "Pozostało",
    "sec.lock_perm": "do odblokowania przez Admina",
    "sec.lock_stage_n": "stopień {n}",
    "e.locked_for": "Kod zablokowany po błędnych próbach. Spróbuj za {czas}.",
    "e.locked_perm": "Kod zablokowany do czasu odblokowania przez Admina.",
    "e.pin_weak": "Ten PIN jest zbyt prosty (np. 1234, 1111, 1212). Wybierz inny.",
    "k.e_brake": "Zbyt wiele błędnych prób na tym Kiosku. Odczekaj {s} s.",
    "time.sec": "{n} s",
    "time.min": "{n} min",
    "time.h": "{n} h",
    "sec.hp_title": "Historia zmian PIN-ów",
    "sec.hp_hint": "Zapisywany jest tylko fakt zmiany — sam PIN nigdy.",
    "sec.hb_title": "Historia plakietek",
    "sec.hb_hint": "Wygenerowanie i unieważnienie plakietek — pełny audyt „kto zgubił kartę i dostał nową”.",
    "sec.hs_title": "Użycia plakietek na Kioskach",
    "sec.hs_hint": "Każdy skan plakietki: kiedy, którą, na którym Kiosku i z jakim wynikiem (także odrzucone).",
    "sec.h_when": "Kiedy",
    "sec.h_minister": "Ministrant",
    "sec.h_by": "Kto",
    "sec.h_source": "Skąd",
    "sec.h_badge": "Plakietka",
    "sec.h_event": "Zdarzenie",
    "sec.h_reason": "Powód",
    "sec.h_kiosk": "Kiosk",
    "sec.h_result": "Wynik",
    "sec.src.pwa": "Aplikacja (PWA)",
    "sec.src.kiosk": "Kiosk",
    "sec.src.admin": "Korekta Admina",
    "sec.src.unknown": "Nieznane",
    "sec.ev.pin_changed": "Zmiana PIN-u",
    "sec.ev.account_created": "Utworzenie konta",
    "sec.ev.generated": "Wygenerowano",
    "sec.ev.revoked": "Unieważniono",
    "sec.scan.ok": "OK",
    "sec.scan.revoked": "Unieważniona (odrzucono)",
    "sec.scan.unknown": "Nieznany kod",
    "sec.scan.offline": "Offline (zsynchronizowano)",
    "sec.hist_none": "Brak wpisów.",
    "sec.hist_need_sql": "Brak funkcji na serwerze — wykonaj sql/15_historia_pin_plakietek.sql.",
    "bdg.revoke_reason": "Powód unieważnienia (opcjonalnie), np. „zgubiona karta”:",
    "card.libs_failed": "Nie udało się wczytać bibliotek PDF/QR z żadnego źródła. Sprawdź internet i spróbuj ponownie.",
    "card.libs_loading": "Wczytuję biblioteki PDF/QR…"
});


// ---- dodatki v2.5.00 (księga punktów, edycja bazy) ----
Object.assign(SLOWNIK.pl, {
    "pts.title": "Historia punktów — {nazwa}",
    "pts.hint": "Księga jest niezmienna: każda zmiana punktów (przyznanie, edycja, usunięcie) zostaje w niej na zawsze — także po usunięciu samego wpisu.",
    "pts.current": "Suma od początku: {n} pkt",
    "pts.none": "Brak wpisów w księdze.",
    "pts.need_sql": "Brak funkcji na serwerze — wykonaj sql/17_ksiega_punktow_edycja_bazy.sql.",
    "pts.col_when": "Kiedy",
    "pts.col_event": "Wydarzenie",
    "pts.col_kind": "Zdarzenie",
    "pts.col_change": "Zmiana",
    "pts.col_ba": "Przed → po",
    "pts.col_total": "Suma",
    "pts.col_by": "Kto",
    "pts.col_source": "Skąd",
    "pts.col_reason": "Powód",
    "pts.col_actions": "Akcje",
    "pts.k.przyznanie": "Przyznanie",
    "pts.k.zmiana": "Zmiana",
    "pts.k.usuniecie": "Usunięcie",
    "pts.src.import": "Import (stan sprzed księgi)",
    "pts.src.admin_panel": "Panel Admina",
    "pts.src.auto": "Automat (Kiosk / zgłoszenie)",
    "pts.src.nieznane": "Korekta / cofnięcie",
    "pts.src.unknown": "Inne",
    "pts.deleted": "wpis usunięty",
    "pts.current_entry": "aktualny wpis",
    "pts.edit": "✏️ Edytuj",
    "pts.delete": "🗑️ Usuń",
    "pts.add": "➕ Dodaj punkty ręcznie",
    "pts.f_points": "Punkty",
    "pts.f_type": "Zaliczone jako",
    "pts.f_reason": "Powód (zapisze się w księdze)",
    "pts.f_save": "Zapisz",
    "pts.f_minister": "Ministrant",
    "pts.f_event": "Wydarzenie",
    "pts.saved": "Zapisano.",
    "pts.confirm_delete": "Usunąć ten wpis punktów? W księdze pozostanie ślad „Usunięcie”.",
    "pts.reason_prompt": "Powód (opcjonalnie):",
    "pts.err_points": "Podaj liczbę punktów od -100 do 100.",
    "db.act_actions": "Akcje",
    "db.act_history": "📜 Historia punktów",
    "db.act_edit": "✏️ Edytuj",
    "db.act_revoke": "Unieważnij",
    "db.read_only": "Edycja punktów wymaga sql/17 — widok tylko do odczytu.",
    "db.edit_hint": "Admin może tu edytować, aktualizować i usuwać dane. Każda zmiana punktów zapisuje się w niezmiennej księdze.",
    "cal.col_actions": "Akcje",
    "cal.act_rename": "Zmień nazwę",
    "cal.act_delete": "Usuń",
    "cal.rename_prompt": "Nowa nazwa wydarzenia:",
    "cal.confirm_delete": "Usunąć to wydarzenie?",
    "cal.confirm_delete_att": "Wydarzenie ma {n} zapisanych obecności. Usunięcie skasuje je (zostaną w księdze punktów). Kontynuować?",
    "cal.deleted": "Wydarzenie usunięte.",
    "cal.renamed": "Nazwa zmieniona.",
    "cal.need_sql": "Wymaga sql/17_ksiega_punktow_edycja_bazy.sql."
});


// ---- dodatki v2.6.00 (dashboard, statystyki, frekwencja, ustawienia, audyt, RODO, Ksiądz, porównanie miesięcy) ----
Object.assign(SLOWNIK.pl, {
    "tab.dashboard": "Dashboard",
    "tab.stats": "Statystyki",
    "tab.freq": "Frekwencja",
    "tab.settings": "Ustawienia",
    "tab.audit": "Audyt",
    "tab.rodo": "RODO",
    "dash.title": "Dashboard",
    "dash.k_ministers": "Aktywni ministranci",
    "dash.k_points": "Punkty w tym miesiącu",
    "dash.k_attend": "Obecności w tym miesiącu",
    "dash.k_events": "Wydarzenia w tym miesiącu",
    "dash.k_requests": "Zgłoszenia do rozpatrzenia",
    "dash.k_kiosks": "Kioski online",
    "dash.k_locked": "Zablokowane kody",
    "dash.k_queue": "Wpisy w kolejkach offline",
    "dash.top": "Top 5 miesiąca",
    "dash.upcoming": "Najbliższe wydarzenia",
    "dash.alerts": "Wymaga uwagi",
    "dash.alert_none": "Wszystko w porządku ✅",
    "dash.recent": "Ostatnie zmiany punktów",
    "dash.al_kiosk": "Kioski offline: {n}",
    "dash.al_locked": "Zablokowane kody: {n}",
    "dash.al_requests": "Zgłoszeń czeka na rozpatrzenie: {n}",
    "dash.al_queue": "Wpisów w kolejkach offline Kiosków: {n}",
    "dash.al_events": "Brak zaplanowanych wydarzeń",
    "dash.none": "Brak danych.",
    "dash.updated": "Odświeżono: {kiedy}",
    "st.title": "Statystyki i raporty zaawansowane",
    "st.hint": "Trend frekwencji i punktów z ostatnich miesięcy, rozkład obecności według typu oraz ranking okresu.",
    "st.months": "Ostatnie miesiące:",
    "st.loading": "Liczę statystyki…",
    "st.trend": "Trend miesięczny",
    "st.by_type": "Obecności według typu",
    "st.ranking": "Ranking okresu",
    "st.col_month": "Miesiąc",
    "st.col_att": "Obecności",
    "st.col_points": "Punkty",
    "st.col_unique": "Ministranci",
    "st.col_events": "Wydarzenia",
    "st.col_avg": "Śr. frekwencja",
    "st.col_type": "Typ",
    "st.col_count": "Liczba",
    "st.col_pos": "Poz.",
    "st.col_minister": "Ministrant",
    "st.export_csv": "Eksport CSV",
    "st.export_pdf": "Raport PDF",
    "st.pdf_title": "Raport statystyczny — {parafia}",
    "st.period": "Okres: {od} – {do}",
    "st.none": "Brak danych w tym okresie.",
    "fr.title": "Raport frekwencji",
    "fr.hint": "Frekwencja = obecności ÷ wydarzenia w miesiącu (do dziś).",
    "fr.col_minister": "Ministrant",
    "fr.col_present": "Obecności",
    "fr.col_events": "Wydarzenia",
    "fr.col_pct": "Frekwencja",
    "fr.col_points": "Punkty",
    "fr.summary": "Wydarzeń: {e} · Średnia frekwencja: {p}% · Bez obecności w miesiącu: {z}",
    "fr.none": "Brak danych.",
    "fr.pdf_title": "Raport frekwencji — {miesiac} {rok}",
    "fr.export_csv": "Eksport CSV",
    "fr.export_pdf": "Raport PDF",
    "fr.show": "Pokaż",
    "set.title": "Ustawienia systemowe",
    "set.hint": "Zmiany zapisują się w dzienniku audytu. Kioski pobierają ustawienia przy połączeniu z internetem.",
    "set.save": "Zapisz",
    "set.saved": "Zapisano.",
    "set.need_sql": "Wymaga sql/18_ustawienia_audyt_rodo_ksiadz.sql.",
    "set.k.nazwa_parafii": "Nazwa parafii (nagłówki PDF)",
    "set.k.okno_przed_min": "Domyślne okno rejestracji: minut przed",
    "set.k.okno_po_min": "Domyślne okno rejestracji: minut po",
    "set.k.cache_offline_dni": "Ważność danych offline Kiosku (dni)",
    "set.k.cache_odswiez_min": "Odświeżanie danych offline w tle (min)",
    "set.k.retencja_logowan_dni": "Retencja logów (dni)",
    "set.k.domyslny_jezyk": "Język domyślny Kiosku",
    "set.changed": "Ostatnia zmiana: {kto}, {kiedy}",
    "aud.title": "Audyt i historia zmian",
    "aud.hint": "Jedna oś czasu: zmiany PIN-ów, plakietek, punktów, kont, wydarzeń, ustawień, blokad i operacji RODO. Wpisów nie da się edytować ani usuwać.",
    "aud.cat_all": "Wszystko",
    "aud.c.pin": "PIN",
    "aud.c.plakietki": "Plakietki",
    "aud.c.punkty": "Punkty",
    "aud.c.ministranci": "Konta",
    "aud.c.kalendarz": "Wydarzenia",
    "aud.c.ustawienia": "Ustawienia",
    "aud.c.rodo": "RODO",
    "aud.c.blokady": "Blokady",
    "aud.col_when": "Kiedy",
    "aud.col_who": "Kto",
    "aud.col_cat": "Kategoria",
    "aud.col_action": "Akcja",
    "aud.col_object": "Obiekt",
    "aud.col_details": "Szczegóły",
    "aud.none": "Brak zdarzeń.",
    "aud.need_sql": "Wymaga sql/18_ustawienia_audyt_rodo_ksiadz.sql.",
    "aud.a.dodano": "Dodano",
    "aud.a.zmieniono": "Zmieniono",
    "aud.a.usunieto": "Usunięto",
    "aud.a.przyznanie": "Przyznanie punktów",
    "aud.a.zmiana": "Zmiana punktów",
    "aud.a.usuniecie": "Usunięcie punktów",
    "aud.a.pin_changed": "Zmiana PIN-u",
    "aud.a.account_created": "Utworzenie konta",
    "aud.a.generated": "Wygenerowano",
    "aud.a.revoked": "Unieważniono",
    "aud.a.blokada": "Blokada kodu",
    "aud.a.odblokowanie": "Odblokowanie",
    "aud.a.eksport": "Eksport danych",
    "aud.a.anonimizacja": "Anonimizacja",
    "aud.a.czyszczenie_logow": "Czyszczenie logów",
    "rodo.title": "Narzędzia RODO",
    "rodo.hint": "Dostęp do danych osoby, anonimizacja i retencja. Każda operacja trafia do niezmiennego rejestru.",
    "rodo.export_title": "Eksport danych osoby (art. 15 i 20)",
    "rodo.pick": "Wybierz osobę",
    "rodo.export_json": "Pobierz JSON",
    "rodo.export_pdf": "Pobierz PDF",
    "rodo.anon_title": "Anonimizacja (art. 17 — prawo do usunięcia)",
    "rodo.anon_hint": "Zamienia imię i nazwisko na „Anonim Użytkownik”, odłącza PIN i plakietki, usuwa logowania. Punkty zostają jako dane statystyczne. NIEODWRACALNE.",
    "rodo.anon_ph": "Przepisz kod osoby, aby potwierdzić",
    "rodo.anon_btn": "Anonimizuj",
    "rodo.anon_done": "Zanonimizowano. Nowy kod: {kod}",
    "rodo.anon_confirm": "To jest NIEODWRACALNE. Zanonimizować: {nazwa}?",
    "rodo.purge_title": "Retencja — czyszczenie starych logów",
    "rodo.purge_hint": "Usuwa logi logowań i skanów starsze niż podana liczba dni (minimum 30).",
    "rodo.purge_days": "Starsze niż (dni)",
    "rodo.purge_btn": "Wyczyść",
    "rodo.purge_done": "Usunięto: {txt}",
    "rodo.purge_confirm": "Usunąć logi starsze niż {d} dni?",
    "rodo.register": "Rejestr operacji RODO",
    "rodo.col_when": "Kiedy",
    "rodo.col_who": "Kto",
    "rodo.col_op": "Operacja",
    "rodo.col_ref": "Osoba (ID)",
    "rodo.col_notes": "Uwagi",
    "rodo.none": "Brak operacji.",
    "rodo.need_sql": "Wymaga sql/18_ustawienia_audyt_rodo_ksiadz.sql.",
    "rodo.pdf_title": "Informacja o przetwarzanych danych osobowych",
    "rodo.pdf_account": "Dane konta",
    "rodo.pdf_attend": "Obecności i punkty",
    "rodo.pdf_badges": "Plakietki",
    "rodo.pdf_pins": "Zmiany PIN-u (bez PIN-u)",
    "rodo.pdf_generated": "Wygenerowano: {kiedy}",
    "mi.priest_note": "Jako Ksiądz dodajesz i prowadzisz zwykłych ministrantów (edycja, PIN, aktywność). Konta Admina i Księży są niedostępne.",
    "cmp.title": "Porównanie z poprzednim miesiącem",
    "cmp.points": "Punkty",
    "cmp.attend": "Obecności",
    "cmp.up": "📈 Świetnie! O {n} więcej niż w poprzednim miesiącu.",
    "cmp.down": "📉 O {n} mniej niż w poprzednim miesiącu — do nadrobienia!",
    "cmp.same": "➡️ Tyle samo co w poprzednim miesiącu.",
    "cmp.no_prev": "Brak danych z poprzedniego miesiąca.",
    "cmp.unit_points": "pkt",
    "cmp.unit_att": "obecn."
});


Object.assign(SLOWNIK.pl, {
    "aud.c.kod3": "Kod 3-cyfrowy",
    "aud.a.ustawiono": "Ustawiono",
    "aud.a.reset": "Reset kodu"
});

// ---------------------------------------------------------------- v2.14: Raport Dnia, Akceptacje 36 h, autor systemu ----
Object.assign(SLOWNIK.pl, {
    'app.author': 'Autor systemu',
    'tab.report': '📋 Raport Dnia',
    'tab.approvals': '✅ Akceptacje (36 h)',
    'rd.title': '📋 Raport Dnia',
    'rd.hint': 'Wszystko, co działo się w systemie wybranego dnia: konta i PIN-y, obecności i punkty, plakietki i skany, Kioski, polecenia, blokady, kolejki offline, import list, RODO, audyt i akceptacje. Oznacz dzień jako przejrzany — dni z aktywnością, których nie przejrzałeś, będą stale przypominane.',
    'rd.today': 'Dziś',
    'rd.auto': 'Odświeżaj automatycznie',
    'rd.generated': 'Wygenerowano: {kiedy}',
    'rd.loading': 'Ładowanie…',
    'rd.need_sql': 'Raport Dnia wymaga uruchomienia w bazie pliku sql/33_akceptacja_36h_raport_dnia.sql.',
    'rd.none': 'Brak wpisów w tym dniu.',
    'rd.section_missing': 'Moduł nieużywany w tej bazie (brak tabeli).',
    'rd.section_error': 'Sekcji nie udało się pobrać: {blad}',
    'rd.reviewed': 'Dzień przejrzany przez {kto} ({kiedy})',
    'rd.not_reviewed': 'Ten dzień nie został jeszcze oznaczony jako przejrzany.',
    'rd.btn_mark': 'Oznacz dzień jako przejrzany',
    'rd.btn_unmark': 'Cofnij oznaczenie',
    'rd.mark_note': 'Uwaga do tego dnia (opcjonalnie):',
    'rd.backlog': 'Dni z aktywnością, których jeszcze nie przejrzałeś: {n}',
    'rd.login_approvals': 'Wpisy starsze niż 36 h czekają na Twoją akceptację: {n}',
    'rd.login_backlog': 'Masz nieprzejrzane dni w Raporcie Dnia: {n}',
    'rd.new_approvals': 'Nowe wpisy > 36 h do akceptacji: {n}',
    'rd.new_activity': 'Nowa aktywność w systemie (skany, konta, blokady, Kioski): {n}',
    'rd.sec_summary': 'Podsumowanie',
    'rd.csv_section': 'Sekcja',
    'rd.csv_col1': 'Pozycja',
    'rd.csv_col2': 'Wartość / dane',
    'rd.al.none': 'Brak alarmów — w tym dniu nic nie wymaga Twojej uwagi.',
    'rd.al.approvals': 'Wpisów > 36 h czeka na Twoją akceptację: {n} (najstarszy: {h} h).',
    'rd.al.go_approvals': 'Przejdź do akceptacji',
    'rd.al.requests': 'Zgłoszeń specjalnych oczekuje na rozpatrzenie: {n}.',
    'rd.al.go_requests': 'Przejdź do zgłoszeń',
    'rd.al.kiosk_silent': 'Kioski bez kontaktu z serwerem od ponad 24 h: {n}.',
    'rd.al.kiosk_locked': 'Zablokowane Kioski: {n}.',
    'rd.al.pin_locks': 'Blokady PIN założone tego dnia: {n}.',
    'rd.al.scans_bad': 'Skany nieznanych lub unieważnionych plakietek: {n}.',
    'rd.al.deletions': 'Usunięcia w systemie: {n}.',
    'rd.al.points_edits': 'Ręczne zmiany lub usunięcia punktów: {n}.',
    'rd.al.rodo': 'Operacje RODO: {n}.',
    'rd.al.undo': 'Cofnięcia zmian z audytu: {n}.',
    'rd.al.new_accounts': 'Nowe konta założone tego dnia: {n}.',
    'rd.al.offline_ops': 'Operacje zsynchronizowane z kolejek offline Kiosków: {n}.',
    'rd.al.section_err': 'Sekcja „{sekcja}” jest niedostępna: {blad}',
    'rd.tile.akceptacje_oczekujace': 'czeka na akceptację (> 36 h)',
    'rd.tile.akceptacje_zgloszone': 'zgłoszone do akceptacji',
    'rd.tile.akceptacje_zaakceptowane': 'zaakceptowane dziś',
    'rd.tile.akceptacje_odrzucone': 'odrzucone dziś',
    'rd.tile.zgloszenia_oczekujace': 'zgłoszenia specjalne czekają',
    'rd.tile.obecnosci_dnia': 'obecności zapisane',
    'rd.tile.punkty_zmiana': 'zmiana sumy punktów',
    'rd.tile.edycje_punktow': 'edycje / usunięcia punktów',
    'rd.tile.nowe_konta': 'nowe konta',
    'rd.tile.zmiany_pin': 'zmiany PIN',
    'rd.tile.blokady_pin': 'blokady PIN',
    'rd.tile.ministranci_aktywni': 'aktywni ministranci',
    'rd.tile.skany_razem': 'skany plakietek',
    'rd.tile.skany_offline': 'skany offline',
    'rd.tile.skany_podejrzane': 'skany nieznane / unieważnione',
    'rd.tile.plakietki_zdarzenia': 'zdarzenia plakietek',
    'rd.tile.kioski_razem': 'Kioski (autoryzowane)',
    'rd.tile.kioski_cisza': 'Kioski bez kontaktu > 24 h',
    'rd.tile.kioski_zablokowane': 'Kioski zablokowane',
    'rd.tile.kioski_polecenia': 'polecenia dla Kiosków',
    'rd.tile.operacje_offline': 'operacje z kolejek offline',
    'rd.tile.retencja_wpisy': 'przedłużenia / usunięcia retencji',
    'rd.tile.wpisy_audytu': 'wpisy audytu',
    'rd.tile.usuniecia': 'usunięcia',
    'rd.tile.rodo_operacje': 'operacje RODO',
    'rd.tile.importy_list': 'importy list papierowych',
    'rd.tile.cofniecia': 'cofnięcia zmian',
    'rd.tile.wydarzenia_dnia': 'wydarzenia tego dnia',
    'rd.tile.akceptacje_najstarsze_h': 'najstarszy wpis czeka (h)',
    'rd.tile.ministranci_razem': 'ministranci razem',
    'rd.sec.wydarzenia': 'Wydarzenia tego dnia',
    'rd.sec.obecnosci': 'Obecności i punkty (księga punktów)',
    'rd.sec.konta': 'Konta i PIN-y',
    'rd.sec.blokady_pin': 'Blokady PIN',
    'rd.sec.skany': 'Skany plakietek',
    'rd.sec.plakietki': 'Plakietki — generowanie i unieważnianie',
    'rd.sec.kioski': 'Kioski — stan i aktywność',
    'rd.sec.kiosk_blokady': 'Blokady Kiosków',
    'rd.sec.kiosk_polecenia': 'Polecenia dla Kiosków',
    'rd.sec.kiosk_ping': 'Pingi Kiosków',
    'rd.sec.operacje_offline': 'Operacje z kolejek offline',
    'rd.sec.retencja': 'Retencja kolejek offline (przedłużenia / usunięcia)',
    'rd.sec.akceptacje_oczekujace': 'Czeka na Twoją akceptację (> 36 h)',
    'rd.sec.akceptacje_dnia': 'Akceptacje — zgłoszenia i decyzje tego dnia',
    'rd.sec.zgloszenia': 'Zgłoszenia specjalne',
    'rd.sec.rodo': 'RODO',
    'rd.sec.importy': 'Importy list papierowych',
    'rd.sec.cofniecia': 'Cofnięcia zmian',
    'rd.sec.audyt': 'Pełny dziennik audytu (wszystkie zmiany w systemie)',
    'rd.col.akcja': 'Akcja',
    'rd.col.aktywna': 'Aktywna',
    'rd.col.bledow': 'Błędów',
    'rd.col.cisza_h': 'Cisza (h)',
    'rd.col.data_wydarzenia': 'Data wydarzenia',
    'rd.col.decyzja_kiedy': 'Decyzja — kiedy',
    'rd.col.decyzja_kto': 'Decyzja — kto',
    'rd.col.decyzja_uwagi': 'Uwagi do decyzji',
    'rd.col.do_akceptacji_dnia': 'Do akceptacji (dziś)',
    'rd.col.do_kiedy': 'Do kiedy',
    'rd.col.dodano': 'Dodano',
    'rd.col.godzin': 'Godzin',
    'rd.col.kategoria': 'Kategoria',
    'rd.col.kiedy': 'Kiedy',
    'rd.col.kiedy_klient': 'Czas na urządzeniu',
    'rd.col.kiedy_urzadzenia': 'Czas na urządzeniu',
    'rd.col.kiosk_id': 'Kiosk',
    'rd.col.kod': 'Kod',
    'rd.col.kod_plakietki': 'Plakietka',
    'rd.col.kto': 'Kto',
    'rd.col.kto_kod': 'Kto',
    'rd.col.ministrant_id': 'Ministrant (id)',
    'rd.col.ministrant_kod': 'Ministrant',
    'rd.col.nazwa': 'Nazwa',
    'rd.col.nazwa_pliku': 'Plik',
    'rd.col.niedoczytanych': 'Nieodczytane',
    'rd.col.obecnych': 'Obecnych',
    'rd.col.obiekt': 'Obiekt',
    'rd.col.od': 'Od',
    'rd.col.odebrano': 'Odebrano',
    'rd.col.odpowiedziano': 'Odpowiedź',
    'rd.col.okno_koniec': 'Koniec okna',
    'rd.col.okno_start': 'Początek okna',
    'rd.col.op_id': 'Id operacji',
    'rd.col.operacja': 'Operacja',
    'rd.col.operacji_offline_dnia': 'Operacje offline (dziś)',
    'rd.col.opis': 'Opis',
    'rd.col.osoba_ref': 'Osoba (ref.)',
    'rd.col.ostatnie_uzycie': 'Ostatni kontakt',
    'rd.col.powod': 'Powód',
    'rd.col.punkty_po': 'Punkty po',
    'rd.col.punkty_przed': 'Punkty przed',
    'rd.col.rid': 'Id rekordu',
    'rd.col.rodzaj': 'Rodzaj',
    'rd.col.skanow_dnia': 'Skany (dziś)',
    'rd.col.status': 'Status',
    'rd.col.stopien': 'Stopień',
    'rd.col.szczegoly': 'Szczegóły',
    'rd.col.tab': 'Tabela',
    'rd.col.tryb_offline': 'Tryb offline',
    'rd.col.typ': 'Typ',
    'rd.col.utworzono': 'Utworzono',
    'rd.col.uwagi': 'Uwagi',
    'rd.col.wiek_h': 'Wiek (h)',
    'rd.col.wierszy_razem': 'Wierszy',
    'rd.col.wybor': 'Wybór',
    'rd.col.wydarzenie_id': 'Wydarzenie (id)',
    'rd.col.wydarzenie_nazwa': 'Wydarzenie',
    'rd.col.wygasa': 'Token wygasa',
    'rd.col.wykonano': 'Wykonano',
    'rd.col.wynik': 'Wynik',
    'rd.col.zablokowany': 'Zablokowany',
    'rd.col.zaktualizowano': 'Zaktualizowano',
    'rd.col.zaliczone_po': 'Zaliczone jako',
    'rd.col.zalozyl': 'Założył',
    'rd.col.zapisano': 'Zapisano',
    'rd.col.zdarzenie': 'Zdarzenie',
    'rd.col.zdjal': 'Zdjął',
    'rd.col.zdjeta': 'Zdjęta',
    'rd.col.zlecil': 'Zlecił',
    'rd.col.zmiana': 'Zmiana pkt',
    'rd.col.zrodlo': 'Źródło',
    'akc.title': '✅ Akceptacje wpisów starszych niż 36 h',
    'akc.hint': 'Wpis z Kiosku zapisany offline, młodszy niż 36 h, dodaje się do systemu sam. Wpis starszy niż 36 h po odzyskaniu internetu trafia tutaj — obecność dodaje się dopiero po Twojej akceptacji. Odrzucenie niczego nie dodaje. PIN nie jest przesyłany ani przechowywany.',
    'akc.st_pending': 'Oczekujące',
    'akc.st_accepted': 'Zaakceptowane',
    'akc.st_rejected': 'Odrzucone',
    'akc.st_all': 'Wszystkie',
    'akc.accept_all': '✅ Akceptuj wszystkie widoczne',
    'akc.col_reported': 'Zgłoszono',
    'akc.col_kiosk': 'Kiosk',
    'akc.col_minister': 'Ministrant',
    'akc.col_kind': 'Rodzaj',
    'akc.col_event': 'Wydarzenie',
    'akc.col_age': 'Wiek (h)',
    'akc.col_status': 'Status',
    'akc.col_action': 'Decyzja',
    'akc.kind_attendance': 'Obecność',
    'akc.kind_request': 'Zgłoszenie specjalne',
    'akc.badge': 'plakietka {kod}',
    'akc.count': 'Wpisów: {n} · oczekuje: {p}',
    'akc.empty': 'Brak wpisów.',
    'akc.warn_exists': 'obecność już istnieje',
    'akc.warn_inactive': 'konto nieaktywne',
    'akc.points_ph': 'pkt (auto)',
    'akc.points_title': 'Puste = punkty naliczone automatycznie',
    'akc.counted_title': 'Jak zaliczyć obecność',
    'akc.counted_auto': 'wg Kiosku',
    'akc.counted_gathering': 'zbiórka',
    'akc.counted_mass': 'msza',
    'akc.note_ph': 'uwaga',
    'akc.btn_accept': 'Akceptuj',
    'akc.btn_reject': 'Odrzuć',
    'akc.points_given': 'punkty: {n}',
    'akc.confirm_accept': 'Zaakceptować wpis: {kto}? Obecność zostanie dodana do systemu.',
    'akc.confirm_reject': 'Odrzucić wpis: {kto}? Nic nie zostanie dodane.',
    'akc.accepted_ok': 'Zaakceptowano: {kto}.',
    'akc.rejected_ok': 'Odrzucono: {kto}.',
    'akc.nothing': 'Brak wpisów, które można zaakceptować hurtowo.',
    'akc.confirm_all': 'Zaakceptować wszystkie widoczne wpisy ({n})? Punkty zostaną naliczone automatycznie.',
    'akc.bulk_done': 'Zaakceptowano: {ok} · błędy: {err}',
    'aud.c.akceptacje': 'Akceptacje > 36 h',
    'aud.c.raport_dnia': 'Raport Dnia',
    'aud.a.zgloszono': 'Zgłoszono do akceptacji',
    'aud.a.odrzucono': 'Odrzucono',
    'aud.a.zaakceptowano': 'Zaakceptowano',
    'aud.a.przejrzano': 'Dzień przejrzany',
    'aud.a.cofnieto_przejrzenie': 'Cofnięto przejrzenie dnia'
});

// ---------------------------------------------------------------- v2.15: Kontakt z Administratorem ----
Object.assign(SLOWNIK.pl, {
    'tab.messages': '✉️ Wiadomości',
    'kt.button': 'Kontakt z Adminem',
    'kt.button_title': 'Skontaktuj się z Administratorem',
    'kt.title': '✉️ Skontaktuj się z Administratorem',
    'kt.desc_kiosk': 'Napisz do Administratora: usterkę, pytanie lub pomysł. Możesz wysłać anonimowo albo się podpisać.',
    'kt.desc_panel': 'Napisz do Administratora: usterkę, pytanie lub pomysł. Wiadomość nie jest anonimowa — Administrator zobaczy, kto ją wysłał.',
    'kt.category': 'Kategoria',
    'kt.message': 'Wiadomość',
    'kt.placeholder': 'Opisz, co się stało lub o co chcesz zapytać…',
    'kt.cat_inne': 'Inne',
    'kt.cat_usterka': 'Usterka / błąd',
    'kt.cat_pytanie': 'Pytanie',
    'kt.cat_pomysl': 'Pomysł',
    'kt.cat_pilne': 'Pilne',
    'kt.anonymous': 'Wyślij anonimowo (Administrator nie zobaczy, kim jestem)',
    'kt.code_ph': 'Twój kod',
    'kt.pin_ph': 'Twój PIN',
    'kt.not_anonymous': 'Wysyłasz jako: {kto}. Ta wiadomość nie jest anonimowa.',
    'kt.attach': 'Załącz zrzut ekranu tego, co teraz widzę',
    'kt.attach_unavailable': 'Zrzut ekranu jest niedostępny w tej przeglądarce',
    'kt.attach_warning': 'Zrzut może zawierać dane widoczne na ekranie. Zobaczy go tylko Administrator. Pola z hasłami i PIN-ami są zasłonięte.',
    'kt.send': 'Wyślij',
    'kt.cancel': 'Anuluj',
    'kt.close': 'Zamknij',
    'kt.sending': 'Wysyłanie…',
    'kt.sent': 'Wiadomość wysłana do Administratora. Dziękujemy!',
    'kt.err_empty': 'Wpisz treść wiadomości.',
    'kt.err_no_token': 'Ten Kiosk nie jest autoryzowany — wiadomość nie może zostać wysłana.',
    'kt.err_sign': 'Aby podpisać wiadomość, podaj kod i PIN albo zaznacz wysyłanie anonimowe.',
    'kt.err_session': 'Zaloguj się, aby wysłać wiadomość.',
    'kt.err_network': 'Brak połączenia z internetem. Wiadomość nie została wysłana — spróbuj ponownie (treść została zachowana).',
    'kt.err_need_sql': 'Funkcja wymaga uruchomienia w bazie pliku sql/34_kontakt_z_administratorem.sql.',
    'kt.err_generic': 'Nie udało się wysłać wiadomości.',
    'kt.adm_title': '✉️ Wiadomości do Administratora',
    'kt.adm_hint': 'Wiadomości z Panelu są podpisane. Z Kiosków mogą być anonimowe — wtedy widzisz tylko, z którego Kiosku przyszły. Zrzut ekranu pokazuje to, co autor widział w chwili wysyłania.',
    'kt.adm_anonymous': 'Anonim',
    'kt.adm_count': 'Wiadomości: {n} · nowe: {p}',
    'kt.adm_empty': 'Brak wiadomości.',
    'kt.adm_src_kiosk': 'Kiosk {id}',
    'kt.adm_src_panel': 'Panel',
    'kt.adm_col_from': 'Od',
    'kt.adm_screenshot': 'Zrzut ekranu',
    'kt.adm_mark_read': 'Przeczytane',
    'kt.adm_mark_done': 'Załatwione',
    'kt.adm_mark_new': 'Oznacz jako nowe',
    'kt.adm_note': 'Notatka do załatwienia (opcjonalnie):',
    'kt.adm_confirm_delete': 'Usunąć tę wiadomość bezpowrotnie?',
    'kt.adm_need_sql': 'Skrzynka wymaga uruchomienia w bazie pliku sql/34_kontakt_z_administratorem.sql.',
    'kt.adm_login': 'Nowe wiadomości do Administratora: {n}',
    'kt.adm_new': 'Nowe wiadomości do Administratora: {n}',
    'kt.adm_urgent': 'pilne: {n}',
    'kt.adm_st_nowe': 'Nowe',
    'kt.adm_st_przeczytane': 'Przeczytane',
    'kt.adm_st_zalatwione': 'Załatwione',
    'kt.role_ministrant': 'ministrant',
    'kt.role_ksiadz': 'ksiądz',
    'kt.role_admin': 'admin',
    'aud.c.kontakt': 'Kontakt z Adminem',
    'aud.a.wyslano': 'Wysłano wiadomość'
});

Object.assign(SLOWNIK.pl, {
    'aud.a.status': 'Zmiana statusu wiadomości'
});

// ---------------------------------------------------------------- v2.15.02 ----
Object.assign(SLOWNIK.pl, {
    'kt.adm_clean': '🧹 Wyczyść stare',
    'kt.adm_clean_prompt': 'Usunąć załatwione wiadomości oraz zrzuty ekranu starsze niż ile dni?',
    'kt.adm_clean_bad': 'Podaj liczbę dni od 1 do 3650.',
    'kt.adm_clean_confirm': 'Usunąć bezpowrotnie załatwione wiadomości i zrzuty ekranu starsze niż {n} dni?',
    'kt.adm_clean_done': 'Usunięto wiadomości: {m} · usunięto zrzuty: {z}'
});

// ---------------------------------------------------------------- v2.15.03 ----
Object.assign(SLOWNIK.pl, {
    'common.save': 'Zapisz',
    'kt.desc_login': 'Nie możesz się zalogować? Napisz do Administratora. Ta wiadomość nie ma zrzutu ekranu, a Administrator nie będzie wiedział na pewno, kim jesteś — podaj imię i sposób kontaktu (telefon lub e-mail), żeby mógł Ci odpowiedzieć.',
    'kt.login_name_ph': 'Imię i nazwisko / kod (np. MIN-001) — opcjonalnie',
    'kt.login_contact_ph': 'Telefon lub e-mail do odpowiedzi — opcjonalnie',
    'kt.login_unverified': 'Nie jesteś zalogowany — Administrator zobaczy tę wiadomość jako niezweryfikowaną.',
    'kt.login_unverified_short': 'niezweryfikowany',
    'kt.login_nameless': 'bez podpisu',
    'kt.adm_src_login': 'Ekran logowania',
    'kt.adm_edit_note': 'Edytuj notatkę',
    'kt.adm_note_saved': 'Notatka zapisana.',
    'cal.act_edit': 'Edytuj',
    'cal.edit_title': 'Edycja wydarzenia',
    'cal.edit_before': 'Okno obecności: minut PRZED',
    'cal.edit_after': 'Okno obecności: minut PO',
    'cal.edit_hint': 'Zmiana daty lub minut przelicza okno, w którym ministranci mogą się zapisać.',
    'cal.edit_need_name': 'Podaj nazwę wydarzenia.',
    'cal.edit_need_sql': 'Edycja wydarzeń wymaga uruchomienia w bazie pliku sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql.',
    'cal.edited': 'Zapisano zmiany w wydarzeniu.',
    'cal.edit_not_found': 'Nie znaleziono wydarzenia.'
});

// ---------------------------------------------------------------- v2.15.04 ----
Object.assign(SLOWNIK.pl, { 'k.sync_rate_limit': 'serwer chwilowo ogranicza synchronizację — ponowię za chwilę' });

// ---------------------------------------------------------------- v2.15.05 ----
Object.assign(SLOWNIK.pl, {
    'net.blocked': "Strażnik sieci zablokował niedozwolone połączenie. Dane nie zostały wysłane.",
    'czyt.btn': "📖 Czytania na dziś",
    'czyt.title': "Czytania na dziś",
    'czyt.close': "Zamknij",
    'czyt.today': "Dziś",
    'czyt.tomorrow': "Jutro",
    'czyt.after': "Pojutrze",
    'czyt.tabs': "Wybierz dzień",
    'czyt.note': "Treść pochodzi z serwisu Niedziela.pl i wymaga internetu. Po otwarciu okna Twoje urządzenie łączy się z serwerami Niedziela.pl (widzą m.in. adres IP).",
    'sec.sn_title': "Strażnik sieci — status",
    'sec.sn_hint': "Sprawdza, czy ochrona połączeń działa w tej przeglądarce. Test próbuje połączyć się z nieistniejącym obcym adresem — strażnik powinien go zablokować.",
    'sec.sn_active': "Strażnik jest AKTYWNY",
    'sec.sn_missing': "Strażnik NIEAKTYWNY w tej przeglądarce (działa tylko polityka CSP)",
    'sec.sn_channels': "Chronione kanały",
    'sec.sn_blocks': "Zablokowane połączenia w tej sesji",
    'sec.sn_test': "Uruchom test strażnika",
    'sec.sn_test_ok': "Test zaliczony: strażnik zablokował próby połączenia.",
    'sec.sn_test_fail': "Test NIEZALICZONY — strażnik nie zareagował jak należy",
    'sec.sn_host': "Host",
    'sec.sn_method': "Metoda",
    'sec.sn_none': "Brak zablokowanych połączeń.",
    'aud.c.asystent': "Asystent AI",
    'aud.a.uzyto': "Użycie asystenta (bez treści)",
    'aud.a.wlaczono': "Włączono asystenta",
    'aud.a.wylaczono': "Wyłączono asystenta"
});

// ---------------------------------------------------------------- v2.15.06 ----
Object.assign(SLOWNIK.pl, {
    'lst.fixed_from': "poprawiono z „{kod}” — sprawdź i zaznacz",
    'lst.duplicate': "powtórzony kod"
});

// ============================================================================
// MECHANIKA
// ============================================================================
let jezykBiezacy = JEZYK_DOMYSLNY;

// v2.16.02 — słowniki EN i UK są w osobnych plikach (js/i18n-en.js, js/i18n-uk.js): polski (domyślny) nie pobiera ani nie parsuje cudzych tłumaczeń.
// Wczytywanie: (1) przy starcie — SYNCHRONICZNIE (document.write w trakcie parsowania strony), gdy wykryty język to nie PL, żeby pierwszy ekran
// był od razu po właściwemu; (2) po przełączeniu języka — dynamicznie, a zmiana języka kończy się dopiero po wczytaniu słownika.
// Gdy plik się nie wczyta (brak sieci, a nie ma go w pamięci offline) — działa polski (awaryjnie w t()), a próba się nie powtarza w pętli.
const PLIKI_JEZYKOW = { en: 'js/i18n-en.js', uk: 'js/i18n-uk.js' };
const slownikiProbowane = {};   // kod → true: plik języka wczytany (albo próba się nie udała — wtedy nie ponawiamy w pętli)
function przyrostekWersji() { return (typeof WERSJA_APLIKACJI === 'string' && WERSJA_APLIKACJI) ? '?v=' + encodeURIComponent(WERSJA_APLIKACJI) : ''; }
function slownikGotowy(kod) { return !PLIKI_JEZYKOW[kod] || !!slownikiProbowane[kod]; }   // plik języka na końcu ustawia slownikiProbowane[kod] = true
function wczytajSlownik(kod, po) {
    if (slownikGotowy(kod)) { if (po) po(); return; }
    const s = document.createElement('script');
    s.src = PLIKI_JEZYKOW[kod] + przyrostekWersji();
    const koniec = () => { slownikiProbowane[kod] = true; if (po) po(); };
    s.onload = koniec;
    s.onerror = () => { console.warn('Nie wczytano tłumaczeń:', kod); koniec(); };
    document.head.appendChild(s);
}

function reguraMnoga(kod, n) {
    if (kod === 'en') return n === 1 ? 'one' : 'many';
    // pl i uk: 1 → one; 2–4 (poza 12–14) → few; reszta → many
    const m10 = n % 10, m100 = n % 100;
    if (n === 1) return 'one';
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 'few';
    return 'many';
}

function t(klucz, zmienne) {
    let wartosc = (SLOWNIK[jezykBiezacy] && SLOWNIK[jezykBiezacy][klucz]);
    if (wartosc === undefined) wartosc = SLOWNIK[JEZYK_DOMYSLNY][klucz]; // awaryjnie polski
    if (wartosc === undefined) return klucz;
    if (typeof wartosc === 'object') {
        const n = zmienne && typeof zmienne.n === 'number' ? zmienne.n : 0;
        wartosc = wartosc[reguraMnoga(jezykBiezacy, n)] || wartosc.many;
    }
    return wartosc.replace(/\{(\w+)\}/g, (_, nazwa) =>
        (zmienne && zmienne[nazwa] !== undefined) ? String(zmienne[nazwa]) : '{' + nazwa + '}');
}

function locale() { return JEZYKI[jezykBiezacy].locale; }
function formatDataCzas(iso) { return new Date(iso).toLocaleString(locale()); }
function formatData(iso) { return new Date(iso).toLocaleDateString(locale()); }
function formatGodzina(iso, opcje) {
    return new Date(iso).toLocaleTimeString(locale(), opcje || { hour: '2-digit', minute: '2-digit' });
}

function nazwaMiesiaca(n) {
    return new Intl.DateTimeFormat(locale(), { month: 'long' })
        .format(new Date(2024, n - 1, 1))
        .replace(/^./, c => c.toLocaleUpperCase(locale()));
}

// Komunikaty zwracane przez serwer są po polsku — rozpoznajemy typowe i tłumaczymy;
// nieznane zostają w oryginale (lepiej polski tekst niż żaden).
function tlumaczBlad(blad) {
    if (!blad) return t('e.server');
    const wzorce = [
        [/Błąd połączenia z serwerem/i, 'e.network'],
        [/Nieprawidłowy PIN/i, 'e.wrong_pin'],
        [/zablokowan/i, 'e.locked'],
        [/już została zaliczona|już zaliczon|już rozpatrzone/i, 'e.already'],
        [/Brak aktywnego wydarzenia/i, 'e.no_event'],
        [/Nieznany kod/i, 'e.unknown_qr'],
        [/Brak uprawnie/i, 'e.no_permission'],
        [/zbyt prosty/i, 'e.pin_weak'],
        [/Błąd serwera/i, 'e.server']
    ];
    for (const [re, klucz] of wzorce) if (re.test(blad)) return t(klucz);
    return blad;
}

function zastosujTlumaczenia(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
}

function odswiezPrzelaczniki() {
    document.querySelectorAll('[data-jezyk-switch] button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === jezykBiezacy);
        b.setAttribute('aria-pressed', b.dataset.lang === jezykBiezacy ? 'true' : 'false');
    });
}

// opcje.zapisz === false → język tylko na czas sesji (Kiosk: każdy ministrant wybiera swój)
function ustawJezyk(kod, opcje) {
    if (!JEZYKI[kod]) kod = JEZYK_DOMYSLNY;
    if (!slownikGotowy(kod)) { wczytajSlownik(kod, () => ustawJezyk(kod, opcje)); return; }   // v2.16.02: najpierw słownik języka
    jezykBiezacy = kod;
    document.documentElement.lang = kod === 'uk' ? 'uk' : (kod === 'en' ? 'en-GB' : 'pl');
    if (!opcje || opcje.zapisz !== false) {
        try { localStorage.setItem(KLUCZ_JEZYKA, kod); } catch (e) { /* tryb prywatny — trudno */ }
    }
    zastosujTlumaczenia();
    odswiezPrzelaczniki();
    document.dispatchEvent(new CustomEvent('zmiana-jezyka', { detail: { jezyk: kod } }));
}

function wykryjJezykStartowy() {
    try {
        const zapisany = localStorage.getItem(KLUCZ_JEZYKA);
        if (zapisany && JEZYKI[zapisany]) return zapisany;
    } catch (e) { /* ignoruj */ }
    const przegladarki = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']);
    for (const l of przegladarki) {
        const k = String(l).toLowerCase().slice(0, 2);
        if (JEZYKI[k]) return k;
    }
    return JEZYK_DOMYSLNY;
}

// Przełączniki: <div data-jezyk-switch></div> → przyciski PL / EN / UA
function zbudujPrzelaczniki() {
    document.querySelectorAll('[data-jezyk-switch]').forEach(kontener => {
        if (kontener.dataset.zbudowany) return;
        kontener.dataset.zbudowany = '1';
        kontener.classList.add('jezyk-switch');
        kontener.innerHTML = Object.keys(JEZYKI).map(k =>
            `<button type="button" data-lang="${k}" title="${JEZYKI[k].nazwa}" lang="${k}">${JEZYKI[k].krotka}</button>`
        ).join('');
        kontener.addEventListener('click', e => {
            const b = e.target.closest('button[data-lang]');
            if (!b) return;
            const bezZapisu = kontener.dataset.jezykSwitch === 'sesja';
            ustawJezyk(b.dataset.lang, bezZapisu ? { zapisz: false } : undefined);
        });
    });
    odswiezPrzelaczniki();
}

function inicjujJezyk(opcje) {
    zbudujPrzelaczniki();
    const start = (opcje && opcje.jezyk) || wykryjJezykStartowy();
    ustawJezyk(start, opcje && opcje.zapisz === false ? { zapisz: false } : { zapisz: false });
}

// v2.16.02: język startowy inny niż polski → słownik dołączany synchronicznie jeszcze podczas parsowania (przed DOMContentLoaded i przed innymi skryptami).
if (document.readyState === 'loading' && !window.__EM_BEZ_AUTO_JEZYKA) {
    try {
        const startowy = wykryjJezykStartowy();
        if (PLIKI_JEZYKOW[startowy] && !slownikGotowy(startowy)) document.write('<script src="' + PLIKI_JEZYKOW[startowy] + przyrostekWersji() + '"><\/script>');
    } catch (e) { /* ustawJezyk wczyta słownik dynamicznie */ }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (!window.__EM_BEZ_AUTO_JEZYKA) inicjujJezyk(); });
} else if (!window.__EM_BEZ_AUTO_JEZYKA) {
    inicjujJezyk();
}

// ============================================================================
// NARZĘDZIA WSPÓLNE
// ============================================================================

// Escapowanie tekstu wstawianego do HTML (ochrona przed XSS) — używać dla KAŻDEJ wartości z bazy/urządzenia.
function esc(v) {
    return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Tłumaczenie, jeśli klucz istnieje; w przeciwnym razie wartość zapasowa (np. nieznany typ z bazy).
function etykieta(klucz, zapasowa) {
    const w = t(klucz);
    return w === klucz ? (zapasowa === undefined ? klucz : zapasowa) : w;
}

// ----------------------------------------------------------------------------
// PIN: ocena „zbyt prostego” (ta sama reguła jest egzekwowana też na serwerze — sql/15)
// ----------------------------------------------------------------------------
function pinZbytProsty(pin) {
    pin = String(pin || '');
    if (!/^\d{4}$/.test(pin)) return false; // długość sprawdzają formularze osobno
    if (/^(\d)\1{3}$/.test(pin)) return true;                       // 0000, 1111 …
    if (/^(\d)(\d)\1\2$/.test(pin)) return true;                    // 1212, 4545 …
    if (/^(\d)\1(\d)\2$/.test(pin)) return true;                    // 1122, 3344 …
    const c = pin.split('').map(Number);
    const rosnacy = c.every((x, i) => i === 0 || x === c[i - 1] + 1);
    const malejacy = c.every((x, i) => i === 0 || x === c[i - 1] - 1);
    if (rosnacy || malejacy) return true;                           // 1234, 4321, 0123 …
    return ['2580', '1357', '2468', '1379', '2000', '1004'].includes(pin);
}

// Sekundy → „5 min”, „45 s”, „1 h 5 min” (w aktualnym języku)
function formatCzasPozostaly(sekundy) {
    sekundy = Math.max(0, Math.round(Number(sekundy) || 0));
    if (sekundy < 60) return t('time.sec', { n: sekundy });
    const m = Math.ceil(sekundy / 60);
    if (m < 60) return t('time.min', { n: m });
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${t('time.h', { n: h })} ${t('time.min', { n: r })}` : t('time.h', { n: h });
}

// Odpowiedź serwera z informacją o blokadzie (blokada PIN v2) → tekst w aktualnym języku, albo null
function tekstBlokadyZOdpowiedzi(wynik) {
    const b = wynik && wynik.blokada;
    if (!b || !b.zablokowany) return null;
    return b.trwala ? t('e.locked_perm') : t('e.locked_for', { czas: formatCzasPozostaly(b.sekundy) });
}

// ============================================================================
// v2.8 — RĘCZNA OBECNOŚĆ (Admin/Ksiądz) + PING KIOSKU NA ŻYWO (tłumaczenia)
// ============================================================================
Object.assign(SLOWNIK.pl, {
    'tab.manual': 'Ręczna obecność',
    'man.title': 'Ręczne dodanie obecności',
    'man.hint': 'Jako Admin lub Ksiądz możesz sam dodać wybranej osobie obecność na mszy albo obecność specjalną (pogrzeb / ślub / inne). To samo zrobisz w Kiosku po zalogowaniu (plakietka → PIN → kod 3-cyfrowy → „Zaloguj się jako…”). Wpis trafia do księgi punktów i audytu.',
    'man.who': 'Kto',
    'man.kind': 'Rodzaj obecności',
    'man.kind_mass': '⛪ Msza / wydarzenie',
    'man.kind_special': '📋 Obecność specjalna (zgłoszenie)',
    'man.event': 'Wydarzenie',
    'man.special_type': 'Typ zgłoszenia',
    'man.points': 'Punkty',
    'man.reason': 'Powód / uwagi (opcjonalnie)',
    'man.save': 'Dodaj obecność',
    'man.saving': 'Zapisuję…',
    'man.saved': 'Obecność dodana.',
    'man.updated': 'Obecność już istniała — zaktualizowano punkty.',
    'man.need_person': 'Wybierz osobę.',
    'man.need_event': 'Wybierz wydarzenie (mszę).',
    'man.need_points': 'Punkty: liczba od 0 do 100.',
    'man.need_sql': 'Brak funkcji na serwerze — wykonaj sql/20_reczna_obecnosc_ping.sql.',
    'ping.btn': 'Ping',
    'ping.title': 'Ping: {nazwa}',
    'ping.again': 'Pinguj ponownie',
    'ping.sending': 'Wysyłam ping do Kiosku…',
    'ping.waiting': 'Czekam na odpowiedź Kiosku… {s} s',
    'ping.alive': 'Kiosk „{nazwa}” odpowiada — jest online.',
    'ping.dead': 'Kiosk „{nazwa}” nie odpowiedział.',
    'ping.dead_hint': 'Może być wyłączony, offline albo ma zamkniętą kartę. Kiosk sprawdza zlecenia co kilka sekund.',
    'ping.latency': 'Czas reakcji Kiosku',
    'ping.roundtrip': 'Pełny czas (od kliknięcia)',
    'ping.version': 'Wersja aplikacji',
    'ping.online': 'Internet',
    'ping.network': 'Sieć',
    'ping.queue': 'Kolejka offline',
    'ping.cache': 'Dane offline z',
    'ping.device_time': 'Zegar urządzenia',
    'ping.clock_diff': 'Różnica zegara (urządzenie − serwer)',
    'ping.lang': 'Język urządzenia',
    'ping.need_sql': 'Brak funkcji na serwerze — wykonaj sql/20_reczna_obecnosc_ping.sql.'
});

// ============================================================================
// v2.9 — skaner QR z kamery, losowy PIN nowego konta
// ============================================================================
Object.assign(SLOWNIK.pl, {
    'cam.btn': '📷 Skanuj kamerą',
    'cam.title': 'Skaner kodu QR',
    'cam.starting': 'Uruchamiam kamerę…',
    'cam.aim': 'Skieruj kamerę na kod QR plakietki.',
    'cam.denied': 'Brak zgody na kamerę. Zezwól na dostęp do kamery w ustawieniach przeglądarki.',
    'cam.unsupported': 'Ta przeglądarka nie obsługuje kamery (potrzebny HTTPS).',
    'cam.no_decoder': 'Brak dekodera QR. Połącz się z internetem (jednorazowe pobranie) albo użyj czytnika USB.',
    'mi.pin_ph': 'PIN (4 cyfry) — puste = wylosuj',
    'mi.pin_generated': 'Wylosowany PIN: {pin} — zapisz go i przekaż osobie. Możesz go zmienić w edycji, a konto samo w „Zmień PIN”.'
});

// ============================================================================
// v2.10 — przycisk „Zatwierdź”, wybór mszy z listy, wybór dla mszy połączonej z nabożeństwem
// ============================================================================
Object.assign(SLOWNIK.pl, {
    'k.confirm': 'Zatwierdź',
    'k.choose_event': 'Wybierz mszę / wydarzenie:',
    'k.event_combined': 'msza połączona z nabożeństwem',
    'e.no_event': 'Brak wydarzenia — albo okienko zapisu jest zamknięte. Skontaktuj się z opiekunem.',
    'k.block_title': 'Ta msza jest połączona z nabożeństwem. W czym uczestniczyłeś?',
    'k.only_service': '🙏 Tylko na nabożeństwie (+1 pkt)',
    'k.only_mass': '⛪ Tylko na mszy',
    'k.both': '⛪🙏 Na obu (msza i nabożeństwo)'
});

// ============================================================================
// v2.11 — LISTY PAPIEROWE (OCR + import „System (Lista)”)
// ============================================================================
Object.assign(SLOWNIK.pl, {
    'tab.lists': 'Listy papierowe',
    'lst.title': 'Listy papierowe',
    'lst.hint': 'Wydrukuj listę, niech ministranci wpiszą DRUKOWANYMI literami kod (MIN-___), opcjonalnie datę (dd.mm) i typ M / N / O / Z (msza / nabożeństwo / oba / zbiórka). Potem zrób zdjęcie lub skan i wczytaj je tutaj. Czytelne wiersze zostaną dodane jako „System (Lista)”, a numery wierszy, których nie udało się odczytać, zobaczysz na liście — możesz je poprawić ręcznie. Odczyt pisma ręcznego nie jest nieomylny: zawsze sprawdź tabelę przed dodaniem.',
    'lst.print_h': '1. Wydrukuj pustą listę',
    'lst.rows': 'Liczba wierszy (5–30)',
    'lst.pdf_btn': 'Pobierz listę (PDF)',
    'lst.pdf_building': 'Tworzę PDF…',
    'lst.pdf_ready': 'Lista pobrana — wydrukuj ją.',
    'lst.pdf_title': 'Lista obecności',
    'lst.pdf_hint': 'Pisz DRUKOWANYMI literami, ciemnym długopisem: 3 cyfry po „MIN-”, data dd.mm (opcjonalnie), typ M / N / O / Z (opcjonalnie).',
    'lst.pdf_footer': 'M = msza · N = nabożeństwo · O = oba (tylko gdy msza jest połączona z nabożeństwem) · Z = zbiórka. Nie zginaj kartki — zeskanuj ją lub zrób zdjęcie z góry.',
    'lst.import_h': '2. Wczytaj wypełnioną listę (zdjęcie lub skan)',
    'lst.file': 'Zdjęcie / skan listy',
    'lst.read_btn': 'Odczytaj listę',
    'lst.need_event': 'Wybierz wydarzenie.',
    'lst.need_file': 'Wybierz zdjęcie lub skan listy.',
    'lst.loading_ocr': 'Ładuję moduł odczytu (potrzebny internet)…',
    'lst.reading': 'Odczytuję listę… {p}%',
    'lst.read_done': 'Odczytano wierszy: {n}. Sprawdź tabelę poniżej.',
    'lst.ocr_unavailable': 'Nie udało się załadować modułu odczytu (brak internetu?). Spróbuj ponownie przy działającej sieci.',
    'lst.nothing_read': 'Nic nie odczytano — spróbuj lepszego zdjęcia (równo, z góry, dobre światło).',
    'lst.unread_rows': 'Nie doczytano wierszy: {n}',
    'lst.all_read': 'Wszystkie widoczne wiersze zostały odczytane.',
    'lst.to_add': 'Wierszy do dodania: {n}',
    'lst.col_add': 'Dodać', 'lst.col_no': 'Nr', 'lst.col_code': 'Kod', 'lst.col_who': 'Kto', 'lst.col_date': 'Data', 'lst.col_type': 'Typ', 'lst.col_status': 'Odczyt',
    'lst.st_unsure': 'niepewny', 'lst.st_unknown': 'nieznany kod', 'lst.st_unreadable': 'nieczytelny',
    'lst.import_btn': 'Dodaj do systemu (System (Lista))',
    'lst.nothing_to_add': 'Brak wierszy do dodania.',
    'lst.confirm_import': 'Dodać {n} wpisów? Niedoczytane wiersze: {bad}. Wpisy zostaną oznaczone jako „System (Lista)”.',
    'lst.imported': 'Dodano: {a}, zaktualizowano: {b}.',
    'lst.server_rejected': 'Serwer odrzucił',
    'lst.source_note': 'Wpisy mają źródło „System (Lista)” (widoczne w księdze punktów i w historii importów).',
    'lst.need_sql': 'Brak funkcji na serwerze — wykonaj sql/22_listy_papierowe.sql.',
    'lst.history_h': 'Historia importów z list',
    'lst.h_when': 'Kiedy', 'lst.h_added_by': 'Dodał', 'lst.h_approved': 'Zatwierdził', 'lst.h_added': 'Dodano', 'lst.h_unread': 'Nie doczytano (wiersze)',
    'lst.updated_short': 'zaktual.',
    'lst.no_history': 'Brak importów.'
});

// v2.11.01 — komunikat błędu odczytu
Object.assign(SLOWNIK.pl, { 'e.read_failed': 'Nie udało się odczytać danych ({opis}): {msg} {kod}' });

// ============================================================================
// v2.12 — Narzędzia Admina, zdalne sterowanie Kioskiem, blokada Kiosku, audyt z cofaniem (tłumaczenia)
// ============================================================================
Object.assign(SLOWNIK.pl, {
    "tab.tools": "Narzędzia",
    "tools.title": "Narzędzia Admina",
    "tools.hint": "Samotest bazy, kontrola punktów, duplikaty kont, awaryjna blokada Kiosku oraz kopia zapasowa całej bazy. Wymaga plików SQL 24–26.",
    "tools.state_h": "🩺 Stan bazy (samotest)",
    "tools.run": "Uruchom samotest",
    "tools.spoj_h": "🧮 Spójność punktów",
    "tools.check": "Sprawdź",
    "tools.dupl_h": "👥 Duplikaty kont",
    "tools.scan": "Wyszukaj duplikaty",
    "tools.lock_h": "⛔ Awaryjna blokada Kiosku",
    "tools.lock_hint": "Gdy na mszy jest tłum i skanowanie byłoby zbyt wolne: zablokuj Kiosk, a osoby wpiszą się na papierowej liście (zakładka „Listy papierowe”). Blokada działa do odwołania albo przez wybrany czas.",
    "tools.lock_which": "Który Kiosk",
    "tools.lock_for": "Na jak długo",
    "tools.dur_15": "15 minut",
    "tools.dur_30": "30 minut",
    "tools.dur_60": "1 godzina",
    "tools.dur_120": "2 godziny",
    "tools.dur_480": "8 godzin",
    "tools.dur_forever": "Do odwołania",
    "tools.lock_reason_ph": "Komunikat na ekranie Kiosku (np. Msza odpustowa)",
    "tools.lock_btn": "Zablokuj Kiosk",
    "tools.unlock_all": "Zdejmij wszystkie blokady",
    "tools.h_kiosk": "Kiosk",
    "tools.h_from": "Od",
    "tools.h_to": "Do",
    "tools.h_reason": "Powód",
    "tools.backup_h": "💾 Eksport i import całej bazy",
    "tools.backup_hint": "Kopia zawiera konta, wydarzenia, obecności, ustawienia i historię. Import ma najpierw tryb próby (nic nie zapisuje). Księga punktów i audyt są tylko do odczytu — nie są importowane.",
    "tools.with_hash": "Dołącz zahaszowane PIN-y (pełna kopia — przechowuj bezpiecznie!)",
    "tools.export_btn": "Pobierz kopię (JSON)",
    "tools.import_file": "Plik kopii do wczytania",
    "tools.mode_add": "Tylko dodaj brakujące wiersze (bezpieczne)",
    "tools.mode_overwrite": "Dodaj i nadpisz istniejące (PIN-ów nie rusza)",
    "tools.import_try": "Sprawdź (próba, bez zapisu)",
    "tools.import_do": "Wykonaj import",
    "nar.need_sql": "Brak funkcji na serwerze — wykonaj sql/24, 25 i 26.",
    "nar.running": "Pracuję…",
    "nar.state_bad": "Wykryto problemy: {n} błędów, {w} ostrzeżeń.",
    "nar.state_warn": "Brak błędów, ale są ostrzeżenia: {n}.",
    "nar.state_ok": "Wszystko w porządku ({n} sprawdzeń).",
    "nar.run_file": "uruchom {plik}",
    "nar.spoj_ok": "Punkty są spójne: obecności zgadzają się z księgą, brak duplikatów i osieroconych wpisów.",
    "nar.spoj_issues": "Rozbieżności: {a}, duplikaty: {b}, osierocone: {c}, ujemne: {d}.",
    "nar.spoj_diff": "Konta, których suma obecności różni się od sumy w księdze",
    "nar.col_att": "Obecności",
    "nar.col_ledger": "Księga",
    "nar.fix_ledger": "Wyrównaj księgę (dopisz wpisy korygujące)",
    "nar.spoj_dupl": "Zdublowane obecności (ta sama osoba, to samo wydarzenie): {n}",
    "nar.fix_dupl": "Usuń duplikaty (zostaje wpis z największą liczbą punktów)",
    "nar.spoj_orphans": "Obecności bez konta lub wydarzenia: {n}",
    "nar.fix_orphans": "Usuń osierocone obecności",
    "nar.spoj_neg": "Ujemne punkty w obecnościach: {n} (sprawdź ręcznie)",
    "nar.fix_confirm": "Wykonać naprawę? Zmiany zapisują się w audycie i można je cofnąć w zakładce Audyt (tam, gdzie to możliwe).",
    "nar.fixed": "Naprawiono wpisów: {n}.",
    "nar.dupl_none": "Nie znaleziono podwójnych kont.",
    "nar.dupl_found": "Grupy podobnych kont: {n}",
    "nar.dupl_pick": "Zaznacz konto, które ma zostać (pozostałe zostaną scalone i dezaktywowane):",
    "nar.merge_btn": "Scal pozostałe do zaznaczonego",
    "nar.merge_nothing": "Nie ma czego scalać (pozostałe konta są nieaktywne lub to konta Admina).",
    "nar.merge_confirm": "Scalić {n} kont(a)? Obecności przejdą na wybrane konto, a pozostałe zostaną dezaktywowane.",
    "nar.merged": "Scalono. Przeniesione obecności: {a}, kolidujące (zostały przy starym koncie): {b}.",
    "nar.lock_all": "Wszystkie Kioski",
    "nar.lock_until_revoked": "do odwołania",
    "nar.unlock": "Zdejmij",
    "nar.lock_none": "Brak blokad.",
    "nar.lock_confirm": "Zablokować: {cel}? Skanowanie i PIN przestaną działać do zdjęcia blokady.",
    "nar.lock_set": "Blokada włączona — Kiosk pokaże komunikat w ciągu kilku sekund.",
    "nar.unlocked": "Blokada zdjęta.",
    "nar.export_hash_warn": "Kopia z haszami PIN-ów jest wrażliwa. Przechowuj ją w bezpiecznym miejscu i nie wysyłaj mailem. Kontynuować?",
    "nar.exported": "Kopia pobrana ({n} wierszy).",
    "nar.import_bad_file": "To nie jest poprawny plik kopii.",
    "nar.import_loaded": "Plik wczytany (tabel: {n}). Użyj „Sprawdź”, zanim wykonasz import.",
    "nar.import_need_file": "Najpierw wybierz plik kopii.",
    "nar.import_confirm": "Wykonać import do bazy? Zalecane: najpierw „Sprawdź (próba)”, a przed importem pobierz aktualną kopię.",
    "nar.import_dry": "Próba zakończona — nic nie zapisano.",
    "nar.import_done": "Import zakończony.",
    "nar.col_table": "Tabela",
    "nar.col_new": "Nowe",
    "nar.col_existing": "Istniejące",
    "nar.col_saved": "Zapisano",
    "ster.btn": "Steruj",
    "ster.title": "Sterowanie Kioskiem: {nazwa}",
    "ster.all": "Wyślij do wszystkich Kiosków ({n})",
    "ster.ping": "Ping",
    "ster.diag": "Pełna diagnostyka",
    "ster.reload": "Odśwież stronę",
    "ster.sync": "Synchronizuj kolejkę",
    "ster.cache_pull": "Pobierz dane offline",
    "ster.cache_clear": "Wyczyść pamięć",
    "ster.update": "Wymuś aktualizację",
    "ster.msg": "Komunikat na ekran",
    "ster.msg_hide": "Schowaj komunikat",
    "ster.lang_pl": "Język: polski",
    "ster.lang_en": "Język: angielski",
    "ster.lang_uk": "Język: ukraiński",
    "ster.test_scanner": "Test czytnika",
    "ster.restart_scanner": "Restart czytnika",
    "ster.test_camera": "Test kamery",
    "ster.lock": "Zablokuj Kiosk",
    "ster.unlock": "Odblokuj Kiosk",
    "ster.no_answer": "Kiosk nie odpowiedział w 25 s (wyłączony, offline albo zamknięta karta).",
    "ster.history": "Ostatnie polecenia",
    "ster.no_history": "Brak poleceń.",
    "ster.confirm_generic": "Wykonać to polecenie na Kiosku?",
    "ster.msg_prompt": "Treść komunikatu na ekranie Kiosku:",
    "ster.msg_seconds": "Na ile sekund (5–3600)?",
    "ster.lock_minutes": "Na ile minut zablokować? (puste = do odwołania)",
    "ster.lock_reason": "Komunikat na ekranie blokady:",
    "ster.lock_reason_default": "Kiosk chwilowo wyłączony",
    "lock.title": "Kiosk chwilowo wyłączony",
    "lock.paper": "Wpisz się na papierowej liście obecności.",
    "lock.until": "Do godz. {czas}",
    "lock.until_revoked": "Do odwołania przez opiekuna",
    "aud.skipped": "Pominięto uszkodzone źródła audytu: {n}",
    "aud.undone": "cofnięto",
    "aud.undo": "Cofnij",
    "aud.col_undo": "Cofnij",
    "aud.undo_confirm": "Cofnąć tę zmianę? ({opis})",
    "aud.undone_ok": "Cofnięto: {opis}",
    "aud.search_ph": "Szukaj (kod, obiekt, treść…) — Enter",
    "aud.c.obecnosci": "Obecności",
    "aud.c.baza": "Baza danych",
    "aud.c.kioski": "Kioski",
    "aud.c.audyt": "Audyt"
});

// ---- dodatki v2.15.07 (zmiana kamery w skanerze, plakietki Księdza) ----
Object.assign(SLOWNIK.pl, {
    'cam.switch': 'Zmień kamerę',
    'cam.switching': 'Przełączam kamerę…',
    'cam.front': 'przednia kamera',
    'cam.back': 'tylna kamera',
    'cam.only_one': 'To urządzenie ma tylko jedną kamerę.',
    'cam.switch_failed': 'Nie udało się przełączyć kamery — działa poprzednia.',
    'bdg.need_sql40': 'Serwer nie ma jeszcze funkcji plakietek dla Księdza. Admin musi uruchomić sql/40_ksiadz_plakietki_v2_15_07.sql.'
});
