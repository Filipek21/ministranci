// ============================================================================
// kontakt.js — v2.15 — „Skontaktuj się z Administratorem”
// Ładowany w Panelu (app.html) i w Kiosku (kiosk.html). Serwer: sql/34_kontakt_z_administratorem.sql.
//  • Panel (ministrant / ksiądz / admin): wiadomość NIE jest anonimowa — autoryzacja kodem i PIN-em z bieżącej sesji.
//  • Kiosk: wiadomość anonimowa (domyślnie) albo podpisana kodem i PIN-em osoby.
//  • Opcjonalny zrzut ekranu tego, co jest teraz wyświetlane (robiony lokalnie w przeglądarce, bez zewnętrznych bibliotek;
//    pola z hasłami / PIN-ami są maskowane; zrzut widzi wyłącznie Admin).
// v2.15.03: • w Panelu ADMINA przycisk jest ukryty (Admin nie pisze sam do siebie — w to miejsce dojdzie inna funkcja),
//           • na EKRANIE LOGOWANIA (app.html, przed zalogowaniem) przycisk jest widoczny: osoba, która nie może się zalogować,
//             może wysłać wiadomość (bez zrzutu ekranu; nadawca niezweryfikowany; opcjonalny podpis i dane do kontaktu).
//             Serwer: sql/36_zbiorki_edycja_audyt_kontakt_v2_15_03.sql → kontakt_wyslij_logowanie.
// ============================================================================
(function () {
    'use strict';
    const JEST_KIOSK = typeof ID_KIOSKU !== 'undefined';
    const MAKS_ZNAKOW = 4000;
    const MAKS_ZRZUT = 800000;        // znaków data-URL (serwer przyjmuje do 900000)
    const ZRZUT_SZER = 1000;          // maks. szerokość zrzutu w pikselach

    // v2.15.03: tryb „logowanie” — Panel (app.html), nikt nie jest zalogowany, a widoczny jest ekran logowania
    function jestLogowanie() {
        if (JEST_KIOSK) return false;
        try {
            if (typeof sesja !== 'undefined' && sesja) return false;
            const l = document.getElementById('widok-login');
            return !!l && !l.classList.contains('hidden');
        } catch (e) { return false; }
    }
    function jestAdminem() { try { return typeof sesja !== 'undefined' && !!sesja && !!sesja.is_admin; } catch (e) { return false; } }

    const tt = (k, p) => (typeof t === 'function' ? t(k, p) : k);
    const el = (id) => document.getElementById(id);
    const escH = (typeof esc === 'function') ? esc : (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ------------------------------------------------------------------ ZRZUT EKRANU (DOM → SVG foreignObject → JPEG) ----
    const POMIJANE = ['script', 'style', 'link', 'meta', 'noscript', 'iframe', 'video', 'audio', 'object', 'embed', 'template', 'head', 'title'];
    // pomijane całkowicie: przycisk i okno kontaktu; CENZUROWANE (szary prostokąt o tym samym rozmiarze): elementy z data-zrzut-ukryj (dane osobowe)
    function pomijane(n) { return n.nodeType === 1 && (n.id === 'btn-kontakt' || n.id === 'kontakt-okno'); }
    function cenzurowane(n) { return n.nodeType === 1 && n.hasAttribute('data-zrzut-ukryj'); }
    const zamaskuj = (v) => (v ? '•'.repeat(Math.min(String(v).length, 8)) : '');   // v2.15.02: treść pól formularzy nie opuszcza urządzenia

    function kopiujStyle(zrodlo, cel, cs) {
        for (let i = 0; i < cs.length; i++) { const p = cs[i]; cel.style.setProperty(p, cs.getPropertyValue(p)); }
        cel.style.setProperty('animation', 'none'); cel.style.setProperty('transition', 'none');
        const bg = cs.getPropertyValue('background-image');
        if (bg && bg !== 'none' && !/gradient|^url\(["']?data:/.test(bg)) cel.style.setProperty('background-image', 'none');   // zewnętrzne obrazy i tak nie załadują się w SVG
    }

    function klonujWezel(o, W, H, sx, sy) {
        if (o.nodeType === 3) return o.cloneNode(false);
        if (o.nodeType !== 1) return null;
        const tag = o.tagName.toLowerCase();
        if (POMIJANE.includes(tag) || pomijane(o)) return null;
        const cs = getComputedStyle(o);
        if (cs.display === 'none') return null;
        const r = o.getBoundingClientRect();
        if (cenzurowane(o)) {   // v2.15.02: ten sam rozmiar i miejsce, bez treści (np. imię i kod na ekranie PIN Kiosku — anonimowa wiadomość nie może zdradzać autora)
            const c = document.createElement('div');
            ['display', 'position', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'flex-grow', 'flex-shrink', 'flex-basis'].forEach(pr => c.style.setProperty(pr, cs.getPropertyValue(pr)));
            if (cs.position === 'fixed') { c.style.setProperty('position', 'absolute'); c.style.setProperty('left', (r.left + sx) + 'px'); c.style.setProperty('top', (r.top + sy) + 'px'); }
            c.style.setProperty('width', r.width + 'px'); c.style.setProperty('height', r.height + 'px'); c.style.setProperty('box-sizing', 'border-box');
            c.style.setProperty('background', 'repeating-linear-gradient(45deg,#555,#555 6px,#666 6px,#666 12px)'); c.style.setProperty('border-radius', '6px');
            return c;
        }
        const poza = tag !== 'body' && tag !== 'html' && (r.width > 0 || r.height > 0) && cs.position !== 'fixed' && (r.bottom < 0 || r.top > H || r.right < 0 || r.left > W);
        const k = o.cloneNode(false);
        // atrybuty zdarzeń i identyfikatory nie są potrzebne w obrazie
        Array.from(k.attributes).forEach(a => { if (/^on/i.test(a.name)) k.removeAttribute(a.name); });
        if (poza) {   // v2.15.01: poza ekranem wystarczy sam rozmiar (pełne kopiowanie ~350 właściwości × tysiące elementów zawieszało stronę)
            ['display', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'flex-grow', 'flex-shrink', 'flex-basis', 'float', 'vertical-align'].forEach(pr => k.style.setProperty(pr, cs.getPropertyValue(pr)));
            k.style.setProperty('width', r.width + 'px'); k.style.setProperty('height', r.height + 'px'); k.style.setProperty('box-sizing', 'border-box'); k.style.setProperty('overflow', 'hidden');
            return k;
        }
        kopiujStyle(o, k, cs);
        if (cs.position === 'fixed') {   // element „przyklejony” do ekranu — ustawiamy go w układzie dokumentu
            k.style.setProperty('position', 'absolute'); k.style.setProperty('left', (r.left + sx) + 'px'); k.style.setProperty('top', (r.top + sy) + 'px');
            k.style.setProperty('width', r.width + 'px'); k.style.setProperty('height', r.height + 'px'); k.style.setProperty('margin', '0'); k.style.setProperty('right', 'auto'); k.style.setProperty('bottom', 'auto');
        }
        if (tag === 'canvas') {
            try { const im = document.createElement('img'); im.setAttribute('src', o.toDataURL('image/png')); kopiujStyle(o, im, cs); return im; } catch (e) { return k; }
        }
        if (tag === 'img') {
            try {
                if (o.complete && o.naturalWidth > 0) { const c = document.createElement('canvas'); c.width = o.naturalWidth; c.height = o.naturalHeight; c.getContext('2d').drawImage(o, 0, 0); k.setAttribute('src', c.toDataURL('image/png')); }
                else k.removeAttribute('src');
            } catch (e) { k.removeAttribute('src'); }
            k.removeAttribute('srcset');
            return k;
        }
        if (tag === 'input') {
            const typ = (o.type || '').toLowerCase();
            if (typ === 'checkbox' || typ === 'radio') { if (o.checked) k.setAttribute('checked', 'checked'); else k.removeAttribute('checked'); }
            else k.setAttribute('value', zamaskuj(o.value));   // hasła, PIN-y, kody i wpisany tekst są maskowane
            return k;
        }
        if (tag === 'textarea') { k.textContent = zamaskuj(o.value); return k; }
        if (tag === 'select') {
            Array.from(o.options).forEach(op => { const opk = document.createElement('option'); opk.textContent = op.textContent; if (op.selected) opk.setAttribute('selected', 'selected'); k.appendChild(opk); });
            return k;
        }
        o.childNodes.forEach(c => { const kk = klonujWezel(c, W, H, sx, sy); if (kk) k.appendChild(kk); });
        return k;
    }

    function wczytajObraz(src) {
        return new Promise((ok, err) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => err(new Error('obraz')); im.src = src; });
    }

    async function zrobZrzut() {
        const W = window.innerWidth, H = window.innerHeight, sx = window.scrollX, sy = window.scrollY;
        const body = klonujWezel(document.body, W, H, sx, sy);
        if (!body) throw new Error('pusty ekran');
        const kolor = getComputedStyle(document.body).backgroundColor;
        const tlo = (kolor && kolor !== 'rgba(0, 0, 0, 0)') ? kolor : getComputedStyle(document.documentElement).backgroundColor;
        const wrap = document.createElement('div');
        wrap.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        wrap.style.cssText = `width:${W}px;height:${H}px;overflow:hidden;position:relative;background:${tlo && tlo !== 'rgba(0, 0, 0, 0)' ? tlo : '#0b1020'};`;
        const przesun = document.createElement('div');
        przesun.style.cssText = `position:absolute;left:${-sx}px;top:${-sy}px;width:${document.documentElement.scrollWidth}px;`;
        przesun.appendChild(body); wrap.appendChild(przesun);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${new XMLSerializer().serializeToString(wrap)}</foreignObject></svg>`;
        const obraz = await wczytajObraz('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
        let skala = Math.min(1, ZRZUT_SZER / W), jakosc = 0.7, wynik = '';
        for (let proba = 0; proba < 5; proba++) {
            const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * skala)); c.height = Math.max(1, Math.round(H * skala));
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(obraz, 0, 0, c.width, c.height);
            wynik = c.toDataURL('image/jpeg', jakosc);            // rzuca wyjątek, gdyby przeglądarka „zabrudziła” canvas
            if (wynik.length <= MAKS_ZRZUT) return wynik;
            skala *= 0.8; jakosc = Math.max(0.4, jakosc - 0.1);
        }
        throw new Error('zrzut za duży');
    }

    // ------------------------------------------------------------------ KONTEKST ----
    function kontekst() {
        let widok = '', zakladka = '';
        try {
            const w = Array.from(document.querySelectorAll('[id^="widok-"]')).find(x => !x.classList.contains('hidden'));
            widok = w ? w.id : (JEST_KIOSK ? 'kiosk' : '');
            if (typeof aktywnaZakladka !== 'undefined' && aktywnaZakladka) zakladka = aktywnaZakladka;
        } catch (e) { /* ignoruj */ }
        return {
            widok, zakladka, wersja: (typeof WERSJA_APLIKACJI !== 'undefined' ? WERSJA_APLIKACJI : ''),
            jezyk: (typeof jezykBiezacy !== 'undefined' ? jezykBiezacy : (document.documentElement.lang || '')),
            ekran: `${window.innerWidth}x${window.innerHeight}`, online: navigator.onLine, przegladarka: navigator.userAgent
        };
    }

    // ------------------------------------------------------------------ INTERFEJS ----
    let zrzutDane = null, wysylanie = false;

    function zbudujInterfejs() {
        if (el('btn-kontakt')) return;
        const b = document.createElement('button');
        b.id = 'btn-kontakt'; b.type = 'button'; b.className = 'btn-kontakt'; b.setAttribute('data-zrzut-ukryj', '1');
        b.addEventListener('click', otworz);
        document.body.appendChild(b);
        const o = document.createElement('div');
        o.id = 'kontakt-okno'; o.className = 'kontakt-tlo hidden'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true');
        o.innerHTML = `<div class="kontakt-okno">
            <h3 id="kt-tytul"></h3>
            <p id="kt-opis" class="kt-dim"></p>
            <label class="kt-etykieta" for="kt-kategoria" id="kt-l-kat"></label>
            <select id="kt-kategoria"><option value="inne"></option><option value="usterka"></option><option value="pytanie"></option><option value="pomysl"></option><option value="pilne"></option></select>
            <label class="kt-etykieta" for="kt-tresc" id="kt-l-tresc"></label>
            <textarea id="kt-tresc" rows="5" maxlength="${MAKS_ZNAKOW}"></textarea>
            <div class="kt-dim" id="kt-licznik"></div>
            <div id="kt-kiosk-blok" class="hidden">
                <label class="kt-wiersz"><input type="checkbox" id="kt-anonim" checked> <span id="kt-l-anonim"></span></label>
                <div id="kt-podpis" class="hidden">
                    <input type="text" id="kt-kod" autocomplete="off" autocapitalize="characters">
                    <input type="password" id="kt-pin" inputmode="numeric" autocomplete="off">
                </div>
            </div>
            <div id="kt-nieanonim" class="kt-dim hidden"></div>
            <div id="kt-login-blok" class="hidden">
                <input type="text" id="kt-login-podpis" maxlength="80" autocomplete="name">
                <input type="text" id="kt-login-kontakt" maxlength="120" autocomplete="off">
            </div>
            <label class="kt-wiersz"><input type="checkbox" id="kt-zalacz"> <span id="kt-l-zalacz"></span></label>
            <div id="kt-podglad" class="hidden"><img id="kt-obraz" alt=""><div class="kt-dim" id="kt-uwaga-zrzut"></div></div>
            <div id="kt-status" class="kt-status" aria-live="polite"></div>
            <div class="kt-przyciski"><button type="button" class="btn" id="kt-wyslij"></button><button type="button" class="btn btn-secondary" id="kt-anuluj"></button></div>
        </div>`;
        document.body.appendChild(o);
        el('kt-anuluj').addEventListener('click', zamknij);
        el('kt-wyslij').addEventListener('click', wyslij);
        o.addEventListener('click', (e) => { if (e.target === o) zamknij(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el('kontakt-okno').classList.contains('hidden')) zamknij(); });
        el('kt-tresc').addEventListener('input', odswiezLicznik);
        el('kt-anonim').addEventListener('change', odswiezTryb);
        el('kt-zalacz').addEventListener('change', odswiezPodglad);
        document.addEventListener('zmiana-jezyka', odswiezTeksty);
        odswiezTeksty();
        setInterval(odswiezWidocznosc, 1000);
        odswiezWidocznosc();
    }

    function odswiezTeksty() {
        const s = (id, k) => { const e = el(id); if (e) e.textContent = tt(k); };
        s('kt-tytul', 'kt.title'); s('kt-opis', JEST_KIOSK ? 'kt.desc_kiosk' : (jestLogowanie() ? 'kt.desc_login' : 'kt.desc_panel')); s('kt-l-kat', 'kt.category'); s('kt-l-tresc', 'kt.message');
        s('kt-l-anonim', 'kt.anonymous');
        if (el('kt-login-podpis')) el('kt-login-podpis').placeholder = tt('kt.login_name_ph');
        if (el('kt-login-kontakt')) el('kt-login-kontakt').placeholder = tt('kt.login_contact_ph'); s('kt-l-zalacz', 'kt.attach'); s('kt-wyslij', 'kt.send'); s('kt-anuluj', 'kt.cancel');
        const b = el('btn-kontakt'); if (b) { b.textContent = '✉️ ' + tt('kt.button'); b.title = tt('kt.button_title'); }
        const kat = el('kt-kategoria');
        if (kat) Array.from(kat.options).forEach(op => { op.textContent = tt('kt.cat_' + op.value); });
        if (el('kt-tresc')) el('kt-tresc').placeholder = tt('kt.placeholder');
        if (el('kt-kod')) el('kt-kod').placeholder = tt('kt.code_ph');
        if (el('kt-pin')) el('kt-pin').placeholder = tt('kt.pin_ph');
        odswiezLicznik(); odswiezTryb();
    }
    function odswiezLicznik() { const e = el('kt-licznik'); if (e) e.textContent = `${el('kt-tresc').value.length} / ${MAKS_ZNAKOW}`; }

    function odswiezTryb() {
        const blok = el('kt-kiosk-blok'), nieanon = el('kt-nieanonim');
        if (!blok) return;
        const lb = el('kt-login-blok'); if (lb) lb.classList.toggle('hidden', !jestLogowanie());
        if (jestLogowanie()) { blok.classList.add('hidden'); nieanon.classList.remove('hidden'); nieanon.textContent = tt('kt.login_unverified'); return; }
        if (JEST_KIOSK) {
            blok.classList.remove('hidden'); nieanon.classList.add('hidden');
            el('kt-podpis').classList.toggle('hidden', el('kt-anonim').checked);
        } else {
            blok.classList.add('hidden'); nieanon.classList.remove('hidden');
            const s = (typeof sesja !== 'undefined' && sesja) ? sesja : null;
            nieanon.textContent = tt('kt.not_anonymous', { kto: s ? `${s.imie || ''} ${s.nazwisko || ''}`.trim() + ` (${s.kod})` : '' });
        }
    }

    // w Panelu przycisk jest widoczny tylko po zalogowaniu (wiadomość nie jest anonimowa); w Kiosku — zawsze
    function odswiezWidocznosc() {
        const b = el('btn-kontakt'); if (!b) return;
        // Kiosk: zawsze · Panel zalogowany: ministrant / ksiądz (NIE Admin) · Panel niezalogowany: na ekranie logowania
        const zalogowany = JEST_KIOSK || (typeof sesja !== 'undefined' && !!sesja && !jestAdminem());
        b.classList.toggle('hidden', !(zalogowany || jestLogowanie()));
    }

    async function otworz() {
        if (wysylanie) return;
        zrzutDane = null;
        el('kt-status').textContent = ''; el('kt-zalacz').checked = false; el('kt-podglad').classList.add('hidden');
        el('kt-uwaga-zrzut').textContent = '';
        odswiezTeksty();
        // zrzut robimy ZANIM pokaże się okno — żeby uchwycić to, co użytkownik widział
        const b = el('btn-kontakt'); b.disabled = true;
        const logowanie = jestLogowanie();
        if (!logowanie) { try { zrzutDane = await zrobZrzut(); } catch (e) { console.warn('Zrzut ekranu niedostępny:', e); zrzutDane = null; } }   // na ekranie logowania zrzutu nie robimy
        b.disabled = false;
        el('kt-zalacz').disabled = !zrzutDane;
        el('kt-l-zalacz').textContent = zrzutDane ? tt('kt.attach') : tt('kt.attach_unavailable');
        el('kt-zalacz').closest('label').classList.toggle('hidden', logowanie);
        el('kontakt-okno').classList.remove('hidden');
        setTimeout(() => el('kt-tresc').focus(), 50);
    }
    function zamknij() {
        if (wysylanie) return;
        el('kontakt-okno').classList.add('hidden');
        el('kt-pin').value = ''; zrzutDane = null;
    }
    function odswiezPodglad() {
        const pokaz = el('kt-zalacz').checked && zrzutDane;
        el('kt-podglad').classList.toggle('hidden', !pokaz);
        if (pokaz) { el('kt-obraz').src = zrzutDane; el('kt-uwaga-zrzut').textContent = tt('kt.attach_warning'); }
    }

    function komunikat(tekst, ok) { const e = el('kt-status'); e.textContent = tekst; e.className = 'kt-status ' + (ok ? 'ok' : 'blad'); }

    async function wyslij() {
        if (wysylanie) return;
        const tresc = el('kt-tresc').value.trim();
        if (!tresc) { komunikat(tt('kt.err_empty'), false); return; }
        const zrzut = (!jestLogowanie() && el('kt-zalacz').checked && zrzutDane) ? zrzutDane : null;
        const kat = el('kt-kategoria').value || 'inne';
        const ctx = kontekst();
        let nazwa, parametry;
        if (jestLogowanie()) {
            nazwa = 'kontakt_wyslij_logowanie';
            parametry = { p_tresc: tresc, p_kategoria: kat, p_podpis: el('kt-login-podpis').value.trim() || null, p_kontakt: el('kt-login-kontakt').value.trim() || null, p_kontekst: ctx };
        } else if (JEST_KIOSK) {
            const token = localStorage.getItem(typeof KLUCZ_TOKEN_KIOSKU !== 'undefined' ? KLUCZ_TOKEN_KIOSKU : 'em_kiosk_token');
            if (!token) { komunikat(tt('kt.err_no_token'), false); return; }
            const anonim = el('kt-anonim').checked;
            if (!anonim && (!el('kt-kod').value.trim() || !el('kt-pin').value.trim())) { komunikat(tt('kt.err_sign'), false); return; }
            nazwa = 'kontakt_wyslij_kiosk';
            parametry = { p_kiosk_id: ID_KIOSKU, p_token: token, p_tresc: tresc, p_kategoria: kat, p_anonimowe: anonim, p_kod: anonim ? null : el('kt-kod').value.trim(), p_pin: anonim ? null : el('kt-pin').value.trim(), p_zrzut: zrzut, p_kontekst: ctx };
        } else {
            if (typeof sesja === 'undefined' || !sesja) { komunikat(tt('kt.err_session'), false); return; }
            nazwa = 'kontakt_wyslij_panel';
            parametry = { p_kod: sesja.kod, p_pin: sesja.pin, p_tresc: tresc, p_kategoria: kat, p_zrzut: zrzut, p_kontekst: ctx };
        }
        wysylanie = true; el('kt-wyslij').disabled = true; komunikat(tt('kt.sending'), true);
        let w;
        try { w = await wywolajRPC(nazwa, parametry, { timeoutMs: 30000 }); } catch (e) { w = { sukces: false, siec: true }; }
        wysylanie = false; el('kt-wyslij').disabled = false;
        if (w && w.sukces) {
            el('kt-tresc').value = ''; el('kt-pin').value = ''; if (el('kt-login-podpis')) { el('kt-login-podpis').value = ''; el('kt-login-kontakt').value = ''; } odswiezLicznik();
            el('kontakt-okno').classList.add('hidden'); zrzutDane = null;
            if (typeof powiadomOk === 'function') powiadomOk(tt('kt.sent'));
            else alert(tt('kt.sent'));
            return;
        }
        const brakFunkcji = w && (w.kod_pg === 'PGRST202' || w.kod_pg === '42883');
        komunikat(w && w.siec ? tt('kt.err_network') : (brakFunkcji ? tt('kt.err_need_sql') : ((w && w.blad) || tt('kt.err_generic'))), false);   // treść NIE jest czyszczona — można spróbować ponownie
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zbudujInterfejs); else zbudujInterfejs();
    window.EMKontakt = { zrobZrzut, otworz };
})();
