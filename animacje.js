// ============================================================================
// v2.12.01 — drobne animacje sterowane skryptem (reszta animacji jest w css/style.css)
//   • płynne „liczenie” liczb (punkty, liczniki na kafelkach) — działa też na połówkach (1,5 · 2,5 …),
//   • delikatny efekt fali na przyciskach po kliknięciu.
// Skrypt niczego nie zmienia w danych — tylko wygląd. Przy „ogranicz ruch” (prefers-reduced-motion) jest nieaktywny.
// ============================================================================
(function () {
    'use strict';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const SELEKTOR_LICZB = '.big-counter .liczba, .kpi .wartosc';
    const CZAS_MS = 700;

    function naLiczbe(tekst) {
        const m = String(tekst).trim().match(/^([+\-]?\d+(?:[.,]\d+)?)(.*)$/);
        return m ? { n: parseFloat(m[1].replace(',', '.')), reszta: m[2], dziesietne: /[.,]\d/.test(m[1]) } : null;
    }
    function pokaz(n, dziesietne) {
        const zaokr = dziesietne || Math.round(n * 10) / 10 !== Math.round(n) ? Math.round(n * 10) / 10 : Math.round(n);
        return String(zaokr).replace('.', ',');
    }
    function animujLiczbe(el) {
        if (el._emTrwa) return;
        const cel = naLiczbe(el.textContent);
        if (!cel || isNaN(cel.n)) return;
        const start = (typeof el._emOstatnia === 'number') ? el._emOstatnia : 0;
        el._emOstatnia = cel.n;
        if (start === cel.n) return;
        el._emTrwa = true;
        const t0 = performance.now();
        (function krok(t) {
            const p = Math.min(1, (t - t0) / CZAS_MS), ease = 1 - Math.pow(1 - p, 3);
            const w = start + (cel.n - start) * ease;
            el.textContent = (p < 1 ? pokaz(w, cel.dziesietne) : pokaz(cel.n, cel.dziesietne)) + cel.reszta;
            if (p < 1) requestAnimationFrame(krok); else el._emTrwa = false;
        })(t0);
    }
    const obserwator = new MutationObserver((zmiany) => {
        for (const z of zmiany) {
            const cel = z.target.nodeType === 3 ? z.target.parentElement : z.target;
            if (!cel || !cel.closest) continue;
            const el = cel.matches && cel.matches(SELEKTOR_LICZB) ? cel : cel.closest(SELEKTOR_LICZB);
            if (el && !el._emTrwa) animujLiczbe(el);
            if (z.addedNodes) z.addedNodes.forEach(n => { if (n.querySelectorAll) n.querySelectorAll(SELEKTOR_LICZB).forEach(animujLiczbe); });
        }
    });
    function start() {
        document.querySelectorAll(SELEKTOR_LICZB).forEach(animujLiczbe);
        obserwator.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    // fala po kliknięciu przycisku
    document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.btn');
        if (!b || b.disabled) return;
        const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.6;
        const f = document.createElement('span');
        f.style.cssText = `position:absolute;pointer-events:none;border-radius:50%;background:rgba(255,255,255,.35);width:${d}px;height:${d}px;` +
            `left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;transform:scale(0);opacity:1;transition:transform .5s ease, opacity .6s ease;`;
        b.appendChild(f);
        requestAnimationFrame(() => { f.style.transform = 'scale(1)'; f.style.opacity = '0'; });
        setTimeout(() => f.remove(), 650);
    }, true);
})();


// ============================================================================
// v2.12.04 — WIĘCEJ ANIMACJI (dopisane; poprzedni kod bez zmian)
//   • dryfujące tło, pasek postępu przewijania,
//   • odsłanianie kart i kafelków przy przewijaniu (IntersectionObserver),
//   • konfetti po udanym zapisaniu obecności (komunikat .status-msg.ok),
//   • potrząśnięcie polem przy błędzie, „pop” przy zmianie liczby,
//   • lekki efekt 3D (tilt) kafelków .kpi przy najechaniu myszą.
// Wszystko wyłącza się przy systemowym „ogranicz ruch”.
// ============================================================================
(function () {
    'use strict';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    function gotowe(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }

    gotowe(function () {
        // --- tło + pasek przewijania
        if (!document.getElementById('em-tlo')) {
            const tlo = document.createElement('div'); tlo.id = 'em-tlo'; tlo.setAttribute('aria-hidden', 'true');
            tlo.innerHTML = '<i></i><i></i><i></i>'; document.body.insertBefore(tlo, document.body.firstChild);
        }
        const pasek = document.createElement('div'); pasek.id = 'em-scroll'; pasek.setAttribute('aria-hidden', 'true'); document.body.appendChild(pasek);
        let tick = false;
        window.addEventListener('scroll', function () {
            if (tick) return; tick = true;
            requestAnimationFrame(function () {
                const h = document.documentElement.scrollHeight - window.innerHeight;
                pasek.style.transform = 'scaleX(' + (h > 0 ? Math.min(1, window.scrollY / h) : 0) + ')'; tick = false;
            });
        }, { passive: true });

        // --- odsłanianie przy przewijaniu (tylko elementy poza pierwszym ekranem)
        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(function (wpisy) {
                wpisy.forEach(function (w) {
                    if (w.isIntersecting) { w.target.classList.remove('em-ukryte'); w.target.classList.add('em-widoczne'); io.unobserve(w.target); }
                });
            }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
            const rejestruj = function (el) {
                if (el._emRej || el.closest('.hidden')) return;
                el._emRej = true;
                if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;   // widoczne od razu — bez opóźnienia
                el.classList.add('em-ukryte'); io.observe(el);
            };
            document.querySelectorAll('.card, .kpi').forEach(rejestruj);
            new MutationObserver(function (m) {
                m.forEach(function (z) { z.addedNodes.forEach(function (n) {
                    if (n.nodeType !== 1) return;
                    if (n.matches && n.matches('.card, .kpi')) rejestruj(n);
                    if (n.querySelectorAll) n.querySelectorAll('.card, .kpi').forEach(rejestruj);
                }); });
            }).observe(document.body, { childList: true, subtree: true });
        }

        // --- konfetti po sukcesie
        const kolory = ['#7c5cff', '#ff6fb3', '#38e6c5', '#ffb84f', '#3ddc9a'];
        function konfetti(x, y) {
            const n = window.innerWidth < 500 ? 22 : 36;
            for (let i = 0; i < n; i++) {
                const c = document.createElement('span'); c.className = 'em-konfetti';
                const kat = Math.random() * Math.PI * 2, sila = 90 + Math.random() * 190;
                c.style.left = x + 'px'; c.style.top = y + 'px'; c.style.background = kolory[i % kolory.length];
                c.style.setProperty('--dx', Math.cos(kat) * sila + 'px');
                c.style.setProperty('--dy', (Math.sin(kat) * sila + 120) + 'px');
                c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
                c.style.setProperty('--czas', (1 + Math.random() * 0.9) + 's');
                document.body.appendChild(c); setTimeout(function () { c.remove(); }, 2100);
            }
        }
        const okObs = new MutationObserver(function (m) {
            m.forEach(function (z) {
                const el = z.target.nodeType === 1 ? z.target : z.target.parentElement;
                if (!el || !el.classList || !el.classList.contains('status-msg') || !el.classList.contains('ok')) return;
                if (el._emKonf && Date.now() - el._emKonf < 2500) return;
                el._emKonf = Date.now();
                const r = el.getBoundingClientRect();
                if (r.width) konfetti(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
            });
        });
        okObs.observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true, characterData: true });

        // --- błąd w polu: potrząśnięcie
        document.addEventListener('invalid', function (e) {
            const el = e.target; el.classList.remove('em-trzes'); void el.offsetWidth; el.classList.add('em-trzes');
        }, true);

        // --- „pop” liczby po zmianie (kafelki statystyk i liczniki)
        const popObs = new MutationObserver(function (m) {
            m.forEach(function (z) {
                const el = z.target.nodeType === 3 ? z.target.parentElement : z.target;
                if (!el || !el.matches || !el.matches('.licznik-znaczek, .kpi .wartosc, .big-counter .liczba')) return;
                el.classList.remove('em-zmiana'); void el.offsetWidth; el.classList.add('em-zmiana');
            });
        });
        popObs.observe(document.body, { childList: true, subtree: true, characterData: true });

        // --- tilt 3D kafelków (tylko mysz)
        if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            document.addEventListener('mousemove', function (e) {
                const k = e.target.closest && e.target.closest('.kpi');
                document.querySelectorAll('.kpi.em-tilt').forEach(function (x) { if (x !== k) { x.classList.remove('em-tilt'); x.style.transform = ''; } });
                if (!k) return;
                const r = k.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
                k.classList.add('em-tilt');
                k.style.transform = 'perspective(600px) rotateY(' + (px * 10) + 'deg) rotateX(' + (-py * 10) + 'deg) translateY(-4px) scale(1.03)';
            }, { passive: true });
        }
    });
})();


// ============================================================================
// v2.12.05 — ULEPSZENIA ANIMACJI (dopisane; poprzedni kod bez zmian)
//   • tło lekko podąża za wskaźnikiem / przechyleniem telefonu (--mx, --my),
//   • przyciski, które się blokują na czas pracy, dostają kręcący się znacznik (klasa .em-pracuje),
//   • pierścień rozchodzący się razem z konfetti po udanym zapisie obecności,
//   • płynne znikanie komunikatu błędu odczytu.
// ============================================================================
(function () {
    'use strict';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const doc = document.documentElement;

    // tło podąża za wskaźnikiem (mysz) — wartości -0.5…0.5, odświeżane maks. raz na klatkę
    let tick = false, mx = 0, my = 0;
    function ustaw() { tick = false; doc.style.setProperty('--mx', mx.toFixed(3)); doc.style.setProperty('--my', my.toFixed(3)); }
    window.addEventListener('pointermove', (e) => {
        mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5;
        if (!tick) { tick = true; requestAnimationFrame(ustaw); }
    }, { passive: true });
    // telefon: przechylenie urządzenia (jeśli przeglądarka udostępnia czujnik bez pytania o zgodę)
    window.addEventListener('deviceorientation', (e) => {
        if (e.gamma == null || e.beta == null) return;
        mx = Math.max(-0.5, Math.min(0.5, e.gamma / 90)); my = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 180));
        if (!tick) { tick = true; requestAnimationFrame(ustaw); }
    }, { passive: true });

    function start() {
        // przyciski „w trakcie pracy”
        new MutationObserver((zmiany) => {
            zmiany.forEach((z) => {
                const b = z.target;
                if (!b.classList || !b.classList.contains('btn')) return;
                if (b.disabled) b.classList.add('em-pracuje'); else b.classList.remove('em-pracuje');
            });
        }).observe(document.body, { attributes: true, attributeFilter: ['disabled'], subtree: true });

        // pierścień przy pierwszej cząstce konfetti
        let ostatniPierscien = 0;
        new MutationObserver((zmiany) => {
            zmiany.forEach((z) => z.addedNodes.forEach((n) => {
                if (n.nodeType !== 1 || !n.classList.contains('em-konfetti') || Date.now() - ostatniPierscien < 400) return;
                ostatniPierscien = Date.now();
                const p = document.createElement('span'); p.className = 'em-pierscien';
                p.style.left = n.style.left; p.style.top = n.style.top; document.body.appendChild(p);
                setTimeout(() => p.remove(), 950);
            }));
        }).observe(document.body, { childList: true });

        // komunikat błędu odczytu (tworzony dynamicznie): po ~6 s znika płynnie (nie zmienia istniejącej logiki ukrywania)
        function podepnijToast(toast) {
            if (!toast || toast._emObs) return;
            toast._emObs = new MutationObserver(() => {
                if (toast.style.display === 'block') { clearTimeout(toast._emT); toast.classList.remove('toast-znika'); toast._emT = setTimeout(() => toast.classList.add('toast-znika'), 5600); }
            });
            toast._emObs.observe(toast, { attributes: true, attributeFilter: ['style'] });
        }
        podepnijToast(document.getElementById('toast-blad-odczytu'));
        new MutationObserver(() => podepnijToast(document.getElementById('toast-blad-odczytu'))).observe(document.body, { childList: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
