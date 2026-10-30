// ============================================================================
// BEZPIECZNY MAGAZYN (Szyfr Ministrancki v2.2) — kolejka offline + cache w IndexedDB
//
//  • AES-256-GCM (WebCrypto), osobny klucz na cel (HKDF-SHA-256 z klucza głównego), AAD wiąże rekord z id/celem/wersją klucza
//  • klucz główny: 256 losowych bitów z CSPRNG, zaimportowany jako NIEEKSPORTOWALNY CryptoKey (HKDF) i trzymany w IndexedDB
//  • format rekordu: { v, kv, iv, ct } — v = wersja formatu, kv = wersja klucza (rotacja bez utraty starych rekordów)
//  • PIN nigdy nie trafia do localStorage; w kolejce jest tylko zaszyfrowany, do czasu potwierdzonego ACK
//  • po ACK payload (PIN, kod) jest USUWANY; zostaje znacznik bez danych osobowych (historia)
//  • wygaśnięcie kolejki 36 h → status „przeterminowane”, NIC nie jest kasowane po cichu; Admin może przedłużać bez limitu
//    liczby przedłużeń (każde audytowane), albo świadomie usunąć wpis (operacja nieodwracalna)
//  • v2.14: wpis przeterminowany (> 36 h) po odzyskaniu sieci TRAFIA do systemu jako „oczekujący na akceptację Admina”
//    (sql/33) — dopiero decyzja Admina dodaje obecność. Wpisy młodsze niż 36 h synchronizują się jak dotąd, bez akceptacji.
//    Po wysłaniu do akceptacji PIN i dane są usuwane z urządzenia (zostaje znacznik bez danych osobowych).
//
// OGRANICZENIE (patrz docs/SZYFR_MINISTRANCKI.md §6): skrypt z TEGO SAMEGO pochodzenia (XSS) może wywołać te same funkcje
// WebCrypto na nieeksportowalnym kluczu. To szyfrowanie „w spoczynku” (kradzież pliku profilu, zrzut dysku, podgląd
// DevTools/Application), a nie ochrona przed złośliwym kodem działającym w aplikacji. To NIE jest E2EE.
// ============================================================================
(function (global) {
    'use strict';

    const FORMAT = 1;
    const GODZINA = 3600 * 1000;
    const RETENCJA_KOLEJKI_MS = 36 * GODZINA;
    const MAKS_PRZEDLUZENIE_JEDNORAZOWE_H = 24 * 365;   // limit jednego kliknięcia (sanity); liczby przedłużeń NIE limitujemy
    const HISTORIA_TTL_MS = 48 * GODZINA;               // znaczniki bez danych osobowych (status widoczny w UI)
    const ROTACJA_DNI = 30;
    const MAKS_PROB = 5;

    const ST = Object.freeze({
        OCZEKUJE: 'oczekujące',
        OK: 'zsynchronizowane',
        POMINIETE: 'pominięte (już istniało na serwerze)',
        BLAD: 'błąd — wymaga ręcznego sprawdzenia przez Admina',
        PRZETERMINOWANE: 'przeterminowane — wymaga decyzji Admina',
        DO_AKCEPTACJI: 'wysłane do akceptacji Admina (> 36 h)',
        USZKODZONE: 'uszkodzone — nie można odczytać'
    });
    const jestZakonczony = (st) => st === ST.OK || st === ST.DO_AKCEPTACJI || String(st || '').startsWith('pominięte');

    const enc = (s) => new TextEncoder().encode(s);
    const dec = (b) => new TextDecoder().decode(b);
    function b64(buf) {
        const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
        return btoa(s);
    }
    function ub64(str) { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

    // ------------------------------------------------------------------ adaptery ---
    function MemAdapter() {
        const sklepy = {};
        const s = (n) => (sklepy[n] = sklepy[n] || new Map());
        return {
            async get(n, k) { return s(n).has(k) ? s(n).get(k) : undefined; },
            async put(n, k, v) { s(n).set(k, v); },
            async del(n, k) { s(n).delete(k); },
            async all(n) { return Array.from(s(n).entries()); },
            async clear(n) { s(n).clear(); }
        };
    }
    const SKLEPY = ['klucze', 'kolejka', 'historia', 'cache', 'audyt', 'meta'];
    function IdbAdapter(nazwaBazy, idb) {
        const fabryka = idb || global.indexedDB;
        let dbPromise = null;
        function otworz() {
            if (!dbPromise) dbPromise = new Promise((ok, err) => {
                const r = fabryka.open(nazwaBazy || 'em_bezpieczne', 1);
                r.onupgradeneeded = () => { SKLEPY.forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n); }); };
                r.onsuccess = () => ok(r.result);
                r.onerror = () => err(r.error);
            });
            return dbPromise;
        }
        async function tx(n, tryb, fn) {
            const db = await otworz();
            return new Promise((ok, err) => {
                const t = db.transaction(n, tryb); const st = t.objectStore(n);
                let wynik; const req = fn(st);
                if (req) req.onsuccess = () => { wynik = req.result; };
                t.oncomplete = () => ok(wynik);
                t.onerror = () => err(t.error); t.onabort = () => err(t.error);
            });
        }
        return {
            get: (n, k) => tx(n, 'readonly', st => st.get(k)),
            put: (n, k, v) => tx(n, 'readwrite', st => st.put(v, k)),
            del: (n, k) => tx(n, 'readwrite', st => st.delete(k)),
            clear: (n) => tx(n, 'readwrite', st => st.clear()),
            async all(n) {
                const db = await otworz();
                return new Promise((ok, err) => {
                    const t = db.transaction(n, 'readonly'); const st = t.objectStore(n); const wyn = [];
                    const c = st.openCursor();
                    c.onsuccess = () => { const cur = c.result; if (cur) { wyn.push([cur.key, cur.value]); cur.continue(); } };
                    t.oncomplete = () => ok(wyn); t.onerror = () => err(t.error);
                });
            }
        };
    }

    // ------------------------------------------------------------------ walidacja ---
    const RE_OP_ID = /^[A-Za-z0-9_-]{8,64}$/;
    const jestTekst = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
    function waliduj(rodzaj, p) {
        if (!p || typeof p !== 'object') return 'brak payloadu';
        if (!jestTekst(p.p_kod, 40)) return 'p_kod';
        if (rodzaj === 'obecnosc_token') {
            // v2.3: operacja autoryzowana tokenem kiosku — payload NIE MOŻE zawierać PIN-u
            if ('p_pin' in p) return 'p_pin niedozwolony';
            if (!jestTekst(String(p.p_wydarzenie_id == null ? '' : p.p_wydarzenie_id), 64)) return 'p_wydarzenie_id';
            if (!jestTekst(p.p_wybor, 20)) return 'p_wybor';
            if (!Number.isFinite(Date.parse(p.p_kiedy_klient))) return 'p_kiedy_klient';
            return null;
        }
        if (!(typeof p.p_pin === 'string' && /^\d{4}$/.test(p.p_pin))) return 'p_pin';
        if (rodzaj === 'obecnosc') {
            if (!(jestTekst(String(p.p_wydarzenie_id == null ? '' : p.p_wydarzenie_id), 64))) return 'p_wydarzenie_id';
            if (!jestTekst(p.p_wybor, 20)) return 'p_wybor';
            return null;
        }
        if (rodzaj === 'zgloszenie') {
            if (!jestTekst(p.p_typ, 40)) return 'p_typ';
            if (!jestTekst(p.p_kod_plakietki, 80)) return 'p_kod_plakietki';
            return null;
        }
        return 'nieznany rodzaj';
    }
    function walidujRekord(it) {
        if (!it || typeof it !== 'object' || !RE_OP_ID.test(String(it.id || ''))) return 'id';
        if (typeof it.status !== 'string') return 'status';
        if (!Number.isFinite(Date.parse(it.kiedy_lokalnie))) return 'kiedy_lokalnie';
        if (!Number.isFinite(Number(it.wygasa_at))) return 'wygasa_at';
        if (it.status === ST.OCZEKUJE || it.status === ST.PRZETERMINOWANE) { const e = waliduj(it.rodzaj, it.payload); if (e) return 'payload:' + e; }
        return null;
    }

    // ------------------------------------------------------------------ fabryka ---
    function utworz(opcje) {
        const o = opcje || {};
        const adapter = o.adapter || IdbAdapter();
        const cr = o.crypto || global.crypto;
        const subtle = cr.subtle;
        const teraz = o.teraz || (() => Date.now());
        const kluczeCelu = new Map();       // „kv|cel” → pochodny CryptoKey (czyszczone przy zablokowaniu)
        const uzyteIv = new Set();          // „kv|iv” — wykrywanie powtórzeń nonce w obrębie sesji i wczytanych rekordów
        let aktywneKv = null;
        let kolejnoscZapisu = Promise.resolve();

        const szereguj = (fn) => { const p = kolejnoscZapisu.then(fn, fn); kolejnoscZapisu = p.catch(() => {}); return p; };

        async function nowyKlucz(kv) {
            const raw = cr.getRandomValues(new Uint8Array(32));
            const klucz = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
            raw.fill(0);
            await adapter.put('klucze', 'k' + kv, { kv, klucz, utworzono: teraz(), status: 'aktywny' });
            await adapter.put('meta', 'aktywne_kv', kv);
        }
        async function init() {
            let kv = await adapter.get('meta', 'aktywne_kv');
            if (!kv) { kv = 1; await nowyKlucz(1); }
            aktywneKv = kv;
            return { kv };
        }
        async function kluczDla(cel, kv) {
            const id = kv + '|' + cel;
            if (kluczeCelu.has(id)) return kluczeCelu.get(id);
            const w = await adapter.get('klucze', 'k' + kv);
            if (!w) throw new Error('brak klucza w wersji ' + kv);
            const k = await subtle.deriveKey(
                { name: 'HKDF', hash: 'SHA-256', salt: enc('em-szyfr-ministrancki-v2.2'), info: enc('cel:' + cel + '|kv:' + kv) },
                w.klucz, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            kluczeCelu.set(id, k);
            return k;
        }
        function nowyIv(kv) {
            for (let i = 0; i < 8; i++) {
                const iv = cr.getRandomValues(new Uint8Array(12)); const t = kv + '|' + b64(iv);
                if (!uzyteIv.has(t)) { uzyteIv.add(t); return iv; }
            }
            throw new Error('nie udało się wylosować unikalnego nonce');
        }
        const aad = (cel, id, kv) => enc(`em|v${FORMAT}|${cel}|${id}|${kv}`);

        async function szyfruj(cel, id, obiekt, kv) {
            kv = kv || aktywneKv;
            const iv = nowyIv(kv);
            const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(cel, id, kv), tagLength: 128 }, await kluczDla(cel, kv), enc(JSON.stringify(obiekt)));
            return { v: FORMAT, kv, iv: b64(iv), ct: b64(ct) };
        }
        async function odszyfruj(cel, id, rek) {
            if (!rek || rek.v !== FORMAT) throw new Error('nieobsługiwany format rekordu');
            uzyteIv.add(rek.kv + '|' + rek.iv);
            const pt = await subtle.decrypt({ name: 'AES-GCM', iv: ub64(rek.iv), additionalData: aad(cel, id, rek.kv), tagLength: 128 }, await kluczDla(cel, rek.kv), ub64(rek.ct));
            return JSON.parse(dec(pt));
        }

        // ------------------------------------------------------------ kolejka ---
        function nowyIdOperacji() { return 'op-' + cr.randomUUID(); }

        async function zapiszElement(it) {
            const blad = walidujRekord(it);
            if (blad) throw new Error('rekord kolejki odrzucony: ' + blad);
            if (jestZakonczony(it.status)) {
                // ACK: znacznik BEZ danych osobowych + usunięcie zaszyfrowanego payloadu
                const juz = await adapter.get('historia', it.id);   // powtórny zapis nie przedłuża życia znacznika
                await adapter.put('historia', it.id, { id: it.id, rodzaj: it.rodzaj, status: it.status, kiedy_lokalnie: it.kiedy_lokalnie, zsynchronizowano: juz ? juz.zsynchronizowano : teraz() });
                await adapter.del('kolejka', it.id);
                return;
            }
            const rek = await szyfruj('kolejka', it.id, it);
            await adapter.put('kolejka', it.id, Object.assign({ id: it.id, status: it.status, rodzaj: it.rodzaj, kiedy_lokalnie: it.kiedy_lokalnie, wygasa_at: it.wygasa_at }, rek));
        }
        const zapiszKolejkeElement = (it) => szereguj(() => zapiszElement(it));

        async function dodaj(rodzaj, payload, meta) {
            const e = waliduj(rodzaj, payload);
            if (e) throw new Error('nieprawidłowy payload kolejki: ' + e);
            if (rodzaj === 'obecnosc' || rodzaj === 'obecnosc_token') {
                // Jeden oczekujący wpis na (ministrant, wydarzenie): ogranicza zgadywanie PIN-ów offline (każda próba i tak idzie
                // do serwera, który ma własne blokady) i chroni przed przypadkowym dublowaniem.
                const juz = (await wczytajKolejke()).some(x => (x.status === ST.OCZEKUJE || x.status === ST.PRZETERMINOWANE) && x.payload &&
                    (x.rodzaj === 'obecnosc' || x.rodzaj === 'obecnosc_token') && x.payload.p_kod === payload.p_kod && String(x.payload.p_wydarzenie_id) === String(payload.p_wydarzenie_id));
                if (juz) { const err = new Error('DUPLIKAT_LOKALNY'); err.kod = 'DUPLIKAT_LOKALNY'; throw err; }
            }
            const it = {
                id: nowyIdOperacji(), rodzaj, payload: Object.assign({}, payload), meta: meta || {},
                kiedy_lokalnie: new Date(teraz()).toISOString(), status: ST.OCZEKUJE,
                proby_synchronizacji: 0, ostatni_blad: null, wygasa_at: teraz() + RETENCJA_KOLEJKI_MS, przedluzenia: 0
            };
            await zapiszKolejkeElement(it);   // zwraca dopiero po trwałym zapisie
            return it;
        }

        async function wczytajKolejke() {
            await kolejnoscZapisu;
            const wyniki = [];
            const hist = new Map(await adapter.all('historia'));
            const nieaktualne = teraz() - HISTORIA_TTL_MS;
            for (const [k, h] of hist) if (h.zsynchronizowano < nieaktualne) { await adapter.del('historia', k); hist.delete(k); }
            for (const [id, rek] of await adapter.all('kolejka')) {
                if (hist.has(id)) { await adapter.del('kolejka', id); continue; }   // uzgodnienie po przerwanym zapisie ACK
                try {
                    const it = await odszyfruj('kolejka', id, rek);
                    const blad = walidujRekord(it);
                    if (blad || it.id !== id) throw new Error('walidacja: ' + (blad || 'id'));
                    wyniki.push(it);
                } catch (e) {
                    // uszkodzony / zmodyfikowany rekord: NIE kasujemy po cichu — widoczny dla Admina
                    wyniki.push({ id, rodzaj: rek.rodzaj, status: ST.USZKODZONE, kiedy_lokalnie: rek.kiedy_lokalnie || null, payload: null, meta: {}, ostatni_blad: 'integralność: ' + e.message, proby_synchronizacji: 0, wygasa_at: rek.wygasa_at });
                }
            }
            for (const h of hist.values()) wyniki.push({ id: h.id, rodzaj: h.rodzaj, status: h.status, kiedy_lokalnie: h.kiedy_lokalnie, payload: null, meta: {}, proby_synchronizacji: 0, ostatni_blad: null });
            return wyniki.sort((a, b) => String(a.kiedy_lokalnie).localeCompare(String(b.kiedy_lokalnie)));
        }

        // ACK wolno przyjąć wyłącznie po potwierdzonym zapisie albo rozpoznaniu operacji o tym samym id.
        function klasyfikujOdpowiedz(w) {
            if (!w || typeof w !== 'object') return 'nieznany';
            if (w.siec) return 'siec';                                       // brak odpowiedzi serwera — NIE jest ACK
            if (w.sukces === true && w.do_akceptacji === true) return 'do_akceptacji';   // v2.14: serwer przyjął wpis > 36 h do kolejki akceptacji Admina
            if (w.sukces === true) return 'zapisano';                        // transakcja zatwierdzona (także duplikat_operacji:true)
            if (/już została zaliczona|już rozpatrzone/.test(String(w.blad || ''))) return 'istnialo';
            if (/Nieprawidłowy PIN|zablokowan|blokad|Zbyt wiele prób/i.test(String(w.blad || ''))) return 'pin_odrzucony';
            return 'odrzucono';
        }
        async function zastosujOdpowiedz(it, w) {
            const k = klasyfikujOdpowiedz(w);
            if (k === 'siec' || k === 'nieznany') return k;                  // nic nie zmieniamy
            if (k === 'pin_odrzucony') {
                // Serwer odrzucił PIN. NIE ponawiamy (kolejne próby zablokowałyby konto ministranta), a PIN usuwamy od razu.
                it.status = ST.BLAD; it.ostatni_blad = String(w.blad || '').slice(0, 300); it.proby_synchronizacji += 1;
                if (it.payload) it.payload.p_pin = null;
            }
            else if (k === 'zapisano') { it.status = ST.OK; }
            else if (k === 'do_akceptacji') { it.status = ST.DO_AKCEPTACJI; }   // zakończony po stronie Kiosku: payload (PIN) znika, decyzja należy do Admina
            else if (k === 'istnialo') { it.status = ST.POMINIETE; }
            else {
                it.proby_synchronizacji += 1; it.ostatni_blad = String(w.blad || '').slice(0, 300);
                if (it.proby_synchronizacji >= MAKS_PROB) it.status = ST.BLAD;
            }
            await zapiszKolejkeElement(it);
            return k;
        }

        async function przeterminuj() {
            let n = 0;
            for (const it of await wczytajKolejke()) {
                if (it.status === ST.OCZEKUJE && it.wygasa_at < teraz()) { it.status = ST.PRZETERMINOWANE; await zapiszKolejkeElement(it); n++; }
            }
            return n;
        }

        // ------------------------------------------------------------ audyt retencji ---
        async function dopiszAudyt(wpis) {
            const aid = 'au-' + cr.randomUUID();
            const w = Object.assign({ aid, kiedy: new Date(teraz()).toISOString(), wyslano: false }, wpis);
            await adapter.put('audyt', aid, w);
            return w;
        }
        async function przedluz(id, godzin, kto, kioskId) {
            const h = Number(godzin);
            if (!Number.isFinite(h) || h <= 0 || h > MAKS_PRZEDLUZENIE_JEDNORAZOWE_H) throw new Error('nieprawidłowa liczba godzin');
            if (!jestTekst(kto, 40)) throw new Error('brak identyfikatora Admina');
            return szereguj(async () => {
                const rek = await adapter.get('kolejka', id);
                if (!rek) throw new Error('brak wpisu');
                const it = await odszyfruj('kolejka', id, rek);
                const przed = it.wygasa_at;
                it.wygasa_at = Math.max(teraz(), przed) + h * GODZINA;     // bez limitu liczby przedłużeń
                it.przedluzenia = (it.przedluzenia || 0) + 1;
                if (it.status === ST.PRZETERMINOWANE) it.status = ST.OCZEKUJE;
                await zapiszElement(it);
                return dopiszAudyt({ akcja: 'przedluzenie', op_id: id, kto, kiosk_id: kioskId || null, godzin: h, wygasa_przed: przed, wygasa_po: it.wygasa_at });
            });
        }
        async function usunNieodwracalnie(id, kto, kioskId) {
            if (!jestTekst(kto, 40)) throw new Error('brak identyfikatora Admina');
            return szereguj(async () => {
                await adapter.del('kolejka', id);
                return dopiszAudyt({ akcja: 'usuniecie_nieodwracalne', op_id: id, kto, kiosk_id: kioskId || null });
            });
        }
        // Usunięcie wpisu ZAKOŃCZONEGO (znacznik bez danych osobowych) — bez audytu retencji; niezakończone idą przez usunNieodwracalnie.
        async function usunZnacznik(id) { return szereguj(async () => { await adapter.del('historia', id); }); }
        async function audytDoWyslania() { return (await adapter.all('audyt')).map(x => x[1]).filter(w => !w.wyslano); }
        async function audytPotwierdz(aid) { const w = await adapter.get('audyt', aid); if (w) { w.wyslano = true; await adapter.put('audyt', aid, w); } }

        // ------------------------------------------------------------ cache ---
        // v2.3 (R1): hash PIN-u nie opuszcza serwera i nigdy nie trafia do trwałego magazynu urządzenia.
        function oczyscCache(dane) {
            if (!dane || typeof dane !== 'object') return { dane, zmieniono: false };
            let zmieniono = false;
            const kopia = Object.assign({}, dane);
            if (Array.isArray(dane.plakietki)) {
                kopia.plakietki = dane.plakietki.map(p => { if (p && typeof p === 'object' && 'pin_hash' in p) { zmieniono = true; const q = Object.assign({}, p); delete q.pin_hash; return q; } return p; });
            }
            return { dane: kopia, zmieniono };
        }
        async function zapiszCache(dane) {
            dane = oczyscCache(dane).dane;
            const pobrano = dane && (dane.pobrano_lokalnie || dane.pobrano) || null;
            const rek = await szyfruj('cache', 'cache', dane);
            await adapter.put('cache', 'cache', Object.assign({ pobrano }, rek));
        }
        async function wczytajCache() {
            const rek = await adapter.get('cache', 'cache');
            if (!rek) return null;
            try {
                const c = oczyscCache(await odszyfruj('cache', 'cache', rek));
                if (c.zmieniono) await zapiszCache(c.dane);       // stary rekord z pin_hash → przepisany bez niego
                return c.dane;
            } catch (e) { return null; }   // uszkodzony cache = brak cache (zostanie pobrany ponownie)
        }
        async function czasCache() { const r = await adapter.get('cache', 'cache'); return r ? r.pobrano : null; }

        // ------------------------------------------------------------ rotacja kluczy ---
        async function czyRotacjaPotrzebna(dni) {
            const w = await adapter.get('klucze', 'k' + aktywneKv);
            return !!w && (teraz() - w.utworzono) > (dni || ROTACJA_DNI) * 24 * GODZINA;
        }
        async function rotujKlucz() {
            return szereguj(async () => {
                const stare = aktywneKv, nowe = stare + 1;
                await nowyKlucz(nowe);
                aktywneKv = nowe;
                const st = await adapter.get('klucze', 'k' + stare); st.status = 'wycofany'; await adapter.put('klucze', 'k' + stare, st);
                let przeszyfrowane = 0;
                for (const [id, rek] of await adapter.all('kolejka')) {
                    if (rek.kv === nowe) continue;
                    const it = await odszyfruj('kolejka', id, rek);             // błąd odczytu → rotacja przerwana, stary klucz zostaje
                    const nowyRek = await szyfruj('kolejka', id, it, nowe);
                    await adapter.put('kolejka', id, Object.assign({}, rek, nowyRek));
                    przeszyfrowane++;
                }
                const c = await adapter.get('cache', 'cache');
                if (c && c.kv !== nowe) { const d = await odszyfruj('cache', 'cache', c); await adapter.put('cache', 'cache', Object.assign({ pobrano: c.pobrano }, await szyfruj('cache', 'cache', d, nowe))); przeszyfrowane++; }
                return { z: stare, na: nowe, przeszyfrowane };
            });
        }
        // Kontrolowane kasowanie kluczy: tylko takich, do których NIE odwołuje się żaden rekord.
        async function usunWycofaneKlucze() {
            const uzywane = new Set();
            for (const [, r] of await adapter.all('kolejka')) uzywane.add(r.kv);
            const c = await adapter.get('cache', 'cache'); if (c) uzywane.add(c.kv);
            let usuniete = 0;
            for (const [k, w] of await adapter.all('klucze')) {
                if (w.status === 'wycofany' && !uzywane.has(w.kv)) { await adapter.del('klucze', k); usuniete++; }
            }
            kluczeCelu.clear();
            return usuniete;
        }

        // ------------------------------------------------------------ migracja z localStorage ---
        // Przenosi oczekujące wpisy (także z jawnym PIN-em) do zaszyfrowanej kolejki. Klucze localStorage są kasowane
        // dopiero po ODCZYTANIU I ZWERYFIKOWANIU zaszyfrowanych kopii. Wpisów, których nie da się zmigrować, NIE kasujemy.
        async function migrujLegacy(ls) {
            const wynik = { przeniesione: 0, pominiete_bez_pin: 0, odrzucone: 0, cache: false, zachowano_localStorage: false };
            let stara = []; try { stara = JSON.parse(ls.getItem('em_offline_kolejka') || '[]'); } catch (e) { wynik.zachowano_localStorage = true; return wynik; }
            const oczekujace = [];
            for (const z of Array.isArray(stara) ? stara : []) {
                if (z && z.status === ST.OCZEKUJE) {
                    const id = RE_OP_ID.test(String(z.id)) ? z.id : nowyIdOperacji();
                    const it = {
                        id, rodzaj: z.rodzaj, payload: z.payload, meta: z.meta || {},
                        kiedy_lokalnie: z.kiedy_lokalnie, status: ST.OCZEKUJE, proby_synchronizacji: z.proby_synchronizacji || 0, ostatni_blad: z.ostatni_blad || null,
                        wygasa_at: Date.parse(z.kiedy_lokalnie) + RETENCJA_KOLEJKI_MS, przedluzenia: 0
                    };
                    if (it.payload && it.payload.p_pin === '••••') { wynik.pominiete_bez_pin++; continue; }
                    if (waliduj(it.rodzaj, it.payload)) { wynik.odrzucone++; continue; }
                    oczekujace.push(it);
                }
            }
            for (const it of oczekujace) { await zapiszKolejkeElement(it); wynik.przeniesione++; }
            const odczyt = new Map((await wczytajKolejke()).map(x => [x.id, x]));
            const wszystkieOk = oczekujace.every(it => odczyt.has(it.id) && odczyt.get(it.id).status === ST.OCZEKUJE && odczyt.get(it.id).payload && odczyt.get(it.id).payload.p_pin === it.payload.p_pin);
            if (wszystkieOk && wynik.odrzucone === 0) ls.removeItem('em_offline_kolejka'); else wynik.zachowano_localStorage = true;
            try {
                const cache = JSON.parse(ls.getItem('em_offline_dane') || 'null');
                if (cache) { await zapiszCache(cache); const t = await wczytajCache(); if (t && JSON.stringify(t) === JSON.stringify(oczyscCache(cache).dane)) { ls.removeItem('em_offline_dane'); wynik.cache = true; } }
            } catch (e) { /* cache zostanie pobrany ponownie */ }
            return wynik;
        }

        function zablokuj() { kluczeCelu.clear(); }                       // zrzuca pochodne klucze z pamięci (nie gwarantuje wyzerowania)
        async function wyczyscWszystko() { for (const n of SKLEPY) await adapter.clear(n); kluczeCelu.clear(); uzyteIv.clear(); aktywneKv = null; }

        return {
            init, dodaj, zapiszElement: zapiszKolejkeElement, wczytajKolejke, zastosujOdpowiedz, klasyfikujOdpowiedz, przeterminuj,
            przedluz, usunNieodwracalnie, usunZnacznik, audytDoWyslania, audytPotwierdz,
            zapiszCache, wczytajCache, czasCache, oczyscCache,
            czyRotacjaPotrzebna, rotujKlucz, usunWycofaneKlucze, migrujLegacy, zablokuj, wyczyscWszystko,
            _adapter: adapter, _szyfruj: szyfruj, _odszyfruj: odszyfruj, _uzyteIv: uzyteIv
        };
    }

    const API = { utworz, MemAdapter, IdbAdapter, ST, jestZakonczony, waliduj, FORMAT, RETENCJA_KOLEJKI_MS, HISTORIA_TTL_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    global.EMMagazyn = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
