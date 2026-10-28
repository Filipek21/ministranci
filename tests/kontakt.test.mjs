import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const i18n = czytaj('js/i18n.js');
const klient = czytaj('js/kontakt.js') + czytaj('js/app.part13.js') + czytaj('app.html');
const sql = czytaj('sql/34_kontakt_z_administratorem.sql');

test('kontakt: wszystkie klucze kt.* użyte w kodzie mają tłumaczenia PL/EN/UK', () => {
    const klucze = new Set([...klient.matchAll(/(?:\bt|tt)\('(kt\.[a-z_]+)'/g)].map(m => m[1]));
    for (const k of klient.matchAll(/data-i18n="(kt\.[a-z_]+)"/g)) klucze.add(k[1]);
    ['inne', 'usterka', 'pytanie', 'pomysl', 'pilne'].forEach(c => klucze.add('kt.cat_' + c));
    ['nowe', 'przeczytane', 'zalatwione'].forEach(c => klucze.add('kt.adm_st_' + c));
    ['ministrant', 'ksiadz', 'admin'].forEach(c => klucze.add('kt.role_' + c));
    assert.ok(klucze.size > 30);
    for (const k of [...klucze].filter(x => !x.endsWith('_'))) assert.equal(i18n.split(`'${k}':`).length - 1, 3, `klucz ${k} musi występować dokładnie w 3 językach`);
});

test('kontakt: Kiosk anonimowy nie wysyła kodu ani PIN-u; Panel nie ma opcji anonimowej', () => {
    const k = czytaj('js/kontakt.js');
    assert.match(k, /p_kod: anonim \? null/);
    assert.match(k, /p_pin: anonim \? null/);
    const panel = k.slice(k.indexOf("nazwa = 'kontakt_wyslij_panel'"));
    assert.ok(!/p_anonimowe/.test(panel.slice(0, 300)), 'Panel nie przekazuje flagi anonimowości');
});

test('kontakt SQL: anonimowość wymuszona więzami i brak treści w audycie', () => {
    assert.match(sql, /kontakt_anonim_bez_autora/);
    assert.match(sql, /BEZ treści/);
    assert.match(sql, /przegladarka', case when p_anonimowe then null/);
    for (const f of ['kontakt_wyslij_panel', 'kontakt_wyslij_kiosk', 'admin_kontakt_lista', 'admin_kontakt_zrzut', 'admin_kontakt_status', 'admin_kontakt_usun', 'admin_kontakt_licznik'])
        assert.ok(sql.includes('function public.' + f), f);
});

test('v2.15.01: skaner Kiosku nie kradnie fokusu oknu kontaktu; cykl 20 s wysyła też wpisy przeterminowane', () => {
    const k = czytaj('js/kiosk.js');
    assert.match(k, /function przywrocFocus\(\) \{[^}]*kontaktOknoOtwarte\(\)/s);
    assert.match(k, /setTimeout\(\(\) => \{ if \(!kontaktOknoOtwarte\(\)\) skanerInput\.focus\(\); \}, 50\)/);
    assert.match(k, /z\.status === ST_OCZEKUJE \|\| \(z\.status === ST_PRZET && z\.payload/);
});

test('v2.15.01: zrzut ekranu — elementy poza ekranem nie kopiują pełnych stylów', () => {
    const z = czytaj('js/kontakt.js');
    const iPoza = z.indexOf('if (poza) {'), iKopia = z.indexOf('kopiujStyle(o, k, cs);');
    assert.ok(iPoza > 0 && iKopia > iPoza, 'gałąź „poza” musi poprzedzać pełne kopiowanie stylów');
});

test('v2.15.01: etykiety audytu dodane w v2.14–v2.15 istnieją we wszystkich trzech językach', () => {
    for (const k of ['aud.c.akceptacje', 'aud.c.raport_dnia', 'aud.c.kontakt', 'aud.a.zgloszono', 'aud.a.zaakceptowano', 'aud.a.przejrzano', 'aud.a.cofnieto_przejrzenie', 'aud.a.wyslano', 'aud.a.status'])
        assert.equal(i18n.split(`'${k}':`).length - 1, 3, k);
});

test('v2.15.02: zrzut cenzuruje dane osobowe Kiosku i maskuje pola formularzy', () => {
    const k = czytaj('kiosk.html');
    for (const id of ['pin-imie', 'pin-kod', 'pin-kropki', 'wynik-tresc']) assert.match(k, new RegExp(`id="${id}" data-zrzut-ukryj="1"`), id);
    assert.match(k, /class="tabela-przewijana" data-zrzut-ukryj="1"/);
    const z = czytaj('js/kontakt.js');
    assert.match(z, /k\.setAttribute\('value', zamaskuj\(o\.value\)\)/);
    assert.match(z, /k\.textContent = zamaskuj\(o\.value\)/);
    assert.ok(!/setAttribute\('value', o\.value\)/.test(z), 'wartości pól nie mogą trafiać do zrzutu jawnie');
});

test('v2.15.02: nagłówki bezpieczeństwa w trzech stronach, SQL 35 waliduje obraz i ogranicza objętość', () => {
    for (const f of ['index.html', 'app.html', 'kiosk.html']) {
        const h = czytaj(f);
        assert.match(h, /Content-Security-Policy" content="object-src 'none'; base-uri 'self'; form-action 'self'"/, f);
        assert.match(h, /name="referrer" content="no-referrer"/, f);
    }
    const s = czytaj('sql/35_bezpieczenstwo_v2_15_02.sql');
    assert.match(s, /ffd8ff%/); assert.match(s, /89504e47%/); assert.match(s, /57454250/);
    assert.match(s, /2000/); assert.match(s, /left\(p_wydarzenie_id, 64\)/); assert.match(s, /function public\.admin_kontakt_czysc/);
});

test('v2.15.02: klucze czyszczenia wiadomości mają tłumaczenia PL/EN/UK', () => {
    for (const k of ['kt.adm_clean', 'kt.adm_clean_prompt', 'kt.adm_clean_bad', 'kt.adm_clean_confirm', 'kt.adm_clean_done'])
        assert.equal(i18n.split(`'${k}':`).length - 1, 3, k);
});
