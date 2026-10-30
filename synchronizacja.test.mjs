// Test integracyjny: WŁAŚCIWY kod probojSynchronizacje() z js/kiosk.js uruchomiony w vm z atrapą serwera.
// Atrapa serwera modeluje semantykę sql/30 w JS — NIE jest testem SQL (SQL: patrz docs, status „nieuruchomione”).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
const require = createRequire(import.meta.url);
const M = require('../js/bezpieczny-magazyn.js');
const src = fs.readFileSync(new URL('../js/kiosk.js', import.meta.url), 'utf8');
const a = src.indexOf('async function probojSynchronizacje()');
const b = src.indexOf('// ---------------------------------------------- Stan połączenia');
assert.ok(a > 0 && b > a);
const kodSync = src.slice(a, b);

function srodowisko({ idem = true } = {}) {
    const serwer = { akceptacja: () => ({ sukces: false, blad: 'brak modelu' }), kolejkaAkceptacji: [], token: () => ({ sukces: false, blad: 'brak modelu' }), ledger: new Set(), obecnosci: new Set(), punkty: 0, wywolania: [], tryb: 'ok', idem };
    const magazyn = M.utworz({ adapter: M.MemAdapter(), crypto: webcrypto });
    const ctx = vm.createContext({
        magazyn, serwer, console,
        sprawdzPolaczenie: async () => true, ustawStanPolaczenia() {}, odswiezTekstyEkranu() {}, wyslijAudytRetencji: async () => {},
        zapiszSkanPlakietki() {}, ID_KIOSKU: 'kiosk-test', KLUCZ_TOKEN_KIOSKU: 'em_kiosk_token', localStorage: { getItem: (k) => (k === 'em_kiosk_token' ? 'TOKEN-OK' : null) }, jestZakonczony: (z) => M.jestZakonczony(z.status), ST_OCZEKUJE: M.ST.OCZEKUJE, ST_PRZET: M.ST.PRZETERMINOWANE, ST_DOAKC: M.ST.DO_AKCEPTACJI, jestOffline: false,
        wywolajRPC: async (nazwa, p) => {
            serwer.wywolania.push({ nazwa, p: { ...p } });
            if (nazwa === 'kiosk_zglos_przeterminowana') return serwer.akceptacja(p);
            if (nazwa === 'kiosk_zapisz_obecnosc_token') return serwer.token(p);
            const stary = nazwa === 'zapisz_obecnosc';
            if (!serwer.idem && !stary) return { sukces: false, kod_pg: 'PGRST202', blad: 'brak funkcji' };
            if (serwer.tryb === 'siec_przed') return { sukces: false, siec: true, blad: 'Błąd połączenia' };
            if (nazwa.endsWith('_idem') && serwer.ledger.has(p.p_id_operacji)) return { sukces: true, duplikat_operacji: true };
            if (p.p_pin !== '4821') return { sukces: false, blad: 'Nieprawidłowy PIN.' };
            const klucz = p.p_kod + '|' + p.p_wydarzenie_id;
            let wynik;
            if (serwer.obecnosci.has(klucz)) wynik = { sukces: false, blad: 'Obecność już została zaliczona.' };
            else { serwer.obecnosci.add(klucz); serwer.punkty += 1; wynik = { sukces: true }; if (nazwa.endsWith('_idem')) serwer.ledger.add(p.p_id_operacji); }
            if (serwer.tryb === 'siec_po_zapisie') return { sukces: false, siec: true, blad: 'Błąd połączenia' };   // zapis zatwierdzony, ACK zgubiony
            return wynik;
        }
    });
    vm.runInContext(`let synchronizacjaWTrakcie = false; let idemDostepne = true; let kolejkaPamiec = [];\n${kodSync}`, ctx);
    return { ctx, serwer, magazyn };
}
const P = { p_kod: 'M001', p_pin: '4821', p_wydarzenie_id: 17, p_wybor: 'auto' };
const wczytaj = async (e) => { vm.runInContext('kolejkaPamiec = __k', Object.assign(e.ctx, { __k: await e.magazyn.wczytajKolejke() })); };
const sync = async (e) => { const w = await e.ctx.probojSynchronizacje(); return w; };

test('sieć padła PRZED zapisem: wpis zostaje, brak zapisu; ponowienie zapisuje dokładnie raz', async () => {
    const e = srodowisko(); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc', P);
    e.serwer.tryb = 'siec_przed'; await sync(e);
    assert.equal(e.serwer.punkty, 0); assert.equal((await e.magazyn.wczytajKolejke())[0].status, M.ST.OCZEKUJE);
    e.serwer.tryb = 'ok'; await sync(e);
    assert.equal(e.serwer.punkty, 1); assert.equal((await e.magazyn.wczytajKolejke())[0].status, M.ST.OK);
});

test('sieć padła PO zapisie, PRZED ACK: ponowienie tego samego id NIE dubluje obecności ani punktów', async () => {
    const e = srodowisko(); await e.magazyn.init(); const it = await e.magazyn.dodaj('obecnosc', P);
    e.serwer.tryb = 'siec_po_zapisie'; await sync(e);
    assert.equal(e.serwer.punkty, 1); assert.equal((await e.magazyn.wczytajKolejke())[0].status, M.ST.OCZEKUJE);   // brak ACK → wpis nadal jest
    e.serwer.tryb = 'ok'; await sync(e);
    assert.equal(e.serwer.punkty, 1, 'punkty nie mogą się podwoić');
    const l = await e.magazyn.wczytajKolejke(); assert.equal(l[0].status, M.ST.OK);
    const ostatnie = e.serwer.wywolania.at(-1); assert.equal(ostatnie.p.p_id_operacji, it.id);
});

test('po ACK payload (PIN, kod) znika z magazynu i z pamięci roboczej', async () => {
    const e = srodowisko(); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc', P);
    await sync(e);
    const zrzut = JSON.stringify(await Promise.all(['kolejka', 'historia'].map(n => e.magazyn._adapter.all(n))));
    assert.ok(!zrzut.includes('4821') && !zrzut.includes('M001'));
    const ram = vm.runInContext('JSON.stringify(kolejkaPamiec)', e.ctx); assert.ok(!ram.includes('4821'));
});

test('serwer bez sql/30 (PGRST202): zapas na starą funkcję; „już zaliczona” → pominięte, bez duplikatu', async () => {
    const e = srodowisko({ idem: false }); await e.magazyn.init();
    e.serwer.obecnosci.add('M001|17'); e.serwer.punkty = 1;
    await e.magazyn.dodaj('obecnosc', P); await sync(e);
    assert.equal(e.serwer.punkty, 1);
    assert.match((await e.magazyn.wczytajKolejke())[0].status, /^pominięte/);
    assert.ok(e.serwer.wywolania.some(w => w.nazwa === 'zapisz_obecnosc'));
});

test('zły PIN odrzucony przez serwer: JEDNA próba, bez ponawiania (nie blokujemy konta ministranta), PIN usunięty', async () => {
    const e = srodowisko(); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc', { ...P, p_pin: '0000' });
    await sync(e); await sync(e); await sync(e);
    const l = await e.magazyn.wczytajKolejke();
    assert.equal(l[0].status, M.ST.BLAD); assert.equal(l[0].payload.p_pin, null); assert.equal(e.serwer.punkty, 0);
    assert.equal(e.serwer.wywolania.filter(w => w.p.p_pin !== undefined).length, 1, 'serwer dostał dokładnie jedną próbę PIN-u');
});

// ---------------------------------------------------------------- v2.14: akceptacja Admina po 36 h ---
// Atrapa kiosk_zglos_przeterminowana odwzorowuje REGUŁY z sql/33 (nie jest testem SQL): idempotencja po id_operacji, brak PIN-u, zapis do kolejki akceptacji.
function modelAkceptacji(serwer) {
    serwer.akceptacja = (p) => {
        if (p.p_token !== 'TOKEN-OK') return { sukces: false, kod_bledu: 'token_nieprawidlowy', blad: 'Kiosk nie jest autoryzowany.' };
        if ('p_pin' in p) return { sukces: false, blad: 'PIN niedozwolony' };
        if (serwer.kolejkaAkceptacji.some(x => x.p_id_operacji === p.p_id_operacji)) return { sukces: true, do_akceptacji: true, duplikat_operacji: true };
        if (serwer.obecnosci.has(p.p_kod + '|' + p.p_wydarzenie_id)) return { sukces: false, blad: 'Obecność już została zaliczona.' };
        serwer.kolejkaAkceptacji.push({ ...p }); return { sukces: true, do_akceptacji: true };
    };
}
async function envPrzeterminowane(godzin) {
    let t = Date.parse('2026-10-26T08:00:00Z');
    const e = srodowisko(); modelAkceptacji(e.serwer);
    const m = M.utworz({ adapter: M.MemAdapter(), crypto: webcrypto, teraz: () => t }); e.ctx.magazyn = m; e.magazyn = m; await m.init();
    await m.dodaj('obecnosc', P); t += godzin * 3600 * 1000;
    return { e, m };
}

test('wpis > 36 h trafia do akceptacji Admina BEZ PIN-u, nie dodaje obecności, a PIN znika z urządzenia', async () => {
    const { e, m } = await envPrzeterminowane(37);
    await sync(e);
    const w = e.serwer.wywolania.filter(x => x.nazwa === 'kiosk_zglos_przeterminowana');
    assert.equal(w.length, 1); assert.ok(!('p_pin' in w[0].p), 'PIN nie może opuścić urządzenia'); assert.equal(w[0].p.p_kod, 'M001'); assert.equal(w[0].p.p_rodzaj, 'obecnosc');
    assert.equal(e.serwer.punkty, 0, 'obecność NIE może być dodana bez decyzji Admina');
    assert.equal(e.serwer.wywolania.filter(x => x.nazwa !== 'kiosk_zglos_przeterminowana').length, 0, 'żadna zwykła ścieżka zapisu nie może zostać użyta');
    const l = await m.wczytajKolejke(); assert.equal(l[0].status, M.ST.DO_AKCEPTACJI); assert.equal(l[0].payload, null);
    assert.ok(!JSON.stringify(await m._adapter.all('kolejka')).includes('4821'));
    await sync(e); assert.equal(e.serwer.wywolania.filter(x => x.nazwa === 'kiosk_zglos_przeterminowana').length, 1, 'ponowna synchronizacja nie wysyła drugi raz');
});

test('wpis < 36 h synchronizuje się normalnie i NIE trafia do akceptacji', async () => {
    const { e, m } = await envPrzeterminowane(35);
    await sync(e);
    assert.equal(e.serwer.wywolania.filter(x => x.nazwa === 'kiosk_zglos_przeterminowana').length, 0);
    assert.equal(e.serwer.punkty, 1); assert.equal((await m.wczytajKolejke())[0].status, M.ST.OK);
});

test('akceptacja: sieć padła w trakcie wysyłki → wpis zostaje przeterminowany z PIN-em, kolejna próba przechodzi', async () => {
    const { e, m } = await envPrzeterminowane(40);
    const oryg = e.serwer.akceptacja; e.serwer.akceptacja = () => ({ sukces: false, siec: true, blad: 'Błąd połączenia' });
    await sync(e);
    let l = await m.wczytajKolejke(); assert.equal(l[0].status, M.ST.PRZETERMINOWANE); assert.equal(l[0].payload.p_pin, '4821'); assert.equal(l[0].proby_synchronizacji, 0);
    e.serwer.akceptacja = oryg; await sync(e);
    l = await m.wczytajKolejke(); assert.equal(l[0].status, M.ST.DO_AKCEPTACJI); assert.equal(e.serwer.kolejkaAkceptacji.length, 1);
});

test('akceptacja: serwer bez sql/33 (PGRST202) albo bez tokenu → wpis zostaje przeterminowany, bez liczenia prób', async () => {
    const a = await envPrzeterminowane(40);
    a.e.serwer.akceptacja = () => ({ sukces: false, kod_pg: 'PGRST202', blad: 'brak funkcji' });
    await sync(a.e);
    let l = await a.m.wczytajKolejke(); assert.equal(l[0].status, M.ST.PRZETERMINOWANE); assert.equal(l[0].proby_synchronizacji, 0); assert.equal(l[0].payload.p_pin, '4821');
    const b = await envPrzeterminowane(40);
    b.e.ctx.localStorage = { getItem: () => null };
    await sync(b.e);
    assert.equal(b.e.serwer.wywolania.length, 0);
    l = await b.m.wczytajKolejke(); assert.equal(l[0].status, M.ST.PRZETERMINOWANE);
});

test('akceptacja: zły token Kiosku nie spala prób wpisu; „już zaliczona” → pominięte', async () => {
    const a = await envPrzeterminowane(40);
    a.e.serwer.akceptacja = () => ({ sukces: false, kod_bledu: 'token_nieprawidlowy', blad: 'Kiosk nie jest autoryzowany.' });
    await sync(a.e); await sync(a.e);
    let l = await a.m.wczytajKolejke(); assert.equal(l[0].status, M.ST.PRZETERMINOWANE); assert.equal(l[0].proby_synchronizacji, 0);
    const b = await envPrzeterminowane(40); b.e.serwer.obecnosci.add('M001|17');
    await sync(b.e);
    l = await b.m.wczytajKolejke(); assert.ok(String(l[0].status).startsWith('pominięte')); assert.equal(l[0].payload, null);
});

test('magazyn: status „do akceptacji” jest zakończony (znacznik bez danych osobowych), a odpowiedź do_akceptacji klasyfikowana osobno', async () => {
    const m = M.utworz({ adapter: M.MemAdapter(), crypto: webcrypto }); await m.init();
    assert.equal(m.klasyfikujOdpowiedz({ sukces: true, do_akceptacji: true }), 'do_akceptacji');
    assert.equal(m.klasyfikujOdpowiedz({ sukces: true }), 'zapisano');
    assert.ok(M.jestZakonczony(M.ST.DO_AKCEPTACJI));
});

// ---------------------------------------------------------------- v2.3, Etap 1 ---
// Atrapa kiosk_zapisz_obecnosc_token odwzorowuje REGUŁY z sql/31 (nie jest testem SQL).
function modelTokenowy(serwer, { tryb = 'token_bez_pin', okno = ['2026-10-26T09:00:00Z', '2026-10-26T11:00:00Z'], ostatniKontakt = '2026-10-26T08:00:00Z', teraz = '2026-10-26T12:00:00Z', uprzywilejowane = [] } = {}) {
    serwer.token = (p) => {
        if (p.p_token !== 'TOKEN-OK') return { sukces: false, kod_bledu: 'token_nieprawidlowy', blad: 'Kiosk nie jest autoryzowany.' };
        if (tryb !== 'token_bez_pin') return { sukces: false, kod_bledu: 'tryb_wylaczony', blad: 'Ten Kiosk nie ma włączonego trybu offline bez PIN-u.' };
        if (serwer.ledger.has(p.p_id_operacji)) return { sukces: true, duplikat_operacji: true };
        if (uprzywilejowane.includes(p.p_kod)) return { sukces: false, kod_bledu: 'wymagany_pin', blad: 'Konta uprzywilejowane wymagają PIN-u.' };
        const moment = Math.min(Math.max(Date.parse(p.p_kiedy_klient), Date.parse(ostatniKontakt)), Date.parse(teraz));
        if (moment < Date.parse(okno[0]) || moment > Date.parse(okno[1])) return { sukces: false, blad: 'Poza oknem zapisu obecności dla tego wydarzenia.' };
        const klucz = p.p_kod + '|' + p.p_wydarzenie_id;
        if (serwer.obecnosci.has(klucz)) return { sukces: false, blad: 'Obecność już została zaliczona.' };
        serwer.obecnosci.add(klucz); serwer.punkty += 1; serwer.ledger.add(p.p_id_operacji);
        return { sukces: true };
    };
}
const PT = { p_kod: 'M001', p_wydarzenie_id: 17, p_wybor: 'auto', p_kiedy_klient: '2026-10-26T10:00:00Z' };

test('tryb token: wywołanie z tokenem Kiosku i id operacji, BEZ PIN-u; po ACK nic nie zostaje', async () => {
    const e = srodowisko(); modelTokenowy(e.serwer); await e.magazyn.init();
    const it = await e.magazyn.dodaj('obecnosc_token', PT); await sync(e);
    const w = e.serwer.wywolania.at(-1);
    assert.equal(w.nazwa, 'kiosk_zapisz_obecnosc_token'); assert.equal(w.p.p_id_operacji, it.id); assert.equal(w.p.p_token, 'TOKEN-OK'); assert.equal(w.p.p_pin, undefined);
    assert.equal(e.serwer.punkty, 1); assert.equal((await e.magazyn.wczytajKolejke())[0].status, M.ST.OK);
});

test('tryb token: sieć padła po zapisie przed ACK → ponowienie rozpoznane po id, brak podwójnych punktów', async () => {
    const e = srodowisko(); modelTokenowy(e.serwer); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc_token', PT);
    const orig = e.serwer.token; let n = 0;
    e.serwer.token = (p) => { const w = orig(p); return n++ === 0 ? { sukces: false, siec: true, blad: 'Błąd połączenia' } : w; };
    await sync(e); assert.equal(e.serwer.punkty, 1); assert.equal((await e.magazyn.wczytajKolejke())[0].status, M.ST.OCZEKUJE);
    await sync(e); assert.equal(e.serwer.punkty, 1); assert.equal((await e.magazyn.wczytajKolejke())[0].status, M.ST.OK);
});

test('tryb token: brak tokenu Kiosku → wpis nietknięty (nie liczymy prób, nie kasujemy)', async () => {
    const e = srodowisko(); modelTokenowy(e.serwer); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc_token', PT);
    e.ctx.localStorage = { getItem: () => null }; await sync(e);
    assert.equal(e.serwer.wywolania.length, 0); const l = await e.magazyn.wczytajKolejke();
    assert.equal(l[0].status, M.ST.OCZEKUJE); assert.equal(l[0].proby_synchronizacji, 0);
});

test('tryb token: odrzucenia serwera (poza oknem / zły token / tryb wyłączony) NIE są ACK i niczego nie zapisują', async () => {
    for (const [opcje, pt] of [[{}, { ...PT, p_kiedy_klient: '2026-10-26T20:00:00Z' }], [{ tryb: 'pin_na_serwerze' }, PT]]) {
        const e = srodowisko(); modelTokenowy(e.serwer, opcje); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc_token', pt); await sync(e);
        assert.equal(e.serwer.punkty, 0); assert.notEqual((await e.magazyn.wczytajKolejke())[0].status, M.ST.OK);
    }
});

test('tryb token: zegar tabletu nie pozwala cofnąć zdarzenia przed ostatni kontakt serwera (clamp)', async () => {
    const e = srodowisko(); modelTokenowy(e.serwer, { okno: ['2026-10-26T09:00:00Z', '2026-10-26T11:00:00Z'], ostatniKontakt: '2026-10-26T11:30:00Z' });
    await e.magazyn.init(); await e.magazyn.dodaj('obecnosc_token', { ...PT, p_kiedy_klient: '2026-10-26T10:00:00Z' }); await sync(e);
    assert.equal(e.serwer.punkty, 0, 'sfałszowany wcześniejszy czas zostaje podniesiony do ostatniego kontaktu i wypada poza okno');
});

test('tryb token: konto uprzywilejowane wymaga PIN-u na serwerze', async () => {
    const e = srodowisko(); modelTokenowy(e.serwer, { uprzywilejowane: ['M001'] }); await e.magazyn.init(); await e.magazyn.dodaj('obecnosc_token', PT); await sync(e);
    assert.equal(e.serwer.punkty, 0);
});

// --- prawdziwy kod zapiszOffline / dodajDoKolejkiOffline z kiosk.js -----------------------------------
const wytnijFunkcje = (naglowek) => { const a = src.indexOf(naglowek); assert.ok(a > 0, naglowek); const b = src.indexOf('\n}\n', a); return src.slice(a, b + 3); };
const kodZapisu = wytnijFunkcje('async function dodajDoKolejkiOffline(') + '\n' + wytnijFunkcje('async function zapiszOffline(');
const aT = src.indexOf('function offlineTrybToken(wpis)');
const kodTryb = src.slice(aT, src.indexOf('function offlineAktywneWydarzenie()'));

async function srodowiskoZapisu({ tryb = 'pin_na_serwerze', uprzywilejowany = false } = {}) {
    const magazyn = M.utworz({ adapter: M.MemAdapter(), crypto: webcrypto }); await magazyn.init();
    const komunikaty = [];
    const ctx = vm.createContext({
        magazyn, console, komunikaty,
        hamulecAktywny: () => false, pokazKomunikatWyniku: (k, f) => komunikaty.push([k, typeof f === 'function' ? f() : f]), pokazEkran() {}, ekranBlok: {},
        offlineSzukajPlakietki: () => ({ sukces: true, wpis: { ministrant_kod: 'M001', imie: 'Jan', uprzywilejowany } }),
        offlineAktywneWydarzenie: () => ({ id: 17 }), wczytajCacheOffline: () => ({ tryb_offline: tryb }), odswiezTekstyEkranu() {},
        t: (k) => k, console_error: () => {}
    });
    vm.runInContext(`let aktywneWydarzenie = null, trybZgloszenia = null, biezacyKod = 'M001', biezacaPlakietka = 'PL1', pinBufor = '4821', kolejkaPamiec = [], magazynBlad = null;\n${kodTryb}\n${kodZapisu}`, ctx);
    return { ctx, magazyn, komunikaty };
}
const dump = async (m) => JSON.stringify(await Promise.all(['kolejka', 'historia'].map(n => m._adapter.all(n))));

test('zapiszOffline (PIN na serwerze): PIN trafia TYLKO zaszyfrowany do kolejki; komunikat o późniejszym sprawdzeniu PIN-u', async () => {
    const e = await srodowiskoZapisu(); await e.ctx.zapiszOffline({ rodzaj: 'obecnosc' });
    const l = await e.magazyn.wczytajKolejke();
    assert.equal(l[0].rodzaj, 'obecnosc'); assert.equal(l[0].payload.p_pin, '4821');
    assert.ok(!(await dump(e.magazyn)).includes('4821'));
    assert.equal(e.komunikaty.at(-1)[1], 'k.offline_saved_pin_later');
});

test('zapiszOffline (tryb token): kolejka bez PIN-u', async () => {
    const e = await srodowiskoZapisu({ tryb: 'token_bez_pin' }); await e.ctx.zapiszOffline({ rodzaj: 'obecnosc' });
    const l = await e.magazyn.wczytajKolejke();
    assert.equal(l[0].rodzaj, 'obecnosc_token'); assert.equal('p_pin' in l[0].payload, false);
    assert.equal(e.komunikaty.at(-1)[1], 'k.offline_saved_nopin');
});

test('zapiszOffline: konto Admina/Księdza offline jest odrzucone, nic nie trafia do kolejki (PIN uprzywilejowanego nigdy nie jest kolejkowany)', async () => {
    const e = await srodowiskoZapisu({ uprzywilejowany: true }); await e.ctx.zapiszOffline({ rodzaj: 'obecnosc' });
    assert.equal((await e.magazyn.wczytajKolejke()).length, 0); assert.equal(e.komunikaty.at(-1)[1], 'k.e_priv_offline');
});

test('zapiszOffline: drugi zapis tej samej osoby na to wydarzenie → komunikat o duplikacie, brak drugiego wpisu', async () => {
    const e = await srodowiskoZapisu(); await e.ctx.zapiszOffline({ rodzaj: 'obecnosc' }); await e.ctx.zapiszOffline({ rodzaj: 'obecnosc' });
    assert.equal((await e.magazyn.wczytajKolejke()).length, 1); assert.equal(e.komunikaty.at(-1)[1], 'k.e_already_queued');
});

test('kiosk.js nie zawiera już lokalnej weryfikacji PIN-u ani bcrypt ani pin_hash w kodzie wykonywalnym', () => {
    const bezKomentarzy = src.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
    assert.ok(!/bcrypt/i.test(bezKomentarzy), 'bcrypt w kodzie wykonywalnym');
    assert.ok(!src.includes('offlineWeryfikujPin'));
    const trafienia = bezKomentarzy.split('\n').filter(l => /pin_hash/.test(l));
    assert.deepEqual(trafienia, [], 'pin_hash w kodzie wykonywalnym kiosku: ' + trafienia.join(' | '));
});
