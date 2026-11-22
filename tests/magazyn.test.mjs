// Uruchom: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const M = require('../js/bezpieczny-magazyn.js');
const { ST } = M;
const H = 3600 * 1000;

async function nowy(t0 = Date.parse('2026-10-26T08:00:00Z')) {
    const zegar = { t: t0 };
    const adapter = M.MemAdapter();
    const m = M.utworz({ adapter, crypto: webcrypto, teraz: () => zegar.t });
    await m.init();
    return { m, adapter, zegar };
}
const P = { p_kod: 'M001', p_pin: '4821', p_wydarzenie_id: 17, p_wybor: 'auto' };
const zrzut = async (adapter) => JSON.stringify(Object.fromEntries(await Promise.all(['kolejka', 'historia', 'cache', 'audyt', 'meta'].map(async n => [n, await adapter.all(n)]))));

test('szyfrowanie i odszyfrowanie: poprawny round-trip', async () => {
    const { m } = await nowy();
    const rek = await m._szyfruj('kolejka', 'op-test0001', { a: 1, pin: '1234' });
    assert.deepEqual(await m._odszyfruj('kolejka', 'op-test0001', rek), { a: 1, pin: '1234' });
    assert.equal(rek.v, 1); assert.equal(rek.kv, 1);
});

test('odrzucenie błędnego klucza (rekord z innej instalacji)', async () => {
    const A = await nowy(), B = await nowy();
    const it = await A.m.dodaj('obecnosc', P);
    const rek = await A.adapter.get('kolejka', it.id);
    await B.adapter.put('kolejka', it.id, rek);
    const l = await B.m.wczytajKolejke();
    assert.equal(l[0].status, ST.USZKODZONE); assert.equal(l[0].payload, null);
});

test('odrzucenie zmodyfikowanego ciphertextu i rekordu przeniesionego pod inne id (AAD)', async () => {
    const { m, adapter } = await nowy();
    const a = await m.dodaj('obecnosc', P);
    const rek = await adapter.get('kolejka', a.id);
    const ct = Buffer.from(rek.ct, 'base64'); ct[0] ^= 1;
    await adapter.put('kolejka', a.id, { ...rek, ct: ct.toString('base64') });
    assert.equal((await m.wczytajKolejke())[0].status, ST.USZKODZONE);
    // przeniesienie poprawnego rekordu pod inne id
    const { m: m2, adapter: ad2 } = await nowy();
    const b = await m2.dodaj('obecnosc', P);
    const r2 = await ad2.get('kolejka', b.id);
    await ad2.put('kolejka', 'op-INNEID123', { ...r2, id: 'op-INNEID123' });
    const wyn = await m2.wczytajKolejke();
    assert.equal(wyn.find(x => x.id === 'op-INNEID123').status, ST.USZKODZONE);
    assert.equal(wyn.find(x => x.id === b.id).status, ST.OCZEKUJE);
});

test('uszkodzony rekord NIE jest kasowany po cichu', async () => {
    const { m, adapter } = await nowy();
    const a = await m.dodaj('obecnosc', P);
    const rek = await adapter.get('kolejka', a.id);
    await adapter.put('kolejka', a.id, { ...rek, iv: 'AAAAAAAAAAAAAAAA' });
    await m.wczytajKolejke();
    assert.ok(await adapter.get('kolejka', a.id));
});

test('unikalność nonce: 5000 szyfrowań, brak powtórzeń', async () => {
    const { m } = await nowy();
    const iv = new Set();
    for (let i = 0; i < 5000; i++) iv.add((await m._szyfruj('kolejka', 'op-xxxxxxxx', { i })).iv);
    assert.equal(iv.size, 5000);
});

test('w trwałym magazynie nie ma jawnego PIN-u ani kodu ministranta', async () => {
    const { m, adapter } = await nowy();
    await m.dodaj('obecnosc', P);
    const z = await zrzut(adapter);
    assert.ok(!z.includes('4821')); assert.ok(!z.includes('M001'));
});

test('walidacja: zły PIN / brak pól / nieznany rodzaj odrzucone', async () => {
    const { m } = await nowy();
    await assert.rejects(m.dodaj('obecnosc', { ...P, p_pin: '12a4' }));
    await assert.rejects(m.dodaj('obecnosc', { ...P, p_kod: '' }));
    await assert.rejects(m.dodaj('cokolwiek', P));
    await assert.rejects(m.dodaj('zgloszenie', P));
});

test('ACK: błąd sieci i odpowiedź odrzucająca NIE usuwają wpisu; sukces usuwa payload', async () => {
    const { m, adapter } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    assert.equal(await m.zastosujOdpowiedz(it, { sukces: false, siec: true }), 'siec');
    assert.equal(await m.zastosujOdpowiedz(it, { sukces: false, blad: 'Błąd serwera (500)' }), 'odrzucono');
    assert.equal(it.proby_synchronizacji, 1);
    assert.equal((await m.wczytajKolejke())[0].status, ST.OCZEKUJE);
    assert.equal(await m.zastosujOdpowiedz(it, { sukces: true, duplikat_operacji: true }), 'zapisano');
    assert.equal(await adapter.get('kolejka', it.id), undefined);
    const z = await zrzut(adapter);
    assert.ok(!z.includes('4821') && !z.includes('M001'));
    const l = await m.wczytajKolejke(); assert.equal(l.length, 1); assert.equal(l[0].status, ST.OK); assert.equal(l[0].payload, null);
});

test('rozpoznanie wcześniej zapisanej operacji ("już zaliczona") → pominięte, payload usunięty', async () => {
    const { m, adapter } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    assert.equal(await m.zastosujOdpowiedz(it, { sukces: false, blad: 'Obecność już została zaliczona.' }), 'istnialo');
    assert.equal(await adapter.get('kolejka', it.id), undefined);
});

test('po 5 odrzuceniach wpis → błąd (nie znika)', async () => {
    const { m } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    for (let i = 0; i < 5; i++) await m.zastosujOdpowiedz(it, { sukces: false, blad: 'x' });
    assert.equal((await m.wczytajKolejke())[0].status, ST.BLAD);
});

test('odzyskanie kolejki po restarcie (nowa instancja na tym samym magazynie)', async () => {
    const { m, adapter, zegar } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    const m2 = M.utworz({ adapter, crypto: webcrypto, teraz: () => zegar.t }); await m2.init();
    const l = await m2.wczytajKolejke();
    assert.equal(l.length, 1); assert.equal(l[0].id, it.id); assert.equal(l[0].payload.p_pin, '4821');
    assert.match(l[0].id, /^op-[0-9a-f-]{36}$/);   // stabilny identyfikator operacji
});

test('przerwany ACK (znacznik zapisany, payload jeszcze nie skasowany) — uzgodnienie przy odczycie', async () => {
    const { m, adapter } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    await adapter.put('historia', it.id, { id: it.id, rodzaj: 'obecnosc', status: ST.OK, kiedy_lokalnie: it.kiedy_lokalnie, zsynchronizowano: Date.now() });
    const l = await m.wczytajKolejke();
    assert.equal(l.length, 1); assert.equal(l[0].payload, null);
    assert.equal(await adapter.get('kolejka', it.id), undefined);
});

test('retencja 36 h: wpis staje się „przeterminowany”, nie jest kasowany', async () => {
    const { m, adapter, zegar } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    zegar.t += 35 * H; assert.equal(await m.przeterminuj(), 0);
    zegar.t += 2 * H; assert.equal(await m.przeterminuj(), 1);
    const l = await m.wczytajKolejke(); assert.equal(l[0].status, ST.PRZETERMINOWANE);
    assert.ok(await adapter.get('kolejka', it.id)); assert.equal(l[0].payload.p_pin, '4821');
});

test('przedłużenie retencji: wielokrotne, bez limitu liczby, każde audytowane', async () => {
    const { m, zegar } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    zegar.t += 40 * H; await m.przeterminuj();
    for (let i = 0; i < 50; i++) await m.przedluz(it.id, 24, 'ADM1', 'kiosk-1');
    const l = await m.wczytajKolejke();
    assert.equal(l[0].status, ST.OCZEKUJE); assert.equal(l[0].przedluzenia, 50);
    const au = await m.audytDoWyslania();
    assert.equal(au.length, 50);
    assert.deepEqual([au[0].akcja, au[0].kto, au[0].kiosk_id, au[0].godzin, au[0].op_id], ['przedluzenie', 'ADM1', 'kiosk-1', 24, it.id]);
    await m.audytPotwierdz(au[0].aid); assert.equal((await m.audytDoWyslania()).length, 49);
    await assert.rejects(m.przedluz(it.id, 0, 'ADM1')); await assert.rejects(m.przedluz(it.id, 5, ''));
});

test('usunięcie nieodwracalne: tylko świadome, audytowane', async () => {
    const { m, adapter } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    const a = await m.usunNieodwracalnie(it.id, 'ADM1', 'kiosk-1');
    assert.equal(a.akcja, 'usuniecie_nieodwracalne'); assert.equal(await adapter.get('kolejka', it.id), undefined);
});

test('wygaśnięcie cache i znaczników historii', async () => {
    const { m, zegar } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    await m.zastosujOdpowiedz(it, { sukces: true });
    assert.equal((await m.wczytajKolejke()).length, 1);
    zegar.t += 49 * H; assert.equal((await m.wczytajKolejke()).length, 0);
});

test('cache: szyfrowany, round-trip, brak jawnych danych osobowych', async () => {
    const { m, adapter } = await nowy();
    await m.zapiszCache({ pobrano_lokalnie: '2026-10-26T08:00:00Z', plakietki: [{ imie: 'Zygmunt', nazwisko: 'Kowalski', pin_hash: '$2a$10$abc' }] });
    const z = await zrzut(adapter);
    assert.ok(!z.includes('Zygmunt') && !z.includes('Kowalski') && !z.includes('$2a$'));
    assert.equal((await m.wczytajCache()).plakietki[0].nazwisko, 'Kowalski');
    assert.equal(await m.czasCache(), '2026-10-26T08:00:00Z');
});

test('rotacja kluczy: stare rekordy odczytywalne, nowe w kv=2, klucz kasowany dopiero gdy nieużywany', async () => {
    const { m, adapter, zegar } = await nowy();
    const a = await m.dodaj('obecnosc', P);
    await m.zapiszCache({ pobrano: 'x', dane: 1 });
    zegar.t += 31 * 24 * H;
    assert.equal(await m.czyRotacjaPotrzebna(30), true);
    const r = await m.rotujKlucz();
    assert.deepEqual([r.z, r.na], [1, 2]); assert.equal(r.przeszyfrowane, 2);
    assert.equal((await adapter.get('kolejka', a.id)).kv, 2);
    assert.equal((await m.wczytajKolejke())[0].payload.p_pin, '4821');
    assert.equal((await m.wczytajCache()).dane, 1);
    assert.equal(await m.czyRotacjaPotrzebna(30), false);
    assert.equal(await m.usunWycofaneKlucze(), 1);
    const b = await m.dodaj('obecnosc', { ...P, p_kod: 'M002' });
    assert.equal((await adapter.get('kolejka', b.id)).kv, 2);
});

test('rotacja przerwana: rekordy w starej wersji pozostają odczytywalne; klucz nie jest kasowany', async () => {
    const { m, adapter } = await nowy();
    const a = await m.dodaj('obecnosc', P);
    // symulacja: nowy klucz utworzony i wskazany jako aktywny, ale rekord jeszcze nie przeszyfrowany
    const m2 = M.utworz({ adapter, crypto: webcrypto }); await m2.init();
    const orig = adapter.put.bind(adapter); let n = 0;
    adapter.put = async (s, k, v) => { if (s === 'kolejka' && ++n >= 1) throw new Error('przerwa'); return orig(s, k, v); };
    await assert.rejects(m2.rotujKlucz());
    adapter.put = orig;
    const m3 = M.utworz({ adapter, crypto: webcrypto }); await m3.init();
    assert.equal((await m3.wczytajKolejke())[0].payload.p_pin, '4821');
    assert.equal(await m3.usunWycofaneKlucze(), 0);
});

test('migracja z localStorage: jawny PIN przeniesiony do szyfrowanego magazynu, localStorage wyczyszczony', async () => {
    const { m, adapter } = await nowy();
    const ls = new Map([
        ['em_offline_kolejka', JSON.stringify([
            { id: 'off-1730000000000-ab12cd', rodzaj: 'obecnosc', payload: P, meta: { kod_plakietki: 'PL1' }, kiedy_lokalnie: '2026-10-26T07:00:00Z', status: ST.OCZEKUJE, proby_synchronizacji: 0 },
            { id: 'off-2', rodzaj: 'obecnosc', payload: { ...P, p_pin: '••••' }, kiedy_lokalnie: '2026-10-26T06:00:00Z', status: ST.OK }
        ])],
        ['em_offline_dane', JSON.stringify({ pobrano: 'x', plakietki: [{ imie: 'Jan', pin_hash: '$2a$' }] })]
    ]);
    const lsApi = { getItem: k => ls.has(k) ? ls.get(k) : null, removeItem: k => ls.delete(k) };
    const w = await m.migrujLegacy(lsApi);
    assert.equal(w.przeniesione, 1); assert.equal(w.cache, true); assert.equal(w.zachowano_localStorage, false);
    assert.equal(ls.size, 0);
    const z = await zrzut(adapter); assert.ok(!z.includes('4821') && !z.includes('Jan'));
    assert.equal((await m.wczytajKolejke())[0].payload.p_pin, '4821');
});

test('migracja: uszkodzony JSON w localStorage — nic nie jest kasowane', async () => {
    const { m } = await nowy();
    const ls = new Map([['em_offline_kolejka', '{zepsute']]);
    const w = await m.migrujLegacy({ getItem: k => ls.get(k) ?? null, removeItem: k => ls.delete(k) });
    assert.equal(w.zachowano_localStorage, true); assert.ok(ls.has('em_offline_kolejka'));
});

test('powtórny zapis zakończonego wpisu nie przedłuża życia znacznika historii', async () => {
    const { m, zegar } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    await m.zastosujOdpowiedz(it, { sukces: true });
    zegar.t += 47 * H; await m.zapiszElement({ ...it, payload: null });
    zegar.t += 2 * H;
    assert.equal((await m.wczytajKolejke()).length, 0);
});

test('usunZnacznik usuwa tylko znacznik historii', async () => {
    const { m, adapter } = await nowy();
    const it = await m.dodaj('obecnosc', P); await m.zastosujOdpowiedz(it, { sukces: true });
    await m.usunZnacznik(it.id); assert.equal(await adapter.get('historia', it.id), undefined);
});

// ---------------------------------------------------------------- v2.3, Etap 1 ---
const PT = { p_kod: 'M001', p_wydarzenie_id: 17, p_wybor: 'auto', p_kiedy_klient: '2026-10-26T09:00:00Z' };

test('v2.3: operacja autoryzowana tokenem (obecnosc_token) NIE może zawierać PIN-u', async () => {
    const { m, adapter } = await nowy();
    await assert.rejects(m.dodaj('obecnosc_token', { ...PT, p_pin: '4821' }), /p_pin niedozwolony/);
    const it = await m.dodaj('obecnosc_token', PT);
    assert.equal(it.payload.p_pin, undefined);
    assert.ok(!(await zrzut(adapter)).includes('M001'));
    await assert.rejects(m.dodaj('obecnosc_token', { ...PT, p_kiedy_klient: 'nie-data' }));
});

test('v2.3: blokada duplikatów — jeden oczekujący wpis na (ministrant, wydarzenie)', async () => {
    const { m } = await nowy();
    await m.dodaj('obecnosc', P);
    await assert.rejects(m.dodaj('obecnosc', { ...P, p_pin: '0000' }), (e) => e.kod === 'DUPLIKAT_LOKALNY');
    await assert.rejects(m.dodaj('obecnosc_token', PT), (e) => e.kod === 'DUPLIKAT_LOKALNY');
    await m.dodaj('obecnosc', { ...P, p_wydarzenie_id: 18 });          // inne wydarzenie — wolno
    await m.dodaj('obecnosc', { ...P, p_kod: 'M002' });                // inny ministrant — wolno
});

test('v2.3: po ACK duplikat tej samej pary nie jest już blokowany (znacznik nie blokuje)', async () => {
    const { m } = await nowy();
    const it = await m.dodaj('obecnosc', P); await m.zastosujOdpowiedz(it, { sukces: true });
    await m.dodaj('obecnosc', P);
});

test('v2.3: odrzucony PIN = trwałe odrzucenie, bez ponawiania, PIN usunięty z magazynu', async () => {
    const { m, adapter } = await nowy();
    const it = await m.dodaj('obecnosc', P);
    assert.equal(await m.zastosujOdpowiedz(it, { sukces: false, blad: 'Nieprawidłowy PIN.' }), 'pin_odrzucony');
    const l = await m.wczytajKolejke();
    assert.equal(l[0].status, ST.BLAD); assert.equal(l[0].payload.p_pin, null); assert.equal(l[0].proby_synchronizacji, 1);
    assert.ok(!(await zrzut(adapter)).includes('4821'));
    const it2 = await m.dodaj('obecnosc', { ...P, p_kod: 'M009' });
    assert.equal(await m.zastosujOdpowiedz(it2, { sukces: false, blad: 'Konto zablokowane do 10:30.' }), 'pin_odrzucony');
});

test('v2.3 (R1): pin_hash nie jest zapisywany w cache', async () => {
    const { m, adapter } = await nowy();
    await m.zapiszCache({ pobrano: 'x', plakietki: [{ ministrant_kod: 'M001', imie: 'Jan', pin_hash: '$2a$10$ABCDEF' }] });
    const c = await m.wczytajCache();
    assert.equal(c.plakietki[0].pin_hash, undefined); assert.equal(c.plakietki[0].imie, 'Jan');
    // wnętrze rekordu też nie zawiera hasha
    const rek = await adapter.get('cache', 'cache');
    assert.equal((await m._odszyfruj('cache', 'cache', rek)).plakietki[0].pin_hash, undefined);
});

test('v2.3 (R1): stary rekord cache z pin_hash jest przepisany bez niego przy odczycie', async () => {
    const { m, adapter } = await nowy();
    const stary = { pobrano: 'x', plakietki: [{ ministrant_kod: 'M001', pin_hash: '$2a$10$ABCDEF' }] };
    await adapter.put('cache', 'cache', { pobrano: 'x', ...(await m._szyfruj('cache', 'cache', stary)) });   // wersja z v2.2
    assert.equal((await m.wczytajCache()).plakietki[0].pin_hash, undefined);
    const rek = await adapter.get('cache', 'cache');
    assert.equal((await m._odszyfruj('cache', 'cache', rek)).plakietki[0].pin_hash, undefined);
});
