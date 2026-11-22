// ============================================================================
// STRAŻNIK SIECI (v2.15.17) — druga linia obrony przed wyniesieniem danych (w tym danych osobowych dzieci) do sieci.
//
// Pierwsza linia to CSP (<meta>): przeglądarka sama blokuje połączenia z obcymi hostami. Ten moduł dokłada WARSTWĘ W KODZIE:
//  1) Lista dozwolonych adresów budowana z CSP strony (jedno źródło prawdy) + reguły ŚCIEŻEK dla każdego hosta
//     (strona z pochodzeniem „null”, np. file://, nie ma własnego pochodzenia — działa wtedy tylko CSP):
//     np. cdn.jsdelivr.net tylko dla znanych pakietów (supabase-js, jspdf, qrcode, tesseract.js, jsqr), bez query i z limitem długości
//     (CSP wpuszcza cały host — bez tego skrypt mógłby zakodować dane w ścieżce adresu), Supabase tylko /rest, /functions/asystent,
//     /auth, /realtime. Zablokowane żądania nigdy nie opuszczają przeglądarki.
//  2) Kontrola treści wychodzącej: żądanie zawierające PESEL (11 cyfr z poprawną sumą kontrolną i datą) jest blokowane
//     — system nie zbiera PESEL-i, więc jego obecność w ruchu oznacza błąd lub próbę wycieku.
//  3) Obejmuje fetch, XMLHttpRequest, navigator.sendBeacon, WebSocket, EventSource, window.open oraz dynamiczne <script src>.
//     v2.16.00: + samotest() i podsumuj() — panel Admina (Bezpieczeństwo → „Strażnik sieci — status”) pokazuje, czy strażnik działa.
//     v2.15.18: + NAWIGACJĘ okna (Navigation API, Chromium) oraz HAMULEC RUCHU do bazy (limit żądań i bajtów na minutę).
//  4) Dziennik blokad TYLKO w pamięci i BEZ adresów z query i bez treści (host + powód + czas) — sam dziennik nie może stać się wyciekiem.
//  5) Opakowania są zamrażane (nie da się ich nadpisać zwykłym przypisaniem).
//
// UCZCIWE OGRANICZENIA:
//  • To nie jest granica bezpieczeństwa wobec złośliwego kodu w TEJ SAMEJ stronie (XSS): taki kod nie może jednak wywołać
//    omijającego żądania (CSP nadal obowiązuje), ale może np. zmienić adres strony (nawigacja najwyższego poziomu nie jest
//    blokowana przez <meta> CSP; od v2.15.18 blokuje ją ten moduł, ale TYLKO w przeglądarkach z Navigation API — Firefox/starsze Safari nie) albo użyć dozwolonej funkcji bazy do zapisu danych w WŁASNYM projekcie.
//  • Nie widzi ruchu w Web Workerach (np. Tesseract) — tam obowiązuje CSP. Nie inspekcjonuje danych binarnych (Blob/ArrayBuffer).
//  • Nie wykrywa imion i nazwisk w treści — wykrywa tylko wzorce o jednoznacznej strukturze (PESEL).
//  • Aplikacja musi wysyłać do bazy dane, których potrzebuje (np. obecności) — strażnik tego nie ocenia.
// Czyste funkcje są testowane w Node (tests/straznik-sieci.test.mjs); instalacja w przeglądarce działa na dowolnym obiekcie „okno”.
// ============================================================================
(function (global) {
    'use strict';

    const MAKS_DLUGOSC_ADRESU = 2000;        // dłuższy adres = podejrzenie kodowania danych w URL
    const MAKS_DLUGOSC_ADRESU_SUPABASE = 6000;   // zapytania PostgREST bywają długie (filtry in.(...))
    const MAKS_DZIENNIK = 50;
    const MAKS_SKAN_TRESCI = 2 * 1024 * 1024;    // powyżej tego rozmiaru tekstu nie skanujemy (ochrona wydajności)
    const CISZA_POWIADOMIEN_MS = 60 * 1000;
    // v2.15.18 — HAMULEC RUCHU do bazy: w oknie 60 s dozwolone co najwyżej tyle żądań i bajtów WYSYŁANYCH. Normalna praca (także hurtowa
    // synchronizacja kolejki Kiosku) mieści się z dużym zapasem; hurtowe wyciąganie/zapisywanie przez złośliwy kod zostaje wyhamowane.
    const MAKS_ZADAN_NA_MINUTE = 1500;
    const MAKS_BAJTOW_NA_MINUTE = 20 * 1024 * 1024;

    // Reguły ścieżek dla znanych hostów zewnętrznych (host → wyrażenie dla pathname). Brak reguły = host zabroniony,
    // nawet jeśli wpuszcza go CSP. Tylko GET/HEAD i bez query (patrz ocenAdres).
    const WERSJA_PAKIETU = '[0-9A-Za-z.^~*+-]{1,30}';
    const SUFIKS_SCIEZKI = '(?:/[A-Za-z0-9._@+-]{1,80}){0,8}';
    const REGULY_CDN = {
        'cdn.jsdelivr.net': new RegExp('^/npm/(?:@supabase/supabase-js|jspdf|qrcode|tesseract\\.js|tesseract\\.js-core|jsqr|bcryptjs)@' + WERSJA_PAKIETU + SUFIKS_SCIEZKI + '$'),
        'cdnjs.cloudflare.com': /^\/ajax\/libs\/jspdf\/2\.5\.1\/jspdf\.umd\.min\.js$/,
        'unpkg.com': /^\/(?:jspdf@2\.5\.1\/dist\/jspdf\.umd\.min\.js|qrcode@1\.5\.3\/build\/qrcode\.min\.js)$/,
        'tessdata.projectnaptha.com': /^\/[0-9.]{1,12}(?:_[a-z]{1,10})?\/[A-Za-z_]{2,20}\.traineddata(?:\.gz)?$/
    };
    // Supabase: tylko znane przestrzenie ścieżek (storage/v1 i inne są zablokowane, bo aplikacja z nich nie korzysta).
    const REGULA_SUPABASE = /^\/(?:rest\/v1\/|functions\/v1\/asystent(?:\/|$)|auth\/v1\/|realtime\/v1\/)/;

    // ---------------------------------------------------------------- PESEL ----
    // Poprawny PESEL: 11 cyfr, suma kontrolna wag 1-3-7-9, miesiąc zakodowany wiekiem (01–12, 21–32, 41–52, 61–72, 81–92),
    // dzień zgodny z miesiącem. Dzięki temu losowe 11-cyfrowe numery rzadko dają fałszywy alarm.
    function pesel_poprawny(s) {
        if (typeof s !== 'string' || !/^\d{11}$/.test(s)) return false;
        const d = s.split('').map(Number);
        const wagi = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
        let suma = 0; for (let i = 0; i < 10; i++) suma += d[i] * wagi[i];
        if ((10 - (suma % 10)) % 10 !== d[10]) return false;
        const mm = d[2] * 10 + d[3], dd = d[4] * 10 + d[5];
        const wiek = Math.floor(mm / 20);                 // 0:1900 (mm 1–12) · 1:2000 (21–32) · 2:2100 · 3:2200 · 4:1800
        const miesiac = mm % 20;
        if (miesiac < 1 || miesiac > 12 || wiek > 4) return false;
        const rok = ({ 0: 1900, 1: 2000, 2: 2100, 3: 2200, 4: 1800 })[wiek] + d[0] * 10 + d[1];
        const dni = [31, (rok % 4 === 0 && (rok % 100 !== 0 || rok % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][miesiac - 1];
        return dd >= 1 && dd <= dni;
    }
    // Zwraca liczbę poprawnych PESEL-i w tekście (cyfry otoczone znakami niealfanumerycznymi — UUID i znaczniki czasu nie pasują).
    function policzPesele(tekst) {
        if (typeof tekst !== 'string' || tekst.length === 0) return 0;
        let n = 0; const re = /(?<![0-9A-Za-z])\d{11}(?![0-9A-Za-z])/g; let m;
        while ((m = re.exec(tekst)) !== null) if (pesel_poprawny(m[0])) n++;
        return n;
    }

    // ------------------------------------------------------- polityka adresów ----
    // Buduje politykę z tekstu CSP (connect-src + script-src) i z pochodzenia strony.
    function hostyZCsp(csp) {
        const hosty = new Set();
        String(csp || '').split(';').map(x => x.trim()).filter(Boolean).forEach(dyr => {
            const czesci = dyr.split(/\s+/); const nazwa = czesci[0].toLowerCase();
            if (nazwa !== 'connect-src' && nazwa !== 'script-src') return;
            czesci.slice(1).forEach(zrodlo => {
                const m = /^(?:https?|wss?):\/\/([a-z0-9.-]+)(?::\d+)?(?:\/.*)?$/i.exec(zrodlo);
                if (m && !m[1].includes('*')) hosty.add(m[1].toLowerCase());
            });
        });
        return hosty;
    }
    function utworzPolityke(opcje) {
        const o = opcje || {};
        let origin = ''; try { origin = new URL(o.origin).origin; } catch (e) { origin = ''; }
        return { origin, hosty: hostyZCsp(o.csp) };
    }
    // Host z CSP, który NIE ma reguły CDN, jest traktowany jako serwer bazy (Supabase — także pod własną domeną): obowiązują reguły ścieżek bazy.
    function jestHostemBazy(host) { return !Object.prototype.hasOwnProperty.call(REGULY_CDN, host); }

    // Ocena adresu. Zwraca { dozwolone, powod, host }. „metoda” — metoda HTTP (dla WebSocket/EventSource: 'GET').
    function ocenAdres(adres, metoda, polityka, baza) {
        const pol = polityka || { origin: '', hosty: new Set() };
        let u;
        try { u = new URL(String(adres), baza || pol.origin || undefined); } catch (e) { return { dozwolone: false, powod: 'nieprawidlowy_adres', host: '' }; }
        const m = String(metoda || 'GET').toUpperCase();
        const proto = u.protocol;
        if (proto === 'data:' || proto === 'blob:' || proto === 'about:') return { dozwolone: true, powod: 'lokalny', host: '' };
        if (proto !== 'https:' && proto !== 'wss:' && proto !== 'http:' && proto !== 'ws:') return { dozwolone: false, powod: 'protokol', host: u.host };
        const host = u.hostname.toLowerCase();
        // własne pochodzenie (także http://localhost przy testach lokalnych)
        if (pol.origin && (u.origin === pol.origin || (proto === 'ws:' && ('http://' + u.host) === pol.origin) || (proto === 'wss:' && ('https://' + u.host) === pol.origin))) {
            return { dozwolone: true, powod: 'wlasne', host };
        }
        if (proto === 'http:' || proto === 'ws:') return { dozwolone: false, powod: 'nieszyfrowane', host };
        if (u.username || u.password) return { dozwolone: false, powod: 'dane_w_adresie', host };
        if (u.port && u.port !== '443') return { dozwolone: false, powod: 'port', host };
        if (!pol.hosty.has(host)) return { dozwolone: false, powod: 'host_poza_lista', host };
        if (jestHostemBazy(host)) {
            if (u.href.length > MAKS_DLUGOSC_ADRESU_SUPABASE) return { dozwolone: false, powod: 'adres_zbyt_dlugi', host };
            if (!REGULA_SUPABASE.test(u.pathname)) return { dozwolone: false, powod: 'sciezka_poza_lista', host };
            return { dozwolone: true, powod: 'supabase', host };
        }
        const regula = REGULY_CDN[host];
        if (m !== 'GET' && m !== 'HEAD') return { dozwolone: false, powod: 'metoda_dla_cdn', host };
        if (u.search || u.hash) return { dozwolone: false, powod: 'query_w_adresie_cdn', host };
        if (u.href.length > MAKS_DLUGOSC_ADRESU) return { dozwolone: false, powod: 'adres_zbyt_dlugi', host };
        if (!regula.test(u.pathname)) return { dozwolone: false, powod: 'sciezka_poza_lista', host };
        return { dozwolone: true, powod: 'cdn', host };
    }

    // ------------------------------------------------------- treść wychodząca ----
    // Tekst do przeskanowania z ciała żądania (tylko typy tekstowe; Blob/ArrayBuffer są pomijane).
    function tekstZCiala(cialo) {
        if (cialo == null) return '';
        if (typeof cialo === 'string') return cialo.length > MAKS_SKAN_TRESCI ? cialo.slice(0, MAKS_SKAN_TRESCI) : cialo;
        try {
            if (typeof URLSearchParams !== 'undefined' && cialo instanceof URLSearchParams) return cialo.toString();
            if (typeof FormData !== 'undefined' && cialo instanceof FormData) {
                const c = []; cialo.forEach((v) => { if (typeof v === 'string') c.push(v); }); return c.join('\n');
            }
        } catch (e) { /* ignoruj */ }
        return '';
    }
    // Szacowany rozmiar ciała (bajty/znaki). Blob/ArrayBuffer nie są inspekcjonowane, ale liczone do hamulca ruchu.
    function rozmiarCiala(cialo) {
        if (cialo == null) return 0;
        if (typeof cialo === 'string') return cialo.length;
        try {
            if (typeof cialo.size === 'number') return cialo.size;                       // Blob / File
            if (typeof cialo.byteLength === 'number') return cialo.byteLength;           // ArrayBuffer / widoki
            if (typeof URLSearchParams !== 'undefined' && cialo instanceof URLSearchParams) return cialo.toString().length;
            if (typeof FormData !== 'undefined' && cialo instanceof FormData) { let n = 0; cialo.forEach((v) => { n += (typeof v === 'string') ? v.length : (v && v.size) || 0; }); return n; }
        } catch (e) { /* ignoruj */ }
        return 0;
    }
    // Nawigacja okna (zmiana location, kliknięcie linku, formularz): własne pochodzenie, blob:/about: oraz mailto:/tel:/sms: (wymagają
    // działania użytkownika w innej aplikacji). Wszystko inne to potencjalne wyniesienie danych w adresie (?dane=…) — blokada.
    function ocenNawigacje(adres, polityka, baza) {
        const pol = polityka || { origin: '', hosty: new Set() };
        let u; try { u = new URL(String(adres), baza || pol.origin || undefined); } catch (e) { return { dozwolone: false, powod: 'nieprawidlowy_adres', host: '' }; }
        if (u.protocol === 'blob:' || u.protocol === 'about:') return { dozwolone: true, powod: 'lokalny', host: '' };
        if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') return { dozwolone: true, powod: 'aplikacja_zewnetrzna', host: '' };
        if (pol.origin && u.origin === pol.origin) return { dozwolone: true, powod: 'wlasne', host: u.hostname.toLowerCase() };
        return { dozwolone: false, powod: 'nawigacja_zewnetrzna', host: u.hostname.toLowerCase() };
    }

    // Pełna ocena żądania: adres + treść. Zwraca { dozwolone, powod, host }.
    function ocenZadanie(zad, polityka, baza) {
        const w = ocenAdres(zad.url, zad.metoda, polityka, baza);
        if (!w.dozwolone) return w;
        const tekst = tekstZCiala(zad.cialo) + '\n' + String(zad.url || '');
        if (policzPesele(tekst) > 0) return { dozwolone: false, powod: 'pesel_w_tresci', host: w.host };
        if (w.powod !== 'wlasne' && w.powod !== 'lokalny' && w.powod !== 'supabase' && tekstZCiala(zad.cialo)) {
            return { dozwolone: false, powod: 'tresc_do_hosta_zewnetrznego', host: w.host };   // nigdy nie wysyłamy treści do CDN
        }
        return w;
    }

    // --------------------------------------------------------------- instalacja ----
    // okno — obiekt typu window. opcje: { csp, origin, baza (adres bazowy dla ścieżek względnych), powiadom (funkcja), czas (funkcja zwracająca ms) }
    function zainstaluj(okno, opcje) {
        const o = opcje || {};
        const polityka = utworzPolityke({ csp: o.csp, origin: o.origin });
        const dziennik = [];
        const czas = o.czas || (() => Date.now());
        let ostatniePowiadomienie = -Infinity;
        const sluchacze = [];

        function zglos(w, metoda) {
            const wpis = { kiedy: czas(), host: w.host || '', powod: w.powod, metoda: String(metoda || 'GET').toUpperCase() };   // BEZ adresu, query i treści
            dziennik.push(wpis); if (dziennik.length > MAKS_DZIENNIK) dziennik.shift();
            sluchacze.forEach(f => { try { f(wpis); } catch (e) { /* ignoruj */ } });
            try { if (typeof okno.dispatchEvent === 'function' && typeof okno.CustomEvent === 'function') okno.dispatchEvent(new okno.CustomEvent('em-straznik-blokada', { detail: wpis })); } catch (e) { /* ignoruj */ }
            try { if (okno.console && okno.console.warn) okno.console.warn('Strażnik sieci zablokował żądanie: ' + wpis.powod + (wpis.host ? ' (' + wpis.host + ')' : '')); } catch (e) { /* ignoruj */ }
            if (czas() - ostatniePowiadomienie > CISZA_POWIADOMIEN_MS) {
                ostatniePowiadomienie = czas();
                try {
                    const f = o.powiadom || okno.powiadom;
                    if (typeof f === 'function') {
                        let tekst = 'Strażnik sieci zablokował niedozwolone połączenie.';
                        try { if (typeof okno.t === 'function') { const e = okno.t('net.blocked'); if (e && e !== 'net.blocked') tekst = e; } } catch (e) { /* ignoruj */ }
                        f('err', tekst);
                    }
                } catch (e) { /* ignoruj */ }
            }
        }
        // hamulec ruchu do bazy: okno przesuwne 60 s (liczone tylko żądania dozwolone do hosta bazy)
        const ruch = []; const maksZadan = o.maksZadan || MAKS_ZADAN_NA_MINUTE, maksBajtow = o.maksBajtow || MAKS_BAJTOW_NA_MINUTE;
        function hamulecRuchu(w, cialo) {
            if (w.powod !== 'supabase') return w;
            const t = czas(); while (ruch.length && t - ruch[0].t > 60000) ruch.shift();
            const b = rozmiarCiala(cialo); let suma = 0; for (let i = 0; i < ruch.length; i++) suma += ruch[i].b;
            if (ruch.length >= maksZadan || suma + b > maksBajtow) return { dozwolone: false, powod: 'limit_ruchu', host: w.host };
            ruch.push({ t, b }); return w;
        }
        function sprawdz(url, metoda, cialo) {
            let w = ocenZadanie({ url, metoda, cialo }, polityka, o.baza || o.origin);
            if (w.dozwolone) w = hamulecRuchu(w, cialo);
            if (!w.dozwolone) zglos(w, metoda);
            return w;
        }
        function blad(w) {
            const e = new TypeError('Zablokowano przez Strażnika Sieci (' + w.powod + ')');
            e.straznikSieci = true; e.powod = w.powod; return e;
        }
        function zamroz(cel, nazwa, wartosc) {
            try { Object.defineProperty(cel, nazwa, { value: wartosc, writable: false, configurable: false, enumerable: true }); }
            catch (e) { try { cel[nazwa] = wartosc; } catch (x) { /* ignoruj */ } }
        }

        const instalacje = [];

        // fetch
        if (typeof okno.fetch === 'function') {
            const oryg = okno.fetch.bind(okno);
            const RequestKl = okno.Request;
            const nowy = async function fetch(wejscie, init) {
                let url, metoda, cialo;
                if (RequestKl && wejscie instanceof RequestKl) {
                    url = wejscie.url; metoda = (init && init.method) || wejscie.method; cialo = init && init.body;
                    if (cialo == null && metoda !== 'GET' && metoda !== 'HEAD') { try { cialo = await wejscie.clone().text(); } catch (e) { cialo = ''; } }
                } else {
                    url = (wejscie && typeof wejscie === 'object' && 'href' in wejscie) ? wejscie.href : String(wejscie);
                    metoda = (init && init.method) || 'GET'; cialo = init && init.body;
                }
                const w = sprawdz(url, metoda, cialo);
                if (!w.dozwolone) throw blad(w);
                return oryg(wejscie, init);
            };
            zamroz(okno, 'fetch', nowy); instalacje.push('fetch');
        }

        // XMLHttpRequest
        if (okno.XMLHttpRequest && okno.XMLHttpRequest.prototype) {
            const P = okno.XMLHttpRequest.prototype;
            const stan = new WeakMap();
            const orygOpen = P.open, orygSend = P.send;
            if (typeof orygOpen === 'function' && typeof orygSend === 'function') {
                zamroz(P, 'open', function open(metoda, url) {
                    const w = sprawdz(String(url), metoda, null);
                    if (!w.dozwolone) { const e = new Error('Zablokowano przez Strażnika Sieci (' + w.powod + ')'); e.name = 'NetworkError'; e.straznikSieci = true; throw e; }
                    stan.set(this, { url: String(url), metoda });
                    return orygOpen.apply(this, arguments);
                });
                zamroz(P, 'send', function send(cialo) {
                    const s = stan.get(this);
                    if (s) {
                        const w = sprawdz(s.url, s.metoda, cialo);
                        if (!w.dozwolone) { const e = new Error('Zablokowano przez Strażnika Sieci (' + w.powod + ')'); e.name = 'NetworkError'; e.straznikSieci = true; throw e; }
                    }
                    return orygSend.apply(this, arguments);
                });
                instalacje.push('xhr');
            }
        }

        // sendBeacon
        if (okno.navigator && typeof okno.navigator.sendBeacon === 'function') {
            const nav = okno.navigator; const orygBeacon = nav.sendBeacon.bind(nav);
            const nowy = function sendBeacon(url, dane) {
                const w = sprawdz(String(url), 'POST', dane);
                if (!w.dozwolone) return false;                 // zgodnie ze specyfikacją: false = nie zakolejkowano
                return orygBeacon(url, dane);
            };
            try { Object.defineProperty(nav, 'sendBeacon', { value: nowy, writable: false, configurable: false, enumerable: true }); instalacje.push('beacon'); }
            catch (e) { try { Object.getPrototypeOf(nav).sendBeacon = nowy; instalacje.push('beacon'); } catch (x) { /* ignoruj */ } }
        }

        // WebSocket i EventSource — Proxy zachowuje stałe i prototyp
        ['WebSocket', 'EventSource'].forEach((nazwa) => {
            const Oryg = okno[nazwa];
            if (typeof Oryg !== 'function') return;
            const Proxy_ = new Proxy(Oryg, {
                construct(cel, args, nowyCel) {
                    const w = sprawdz(String(args[0]), 'GET', null);
                    if (!w.dozwolone) { const e = new Error('Zablokowano przez Strażnika Sieci (' + w.powod + ')'); e.name = 'SecurityError'; e.straznikSieci = true; throw e; }
                    return Reflect.construct(cel, args, nowyCel === Proxy_ ? cel : nowyCel);
                }
            });
            zamroz(okno, nazwa, Proxy_); instalacje.push(nazwa.toLowerCase());
        });

        // window.open: puste okno (a potem blob:) i własne strony są dozwolone; reszta tylko z listy
        if (typeof okno.open === 'function') {
            const orygOpen = okno.open.bind(okno);
            const nowy = function open(url) {
                if (url !== undefined && url !== null && String(url) !== '') {
                    const w = sprawdz(String(url), 'GET', null);
                    if (!w.dozwolone) return null;
                }
                return orygOpen.apply(okno, arguments);
            };
            zamroz(okno, 'open', nowy); instalacje.push('open');
        }

        // NAWIGACJA (Navigation API — Chromium: Chrome/Edge/Opera, nowsze Safari): zdarzenie „navigate” jest anulowalne dla przejść
        // inicjowanych skryptem/linkiem/formularzem. Zamyka drogę „location.href = 'https://obcy/?dane=…'”, której <meta> CSP nie blokuje.
        try {
            const nav = okno.navigation;
            if (nav && typeof nav.addEventListener === 'function') {
                nav.addEventListener('navigate', (e) => {
                    try {
                        if (!e || !e.cancelable || e.navigationType === 'reload' || e.navigationType === 'traverse') return;
                        const w = ocenNawigacje(e.destination && e.destination.url, polityka, o.baza || o.origin);
                        if (!w.dozwolone) { e.preventDefault(); zglos(w, 'GET'); }
                    } catch (x) { /* nie blokujemy nawigacji przy błędzie oceny */ }
                });
                instalacje.push('nawigacja');
            }
        } catch (e) { /* brak Navigation API — pozostaje CSP */ }

        // dynamiczne <script src> (ładowarki PDF/QR/OCR/skaner): adres sprawdzany PRZED ustawieniem
        try {
            const S = okno.HTMLScriptElement && okno.HTMLScriptElement.prototype;
            const opis = S && Object.getOwnPropertyDescriptor(S, 'src');
            if (S && opis && typeof opis.set === 'function') {
                const odrzuc = (el) => { try { setTimeout(() => { try { el.dispatchEvent(new okno.Event('error')); } catch (e) { /* ignoruj */ } }, 0); } catch (e) { /* ignoruj */ } };
                Object.defineProperty(S, 'src', {
                    configurable: false, enumerable: opis.enumerable,
                    get: opis.get,
                    set: function (v) { const w = sprawdz(String(v), 'GET', null); if (!w.dozwolone) { odrzuc(this); return; } opis.set.call(this, v); }
                });
                const orygSet = okno.Element && okno.Element.prototype && okno.Element.prototype.setAttribute;
                if (typeof orygSet === 'function') {
                    Object.defineProperty(okno.Element.prototype, 'setAttribute', {
                        configurable: false, writable: false, enumerable: true,
                        value: function setAttribute(nazwa, wartosc) {
                            if (this && this.tagName === 'SCRIPT' && String(nazwa).toLowerCase() === 'src') {
                                const w = sprawdz(String(wartosc), 'GET', null); if (!w.dozwolone) { odrzuc(this); return; }
                            }
                            return orygSet.apply(this, arguments);
                        }
                    });
                }
                instalacje.push('script');
            }
        } catch (e) { /* przeglądarka nie pozwala — CSP nadal obowiązuje */ }

        const api = {
            polityka, instalacje,
            dziennik: () => dziennik.slice(),
            liczbaBlokad: () => dziennik.length,
            nasluchuj: (f) => { if (typeof f === 'function') sluchacze.push(f); },
            ocen: (url, metoda, cialo) => ocenZadanie({ url, metoda, cialo }, polityka, o.baza || o.origin)
        };
        return Object.freeze(api);
    }

    // v2.16.00 — DIAGNOSTYKA: czy strażnik naprawdę działa w tej przeglądarce? samotest próbuje połączyć się z nieistniejącym obcym hostem
    // (domena .invalid nigdy nie istnieje) przez fetch i sendBeacon. Zaliczony = oba żądania zatrzymał STRAŻNIK (znacznik straznikSieci
    // w błędzie i wpisy w dzienniku blokad), a nie sama przeglądarka/CSP. Nic nie opuszcza przeglądarki — żądania są blokowane przed wysłaniem.
    async function samotest(okno, wnetrze) {
        const wynik = { fetch: 'brak', beacon: 'brak', ok: false };
        const przed = wnetrze && typeof wnetrze.liczbaBlokad === 'function' ? wnetrze.liczbaBlokad() : 0;
        try { await okno.fetch('https://straznik-test.invalid/test'); wynik.fetch = 'PRZESZEDL'; }
        catch (e) { wynik.fetch = (e && e.straznikSieci === true) ? 'zablokowany_przez_straznika' : 'zablokowany_inaczej'; }
        const poFetch = wnetrze && typeof wnetrze.liczbaBlokad === 'function' ? wnetrze.liczbaBlokad() : 0;
        try {
            const r = okno.navigator && typeof okno.navigator.sendBeacon === 'function' ? okno.navigator.sendBeacon('https://straznik-test.invalid/beacon', 'x') : null;
            const poBeacon = wnetrze && typeof wnetrze.liczbaBlokad === 'function' ? wnetrze.liczbaBlokad() : 0;
            wynik.beacon = (r === false && poBeacon > poFetch) ? 'zablokowany_przez_straznika' : (r === true ? 'PRZESZEDL' : 'zablokowany_inaczej');
        } catch (e) { wynik.beacon = 'zablokowany_inaczej'; }
        wynik.ok = wynik.fetch === 'zablokowany_przez_straznika' && wynik.beacon === 'zablokowany_przez_straznika' && poFetch > przed;
        return wynik;
    }
    // Podsumowanie do panelu Admina: aktywność, chronione kanały, liczba blokad i 10 ostatnich (host, powód, czas — bez adresów i treści).
    function podsumuj(wnetrze) {
        if (!wnetrze) return { aktywny: false, kanaly: [], liczba: 0, ostatnie: [] };
        return { aktywny: true, kanaly: wnetrze.instalacje.slice(), liczba: wnetrze.liczbaBlokad(), ostatnie: wnetrze.dziennik().slice(-10).reverse() };
    }

    const API = Object.freeze({ samotest, podsumuj, pesel_poprawny, policzPesele, hostyZCsp, utworzPolityke, ocenAdres, ocenZadanie, ocenNawigacje, rozmiarCiala, tekstZCiala, zainstaluj, REGULY_CDN, REGULA_SUPABASE, MAKS_DLUGOSC_ADRESU, MAKS_ZADAN_NA_MINUTE, MAKS_BAJTOW_NA_MINUTE });
    if (typeof module !== 'undefined' && module.exports) module.exports = API;

    if (typeof window !== 'undefined' && typeof document !== 'undefined' && global === window) {
        try {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            const wnetrze = zainstaluj(window, { csp: meta ? meta.getAttribute('content') : '', origin: window.location.origin, baza: document.baseURI });
            global.EMStraznikSieci = Object.freeze(Object.assign({}, API, { aktywny: wnetrze, samotestTutaj: () => samotest(window, wnetrze) }));
        } catch (e) { try { console.warn('Strażnik sieci: nie uruchomiono (' + (e && e.name) + ') — działa tylko CSP.'); } catch (x) { /* ignoruj */ } }
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
