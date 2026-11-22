// Testy v2.15.18: wydajność (kolejka mutacji, timery w ukrytej karcie, SW, budżet rozmiaru) i bezpieczeństwo (nawigacja, hamulec ruchu, CSPRNG).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const G = require('../js/straznik-sieci.js');
const ORIGIN = 'https://parafia.github.io';
const csp = (f) => /Content-Security-Policy" content="([^"]+)"/.exec(czytaj(f))[1];
const HOST_SB = /SUPABASE_URL = 'https:\/\/([^']+)'/.exec(czytaj('js/supabase-client.js'))[1];
const RPC = 'https://' + HOST_SB + '/rest/v1/rpc/x';

function atrapa(opcje = {}) {
    const wyw = [];
    const sluchacze = {};
    const okno = {
        fetch: async (u) => { wyw.push(String(u)); return { ok: true }; },
        navigation: { addEventListener: (t, f) => { sluchacze[t] = f; } },
        console: { warn() {} }
    };
    let czas = 1000;
    const straznik = G.zainstaluj(okno, Object.assign({ csp: csp('kiosk.html'), origin: ORIGIN, baza: ORIGIN + '/kiosk.html', czas: () => czas }, opcje));
    return { okno, straznik, wyw, sluchacze, ustawCzas: (c) => { czas = c; } };
}

test('nawigacja: obce adresy (np. location.href z danymi w query) są anulowane; własne, blob:, mailto: i przeładowanie przechodzą', () => {
    const a = atrapa(); const nav = a.sluchacze.navigate; assert.equal(typeof nav, 'function'); assert.ok(a.straznik.instalacje.includes('nawigacja'));
    const zdarzenie = (url, typ = 'push', anulowalne = true) => { const z = { destination: { url }, navigationType: typ, cancelable: anulowalne, anulowano: false, preventDefault() { this.anulowano = true; } }; nav(z); return z; };
    assert.equal(zdarzenie('https://evil.example/?d=Jan+Kowalski').anulowano, true);
    assert.equal(zdarzenie('http://' + HOST_SB + '/').anulowano, true);               // nawet host bazy: aplikacja nie nawiguje do API
    assert.equal(zdarzenie(ORIGIN + '/app.html').anulowano, false);
    assert.equal(zdarzenie(ORIGIN + '/kiosk.html#sekcja').anulowano, false);
    assert.equal(zdarzenie('blob:' + ORIGIN + '/abc').anulowano, false);
    assert.equal(zdarzenie('mailto:admin@parafia.pl').anulowano, false);
    assert.equal(zdarzenie('https://evil.example/', 'reload').anulowano, false);
    assert.equal(zdarzenie('https://evil.example/', 'push', false).anulowano, false);   // nieanulowalne (np. cofnięcie) — nic nie robimy
    const d = a.straznik.dziennik(); assert.equal(d.length, 2); assert.ok(d.every(w => w.powod === 'nawigacja_zewnetrzna'));
    assert.ok(!JSON.stringify(d).includes('Kowalski'), 'dziennik bez zawartości adresu');
    assert.equal(G.ocenNawigacje('https://evil.example/x', G.utworzPolityke({ csp: csp('kiosk.html'), origin: ORIGIN })).dozwolone, false);
});

test('hamulec ruchu: po przekroczeniu limitu żądań lub bajtów na minutę żądania do bazy są blokowane; okno przesuwa się; CDN i własne nie są liczone', async () => {
    const a = atrapa({ maksZadan: 5, maksBajtow: 1000 });
    for (let i = 0; i < 5; i++) await a.okno.fetch(RPC, { method: 'POST', body: '{}' });
    await assert.rejects(() => a.okno.fetch(RPC, { method: 'POST', body: '{}' }), (e) => e.powod === 'limit_ruchu');
    for (let i = 0; i < 20; i++) await a.okno.fetch('js/wersja.js');                                // własne pliki — bez limitu
    a.ustawCzas(1000 + 61000);
    await a.okno.fetch(RPC, { method: 'POST', body: '{}' });                                        // minuta minęła
    await assert.rejects(() => a.okno.fetch(RPC, { method: 'POST', body: 'x'.repeat(1001) }), (e) => e.powod === 'limit_ruchu');   // bajty
    assert.equal(G.rozmiarCiala('abc'), 3); assert.equal(G.rozmiarCiala(new Uint8Array(7)), 7); assert.equal(G.rozmiarCiala(null), 0);
    assert.ok(G.MAKS_ZADAN_NA_MINUTE >= 1000 && G.MAKS_BAJTOW_NA_MINUTE >= 10 * 1024 * 1024, 'domyślne limity są hojne — nie psują synchronizacji kolejki');
});

test('animacje.js: mutacje są kolejkowane i przetwarzane raz na klatkę, pomijane w ukrytej karcie', () => {
    const t = czytaj('js/animacje.js');
    assert.match(t, /function przetworzZmiany\(zmiany\)/); assert.match(t, /if \(document\.hidden\) return;/);
    assert.match(t, /kolejkaZmian\.push\(z\)/); assert.match(t, /requestAnimationFrame\(\(\) => \{ const paczka = kolejkaZmian;/);
    assert.match(t, /animujLiczbe\(el\)/, 'funkcja animacji liczb nadal istnieje');
});

test('timery odświeżające wygląd/dane nie pracują w ukrytej karcie; blokada bezczynności NIE jest wstrzymywana', () => {
    for (const f of ['js/asystent.js', 'js/kontakt.js']) { const t = czytaj(f); assert.match(t, /setInterval\(\(\) => \{ if \(!document\.hidden\) odswiezWidocznosc\(\); \}, 1000\)/, f); assert.match(t, /visibilitychange', \(\) => \{ if \(!document\.hidden\) odswiezWidocznosc/, f); }
    const k = czytaj('js/app.part11.js'); assert.equal((k.match(/setInterval\(\(\) => \{ if \(!document\.hidden\)/g) || []).length, 2);
    assert.ok(!/document\.hidden/.test(czytaj('js/blokada-bezczynnosci.js').replace(/\/\/.*$/gm, '')), 'licznik bezczynności ma działać także w tle');
});

test('losowość: identyfikator Kiosku z CSPRNG; Math.random tylko w kosmetyce (konfetti) i jitterze opóźnień', () => {
    assert.ok(!/Math\.random/.test(czytaj('js/kiosk.js'))); assert.match(czytaj('js/kiosk.js'), /crypto\.getRandomValues\(new Uint8Array\(12\)\)/);
    for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter(x => x.endsWith('.js') && !/^(i18n|pomoc|pomoc-ai)\.js$/.test(x))) {
        if (/Math\.random/.test(czytaj('js/' + f))) assert.ok(['animacje.js', 'paczki.js'].includes(f), 'Math.random w ' + f);
    }
});

test('service worker: navigation preload, zapis tylko odpowiedzi „basic” bez HTML pod adresem zasobu', () => {
    const sw = czytaj('sw.js');
    assert.match(sw, /navigationPreload\.enable\(\)/); assert.match(sw, /event\.preloadResponse/); assert.match(sw, /sieciPierwsza\(req, cache, event\)/);
    const kod = /function bezpiecznaDoZapisu[\s\S]*?\n\}\n/.exec(sw)[0];
    const f = new Function(kod + '; return bezpiecznaDoZapisu;')();
    const odp = (ok, typ, ct) => ({ ok, type: typ, headers: { get: () => ct } });
    assert.equal(f(null, odp(true, 'basic', 'application/javascript'), false), true);
    assert.equal(f(null, odp(true, 'basic', 'text/html; charset=utf-8'), false), false, 'HTML pod adresem skryptu');
    assert.equal(f(null, odp(true, 'basic', 'text/html'), true), true, 'strony HTML jak dotąd');
    assert.equal(f(null, odp(false, 'basic', 'text/css'), false), false); assert.equal(f(null, odp(true, 'opaque', ''), false), false);
    for (const linia of sw.split('\n').filter(l => /cache\.put\(/.test(l) && !/^\s*(\/\/|\*)/.test(l))) assert.match(linia, /bezpiecznaDoZapisu/, 'zapis bez kontroli: ' + linia.trim());
});

test('budżet wydajności: ścieżka krytyczna stron mieści się w tools/budzet-wydajnosci.json; pomoc i asystent nadal ładowane z opóźnieniem; jedyny zewnętrzny skrypt to supabase-js', async () => {
    const { analizuj, STRONY } = await import('../tools/analiza-wydajnosci.mjs');
    const b = JSON.parse(czytaj('tools/budzet-wydajnosci.json'));
    for (const s of STRONY) {
        const a = analizuj(s);
        assert.ok(a.krytyczne.gz <= b[s].jsKrytycznyGz, s + ' JS gzip ' + a.krytyczne.gz + ' > ' + b[s].jsKrytycznyGz);
        assert.ok(a.css.gz <= b[s].cssGz, s + ' CSS'); assert.ok(a.htmlGz <= b[s].htmlGz, s + ' HTML'); assert.ok(a.skryptyKrytyczne <= b[s].skryptyBlokujace, s + ' liczba skryptów');
        assert.ok(a.zewnetrzne.every(u => /@supabase\/supabase-js@2$/.test(u)), s);
        assert.ok(a.liczbaOpoznionych >= 2, s + ': pomoc/asystent opóźnione');
    }
    assert.match(czytaj('tools/analiza-wydajnosci.mjs'), /--budzet/);
});

test('wersja 2.15.18, raport, narzędzie i test wpięte w npm test', () => {
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.16\.00'/);
    const pk = czytaj('package.json'); assert.match(pk, /tests\/wydajnosc-18\.test\.mjs/); assert.match(pk, /"wydajnosc": "node tools\/analiza-wydajnosci\.mjs --budzet"/);
    assert.ok(fs.existsSync(new URL('../docs/RAPORT_V2.15.18.md', import.meta.url)));
});
