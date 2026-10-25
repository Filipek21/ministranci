// ============================================================================
// v2.12.06 — POWIADOMIENIA (potwierdzenia i odrzucenia operacji) — Panel, Kiosk i strona startowa
//
//  • Powiadomienia pojawiają się w PRAWYM DOLNYM rogu. Nowe zawsze trafia na sam dół, a wcześniejsze „unoszą się” do góry.
//  • Naraz widać maksymalnie 3 powiadomienia — czwarte wypycha najstarsze (to z samej góry).
//  • Czas wyświetlania (ani za krótki, ani za długi): sukces/info 4,5 s · ostrzeżenie 6,5 s · odrzucenie/błąd 7,5 s.
//    Najechanie myszą / przytrzymanie palcem wstrzymuje odliczanie; kliknięcie, ✕ lub przesunięcie w prawo zamyka.
//  • Automatycznie obejmuje KAŻDĄ operację wykonywaną przez serwer: wywolajRPC() jest opakowane tak, że po każdej operacji
//    zapisu pojawia się potwierdzenie (✅) albo odrzucenie z powodem (❌). Odczyty tła (ping Kiosku, pobieranie list) są ciche;
//    błędy odczytu (np. brak uprawnień) są pokazywane. Identyczne komunikaty nie mnożą się — dostają licznik „×2”.
//  • Ręcznie: powiadom('ok' | 'err' | 'warn' | 'info', 'Tekst')  oraz  powiadomOk / powiadomBlad / powiadomOstrzezenie / powiadomInfo.
// Niczego nie zapisuje w bazie i nie zmienia wyników funkcji — tylko wyświetla informację.
// ============================================================================
(function () {
    'use strict';

    // ------------------------------------------------------------------ USTAWIENIA ----
    const MAKS = 3;
    const CZAS = { ok: 4500, info: 4500, warn: 6500, err: 7500 };
    const IKONA = { ok: '✅', err: '❌', warn: '⚠️', info: 'ℹ️' };

    // ------------------------------------------------------------------ TŁUMACZENIA ----
    const TX = {
        pl: { done: 'Operacja wykonana', rejected: 'Odrzucono: {op}', rejected_generic: 'Operacja odrzucona', reason: 'powód', offline: 'Brak połączenia z serwerem — operacja nie została wykonana.',
              offline_queue: 'Brak połączenia — zapis trafi do kolejki offline i zostanie wysłany po powrocie sieci.', logged_in: 'Zalogowano', file: 'Plik gotowy do pobrania', pdf: 'PDF zapisany', close: 'Zamknij', server_err: 'Błąd serwera' },
        en: { done: 'Operation completed', rejected: 'Rejected: {op}', rejected_generic: 'Operation rejected', reason: 'reason', offline: 'No connection to the server — the operation was not performed.',
              offline_queue: 'No connection — the entry will be queued offline and sent when the network returns.', logged_in: 'Signed in', file: 'File ready to download', pdf: 'PDF saved', close: 'Close', server_err: 'Server error' },
        uk: { done: 'Операцію виконано', rejected: 'Відхилено: {op}', rejected_generic: 'Операцію відхилено', reason: 'причина', offline: 'Немає зв’язку із сервером — операцію не виконано.',
              offline_queue: 'Немає зв’язку — запис потрапить до офлайн-черги й буде надіслано після відновлення мережі.', logged_in: 'Ви увійшли', file: 'Файл готовий до завантаження', pdf: 'PDF збережено', close: 'Закрити', server_err: 'Помилка сервера' }
    };
    function jezyk() { try { return (typeof jezykBiezacy !== 'undefined' && TX[jezykBiezacy]) ? jezykBiezacy : 'pl'; } catch (e) { return 'pl'; } }
    function tx(k, zm) {
        let s = (TX[jezyk()] || TX.pl)[k]; if (s === undefined) s = TX.pl[k]; if (s === undefined) return k;
        return s.replace(/\{(\w+)\}/g, (_, n) => (zm && zm[n] !== undefined) ? String(zm[n]) : '{' + n + '}');
    }

    // nazwy operacji serwera: [potwierdzenie PL, nazwa operacji PL (do odrzucenia), potwierdzenie EN, nazwa operacji EN]
    const OP = {
        dodaj_wydarzenie: ['Wydarzenie dodane', 'dodanie wydarzenia', 'Event added', 'adding the event'],
        admin_wydarzenie_usun: ['Wydarzenie usunięte', 'usunięcie wydarzenia', 'Event deleted', 'deleting the event'],
        admin_wydarzenie_zmien_nazwe: ['Nazwa wydarzenia zmieniona', 'zmiana nazwy wydarzenia', 'Event renamed', 'renaming the event'],
        admin_dodaj_ministranta: ['Ministrant dodany', 'dodanie ministranta', 'Altar server added', 'adding the altar server'],
        ksiadz_dodaj_ministranta: ['Ministrant dodany', 'dodanie ministranta', 'Altar server added', 'adding the altar server'],
        admin_edytuj_ministranta: ['Dane ministranta zapisane', 'edycja ministranta', 'Altar server saved', 'editing the altar server'],
        ksiadz_edytuj_ministranta: ['Dane ministranta zapisane', 'edycja ministranta', 'Altar server saved', 'editing the altar server'],
        admin_usun_ministranta: ['Konto usunięte', 'usunięcie konta', 'Account deleted', 'deleting the account'],
        admin_przywroc_ministranta: ['Konto przywrócone', 'przywrócenie konta', 'Account restored', 'restoring the account'],
        ksiadz_ustaw_aktywnosc: ['Status konta zmieniony', 'zmiana statusu konta', 'Account status changed', 'changing the account status'],
        admin_ustaw_moderatora: ['Rola konta zmieniona', 'zmiana roli konta', 'Account role changed', 'changing the account role'],
        zmien_pin_audyt: ['PIN zmieniony', 'zmiana PIN-u', 'PIN changed', 'changing the PIN'],
        zmien_pin: ['PIN zmieniony', 'zmiana PIN-u', 'PIN changed', 'changing the PIN'],
        admin_zmien_pin_ministranta: ['PIN ministranta zmieniony', 'zmiana PIN-u ministranta', 'PIN changed', 'changing the PIN'],
        admin_zmien_pin_ministranta_audyt: ['PIN ministranta zmieniony', 'zmiana PIN-u ministranta', 'PIN changed', 'changing the PIN'],
        ksiadz_zmien_pin_ministranta: ['PIN ministranta zmieniony', 'zmiana PIN-u ministranta', 'PIN changed', 'changing the PIN'],
        admin_odblokuj_pin_v2: ['Kod odblokowany', 'odblokowanie kodu', 'Code unblocked', 'unblocking the code'],
        admin_odblokuj_kod: ['Kod odblokowany', 'odblokowanie kodu', 'Code unblocked', 'unblocking the code'],
        admin_generuj_plakietke_audyt: ['Plakietka wygenerowana', 'generowanie plakietki', 'Badge generated', 'generating the badge'],
        admin_generuj_plakietke: ['Plakietka wygenerowana', 'generowanie plakietki', 'Badge generated', 'generating the badge'],
        admin_uniewaznij_plakietke_audyt: ['Plakietka unieważniona', 'unieważnienie plakietki', 'Badge revoked', 'revoking the badge'],
        admin_uniewaznij_plakietke: ['Plakietka unieważniona', 'unieważnienie plakietki', 'Badge revoked', 'revoking the badge'],
        zapisz_obecnosc: ['Obecność zapisana', 'zapis obecności', 'Attendance saved', 'saving the attendance'],
        zglos_obecnosc_specjalna: ['Zgłoszenie wysłane', 'wysłanie zgłoszenia', 'Request sent', 'sending the request'],
        rozpatrz_zgloszenie: ['Zgłoszenie rozpatrzone', 'rozpatrzenie zgłoszenia', 'Request resolved', 'resolving the request'],
        korekta_obecnosci: ['Korekta zapisana', 'korekta obecności', 'Correction saved', 'correcting the attendance'],
        admin_cofnij_obecnosc: ['Obecność cofnięta', 'cofnięcie obecności', 'Attendance reverted', 'reverting the attendance'],
        admin_dodaj_obecnosc_reczna: ['Obecność dodana ręcznie', 'ręczne dodanie obecności', 'Attendance added', 'adding the attendance'],
        admin_punkty_edytuj: ['Punkty zmienione', 'zmiana punktów', 'Points changed', 'changing the points'],
        admin_punkty_dodaj: ['Punkty dodane', 'dodanie punktów', 'Points added', 'adding the points'],
        admin_punkty_usun: ['Wpis punktów usunięty', 'usunięcie punktów', 'Points entry deleted', 'deleting the points'],
        admin_import_listy: ['Lista zaimportowana do systemu', 'import listy', 'List imported', 'importing the list'],
        admin_import_bazy: ['Baza zaimportowana', 'import bazy', 'Database imported', 'importing the database'],
        admin_ustawienia_zapisz: ['Ustawienia zapisane', 'zapis ustawień', 'Settings saved', 'saving the settings'],
        ustaw_kod3: ['Kod 3 ustawiony', 'ustawienie kodu 3', 'Code 3 set', 'setting code 3'],
        admin_kod3_reset: ['Kod 3 zresetowany', 'reset kodu 3', 'Code 3 reset', 'resetting code 3'],
        admin_audyt_cofnij: ['Zmiana cofnięta', 'cofnięcie zmiany', 'Change reverted', 'reverting the change'],
        admin_kiosk_polecenie: ['Polecenie wysłane do Kiosku', 'wysłanie polecenia do Kiosku', 'Command sent to Kiosk', 'sending the command'],
        admin_kiosk_blokada_ustaw: ['Blokada Kiosku włączona', 'włączenie blokady Kiosku', 'Kiosk lock enabled', 'locking the Kiosk'],
        admin_kiosk_blokada_zdejmij: ['Blokada Kiosku zdjęta', 'zdjęcie blokady Kiosku', 'Kiosk lock removed', 'unlocking the Kiosk'],
        admin_nazwij_kiosk: ['Nazwa Kiosku zapisana', 'zmiana nazwy Kiosku', 'Kiosk name saved', 'renaming the Kiosk'],
        admin_usun_kiosk: ['Kiosk usunięty', 'usunięcie Kiosku', 'Kiosk deleted', 'deleting the Kiosk'],
        admin_autoryzuj_kiosk: ['Kiosk autoryzowany', 'autoryzacja Kiosku', 'Kiosk authorized', 'authorizing the Kiosk'],
        admin_wymus_synchronizacje: ['Synchronizacja zlecona', 'zlecenie synchronizacji', 'Sync requested', 'requesting the sync'],
        admin_scal_konta: ['Konta scalone', 'scalenie kont', 'Accounts merged', 'merging the accounts'],
        admin_napraw_spojnosc: ['Spójność punktów naprawiona', 'naprawa spójności punktów', 'Points consistency repaired', 'repairing the points consistency'],
        admin_rodo_anonimizuj: ['Dane zanonimizowane', 'anonimizacja danych', 'Data anonymized', 'anonymizing the data'],
        admin_rodo_wyczysc_logi: ['Logi wyczyszczone', 'czyszczenie logów', 'Logs cleared', 'clearing the logs']
    };

    // RPC wykonywane w tle — nigdy nie pokazują powiadomień
    const CICHE = /^(kiosk_(ping|odpowiedz_ping|pobierz_zadania|polecenia_pobierz|polecenie_wynik|pobierz_cache|zapisz_skan|sprawdz)|pobierz_cache_offline|ustawienia_publiczne|admin_ping|admin_historia_pingow|admin_kiosk_polecenie_status|admin_kiosk_polecenia_historia)/;
    // RPC tylko odczytujące — bez potwierdzenia sukcesu (błędy techniczne nadal są pokazywane)
    const ODCZYT = /(lista|listy_historia|historia|status|stan_|pobierz|moja_|ranking|sprawdz|odczyt|podglad|eksport|ostatnie|rejestr|zdarzenia|duplikat|spojnosc_punktow|raport|statystyk|dashboard|frekwencj|ping)/i;

    // ------------------------------------------------------------------ STYLE (wstrzykiwane — działa w panelu, Kiosku i na stronie startowej) ----
    const CSS = `
    #em-powiadomienia { position: fixed; right: max(12px, env(safe-area-inset-right, 0px)); bottom: max(12px, env(safe-area-inset-bottom, 0px)); z-index: 100000;
        display: flex; flex-direction: column; justify-content: flex-end; align-items: flex-end; gap: 10px; width: min(calc(100vw - 24px), 25rem); pointer-events: none; }
    .em-pow { position: relative; width: 100%; box-sizing: border-box; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px 14px; border-radius: 16px; overflow: hidden;
        background: rgba(36,26,77,0.96); color: #f4f2ff; border: 1px solid rgba(255,255,255,0.14); border-left: 5px solid var(--pow-kolor, #7c5cff);
        box-shadow: 0 14px 38px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.2); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        font-size: .93rem; line-height: 1.35; pointer-events: auto; cursor: pointer; touch-action: pan-y; will-change: transform, opacity;
        animation: em-pow-wejscie .45s cubic-bezier(.34,1.56,.64,1) both; }
    .em-pow.pow-ok { --pow-kolor: #3ddc9a; } .em-pow.pow-err { --pow-kolor: #ff5c7a; } .em-pow.pow-warn { --pow-kolor: #ffb84f; } .em-pow.pow-info { --pow-kolor: #7c5cff; }
    .em-pow .pow-ikona { font-size: 1.25rem; line-height: 1.2; flex: none; animation: em-pow-ikona .6s .15s cubic-bezier(.34,1.56,.64,1) both; }
    .em-pow .pow-tekst { flex: 1; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
    .em-pow .pow-licznik { display: none; margin-left: 6px; padding: 0 7px; border-radius: 999px; background: var(--pow-kolor); color: #0b0a1f; font-weight: 800; font-size: .75rem; vertical-align: 1px; }
    .em-pow.ma-licznik .pow-licznik { display: inline-block; }
    .em-pow .pow-x { flex: none; margin: -4px -6px 0 0; width: 28px; height: 28px; border: none; border-radius: 50%; background: transparent; color: #b7aee0; font-size: 1.05rem; cursor: pointer; transition: background .2s ease, color .2s ease, transform .2s ease; }
    .em-pow .pow-x:hover { background: rgba(255,255,255,0.14); color: #fff; transform: rotate(90deg); }
    .em-pow .pow-pasek { position: absolute; left: 0; bottom: 0; height: 4px; width: 100%; background: var(--pow-kolor); opacity: .85; transform-origin: left; animation: em-pow-pasek var(--pow-czas, 4500ms) linear forwards; }
    .em-pow.pow-wstrzymane .pow-pasek { animation-play-state: paused; }
    .em-pow.pow-pulsuj { animation: em-pow-puls .4s ease; }
    .em-pow.pow-wychodzi { position: fixed; margin: 0; pointer-events: none; animation: em-pow-wyjscie .32s cubic-bezier(.4,0,1,1) forwards; }
    @keyframes em-pow-wejscie { from { opacity: 0; transform: translateX(110%) scale(.92); } to { opacity: 1; transform: none; } }
    @keyframes em-pow-wyjscie { to { opacity: 0; transform: translateX(110%) scale(.94); } }
    @keyframes em-pow-pasek { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @keyframes em-pow-ikona { from { opacity: 0; transform: scale(.2) rotate(-90deg); } to { opacity: 1; transform: none; } }
    @keyframes em-pow-puls { 0%, 100% { transform: none; } 40% { transform: scale(1.04); } }
    @media (max-width: 520px) { #em-powiadomienia { width: calc(100vw - 20px); right: 10px; } }
    @media (prefers-reduced-motion: reduce) {
        .em-pow, .em-pow .pow-ikona, .em-pow .pow-pasek { animation: none !important; }
        .em-pow.pow-wychodzi { animation: none !important; opacity: 0; }
    }`;

    // ------------------------------------------------------------------ SILNIK ----
    const aktywne = [];     // od najstarszego (góra) do najnowszego (dół)
    let kont = null;

    function zapewnij() {
        if (kont && kont.isConnected) return kont;
        if (!document.getElementById('em-pow-css')) {
            const st = document.createElement('style'); st.id = 'em-pow-css'; st.textContent = CSS; (document.head || document.documentElement).appendChild(st);
        }
        kont = document.createElement('div'); kont.id = 'em-powiadomienia'; kont.setAttribute('role', 'region'); kont.setAttribute('aria-live', 'polite'); kont.setAttribute('aria-label', 'Powiadomienia');
        (document.body || document.documentElement).appendChild(kont);
        return kont;
    }

    // FLIP: wykonaj zmianę układu i płynnie przesuń pozostałe powiadomienia z poprzednich pozycji
    function plynnie(zmiana, pomin) {
        const przed = new Map(aktywne.map(p => [p, p.el.getBoundingClientRect().top]));
        zmiana();
        aktywne.forEach(p => {
            if (p === pomin || !przed.has(p) || !p.el.animate) return;
            const dy = przed.get(p) - p.el.getBoundingClientRect().top;
            if (Math.abs(dy) > 1) p.el.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(0)' }], { duration: 340, easing: 'cubic-bezier(.2,.8,.2,1)' });
        });
    }

    function zamknij(p, natychmiast) {
        const i = aktywne.indexOf(p); if (i < 0) return;
        clearTimeout(p.timer);
        plynnie(function () {
            const r = p.el.getBoundingClientRect();
            aktywne.splice(i, 1);
            // wychodzące powiadomienie zostaje „w powietrzu” (fixed) w miejscu, gdzie było — reszta zjeżdża/jedzie płynnie
            p.el.style.left = r.left + 'px'; p.el.style.top = r.top + 'px'; p.el.style.width = r.width + 'px';
            p.el.classList.add('pow-wychodzi');
        });
        setTimeout(function () { p.el.remove(); }, natychmiast ? 320 : 340);
    }

    function uruchomOdliczanie(p, ms) {
        clearTimeout(p.timer); p.start = Date.now(); p.pozostalo = ms;
        p.timer = setTimeout(function () { zamknij(p); }, ms);
    }

    function powiadom(typ, tekst, opcje) {
        typ = IKONA[typ] ? typ : 'info';
        tekst = String(tekst == null ? '' : tekst).trim(); if (!tekst) return null;
        if (tekst.length > 300) tekst = tekst.slice(0, 297) + '…';
        zapewnij();
        const czas = (opcje && opcje.czas) || CZAS[typ];

        // identyczne powiadomienie już widoczne → licznik ×N i odnowienie czasu (zamiast kolejnego okienka)
        const dubel = aktywne.find(p => p.typ === typ && p.tekst === tekst);
        if (dubel) {
            dubel.licznik++; dubel.el.querySelector('.pow-licznik').textContent = '×' + dubel.licznik; dubel.el.classList.add('ma-licznik');
            dubel.el.classList.remove('pow-pulsuj'); void dubel.el.offsetWidth; dubel.el.classList.add('pow-pulsuj');
            const pasek = dubel.el.querySelector('.pow-pasek'); pasek.style.animation = 'none'; void pasek.offsetWidth; pasek.style.animation = '';
            uruchomOdliczanie(dubel, czas);
            return dubel.el;
        }

        const el = document.createElement('div');
        el.className = 'em-pow pow-' + typ; el.setAttribute('role', typ === 'err' ? 'alert' : 'status'); el.style.setProperty('--pow-czas', czas + 'ms');
        el.innerHTML = '<span class="pow-ikona" aria-hidden="true"></span><div class="pow-tekst"><span class="pow-t"></span><span class="pow-licznik">×1</span></div>' +
            '<button type="button" class="pow-x" aria-label=""></button><div class="pow-pasek"></div>';
        el.querySelector('.pow-ikona').textContent = IKONA[typ];
        el.querySelector('.pow-t').textContent = tekst;
        const x = el.querySelector('.pow-x'); x.textContent = '✕'; x.setAttribute('aria-label', tx('close'));
        const p = { el: el, typ: typ, tekst: tekst, licznik: 1, timer: null, start: 0, pozostalo: czas, czasPelny: czas };

        // max 3: najstarsze (z góry) wypychamy, zanim dojdzie nowe
        plynnie(function () {
            while (aktywne.length >= MAKS) zamknij(aktywne[0], true);
            aktywne.push(p); kont.appendChild(el);          // nowe — zawsze na samym dole
        }, p);
        uruchomOdliczanie(p, czas);

        // wstrzymanie odliczania (mysz / dotyk)
        const wstrzymaj = function () { if (p.wstrzymane) return; p.wstrzymane = true; clearTimeout(p.timer); p.pozostalo = Math.max(1200, p.pozostalo - (Date.now() - p.start)); el.classList.add('pow-wstrzymane'); };
        const wznow = function () { if (!p.wstrzymane) return; p.wstrzymane = false; el.classList.remove('pow-wstrzymane'); uruchomOdliczanie(p, p.pozostalo); };
        el.addEventListener('mouseenter', wstrzymaj); el.addEventListener('mouseleave', wznow);
        x.addEventListener('click', function (e) { e.stopPropagation(); zamknij(p); });
        el.addEventListener('click', function () { zamknij(p); });

        // przesunięcie w prawo zamyka (telefon)
        let x0 = null, dx = 0;
        el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; dx = 0; wstrzymaj(); }, { passive: true });
        el.addEventListener('touchmove', function (e) { if (x0 === null) return; dx = Math.max(0, e.touches[0].clientX - x0); el.style.transform = 'translateX(' + dx + 'px)'; el.style.opacity = String(Math.max(0.2, 1 - dx / 220)); }, { passive: true });
        el.addEventListener('touchend', function () {
            if (x0 === null) return; x0 = null;
            if (dx > 70) { el.style.transform = ''; el.style.opacity = ''; zamknij(p); }
            else { el.style.transition = 'transform .25s ease, opacity .25s ease'; el.style.transform = ''; el.style.opacity = ''; setTimeout(function () { el.style.transition = ''; }, 280); wznow(); }
        });
        return el;
    }

    window.powiadom = powiadom;
    window.powiadomOk = function (t2) { return powiadom('ok', t2); };
    window.powiadomBlad = function (t2) { return powiadom('err', t2); };
    window.powiadomOstrzezenie = function (t2) { return powiadom('warn', t2); };
    window.powiadomInfo = function (t2) { return powiadom('info', t2); };
    window.Powiadomienia = { pokaz: powiadom, zamknijWszystkie: function () { aktywne.slice().forEach(function (p) { zamknij(p); }); }, aktywne: aktywne, MAKS: MAKS };

    // ------------------------------------------------------------------ AUTOMATYCZNE POTWIERDZENIA OPERACJI SERWERA ----
    function opis(nazwa) {
        const o = OP[nazwa]; if (!o) return null;
        return jezyk() === 'pl' ? { ok: o[0], op: o[1] } : { ok: o[2], op: o[3] };   // uk → angielskie nazwy operacji (reszta komunikatów po ukraińsku)
    }
    function tekstBledu(w) {
        let b = '';
        try {
            if (typeof blad === 'function') b = blad(w);
            else if (typeof tlumaczBlad === 'function') b = tlumaczBlad(w && w.blad);
        } catch (e) { b = ''; }
        return b || (w && w.blad) || tx('server_err');
    }
    function pkt(n) { try { return (typeof formatPunkty === 'function') ? formatPunkty(n) : String(n); } catch (e) { return String(n); } }

    function obsluz(nazwa, param, w) {
        if (CICHE.test(nazwa)) return;
        const czytanie = ODCZYT.test(nazwa) && !/^(zaloguj|zapisz_obecnosc)/.test(nazwa);
        if (!w || typeof w !== 'object') return;

        if (w.siec) {                                     // brak sieci
            if (/^(zapisz_obecnosc|zglos_obecnosc_specjalna)$/.test(nazwa)) powiadom('warn', tx('offline_queue'));
            else powiadom('warn', tx('offline'));
            return;
        }
        if (w.kod_pg === 'PGRST202' || w.kod_pg === '42883') return;     // brak nowszej funkcji na serwerze — kod ma awaryjną ścieżkę

        const ok = w.sukces !== false;
        const o = opis(nazwa);
        if (ok) {
            if (czytanie) return;
            if (/^zaloguj/.test(nazwa)) { if (param && param.p_zrodlo === 'kiosk') return; powiadom('ok', tx('logged_in')); return; }
            let tekst = o ? o.ok : tx('done');
            if (nazwa === 'zapisz_obecnosc') {
                const imie = w.imie ? ': ' + w.imie : '';
                const pk = (w.punkty_przyznane !== undefined && w.punkty_przyznane !== null) ? ' (+' + pkt(w.punkty_przyznane) + ' pkt)' : '';
                tekst = tekst + imie + pk;
            }
            powiadom('ok', tekst);
        } else {
            if (czytanie && !w.kod_pg) return;            // odczyt z odpowiedzią biznesową — widoczny w samym panelu
            const powod = tekstBledu(w);
            powiadom('err', (o ? tx('rejected', { op: o.op }) : tx('rejected_generic')) + ' — ' + powod);
        }
    }

    function opakujRPC() {
        const orig = window.wywolajRPC;
        if (typeof orig !== 'function' || orig._emPow) return false;
        const nowa = async function (nazwa, param, opcje) {
            const w = await orig.apply(this, arguments);
            try { obsluz(String(nazwa), param, w); } catch (e) { console.error('Powiadomienia:', e); }
            return w;
        };
        nowa._emPow = true; window.wywolajRPC = nowa;
        return true;
    }
    opakujRPC();

    // pobieranie plików i PDF — potwierdzenie
    function opakujPliki() {
        try {
            if (typeof window.pobierzBlob === 'function' && !window.pobierzBlob._emPow) {
                const o = window.pobierzBlob;
                window.pobierzBlob = function () { const r = o.apply(this, arguments); powiadom('ok', tx('file') + (arguments[1] ? ': ' + arguments[1] : '')); return r; };
                window.pobierzBlob._emPow = true;
            }
        } catch (e) { /* ignoruj */ }
        try {
            const J = window.jspdf && window.jspdf.jsPDF;
            if (J && J.prototype && J.prototype.save && !J.prototype.save._emPow) {
                const s = J.prototype.save;
                J.prototype.save = function (nazwa) { const r = s.apply(this, arguments); powiadom('ok', tx('pdf') + (nazwa ? ': ' + nazwa : '')); return r; };
                J.prototype.save._emPow = true;
            }
        } catch (e) { /* ignoruj */ }
    }
    window.addEventListener('load', function () { opakujRPC(); opakujPliki(); });
    document.addEventListener('DOMContentLoaded', function () { zapewnij(); });
})();
