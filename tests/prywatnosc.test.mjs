// Testy v2.15.16: minimalizacja danych osobowych dzieci (maska PIN, skrócone nazwisko na Kiosku, cache bez wrażliwych pól,
// brak indeksowania) + kontrola higieny HTML (ucieczka danych w szablonach).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../js/prywatnosc.js');
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('skrocNazwisko: imię + inicjał nazwiska (także polskie litery), bez nazwiska samo imię, skrót zostaje', () => {
    assert.equal(P.skrocNazwisko('Jan', 'Kowalski'), 'Jan K.');
    assert.equal(P.skrocNazwisko('Łukasz', 'łącki'), 'Łukasz Ł.');
    assert.equal(P.skrocNazwisko('Ola', ''), 'Ola'); assert.equal(P.skrocNazwisko('Ola', null), 'Ola');
    assert.equal(P.skrocNazwisko(' Jan ', ' K. '), 'Jan K.'); assert.equal(P.skrocNazwisko('', ''), '');
    assert.ok(!P.skrocNazwisko('Jan', 'Kowalski').includes('owalski'));
});

test('pinMaska: PIN nie jest widocznym tekstem, wartość w atrybucie jest zabezpieczona przed wstrzyknięciem, brak PIN-u → kreska', () => {
    const h = P.pinMaska('4821');
    assert.match(h, />••••<\/span>$/); assert.ok(!/>[^<]*4821[^<]*</.test(h)); assert.match(h, /data-pin="4821"/);
    const zly = P.pinMaska('1"><img src=x onerror=alert(1)>'); assert.ok(!zly.includes('<img')); assert.ok(!zly.includes('"><'));
    assert.equal(P.pinMaska(null), '—'); assert.equal(P.pinMaska(''), '—');
});

test('odsłanianie PIN-u: pokazuje na czas, potem maska; zamaskuj czyści zegar', () => {
    const klasy = new Set(); let timer = null; const el = { dataset: { pin: '4821' }, textContent: '••••', classList: { add: (k) => klasy.add(k), remove: (k) => klasy.delete(k) } };
    P.odslon(el, (fn, ms) => { timer = { fn, ms }; return 1; });
    assert.equal(el.textContent, '4821'); assert.ok(klasy.has('odslonieto')); assert.equal(timer.ms, P.CZAS_ODSLONIECIA_MS); assert.ok(P.CZAS_ODSLONIECIA_MS <= 10000);
    timer.fn(); assert.equal(el.textContent, '••••'); assert.ok(!klasy.has('odslonieto'));
    P.odslon({ dataset: {}, textContent: 'x', classList: { add() {} } }); // element bez data-pin — bez błędu
});

test('zminimalizujCache: inicjał nazwiska, usunięte pola wrażliwe, wejście nietknięte, idempotentne, reszta bez zmian', () => {
    const we = { pobrano: 'x', wydarzenia: [{ id: 1, nazwa: 'Msza' }], plakietki: [{ kod: 'M1', imie: 'Jan', nazwisko: 'Kowalski', email: 'a@b.pl', telefon: '123', pesel: '1', data_urodzenia: '2012-01-01', plakietka: 'PL1' }] };
    const kopia = JSON.parse(JSON.stringify(we));
    const w = P.zminimalizujCache(we);
    assert.deepEqual(we, kopia);                                   // wejście nie jest zmieniane
    assert.deepEqual(w.dane.plakietki[0], { kod: 'M1', imie: 'Jan', nazwisko: 'K.', plakietka: 'PL1' });
    assert.deepEqual(w.dane.wydarzenia, we.wydarzenia); assert.equal(w.dane.pobrano, 'x'); assert.equal(w.zmieniono, true);
    const drugi = P.zminimalizujCache(w.dane); assert.equal(drugi.zmieniono, false); assert.deepEqual(drugi.dane, w.dane);
    assert.equal(P.zminimalizujCache(null).zmieniono, false); assert.equal(P.zminimalizujCache('x').dane, 'x');
});

test('utwardzPole: ustawia tylko brakujące atrybuty (pola z własnym autocomplete, np. login, zostają)', () => {
    const mk = (a) => { const m = new Map(Object.entries(a)); return { hasAttribute: (k) => m.has(k), setAttribute: (k, v) => m.set(k, v), m }; };
    const a = mk({}); P.utwardzPole(a); assert.equal(a.m.get('autocomplete'), 'off'); assert.equal(a.m.get('spellcheck'), 'false'); assert.equal(a.m.get('autocorrect'), 'off');
    const b = mk({ autocomplete: 'username' }); P.utwardzPole(b); assert.equal(b.m.get('autocomplete'), 'username');
});

test('panel i Kiosk używają modułu: maska PIN w trzech tabelach, skrót nazwiska i minimalizacja cache na Kiosku', () => {
    assert.match(czytaj('js/app.part2.js'), /EMPrywatnosc\.pinMaska\(m\.pin_jawny\)/);
    assert.match(czytaj('js/app.part3.js'), /EMPrywatnosc\.pinMaska\(m\.pin_jawny\)/);
    assert.match(czytaj('js/app.part4.js'), /PIN: \$\{EMPrywatnosc\.pinMaska\(m\.pin_jawny\)\}/);
    // PIN nie jest już wypisywany jawnie w tabelach (wydruk plakietki — app.part4 — pozostaje funkcją biznesową)
    assert.ok(!/esc\(m\.pin_jawny \?\? '—'\)/.test(czytaj('js/app.part3.js')));
    const k = czytaj('js/kiosk.js');
    assert.match(k, /EMPrywatnosc\.skrocNazwisko\(imie, nazwisko\)/); assert.match(k, /EMPrywatnosc\.zminimalizujCache\(dane\)/); assert.match(k, /mini\.zmieniono/);
    assert.match(czytaj('js/blokada-bezczynnosci.js'), /zamaskujWszystko/);
});

test('strony: noindex, moduł wczytany przed kodem, w cache service workera, klucze i18n we wszystkich językach', () => {
    for (const f of ['index.html', 'app.html', 'kiosk.html']) assert.match(czytaj(f), /name="robots" content="noindex, nofollow/, f);
    assert.match(czytaj('robots.txt'), /Disallow: \//);
    const a = czytaj('app.html'); assert.ok(a.indexOf('js/prywatnosc.js') > 0 && a.indexOf('js/prywatnosc.js') < a.indexOf('js/app.part2.js?'));
    const k = czytaj('kiosk.html'); assert.ok(k.indexOf('js/prywatnosc.js') > 0 && k.indexOf('js/prywatnosc.js') < k.indexOf('js/kiosk.js?'));
    assert.match(czytaj('sw.js'), /js\/prywatnosc\.js/);
    assert.equal((czytaj('js/i18n.js').match(/'priv\.pin_show'/g) || []).length, 3);
    assert.match(czytaj('css/style.css'), /\.pin-maska/);
});

test('higiena HTML: dane z pól imię/nazwisko/treść/podpis/kontakt nie trafiają do szablonów bez ucieczki', () => {
    // heurystyka: w liniach z tagami HTML wyrażenie ${…} z polem ryzykownym musi być owinięte esc()/h()/komorka()/pomocnikiem
    const ryzykowne = /\.(imie|nazwisko|nazwa|tresc|podpis|kontakt|opis|uwagi|email|telefon|tytul|komentarz|odpowiedz|miejsce|notatka|powod|autor)\b/;
    const bezpieczne = /\b(esc|escH|h|komorka|osoba|przyciskOdblokuj|ucieknij)\(/;
    const pliki = fs.readdirSync(new URL('../js/', import.meta.url)).filter(f => /^app\.part\d+\.js$/.test(f)).map(f => 'js/' + f).concat(['js/kiosk.js', 'js/kontakt.js', 'js/powiadomienia.js', 'js/kiosk-sterowanie.js']);
    const bledy = [];
    for (const f of pliki) czytaj(f).split('\n').forEach((l, i) => {
        if (!l.includes('<') || !l.includes('${') || l.trim().startsWith('//')) return;
        for (const m of l.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) if (ryzykowne.test(m[1]) && !bezpieczne.test(m[1])) bledy.push(f + ':' + (i + 1) + ' ' + m[1].slice(0, 60));
    });
    assert.deepEqual(bledy, []);
});

test('wersja 2.16.00 i testy wpięte w npm test', () => {
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.16\.00'/);
    assert.match(czytaj('package.json'), /tests\/prywatnosc\.test\.mjs/);
});
