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

// ------------------------------------------------------------------ v2.15.03 ----
test('v2.15.03: wersja aplikacji to 2.15.07', () => {
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.15\.07'/);
});

test('v2.15.03: przycisk kontaktu ukryty dla Admina, widoczny na ekranie logowania (bez zrzutu ekranu)', () => {
    const k = czytaj('js/kontakt.js');
    assert.match(k, /function jestLogowanie\(\)/);
    assert.match(k, /!jestAdminem\(\)/);
    assert.match(k, /kontakt_wyslij_logowanie/);
    assert.match(k, /if \(!logowanie\) \{ try \{ zrzutDane = await zrobZrzut\(\)/);
    const s = czytaj('sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql');
    assert.match(s, /function public\.kontakt_wyslij_logowanie/);
    assert.match(s, /zrodlo in \('panel', 'kiosk', 'logowanie'\)/);
    assert.match(s, /p_zrzut|null, coalesce\(p_kontekst/);
    assert.ok(!/kontakt_wyslij_logowanie[\s\S]{0,400}p_zrzut text/.test(s), 'wiadomość z logowania nie przyjmuje zrzutu');
});

test('v2.15.03: lista papierowa obsługuje literę Z (zbiórka) w przeglądarce i w SQL', () => {
    assert.match(czytaj('js/app.part9.js'), /\(\[MNOZ\]\)/);
    const s = czytaj('sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql');
    assert.match(s, /v_wyb in \('Z', 'ZBIORKA', 'ZBIÓRKA'\)/);
    assert.match(s, /k\.typ::text = 'zbiorka'/);
    assert.match(s, /function public\.admin_import_listy/);
});

test('v2.15.03: edycja wydarzeń i wpisów punktów dla Admina i Księdza', () => {
    const s = czytaj('sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql');
    for (const f of ['admin_wydarzenie_edytuj', 'admin_wydarzenie_zmien_nazwe', 'admin_wydarzenie_usun', 'admin_punkty_edytuj', 'admin_punkty_usun', 'admin_obecnosci_lista'])
        assert.match(s, new RegExp('function public\\.' + f + '\\('), f);
    assert.match(s, /_czy_staff_17/);
    assert.match(czytaj('js/app.part5.js'), /AKCJE\['cal-edytuj'\]/);
    assert.match(czytaj('js/app.part5.js'), /AKCJE\['pkt-edytuj-ob2'\]/);
    assert.match(czytaj('js/app.part13.js'), /AKCJE\['kt-uwagi'\]/);
});

test('v2.15.03: Audyt — źródła odpytywane osobno (odporna wersja), brak zdublowanych wersji funkcji', () => {
    const s = czytaj('sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql');
    assert.match(s, /foreach z in array v_zrodla loop/);
    assert.match(s, /drop function ' \|\| r\.f \|\| ' cascade/);
    assert.match(czytaj('js/app.part6.js'), /drugie podejście|filtr daty i tekstu stosujemy sami/);
});

test('v2.15.03: nowe klucze mają tłumaczenia PL/EN/UK', () => {
    const klucze = ['common.save', 'kt.desc_login', 'kt.login_name_ph', 'kt.login_contact_ph', 'kt.login_unverified', 'kt.login_unverified_short', 'kt.login_nameless',
        'kt.adm_src_login', 'kt.adm_edit_note', 'kt.adm_note_saved', 'cal.act_edit', 'cal.edit_title', 'cal.edit_before', 'cal.edit_after', 'cal.edit_hint',
        'cal.edit_need_name', 'cal.edit_need_sql', 'cal.edited', 'cal.edit_not_found'];
    for (const k of klucze) assert.equal(i18n.split(`'${k}':`).length - 1, 3, k);
    // opisy list papierowych wspominają Z
    assert.equal((i18n.match(/'lst\.pdf_footer':[^\n]*Z = /g) || []).length, 3);
});
