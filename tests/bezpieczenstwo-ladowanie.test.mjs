// Testy v2.15.16: szybsze ładowanie (statyczne tagi, opóźniona pomoc, service worker) i zabezpieczenia
// (CSP bez inline, szyfrowany magazyn sekretów, redagowanie logów, token Kiosku poza jawnym localStorage).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const istnieje = (p) => fs.existsSync(new URL('../' + p, import.meta.url));
const STRONY = ['index.html', 'app.html', 'kiosk.html'];
const WERSJA = /WERSJA_APLIKACJI = '([\d.]+)'/.exec(czytaj('js/wersja.js'))[1];
const S = require('../js/sekrety.js');
const O = require('../js/ochrona-start.js');

const tagiSkryptow = (h) => [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(m => ({ attrs: m[1], tresc: m[2], src: (/src="([^"]+)"/.exec(m[1]) || [])[1] }));

// ---------------- ładowanie ----------------
test('strony nie używają document.write ani skryptów inline (statyczne tagi → równoległe pobieranie + CSP bez unsafe-inline)', () => {
    for (const f of STRONY) {
        const h = czytaj(f);
        assert.ok(!/document\.write/.test(h), f + ': document.write');
        for (const s of tagiSkryptow(h)) { assert.ok(s.src, f + ': skrypt inline: ' + s.tresc.slice(0, 40)); assert.equal(s.tresc.trim(), '', f + ': skrypt z src ma treść'); }
        assert.ok(!/\son[a-z]+\s*=/i.test(h.replace(/data-[a-z-]+="[^"]*"/g, '')), f + ': atrybut zdarzenia inline');
    }
});

test('wszystkie własne adresy ?v= mają bieżącą wersję, a pliki istnieją', () => {
    for (const f of STRONY) {
        const h = czytaj(f);
        for (const m of h.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)(\?v=([\d.]+))?"/g)) {
            assert.ok(istnieje(m[1]), f + ': brak pliku ' + m[1]);
            assert.equal(m[3], WERSJA, f + ': zła wersja przy ' + m[1]);
        }
    }
});

test('kolejność ładowania zachowana: ochrona → wersja → i18n → klient Supabase → logika; sekrety i magazyn przed kioskiem', () => {
    const poz = (h, s) => { const i = tagiSkryptow(h).findIndex(x => x.src && x.src.includes(s)); assert.ok(i >= 0, 'brak ' + s); return i; };   // pozycja wśród znaczników <script> (komentarze HTML nie mylą)
    for (const f of STRONY) { const h = czytaj(f); assert.ok(poz(h, 'js/ochrona-start.js') < poz(h, 'js/wersja.js'), f); }
    const k = czytaj('kiosk.html');
    assert.ok(poz(k, 'js/kiosk-flagi.js') < poz(k, 'js/i18n.js'));
    const ord = ['supabase-js@2', 'js/i18n.js', 'js/supabase-client.js', 'js/sekrety.js', 'js/bezpieczny-magazyn.js', 'js/paczki.js', 'js/powiadomienia.js', 'js/kiosk.js', 'js/skaner-kamery.js', 'js/kiosk-sterowanie.js', 'js/kiosk-czuwanie.js', 'js/kontakt.js', 'js/start.js'];
    for (let i = 1; i < ord.length; i++) assert.ok(poz(k, ord[i - 1]) < poz(k, ord[i]), 'kiosk: ' + ord[i - 1] + ' przed ' + ord[i]);
    const a = czytaj('app.html');
    const czesci = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13].map(n => 'js/app.part' + n + '.js');
    const ordA = ['supabase-js@2', 'js/i18n.js', 'js/supabase-client.js', 'js/powiadomienia.js', 'js/vendor/qr-local.js', 'js/pdf-plakietki.js', 'js/blokada-bezczynnosci.js', ...czesci, 'js/kontakt.js', 'js/lista-poprawki.js', 'js/start.js'];
    for (let i = 1; i < ordA.length; i++) assert.ok(poz(a, ordA[i - 1]) < poz(a, ordA[i]), 'panel: ' + ordA[i - 1] + ' przed ' + ordA[i]);
});

test('żaden skrypt nie zniknął: pomoc jest ładowana po starcie (w tej samej kolejności), reszta statycznie', () => {
    const opozn = (f) => (/data-opoznione="([^"]+)"/.exec(czytaj(f)) || [, ''])[1].split(/\s+/);
    assert.deepEqual(opozn('index.html'), ['js/pomoc.js']);
    assert.deepEqual(opozn('kiosk.html'), ['js/pomoc.js']);
    assert.deepEqual(opozn('app.html'), ['js/pomoc.js']);
    for (const f of STRONY) for (const p of opozn(f)) assert.ok(istnieje(p), p);
    const s = czytaj('js/start.js');
    assert.match(s, /async = false/);               // zachowanie kolejności wykonania dołączanych skryptów
    assert.match(s, /requestIdleCallback/);
    assert.match(s, /ustawNumerWersji/);
});

test('jsPDF i QRCode nie blokują już startu panelu — ładowarka z app.part4.js dociąga je przy pierwszym użyciu', () => {
    const a = czytaj('app.html');
    assert.ok(tagiSkryptow(a).every(s => !/jspdf|qrcode\.min/.test(s.src || '')));   // (adresy w CSP są dozwolone — to tylko lista dopuszczonych źródeł)
    const p4 = czytaj('js/app.part4.js');
    assert.match(p4, /zapewnijBibliotekiPdf/); assert.match(p4, /jspdf@2\.5\.1/); assert.match(p4, /qrcode@1\.5\.3/);
});

test('service worker: każdy skrypt ze stron jest w pamięci podręcznej; pliki z ?v= są zapisywane najpierw', () => {
    const sw = czytaj('sw.js');
    const lista = [...sw.matchAll(/'((?:js|css)\/[^']+)'/g)].map(m => m[1]);
    const dolaczone = new Set();
    for (const f of STRONY) {
        const h = czytaj(f);
        for (const m of h.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)/g)) dolaczone.add(m[1]);
        const op = (/data-opoznione="([^"]+)"/.exec(h) || [, ''])[1].split(/\s+/).filter(Boolean); op.forEach(x => dolaczone.add(x));
    }
    for (const p of dolaczone) assert.ok(lista.includes(p), 'sw.js nie zapisuje ' + p);
    assert.match(sw, /zapisPierwszy/); assert.match(sw, /searchParams\.get\('v'\) === WERSJA_APLIKACJI/);
    assert.match(sw, /sieciPierwsza/);              // HTML nadal najpierw z sieci
    assert.match(sw, /if \((?:odp && odp\.ok|bezpiecznaDoZapisu\(req, odp, (?:true|false)\))\) cache\.put/);   // do cache tylko udane odpowiedzi
    assert.ok(!/supabase\.co/.test(sw.replace(/const HOST_BAZY = '[^']+';/, '')), 'zapytania do Supabase nie są przechwytywane ani zapisywane (host występuje tylko na liście dozwolonych — v2.15.17)');
});

// ---------------- CSP ----------------
test('CSP: bez unsafe-eval i unsafe-inline dla skryptów; connect-src tylko własne źródło i DOKŁADNY host Supabase z supabase-client.js', () => {
    const hostSb = /SUPABASE_URL = 'https:\/\/([^']+)'/.exec(czytaj('js/supabase-client.js'))[1];
    for (const f of STRONY) {
        const csp = /Content-Security-Policy" content="([^"]+)"/.exec(czytaj(f))[1];
        const dyr = Object.fromEntries(csp.split(';').map(x => x.trim()).filter(Boolean).map(x => { const [n, ...r] = x.split(/\s+/); return [n, r]; }));
        assert.deepEqual(dyr['default-src'], ["'self'"], f);
        assert.ok(!dyr['script-src'].includes("'unsafe-inline'") && !dyr['script-src'].includes("'unsafe-eval'"), f);
        assert.ok(dyr['connect-src'].every(x => !x.includes('*')), f + ': connect-src bez wieloznaczników (blokuje wyniesienie danych do cudzego projektu Supabase)');
        if (f !== 'index.html') assert.ok(dyr['connect-src'].includes('https://' + hostSb) && dyr['connect-src'].includes('wss://' + hostSb), f + ': host Supabase musi być zgodny z supabase-client.js');
        for (const x of dyr['connect-src']) assert.ok(x === "'self'" || x.includes(hostSb) || ['https://cdn.jsdelivr.net', 'https://tessdata.projectnaptha.com'].includes(x), f + ': ' + x);
        assert.deepEqual(dyr['object-src'], ["'none'"]); assert.deepEqual(dyr['base-uri'], ["'self'"]); assert.deepEqual(dyr['form-action'], ["'self'"]); assert.deepEqual(dyr['frame-src'], f === 'kiosk.html' ? ["'none'"] : ["'self'"]);   // v2.16.02: index/app osadzają WYŁĄCZNIE własną stronę czytania.html (ramka sandbox); Kiosk bez ramek
    }
    const sk = (f) => /script-src ([^;]+)/.exec(czytaj(f))[1].split(/\s+/);
    assert.deepEqual(sk('index.html'), ["'self'"]);                                           // strona startowa: zero zewnętrznych skryptów
    assert.ok(!sk('kiosk.html').includes("'wasm-unsafe-eval'") && !/unpkg|cdnjs/.test(sk('kiosk.html').join(' ')), 'Kiosk nie potrzebuje WASM ani zapasowych CDN');
    for (const x of sk('app.html')) assert.ok(["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'].includes(x) || /^https:\/\/(cdnjs\.cloudflare\.com|unpkg\.com)\/.+\.js$/.test(x), 'app: ' + x);   // zapasowe CDN tylko jako dokładne adresy plików
});

// ---------------- sekrety ----------------
const nowy = (extra) => { const adapter = new S.MemAdapter(); const ls = new Map(); const lsObj = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) }; return { adapter, ls, s: S.utworz({ adapter, crypto: webcrypto, ls: lsObj, ...extra }) }; };

test('sekrety: zapis → odczyt; w magazynie jest tylko szyfrogram, bez jawnej wartości', async () => {
    const { s, adapter } = nowy(); await s.gotowe;
    assert.equal(s.tryb(), 'szyfrowany');
    assert.equal(await s.ustaw('kiosk_token', 'TAJNY-TOKEN-123'), true);
    assert.equal(s.pobierz('kiosk_token'), 'TAJNY-TOKEN-123');
    const rek = await adapter.get('dane', 'kiosk_token');
    assert.ok(rek.ct && rek.iv && rek.v === 1); assert.ok(!JSON.stringify(rek).includes('TAJNY-TOKEN-123'));
    const klucz = await adapter.get('klucz', 'glowny'); assert.equal(klucz.extractable, false);   // klucz niewyeksportowalny
});

test('sekrety: po restarcie (nowa instancja, ten sam magazyn) token wraca, a jawnej kopii w localStorage nie ma', async () => {
    const a = nowy(); await a.s.gotowe; await a.s.ustaw('kiosk_token', 'T1');
    const s2 = S.utworz({ adapter: a.adapter, crypto: webcrypto, ls: { getItem: () => null, setItem() {}, removeItem() {} } }); await s2.gotowe;
    assert.equal(s2.pobierz('kiosk_token'), 'T1'); assert.equal(a.ls.has('em_kiosk_token'), false);
});

test('sekrety: migracja jawnego tokenu z localStorage — kasowany dopiero po zaszyfrowaniu i weryfikacji', async () => {
    const adapter = new S.MemAdapter(); const ls = new Map([['em_kiosk_token', 'STARY-JAWNY']]);
    const lsObj = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: (k) => ls.delete(k) };
    const s = S.utworz({ adapter, crypto: webcrypto, ls: lsObj });
    assert.equal(s.pobierz('kiosk_token'), 'STARY-JAWNY');          // przed startem działa jak dotąd (brak regresji)
    await s.gotowe;
    assert.equal(s.pobierz('kiosk_token'), 'STARY-JAWNY'); assert.equal(ls.has('em_kiosk_token'), false);
    assert.ok(await adapter.get('dane', 'kiosk_token'));
});

test('sekrety: błąd zapisu szyfrowanego NIE kasuje jawnego tokenu (brak utraty dostępu)', async () => {
    const adapter = new S.MemAdapter(); const ls = new Map([['em_kiosk_token', 'ZOSTAJE']]);
    const put = adapter.put.bind(adapter); adapter.put = async (st, k, v) => { if (st === 'dane') throw new Error('quota'); return put(st, k, v); };
    const s = S.utworz({ adapter, crypto: webcrypto, ls: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: (k) => ls.delete(k) } });
    await s.gotowe;
    assert.equal(s.tryb(), 'localStorage'); assert.equal(ls.get('em_kiosk_token'), 'ZOSTAJE'); assert.equal(s.pobierz('kiosk_token'), 'ZOSTAJE');
});

test('sekrety: podmieniony szyfrogram i rekord przeniesiony pod inną nazwę są odrzucane (AAD, GCM)', async () => {
    const a = nowy(); await a.s.gotowe; await a.s.ustaw('kiosk_token', 'T1');
    const rek = await a.adapter.get('dane', 'kiosk_token');
    const zepsuty = { ...rek, ct: rek.ct.slice(0, -4) + (rek.ct.endsWith('AAAA') ? 'BBBB' : 'AAAA') };
    await a.adapter.put('dane', 'kiosk_token', zepsuty);
    const s2 = S.utworz({ adapter: a.adapter, crypto: webcrypto, ls: null }); await s2.gotowe;
    assert.equal(s2.pobierz('kiosk_token'), null);                 // uszkodzony rekord nie jest udostępniany…
    assert.ok(await a.adapter.get('dane', 'kiosk_token'));         // …i nie jest po cichu kasowany
    await a.adapter.put('dane', 'inny_sekret', rek);                // ten sam szyfrogram pod inną nazwą
    const s3 = S.utworz({ adapter: a.adapter, crypto: webcrypto, ls: null }); await s3.gotowe;
    assert.equal(s3.pobierz('inny_sekret'), null);
});

test('sekrety: usuń kasuje z pamięci, magazynu i localStorage; walidacja nazw i wartości', async () => {
    const a = nowy(); await a.s.gotowe; await a.s.ustaw('kiosk_token', 'T1'); await a.s.usun('kiosk_token');
    assert.equal(a.s.pobierz('kiosk_token'), null); assert.equal(await a.adapter.get('dane', 'kiosk_token'), null);
    assert.throws(() => a.s.pobierz('../zle'), /nazwa/i); assert.throws(() => a.s.pobierz('Wielkie'), /nazwa/i);
    assert.throws(() => a.s.ustaw('kiosk_token', ''), /wartość/i); assert.throws(() => a.s.ustaw('kiosk_token', 'x'.repeat(5000)), /wartość/i);
});

test('sekrety: bez WebCrypto/IndexedDB moduł działa jak dawniej (localStorage) i zgłasza tryb', async () => {
    const ls = new Map(); const s = S.utworz({ adapter: null, crypto: null, ls: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, v), removeItem: (k) => ls.delete(k) } });
    await s.gotowe; assert.equal(s.tryb(), 'localStorage'); await s.ustaw('kiosk_token', 'T'); assert.equal(s.pobierz('kiosk_token'), 'T'); assert.equal(ls.get('em_kiosk_token'), 'T');
});

test('token Kiosku nie jest już czytany ani zapisywany jawnie w localStorage w kiosk.js i kontakt.js', () => {
    const bezKomentarzy = (t) => t.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    const k = bezKomentarzy(czytaj('js/kiosk.js'));
    assert.ok(!/localStorage\.(get|set|remove)Item\(KLUCZ_TOKEN_KIOSKU(?!\) ?\}? ?catch)/.test(k.replace(/function odczytajTokenKiosku[^\n]+/, '')));
    assert.match(k, /EMSekrety\.ustaw\('kiosk_token'/); assert.match(k, /EMSekrety\.usun\('kiosk_token'\)/);
    assert.match(bezKomentarzy(czytaj('js/kontakt.js')), /EMSekrety\.pobierz\('kiosk_token'\)/);
    assert.match(czytaj('kiosk.html'), /js\/sekrety\.js/);
});

// ---------------- redagowanie logów ----------------
test('ochrona logów: PIN-y, tokeny, JWT i nagłówki są zasłaniane, zwykłe pola zostają', () => {
    const w = O.zredaguj({ p_kod: 'MIN-001', p_pin: '1234', p_pin_admina: '9999', token: 'abc', x: { authorization: 'Bearer zzzzzzzzzzzz', ok: 1 }, lista: [{ pin: '0000', imie: 'Jan' }] });
    assert.equal(w.p_kod, 'MIN-001'); assert.equal(w.p_pin, O.MASKA); assert.equal(w.p_pin_admina, O.MASKA); assert.equal(w.token, O.MASKA);
    assert.equal(w.x.authorization, O.MASKA); assert.equal(w.x.ok, 1); assert.equal(w.lista[0].pin, O.MASKA); assert.equal(w.lista[0].imie, 'Jan');
    assert.equal(O.zredagujTekst('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.abcdefghijklmnop'), O.MASKA);
    assert.match(O.zredagujTekst('rpc p_pin=4821 kod=1'), /p_pin=\[ukryte\]/);
});

test('ochrona logów: cykle, błędy i obiekty nie-zwykłe (DOM, Map) nie psują logowania', () => {
    const a = { n: 1 }; a.sam = a; assert.equal(O.zredaguj(a).sam, '[cykl]');
    const e = new Error('zły p_pin: 1234'); assert.match(String(O.zredaguj(e)), /\[ukryte\]/);
    const e2 = new Error('zwykły'); assert.equal(O.zredaguj(e2), e2);
    const m = new Map([['pin', '1']]); assert.equal(O.zredaguj(m), m);
    assert.equal(O.zredaguj(null), null); assert.equal(O.zredaguj(7), 7);
});

test('ochrona logów: console.* działa po opakowaniu, ale sekret nie dociera do oryginału', () => {
    const wywolania = []; const konsola = { log: (...a) => wywolania.push(a), warn: (...a) => wywolania.push(a), error() {}, info() {}, debug() {}, trace() {} };
    O.zabezpieczKonsole(konsola); konsola.log('rpc', { p_pin: '4821', p_kod: 'M1' }); konsola.warn('SW:', 'ok');
    assert.deepEqual(wywolania[0], ['rpc', { p_pin: O.MASKA, p_kod: 'M1' }]); assert.deepEqual(wywolania[1], ['SW:', 'ok']);
    O.zabezpieczKonsole(konsola); konsola.log({ pin: '1' }); assert.equal(wywolania.length, 3);   // brak podwójnego opakowania
});

test('ochrona przed obcą ramką: zasłania stronę tylko, gdy nadrzędne okno jest z innej domeny', () => {
    const doc = { documentElement: { style: { setProperty(k, v) { this[k] = v; } } } };
    const obce = { document: doc, self: null, get top() { return { get location() { throw new Error('cross-origin'); } }; } }; obce.self = {};
    assert.equal(O.zaslonDlaObcejRamki(obce), true); assert.equal(doc.documentElement.style.display, 'none');
    const samo = { document: doc }; samo.top = samo; samo.self = samo; assert.equal(O.zaslonDlaObcejRamki(samo), false);
    const wlasna = { document: doc, self: {}, top: { location: { href: 'https://x' } } }; assert.equal(O.zaslonDlaObcejRamki(wlasna), false);
});

test('wersja 2.16.02 i testy wpięte w npm test', () => {
    assert.equal(WERSJA, '2.16.02');
    assert.match(czytaj('package.json'), /tests\/bezpieczenstwo-ladowanie\.test\.mjs/);
});

// ---------------- narzędzia ----------------
test('tools/sri.mjs: suma sha384, rozbijanie adresów i wpisywanie integrity (atrapa sieci)', async () => {
    const T = await import('../tools/sri.mjs');
    const wektorHex = 'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7';   // standardowy wektor SHA-384("abc") z FIPS 180-4
    assert.equal(T.sha384(Buffer.from('abc')), 'sha384-' + Buffer.from(wektorHex, 'hex').toString('base64'));
    const r = T.rozbij('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'); assert.deepEqual([r.pakiet, r.spec, r.sciezka], ['@supabase/supabase-js', '2', '']);
    assert.equal(T.zloz(r, '2.45.4'), 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4');
    assert.equal(T.jestDokladna('2.45.4'), true); assert.equal(T.jestDokladna('2'), false);
    const h = '<script src="https://cdn.jsdelivr.net/npm/x@1"></script>';
    assert.equal(T.wpiszIntegrity(h, 'https://cdn.jsdelivr.net/npm/x@1', 'https://cdn.jsdelivr.net/npm/x@1.2.3', 'sha384-AAA'), '<script src="https://cdn.jsdelivr.net/npm/x@1.2.3" integrity="sha384-AAA" crossorigin="anonymous"></script>');
    assert.equal(T.wpiszIntegrity('<p></p>', 'https://a/b', 'https://a/c', 'sha384-A'), '<p></p>');
});

test('stempluj-wersje: strony są już spójne z wersją (narzędzie niczego by nie zmieniło)', () => {
    for (const f of STRONY) assert.ok(!new RegExp('(?:src|href)="(?:js|css)/[^"?]+\\?v=(?!' + WERSJA.replace(/\./g, '\\.') + '")').test(czytaj(f)), f);
});
