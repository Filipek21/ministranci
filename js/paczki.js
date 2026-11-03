// ============================================================================
// paczki.js — v2.15.04 — paczkowanie (batch) synchronizacji obecności Kiosk → serwer
// Czyste funkcje (bez sieci, bez DOM) — testowane w tests/paczki.test.mjs. Serwer: sql/37_paczki_rate_limit_v2_15_04.sql.
//  • paczka: maks. 5 wpisów i maks. 8 KB (JSON.stringify całego body), od najstarszego do najnowszego,
//    JEDEN rodzaj operacji na paczkę (obecnosc / obecnosc_token / zgloszenie);
//  • idempotencja zostaje na poziomie pojedynczego wpisu (id = p_id_operacji) — paczka to tylko transport;
//  • ACK tylko dla wpisów, które serwer potwierdził (sukces:true, także duplikat); błąd sieci / rate_limit = brak ACK
//    i brak podbijania proby_synchronizacji.
// ============================================================================
(function (korzen, fabryka) {
    const api = fabryka();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else korzen.EMPaczki = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const MAKS_WPISOW = 5;
    const MAKS_BAJTOW = 8192;
    const RODZAJE = ['obecnosc', 'obecnosc_token', 'zgloszenie'];
    const RATE_LIMIT_MIN_MS = 15000, RATE_LIMIT_MAKS_MS = 30000;
    const MAKS_PONOWIEN_RATE_LIMIT = 2;     // po tylu odczekaniach w jednym cyklu wracamy do synchronizacji później

    // rozmiar w bajtach UTF-8
    function bajty(s) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
        return unescape(encodeURIComponent(s)).length;
    }

    // wpis w paczce: tylko znane pola danego rodzaju (nic ponad to nie opuszcza urządzenia)
    function wpisDoPaczki(item) {
        const p = item.payload || {};
        if (item.rodzaj === 'obecnosc_token') return { id: item.id, p_kod: p.p_kod, p_wydarzenie_id: String(p.p_wydarzenie_id), p_wybor: p.p_wybor, p_kiedy_klient: p.p_kiedy_klient };
        if (item.rodzaj === 'obecnosc') return { id: item.id, p_kod: p.p_kod, p_pin: p.p_pin, p_wydarzenie_id: String(p.p_wydarzenie_id), p_wybor: p.p_wybor || 'auto' };
        if (item.rodzaj === 'zgloszenie') return { id: item.id, p_kod: p.p_kod, p_pin: p.p_pin, p_typ: p.p_typ, p_kod_plakietki: p.p_kod_plakietki };
        return null;
    }

    function budujBody(kioskId, token, rodzaj, wpisy) { return { p_kiosk_id: kioskId, p_token: token, p_rodzaj: rodzaj, p_wpisy: wpisy }; }
    function rozmiarBody(kioskId, token, rodzaj, wpisy) { return bajty(JSON.stringify(budujBody(kioskId, token, rodzaj, wpisy))); }

    const kiedy = (it) => { const t = Date.parse(it.kiedy_lokalnie || ''); return isNaN(t) ? 0 : t; };

    // Dzieli wpisy na paczki. Zwraca [{ rodzaj, items:[…], wpisy:[…], bajty }] — najstarsze paczki pierwsze.
    function podzielNaPaczki(items, opcje) {
        const o = opcje || {};
        const kioskId = o.kioskId || '', token = o.token || '';
        const maxN = o.maksWpisow || MAKS_WPISOW, maxB = o.maksBajtow || MAKS_BAJTOW;
        const posortowane = (items || []).map((it, i) => ({ it, i })).sort((a, b) => (kiedy(a.it) - kiedy(b.it)) || (a.i - b.i)).map(x => x.it);
        const wynik = [], otwarte = {};
        for (const it of posortowane) {
            const wpis = wpisDoPaczki(it);
            if (!wpis) continue;                                  // nieznany rodzaj — obsłuży ścieżka pojedyncza
            let p = otwarte[it.rodzaj];
            if (p) {
                const probne = p.wpisy.concat([wpis]);
                if (probne.length > maxN || rozmiarBody(kioskId, token, it.rodzaj, probne) > maxB) { p = null; }
            }
            if (!p) {
                p = { rodzaj: it.rodzaj, items: [], wpisy: [], bajty: 0, start: kiedy(it) };
                otwarte[it.rodzaj] = p; wynik.push(p);
            }
            p.items.push(it); p.wpisy.push(wpis);
            p.bajty = rozmiarBody(kioskId, token, it.rodzaj, p.wpisy);
        }
        return wynik.sort((a, b) => a.start - b.start);
    }

    // Ocena odpowiedzi serwera na paczkę.
    //  typ: 'siec' | 'brak_funkcji' | 'token' | 'rate_limit' | 'paczka_odrzucona' | 'wyniki'
    //  dla 'wyniki': wyniki:[{item, wynik}] (wynik zgodny z magazyn.zastosujOdpowiedz), bez_odpowiedzi:[item] (serwer nie zwrócił id → brak ACK)
    function ocenOdpowiedz(paczka, odp) {
        if (!odp || typeof odp !== 'object' || odp.siec) return { typ: 'siec' };
        if (odp.sukces !== true) {
            if (odp.kod_pg === 'PGRST202' || odp.kod_pg === '42883') return { typ: 'brak_funkcji' };
            if (odp.kod_bledu === 'rate_limit') return { typ: 'rate_limit' };
            if (odp.kod_bledu === 'token_nieprawidlowy') return { typ: 'token' };
            return { typ: 'paczka_odrzucona', blad: odp.blad || null };
        }
        if (!Array.isArray(odp.wyniki)) return { typ: 'paczka_odrzucona', blad: 'brak wyników' };
        const poId = new Map(); for (const r of odp.wyniki) if (r && r.id != null) poId.set(String(r.id), r);
        const wyniki = [], bez = [];
        for (const item of paczka.items) {
            const r = poId.get(String(item.id));
            if (!r) { bez.push(item); continue; }
            wyniki.push({ item, wynik: { sukces: r.sukces === true, duplikat: r.duplikat === true, kod_bledu: r.kod_bledu || null, blad: r.blad || null } });
        }
        return { typ: 'wyniki', wyniki, bez_odpowiedzi: bez };
    }

    const api = {
        MAKS_WPISOW, MAKS_BAJTOW, RODZAJE, MAKS_PONOWIEN_RATE_LIMIT,
        bajty, wpisDoPaczki, budujBody, rozmiarBody, podzielNaPaczki, ocenOdpowiedz,
        // odczekanie po rate_limit: 15–30 s (losowo, żeby kioski nie wracały równocześnie); testy podmieniają tę funkcję
        czekajRateLimit: function () { return new Promise(r => setTimeout(r, RATE_LIMIT_MIN_MS + Math.random() * (RATE_LIMIT_MAKS_MS - RATE_LIMIT_MIN_MS))); }
    };
    return api;
});
