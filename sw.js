// ============================================================================
// Service worker — pozwala uruchomić Kiosk (strona, skrypty, języki, biblioteki) BEZ internetu.
//  • strony HTML: najpierw sieć (max 3 s), a gdy jej brak — wersja zapisana
//  • pliki z "?v=<wersja>" (JS, CSS): NAJPIERW ZAPIS (v2.15.14) — adres zawiera wersję, więc zapis jest
//    zawsze aktualny; powtórne wejścia nie czekają na sieć (to główne przyspieszenie ładowania)
//  • pozostałe własne pliki (ikony, czcionki, manifest): zapis od razu, odświeżany w tle
//  • biblioteki z CDN (supabase-js): najpierw zapis, potem sieć
//  • zapytania do Supabase NIE są cache'owane (offline obsługuje je kolejka w kiosk.js); v2.15.17: żądania do obcych hostów są blokowane (403)
// Nazwa cache zawiera wersję aplikacji — nowa wersja = świeży zestaw plików.
// Do cache trafiają WYŁĄCZNIE udane odpowiedzi (ok) z tego samego pochodzenia — nigdy dane z Supabase.
// ============================================================================
importScripts('js/wersja.js');
const CACHE = 'em-' + WERSJA_APLIKACJI;
const PRZYROSTEK = '?v=' + WERSJA_APLIKACJI;

// Pliki z wersją w adresie (strony dołączają "?v=<wersja>") — zapisywane pod adresem Z wersją.
const WERSJONOWANE = [
    'css/style.css', 'css/czytania.css', 'js/czytania.js', 'js/czytania-ramka.js', 'js/czytania-widget.js',
    'js/ochrona-start.js', 'js/straznik-sieci.js', 'js/kiosk-flagi.js', 'js/wersja.js', 'js/skalowanie.js', 'js/animacje.js', 'js/start.js',
    'js/powiadomienia.js', 'js/kiosk-czuwanie.js', 'js/i18n.js', 'js/i18n-en.js', 'js/i18n-uk.js', 'js/supabase-client.js', 'js/sekrety.js', 'js/prywatnosc.js', 'js/bezpieczny-magazyn.js', 'js/paczki.js',
    'js/lista-poprawki.js', 'js/blokada-bezczynnosci.js', 'js/kiosk.js',
    'js/app.part1.js', 'js/app.part2.js', 'js/app.part3.js', 'js/app.part4.js', 'js/app.part5.js', 'js/app.part6.js', 'js/app.part8.js', 'js/app.part9.js', 'js/app.part10.js', 'js/app.part11.js', 'js/app.part12.js', 'js/app.part13.js',
    'js/kontakt.js', 'js/skaner-kamery.js', 'js/kiosk-sterowanie.js', 'js/pomoc.js', 'js/pdf-plakietki.js', 'js/vendor/qr-local.js'
];
// Pozostałe pliki własne — bez wersji w adresie.
const STALE = [
    './', 'index.html', 'kiosk.html', 'app.html', 'czytania.html', 'manifest.json',
    'fonts/DejaVuSans-sub.ttf', 'fonts/DejaVuSans-Bold-sub.ttf',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'favicon.ico'
];
const LOKALNE = WERSJONOWANE.concat(STALE);   // pełna lista (używają jej testy)
const CDN = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];
// jsPDF i QRCode (panel Admina) NIE są przechwytywane — ładuje je ładowarka w app.part4.js z kilku źródeł;
// wcześniej service worker mógł podać pustą/uszkodzoną odpowiedź z cache i PDF nie działał.

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        const adresy = WERSJONOWANE.map(u => u + PRZYROSTEK).concat(STALE);
        await Promise.allSettled(adresy.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (bezpiecznaDoZapisu(null, r, /\.html$|^\.\/$/.test(u))) return cache.put(u, r); })));
        // v2.15.16: tryb CORS + kontrola `ok` (wcześniej nieprzejrzysta odpowiedź no-cors mogła zapisać stronę błędu CDN na stałe)
        await Promise.allSettled(CDN.map(u => fetch(new Request(u, { mode: 'cors' })).then(r => { if (bezpiecznaDoZapisu(null, r, false)) return cache.put(u, r); })));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nazwy = await caches.keys();
        await Promise.all(nazwy.filter(n => n.startsWith('em-') && n !== CACHE).map(n => caches.delete(n)));
        // v2.15.18: NAVIGATION PRELOAD — żądanie strony rusza równolegle z uruchomieniem service workera (krótszy start przy zimnym SW)
        try { if (self.registration && self.registration.navigationPreload) await self.registration.navigationPreload.enable(); } catch (e) { /* nieobsługiwane — działa po staremu */ }
        await self.clients.claim();
    })());
});

function zTimeoutem(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
    });
}

function jestStrona(req, url) {
    return req.mode === 'navigate' || req.destination === 'document' || /\.html$/.test(url.pathname) || /\/$/.test(url.pathname);
}

// v2.15.18: do pamięci trafia tylko odpowiedź z tego samego pochodzenia (type 'basic'), a pod adresem skryptu/stylu/obrazu nigdy strona HTML
// (np. strona błędu hostingu zwrócona z kodem 200 zatruła by pamięć na stałe). Strony HTML są zapisywane jak dotąd.
function bezpiecznaDoZapisu(req, odp, czyStrona) {
    if (!odp || !odp.ok || odp.type === 'opaque' || odp.type === 'error') return false;
    if (czyStrona) return true;
    const ct = (odp.headers && odp.headers.get('Content-Type')) || '';
    return !/text\/html/i.test(ct);
}

async function sieciPierwsza(req, cache, event) {
    try {
        let odp = null;
        if (event && event.preloadResponse) { try { odp = await zTimeoutem(Promise.resolve(event.preloadResponse), 3000); } catch (e) { odp = null; } }
        if (!odp) odp = await zTimeoutem(fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' }), 3000);
        if (bezpiecznaDoZapisu(req, odp, true)) cache.put(req, odp.clone());
        return odp;
    } catch (e) {
        const zapisana = await cache.match(req, { ignoreSearch: true });
        if (zapisana) return zapisana;
        if (req.mode === 'navigate') { const k = await cache.match('kiosk.html'); if (k) return k; }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

async function zapisPierwszy(req, cache) {
    const zapisana = await cache.match(req);                       // dokładne dopasowanie (z ?v=)
    if (zapisana) return zapisana;
    try {
        const odp = await fetch(req);
        if (bezpiecznaDoZapisu(req, odp, false)) cache.put(req, odp.clone());
        return odp;
    } catch (e) {
        const stara = await cache.match(req, { ignoreSearch: true });
        if (stara) return stara;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
}

async function zapisIOdswiez(req, cache, event) {
    const zapisana = await cache.match(req, { ignoreSearch: true });
    const odswiez = fetch(req, { cache: 'no-cache' }).then(odp => { if (bezpiecznaDoZapisu(req, odp, false)) cache.put(req, odp.clone()); return odp; }).catch(() => null);
    if (zapisana) { event.waitUntil(odswiez); return zapisana; }
    const odp = await odswiez;
    return odp || new Response('Offline', { status: 503, statusText: 'Offline' });
}

// v2.15.17 — STRAŻNIK SIECI W SERWICE WORKERZE (druga, niezależna od skryptów strony warstwa): żądanie do hosta spoza tej listy jest
// zastępowane odpowiedzią 403 i NIGDY nie opuszcza przeglądarki; do hostów CDN dopuszczamy wyłącznie GET/HEAD (CDN nie przyjmuje danych).
// Lista = hosty z CSP stron (test pilnuje zgodności z supabase-client.js i CSP). Nie widzi ruchu WebSocket ani Web Workerów (tam działa CSP).
const HOST_BAZY = 'jwreoglzabawaubjfqse.supabase.co';
const HOSTY_CDN = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'tessdata.projectnaptha.com'];
// v2.16.00: widget „Czytania na dziś” (Niedziela.pl) — ładowany WYŁĄCZNIE w odizolowanej ramce czytania.html; tylko GET/HEAD, nigdy zapisywany w pamięci.
const HOSTY_WIDGET = ['widget.niedziela.pl', 'www.niedziela.pl'];
function odmowaSieci(powod) { return new Response('Zablokowane przez Strażnika Sieci (' + powod + ')', { status: 403, statusText: 'Forbidden', headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }); }

self.addEventListener('fetch', (event) => {
    const req = event.request;
    {
        const u = new URL(req.url);
        if ((u.protocol === 'https:' || u.protocol === 'http:') && u.origin !== self.location.origin) {
            const host = u.hostname.toLowerCase();
            if (host !== HOST_BAZY && !HOSTY_CDN.includes(host) && !HOSTY_WIDGET.includes(host)) { event.respondWith(odmowaSieci('host_poza_lista')); return; }
            if ((HOSTY_CDN.includes(host) || HOSTY_WIDGET.includes(host)) && req.method !== 'GET' && req.method !== 'HEAD') { event.respondWith(odmowaSieci('metoda_dla_cdn')); return; }
        }
    }
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            if (jestStrona(req, url)) return sieciPierwsza(req, cache, event);
            if (url.searchParams.get('v') === WERSJA_APLIKACJI) return zapisPierwszy(req, cache);
            return zapisIOdswiez(req, cache, event);
        })());
        return;
    }

    if (url.hostname === 'cdn.jsdelivr.net' && /supabase-js|bcryptjs/.test(url.pathname)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const zapisana = await cache.match(req.url);
            if (zapisana) return zapisana;
            let odp;
            try { odp = await fetch(new Request(req.url, { mode: 'cors' })); } catch (e) { odp = await fetch(req); }   // v2.15.16: CORS, żeby dało się sprawdzić `ok`
            try { if (bezpiecznaDoZapisu(req, odp, false)) cache.put(req.url, odp.clone()); } catch (e) { /* ignoruj */ }   // błędów CDN nie zapisujemy
            return odp;
        })());
    }
});
