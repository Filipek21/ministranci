// Testy v2.15.10: tryb „klikam za Ciebie” (tylko bezpieczne czynności), czuwanie i pomoc przy kroku (bez czatu AI, v2.16.02) — na atrapie DOM (bez przeglądarki).
import fs from 'node:fs'; import vm from 'node:vm'; import test from 'node:test'; import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../js/pomoc.js', import.meta.url), 'utf8');

function buduj(tryb, opcje) {   // tryb: 'panel' | 'kiosk'; opcje: { ls } — wspólna pamięć lokalna
    const els = {}, listeners = {}, gid = {}; let teraz = 1000000;
    const mk = (id) => ({ id, className: '', style: {}, _a: {}, children: [], innerHTML: '', textContent: '', value: '', offsetHeight: 200, offsetWidth: 380, tagName: 'DIV', klik: 0, zdarzenia: [],
        classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); } },
        setAttribute(k, v) { this._a[k] = v; }, getAttribute(k) { return this._a[k]; }, appendChild(c) { this.children.push(c); return c; }, getClientRects() { return [1]; }, getBoundingClientRect() { return { left: 10, top: 100, right: 200, bottom: 140, width: 190, height: 40 }; },
        contains() { return false; }, closest() { return null; }, scrollIntoView() {}, remove() {}, click() { this.klik++; if (this.onclick) this.onclick(); }, dispatchEvent(e) { this.zdarzenia.push(e.type); }, matches() { return false; } });
    const wid = ['pomoc-widok', 'pomoc-lista'];
    const kioskIds = ['ekran-czekanie', 'ekran-pin', 'ekran-wynik', 'btn-skaner-kamery'];
    const tab = {};
    ['kalendarz', 'zgloszenia'].forEach((n) => { const b = mk('tab-' + n); b._a['data-tab'] = n; b.tagName = 'BUTTON'; b.matches = (s) => s === '.tabs button[data-tab]'; b.onclick = () => { Object.values(tab).forEach((x) => x.classList.remove('active')); b.classList.add('active'); }; tab[n] = b; });
    tab.kalendarz.classList.add('active');
    ['widok-login', 'widok-admin'].forEach((i) => { gid[i] = mk(i); });
    gid['zg-filtr-status'] = Object.assign(mk('zg-filtr-status'), { tagName: 'SELECT', value: 'wszystkie' });
    gid['btn-dodaj-wydarzenie'] = Object.assign(mk('btn-dodaj-wydarzenie'), { tagName: 'BUTTON' });
    const doc = { readyState: 'complete', body: mk('body'),
        getElementById(id) {
            if (wid.includes(id)) return (els[id] = els[id] || mk(id));
            if (tryb === 'kiosk') { if (kioskIds.includes(id)) { els[id] = els[id] || mk(id); return els[id]; } return els[id] || null; }
            if (id === 'ekran-czekanie') return null;
            if (gid[id]) return gid[id]; return els[id] || null;
        },
        createElement(t) { const e = mk(''); e.tagName = t.toUpperCase(); return e; },
        querySelectorAll(sel) { const m = sel.match(/^#([\w-]+)/); if (m) { if (gid[m[1]]) return [gid[m[1]]]; if (tryb === 'panel') { gid[m[1]] = mk(m[1]); return [gid[m[1]]]; } } const t = sel.match(/data-tab="(\w+)"/); if (t && tab[t[1]]) return [tab[t[1]]]; return []; },
        querySelector(sel) { if (sel === '.tabs button.active') return Object.values(tab).filter((b) => b.classList.contains('active'))[0] || null; const t = sel.match(/data-tab="(\w+)"/); return t && tab[t[1]] ? tab[t[1]] : null; },
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); } };
    const orig = doc.body.appendChild.bind(doc.body); doc.body.appendChild = (c) => { if (c.id) els[c.id] = c; return orig(c); };
    const timers = [];
    const ctx = { document: doc, window: { addEventListener() {}, matchMedia: () => ({ matches: true }), innerHeight: 800, innerWidth: 400 },
        localStorage: (opcje && opcje.ls) || { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = v; }, removeItem(k) { delete this._d[k]; } },
        setInterval: (f) => { timers.push(f); }, setTimeout: (f) => { f(); return 0; }, clearTimeout() {}, requestAnimationFrame: (f) => f(), Event: class { constructor(t) { this.type = t; } },
        Date: { now: () => teraz }, console, pinBufor: '', rolaAwaryjna: null, jezykBiezacy: 'pl', sesja: { is_moderator: true, is_admin: false }, Math, Array, String, Object, JSON, Set };
    ctx.window.document = doc; vm.createContext(ctx); vm.runInContext(src, ctx);
    return { P: ctx.window.EMPomoc, els, gid, tab, tik: timers[0], listeners, czas: (ms) => { teraz += ms; }, ctx };
}
const kliknijDalej = (s) => s.listeners.click[0]({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-pomoc' ? 'dalej' : null) }) } });

test('tryb auto: sam otwiera zakładkę i ustawia filtr „Oczekujące”, ale nie klika przycisków zapisujących', () => {
    const s = buduj('panel');
    s.P.auto(true);
    s.P.start('p-zgloszenia');                                  // krok 1: zakładka „Zgłoszenia” nieaktywna → auto-klik
    assert.equal(s.tab.zgloszenia.klik, 1, 'zakładka kliknięta automatycznie');
    s.czas(1000); s.tik();                                      // zakładka aktywna → pochwała i krok 2
    s.czas(1000); s.tik();
    assert.equal(s.gid['zg-filtr-status'].value, 'oczekujace', 'filtr ustawiony automatycznie');
    assert.ok(s.gid['zg-filtr-status'].zdarzenia.includes('change'));
});
test('tryb auto: przycisk „Dodaj wydarzenie” NIGDY nie jest klikany automatycznie', () => {
    const s = buduj('panel'); s.P.auto(true);
    s.P.start('p-wydarzenie');
    for (let i = 0; i < 12; i++) { s.czas(1000); s.tik(); try { kliknijDalej(s); } catch (e) { /* koniec tematu */ } }
    assert.equal(s.gid['btn-dodaj-wydarzenie'].klik, 0);
});
test('bez trybu auto pomoc niczego nie klika', () => {
    const s = buduj('panel'); s.P.start('p-zgloszenia'); s.czas(2000); s.tik();
    assert.equal(s.tab.zgloszenia.klik, 0); assert.equal(s.gid['zg-filtr-status'].value, 'wszystkie');
});
test('na kiosku tryb auto jest niedostępny', () => {
    const s = buduj('kiosk'); s.P.auto(true);
    assert.match(s.els['pomoc-toast'].textContent, /Na kiosku nie klikam/);
    s.P.start('k-obecnosc'); s.czas(2000); s.tik(); assert.equal((s.els['btn-skaner-kamery'] || { klik: 0 }).klik, 0);
});
test('czuwanie: po 35 s bez ruchu pomoc proponuje wsparcie', () => {
    const s = buduj('panel'); s.P.start('p-reczna'); s.czas(40000); s.tik();
    assert.match(s.els['pomoc-toast'].textContent, /trwa długo/);
});

const kliknijAkcje = (s, a) => s.listeners.click[0]({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-pomoc' ? a : null) }) } });
test('v2.16.02: „Pomóż mi z tym krokiem” pokazuje krótką wskazówkę do bieżącego kroku (bez czatu) i podświetla miejsce', () => {
    const s = buduj('panel'); s.P.start('p-zgloszenia');
    kliknijAkcje(s, 'pytaj-krok');
    const t = s.els['pomoc-toast'].textContent;
    assert.match(t, /To krok/); assert.ok(!/\*\*/.test(t), 'bez znaczników pogrubienia'); assert.ok(!/\n/.test(t));
});
test('v2.16.02: czat mini-asystenta i mini-silnik AI usunięte z pomocy; zostają tematy, przewodniki, tryb „klikam za Ciebie”, czytanie na głos i czuwanie', () => {
    assert.ok(!/EMPomocAI|zapewnijAI|renderCzat|pomoc-czat|CHIPY|em_pomoc_ai/.test(src), 'w pomoc.js nie ma śladu silnika/czatu');
    const s = buduj('panel'); assert.equal(typeof s.P.zapytaj, 'undefined'); assert.equal(typeof s.P.silnik, 'undefined'); assert.equal(typeof s.P.auto, 'function'); assert.equal(typeof s.P.start, 'function');
    assert.ok(s.P.przewodniki.admin.length > 5);
});
