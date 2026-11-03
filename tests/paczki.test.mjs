// Testy paczkowania (v2.15.04): czyste funkcje js/paczki.js + WŁAŚCIWY kod synchronizacji z js/kiosk.js w vm z atrapą serwera.
// Atrapa modeluje kontrakt kiosk_zapisz_paczke (sql/37) — NIE jest testem SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const M = require('../js/bezpieczny-magazyn.js');
const P = require('../js/paczki.js');
const src = fs.readFileSync(new URL('../js/kiosk.js', import.meta.url), 'utf8');
const kodSync = src.slice(src.indexOf('async function probojSynchronizacje()'), src.indexOf('// ---------------------------------------------- Stan połączenia'));
const sql = fs.readFileSync(new URL('../sql/37_paczki_rate_limit_v2_15_04.sql', import.meta.url), 'utf8');
P.czekajRateLimit = async () => {};   // bez 15–30 s w testach

const it = (i, rodzaj = 'obecnosc_token', extra = {}) => ({ id: 'op-' + String(i).padStart(4, '0'), rodzaj, kiedy_lokalnie: new Date(Date.UTC(2026, 9, 1, 8, 0, i)).toISOString(),
    payload: rodzaj === 'obecnosc_token' ? { p_kod: 'MIN-' + String(i).padStart(3, '0'), p_wydarzenie_id: 17, p_wybor: 'auto', p_kiedy_klient: '2026-10-01T08:00:00Z', ...extra }
        : rodzaj === 'obecnosc' ? { p_kod: 'MIN-001', p_pin: '4821', p_wydarzenie_id: 17, p_wybor: 'auto', ...extra }
        : { p_kod: 'MIN-001', p_pin: '4821', p_typ: 'pogrzeb', p_kod_plakietki: 'B-1', ...extra }, meta: {} });

test('podział: 12 wpisów → paczki 5 + 5 + 2, od najstarszego do najnowszego', () => {
    const lista = Array.from({ length: 12 }, (_, i) => it(i + 1)).reverse();   // wejście w odwrotnej kolejności
    const p = P.podzielNaPaczki(lista, { kioskId: 'k1', token: 'T' });
    assert.deepEqual(p.map(x => x.items.length), [5, 5, 2]);
    assert.deepEqual(p.flatMap(x => x.items.map(i => i.id)), Array.from({ length: 12 }, (_, i) => 'op-' + String(i + 1).padStart(4, '0')));
});

test('podział: limit 8 KB — duże wpisy zamykają paczkę wcześniej niż po 5 sztukach; żadna paczka nie przekracza 8192 B', () => {
    const duzy = 'X'.repeat(1900);
    const lista = Array.from({ length: 7 }, (_, i) => it(i + 1, 'obecnosc_token', { p_kod: duzy }));
    const p = P.podzielNaPaczki(lista, { kioskId: 'kiosk-1', token: 'TOKEN' });
    assert.ok(p.length >= 2 && p.every(x => x.items.length < 5));
    for (const x of p) assert.ok(P.rozmiarBody('kiosk-1', 'TOKEN', x.rodzaj, x.wpisy) <= 8192, 'rozmiar ' + x.bajty);
    assert.equal(p.reduce((n, x) => n + x.items.length, 0), 7);
});

test('podział: różne rodzaje operacji nie mieszają się w jednej paczce', () => {
    const lista = [it(1, 'obecnosc'), it(2, 'obecnosc_token'), it(3, 'zgloszenie'), it(4, 'obecnosc'), it(5, 'obecnosc_token')];
    const p = P.podzielNaPaczki(lista, { kioskId: 'k', token: 'T' });
    assert.equal(p.length, 3);
    for (const x of p) assert.ok(x.items.every(i => i.rodzaj === x.rodzaj));
    assert.deepEqual(p.map(x => x.rodzaj), ['obecnosc', 'obecnosc_token', 'zgloszenie']);   // kolejność wg najstarszego wpisu
});

test('ocena odpowiedzi: sieć, rate_limit, brak funkcji, token, wyniki per id', () => {
    const paczka = { items: [it(1), it(2), it(3)] };
    assert.equal(P.ocenOdpowiedz(paczka, { siec: true }).typ, 'siec');
    assert.equal(P.ocenOdpowiedz(paczka, { sukces: false, kod_bledu: 'rate_limit' }).typ, 'rate_limit');
    assert.equal(P.ocenOdpowiedz(paczka, { sukces: false, kod_pg: 'PGRST202' }).typ, 'brak_funkcji');
    assert.equal(P.ocenOdpowiedz(paczka, { sukces: false, kod_bledu: 'token_nieprawidlowy' }).typ, 'token');
    const o = P.ocenOdpowiedz(paczka, { sukces: true, wyniki: [{ id: 'op-0001', sukces: true, duplikat: false }, { id: 'op-0002', sukces: false, kod_bledu: 'zly_pin', blad: 'x' }] });
    assert.equal(o.typ, 'wyniki'); assert.equal(o.wyniki.length, 2); assert.equal(o.bez_odpowiedzi.length, 1);
});

// ------------------------------------------------------------------ integracja z kiosk.js ---
function srodowisko(serwerPaczek) {
    const magazyn = M.utworz({ adapter: M.MemAdapter(), crypto: webcrypto });
    const wywolania = [];
    const ctx = vm.createContext({
        magazyn, console, EMPaczki: P, wywolania,
        sprawdzPolaczenie: async () => true, ustawStanPolaczenia() {}, odswiezTekstyEkranu() {}, odswiezStatusKiosku() {}, wyslijAudytRetencji: async () => {}, zapiszSkanPlakietki() {},
        ID_KIOSKU: 'kiosk-test', KLUCZ_TOKEN_KIOSKU: 'em_kiosk_token', localStorage: { getItem: (k) => (k === 'em_kiosk_token' ? 'TOKEN-OK' : null) },
        jestZakonczony: (z) => z.status === M.ST.OK || z.status === M.ST.DO_AKCEPTACJI || (z.status || '').startsWith('pominięte'),
        wywolajRPC: async (nazwa, p) => { wywolania.push({ nazwa, p }); return serwerPaczek(nazwa, p); }
    });
    vm.runInContext(`let synchronizacjaWTrakcie = false; let idemDostepne = true; let paczkiDostepne = true; let synchronizacjaLimitDo = 0; let kolejkaPamiec = []; const ST_OCZEKUJE = '${M.ST.OCZEKUJE}'; const ST_PRZET = '${M.ST.PRZETERMINOWANE}';\n${kodSync}`, ctx);
    return { ctx, magazyn, wywolania };
}
const wczytaj = async (e) => { e.ctx.__k = await e.magazyn.wczytajKolejke(); vm.runInContext('kolejkaPamiec = __k', e.ctx); };
const dodaj = async (e, n, rodzaj = 'obecnosc_token') => { for (let i = 1; i <= n; i++) await e.magazyn.dodaj(rodzaj, rodzaj === 'obecnosc_token' ? { p_kod: 'MIN-' + String(i).padStart(3, '0'), p_wydarzenie_id: 17, p_wybor: 'auto', p_kiedy_klient: '2026-10-01T08:00:00Z' } : { p_kod: 'M' + i, p_pin: '4821', p_wydarzenie_id: 17 + i, p_wybor: 'auto' }); };
const stany = async (e) => (await e.magazyn.wczytajKolejke()).map(x => ({ status: x.status, proby: x.proby_synchronizacji }));

test('integracja: 12 wpisów → 3 wywołania kiosk_zapisz_paczke (5/5/2), wszystkie ACK', async () => {
    const e = srodowisko((nazwa, p) => ({ sukces: true, wyniki: p.p_wpisy.map(w => ({ id: w.id, sukces: true, duplikat: false })) }));
    await e.magazyn.init(); await dodaj(e, 12); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    assert.deepEqual(e.wywolania.map(w => w.p.p_wpisy.length), [5, 5, 2]);
    assert.ok((await stany(e)).every(s => s.status === M.ST.OK));
});

test('integracja: częściowy sukces — ACK tylko wpisów z sukces:true (duplikat = sukces), reszta dostaje błąd', async () => {
    const e = srodowisko((nazwa, p) => ({ sukces: true, wyniki: p.p_wpisy.map((w, i) => i === 1 ? { id: w.id, sukces: false, kod_bledu: 'poza_oknem', blad: 'Poza oknem zapisu obecności dla tego wydarzenia.' } : { id: w.id, sukces: true, duplikat: i === 2 }) }));
    await e.magazyn.init(); await dodaj(e, 4); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    const s = await stany(e);
    assert.equal(s.filter(x => x.status === M.ST.OK).length, 3);
    const zly = s.find(x => x.status !== M.ST.OK); assert.equal(zly.proby, 1);
});

test('integracja: błąd sieci całej paczki → żadnego ACK, wpisy czekają, próby bez zmian, synchronizacja się przerywa', async () => {
    const e = srodowisko(() => ({ sukces: false, siec: true, blad: 'Błąd połączenia' }));
    await e.magazyn.init(); await dodaj(e, 7); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    assert.equal(e.wywolania.length, 1);   // pierwsza paczka — dalej nie idziemy
    assert.ok((await stany(e)).every(s => s.status === M.ST.OCZEKUJE && s.proby === 0));
});

test('integracja: rate_limit NIE podbija proby_synchronizacji, po odczekaniu paczka przechodzi', async () => {
    let n = 0;
    const e = srodowisko((nazwa, p) => (++n <= 2 ? { sukces: false, kod_bledu: 'rate_limit', blad: 'Zbyt wiele paczek. Spróbuj za chwilę.' } : { sukces: true, wyniki: p.p_wpisy.map(w => ({ id: w.id, sukces: true })) }));
    await e.magazyn.init(); await dodaj(e, 3); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    assert.equal(e.wywolania.length, 3);   // 2× rate_limit + 1× sukces
    assert.ok((await stany(e)).every(s => s.status === M.ST.OK && s.proby === 0));
});

test('integracja: stały rate_limit — po 3 próbach wracamy później, wpisy nietknięte (0 prób)', async () => {
    const e = srodowisko(() => ({ sukces: false, kod_bledu: 'rate_limit', blad: 'Zbyt wiele paczek. Spróbuj za chwilę.' }));
    await e.magazyn.init(); await dodaj(e, 6); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    assert.equal(e.wywolania.length, 3);
    assert.ok((await stany(e)).every(s => s.status === M.ST.OCZEKUJE && s.proby === 0));
});

test('integracja: serwer bez sql/37 (PGRST202) → wpisy lecą po jednym starą ścieżką (zgodność wsteczna)', async () => {
    const e = srodowisko((nazwa, p) => (nazwa === 'kiosk_zapisz_paczke' ? { sukces: false, kod_pg: 'PGRST202', blad: 'brak' } : { sukces: true }));
    await e.magazyn.init(); await dodaj(e, 3); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    assert.equal(e.wywolania.filter(w => w.nazwa === 'kiosk_zapisz_obecnosc_token').length, 3);
    assert.ok((await stany(e)).every(s => s.status === M.ST.OK));
});

test('integracja: wpis bez odpowiedzi w wynikach → bez ACK i bez podbicia prób', async () => {
    const e = srodowisko((nazwa, p) => ({ sukces: true, wyniki: p.p_wpisy.slice(0, 1).map(w => ({ id: w.id, sukces: true })) }));
    await e.magazyn.init(); await dodaj(e, 3); await wczytaj(e);
    await e.ctx.probojSynchronizacje();
    const s = await stany(e);
    assert.equal(s.filter(x => x.status === M.ST.OK).length, 1);
    assert.ok(s.filter(x => x.status === M.ST.OCZEKUJE).every(x => x.proby === 0));
});

// ------------------------------------------------------------------ serwer (kontrakt SQL — sprawdzenie tekstu, SQL nie był uruchamiany) ---
test('SQL 37: limit 25 przy 1–2 aktywnych kioskach, 20 przy ≥ 3; aktywny = 10 minut; liczniki wysyłania i cache osobne', () => {
    assert.match(sql, /case when public\._kiosk_aktywne_37\(\) >= 3 then 20 else 25 end/);
    assert.match(sql, /interval '10 minutes'/);
    assert.match(sql, /rodzaj in \('wysylka', 'cache'\)/);
    assert.match(sql, /_kiosk_licznik_37\(p_kiosk_id, 'cache', 10\)/);
    assert.match(sql, /_kiosk_licznik_37\(p_kiosk_id, 'wysylka', v_limit\)/);
});

test('SQL 37: kolejność — token, rozmiar, limit, dopiero wpisy; rate_limit ma wymagany kształt; wpisy w podblokach', () => {
    const f = sql.slice(sql.indexOf('function public.kiosk_zapisz_paczke'));
    const i = (re) => f.search(re);
    assert.ok(i(/_kiosk_token_ok_37/) < i(/jsonb_array_length\(p_wpisy\) > 5/) && i(/jsonb_array_length\(p_wpisy\) > 5/) < i(/_kiosk_licznik_37/) && i(/_kiosk_licznik_37/) < i(/jsonb_array_elements\(p_wpisy\)/));
    assert.match(sql, /'kod_bledu', 'rate_limit', 'blad', 'Zbyt wiele paczek\. Spróbuj za chwilę\.'/);
    assert.match(f, /exception when others then/);
    assert.match(f, /'duplikat', v_dupl/);
    assert.match(sql, /octet_length\(p_wpisy::text\) > 9216/);
});

test('SQL 37: ping bez limitu, stare funkcje nietknięte (nie ma create or replace dla starych nazw)', () => {
    for (const stara of ['zapisz_obecnosc_idem', 'zglos_obecnosc_specjalna_idem', 'kiosk_zapisz_obecnosc_token', 'kiosk_audyt_retencji', 'kiosk_pobierz_cache_v23', 'kiosk_ping'])
        assert.ok(!new RegExp('create or replace function public\\.' + stara + '\\(').test(sql), stara);
});

test('v2.15.04: paczki.js ładowany w kiosk.html i cache\'owany przez service worker; komunikat i18n w 3 językach', () => {
    assert.match(fs.readFileSync(new URL('../kiosk.html', import.meta.url), 'utf8'), /js\/paczki\.js/);
    assert.match(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), /js\/paczki\.js/);
    const i18n = fs.readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');
    assert.equal(i18n.split("'k.sync_rate_limit':").length - 1, 3);
});
