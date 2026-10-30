// ============================================================================
// v2.9 — SKANER QR Z KAMERY (Kiosk): zapasowy sposób, gdy nie ma czytnika USB.
// Przycisk „📷 Skanuj kamerą” włącza kamerę tabletu / telefonu / komputera; odczytany kod plakietki
// trafia do tej samej funkcji co skan z czytnika (obslugaZeskanowanegoKodu) — dane uzupełniają się same.
// Dekodowanie: wbudowane BarcodeDetector (Chrome, Edge, Android), a gdy go brak — biblioteka jsQR
// doczytywana z CDN przy pierwszym użyciu (wymaga internetu tylko wtedy).
// Uwaga: kamera działa wyłącznie na HTTPS (lub localhost).
//
// v2.15.07 — ZMIANA KAMERY (przód / tył): przycisk „🔄 Zmień kamerę” w oknie skanera.
//   • Telefon / tablet: przełącza kierunek kamery (facingMode: tylna ↔ przednia).
//   • Komputer lub urządzenie bez facingMode: przechodzi do następnej kamery z listy urządzeń.
//   • Wybór jest zapamiętany na urządzeniu (przy kolejnym skanowaniu startuje ta sama kamera).
//   • Wiele urządzeń nie pozwala otworzyć dwóch kamer naraz — dlatego stary strumień jest zamykany PRZED
//     otwarciem nowego, a gdy zmiana się nie uda, wraca poprzednia kamera.
//   • Podgląd z przedniej kamery jest odbity lustrzanie (jak w aparacie); odczyt kodu QR nie zależy od lustra.
// ============================================================================
(function () {
    const KLUCZ_TRYBU = 'em_kamera_tryb';          // 'environment' (tylna) | 'user' (przednia)
    let strumien = null, petla = null, detektor = null, jsQrGotowy = false, trwa = false;
    let tryb = wczytajTryb();                      // aktualnie używany kierunek kamery
    let idKamery = null;                           // deviceId aktualnej kamery (do przełączania po liście urządzeń)
    let przelaczanie = false;                      // trwa zmiana kamery — pętla odczytu czeka
    let wideo = null, status = null, przyciskZmiany = null, etykietaKamery = null;
    let opisKamery = '';                           // co pokazać w oknie: „tylna” / „przednia” albo nazwa kamery komputera
    const oknoOtwarte = () => !!document.getElementById('skaner-kamery-okno');

    function wczytajTryb() {
        try { return localStorage.getItem(KLUCZ_TRYBU) === 'user' ? 'user' : 'environment'; } catch (e) { return 'environment'; }
    }
    function zapamietajTryb() {
        try { localStorage.setItem(KLUCZ_TRYBU, tryb); } catch (e) { /* brak dostępu do pamięci — trudno */ }
    }

    function zaladujJsQr() {
        if (window.jsQR) return Promise.resolve();
        return new Promise((ok, err) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
            s.onload = () => (window.jsQR ? ok() : err(new Error('jsQR')));
            s.onerror = () => err(new Error('jsQR'));
            document.head.appendChild(s);
        });
    }

    function zatrzymaj() {
        trwa = false;
        przelaczanie = false;
        if (petla) { cancelAnimationFrame(petla); petla = null; }
        if (strumien) { strumien.getTracks().forEach(tr => tr.stop()); strumien = null; }
        const o = document.getElementById('skaner-kamery-okno');
        if (o) o.remove();
        wideo = null; status = null; przyciskZmiany = null; etykietaKamery = null;
    }

    // Lista kamer urządzenia (etykiety i identyfikatory są dostępne dopiero po zgodzie na kamerę).
    async function listaKamer() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return null;
            const urz = await navigator.mediaDevices.enumerateDevices();
            return urz.filter(u => u.kind === 'videoinput');
        } catch (e) { return null; }
    }

    // Zapamiętuje, którą kamerę faktycznie dostaliśmy, i dopasowuje podgląd (lustro dla przedniej).
    function ustalKamere(nowyStrumien, zalozonyTryb) {
        let ust = {};
        try { ust = nowyStrumien.getVideoTracks()[0].getSettings() || {}; } catch (e) { ust = {}; }
        idKamery = ust.deviceId || null;
        let nazwa = '';
        if (ust.facingMode === 'user' || ust.facingMode === 'environment') { tryb = ust.facingMode; nazwa = t(tryb === 'user' ? 'cam.front' : 'cam.back'); }
        else {                                      // komputer: przeglądarka nie podaje kierunku — wierzymy założeniu, a pokazujemy nazwę kamery
            tryb = zalozonyTryb;
            let et = ''; try { et = nowyStrumien.getVideoTracks()[0].label || ''; } catch (e) { et = ''; }
            nazwa = et ? et.slice(0, 40) : t(tryb === 'user' ? 'cam.front' : 'cam.back');
        }
        opisKamery = nazwa;
        zapamietajTryb();
        odswiezWidokKamery();
    }

    function odswiezWidokKamery() {
        if (wideo) wideo.style.transform = tryb === 'user' ? 'scaleX(-1)' : '';
        if (etykietaKamery) etykietaKamery.textContent = '📷 ' + (opisKamery || t(tryb === 'user' ? 'cam.front' : 'cam.back'));
    }

    // Start: preferowana kamera (z zapamiętanego wyboru), a gdy jej nie ma — dowolna dostępna.
    async function otworzStrumienStart() {
        const proby = [
            { video: { facingMode: { ideal: tryb } }, audio: false },
            { video: true, audio: false }
        ];
        let ostatni = null;
        for (const c of proby) {
            try { return await navigator.mediaDevices.getUserMedia(c); }
            catch (e) { ostatni = e; if (e && e.name === 'NotAllowedError') throw e; }
        }
        throw ostatni;
    }

    function zatrzymajStrumien() {
        if (strumien) { strumien.getTracks().forEach(tr => tr.stop()); strumien = null; }
    }

    async function podepnijStrumien(nowy) {
        strumien = nowy;
        wideo.srcObject = nowy;
        try { await wideo.play(); } catch (e) { /* autoplay zablokowany — wideo i tak się pokaże po interakcji */ }
    }

    // v2.15.07 — zmiana kamery przód ↔ tył (lub następna kamera z listy).
    async function przelacz() {
        if (przelaczanie || !trwa || !wideo) return;
        przelaczanie = true;
        if (przyciskZmiany) przyciskZmiany.disabled = true;
        status.textContent = t('cam.switching');

        const poprzedniTryb = tryb, poprzedniId = idKamery;
        const kamery = await listaKamer();
        const nowyTryb = tryb === 'environment' ? 'user' : 'environment';

        zatrzymajStrumien();                       // wiele urządzeń nie otworzy dwóch kamer naraz
        await new Promise(r => setTimeout(r, 150));

        let nowy = null;
        // 1) zmiana kierunku kamery (telefon / tablet)
        try { nowy = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nowyTryb } }, audio: false }); }
        catch (e) { nowy = null; }
        // 2) bez facingMode (np. komputer): następna kamera z listy urządzeń
        if (!nowy && kamery && kamery.length > 1) {
            const i = kamery.findIndex(k => k.deviceId && k.deviceId === poprzedniId);
            const nastepna = kamery[(i + 1) % kamery.length];
            try { nowy = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: nastepna.deviceId } }, audio: false }); }
            catch (e) { nowy = null; }
        }

        if (!oknoOtwarte()) {                       // okno zamknięto w trakcie zmiany
            if (nowy) nowy.getTracks().forEach(tr => tr.stop());
            przelaczanie = false;
            return;
        }

        if (nowy) {
            await podepnijStrumien(nowy);
            if (!oknoOtwarte()) { zatrzymajStrumien(); przelaczanie = false; return; }
            ustalKamere(nowy, nowyTryb);
            status.textContent = t('cam.aim');
        } else {
            // zmiana się nie udała — przywracamy poprzednią kamerę, żeby skaner dalej działał
            tryb = poprzedniTryb;
            try {
                const wrocil = await navigator.mediaDevices.getUserMedia(poprzedniId
                    ? { video: { deviceId: { exact: poprzedniId } }, audio: false }
                    : { video: { facingMode: { ideal: poprzedniTryb } }, audio: false });
                await podepnijStrumien(wrocil);
                if (!oknoOtwarte()) { zatrzymajStrumien(); przelaczanie = false; return; }
                ustalKamere(wrocil, poprzedniTryb);
                status.textContent = '⚠️ ' + t((kamery && kamery.length > 1) || !kamery ? 'cam.switch_failed' : 'cam.only_one');
            } catch (e) {
                if (status) status.textContent = '❌ ' + t('cam.switch_failed');
            }
        }
        if (przyciskZmiany) przyciskZmiany.disabled = false;
        przelaczanie = false;
    }

    async function uruchom() {
        if (document.getElementById('skaner-kamery-okno')) return;
        const okno = document.createElement('div');
        okno.id = 'skaner-kamery-okno';
        okno.style.cssText = 'position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,0.88); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; gap:12px;';
        okno.innerHTML = `
            <div style="color:#fff; font-weight:700; font-size:1.1rem;">📷 ${esc(t('cam.title'))}</div>
            <video id="skaner-kamery-wideo" playsinline muted style="width:min(92vw,520px); max-height:60vh; border-radius:16px; background:#000; object-fit:cover;"></video>
            <div id="skaner-kamery-rodzaj" style="color:#9ecbff; font-size:0.9rem; min-height:1.2em;"></div>
            <div id="skaner-kamery-status" style="color:#ddd; text-align:center; min-height:1.4em;">${esc(t('cam.starting'))}</div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center;">
                <button class="btn btn-secondary" id="skaner-kamery-przelacz" style="width:auto;">🔄 ${esc(t('cam.switch'))}</button>
                <button class="btn btn-secondary" id="skaner-kamery-zamknij" style="width:auto;">${esc(t('common.close'))} ✕</button>
            </div>`;
        document.body.appendChild(okno);
        document.getElementById('skaner-kamery-zamknij').addEventListener('click', zatrzymaj);
        status = document.getElementById('skaner-kamery-status');
        wideo = document.getElementById('skaner-kamery-wideo');
        przyciskZmiany = document.getElementById('skaner-kamery-przelacz');
        etykietaKamery = document.getElementById('skaner-kamery-rodzaj');
        przyciskZmiany.addEventListener('click', przelacz);
        przyciskZmiany.disabled = true;            // aktywny dopiero, gdy kamera ruszy

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = '❌ ' + t('cam.unsupported'); przyciskZmiany.hidden = true; return;
        }
        try {
            const pierwszy = await otworzStrumienStart();
            if (!oknoOtwarte()) { pierwszy.getTracks().forEach(tr => tr.stop()); return; }
            strumien = pierwszy;
        } catch (e) {
            status.textContent = '❌ ' + t('cam.denied'); przyciskZmiany.hidden = true; return;
        }
        wideo.srcObject = strumien;
        try { await wideo.play(); } catch (e) { /* autoplay zablokowany — wideo i tak się pokaże po interakcji */ }
        if (!oknoOtwarte()) return;
        ustalKamere(strumien, tryb);

        // jedna kamera w urządzeniu → przycisk zmiany nie ma sensu (gdy lista niedostępna, zostaje widoczny)
        const kamery = await listaKamer();
        if (!oknoOtwarte()) return;
        if (przyciskZmiany && kamery && kamery.length === 1) przyciskZmiany.hidden = true;

        let uzyjBarcodeDetector = false;
        if ('BarcodeDetector' in window) {
            try { detektor = new BarcodeDetector({ formats: ['qr_code'] }); uzyjBarcodeDetector = true; } catch (e) { detektor = null; }
        }
        if (!uzyjBarcodeDetector) {
            try { await zaladujJsQr(); jsQrGotowy = true; }
            catch (e) { if (status) status.textContent = '❌ ' + t('cam.no_decoder'); return; }
        }
        if (!oknoOtwarte()) return;
        status.textContent = t('cam.aim');
        if (przyciskZmiany) przyciskZmiany.disabled = false;
        trwa = true;
        const plotno = document.createElement('canvas');
        const ctx = plotno.getContext('2d', { willReadFrequently: true });

        const krok = async () => {
            if (!trwa) return;
            let kod = null;
            try {
                if (!przelaczanie && wideo && wideo.readyState >= 2 && wideo.videoWidth > 0) {
                    if (uzyjBarcodeDetector) {
                        const wyniki = await detektor.detect(wideo);
                        if (wyniki && wyniki.length) kod = wyniki[0].rawValue;
                    } else if (jsQrGotowy) {
                        const skala = Math.min(1, 640 / wideo.videoWidth);
                        plotno.width = Math.round(wideo.videoWidth * skala);
                        plotno.height = Math.round(wideo.videoHeight * skala);
                        ctx.drawImage(wideo, 0, 0, plotno.width, plotno.height);
                        const obraz = ctx.getImageData(0, 0, plotno.width, plotno.height);
                        const w = window.jsQR(obraz.data, obraz.width, obraz.height, { inversionAttempts: 'dontInvert' });
                        if (w && w.data) kod = w.data;
                    }
                }
            } catch (e) { /* pojedyncza klatka — próbujemy dalej */ }
            if (kod && String(kod).trim()) {
                const wynik = String(kod).trim();
                zatrzymaj();
                if (navigator.vibrate) navigator.vibrate(60);
                obslugaZeskanowanegoKodu(wynik);       // dokładnie ta sama ścieżka co czytnik USB
                return;
            }
            petla = requestAnimationFrame(() => setTimeout(krok, 120));
        };
        krok();
    }

    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('#btn-skaner-kamery');
        if (b) uruchom();
    });
})();
