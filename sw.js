// ============================================================================
// Service worker — pozwala uruchomić Kiosk (strona, skrypty, języki, biblioteki) BEZ internetu.
//  • pliki własne: najpierw sieć (max 3 s), a gdy jej brak — wersja zapisana
//  • biblioteki z CDN (supabase-js, bcryptjs, jsPDF, qrcode): najpierw zapis, potem sieć
//  • zapytania do Supabase NIE są przechwytywane (offline obsługuje je kolejka w kiosk.js)
// Nazwa cache zawiera wersję aplikacji — nowa wersja = świeży zestaw plików.
// ============================================================================
importScripts('js/wersja.js');
const CACHE = 'em-' + WERSJA_APLIKACJI;

const LOKALNE = [
    './', 'index.html', 'kiosk.html', 'app.html', 'manifest.json',
    'css/style.css', 'js/wersja.js', 'js/skalowanie.js', 'js/i18n.js', 'js/supabase-client.js', 'js/kiosk.js',
    'js/app.part1.js', 'js/app.part2.js', 'js/app.part3.js', 'js/app.part4.js',
    'fonts/DejaVuSans-sub.ttf', 'fonts/DejaVuSans-Bold-sub.ttf',
    'icons/icon-192.png', 'icons/icon-512.png'
];
const CDN = [
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/dist/bcrypt.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await Promise.allSettled(LOKALNE.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (r.ok) return cache.put(u, r); })));
        await Promise.allSettled(CDN.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => cache.put(u, r))));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nazwy = await caches.keys();
        await Promise.all(nazwy.filter(n => n.startsWith('em-') && n !== CACHE).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

function zTimeoutem(promise, ms) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms);
        promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
    });
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            try {
                const odp = await zTimeoutem(fetch(req, req.mode === 'navigate' ? undefined : { cache: 'no-cache' }), 3000);
                if (odp && odp.ok) cache.put(req, odp.clone());
                return odp;
            } catch (e) {
                const zapisana = await cache.match(req, { ignoreSearch: true });
                if (zapisana) return zapisana;
                if (req.mode === 'navigate') { const k = await cache.match('kiosk.html'); if (k) return k; }
                return new Response('Offline', { status: 503, statusText: 'Offline' });
            }
        })());
        return;
    }

    if (url.hostname === 'cdn.jsdelivr.net') {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const zapisana = await cache.match(req.url);
            if (zapisana) return zapisana;
            const odp = await fetch(req);
            try { cache.put(req.url, odp.clone()); } catch (e) { /* ignoruj */ }
            return odp;
        })());
    }
});
