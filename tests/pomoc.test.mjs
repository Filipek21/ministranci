// Testy v2.15.08: interaktywna pomoc (js/pomoc.js). Dane przewodników ładowane w vm bez przeglądarki;
// sprawdzamy kontrakt: każdy krok ma tekst, a każdy selektor #id istnieje w HTML-u albo w JS-ie (elementy tworzone dynamicznie).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(czytaj('js/pomoc.js'), { module: mod, window: {} });
const { PRZEWODNIKI, UI } = mod.exports;
const html = { kiosk: czytaj('kiosk.html'), app: czytaj('app.html'), index: czytaj('index.html') };
const DYNAMICZNE = ['btn-kontakt', 'skaner-kamery-okno', 'btn-asystent'];
const CTX = { start: 'index', login: 'app', ministrant: 'app', ksiadz: 'app', admin: 'app', kiosk: 'kiosk', 'kiosk-ksiadz': 'kiosk', 'kiosk-admin': 'kiosk' };
const tekst = (o) => (typeof o === 'string' ? o : (o && o.pl) || '');

test('są wszystkie konteksty', () => assert.deepEqual(Object.keys(PRZEWODNIKI).sort(), Object.keys(CTX).sort()));
test('każdy kontekst ma tematy, a temat ma id, tytuł i kroki', () => {
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) {
        assert.ok(tematy.length > 0, k);
        const ids = new Set();
        for (const t of tematy) { assert.ok(t.id && !ids.has(t.id), k + ' id ' + t.id); ids.add(t.id); assert.ok(tekst(t.tytul), t.id); assert.ok(t.kroki.length > 0, t.id); }
    }
});
test('każdy krok ma tytuł i tekst; w kioskach i panelu ministranta są wersje EN i UK', () => {
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) for (const t of tematy) for (const s of t.kroki) {
        assert.ok(tekst(s.tytul) && tekst(s.tekst), t.id);
        if (['kiosk', 'login', 'ministrant', 'start'].includes(k)) {
            for (const j of ['en', 'uk']) { assert.ok(s.tekst[j] && s.tekst[j] !== s.tekst.pl, k + '/' + t.id + ' brak ' + j); }
        }
    }
});
test('selektory #id wskazują elementy, które istnieją w HTML lub są tworzone w JS', () => {
    const braki = [];
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) for (const t of tematy) for (const s of t.kroki) {
        for (const sel of [s.cel, s.ekran && '#' + s.ekran, ...(s.cele || [])]) {
            if (typeof sel !== 'string') continue;
            for (const m of sel.matchAll(/#([a-z0-9-]+)/gi)) {
                const id = m[1];
                if (DYNAMICZNE.includes(id)) continue;
                if (!html[CTX[k]].includes('id="' + id + '"')) braki.push(k + '/' + t.id + ' → #' + id);
            }
        }
    }
    assert.deepEqual(braki, []);
});
test('zakładki użyte w zak() istnieją w panelu', () => {
    for (const t of [...PRZEWODNIKI.admin, ...PRZEWODNIKI.ksiadz]) for (const s of t.kroki) {
        const m = typeof s.cel === 'string' && s.cel.match(/^\.tabs button\[data-tab="(\w+)"\]$/);
        if (m) assert.ok(html.app.includes('data-tab="' + m[1] + '"'), m[1]);
    }
});
test('Ksiądz nie dostaje tematów Admina; Admin dostaje wszystkie tematy Księdza', () => {
    const k = PRZEWODNIKI.ksiadz.map((t) => t.id), a = PRZEWODNIKI.admin.map((t) => t.id);
    assert.ok(!k.some((i) => i.startsWith('a-')));
    k.forEach((i) => assert.ok(a.includes(i), i));
    assert.ok(a.some((i) => i.startsWith('a-')));
    const ek = PRZEWODNIKI['kiosk-ksiadz'].map((t) => t.id);
    assert.ok(!ek.includes('e-odblokuj') && !ek.includes('e-czysc') && PRZEWODNIKI['kiosk-admin'].map((t) => t.id).includes('e-odblokuj'));
});
test('teksty interfejsu mają PL/EN/UK', () => { for (const [k, v] of Object.entries(UI)) if (k !== 'tylkoPl') for (const j of ['pl', 'en', 'uk']) assert.ok(v[j], k + ' ' + j); });
test('pomoc jest wpięta w kiosk, panel, stronę startową i service worker; nie nadpisuje istniejących plików logiki', () => {
    for (const h of ['kiosk.html', 'app.html', 'index.html']) assert.match(czytaj(h), /js\/pomoc\.js\?v=/);
    assert.match(czytaj('sw.js'), /js\/pomoc\.js/);
    assert.match(czytaj('css/style.css'), /\.pomoc-przycisk/);
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.15\.13'/);
});
test('przycisk pomocy jest w lewym dolnym rogu', () => assert.match(czytaj('css/style.css'), /\.pomoc-przycisk \{ position: fixed; left: 12px; bottom:/));

test('v2.15.13: obecność na kiosku pokazuje OBA sposoby (karta i kamera) w jednym kroku, bez odsyłania do innego tematu', () => {
    const t = PRZEWODNIKI.kiosk.find((x) => x.id === 'k-obecnosc');
    const k1 = t.kroki[0];
    assert.ok(k1.cele.includes('#btn-skaner-kamery'));
    for (const j of ['pl', 'en', 'uk']) { assert.match(k1.tekst[j], /A\)/); assert.match(k1.tekst[j], /B\)/); }
    assert.ok(t.kroki.some((s) => typeof s.gdy === 'function'), 'krok kamery reaguje na otwarcie okna kamery');
    assert.ok(!/temat/i.test(k1.tekst.pl), 'bez odsyłania do innego tematu');
});
test('v2.15.13: filtr zgłoszeń „Oczekujące” ma pomijanie spełnionego kroku; zakładki też', () => {
    const z = PRZEWODNIKI.ksiadz.find((x) => x.id === 'p-zgloszenia');
    assert.equal(typeof z.kroki.find((s) => s.cel === '#zg-filtr-status').pomin, 'function');
    assert.equal(typeof z.kroki[0].pomin, 'function');
});
test('v2.15.13: przyciski „▶ Pokaż krok po kroku” wskazują istniejące tematy tego samego kontekstu', () => {
    for (const [k, tematy] of Object.entries(PRZEWODNIKI)) for (const t of tematy) for (const s of t.kroki) if (s.przycisk) {
        assert.ok(tematy.some((x) => x.id === s.przycisk.temat), k + '/' + t.id + ' → ' + s.przycisk.temat);
        assert.ok(tekst(s.przycisk.tekst));
    }
});
test('v2.15.13: więcej tematów niż w 2.15.08 i nowe kategorie', () => {
    const ile = (k) => PRZEWODNIKI[k].length;
    assert.ok(ile('kiosk') >= 13 && ile('ministrant') >= 12 && ile('login') >= 6 && ile('ksiadz') >= 18 && ile('admin') >= 30 && ile('kiosk-admin') >= 7);
    for (const id of ['k-pierwszy-raz', 'k-kolory', 'k-za-wczesnie', 'k-dwa-razy', 'k-punkty', 'k-nie-reaguje']) assert.ok(PRZEWODNIKI.kiosk.some((t) => t.id === id), id);
});
test('v2.15.13: silnik ma pomijanie, pochwały, palec, szukajkę, większy tekst i czytanie na głos', () => {
    const src = czytaj('js/pomoc.js');
    for (const f of ['function zalicz', 'function konfetti', 'function toast', 'function czytaj', 'function odswiezListe', 'function podpowiedz', 'pomoc-wskaznik', 'rozmiar', 'krok.pomin']) assert.ok(src.includes(f), f);
});

test('v2.15.13: 15 nowych tematów + łącznie ponad 90 unikalnych tematów', () => {
    const wszystkie = new Set(); Object.values(PRZEWODNIKI).forEach((l) => l.forEach((t) => wszystkie.add(t.id)));
    for (const id of ['k-zly-pin', 'k-cudze-imie', 'k-karta-uszkodzona', 'k-prywatnosc', 'm-bezpieczenstwo-pin', 'm-nowy-miesiac', 'm-strona-nie-laduje', 'l-cudzy-telefon',
        'p-okno-rejestracji', 'p-blok-polaczony', 'p-tydzien', 'a-kopia-zapasowa', 'a-diagnostyka-kiosku', 'a-ustawienia-okno', 'a-odpowiedz-wiadomosc']) assert.ok(wszystkie.has(id), id);
    assert.ok(wszystkie.size >= 90, String(wszystkie.size));
});
test('v2.15.13: mini-asystent wpięty (pomoc-ai.js przed pomoc.js w HTML, w cache SW), CSS czatu i trybu auto', () => {
    for (const h of ['kiosk.html', 'app.html', 'index.html']) { const t = czytaj(h); assert.ok(t.indexOf('js/pomoc-ai.js') > 0 && t.indexOf('js/pomoc-ai.js') < t.indexOf('js/pomoc.js'), h); }
    assert.match(czytaj('sw.js'), /js\/pomoc-ai\.js/);
    const css = czytaj('css/style.css'); for (const k of ['.pomoc-zakladki', '.pomoc-czat-lista', '.pomoc-tryb-btn', '.pomoc-wskaznik']) assert.ok(css.includes(k), k);
});
test('v2.15.13: bezpieczeństwo trybu auto — lista zakazanych czynności i brak klikania na kiosku w kodzie', () => {
    const src = czytaj('js/pomoc.js');
    for (const slowo of ['zapisz', 'dodaj', 'zatwierdz', 'usun', 'odblokuj', 'anonim', 'wyloguj', 'importuj', 'wyczysc']) assert.ok(new RegExp('const ZAKAZANE = [^;]*' + slowo).test(src), slowo);
    assert.match(src, /if \(jestKioskiem\(aktywny\.kontekst\)\) return null;/);
    assert.match(src, /ponowna kontrola bezpieczeństwa tuż przed kliknięciem/);
});
test('v2.15.13: kroki, które mogą być klikane automatycznie, nie wskazują przycisków o zakazanych nazwach', () => {
    const ZAK = /(zapisz|dodaj|zatwierdz|odrzuc|usun|odblokuj|anonim|purge|wyloguj|wyczysc|importuj|generuj|zablokuj|cofnij|akceptuj|wyslij|zmien-pin|reset|nadaj|odbierz|eksport|przywroc|dezaktywuj)/i;
    for (const l of Object.values(PRZEWODNIKI)) for (const t of l) for (const s of t.kroki) if (s.auto === true) assert.ok(!ZAK.test(String(s.cel)), t.id + ' ' + s.cel);
});
