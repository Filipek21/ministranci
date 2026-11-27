// Testy v2.15.17 (v2.16.02: testy asystenta AI usunięte razem z funkcją): SQL 43–46, service worker, CSP, ekran prywatności, redakcja logów.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const czytaj = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const O = require('../js/ochrona-start.js');
const P = require('../js/prywatnosc.js');
const bezKomentarzy = (s) => s.replace(/--.*$/gm, '');

test('sql/43: wyłącznie odczyt (jedno zapytanie, bez DDL/DML), 9 sekcji, wzmianka o „nie uruchomiono”', () => {
    const s = bezKomentarzy(czytaj('sql/43_audyt_dostepu_tylko_odczyt_v2_15_17.sql'));
    assert.ok(!/\b(create|alter|drop|insert|update|delete|truncate|grant|revoke|execute|perform)\b/i.test(s.replace(/'[^']*'/g, "''")), 'brak poleceń zmieniających');
    for (let n = 1; n <= 9; n++) assert.match(s, new RegExp("'" + n + ' '));
    assert.equal((s.replace(/'[^']*'/g, "''").match(/;/g) || []).length, 1, 'jedno zapytanie');
    assert.match(czytaj('sql/43_audyt_dostepu_tylko_odczyt_v2_15_17.sql'), /NIE uruchomiony/);
});

test('sql/44–45: skan z tokenem i limitem per Kiosk; zamknięcie starej funkcji dopiero po sprawdzeniu v2; z cofnięciem', () => {
    const a = czytaj('sql/44_kiosk_skan_token_v2_15_17.sql'), b = czytaj('sql/45_kiosk_zamknij_stary_skan_v2_15_17.sql');
    assert.match(a, /function public\.kiosk_zapisz_skan_v2/); assert.match(a, /_kiosk_token_ok_41\(p_kiosk_id, p_token, false\)/);
    assert.match(a, /kiosk_id = left\(p_kiosk_id, 80\)[\s\S]*?>= 60/); assert.match(a, /security definer set search_path = public, extensions/);
    assert.ok(!/drop function/i.test(bezKomentarzy(a)));
    assert.match(b, /kiosk_zapisz_skan_v2\(text, text, text, text, timestamptz\)'\) is null/);
    assert.match(b, /revoke all on function public\.kiosk_zapisz_skan\(text, text, text, timestamptz\) from public, anon, authenticated/); assert.match(b, /COFNIĘCIE/);
});

test('sql/46: kopia _rola_staff_21 różni się od sql/21 TYLKO dwiema zamierzonymi zmianami', () => {
    const o = czytaj('sql/21_bez_kodu3_naprawa_uprawnien.sql'), n = czytaj('sql/46_rola_staff_blokada_v2_15_17.sql');
    const wytnij = (s) => s.slice(s.indexOf('\ncreate or replace function public._rola_staff_21(p_kod'), s.indexOf('\nrevoke all on function public._rola_staff_21'));
    const stary = wytnij(o), nowy = wytnij(n);
    const odtworzony = nowy.replace(/exception when others then return null;[^\n]*/, 'exception when others then null;')
        .replace(/    -- v2\.15\.17 \(V7\): udane[\s\S]*?end if;\n    return v_rola;/, '    return v_rola;');
    assert.equal(odtworzony, stary);
    assert.match(nowy, /return null;\s+-- v2\.15\.17 \(V7\): FAIL-CLOSED/); assert.match(nowy, /_pin_sukces/);
});

test('service worker: host bazy zgodny z supabase-client.js, hosty CDN zgodne z CSP stron, 403 dla obcych, CDN tylko GET/HEAD', () => {
    const sw = czytaj('sw.js'); const host = /SUPABASE_URL = 'https:\/\/([^']+)'/.exec(czytaj('js/supabase-client.js'))[1];
    assert.equal(/const HOST_BAZY = '([^']+)'/.exec(sw)[1], host);
    const cdnSw = new Set(JSON.parse(/const HOSTY_CDN = (\[[^\]]+\])/.exec(sw)[1].replace(/'/g, '"')));
    const zCsp = new Set();
    for (const f of ['app.html', 'kiosk.html', 'index.html']) for (const m of czytaj(f).matchAll(/https:\/\/([a-z0-9.-]+)/g)) { if (m[1] !== host && !m[1].startsWith('www.') && /Content-Security-Policy/.test(czytaj(f).split(m[0])[0])) zCsp.add(m[1]); }
    for (const h of zCsp) assert.ok(cdnSw.has(h), 'host z CSP/stron brakuje w SW: ' + h);
    assert.match(sw, /respondWith\(odmowaSieci\('host_poza_lista'\)\)/); assert.match(sw, /status: 403/); assert.match(sw, /metoda_dla_cdn/);
});

test('CSP: wymuszenie HTTPS (upgrade-insecure-requests) na każdej stronie', () => {
    for (const f of ['index.html', 'app.html', 'kiosk.html']) assert.match(/Content-Security-Policy" content="([^"]+)"/.exec(czytaj(f))[1], /(^|; )upgrade-insecure-requests(;|$)/, f);
});

test('Kiosk: zapis skanu przez wariant z tokenem; flaga „brak v2” osobna dla każdej funkcji', () => {
    assert.match(czytaj('js/kiosk.js'), /wywolajRPCKiosku\('kiosk_zapisz_skan'/);
    const c = czytaj('js/supabase-client.js');
    assert.match(c, /KIOSK_RPC_V2 = \[[^\]]*'kiosk_zapisz_skan'/); assert.match(c, /kioskV2Brak\[nazwa\]/); assert.ok(!/kioskV2Brak = true/.test(c));
});

test('redakcja logów: e-mail, telefon i PESEL zasłaniane; zwykłe liczby, UUID i znaczniki czasu zostają', () => {
    const t = O.zredagujTekst('jan@x.pl +48 600 700 800 600-700-800 44051401359 ts 1731600000000 id 12345678901 123e4567-e89b-12d3-a456-426614174000');
    assert.ok(!/jan@|600 700|600-700|44051401359/.test(t), t);
    for (const z of ['1731600000000', '12345678901', '123e4567-e89b-12d3-a456-426614174000']) assert.ok(t.includes(z), z);
    assert.deepEqual(O.zredaguj({ e: 'a@b.pl', n: 5 }), { e: '[ukryte]', n: 5 });
});

test('ekran prywatności: klasa dodawana przy schowaniu i zdejmowana po powrocie; reguła CSS istnieje; lista pól cache rozszerzona', () => {
    const klasy = new Set(); const dok = { documentElement: { classList: { add: (x) => klasy.add(x), remove: (x) => klasy.delete(x) } } };
    assert.equal(P.ustawEkranPrywatnosci(true, dok), true); assert.ok(klasy.has('em-ukryj-tresc'));
    P.ustawEkranPrywatnosci(false, dok); assert.equal(klasy.size, 0);
    assert.equal(P.ustawEkranPrywatnosci(true, {}), false);
    assert.match(czytaj('css/style.css'), /html\.em-ukryj-tresc body > \*/);
    const p = czytaj('js/prywatnosc.js'); assert.match(p, /visibilityState === 'hidden'\) \{ zamaskujWszystko\(\); ustawEkranPrywatnosci\(true\)/); assert.match(p, /'pageshow'/);
    for (const k of ['telefon_rodzica', 'kod_pocztowy', 'rok_urodzenia', 'zdjecie']) assert.ok(P.POLA_USUWANE_Z_CACHE.includes(k), k);
    const w = P.zminimalizujCache({ l: [{ id: 1, imie: 'Jan', nazwisko: 'Nowak', ulica: 'Długa', rok_urodzenia: 2010 }] });
    assert.deepEqual(w.dane.l[0], { id: 1, imie: 'Jan', nazwisko: 'N.' });
});

test('wersja 2.16.02, raport i testy wpięte w npm test; nic z poprzednich wersji nie zniknęło z listy testów', () => {
    assert.match(czytaj('js/wersja.js'), /WERSJA_APLIKACJI = '2\.16\.02'/);
    const pk = czytaj('package.json');
    for (const t of ['straznik-sieci', 'audyt-17', 'audyt-luki', 'prywatnosc', 'bezpieczenstwo-ladowanie', 'magazyn', 'synchronizacja']) assert.match(pk, new RegExp('tests/' + t + '\\.test\\.mjs'));
    assert.ok(fs.existsSync(new URL('../docs/RAPORT_V2.15.17.md', import.meta.url)));
    for (const f of ['sql/43_audyt_dostepu_tylko_odczyt_v2_15_17.sql', 'sql/44_kiosk_skan_token_v2_15_17.sql', 'sql/45_kiosk_zamknij_stary_skan_v2_15_17.sql', 'sql/46_rola_staff_blokada_v2_15_17.sql']) assert.ok(fs.existsSync(new URL('../' + f, import.meta.url)), f);
});
