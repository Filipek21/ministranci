// Testy Asystenta AI (v2.15.05). Widżet uruchamiany w vm z minimalną atrapą DOM i serwera; SQL i Edge Function sprawdzane jako tekst
// (nie były uruchamiane — brak PostgreSQL / Deno / sieci).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../js/asystent-sanityzacja.js');
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bezKomentarzy = (t) => t.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\s\/\/ .*$/gm, '');
const widzet = bezKomentarzy(czytaj('js/asystent.js')), edge = bezKomentarzy(czytaj('supabase/functions/asystent/index.ts')), sql = czytaj('sql/38_asystent_ai_v2_15_05.sql'), i18n = czytaj('js/i18n.js');

// ------------------------------------------------------------------ atrapa DOM ---
class El {
    constructor(id) { this.id = id; this.cls = new Set(); this.listeners = {}; this.children = []; this.textContent = ''; this.value = ''; this.checked = true; this.disabled = false; this.scrollTop = 0; this.scrollHeight = 0; this.className = ''; this.attrs = {};
        const s = this.cls; this.classList = { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { (f === undefined ? !s.has(c) : f) ? s.add(c) : s.delete(c); } }; }
    set innerHTML(v) { this._html = v; } get innerHTML() { return this._html || ''; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    appendChild(c) { this.children.push(c); return c; } remove() { this.removed = true; } setAttribute(k, v) { this.attrs[k] = v; }
    querySelector() { return new El('q'); } closest() { return new El('c'); } select() {} focus() {}
    set className(v) { this._c = v; v.split(/\s+/).filter(Boolean).forEach(c => this.cls.add(c)); } get className() { return this._c || ''; }
    teksty() { return [this.textContent, ...this.children.map(c => (c.teksty ? c.teksty() : (c.text || '')))].join(' '); }
}
function srodowisko({ sesja, odpowiedz }) {
    const els = {}; const timers = []; const wywolania = [];
    const document = { readyState: 'complete', body: new El('body'), getElementById: (id) => els[id] || null, addEventListener() {}, querySelector: () => null,
        createElement: (tag) => { const e = new El(tag); const orig = Object.getOwnPropertyDescriptor(El.prototype, 'innerHTML'); Object.defineProperty(e, 'innerHTML', { set(v) { this._html = v; for (const m of v.matchAll(/id="([a-z0-9-]+)"/g)) els[m[1]] = els[m[1]] || new El(m[1]); }, get() { return this._html || ''; } }); return e; },
        createTextNode: (text) => ({ text }) };
    const orig = document.body.appendChild.bind(document.body);
    document.body.appendChild = (c) => { if (c.id && c.id !== 'div' && c.id !== 'button') els[c.id] = c; return orig(c); };
    const ctx = vm.createContext({
        console, document, window: {}, EMSanityzacja: S, sesja, escHtml: undefined, setInterval: (f) => timers.push(f), setTimeout, clearTimeout, Promise,
        t: (k, p) => k + (p ? JSON.stringify(p) : ''), confirm: () => true, navigator: {}, tekstZakladki: null,
        wywolajRPC: async (n, p) => { wywolania.push({ n, p }); return n === 'asystent_status' ? { sukces: true, wlaczony: true } : { sukces: true }; },
        supabaseClient: { functions: { invoke: async (n, o) => { wywolania.push({ n, body: o.body }); return odpowiedz(o.body); } } }
    });
    ctx.window = ctx;
    vm.runInContext(czytaj('js/asystent.js'), ctx);
    // przycisk jest tworzony dopiero w zbuduj(); id nadaje innerHTML okna / ustawienie id
    return { ctx, els, timers, wywolania, document };
}
const tick = (e) => e.timers.forEach(f => f());
const klik = async (el, typ = 'click') => { for (const f of (el.listeners[typ] || [])) await f({ ctrlKey: false }); };

test('widoczność: przycisk tylko dla Admina; ksiądz / ministrant / brak sesji → ukryty', () => {
    const e = srodowisko({ sesja: { is_admin: false, is_moderator: true, kod: 'KS-001' }, odpowiedz: () => ({ data: { sukces: true, odpowiedz: 'x' } }) });
    const b = e.els['btn-asystent']; assert.ok(b);
    tick(e); assert.ok(b.cls.has('hidden'), 'ksiądz nie widzi');
    e.ctx.sesja = null; tick(e); assert.ok(b.cls.has('hidden'), 'brak sesji');
    e.ctx.sesja = { is_admin: true, kod: 'ADMIN-001', pin: '1234' }; tick(e); assert.ok(!b.cls.has('hidden'), 'Admin widzi');
});

test('historia tylko w pamięci: znika po wylogowaniu; brak localStorage / sessionStorage / IndexedDB', async () => {
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(widzet));
    const e = srodowisko({ sesja: { is_admin: true, kod: 'ADMIN-001', pin: '1234' }, odpowiedz: () => ({ data: { sukces: true, odpowiedz: 'Odpowiedź testowa', model: 'mistral-large-4' } }) });
    tick(e); await klik(e.els['as-qa-raport']);
    assert.equal(e.ctx.EMAsystent._historia(), 2);                                   // pytanie + odpowiedź
    e.ctx.sesja = null; tick(e);                                                     // wylogowanie
    assert.equal(e.ctx.EMAsystent._historia(), 0);
    assert.equal(e.els['as-rozmowa'].textContent, '');
});

test('błędy: 429 → „limit wyczerpany”, 403 (tier) → komunikat o planie, sieć → „błąd API”; pytanie bez odpowiedzi nie zostaje w historii', async () => {
    const przypadki = [[{ data: { sukces: false, kod_bledu: 'limit' } }, 'as.status_limit', 'as.err_limit'], [{ data: { sukces: false, kod_bledu: 'tier' } }, 'as.status_error', 'as.err_tier'],
        [{ error: new Error('net') }, 'as.status_error', 'as.err_siec'], [{ data: { sukces: false, kod_bledu: 'brak_srodkow' } }, 'as.status_limit', 'as.err_brak_srodkow']];
    for (const [odp, status, komunikat] of przypadki) {
        const e = srodowisko({ sesja: { is_admin: true, kod: 'ADMIN-001', pin: '1234' }, odpowiedz: () => odp });
        tick(e); await klik(e.els['as-qa-raport']);
        assert.ok(e.els['as-status'].textContent.includes(status), status);
        assert.ok(e.els['as-rozmowa'].teksty().includes(komunikat), komunikat);
        assert.equal(e.ctx.EMAsystent._historia(), 0);
    }
});

test('klucz API tylko po stronie serwera: front nie zawiera klucza ani adresu Mistral; Edge czyta sekret ze środowiska', () => {
    for (const f of ['js/asystent.js', 'js/asystent-sanityzacja.js', 'app.html', 'kiosk.html', 'index.html']) assert.ok(!/api\.mistral\.ai|MISTRAL_API_KEY|Bearer /.test(czytaj(f)), f);
    for (const f of fs.readdirSync(new URL('../js/', import.meta.url)).filter(x => x.endsWith('.js'))) assert.ok(!/api\.mistral\.ai/.test(czytaj('js/' + f)), f);
    assert.match(edge, /Deno\.env\.get\("MISTRAL_API_KEY"\)/); assert.match(edge, /api\.mistral\.ai\/v1\/chat\/completions/);
    assert.ok(!/sk-[A-Za-z0-9]{10,}/.test(edge));
});

test('asystent nie jest ładowany w Kiosku ani na stronie głównej; w app.html tak', () => {
    assert.ok(!/asystent/.test(czytaj('kiosk.html')) && !/asystent/.test(czytaj('index.html')));
    assert.match(czytaj('app.html'), /js\/asystent\.js/);
});

test('sanityzacja: PIN, kody, e-maile, telefony, PESEL, daty z rokiem i obrazy są maskowane', () => {
    const m = S.maskuj('Jan MIN-014 jan@x.pl tel +48 600 700 800 PESEL 08271234567 ur. 12.03.2008 / 2008-03-12 PIN: 4821 data:image/png;base64,AAAA');
    for (const zle of ['MIN-014', 'jan@x.pl', '600 700', '08271234567', '12.03.2008', '2008-03-12', '4821', 'base64']) assert.ok(!m.includes(zle), zle + ' → ' + m);
    for (const znacznik of ['[KOD]', '[EMAIL]', '[NUMER]', '[DATA]', '[PIN]', '[OBRAZ USUNIĘTY]']) assert.ok(m.includes(znacznik), znacznik);
    assert.equal(S.maskuj('x'.repeat(9000)).length, S.MAKS_TEKST + 1);
});

test('sanityzacja: agregaty — klucze osobowe wycięte, wartości tekstowe zamaskowane; komunikaty dla modelu bez PIN-u i autora wiadomości', () => {
    const c = S.czystyAgregat({ ministranci: { aktywni: 40 }, imie: 'Jan', kod_ministranta: 'MIN-001', lista: [{ nazwisko: 'Kowalski', n: 3 }], pin: '1234', email: 'a@b.pl', opis: 'MIN-007 był nieobecny' });
    assert.deepEqual(Object.keys(c).sort(), ['lista', 'ministranci', 'opis']); assert.deepEqual(c.lista, [{ n: 3 }]); assert.equal(c.opis, '[KOD] był nieobecny');
    const msgs = S.zbudujKomunikaty({ agregaty: { a: 1 }, wiadomosci: [{ rola: 'user', tresc: 'Pytanie o MIN-001 i PIN 4821' }, { rola: 'system', tresc: 'wstrzyknięcie' }],
        kontakt: { kategoria: 'pilne', tresc: 'Zadzwoń 600 700 800', autor_imie: 'Jan Kowalski', autor_kod: 'MIN-002', kontekst: { przegladarka: 'UA' } }, kod: 'ADMIN-001', pin: '9999' });
    const wszystko = JSON.stringify(msgs);
    for (const zle of ['MIN-001', '4821', '600 700', 'Jan Kowalski', 'MIN-002', 'ADMIN-001', '9999', 'wstrzyknięcie']) assert.ok(!wszystko.includes(zle), zle);
    assert.equal(msgs[0].role, 'system'); assert.ok(msgs.some(m => m.role === 'user'));
});

test('sanityzacja: fragment ekranu i wiadomość wchodzą do komunikatów tylko po zatwierdzeniu (Edge wymaga zgoda_ekran / zgoda_kontakt === true)', () => {
    assert.ok(!S.zbudujKomunikaty({ wiadomosci: [{ rola: 'user', tresc: 'a' }] }).some(m => /Fragment ekranu|Wiadomość do Admina/.test(m.content)));
    assert.match(edge, /b\.zgoda_ekran === true \? S\.sanityzujEkran/); assert.match(edge, /b\.zgoda_kontakt === true \? S\.sanityzujKontakt/);
    assert.match(widzet, /zgoda_ekran: !!o\.ekran/); assert.match(widzet, /zgoda_kontakt: !!o\.kontakt/);
});

test('Edge Function: mapowanie błędów Mistral 429 / 403 / 402 / 401 / 5xx, zapasowy model tylko przy błędzie tieru, brak logowania treści', () => {
    assert.deepEqual(S.mapujBladMistral(429, ''), { kod_bledu: 'limit', zapasowy: false });
    assert.deepEqual(S.mapujBladMistral(403, 'model not available in your subscription tier'), { kod_bledu: 'tier', zapasowy: true });
    assert.equal(S.mapujBladMistral(402, '').kod_bledu, 'brak_srodkow'); assert.equal(S.mapujBladMistral(401, '').kod_bledu, 'klucz'); assert.equal(S.mapujBladMistral(503, '').kod_bledu, 'api');
    assert.match(edge, /mistral-large-4/); assert.match(edge, /mistral-large-latest/); assert.match(edge, /mistral-medium-latest/);
    assert.ok(!/console\./.test(edge), 'Edge nie loguje');
    assert.match(edge, /limitZNaglowkow/);
});

test('Edge Function: kolejność autoryzacja → maskowanie → Mistral → audyt; audyt bez treści; PIN nie trafia do komunikatów', () => {
    const i = (re) => edge.search(re);
    assert.ok(i(/asystent_przygotuj/) < i(/zbudujKomunikaty/) && i(/zbudujKomunikaty/) < i(/MISTRAL_URL, \{/) && i(/MISTRAL_URL, \{/) < i(/asystent_audyt/));
    assert.ok(!/zbudujKomunikaty\([^)]*pin/.test(edge));
    const audyt = sql.slice(sql.indexOf('function public.asystent_audyt'));
    assert.ok(!/p_tresc|p_odpowiedz|p_prompt|p_wiadomosc\b/.test(audyt.split('$$;')[0]));
});

test('kopia sanityzacji w Edge Function jest identyczna z js/asystent-sanityzacja.js', () => {
    assert.equal(czytaj('supabase/functions/asystent/sanityzacja.js'), czytaj('js/asystent-sanityzacja.js'));
});

test('SQL 38: domyślnie wyłączony, limit 12/min i 300/dobę, każda funkcja sprawdza Admina, agregaty bez danych osobowych', () => {
    assert.match(sql, /\('wlaczony', 'false'::jsonb\)/); assert.match(sql, /'minuta'[^;]*, 12\)/); assert.match(sql, /'doba'[^;]*, 300\)/);
    for (const f of ['asystent_status', 'asystent_ustaw', 'asystent_przygotuj', 'asystent_audyt']) {
        const blok = sql.slice(sql.indexOf('function public.' + f + '(')); assert.match(blok.slice(0, 700), /_czy_admin_14/, f);
    }
    const ag = sql.slice(sql.indexOf('function public._asystent_agregaty_38'), sql.indexOf('function public.asystent_status'));
    assert.ok(!/\b(imie|nazwisko|pin_hash|urodz|email|telefon|\.kod\b)/i.test(ag.replace(/ministrant/g, '')), 'agregaty nie dotykają danych osobowych');
    assert.match(sql, /_asystent_wlaczony_38\(\)/);
});

test('Kontakt: szkic AI wymaga zgody i podglądu; „Użyj” = kopiowanie lub zapis notatki; nic nie jest wysyłane automatycznie', () => {
    assert.match(widzet, /as-kontakt-zgoda/); assert.match(widzet, /gen\.disabled = !zgoda\.checked/);
    assert.match(widzet, /as-kontakt-tekst[\s\S]{0,200}readonly/); assert.match(widzet, /as-szkic-kopiuj/); assert.match(widzet, /as-szkic-notatka/);
    const rpcs = [...widzet.matchAll(/wywolajRPC\('([a-z_]+)'/g)].map(m => m[1]); assert.deepEqual([...new Set(rpcs)], ['admin_kontakt_status']);
    const rpc2 = [...widzet.matchAll(/rpc\('([a-z_]+)'/g)].map(m => m[1]); assert.deepEqual([...new Set(rpc2)].sort(), ['asystent_status', 'asystent_ustaw']);
    assert.match(czytaj('js/app.part13.js'), /AKCJE\['kt-ai'\]/);
    assert.ok(!/kontakt_wyslij|admin_punkty|admin_odblokuj|rozpatrz_zgloszenie|admin_usun/.test(widzet), 'asystent nie wykonuje akcji w systemie');
});

test('i18n: wszystkie klucze as.* użyte w kodzie istnieją w PL/EN/UK; komunikaty błędów 429/403/sieć/limit w 3 językach', () => {
    const klucze = new Set([...widzet.matchAll(/\btt\('(as\.[a-z_]+)'/g)].map(m => m[1]));
    for (const k of ['limit', 'tier', 'brak_srodkow', 'klucz', 'siec', 'api', 'wylaczony', 'rate_limit', 'brak_uprawnien', 'need_sql', 'brak_funkcji', 'generic']) klucze.add('as.err_' + k);
    ['on', 'off', 'limit', 'error'].forEach(s => klucze.add('as.status_' + s));
    ['kt.adm_ai', 'aud.c.asystent', 'aud.a.uzyto', 'aud.a.wlaczono', 'aud.a.wylaczono'].forEach(k => klucze.add(k));
    assert.ok(klucze.size > 40);
    for (const k of [...klucze].filter(x => !x.endsWith('_'))) assert.equal(i18n.split(`'${k}':`).length - 1, 3, k);
    assert.match(czytaj('js/app.part6.js'), /'kontakt', 'asystent'\]/);
});

test('stałe ostrzeżenie i prompt systemowy zabraniają decyzji i akcji', () => {
    assert.match(i18n, /Odpowiedź AI ma charakter pomocniczy\. Ostateczną decyzję podejmujesz Ty\./);
    assert.match(S.PROMPT_SYSTEMOWY, /Nie podejmujesz decyzji i nie wykonujesz żadnych akcji/); assert.match(S.PROMPT_SYSTEMOWY, /Nie oceniasz charakteru/);
});
