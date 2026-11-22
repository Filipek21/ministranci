// ============================================================================
// lista-poprawki.js — v2.15.06 — LOKALNE ulepszenie odczytu list papierowych (bez wysyłania czegokolwiek na zewnątrz)
// Czyste funkcje: dopasowanie błędnie odczytanego kodu do znanych kodów (odległość edycyjna z tańszą zamianą znaków
// łatwych do pomylenia przez OCR: O/0, I/1/L, S/5, B/8, Z/2, G/6) oraz wykrywanie powtórzonych kodów.
// Decyzja: odczytu list NIE wspiera zewnętrzne AI — zdjęcie listy to dane obecności małoletnich (kody + pismo ręczne, czasem imiona
// lub numery telefonów), a maskowania nie da się zastosować do obrazu przed wysłaniem. Tutaj wszystko dzieje się w przeglądarce.
// ============================================================================
(function (korzen, fabryka) {
    const api = fabryka();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else korzen.EMListaPoprawki = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const GRUPY = ['O0', 'I1L', 'S5', 'B8', 'Z2', 'G6'];
    const podobne = (a, b) => a === b || GRUPY.some(g => g.includes(a) && g.includes(b));
    const normalizuj = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    // odległość edycyjna; zamiana znaków „podobnych” kosztuje 0,5, wstawienie / usunięcie / inna zamiana 1
    function odleglosc(a, b) {
        const n = a.length, m = b.length;
        let prev = Array.from({ length: m + 1 }, (_, j) => j);
        for (let i = 1; i <= n; i++) {
            const cur = [i];
            for (let j = 1; j <= m; j++) {
                const koszt = a[i - 1] === b[j - 1] ? 0 : (podobne(a[i - 1], b[j - 1]) ? 0.5 : 1);
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + koszt);
            }
            prev = cur;
        }
        return prev[m];
    }

    // Zwraca JEDEN znany kod w odległości ≤ 1, o ile jest jednoznaczny (wyraźnie bliższy niż drugi najlepszy); inaczej null.
    function znajdzPodobnyKod(kod, znane, maksOdleglosc) {
        const k = normalizuj(kod); if (!k) return null;
        const limit = maksOdleglosc == null ? 1 : maksOdleglosc;
        const wyniki = [];
        for (const z of (znane || [])) {
            const zn = normalizuj(z); if (!zn) continue;
            if (zn === k) return null;                       // kod jest znany — nic nie poprawiamy
            if (Math.abs(zn.length - k.length) > 1) continue;
            const d = odleglosc(k, zn);
            if (d <= limit) wyniki.push({ kod: String(z).toUpperCase(), d });
        }
        if (!wyniki.length) return null;
        wyniki.sort((x, y) => x.d - y.d);
        if (wyniki.length > 1 && wyniki[1].d - wyniki[0].d < 0.5) return null;   // niejednoznaczne — niech zdecyduje człowiek
        return wyniki[0].kod;
    }

    // indeksy wierszy, które powtarzają kod widziany wcześniej (pierwsze wystąpienie nie jest duplikatem)
    function znajdzDuplikaty(kody) {
        const widziane = new Set(), dup = [];
        (kody || []).forEach((k, i) => { const n = normalizuj(k); if (!n) return; if (widziane.has(n)) dup.push(i); else widziane.add(n); });
        return dup;
    }
    return { odleglosc, znajdzPodobnyKod, znajdzDuplikaty, normalizuj };
});
