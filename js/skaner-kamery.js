// ============================================================================
// v2.9 — SKANER QR Z KAMERY (Kiosk): zapasowy sposób, gdy nie ma czytnika USB.
// Przycisk „📷 Skanuj kamerą” włącza kamerę tabletu / telefonu / komputera; odczytany kod plakietki
// trafia do tej samej funkcji co skan z czytnika (obslugaZeskanowanegoKodu) — dane uzupełniają się same.
// Dekodowanie: wbudowane BarcodeDetector (Chrome, Edge, Android), a gdy go brak — biblioteka jsQR
// doczytywana z CDN przy pierwszym użyciu (wymaga internetu tylko wtedy).
// Uwaga: kamera działa wyłącznie na HTTPS (lub localhost).
// ============================================================================
(function () {
    let strumien = null, petla = null, detektor = null, jsQrGotowy = false, trwa = false;

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
        if (petla) { cancelAnimationFrame(petla); petla = null; }
        if (strumien) { strumien.getTracks().forEach(tr => tr.stop()); strumien = null; }
        const o = document.getElementById('skaner-kamery-okno');
        if (o) o.remove();
    }

    async function uruchom() {
        if (document.getElementById('skaner-kamery-okno')) return;
        const okno = document.createElement('div');
        okno.id = 'skaner-kamery-okno';
        okno.style.cssText = 'position:fixed; inset:0; z-index:2000; background:rgba(0,0,0,0.88); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; gap:12px;';
        okno.innerHTML = `
            <div style="color:#fff; font-weight:700; font-size:1.1rem;">📷 ${esc(t('cam.title'))}</div>
            <video id="skaner-kamery-wideo" playsinline muted style="width:min(92vw,520px); max-height:60vh; border-radius:16px; background:#000; object-fit:cover;"></video>
            <div id="skaner-kamery-status" style="color:#ddd; text-align:center; min-height:1.4em;">${esc(t('cam.starting'))}</div>
            <button class="btn btn-secondary" id="skaner-kamery-zamknij" style="width:auto;">${esc(t('common.close'))} ✕</button>`;
        document.body.appendChild(okno);
        document.getElementById('skaner-kamery-zamknij').addEventListener('click', zatrzymaj);
        const status = document.getElementById('skaner-kamery-status');
        const wideo = document.getElementById('skaner-kamery-wideo');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            status.textContent = '❌ ' + t('cam.unsupported'); return;
        }
        try {
            strumien = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        } catch (e) {
            status.textContent = '❌ ' + t('cam.denied'); return;
        }
        wideo.srcObject = strumien;
        try { await wideo.play(); } catch (e) { /* autoplay zablokowany — wideo i tak się pokaże po interakcji */ }

        let uzyjBarcodeDetector = false;
        if ('BarcodeDetector' in window) {
            try { detektor = new BarcodeDetector({ formats: ['qr_code'] }); uzyjBarcodeDetector = true; } catch (e) { detektor = null; }
        }
        if (!uzyjBarcodeDetector) {
            try { await zaladujJsQr(); jsQrGotowy = true; }
            catch (e) { status.textContent = '❌ ' + t('cam.no_decoder'); return; }
        }
        status.textContent = t('cam.aim');
        trwa = true;
        const plotno = document.createElement('canvas');
        const ctx = plotno.getContext('2d', { willReadFrequently: true });

        const krok = async () => {
            if (!trwa) return;
            let kod = null;
            try {
                if (wideo.readyState >= 2 && wideo.videoWidth > 0) {
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
