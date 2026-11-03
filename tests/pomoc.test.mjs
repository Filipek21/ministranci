// Testy v2.15.08: interaktywna pomoc (js/pomoc.js). Dane przewodników ładowane w vm bez przeglądarki;
// sprawdzamy kontrakt: każdy krok ma tekst, a każdy selektor #id istnieje w HTML-u albo w JS-ie (elementy tworzone dynamicznie).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(czytaj('js/pomoc.js'), { module: mod, window: {} });
const { PRZEWODNIKI, UI } = mod.exports;
const html = { kiosk: czytaj('kiosk.html'), app: czytaj('app.html'), index: czytaj('index.html') };
const DYNAMICZNE = ['btn-kontakt', 'skaner-kamery-okno'];
const CTX = { start: 'index', login: 'app', ministrant: 'app', ksiadz: 'app', admin: 'app', kiosk: 'kiosk', 'kiosk-ksiadz': 'kiosk', 'kiosk-admin': 'kiosk' };
const tekst = (o) => (typeof o === 'string' ? o : (o && o.pl) || '');

test('są wszystkie konteksty', () => assert.deepEqual(Object.keys(PRZEWODNIKI).sort(), Object.keys(CTX).sort()));
test('każdy kontekst ma tematy, a temat ma id, tytuł i kroki', () => {
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) {
        assert.ok(tematy.length > 0, k);
        const ids = new Set();
        for (const t of tematy) { assert.ok(t.id && !ids.has(t.id), k + ' id ' + t.id); ids.add(t.id); assert.ok(tekst(t.tytul), t.id); assert.ok(t.kroki.length > 0, t.id); }
    }
});
test('każdy krok ma tytuł i tekst; w kioskach i panelu ministranta są wersje EN i UK', () => {
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) for (const t of tematy) for (const s of t.kroki) {
        assert.ok(tekst(s.tytul) && tekst(s.tekst), t.id);
        if (['kiosk', 'login', 'ministrant', 'start'].includes(k)) {
            for (const j of ['en', 'uk']) { assert.ok(s.tekst[j] && s.tekst[j] !== s.tekst.pl, k + '/' + t.id + ' brak ' + j); }
        }
    }
});
test('selektory #id wskazują elementy, które istnieją w HTML lub są tworzone w JS', () => {
    const braki = [];
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) for (const t of tematy) for (const s of t.kroki) {
        for (const sel of [s.cel, s.ekran && '#' + s.ekran]) {
            if (typeof sel !== 'string') continue;
            for (const m of sel.matchAll(/#([a-z0-9-]+)/gi)) {
                const id = m[1];
                if (DYNAMICZNE.includes(id)) continue;
                if (!html[CTX[k]].includes('id="' + id + '"')) braki.push(k + '/' + t.id + ' → #' + id);
            }
        }
    }
    assert.deepEqual(braki, []);
});
test('zakładki użyte w zak() istnieją w panelu', () => {
    for (const t of [...PRZEWODNIKI.admin, ...PRZEWODNIKI.ksiadz]) for (const s of t.kroki) {
        const m = typeof s.cel === 'string' && s.cel.match(/^\.tabs button\[data-tab="(\w+)"\]$/);
        if (m) assert.ok(html.app.includes('data-tab="' + m[1] + '"'), m[1]);
    }
});
test('Ksiądz nie dostaje tematów Admina; Admin dostaje wszystkie tematy Księdza', () => {
    const k = PRZEWODNIKI.ksiadz.map((t) => t.id), a = PRZEWODNIKI.admin.map((t) => t.id);
    assert.ok(!k.some((i) => i.startsWith('a-')));
    k.forEach((i) => assert.ok(a.includes(i), i));
    assert.ok(a.some((i) => i.startsWith('a-')));
    const ek = PRZEWODNIKI['kiosk-ksiadz'].map((t) => t.id);
    assert.ok(!ek.includes('e-odblokuj') && !ek.includes('e-czysc') && PRZEWODNIKI['kiosk-admin'].map((t) => t.id).includes('e-odblokuj'));
});
test('teksty interfejsu mają PL/EN/UK', () => { for (const [k, v] of Object.entries(UI)) if (k !== 'tylkoPl') for (const j of ['pl', 'en', 'uk']) assert.ok(v[j], k + ' ' + j); });
test('pomoc jest wpięta w kiosk, panel, stronę startową i service worker; nie nadpisuje istniejących plików logiki', () => {
    for (const h of ['kiosk.html', 'app.html', 'index.html']) assert.match(czytaj(h), /js\/pomoc\.js\?v=/);
    assert.match(czytaj('sw.js'), /js\/pomoc\.js/);
    assert.match(czytaj('css/style.css'), /\.pomoc-przycisk/);
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.15\.08'/);
});
test('przycisk pomocy jest w lewym dolnym rogu', () => assert.match(czytaj('css/style.css'), /\.pomoc-przycisk \{ position: fixed; left: 12px; bottom:/));
