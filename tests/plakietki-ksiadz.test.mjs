// Testy v2.15.07: Ksiądz dodaje i unieważnia plakietki (sql/40), domyślne okno kiosku 20 min przed / 5 po, zmiana kamery w skanerze QR.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const bez = (t) => t.split('\n').filter(l => !/^\s*(\/\/|--)/.test(l)).join('\n');
const sql40 = czytaj('sql/40_ksiadz_plakietki_v2_15_07.sql');
const part1 = czytaj('js/app.part1.js'), part3 = czytaj('js/app.part3.js'), part4 = czytaj('js/app.part4.js');
const i18n = czytaj('js/i18n.js');
const pause = (ms) => new Promise(r => setTimeout(r, ms));
const json = (x) => JSON.parse(JSON.stringify(x));   // obiekty z kontekstu vm mają inny prototyp — porównujemy jako JSON

// ============================== SQL 40 ==============================
test('sql/40: trzy funkcje Księdza, uprawnienia przez _rola_staff_18 i _moze_zarzadzac_18, audyt przez em.kto / em.powod', () => {
    const s = bez(sql40);
    for (const f of ['ksiadz_lista_plakietek', 'ksiadz_generuj_plakietke', 'ksiadz_uniewaznij_plakietke']) {
        assert.match(s, new RegExp('create or replace function public\\.' + f + '\\('), f);
    }
    assert.equal((s.match(/security definer set search_path = public, extensions/g) || []).length, 3);
    assert.ok(s.includes('_rola_staff_18(p_kod, p_pin)'));
    assert.ok((s.match(/_moze_zarzadzac_18\(/g) || []).length >= 4);      // lista + generowanie + unieważnianie (+ kontrola wstępna)
    assert.ok(s.includes("set_config('em.kto'") && s.includes("set_config('em.powod'"));
    assert.ok(s.includes("'Brak uprawnień"));
});
test('sql/40: nic nie usuwa i jest idempotentny (tylko create or replace, update ustawienia, brak drop/delete/truncate)', () => {
    const s = bez(sql40).toLowerCase();
    assert.ok(!/\bdrop\b|\bdelete\b|\btruncate\b/.test(s));
    assert.ok(!/create function/.test(s));
});
test('sql/40: domyślne okno kiosku 20 min tylko dla nieruszonego ustawienia (zmienil is null)', () => {
    const s = bez(sql40);
    assert.match(s, /where klucz = 'okno_przed_min' and wartosc = '15'::jsonb and zmienil is null/);
    assert.ok(s.includes("wartosc = '20'::jsonb"));
});
test('sql/25 zna nowe funkcje (diagnostyka bazy)', () => {
    const s = czytaj('sql/25_narzedzia_admina.sql');
    for (const f of ['ksiadz_lista_plakietek', 'ksiadz_generuj_plakietke', 'ksiadz_uniewaznij_plakietke']) assert.ok(s.includes("['" + f + "','40']"), f);
});

// ============================== UPRAWNIENIA W PANELU ==============================
test('panel: Ksiądz widzi Generator kart, a zakładka nie jest już tylko dla Admina', () => {
    assert.match(part1, /\$\('tab-karty'\)\.classList\.toggle\('hidden', !\(admin \|\| sesja\.is_moderator\)\)/);
    const lista = part1.match(/const ZAKLADKI_TYLKO_ADMIN = \[([^\]]*)\]/)[1];
    assert.ok(!lista.includes("'karty'"));
    for (const z of ['kioski', 'baza', 'dashboard', 'ustawienia', 'audyt', 'rodo']) assert.ok(lista.includes("'" + z + "'"), z);   // reszta nadal tylko Admin
});
test('panel: przycisk unieważnienia dla Księdza; lista kart Księdza bez Admina i innych Księży', () => {
    assert.ok(part3.includes('(p.aktywna && (sesja.is_admin || sesja.is_moderator))'));
    assert.ok(part4.includes('m.aktywny && (sesja.is_admin || (!m.is_admin && !m.is_moderator))'));
    assert.ok(!/wywolajRPC(ZAudytem)?\('admin_(generuj|uniewaznij)_plakietke/.test(part4));   // karty idą przez rpc*Plakietke
});

// ---- funkcje RPC plakietek (wycięte z app.part3.js) uruchomione na atrapach ----
function rpcPlakietek(sesja, odpowiedzi = {}) {
    const wywolania = [];
    const start = part3.indexOf('function plakietkiBrakSql40'), koniec = part3.indexOf('async function otworzPlakietki');
    assert.ok(start > 0 && koniec > start);
    const ctx = vm.createContext({
        sesja, t: (k) => k,
        wywolajRPC: async (n, p) => { wywolania.push({ n, p }); return odpowiedzi[n] || { sukces: true }; },
        wywolajRPCZAudytem: async (a, z, p, d) => { wywolania.push({ n: a, zwykla: z, p: Object.assign({}, p, d || {}) }); return { sukces: true }; }
    });
    vm.runInContext(part3.slice(start, koniec) + '\nthis.F = { lista: rpcListaPlakietek, generuj: rpcGenerujPlakietke, uniewaznij: rpcUniewaznijPlakietke };', ctx);
    return { F: ctx.F, wywolania };
}
test('RPC plakietek: Admin używa admin_* (z audytem), jak dotąd', async () => {
    const { F, wywolania } = rpcPlakietek({ is_admin: true, kod: 'ADM', pin: '1111' });
    await F.lista(5); await F.generuj(5); await F.uniewaznij('PL-1', 'zgubiona');
    assert.deepEqual(wywolania.map(w => w.n), ['admin_lista_plakietek', 'admin_generuj_plakietke_audyt', 'admin_uniewaznij_plakietke_audyt']);
    assert.equal(wywolania[2].p.p_powod, 'zgubiona');
    assert.equal(wywolania[2].p.p_kod_plakietki, 'PL-1');
});
test('RPC plakietek: Ksiądz używa ksiadz_* z p_kod / p_pin i identyfikatorem jako tekstem', async () => {
    const { F, wywolania } = rpcPlakietek({ is_admin: false, is_moderator: true, kod: 'KS', pin: '2222' });
    await F.lista(null); await F.lista(7); await F.generuj(7); await F.uniewaznij('PL-9', null);
    assert.deepEqual(wywolania.map(w => w.n), ['ksiadz_lista_plakietek', 'ksiadz_lista_plakietek', 'ksiadz_generuj_plakietke', 'ksiadz_uniewaznij_plakietke']);
    assert.deepEqual(json(wywolania[0].p), { p_kod: 'KS', p_pin: '2222', p_ministrant_id: null });
    assert.deepEqual(json(wywolania[2].p), { p_kod: 'KS', p_pin: '2222', p_ministrant_id: '7' });
    assert.deepEqual(json(wywolania[3].p), { p_kod: 'KS', p_pin: '2222', p_kod_plakietki: 'PL-9', p_powod: null });
    assert.ok(wywolania.every(w => !/^admin_/.test(w.n)));
});
test('RPC plakietek: brak sql/40 na serwerze daje czytelny komunikat, a inne błędy przechodzą bez zmian', async () => {
    const brak = rpcPlakietek({ is_admin: false, is_moderator: true, kod: 'KS', pin: '2222' }, { ksiadz_generuj_plakietke: { sukces: false, kod_pg: 'PGRST202', blad: 'x' } });
    assert.deepEqual(json(await brak.F.generuj(1)), { sukces: false, blad: 'bdg.need_sql40' });
    const inny = rpcPlakietek({ is_admin: false, is_moderator: true, kod: 'KS', pin: '2222' }, { ksiadz_generuj_plakietke: { sukces: false, blad: 'Brak uprawnień do tego konta.' } });
    assert.equal((await inny.F.generuj(1)).blad, 'Brak uprawnień do tego konta.');
});

// ============================== DOMYŚLNE OKNO 20 / 5 ==============================
test('domyślne okno kiosku: 20 min przed / 5 min po we wszystkich miejscach klienta', () => {
    assert.match(czytaj('app.html'), /id="nowe-przed" value="20"/);
    assert.match(czytaj('app.html'), /id="nowe-po" value="5"/);
    assert.ok(part3.includes('isNaN(przedRaw) ? 20'));
    assert.ok(czytaj('js/app.part5.js').includes(': 20;') && czytaj('js/app.part5.js').includes('isNaN(pr) ? 20'));
    const p6 = czytaj('js/app.part6.js');
    assert.ok(p6.includes('okno_przed_min: 20, okno_po_min: 5'));
    assert.ok(p6.includes("$('nowe-przed').value === '20'"));
    assert.ok(czytaj('js/app.part11.js').includes('start - 20 * 60000'));
    const wskazowki = i18n.match(/'cal\.window_hint': '[^']*'/g);
    assert.equal(wskazowki.length, 3);
    for (const w of wskazowki) { assert.ok(/\b20\b/.test(w) && !/\b15\b/.test(w), w); }
});

// ============================== TŁUMACZENIA ==============================
test('nowe klucze tłumaczeń istnieją w PL, EN i UK', () => {
    for (const k of ['cam.switch', 'cam.switching', 'cam.front', 'cam.back', 'cam.only_one', 'cam.switch_failed', 'bdg.need_sql40']) {
        const wystapienia = (i18n.match(new RegExp("'" + k.replace('.', '\\.') + "':", 'g')) || []).length;
        assert.equal(wystapienia, 3, k);
    }
});

// ============================== ZMIANA KAMERY ==============================
class El {
    constructor(id, els) { this.id = id; this._els = els; this.style = {}; this.listeners = {}; this.textContent = ''; this.disabled = false; this.hidden = false;
        this.readyState = 4; this.videoWidth = 640; this.videoHeight = 480; this.srcObject = null; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    async play() {}
    getContext() { return { drawImage() {}, getImageData: () => ({ data: [], width: 1, height: 1 }) }; }
    remove() { delete this._els[this.id]; }
    set innerHTML(v) { for (const m of v.matchAll(/id="([a-z0-9-]+)"/g)) this._els[m[1]] = new El(m[1], this._els); }
    get innerHTML() { return ''; }
}
function srodowiskoKamery({ kamery, zachowanie, zapisanyTryb }) {
    const els = {}, tory = [], zadania = [], click = [];
    const strumien = (opis) => { const tor = { zatrzymany: false, stop() { this.zatrzymany = true; }, getSettings: () => opis.ustawienia || {}, label: opis.label || '' }; tory.push(tor); return { getTracks: () => [tor], getVideoTracks: () => [tor], tor }; };
    const store = zapisanyTryb ? { em_kamera_tryb: zapisanyTryb } : {};
    const document = {
        body: { appendChild: (c) => { els[c.id] = c; } },
        getElementById: (id) => els[id] || null,
        createElement: () => new El('x', els),
        addEventListener: (t, f) => { if (t === 'click') click.push(f); },
        head: { appendChild() {} }
    };
    document.createElement = () => { const e = new El('x', els); return e; };
    const ctx = vm.createContext({
        console, document, Promise, setTimeout, clearTimeout,
        esc: (v) => String(v), t: (k) => k, obslugaZeskanowanegoKodu: () => {},
        requestAnimationFrame: () => 1, cancelAnimationFrame: () => {},
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        BarcodeDetector: class { constructor() {} async detect() { return []; } },
        navigator: { mediaDevices: {
            getUserMedia: async (c) => { zadania.push(JSON.parse(JSON.stringify(c))); return strumien(zachowanie(c, zadania.length)); },
            enumerateDevices: async () => kamery
        } }
    });
    ctx.window = ctx;
    vm.runInContext(czytaj('js/skaner-kamery.js'), ctx);
    const kliknij = async (selektor) => { for (const f of click) await f({ target: { closest: (s) => (s === selektor ? {} : null) } }); await pause(30); };
    return { els, tory, zadania, store, kliknij };
}
const telefon = [{ kind: 'videoinput', deviceId: 'tyl', label: 'back' }, { kind: 'videoinput', deviceId: 'przod', label: 'front' }];

test('kamera: okno skanera ma przycisk zmiany kamery, a start używa zapamiętanej (domyślnie tylnej)', async () => {
    const e = srodowiskoKamery({ kamery: telefon, zachowanie: (c) => ({ ustawienia: { deviceId: 'tyl', facingMode: 'environment' } }) });
    await e.kliknij('#btn-skaner-kamery');
    assert.ok(e.els['skaner-kamery-przelacz'], 'przycisk zmiany kamery');
    assert.deepEqual(e.zadania[0], { video: { facingMode: { ideal: 'environment' } }, audio: false });
    assert.equal(e.els['skaner-kamery-przelacz'].hidden, false);
    assert.equal(e.els['skaner-kamery-przelacz'].disabled, false);
    assert.equal(e.els['skaner-kamery-wideo'].style.transform, '');
});
test('kamera: zmiana tył → przód zamyka stary strumień, otwiera przedni (lustro) i zapamiętuje wybór', async () => {
    const e = srodowiskoKamery({ kamery: telefon, zachowanie: (c) => (c.video.facingMode && c.video.facingMode.exact === 'user' ? { ustawienia: { deviceId: 'przod', facingMode: 'user' } } : { ustawienia: { deviceId: 'tyl', facingMode: 'environment' } }) });
    await e.kliknij('#btn-skaner-kamery');
    await e.els['skaner-kamery-przelacz'].listeners.click[0]();
    assert.deepEqual(e.zadania[1], { video: { facingMode: { exact: 'user' } }, audio: false });
    assert.equal(e.tory[0].zatrzymany, true, 'stara kamera zwolniona przed otwarciem nowej');
    assert.equal(e.tory[1].zatrzymany, false);
    assert.equal(e.els['skaner-kamery-wideo'].style.transform, 'scaleX(-1)');
    assert.equal(e.store.em_kamera_tryb, 'user');
    assert.equal(e.els['skaner-kamery-status'].textContent, 'cam.aim');
    assert.equal(e.els['skaner-kamery-rodzaj'].textContent, '📷 cam.front');
    // powrót przód → tył
    await e.els['skaner-kamery-przelacz'].listeners.click[0]();
    assert.deepEqual(e.zadania[2], { video: { facingMode: { exact: 'environment' } }, audio: false });
    assert.equal(e.store.em_kamera_tryb, 'environment');
});
test('kamera: kolejne skanowanie startuje od zapamiętanej kamery (przedniej) i odbija podgląd', async () => {
    const e = srodowiskoKamery({ kamery: telefon, zapisanyTryb: 'user', zachowanie: () => ({ ustawienia: { deviceId: 'przod', facingMode: 'user' } }) });
    await e.kliknij('#btn-skaner-kamery');
    assert.deepEqual(e.zadania[0], { video: { facingMode: { ideal: 'user' } }, audio: false });
    assert.equal(e.els['skaner-kamery-wideo'].style.transform, 'scaleX(-1)');
});
test('kamera: komputer bez facingMode — zmiana przechodzi do następnej kamery z listy urządzeń', async () => {
    const komputer = [{ kind: 'videoinput', deviceId: 'a', label: 'Kamera A' }, { kind: 'videoinput', deviceId: 'b', label: 'Kamera B' }];
    const e = srodowiskoKamery({ kamery: komputer, zachowanie: (c) => {
        if (c.video.facingMode && c.video.facingMode.exact) throw new Error('OverconstrainedError');
        return { ustawienia: { deviceId: (c.video.deviceId && c.video.deviceId.exact) || 'a' }, label: 'Kamera' };
    } });
    await e.kliknij('#btn-skaner-kamery');
    await e.els['skaner-kamery-przelacz'].listeners.click[0]();
    assert.deepEqual(e.zadania.at(-1), { video: { deviceId: { exact: 'b' } }, audio: false });
    assert.equal(e.tory[0].zatrzymany, true);
    assert.equal(e.els['skaner-kamery-status'].textContent, 'cam.aim');
});
test('kamera: gdy zmiana się nie uda, wraca poprzednia kamera i skaner dalej działa', async () => {
    const e = srodowiskoKamery({ kamery: telefon, zachowanie: (c) => {
        if (c.video.facingMode && c.video.facingMode.exact) throw new Error('NotReadableError');
        if (c.video.deviceId && c.video.deviceId.exact === 'przod') throw new Error('NotReadableError');
        return { ustawienia: { deviceId: 'tyl', facingMode: 'environment' } };
    } });
    await e.kliknij('#btn-skaner-kamery');
    await e.els['skaner-kamery-przelacz'].listeners.click[0]();
    const ostatnie = e.zadania.at(-1);
    assert.deepEqual(ostatnie, { video: { deviceId: { exact: 'tyl' } }, audio: false });     // przywrócona tylna
    assert.match(e.els['skaner-kamery-status'].textContent, /cam\.switch_failed/);
    assert.equal(e.els['skaner-kamery-przelacz'].disabled, false);
    assert.equal(e.tory.at(-1).zatrzymany, false);
});
test('kamera: urządzenie z jedną kamerą — przycisk zmiany jest ukryty', async () => {
    const e = srodowiskoKamery({ kamery: [{ kind: 'videoinput', deviceId: 'x', label: 'jedyna' }], zachowanie: () => ({ ustawienia: { deviceId: 'x' } }) });
    await e.kliknij('#btn-skaner-kamery');
    assert.equal(e.els['skaner-kamery-przelacz'].hidden, true);
});
test('kamera: zamknięcie okna zwalnia kamerę', async () => {
    const e = srodowiskoKamery({ kamery: telefon, zachowanie: () => ({ ustawienia: { deviceId: 'tyl', facingMode: 'environment' } }) });
    await e.kliknij('#btn-skaner-kamery');
    await e.els['skaner-kamery-zamknij'].listeners.click[0]();
    assert.equal(e.tory[0].zatrzymany, true);
    assert.equal(e.els['skaner-kamery-okno'], undefined);
});
