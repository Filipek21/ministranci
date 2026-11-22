// ============================================================================
// SEKRETY (v2.15.14) — szyfrowany magazyn małych sekretów urządzenia (np. token Kiosku).
//
// Dlaczego: token Kiosku leżał jawnie w localStorage (ryzyko R4 z docs/SZYFR_MINISTRANCKI.md).
// Teraz: AES-256-GCM, klucz NIEWYEKSPORTOWALNY (WebCrypto) w osobnym IndexedDB `em_sekrety`,
// AAD wiąże szyfrogram z nazwą sekretu (nie da się podmienić rekordu pod inną nazwą).
// API jest SYNCHRONICZNE do odczytu (kopia w pamięci), a trwały zapis dzieje się w tle —
// dzięki temu istniejący kod Kiosku nie musiał być przepisywany na async.
//
// Gwarancje i ograniczenia (uczciwie):
//  • chroni przed odczytem profilu/DevTools→Application bez uruchomionego kodu aplikacji;
//  • NIE chroni przed skryptem z tego samego pochodzenia (XSS) ani przed kopią całego profilu
//    (klucz leży w tym samym profilu) — patrz docs/SZYFR_MINISTRANCKI.md §6 „Ograniczenia PWA”;
//  • gdy WebCrypto/IndexedDB jest niedostępne, moduł wraca do localStorage (jak dotychczas)
//    i raportuje to w tryb() === 'localStorage' — nic się nie psuje, ale nie ma szyfrowania.
// Migracja: stary jawny wpis z localStorage jest kasowany DOPIERO po odczytaniu i odszyfrowaniu kopii.
// ============================================================================
(function (global) {
    'use strict';

    const DB_NAZWA = 'em_sekrety';
    const S_KLUCZ = 'klucz';
    const S_DANE = 'dane';
    const FORMAT = 1;
    const RE_NAZWA = /^[a-z][a-z0-9_]{0,39}$/;
    const MAKS_DLUGOSC = 4096;
    // nazwa sekretu → klucz w localStorage używany wcześniej (do migracji i do trybu awaryjnego)
    const LEGACY = { kiosk_token: 'em_kiosk_token' };

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    function doB64(buf) {
        const b = new Uint8Array(buf); let s = '';
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        return btoa(s);
    }
    function zB64(s) { const b = atob(s); const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i); return o; }

    // --- adaptery składowania ---------------------------------------------------------------
    class MemAdapter {
        constructor() { this.m = { [S_KLUCZ]: new Map(), [S_DANE]: new Map() }; }
        async get(s, k) { return this.m[s].has(k) ? this.m[s].get(k) : null; }
        async put(s, k, v) { this.m[s].set(k, v); }
        async del(s, k) { this.m[s].delete(k); }
        async keys(s) { return Array.from(this.m[s].keys()); }
        async clear() { this.m[S_KLUCZ].clear(); this.m[S_DANE].clear(); }
    }

    class IdbAdapter {
        constructor(idb) { this.idb = idb || global.indexedDB; this.dbp = null; }
        db() {
            if (!this.dbp) {
                this.dbp = new Promise((ok, err) => {
                    const r = this.idb.open(DB_NAZWA, 1);
                    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(S_KLUCZ)) d.createObjectStore(S_KLUCZ); if (!d.objectStoreNames.contains(S_DANE)) d.createObjectStore(S_DANE); };
                    r.onsuccess = () => ok(r.result);
                    r.onerror = () => err(r.error || new Error('idb'));
                    r.onblocked = () => err(new Error('idb zablokowane'));
                });
            }
            return this.dbp;
        }
        async tx(s, tryb, fn) {
            const d = await this.db();
            return new Promise((ok, err) => {
                const t = d.transaction(s, tryb); const st = t.objectStore(s); const r = fn(st);
                t.oncomplete = () => ok(r && 'result' in r ? r.result : undefined);
                t.onerror = () => err(t.error || new Error('idb'));
                t.onabort = () => err(t.error || new Error('idb'));
            });
        }
        async get(s, k) { const v = await this.tx(s, 'readonly', st => st.get(k)); return v === undefined ? null : v; }
        async put(s, k, v) { await this.tx(s, 'readwrite', st => st.put(v, k)); }
        async del(s, k) { await this.tx(s, 'readwrite', st => st.delete(k)); }
        async keys(s) { return (await this.tx(s, 'readonly', st => st.getAllKeys())) || []; }
        async clear() { await this.tx(S_DANE, 'readwrite', st => st.clear()); await this.tx(S_KLUCZ, 'readwrite', st => st.clear()); }
    }

    // --- fabryka ----------------------------------------------------------------------------
    // opcje: { adapter, crypto (z .subtle i .getRandomValues), ls (obiekt jak localStorage lub null) }
    function utworz(opcje) {
        const o = opcje || {};
        const adapter = o.adapter || null;
        const cr = o.crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
        const ls = o.ls === undefined ? (function () { try { return global.localStorage || null; } catch (e) { return null; } })() : o.ls;

        const pamiec = new Map();      // nazwa → wartość (jawna, tylko w RAM)
        let stan = 'start';            // 'start' | 'szyfrowany' | 'localStorage'
        let klucz = null;
        let kolejkaZapisow = Promise.resolve();

        function lsGet(n) { try { return ls && LEGACY[n] ? ls.getItem(LEGACY[n]) : null; } catch (e) { return null; } }
        function lsSet(n, v) { try { if (ls && LEGACY[n]) { ls.setItem(LEGACY[n], v); return true; } } catch (e) { /* ignoruj */ } return false; }
        function lsDel(n) { try { if (ls && LEGACY[n]) ls.removeItem(LEGACY[n]); } catch (e) { /* ignoruj */ } }

        function sprawdzNazwe(n) { if (typeof n !== 'string' || !RE_NAZWA.test(n)) throw new Error('Niepoprawna nazwa sekretu'); }
        function sprawdzWartosc(v) { if (typeof v !== 'string' || v.length === 0 || v.length > MAKS_DLUGOSC) throw new Error('Niepoprawna wartość sekretu'); }
        const aad = (n) => enc.encode('em|sekret|v' + FORMAT + '|' + n);

        async function pobierzKlucz() {
            if (klucz) return klucz;
            let k = await adapter.get(S_KLUCZ, 'glowny');
            if (!k) {
                k = await cr.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);   // extractable = false
                await adapter.put(S_KLUCZ, 'glowny', k);
                const ponownie = await adapter.get(S_KLUCZ, 'glowny');   // wygrywa pierwszy zapis (wyścig dwóch kart)
                if (ponownie) k = ponownie;
            }
            klucz = k; return k;
        }
        async function szyfruj(n, tekst) {
            const k = await pobierzKlucz();
            const iv = cr.getRandomValues(new Uint8Array(12));
            const ct = await cr.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(n), tagLength: 128 }, k, enc.encode(tekst));
            return { v: FORMAT, iv: doB64(iv), ct: doB64(ct) };
        }
        async function odszyfruj(n, rek) {
            if (!rek || rek.v !== FORMAT) throw new Error('format');
            const k = await pobierzKlucz();
            const jawny = await cr.subtle.decrypt({ name: 'AES-GCM', iv: zB64(rek.iv), additionalData: aad(n), tagLength: 128 }, k, zB64(rek.ct));
            return dec.decode(jawny);
        }
        async function zapiszTrwale(n, v) {
            await adapter.put(S_DANE, n, await szyfruj(n, v));
            const odczyt = await odszyfruj(n, await adapter.get(S_DANE, n));   // weryfikacja przed skasowaniem jawnej kopii
            if (odczyt !== v) throw new Error('weryfikacja zapisu');
        }

        // Start: odczyt zaszyfrowanych wpisów + migracja jawnych kopii z localStorage.
        async function start() {
            if (!adapter || !cr || !cr.subtle) { stan = 'localStorage'; return stan; }
            try {
                for (const n of await adapter.keys(S_DANE)) {
                    try { pamiec.set(n, await odszyfruj(n, await adapter.get(S_DANE, n))); }
                    catch (e) { /* uszkodzony rekord: nie kasujemy po cichu, nie udostępniamy */ }
                }
                for (const n of Object.keys(LEGACY)) {
                    const stary = lsGet(n);
                    if (stary) {
                        if (!pamiec.has(n)) { await zapiszTrwale(n, stary); pamiec.set(n, stary); }
                        else if (pamiec.get(n) !== stary) { await zapiszTrwale(n, stary); pamiec.set(n, stary); }   // jawny wpis jest nowszy (np. kopia z innej karty)
                        lsDel(n);
                    }
                }
                stan = 'szyfrowany';
            } catch (e) {
                stan = 'localStorage';   // brak IndexedDB/WebCrypto albo błąd — zachowanie jak przed v2.15.14
                try { console.warn('Sekrety: zapis szyfrowany niedostępny (' + (e && e.name) + ') — tryb localStorage.'); } catch (x) { /* ignoruj */ }
            }
            return stan;
        }
        const gotowe = Promise.resolve().then(start);

        function pobierz(n) {
            sprawdzNazwe(n);
            if (pamiec.has(n)) return pamiec.get(n);
            if (stan === 'szyfrowany') return null;           // po starcie prawda jest w pamięci (jawnej kopii już nie ma)
            return lsGet(n);                                   // przed startem / tryb awaryjny: dotychczasowe źródło
        }
        function ustaw(n, v) {
            sprawdzNazwe(n); sprawdzWartosc(v);
            pamiec.set(n, v);
            const zadanie = kolejkaZapisow.then(async () => {
                await gotowe;
                if (stan !== 'szyfrowany') { lsSet(n, v); return false; }
                try { await zapiszTrwale(n, v); lsDel(n); return true; }
                catch (e) { lsSet(n, v); return false; }       // nie gubimy tokenu, gdy zapis szyfrowany zawiedzie
            });
            kolejkaZapisow = zadanie.catch(() => undefined);
            return zadanie;
        }
        function usun(n) {
            sprawdzNazwe(n);
            pamiec.delete(n); lsDel(n);
            const zadanie = kolejkaZapisow.then(async () => { await gotowe; if (adapter && stan === 'szyfrowany') { try { await adapter.del(S_DANE, n); } catch (e) { /* ignoruj */ } } });
            kolejkaZapisow = zadanie.catch(() => undefined);
            return zadanie;
        }
        async function wyczyscWszystko() { pamiec.clear(); for (const n of Object.keys(LEGACY)) lsDel(n); await gotowe; if (adapter) { try { await adapter.clear(); } catch (e) { /* ignoruj */ } } klucz = null; }
        function zablokuj() { klucz = null; }              // zrzuca klucz z pamięci (nie gwarantuje wyzerowania)

        return { pobierz, ustaw, usun, gotowe, tryb: () => stan, wyczyscWszystko, zablokuj, _adapter: adapter };
    }

    const API = { utworz, MemAdapter, IdbAdapter, FORMAT, LEGACY };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') {
        let adapter = null;
        try { if (global.indexedDB && global.crypto && global.crypto.subtle) adapter = new IdbAdapter(); } catch (e) { adapter = null; }
        global.EMSekretyAPI = API;
        global.EMSekrety = utworz({ adapter });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
