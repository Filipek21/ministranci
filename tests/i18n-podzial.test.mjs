// Testy v2.16.02: podział słownika (js/i18n.js = polski + silnik; js/i18n-en.js, js/i18n-uk.js ładowane tylko, gdy język jest używany).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const JS = { pl: czytaj('js/i18n.js'), en: czytaj('js/i18n-en.js'), uk: czytaj('js/i18n-uk.js') };

function swiat({ zapisany = null, jezyki = ['pl-PL'], stan = 'loading', wersja = '9.9.9', bezAuto = false } = {}) {
    const el = () => ({ style: {}, dataset: {}, addEventListener() {}, appendChild() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} } });
    const zapisane = []; const dodane = []; const zdarzenia = [];
    const doc = { readyState: stan, documentElement: el(), querySelectorAll: () => [], addEventListener() {}, dispatchEvent(e) { zdarzenia.push(e.detail && e.detail.jezyk); },
        createElement: () => el(), head: { appendChild(s) { dodane.push(s); } }, write(h) { zapisane.push(h); } };
    const ctx = { window: {}, document: doc, localStorage: { getItem: (k) => (k === 'em_lang' ? zapisany : null), setItem() {} }, navigator: { languages: jezyki }, console: { warn() {}, log() {}, error() {} }, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } } };
    ctx.window.document = doc; if (bezAuto) ctx.window.__EM_BEZ_AUTO_JEZYKA = true; vm.createContext(ctx);
    if (wersja) vm.runInContext("const WERSJA_APLIKACJI = '" + wersja + "';", ctx);
    return { ctx, doc, zapisane, dodane, zdarzenia, uruchom: (kod) => vm.runInContext(JS[kod], ctx), eval: (k) => vm.runInContext(k, ctx) };
}

test('start po polsku: nie pobiera ani nie wykonuje tłumaczeń EN/UK (document.write nie jest używany)', () => {
    const s = swiat(); s.uruchom('pl');
    assert.equal(s.zapisane.length, 0);
    assert.equal(s.eval('Object.keys(SLOWNIK.en).length + Object.keys(SLOWNIK.uk).length'), 0);
    assert.ok(s.eval('Object.keys(SLOWNIK.pl).length') > 1000);
    assert.equal(s.eval('slownikGotowy("pl")'), true); assert.equal(s.eval('slownikGotowy("en")'), false);
    assert.equal(s.eval("t('czyt.today')"), 'Dziś');
    assert.ok(!/Today/.test(JS.pl) && !/Сьогодні/.test(JS.pl), 'w i18n.js nie ma cudzych tłumaczeń');
});

test('start po angielsku / ukraińsku (zapisany wybór albo język przeglądarki): słownik dołączany synchronicznie podczas parsowania, z numerem wersji', () => {
    let s = swiat({ zapisany: 'en' }); s.uruchom('pl');
    assert.equal(s.zapisane.length, 1); assert.match(s.zapisane[0], /^<script src="js\/i18n-en\.js\?v=9\.9\.9"><\/script>$/);
    s.uruchom('en'); assert.equal(s.eval('slownikGotowy("en")'), true); assert.equal(s.eval("SLOWNIK.en['czyt.today']"), 'Today');
    s = swiat({ jezyki: ['uk-UA', 'pl'] }); s.uruchom('pl'); assert.match(s.zapisane[0], /js\/i18n-uk\.js\?v=9\.9\.9/);
    s = swiat({ zapisany: 'pl', jezyki: ['en-GB'] }); s.uruchom('pl'); assert.equal(s.zapisane.length, 0, 'zapisany wybór PL wygrywa z językiem przeglądarki');
    s = swiat({ zapisany: 'en', stan: 'complete' }); s.uruchom('pl'); assert.equal(s.zapisane.length, 0, 'po zakończeniu parsowania document.write nie jest używany');
});

test('przełączenie języka: najpierw wczytuje słownik (dynamiczny <script>), dopiero potem zmienia język; drugi raz — natychmiast', () => {
    const s = swiat({ stan: 'complete', bezAuto: true }); s.uruchom('pl');
    s.eval("ustawJezyk('uk', { zapisz: false });");
    assert.equal(s.dodane.length, 1); assert.equal(s.dodane[0].src, 'js/i18n-uk.js?v=9.9.9');
    assert.equal(s.eval('jezykBiezacy'), 'pl', 'język zmienia się dopiero po wczytaniu słownika');
    s.uruchom('uk'); s.dodane[0].onload();
    assert.equal(s.eval('jezykBiezacy'), 'uk'); assert.equal(s.doc.documentElement.lang, 'uk'); assert.deepEqual(s.zdarzenia, ['uk']);
    assert.equal(s.eval("t('czyt.today')"), 'Сьогодні');
    s.eval("ustawJezyk('pl', { zapisz: false });"); s.eval("ustawJezyk('uk', { zapisz: false });");
    assert.equal(s.dodane.length, 1, 'słownik wczytany raz'); assert.equal(s.eval('jezykBiezacy'), 'uk');
});

test('błąd pobrania słownika: język i tak się przełącza (teksty awaryjnie po polsku), bez pętli ponawiania', () => {
    const s = swiat({ stan: 'complete', bezAuto: true }); s.uruchom('pl');
    s.eval("ustawJezyk('en', { zapisz: false });"); assert.equal(s.dodane.length, 1);
    s.dodane[0].onerror();
    assert.equal(s.eval('jezykBiezacy'), 'en'); assert.equal(s.eval("t('czyt.today')"), 'Dziś'); assert.equal(s.dodane.length, 1);
});

test('kompletność: PL, EN i UK mają dokładnie te same klucze; pliki językowe tylko dokładają wpisy i ustawiają znacznik wczytania', () => {
    const s = swiat({ stan: 'complete' }); s.uruchom('pl'); s.uruchom('en'); s.uruchom('uk');
    const k = (j) => s.eval('Object.keys(SLOWNIK.' + j + ').sort().join("|")');
    assert.equal(k('en'), k('pl')); assert.equal(k('uk'), k('pl'));
    for (const j of ['en', 'uk']) { assert.match(JS[j], new RegExp('slownikiProbowane\\.' + j + ' = true;')); assert.ok(!/^\s*(function|let|var) /m.test(JS[j].replace(/\/\/.*$/gm, '')), j + ': tylko Object.assign'); }
});

test('wpięcie: oba pliki w service workerze (offline), ładowane dynamicznie — nie ma ich w tagach <script> stron', () => {
    const sw = czytaj('sw.js'); assert.match(sw, /'js\/i18n\.js', 'js\/i18n-en\.js', 'js\/i18n-uk\.js'/);
    for (const h of ['index.html', 'app.html', 'kiosk.html']) assert.ok(!/i18n-(en|uk)/.test(czytaj(h)), h);
    assert.match(czytaj('package.json'), /tests\/i18n-podzial\.test\.mjs/);
});
