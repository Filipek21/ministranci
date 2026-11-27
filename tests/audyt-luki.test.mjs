// Testy v2.15.16 (audyt luk): kanał Kiosk → serwer z tokenem (sql/41–42), twardszy service worker i Edge Function.
// SQL nie jest uruchamiany (brak PostgreSQL) — testy sprawdzają treść skryptów i zachowanie klienta w vm.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('sql/41: każdy wariant v2 weryfikuje token PRZED wywołaniem starej funkcji; pomocnik niedostępny z zewnątrz', () => {
    const s = czytaj('sql/41_kiosk_polecenia_token_v2_15_16.sql');
    for (const n of ['kiosk_polecenia_pobierz_v2', 'kiosk_polecenie_wynik_v2', 'kiosk_pobierz_zadania_v2', 'kiosk_odpowiedz_ping_v2']) assert.match(s, new RegExp('function public\\.' + n));
    assert.equal((s.match(/_kiosk_token_ok_41\(p_kiosk_id, p_token/g) || []).length, 4);
    assert.match(s, /crypt\(p_token, wpis\.token_hash\)/);
    assert.match(s, /revoke all on function public\._kiosk_token_ok_41\(text, text, boolean\) from public, anon, authenticated/);
    assert.match(s, /security definer set search_path = public, extensions/);
    assert.ok(!/drop function/i.test(s), 'krok 1 niczego nie usuwa');
    // polecenia/blokada dostępne także dla wygasłego tokenu (żeby dało się zablokować skradziony Kiosk), reszta tylko dla ważnego
    assert.match(s, /kiosk_polecenia_pobierz_v2[\s\S]*?_kiosk_token_ok_41\(p_kiosk_id, p_token, true\)/);
    assert.match(s, /kiosk_pobierz_zadania_v2[\s\S]*?_kiosk_token_ok_41\(p_kiosk_id, p_token, false\)/);
});

test('sql/42: odbiera dostęp tylko do 4 starych funkcji, po sprawdzeniu że v2 istnieją; z opisem cofnięcia', () => {
    const s = czytaj('sql/42_kiosk_zamknij_stare_polecenia_v2_15_16.sql');
    assert.match(s, /to_regprocedure\('public\.kiosk_polecenia_pobierz_v2\(text, text\)'\) is null/);
    for (const f of ['kiosk_polecenia_pobierz(text)', 'kiosk_polecenie_wynik(text, bigint, jsonb)', 'kiosk_pobierz_zadania(text)', 'kiosk_odpowiedz_ping(text, bigint, jsonb)']) assert.ok(s.includes('public.' + f), f);
    assert.match(s, /revoke all on function %s from public, anon, authenticated/);
    assert.ok(!/drop function|delete from|truncate/i.test(s)); assert.match(s, /COFNIĘCIE/);
});

// --- klient: wywolajRPCKiosku w vm z atrapą wywolajRPC ---
function srodowisko(token) {
    const wywolania = []; let tryb = 'v2_ok';
    const ctx = vm.createContext({
        console, EMSekrety: token === undefined ? undefined : { pobierz: () => token },
        wywolajRPC: async (n, p) => { wywolania.push({ n, p }); if (tryb === 'v2_brak' && n.endsWith('_v2')) return { sukces: false, kod_pg: 'PGRST202' }; if (tryb === 'token_zly' && n.endsWith('_v2')) return { sukces: false, kod_bledu: 'token_nieprawidlowy' }; return { sukces: true, n }; }
    });
    const src = czytaj('js/supabase-client.js'); const od = src.indexOf('const KIOSK_RPC_V2');
    assert.ok(od > 0);
    vm.runInContext(src.slice(od) + '\nthis.__f = wywolajRPCKiosku;', ctx);
    return { f: ctx.__f, wywolania, ustaw: (t) => { tryb = t; } };
}
test('wywolajRPCKiosku: z tokenem woła *_v2 z p_token; bez tokenu — starą funkcję', async () => {
    const a = srodowisko('TOK'); await a.f('kiosk_polecenia_pobierz', { p_kiosk_id: 'K1' });
    assert.deepEqual(a.wywolania.map(x => x.n), ['kiosk_polecenia_pobierz_v2']); assert.equal(a.wywolania[0].p.p_token, 'TOK'); assert.equal(a.wywolania[0].p.p_kiosk_id, 'K1');
    const b = srodowisko(null); await b.f('kiosk_polecenia_pobierz', { p_kiosk_id: 'K1' }); assert.deepEqual(b.wywolania.map(x => x.n), ['kiosk_polecenia_pobierz']);
    const c = srodowisko(undefined); await c.f('kiosk_pobierz_zadania', { p_kiosk_id: 'K1' }); assert.deepEqual(c.wywolania.map(x => x.n), ['kiosk_pobierz_zadania']);
});
test('wywolajRPCKiosku: serwer bez sql/41 → zapas na starą funkcję i zapamiętanie (bez ponawiania v2 co 5 s)', async () => {
    const a = srodowisko('TOK'); a.ustaw('v2_brak');
    const w = await a.f('kiosk_polecenie_wynik', { p_kiosk_id: 'K1', p_id: 7, p_wynik: {} }); assert.equal(w.sukces, true);
    assert.deepEqual(a.wywolania.map(x => x.n), ['kiosk_polecenie_wynik_v2', 'kiosk_polecenie_wynik']);
    await a.f('kiosk_polecenie_wynik', { p_kiosk_id: 'K1', p_id: 8 }); assert.deepEqual(a.wywolania.map(x => x.n).slice(2), ['kiosk_polecenie_wynik']);
});
test('wywolajRPCKiosku: odrzucony token NIE wraca do starej funkcji; inne funkcje nie dostają p_token', async () => {
    const a = srodowisko('ZLY'); a.ustaw('token_zly'); const w = await a.f('kiosk_polecenia_pobierz', { p_kiosk_id: 'K1' });
    assert.equal(w.kod_bledu, 'token_nieprawidlowy'); assert.deepEqual(a.wywolania.map(x => x.n), ['kiosk_polecenia_pobierz_v2']);
    const b = srodowisko('TOK'); await b.f('zapisz_obecnosc', { p_kod: 'M1' }); assert.deepEqual(b.wywolania.map(x => x.n), ['zapisz_obecnosc']); assert.ok(!('p_token' in b.wywolania[0].p));
});
test('Kiosk używa wariantów z tokenem w pętli sterowania i w pingu', () => {
    const s = czytaj('js/kiosk-sterowanie.js'), k = czytaj('js/kiosk.js');
    for (const n of ['kiosk_polecenia_pobierz', 'kiosk_polecenie_wynik', 'kiosk_odpowiedz_ping']) assert.match(s, new RegExp("wywolajRPCKiosku\\('" + n + "'"));
    assert.match(k, /wywolajRPCKiosku\('kiosk_pobierz_zadania'/); assert.match(k, /wywolajRPCKiosku\('kiosk_odpowiedz_ping'/);
    assert.ok(!/await wywolajRPC\('kiosk_(polecenia_pobierz|polecenie_wynik|odpowiedz_ping|pobierz_zadania)'/.test(s + k));
});

test('service worker: biblioteki CDN tylko w trybie CORS i tylko udane odpowiedzi', () => {
    const sw = czytaj('sw.js');
    assert.ok(!/mode: 'no-cors'/.test(sw.replace(/\/\/.*$/gm, '')), 'brak no-cors w kodzie');
    assert.match(sw, /new Request\(u, \{ mode: 'cors' \}\)\)\.then\(r => \{ if \((?:r\.ok|bezpiecznaDoZapisu\(null, r, false\))\)/);   // v2.15.18: kontrola ok wzbogacona o typ i Content-Type
    assert.match(sw, /if \((?:odp && odp\.ok|bezpiecznaDoZapisu\(req, odp, false\))\) cache\.put\(req\.url/);
});

test('narzędzie SRI poprawia też adresy w CSP; wersja 2.16.02', () => {
    assert.match(czytaj('tools/sri.mjs'), /także adresy w CSP/);
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.16\.02'/);
    assert.match(czytaj('package.json'), /tests\/audyt-luki\.test\.mjs/);
});
