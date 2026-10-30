// Testy rozszerzeń Asystenta (v2.15.06): poranny przegląd, diagnostyka kiosku, procedury, anomalie, raport miesięczny + lokalna poprawa list papierowych.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../js/asystent-sanityzacja.js');
const L = require('../js/lista-poprawki.js');
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bez = (t) => t.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
const widzet = bez(czytaj('js/asystent.js')), sql = czytaj('sql/39_asystent_rozszerzenia_v2_15_06.sql'), edge = bez(czytaj('supabase/functions/asystent/index.ts')), i18n = czytaj('js/i18n.js'), part9 = czytaj('js/app.part9.js');

// ---- minimalna atrapa DOM (jak w asystent.test.mjs) ----
class El { constructor(id) { this.id = id; this.cls = new Set(); this.listeners = {}; this.children = []; this.textContent = ''; this.value = ''; this.checked = true; this.disabled = false;
    const s = this.cls; this.classList = { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { (f === undefined ? !s.has(c) : f) ? s.add(c) : s.delete(c); } }; }
    set className(v) { this._c = v; v.split(/\s+/).filter(Boolean).forEach(c => this.cls.add(c)); } get className() { return this._c || ''; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } appendChild(c) { this.children.push(c); return c; } remove() {} setAttribute() {}
    querySelector() { return new El('q'); } closest() { return new El('c'); } select() {} focus() {} }
function srodowisko() {
    const els = {}, timers = [], wywolania = [];
    const document = { readyState: 'complete', body: new El('body'), getElementById: (id) => els[id] || null, addEventListener() {}, querySelector: () => null,
        createElement: () => { const e = new El('x'); Object.defineProperty(e, 'innerHTML', { set(v) { for (const m of v.matchAll(/id="([a-z0-9-]+)"/g)) els[m[1]] = els[m[1]] || new El(m[1]); }, get() { return ''; } }); return e; }, createTextNode: (text) => ({ text }) };
    const orig = document.body.appendChild.bind(document.body);
    document.body.appendChild = (c) => { if (c.id && c.id !== 'x') els[c.id] = c; return orig(c); };
    const ctx = vm.createContext({ console, document, EMSanityzacja: S, sesja: { is_admin: true, kod: 'ADMIN-001', pin: '1234' }, setInterval: (f) => timers.push(f), setTimeout, clearTimeout, Promise,
        t: (k, p) => k + (p ? JSON.stringify(p) : ''), confirm: () => true, navigator: {}, wywolajRPC: async () => ({ sukces: true, wlaczony: true }),
        supabaseClient: { functions: { invoke: async (n, o) => { wywolania.push(o.body); return { data: { sukces: true, odpowiedz: 'OK' } }; } } } });
    ctx.window = ctx; vm.runInContext(czytaj('js/asystent.js'), ctx); timers.forEach(f => f());
    return { els, wywolania };
}
const klik = async (el) => { for (const f of (el.listeners.click || [])) await f({}); };

test('poranny przegląd i anomalie: właściwy zakres danych, dane systemowe włączone, bez fragmentów ekranu', async () => {
    const e = srodowisko();
    await klik(e.els['as-qa-poranny']); await klik(e.els['as-qa-anom']);
    assert.equal(e.wywolania.length, 2);
    assert.deepEqual([e.wywolania[0].zakres, e.wywolania[0].uzyj_danych, e.wywolania[0].wiedza], ['podstawowy', true, true]);
    assert.deepEqual([e.wywolania[1].zakres, e.wywolania[1].uzyj_danych, e.wywolania[1].wiedza], ['trendy', true, false]);
    for (const b of e.wywolania) { assert.equal(b.zgoda_ekran, false); assert.equal(b.zgoda_kontakt, false); assert.equal(b.ekran, null); }
    assert.match(e.wywolania[0].wiadomosci[0].tresc, /as\.q_morning|poranny/i);
});

test('wszystkie pięć nowych szybkich akcji istnieje i jest podpięte; modale wymagają zgody tam, gdzie wychodzi tekst z ekranu', () => {
    for (const id of ['as-qa-poranny', 'as-qa-kiosk', 'as-qa-proc', 'as-qa-anom', 'as-qa-miesiac']) { assert.ok(widzet.includes(`id="${id}"`), id); assert.ok(widzet.includes(`el('${id}').addEventListener`), id); }
    assert.match(widzet, /as-kiosk-zgoda/); assert.match(widzet, /wyslij\.disabled = !zgoda\.checked/);
    assert.match(widzet, /zakres: 'miesiac', rok: Number\(m\[1\]\), miesiac: Number\(m\[2\]\)/);
    assert.match(widzet, /className = 'as-kopiuj'/);                       // kopiowanie raportu — bez wysyłania
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(widzet));
});

test('diagnostyka kiosku: kiosk jest anonimowy (numer, bez nazwy / identyfikatora), dane diagnostyczne przechodzą przez czystyAgregat i maskowanie', () => {
    const zloz = widzet.slice(widzet.indexOf('const zloz = () =>'), widzet.indexOf('sel.addEventListener(\'change\', zloz)'));
    assert.ok(!/k\.nazwa|k\.kiosk_id|k\.id\b/.test(zloz), 'bez nazwy i identyfikatora kiosku');
    assert.match(zloz, /S\.czystyAgregat\(dane\)/); assert.match(zloz, /S\.maskuj\(/);
    const diag = S.czystyAgregat({ kolejka: 3, wersja: '2.15.06', kod_kiosku: 'K-1', token: 'abc', pin: '1234', uzytkownik_email: 'a@b.pl', baterie: { poziom: 80 } });
    assert.deepEqual(Object.keys(diag).sort(), ['baterie', 'kolejka', 'wersja']);
});

test('wiedza o systemie i zakresy danych w komunikatach dla modelu', () => {
    const bezWiedzy = S.zbudujKomunikaty({ wiadomosci: [{ rola: 'user', tresc: 'a' }] });
    const zWiedza = S.zbudujKomunikaty({ wiedza: true, wiadomosci: [{ rola: 'user', tresc: 'a' }] });
    assert.ok(!bezWiedzy.some(m => /Wiedza o systemie/.test(m.content))); assert.ok(zWiedza.some(m => /Wiedza o systemie/.test(m.content) && /36/.test(m.content) && /25 paczek/.test(m.content)));
    assert.match(S.WIEDZA_SYSTEMU, /nie masz pewności|nie masz pewnosci/);
    const mies = S.zbudujKomunikaty({ agregaty: { obecnosci: { wpisy_obecnosci: 120 } }, zakres: 'miesiac', wiadomosci: [{ rola: 'user', tresc: 'raport' }] });
    assert.ok(mies.some(m => /za wybrany miesiąc/.test(m.content) && /120/.test(m.content)));
    assert.ok(S.ZAKRESY.includes('trendy') && S.ZAKRESY.includes('miesiac') && S.ZAKRESY.includes('podstawowy'));
    assert.equal(czytaj('js/asystent-sanityzacja.js'), czytaj('supabase/functions/asystent/sanityzacja.js'));
});

test('Edge Function: zakres tylko z listy dozwolonych, rok i miesiąc jako liczby całkowite, dłuższa odpowiedź dla raportu', () => {
    assert.match(edge, /S\.ZAKRESY\.includes\(b\.zakres\)/); assert.match(edge, /Number\.isInteger\(b\.rok\)/); assert.match(edge, /Number\.isInteger\(b\.miesiac\)/);
    assert.match(edge, /p_zakres: zakres, p_rok: rok, p_miesiac: miesiac/); assert.match(edge, /max_tokens: zakres === "miesiac" \? 1400 : 900/);
});

test('SQL 39: usuwa starą 3-argumentową asystent_przygotuj, waliduje zakres i miesiąc, zachowuje kolejność Admin → flaga → limit', () => {
    assert.match(sql, /drop function ' \|\| r\.f/); assert.match(sql, /p_zakres text default 'podstawowy', p_rok int default null, p_miesiac int default null/);
    assert.match(sql, /not in \('podstawowy', 'trendy', 'miesiac'\)/); assert.match(sql, /v_rok < 2000 or v_rok > 2100 or v_mies < 1 or v_mies > 12/);
    const f = sql.slice(sql.indexOf('create or replace function public.asystent_przygotuj'));
    const i = (re) => f.search(re); assert.ok(i(/_czy_admin_14/) < i(/_asystent_wlaczony_38/) && i(/_asystent_wlaczony_38/) < i(/_asystent_licznik_38/) && i(/_asystent_licznik_38/) < i(/_asystent_miesiac_38\(v_rok/));
    assert.match(sql, /grant execute on function public\.asystent_przygotuj\(text, text, boolean, text, int, int\)/);
});

test('SQL 39: trendy i raport miesięczny to same liczby; kioski anonimowe; brak kolumn osobowych w wynikach', () => {
    const calosc = sql.slice(sql.indexOf('function public._asystent_trendy_38'), sql.indexOf('-- ------------------------------------------------------------------ asystent_przygotuj'));
    assert.match(calosc, /'kiosk_' \|\| r/); assert.ok(!/jsonb_build_object\([^)]*kiosk_id/.test(calosc), 'identyfikator kiosku nie trafia do wyniku');
    assert.ok(!/\b(imie|nazwisko|pin_hash|urodz|email|telefon)\b/i.test(calosc)); assert.ok(!/select[^;]*\bm\.kod\b/i.test(calosc));
    assert.match(calosc, /count\(distinct o\.ministrant_id\)/);            // liczba unikalnych, nie lista
    assert.match(calosc, /make_timestamptz\(p_rok, p_miesiac, 1, 0, 0, 0, 'Europe\/Warsaw'\)/);
});

test('lokalna poprawa list: pomylone znaki dopasowują się do JEDNEGO znanego kodu; niejednoznaczne i znane kody są zostawiane', () => {
    const znane = ['MIN-001', 'MIN-014', 'MIN-015', 'MIN-100'];
    assert.equal(L.znajdzPodobnyKod('MIN-0I4', znane), 'MIN-014');          // I ↔ 1
    assert.equal(L.znajdzPodobnyKod('MlN-014', znane), 'MIN-014');          // l ↔ I
    assert.equal(L.znajdzPodobnyKod('MIN-014', znane), null);                // już znany
    assert.equal(L.znajdzPodobnyKod('MIN-999', znane), null);                // za daleko
    assert.equal(L.znajdzPodobnyKod('MIN-01', ['MIN-014', 'MIN-015']), null); // niejednoznaczne
    assert.ok(L.odleglosc('MIN0', 'MINO') <= 0.5);
    assert.deepEqual(L.znajdzDuplikaty(['MIN-001', 'MIN-002', 'min-001', null, 'MIN-002']), [2, 4]);
});

test('lista papierowa: poprawka kodu to tylko podpowiedź (niezaznaczona), ręczna edycja omija dopasowanie, duplikaty oznaczone; ŻADNEGO AI ani wysyłania obrazów', () => {
    assert.match(part9, /w\.dolacz = \(\(w\.status === 'ok' \|\| w\.status === 'niepewny'\) && !w\.poprawiono\)/);
    assert.match(part9, /!w\.reczne && typeof EMListaPoprawki/); assert.match(part9, /w\.reczne = true/);
    assert.match(part9, /oznaczDuplikatyListy\(\);\n\s*\$\('lst-wyniki'\)/);
    for (const f of ['js/app.part9.js', 'js/lista-poprawki.js']) assert.ok(!/functions\.invoke|asystent|mistral|EMSanityzacja/i.test(bez(czytaj(f))), f + ' nie wysyła nic na zewnątrz');
    assert.match(czytaj('app.html'), /js\/lista-poprawki\.js/); assert.match(czytaj('sw.js'), /js\/lista-poprawki\.js/);
});

test('i18n: nowe klucze (akcje, procedury, raport, kiosk, lista) w PL/EN/UK', () => {
    const klucze = new Set([...widzet.matchAll(/\btt\('(as\.[a-z_0-9]+)'/g)].map(m => m[1]).filter(k => !k.endsWith('_')));
    for (const t of ['sync', 'acc36', 'kiosk_lost', 'token', 'pin_lock', 'rodo', 'month_close', 'retention']) klucze.add('as.proc_' + t);
    ['lst.fixed_from', 'lst.duplicate', 'as.copy_short'].forEach(k => klucze.add(k));
    for (const k of klucze) assert.equal(i18n.split(`'${k}':`).length - 1, 3, k);
    assert.ok(klucze.size > 55);
});

test('wersja 2.15.07', () => assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.15\.07'/));
