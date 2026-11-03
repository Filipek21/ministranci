// ============================================================================
// v2.12 — KIOSK: ZDALNE STEROWANIE I AWARYJNA BLOKADA (strona Kiosku)
//
// Co ~5 s Kiosk pyta serwer (kiosk_polecenia_pobierz): czy jest zablokowany, czy są polecenia od Admina, czy ktoś go pinguje.
//  • BLOKADA: pełnoekranowy komunikat „Kiosk wyłączony — wpisz się na papierowej liście”; skanowanie jest ignorowane.
//    Blokada pamiętana lokalnie (przeżywa odświeżenie strony), a czasowa wygasa sama.
//  • POLECENIA: odswiez, synchronizuj, pobierz_cache, wyczysc_cache, komunikat, schowaj_komunikat, jezyk, diagnostyka,
//    test_skanera, test_kamery, restart_skanera, wymus_aktualizacje. Wynik wraca do panelu Admina (kiosk_polecenie_wynik).
//  • Gdy serwer nie ma jeszcze sql/26 — działa dotychczasowy ping z sql/20 (sprawdzZadaniaPing).
// ============================================================================
(function () {
    const KLUCZ_BLOKADA = 'em_kiosk_blokada_v1';
    const KLUCZ_OSTATNI_SKAN = 'em_kiosk_ostatni_skan';
    let kioskZablokowany = false;
    let trwaPobieranie = false;
    let ostatniSkanMs = Number(localStorage.getItem(KLUCZ_OSTATNI_SKAN) || 0);
    let brakSql26 = false;
    window.__EM_STEROWANIE_AKTYWNE = true;
    let barZegara = null;

    // ----------------------------------------------------------- EKRAN BLOKADY --
    function ekranBlokady() {
        let el = document.getElementById('ekran-blokady-kiosku');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'ekran-blokady-kiosku';
        el.style.cssText = 'position:fixed; inset:0; z-index:5000; background:linear-gradient(135deg,#7f1d1d,#1e1b4b); color:#fff; display:none; align-items:center; justify-content:center; text-align:center; padding:24px;';
        el.innerHTML = `<div style="max-width:560px;">
            <div style="font-size:4rem;">⛔</div>
            <h1 id="blokada-tytul" style="margin:8px 0 12px;"></h1>
            <p id="blokada-powod" style="font-size:1.2rem; margin:0 0 12px;"></p>
            <p id="blokada-instrukcja" style="font-size:1.1rem; opacity:0.9; margin:0 0 12px;"></p>
            <p id="blokada-do" style="opacity:0.8;"></p></div>`;
        document.body.appendChild(el);
        return el;
    }

    function pokazBlokade(b) {
        const el = ekranBlokady();
        el.querySelector('#blokada-tytul').textContent = t('lock.title');
        el.querySelector('#blokada-powod').textContent = b.powod || '';
        el.querySelector('#blokada-instrukcja').textContent = t('lock.paper');
        el.querySelector('#blokada-do').textContent = b.do ? t('lock.until', { czas: new Date(b.do).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('lock.until_revoked');
        el.style.display = 'flex';
        kioskZablokowany = true;
        try { localStorage.setItem(KLUCZ_BLOKADA, JSON.stringify(b)); } catch (e) { /* brak miejsca */ }
        if (typeof resetDoCzekania === 'function') { try { resetDoCzekania(); } catch (e) { /* ekran jeszcze nie gotowy */ } }
    }

    function zdejmijBlokade() {
        const el = document.getElementById('ekran-blokady-kiosku');
        if (el) el.style.display = 'none';
        kioskZablokowany = false;
        try { localStorage.removeItem(KLUCZ_BLOKADA); } catch (e) { /* ignoruj */ }
        if (typeof przywrocFocus === 'function') { try { przywrocFocus(); } catch (e) { /* ignoruj */ } }
    }

    // blokada zapamiętana przed odświeżeniem strony
    try {
        const zap = JSON.parse(localStorage.getItem(KLUCZ_BLOKADA) || 'null');
        if (zap && (!zap.do || new Date(zap.do).getTime() > Date.now())) document.addEventListener('DOMContentLoaded', () => pokazBlokade(zap));
        else if (zap) localStorage.removeItem(KLUCZ_BLOKADA);
    } catch (e) { /* uszkodzony zapis */ }

    // lokalne wygaśnięcie blokady czasowej (także bez sieci)
    setInterval(() => {
        if (!kioskZablokowany) return;
        try {
            const zap = JSON.parse(localStorage.getItem(KLUCZ_BLOKADA) || 'null');
            if (zap && zap.do && new Date(zap.do).getTime() <= Date.now()) zdejmijBlokade();
        } catch (e) { /* ignoruj */ }
    }, 5000);

    // ----------------------------------------------------------- KOMUNIKAT NA EKRANIE --
    function pokazKomunikat(tekst, sekundy) {
        schowajKomunikat();
        barZegara = document.createElement('div');
        barZegara.id = 'baner-komunikatu-kiosku';
        barZegara.style.cssText = 'position:fixed; left:0; right:0; top:0; z-index:4000; background:#f59e0b; color:#111; font-weight:700; font-size:1.3rem; padding:14px 18px; text-align:center; box-shadow:0 4px 18px rgba(0,0,0,0.5);';
        barZegara.textContent = '📢 ' + tekst;
        document.body.appendChild(barZegara);
        barZegara._t = setTimeout(schowajKomunikat, Math.max(5, sekundy || 60) * 1000);
    }
    function schowajKomunikat() {
        if (barZegara) { clearTimeout(barZegara._t); barZegara.remove(); barZegara = null; }
        const stary = document.getElementById('baner-komunikatu-kiosku');
        if (stary) stary.remove();
    }

    // ----------------------------------------------------------- OSTATNI SKAN (test czytnika) --
    function zapamietajSkan() { ostatniSkanMs = Date.now(); try { localStorage.setItem(KLUCZ_OSTATNI_SKAN, String(ostatniSkanMs)); } catch (e) { /* ignoruj */ } }
    if (typeof obslugaZeskanowanegoKodu === 'function') {
        const oryginal = obslugaZeskanowanegoKodu;
        obslugaZeskanowanegoKodu = function (kod) {
            if (kioskZablokowany) return;                  // blokada awaryjna: skany ignorowane
            zapamietajSkan();
            return oryginal.apply(this, arguments);
        };
    }

    // ----------------------------------------------------------- WYKONAWCA POLECEŃ --
    async function testKamery() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return { kamera: false, powod: 'brak API' };
        try {
            const urz = await navigator.mediaDevices.enumerateDevices();
            const kamery = urz.filter(u => u.kind === 'videoinput');
            let zgoda = null;
            try { if (navigator.permissions) zgoda = (await navigator.permissions.query({ name: 'camera' })).state; } catch (e) { /* nie każda przeglądarka */ }
            return { kamera: kamery.length > 0, liczba_kamer: kamery.length, zgoda, barcode_detector: ('BarcodeDetector' in window), https: location.protocol === 'https:' };
        } catch (e) { return { kamera: false, powod: String(e && e.message || e) }; }
    }

    async function pelnaDiagnostyka() {
        const dane = (typeof zbierzDaneDiagnostyczne === 'function') ? await zbierzDaneDiagnostyczne() : {};
        dane.wersja = WERSJA_APLIKACJI;
        dane.kioskZablokowany = kioskZablokowany;
        dane.ekran_okno = `${window.innerWidth}x${window.innerHeight}`;
        dane.pixel_ratio = window.devicePixelRatio || 1;
        dane.localStorage_kluczy = (() => { try { return Object.keys(localStorage).length; } catch (e) { return null; } })();
        dane.pamiec_js_mb = (performance && performance.memory) ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
        try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); dane.magazyn_uzyte_mb = Math.round((e.usage || 0) / 1048576); dane.magazyn_limit_mb = Math.round((e.quota || 0) / 1048576); } } catch (e) { /* ignoruj */ }
        try { if (navigator.getBattery) { const b = await navigator.getBattery(); dane.bateria_proc = Math.round(b.level * 100); dane.bateria_laduje = b.charging; } } catch (e) { /* ignoruj */ }
        try { if ('serviceWorker' in navigator) { const r = await navigator.serviceWorker.getRegistration(); dane.service_worker = r ? (r.active ? 'aktywny' : 'zarejestrowany') : 'brak'; } } catch (e) { /* ignoruj */ }
        dane.kamera = await testKamery();
        return dane;
    }

    async function wykonaj(p) {
        const par = p.parametry || {};
        switch (p.typ) {
            case 'odswiez':
                setTimeout(() => location.reload(), 600);
                return { ok: true, info: 'Odświeżam stronę za chwilę' };
            case 'synchronizuj': {
                const przed = (typeof wczytajKolejkeOffline === 'function') ? wczytajKolejkeOffline().length : null;
                if (typeof probojSynchronizacje === 'function') await probojSynchronizacje();
                const po = (typeof wczytajKolejkeOffline === 'function') ? wczytajKolejkeOffline().length : null;
                return { ok: true, kolejka_przed: przed, kolejka_po: po };
            }
            case 'pobierz_cache': {
                if (typeof odswiezCacheWTle === 'function') await odswiezCacheWTle(true);
                const c = (typeof wczytajCacheOffline === 'function') ? wczytajCacheOffline() : null;
                return { ok: !!c, cache_pobrano: c ? (c.pobrano_lokalnie || c.pobrano || null) : null, plakietek: c && c.plakietki ? c.plakietki.length : null };
            }
            case 'wyczysc_cache': {
                let usunieto = 0;
                try { if (window.caches) { const nazwy = await caches.keys(); for (const n of nazwy) { await caches.delete(n); usunieto++; } } } catch (e) { /* ignoruj */ }
                try { if ('serviceWorker' in navigator) { const rs = await navigator.serviceWorker.getRegistrations(); for (const r of rs) await r.unregister(); } } catch (e) { /* ignoruj */ }
                setTimeout(() => location.reload(), 800);
                return { ok: true, usuniete_cache: usunieto, info: 'Kolejka offline i ustawienia zostają; strona załaduje się od nowa' };
            }
            case 'komunikat':
                pokazKomunikat(String(par.tekst || ''), Number(par.sekundy) || 60);
                return { ok: true };
            case 'schowaj_komunikat':
                schowajKomunikat();
                return { ok: true };
            case 'jezyk':
                if (typeof ustawJezyk === 'function' && ['pl', 'en', 'uk'].includes(par.jezyk)) { ustawJezyk(par.jezyk); return { ok: true, jezyk: par.jezyk }; }
                return { ok: false, powod: 'nieobsługiwany język' };
            case 'diagnostyka':
                return Object.assign({ ok: true }, await pelnaDiagnostyka());
            case 'test_skanera': {
                const sek = ostatniSkanMs ? Math.round((Date.now() - ostatniSkanMs) / 1000) : null;
                return { ok: true, ostatni_skan_sekund_temu: sek, ostatni_skan: ostatniSkanMs ? new Date(ostatniSkanMs).toISOString() : null,
                         uwaga: sek === null ? 'Od uruchomienia nie zeskanowano żadnej plakietki' : '' };
            }
            case 'test_kamery':
                return Object.assign({ ok: true }, await testKamery());
            case 'restart_skanera':
                if (typeof przywrocFocus === 'function') przywrocFocus();
                return { ok: true, info: 'Ustawiono fokus na polu czytnika' };
            case 'wymus_aktualizacje': {
                try { if ('serviceWorker' in navigator) { const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } } catch (e) { /* ignoruj */ }
                setTimeout(() => location.reload(), 800);
                return { ok: true, wersja_przed: WERSJA_APLIKACJI };
            }
            default:
                return { ok: false, powod: 'nieznane polecenie' };
        }
    }

    // ----------------------------------------------------------- PĘTLA PYTAJĄCA SERWER --
    async function pobierz() {
        if (trwaPobieranie || (typeof jestOffline !== 'undefined' && jestOffline) || !navigator.onLine) return;
        trwaPobieranie = true;
        try {
            if (brakSql26) return;   // serwer bez sql/26 — ping obsługuje stary poller z kiosk.js
            const odp = await wywolajRPC('kiosk_polecenia_pobierz', { p_kiosk_id: ID_KIOSKU }, { timeoutMs: 6000 });
            if (!odp || odp.sukces === false) {
                if (odp && (odp.kod_pg === 'PGRST202' || odp.kod_pg === '42883')) { brakSql26 = true; window.__EM_STEROWANIE_AKTYWNE = false; }   // serwer bez sql/26 → stary ping
                return;
            }
            // 1) blokada
            if (odp.blokada) pokazBlokade(odp.blokada); else if (kioskZablokowany) zdejmijBlokade();
            // 2) polecenia
            for (const p of (odp.polecenia || [])) {
                let wynik;
                try { wynik = await wykonaj(p); } catch (e) { wynik = { ok: false, blad: String(e && e.message || e) }; }
                wynik.czas_urzadzenia = new Date().toISOString();
                await wywolajRPC('kiosk_polecenie_wynik', { p_kiosk_id: ID_KIOSKU, p_id: p.id, p_wynik: wynik }, { timeoutMs: 6000 });
            }
            // 3) ping z sql/20 (zlecony przyciskiem „Ping”)
            if ((odp.zadania || []).length && typeof zbierzDaneDiagnostyczne === 'function') {
                const dane = await zbierzDaneDiagnostyczne();
                dane.wersja = WERSJA_APLIKACJI;
                dane.cache_pobrano = dane.offline_cache_pobrano || null;
                for (const id of odp.zadania) await wywolajRPC('kiosk_odpowiedz_ping', { p_kiosk_id: ID_KIOSKU, p_zadanie_id: id, p_dane: dane }, { timeoutMs: 6000 });
                if (typeof wyslijPing === 'function') wyslijPing();
            }
        } catch (e) { /* brak sieci — następny cykl */ }
        finally { trwaPobieranie = false; }
    }
    setInterval(pobierz, 5000);
    setTimeout(pobierz, 1500);
})();
