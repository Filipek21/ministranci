// Testy v2.16.02: „Czytania na dziś” (widget Niedziela.pl w odizolowanej ramce) oraz diagnostyka Strażnika sieci w panelu Admina.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const C = require('../js/czytania.js');
const R = require('../js/czytania-ramka.js');
const G = require('../js/straznik-sieci.js');
globalThis.WERSJA_APLIKACJI = '2.16.02';
const csp = (h) => Object.fromEntries(/Content-Security-Policy" content="([^"]+)"/.exec(h)[1].split(';').map(x => x.trim()).filter(Boolean).map(x => { const [n, ...r] = x.split(/\s+/); return [n, r]; }));

test('czytania.html: własne CSP (bez połączeń), tylko dwa skrypty, widget w kontenerze, referrer tylko origin, bez kodu inline', () => {
    const h = czytaj('czytania.html'); const d = csp(h);
    assert.deepEqual(d['default-src'], ["'none'"]); assert.deepEqual(d['connect-src'], ["'none'"]); assert.deepEqual(d['frame-src'], ["'none'"]);
    assert.deepEqual(d['script-src'], ["'self'", 'https://widget.niedziela.pl']); assert.deepEqual(d['base-uri'], ["'none'"]); assert.deepEqual(d['form-action'], ["'none'"]); assert.deepEqual(d['object-src'], ["'none'"]);
    assert.ok(d['img-src'].includes('https:') && !d['img-src'].includes("'unsafe-eval'"));
    assert.ok(!/unsafe-eval/.test(h));
    assert.match(h, /<meta name="referrer" content="origin">/);
    const skrypty = [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.equal(skrypty.length, 2);   // v2.16.02: ładowarka widgetu (js/czytania-widget.js) + skrypt ramki; sam widget Niedziela.pl dopisuje się przez document.write skrypty.forEach(s => { assert.match(s[1], /src="/); assert.equal(s[2].trim(), '', 'brak kodu inline'); });
    assert.match(h, /<div id="czyt-tresc"><script src="js\/czytania-widget\.js\?v=2\.16\.02"><\/script><\/div>/);   // v2.16.02: dzień (?data=) dopisuje ładowarka js/czytania-widget.js
    assert.match(h, /css\/czytania\.css\?v=2\.16\.02/); assert.match(h, /js\/czytania-ramka\.js\?v=2\.16\.02/);
});

test('strony główne NIE ufają widgetowi: ani script-src, ani connect-src, ani img-src nie zawierają niedziela.pl; ramki tylko własne (Kiosk bez ramek)', () => {
    for (const f of ['index.html', 'app.html', 'kiosk.html']) {
        const h = czytaj(f); assert.ok(!/niedziela/i.test(/Content-Security-Policy" content="([^"]+)"/.exec(h)[1]), f); assert.ok(!/niedziela/i.test(h), f + ' nie wstawia widgetu bezpośrednio');
        assert.deepEqual(csp(h)['frame-src'], f === 'kiosk.html' ? ["'none'"] : ["'self'"], f);
    }
});

test('przyciski „Czytania na dziś”: ekran startowy (1), logowanie + panel ministranta + panel Admina (3); skrypt wpięty; teksty w 3 językach', () => {
    assert.equal((czytaj('index.html').match(/data-czytania-otworz/g) || []).length, 1);
    assert.equal((czytaj('app.html').match(/data-czytania-otworz/g) || []).length, 3);
    for (const f of ['index.html', 'app.html']) assert.match(czytaj(f), /<script src="js\/czytania\.js\?v=2\.16\.02"><\/script>/);
    assert.equal((czytaj('kiosk.html').match(/czytania/g) || []).length, 0);
    const i = (czytaj('js/i18n.js') + czytaj('js/i18n-en.js') + czytaj('js/i18n-uk.js')); for (const k of ['czyt.btn', 'czyt.title', 'czyt.close', 'czyt.note', 'czyt.today', 'czyt.tomorrow', 'czyt.after', 'czyt.tabs']) assert.equal((i.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length, 3, k);
});

function atrapaDok(lang = 'pl') {
    const klasy = new Set(); const sluchacze = {}; const przyciski = [];
    const mk = (tag) => ({ tag, className: '', attrs: {}, children: [], sluch: {}, parentNode: null, textContent: '',
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
        appendChild(c) { c.parentNode = this; this.children.push(c); return c; }, addEventListener(t, f) { this.sluch[t] = f; },
        remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; } }, focus() { dok.fokus = this; } });
    const dok = { fokus: null, documentElement: { lang, classList: { add: (x) => klasy.add(x), remove: (x) => klasy.delete(x) } }, body: mk('body'), createElement: mk,
        addEventListener(t, f) { sluchacze[t] = f; }, removeEventListener(t) { delete sluchacze[t]; }, querySelectorAll() { return { forEach: (f) => przyciski.forEach(f) }; } };
    return { dok, klasy, sluchacze, przyciski };
}
const znajdz = (el, klasa) => { if (el.className === klasa) return el; for (const c of el.children) { const w = znajdz(c, klasa); if (w) return w; } return null; };

test('okno czytań: ramka tworzona dopiero po kliknięciu, sandbox TYLKO allow-scripts, adres z wersją i językiem, brak połączeń przed otwarciem', () => {
    const a = atrapaDok('pl'); const k = C.utworz(a.dok);
    assert.equal(a.dok.body.children.length, 0, 'przed kliknięciem nie ma żadnej ramki');
    const przycisk = { focus() { a.dok.fokus = this; }, addEventListener(t, f) { this.sluch = f; } }; a.przyciski.push(przycisk);
    assert.equal(k.podepnij(), 1); assert.equal(a.dok.body.children.length, 0, 'podpięcie przycisku nie tworzy ramki');
    let zapobiegnieto = false; przycisk.sluch({ preventDefault() { zapobiegnieto = true; } });
    assert.ok(zapobiegnieto); assert.equal(k.czyOtwarte(), true);
    const ramka = znajdz(a.dok.body, 'czyt-iframe');
    assert.equal(ramka.attrs.sandbox, 'allow-scripts');
    assert.ok(!/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/.test(ramka.attrs.sandbox));
    assert.equal(ramka.attrs.src, 'czytania.html?v=2.16.02&j=pl'); assert.equal(ramka.attrs.referrerpolicy, 'origin');
    assert.ok(a.klasy.has('czyt-otwarte')); assert.equal(a.dok.fokus.className, 'czyt-zamknij');
    assert.equal(znajdz(a.dok.body, 'czyt-nakladka').attrs['aria-modal'], 'true');
    assert.equal(k.otworz(przycisk), k.otworz(przycisk), 'drugie otwarcie nie tworzy drugiej ramki'); assert.equal(a.dok.body.children.length, 1);
});

test('okno czytań: Esc, ✕ i kliknięcie tła zamykają (ramka zatrzymana, fokus wraca); kliknięcie w treści nie zamyka; język w adresie', () => {
    for (const [lang, oczek] of [['en-GB', 'en'], ['uk', 'uk'], ['pl', 'pl'], ['de', 'pl']]) assert.equal(C.kodJezyka({ documentElement: { lang } }), oczek);
    const a = atrapaDok('uk'); const k = C.utworz(a.dok); const zr = { focus() { a.dok.fokus = zr; } };
    const otworz = () => { k.otworz(zr); return znajdz(a.dok.body, 'czyt-nakladka'); };
    let n = otworz(); assert.match(znajdz(n, 'czyt-iframe').attrs.src, /&j=uk$/);
    a.sluchacze.keydown({ key: 'a' }); assert.equal(k.czyOtwarte(), true);
    a.sluchacze.keydown({ key: 'Escape' }); assert.equal(k.czyOtwarte(), false); assert.equal(a.dok.body.children.length, 0); assert.ok(!a.klasy.has('czyt-otwarte')); assert.equal(a.dok.fokus, zr); assert.equal(a.sluchacze.keydown, undefined);
    n = otworz(); n.sluch.click({ target: znajdz(n, 'czyt-okno') }); assert.equal(k.czyOtwarte(), true, 'klik w treść');
    n.sluch.click({ target: n }); assert.equal(k.czyOtwarte(), false, 'klik w tło');
    n = otworz(); const ramka = znajdz(n, 'czyt-iframe'); znajdz(n, 'czyt-zamknij').sluch.click({}); assert.equal(ramka.attrs.src, 'about:blank', 'widget zatrzymany'); assert.equal(k.czyOtwarte(), false);
    assert.equal(k.zamknij(), false);
});

test('ramka: kolor szat z nagłówka widgetu, język, komunikat o błędzie gdy widget się nie załadował', () => {
    assert.deepEqual(R.kolorSzat('22 listopada 2026 r., NiedzielaUroczystość Jezusa Chrystusa Króla Wszechświata Kolor szat: bialy Rok A, II XXXIV Tydzień zwykły'), { klucz: 'bialy', hex: '#ffffff' });
    assert.equal(R.kolorSzat('Kolor szat: ZIELONY').klucz, 'zielony'); assert.equal(R.kolorSzat('Kolor szat: Fioletowy').klucz, 'fioletowy'); assert.equal(R.kolorSzat('Kolor szat: złoty').klucz, 'zloty');
    assert.equal(R.kolorSzat('Kolor szat: różowy').klucz, 'rozowy'); assert.equal(R.kolorSzat('Kolor szat: niebieski'), null); assert.equal(R.kolorSzat('brak informacji'), null); assert.equal(R.kolorSzat(undefined), null);
    assert.equal(R.jezyk('?v=1&j=en'), 'en'); assert.equal(R.jezyk('?j=xx'), 'pl'); assert.equal(R.jezyk(''), 'pl');
    const status = { textContent: '', className: '', hidden: false }; const css = {}; const attr = {};
    const dok = (liturgia, dzien) => ({ documentElement: { lang: '', style: { setProperty: (k, v) => { css[k] = v; } }, setAttribute: (k, v) => { attr[k] = v; } },
        getElementById: (id) => (id === 'czyt-status' ? status : (id === 'nd_liturgia' ? liturgia : null)), querySelector: () => dzien });
    assert.equal(R.uruchom(dok(null, null), '?j=en'), false); assert.match(status.textContent, /Could not load/); assert.equal(status.className, 'blad');
    status.className = ''; status.textContent = '';
    assert.equal(R.uruchom(dok({}, { textContent: 'Kolor szat: czerwony Rok B, I' }), '?j=pl'), true); assert.equal(status.hidden, true); assert.equal(css['--kolor-szat'], '#c62828'); assert.equal(attr['data-kolor'], 'czerwony');
    for (const j of ['pl', 'en', 'uk']) assert.ok(R.TEKSTY[j].blad.length > 40 && R.TEKSTY[j].ladowanie.length > 5);
});

test('css/czytania.css zawiera WSZYSTKIE reguły z wklejonego stylu Niedziela.pl oraz klasy używane przez widget; linki wyłączone; kolor szat', () => {
    const c = czytaj('css/czytania.css');
    for (const sel of ['div#nd_liturgia', 'div#nd_liturgia_naglowek', 'div#nd_liturgia_czytania', 'div#nd_liturgia_dodatki', 'p.nd_dzien', 'p.nd_msza', 'p.nd_msza_tyt', 'span.nd_swieto', 'span.nd_sigla', 'p.nd_wstep', 'p.nd_czytanie_nazwa', 'p.nd_czytanie_sigla', 'p.nd_czytanie2', 'p.nd_czytanie_tyt', 'p.nd_czytanie_tresc', 'p.nd_czytanie_albo', 'p.nd_czytanie_odp', 'p.nd_psalm', 'p.nd_psalm_refren', 'p.nd_czytanie_perykopa', 'p.nd_dodatki_tyt', 'p.nd_dodatki_styt', 'p.nd_dodatki_tresc', 'img.nd_banner_bottom'])
        assert.ok(c.includes(sel + ' {'), 'brak reguły ' + sel);
    assert.match(c, /var\(--kolor-szat\)/); assert.match(c, /pointer-events: none/); assert.match(c, /float: none !important/);
    assert.match(czytaj('css/style.css'), /\.czyt-okno \{/); assert.match(czytaj('css/style.css'), /html\.czyt-otwarte/);
});

test('service worker: czytania.html i jej pliki w pamięci, widget tylko GET/HEAD i nigdy zapisywany; strona nie przechodzi przez przechwytywanie CDN', () => {
    const sw = czytaj('sw.js');
    assert.match(sw, /'css\/czytania\.css', 'js\/czytania\.js', 'js\/czytania-ramka\.js'/); assert.match(sw, /'app\.html', 'czytania\.html'/);
    assert.match(sw, /const HOSTY_WIDGET = \['widget\.niedziela\.pl', 'www\.niedziela\.pl'\]/);
    assert.match(sw, /\(HOSTY_CDN\.includes\(host\) \|\| HOSTY_WIDGET\.includes\(host\)\) && req\.method !== 'GET' && req\.method !== 'HEAD'/);
    assert.ok(!/cache\.put\([^)]*niedziela/.test(sw));
});

// ------------------------- diagnostyka Strażnika sieci -------------------------
const ORIGIN = 'https://parafia.github.io';
const cspKiosk = /Content-Security-Policy" content="([^"]+)"/.exec(czytaj('kiosk.html'))[1];
function atrapaOkna(fetchRaw) {
    const okno = { fetch: fetchRaw || (async () => { throw new TypeError('Failed to fetch'); }), navigator: { sendBeacon: () => true }, console: { warn() {} } };
    return okno;
}
test('samotest: ze strażnikiem — zaliczony i blokady w dzienniku; bez strażnika (tylko CSP) — niezaliczony; fetch który przechodzi — wykryty', async () => {
    const okno = atrapaOkna(); const w = G.zainstaluj(okno, { csp: cspKiosk, origin: ORIGIN, baza: ORIGIN + '/app.html' });
    const wynik = await G.samotest(okno, w);
    assert.deepEqual(wynik, { fetch: 'zablokowany_przez_straznika', beacon: 'zablokowany_przez_straznika', ok: true });
    assert.equal(w.liczbaBlokad(), 2); const p = G.podsumuj(w);
    assert.equal(p.aktywny, true); assert.equal(p.liczba, 2); assert.ok(p.kanaly.includes('fetch') && p.kanaly.includes('beacon')); assert.equal(p.ostatnie.length, 2);
    assert.ok(p.ostatnie.every(x => x.host === 'straznik-test.invalid' && x.powod === 'host_poza_lista'));
    assert.ok(!JSON.stringify(p).includes('/test') && !JSON.stringify(p).includes('/beacon'), 'bez ścieżek adresów');
    const bez = atrapaOkna(); const wb = await G.samotest(bez, null);
    assert.equal(wb.ok, false); assert.equal(wb.fetch, 'zablokowany_inaczej');
    const dziura = atrapaOkna(async () => ({ ok: true })); const wd = await G.samotest(dziura, null);
    assert.equal(wd.ok, false); assert.equal(wd.fetch, 'PRZESZEDL');
    assert.deepEqual(G.podsumuj(null), { aktywny: false, kanaly: [], liczba: 0, ostatnie: [] });
});

test('panel Admina: status strażnika (Bezpieczeństwo, tylko Admin) — elementy HTML, funkcje, teksty w 3 językach', () => {
    const h = czytaj('app.html'); for (const id of ['straznik-status', 'btn-straznik-test', 'straznik-wynik', 'tabela-straznik']) assert.match(h, new RegExp('id="' + id + '"'));
    assert.ok(h.indexOf('id="straznik-status"') > h.indexOf('admin-only-akcja hidden"><!--') || h.indexOf('id="straznik-status"') > h.indexOf('Historia PIN-ów i plakietek'), 'w bloku tylko dla Admina');
    const j = czytaj('js/app.part4.js'); assert.match(j, /function odswiezStatusStraznika\(\)/); assert.match(j, /if \(admin\) \{ odswiezStatusStraznika\(\); await odswiezHistoriePinPlakietek\(\); \}/); assert.match(j, /sn\.samotestTutaj\(\)/);
    assert.match(czytaj('js/straznik-sieci.js'), /samotestTutaj: \(\) => samotest\(window, wnetrze\)/);
    const i = (czytaj('js/i18n.js') + czytaj('js/i18n-en.js') + czytaj('js/i18n-uk.js')); for (const k of ['sec.sn_title', 'sec.sn_hint', 'sec.sn_active', 'sec.sn_missing', 'sec.sn_channels', 'sec.sn_blocks', 'sec.sn_test', 'sec.sn_test_ok', 'sec.sn_test_fail', 'sec.sn_host', 'sec.sn_method', 'sec.sn_none']) assert.equal((i.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length, 3, k);
});

test('wersja 2.16.02, raport i test wpięte w npm test; dokument widgetu opisuje wymaganie zgłoszenia domeny', () => {
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.16\.02'/);
    assert.match(czytaj('package.json'), /tests\/czytania-2160\.test\.mjs/);
    const r = czytaj('docs/RAPORT_V2.16.00.md'); assert.match(r, /zgłosi/i); assert.match(r, /sandbox/); assert.match(r, /Historia skanów|historii skanów/i);
});


// ------------------------- v2.16.02: czytania na jutro i pojutrze -------------------------
const W = require('../js/czytania-widget.js');
test('ładowarka widgetu: dziś = adres jak w 2.16.00 (bez parametru), jutro/pojutrze = ?data=1/2, wszystko inne = dziś (nic z adresu strony nie przechodzi dalej)', () => {
    assert.equal(W.BAZA, 'https://widget.niedziela.pl/liturgia_out.js.php');
    assert.equal(W.adres(''), W.BAZA); assert.equal(W.adres('?v=2.16.02&j=pl'), W.BAZA); assert.equal(W.adres('?d=0'), W.BAZA);
    assert.equal(W.adres('?v=2.16.02&j=pl&d=1'), W.BAZA + '?data=1'); assert.equal(W.adres('?d=2'), W.BAZA + '?data=2');
    for (const zle of ['?d=3', '?d=-1', '?d=1.5', '?d=abc', '?d=', '?d=1x', '?d=2026-11-25', '?d=%22%3E%3Cscript%3E', '?d=1%20']) assert.equal(W.adres(zle), W.BAZA, zle);
    assert.match(czytaj('js/czytania-widget.js'), /document\.write\('<script src="' \+ adres\(window\.location\.search\) \+ '"><\\\/script>'\)/, 'adres widgetu zawsze przez adres()');
});

test('okno czytań: zakładki Dziś/Jutro/Pojutrze — domyślnie dziś, przełączenie podmienia adres TEJ SAMEJ ramki (&d=1 / &d=2), nowe otwarcie znów zaczyna od dziś', () => {
    const pl = { documentElement: { lang: 'pl' } };
    assert.equal(C.adresRamki(pl), 'czytania.html?v=2.16.02&j=pl'); assert.equal(C.adresRamki(pl, 0), 'czytania.html?v=2.16.02&j=pl');
    assert.equal(C.adresRamki({ documentElement: { lang: 'en' } }, 1), 'czytania.html?v=2.16.02&j=en&d=1');
    assert.equal(C.adresRamki({ documentElement: { lang: 'uk' } }, 2), 'czytania.html?v=2.16.02&j=uk&d=2');
    assert.equal(C.adresRamki(pl, 7), 'czytania.html?v=2.16.02&j=pl', 'nieznany dzień = dziś');
    const a = atrapaDok('pl'); const k = C.utworz(a.dok); const zr = { focus() {} };
    let n = k.otworz(zr); const ramka = znajdz(n, 'czyt-iframe'); const zak = znajdz(n, 'czyt-zakladki');
    assert.equal(zak.attrs.role, 'tablist'); assert.equal(zak.children.length, 3);
    assert.deepEqual(zak.children.map(b => b.children[0].textContent), ['Dziś', 'Jutro', 'Pojutrze']);
    assert.ok(zak.children.every(b => b.children[1].textContent.length > 0), 'każda zakładka ma datę');
    assert.deepEqual(zak.children.map(b => b.attrs['aria-selected']), ['true', 'false', 'false']); assert.equal(zak.children[0].className, 'czyt-zakladka czyt-aktywna');
    assert.equal(ramka.attrs.src, 'czytania.html?v=2.16.02&j=pl');
    zak.children[1].sluch.click({}); assert.equal(k.dzien(), 1); assert.equal(ramka.attrs.src, 'czytania.html?v=2.16.02&j=pl&d=1');
    assert.deepEqual(zak.children.map(b => b.attrs['aria-selected']), ['false', 'true', 'false']); assert.equal(zak.children[1].className, 'czyt-zakladka czyt-aktywna'); assert.equal(zak.children[0].className, 'czyt-zakladka');
    zak.children[2].sluch.click({}); assert.equal(ramka.attrs.src, 'czytania.html?v=2.16.02&j=pl&d=2');
    zak.children[0].sluch.click({}); assert.equal(ramka.attrs.src, 'czytania.html?v=2.16.02&j=pl');
    assert.equal(a.dok.body.children.length, 1, 'nadal jedna nakładka i jedna ramka'); assert.equal(zak.attrs['aria-label'], 'Wybierz dzień');
    let zapob = false; zak.sluch.keydown({ key: 'ArrowRight', preventDefault() { zapob = true; } }); assert.equal(k.dzien(), 1); assert.ok(zapob);
    zak.sluch.keydown({ key: 'ArrowRight', preventDefault() {} }); zak.sluch.keydown({ key: 'ArrowRight', preventDefault() {} }); assert.equal(k.dzien(), 2, 'strzałka nie wychodzi poza ostatnią zakładkę');
    zak.sluch.keydown({ key: 'x' }); assert.equal(k.dzien(), 2);
    assert.equal(k.ustawDzien(5), false); assert.equal(k.ustawDzien(2), false, 'ten sam dzień — bez przeładowania');
    k.zamknij(); assert.equal(ramka.attrs.src, 'about:blank');
    n = k.otworz(zr); assert.equal(znajdz(n, 'czyt-iframe').attrs.src, 'czytania.html?v=2.16.02&j=pl', 'nowe otwarcie zaczyna od dziś'); k.zamknij();
    n = k.otworz(zr, 1); assert.equal(znajdz(n, 'czyt-iframe').attrs.src, 'czytania.html?v=2.16.02&j=pl&d=1', 'dzień startowy 1'); k.zamknij();
});

test('zakładki: teksty w 3 językach, sandbox nadal TYLKO allow-scripts, styl w style.css, ładowarka w service workerze, motyw ramki', () => {
    const i = (czytaj('js/i18n.js') + czytaj('js/i18n-en.js') + czytaj('js/i18n-uk.js'));
    for (const t of ['Dziś', 'Jutro', 'Pojutrze', 'Today', 'Tomorrow', 'Day after tomorrow', 'Сьогодні', 'Завтра', 'Післязавтра']) assert.ok(i.includes('"' + t + '"'), t);
    const a = atrapaDok('pl'); const k = C.utworz(a.dok); k.otworz(null); assert.equal(znajdz(a.dok.body, 'czyt-iframe').attrs.sandbox, 'allow-scripts'); k.zamknij();
    const st = czytaj('css/style.css'); for (const sel of ['.czyt-zakladki {', '.czyt-zakladka {', '.czyt-zakladka.czyt-aktywna {']) assert.ok(st.includes(sel), sel);
    assert.match(czytaj('sw.js'), /'js\/czytania-ramka\.js', 'js\/czytania-widget\.js'/);
    const css = czytaj('css/czytania.css'); assert.match(css, /prefers-reduced-motion/); assert.match(css, /data-kolor="czarny"/);
});
