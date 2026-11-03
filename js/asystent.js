// ============================================================================
// asystent.js — v2.15.05 — Asystent AI tylko dla Admina (pływający chat w prawym dolnym rogu)
//  • widoczny wyłącznie, gdy sesja.is_admin === true; domyślnie zwinięty; asystent jest WYŁĄCZONY, dopóki Admin go świadomie nie włączy;
//  • historia rozmowy żyje tylko w pamięci tej karty (zmienna `historia`) — brak localStorage / sessionStorage / IndexedDB;
//    znika po odświeżeniu, a po wylogowaniu jest czyszczona od razu;
//  • klucz API jest wyłącznie w Edge Function „asystent” (supabase/functions/asystent) — przeglądarka go nigdy nie widzi;
//  • asystent NIC nie wykonuje w systemie: odpowiada tekstem; szkic odpowiedzi na wiadomość Admin musi sam skopiować / zapisać;
//  • do modelu trafiają tylko zamaskowane dane (js/asystent-sanityzacja.js), a fragment ekranu i treść wiadomości — dopiero po jawnej zgodzie.
// Serwer: sql/38_asystent_ai_v2_15_05.sql + Edge Function. Testy: tests/asystent.test.mjs.
// ============================================================================
(function () {
    'use strict';
    const tt = (k, p) => (typeof t === 'function' ? t(k, p) : k);
    const el = (id) => document.getElementById(id);
    const S = window.EMSanityzacja;
    const CZAS_ODP_MS = 45000;

    let historia = [];            // [{rola:'user'|'assistant', tresc}] — TYLKO pamięć
    let stan = { wlaczony: null, status: 'off', zajety: false, limitTekst: '' };   // status: on | off | limit | blad

    const sesjaAdmin = () => { try { return typeof sesja !== 'undefined' && !!sesja && sesja.is_admin === true; } catch (e) { return false; } };
    const bladBrakFunkcji = (w) => !!w && (w.kod_pg === 'PGRST202' || w.kod_pg === '42883' || w.kod_bledu === 'need_sql');

    // ------------------------------------------------------------------ wywołania ---
    async function rpc(nazwa, p) { return wywolajRPC(nazwa, Object.assign({ p_kod: sesja.kod, p_pin: sesja.pin }, p || {}), { timeoutMs: 15000 }); }

    async function zapytaj(o) {
        const body = {
            kod: sesja.kod, pin: sesja.pin, wiadomosci: historia.concat(o.dodatkowe || []).slice(-12), uzyj_danych: !!o.uzyjDanych,
            ekran: o.ekran || null, zgoda_ekran: !!o.ekran, kontakt: o.kontakt || null, zgoda_kontakt: !!o.kontakt,
            zakres: o.zakres || 'podstawowy', rok: o.rok || null, miesiac: o.miesiac || null, wiedza: !!o.wiedza   // v2.15.06
        };
        let r;
        try {
            r = await Promise.race([supabaseClient.functions.invoke('asystent', { body }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), CZAS_ODP_MS))]);
        } catch (e) { return { sukces: false, kod_bledu: 'siec' }; }
        if (!r || r.error) {
            const st = r && r.error && r.error.context && r.error.context.status;
            return { sukces: false, kod_bledu: st === 404 ? 'brak_funkcji' : 'siec' };
        }
        return r.data || { sukces: false, kod_bledu: 'api' };
    }

    function opisBledu(w) {
        const k = (w && w.kod_bledu) || 'generic';
        const znane = ['limit', 'tier', 'brak_srodkow', 'klucz', 'siec', 'api', 'wylaczony', 'rate_limit', 'brak_uprawnien', 'need_sql', 'brak_funkcji'];
        return tt('as.err_' + (znane.includes(k) ? k : 'generic'));
    }
    function ustawStatusZBledu(w) {
        const k = w && w.kod_bledu;
        stan.status = (k === 'limit' || k === 'rate_limit' || k === 'brak_srodkow') ? 'limit' : (k === 'wylaczony' ? 'off' : 'blad');
        if (k === 'wylaczony') stan.wlaczony = false;
        odswiezStatus();
    }
    function tekstLimitu(l) {
        if (!l) return '';
        return Object.keys(l).filter(k => /remaining/.test(k)).map(k => `${k.replace(/^ratelimit-/, '')}: ${l[k]}`).join(' · ');
    }

    // ------------------------------------------------------------------ interfejs ---
    function zbuduj() {
        if (el('btn-asystent')) return;
        const b = document.createElement('button');
        b.id = 'btn-asystent'; b.type = 'button'; b.className = 'btn-asystent hidden'; b.textContent = '🤖';
        b.addEventListener('click', przelacz);
        document.body.appendChild(b);
        const o = document.createElement('div');
        o.id = 'asystent-okno'; o.className = 'asystent-okno hidden'; o.setAttribute('role', 'dialog');
        o.innerHTML = `
            <div class="as-glowa"><strong id="as-tytul"></strong><span id="as-status" class="as-status"></span><button type="button" id="as-zamknij" class="as-x">✕</button></div>
            <div class="as-ostrz" id="as-ostrz"></div>
            <div id="as-wylaczony" class="as-blok hidden"><p id="as-info-wyl"></p><button type="button" class="btn" id="as-wlacz"></button></div>
            <div id="as-glowny" class="hidden">
                <div class="as-szybkie"><button type="button" class="btn btn-secondary" id="as-qa-raport"></button><button type="button" class="btn btn-secondary" id="as-qa-wpis"></button><button type="button" class="btn btn-secondary" id="as-qa-odp"></button>
                    <button type="button" class="btn btn-secondary" id="as-qa-poranny"></button><button type="button" class="btn btn-secondary" id="as-qa-kiosk"></button><button type="button" class="btn btn-secondary" id="as-qa-proc"></button><button type="button" class="btn btn-secondary" id="as-qa-anom"></button><button type="button" class="btn btn-secondary" id="as-qa-miesiac"></button></div>
                <div id="as-rozmowa" class="as-rozmowa" aria-live="polite"></div>
                <div class="as-limit" id="as-limit"></div>
                <label class="as-wiersz"><input type="checkbox" id="as-dane" checked> <span id="as-l-dane"></span></label>
                <textarea id="as-tresc" rows="2" maxlength="2000"></textarea>
                <div class="as-przyciski"><button type="button" class="btn" id="as-wyslij"></button><button type="button" class="btn btn-secondary" id="as-wyczysc"></button><button type="button" class="btn btn-secondary" id="as-wylacz"></button></div>
            </div>`;
        document.body.appendChild(o);
        el('as-zamknij').addEventListener('click', zwin);
        el('as-wlacz').addEventListener('click', wlacz);
        el('as-wylacz').addEventListener('click', wylacz);
        el('as-wyslij').addEventListener('click', () => wyslijPytanie(el('as-tresc').value));
        el('as-tresc').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) wyslijPytanie(el('as-tresc').value); });
        el('as-wyczysc').addEventListener('click', czyscRozmowe);
        el('as-qa-raport').addEventListener('click', () => wyslijPytanie(tt('as.q_report'), { uzyjDanych: true }));
        el('as-qa-wpis').addEventListener('click', wyjasnijWpis);
        el('as-qa-odp').addEventListener('click', wybierzWiadomosc);
        el('as-qa-poranny').addEventListener('click', () => wyslijPytanie(tt('as.q_morning'), { uzyjDanych: true, zakres: 'podstawowy', wiedza: true }));
        el('as-qa-anom').addEventListener('click', () => wyslijPytanie(tt('as.q_anomalies'), { uzyjDanych: true, zakres: 'trendy', wiedza: false }));
        el('as-qa-kiosk').addEventListener('click', diagnozujKiosk);
        el('as-qa-proc').addEventListener('click', przewodnikProcedur);
        el('as-qa-miesiac').addEventListener('click', raportMiesieczny);
        document.addEventListener('zmiana-jezyka', odswiezTeksty);
        odswiezTeksty();
        setInterval(odswiezWidocznosc, 1000);
        odswiezWidocznosc();
    }

    function odswiezTeksty() {
        const s = (id, k) => { const e = el(id); if (e) e.textContent = tt(k); };
        s('as-tytul', 'as.title'); s('as-ostrz', 'as.warning'); s('as-info-wyl', 'as.disabled_info'); s('as-wlacz', 'as.enable'); s('as-l-dane', 'as.use_data');
        s('as-wyslij', 'as.send'); s('as-wyczysc', 'as.clear'); s('as-wylacz', 'as.disable');
        s('as-qa-raport', 'as.qa_report'); s('as-qa-wpis', 'as.qa_entry'); s('as-qa-odp', 'as.qa_reply');
        s('as-qa-poranny', 'as.qa_morning'); s('as-qa-kiosk', 'as.qa_kiosk'); s('as-qa-proc', 'as.qa_proc'); s('as-qa-anom', 'as.qa_anomalies'); s('as-qa-miesiac', 'as.qa_month');
        if (el('as-tresc')) el('as-tresc').placeholder = tt('as.placeholder');
        if (el('btn-asystent')) el('btn-asystent').title = tt('as.button_title');
        odswiezStatus();
    }

    function odswiezStatus() {
        const e = el('as-status'); if (!e) return;
        const mapa = { on: '✅ ' + tt('as.status_on'), off: '⚪ ' + tt('as.status_off'), limit: '⛔ ' + tt('as.status_limit'), blad: '⚠️ ' + tt('as.status_error') };
        e.textContent = mapa[stan.status] || '';
        el('as-wylaczony').classList.toggle('hidden', stan.wlaczony !== false);
        el('as-glowny').classList.toggle('hidden', stan.wlaczony !== true);
        el('as-limit').textContent = stan.limitTekst ? tt('as.remaining', { txt: stan.limitTekst }) : '';
    }

    // widoczny tylko dla Admina; po wylogowaniu / zmianie konta — zwinięty i WYCZYSZCZONY
    function odswiezWidocznosc() {
        const b = el('btn-asystent'); if (!b) return;
        const admin = sesjaAdmin();
        b.classList.toggle('hidden', !admin);
        if (!admin) { zwin(); wyczyscWszystko(); }
    }
    function wyczyscWszystko() {
        historia = []; stan = { wlaczony: null, status: 'off', zajety: false, limitTekst: '' };
        const r = el('as-rozmowa'); if (r) r.textContent = '';
        const tr = el('as-tresc'); if (tr) tr.value = '';
        odswiezStatus();
    }

    async function przelacz() {
        const o = el('asystent-okno');
        if (!o.classList.contains('hidden')) { zwin(); return; }
        o.classList.remove('hidden');
        if (stan.wlaczony === null) await pobierzStatus();
    }
    function zwin() { const o = el('asystent-okno'); if (o) o.classList.add('hidden'); }

    async function pobierzStatus() {
        const w = await rpc('asystent_status');
        if (w && w.sukces) { stan.wlaczony = !!w.wlaczony; stan.status = w.wlaczony ? 'on' : 'off'; }
        else { stan.wlaczony = false; stan.status = 'blad'; dodajKomunikat('blad', bladBrakFunkcji(w) ? tt('as.err_need_sql') : tt('as.err_generic')); }
        odswiezStatus();
    }
    async function wlacz() {
        if (!confirm(tt('as.enable_confirm'))) return;
        const w = await rpc('asystent_ustaw', { p_wlaczony: true });
        if (w && w.sukces) { stan.wlaczony = true; stan.status = 'on'; dodajKomunikat('system', tt('as.enabled_ok')); }
        else dodajKomunikat('blad', bladBrakFunkcji(w) ? tt('as.err_need_sql') : tt('as.err_generic'));
        odswiezStatus();
    }
    async function wylacz() {
        if (!confirm(tt('as.disable_confirm'))) return;
        const w = await rpc('asystent_ustaw', { p_wlaczony: false });
        if (w && w.sukces) { stan.wlaczony = false; stan.status = 'off'; historia = []; el('as-rozmowa').textContent = ''; }
        odswiezStatus();
    }
    function czyscRozmowe() { historia = []; el('as-rozmowa').textContent = ''; stan.limitTekst = ''; odswiezStatus(); }

    // ------------------------------------------------------------------ rozmowa (tekst wstawiany przez textContent — bez HTML) ---
    function dodajKomunikat(rodzaj, tekst) {
        const r = el('as-rozmowa'); if (!r) return;
        const d = document.createElement('div');
        d.className = 'as-msg as-' + rodzaj;
        const kto = { user: tt('as.you'), assistant: tt('as.assistant') }[rodzaj];
        if (kto) { const s = document.createElement('strong'); s.textContent = kto + ': '; d.appendChild(s); }
        d.appendChild(document.createTextNode(tekst));
        if (rodzaj === 'assistant') {   // v2.15.06: kopiowanie gotowej odpowiedzi (np. raportu dla proboszcza); nic nie jest wysyłane
            const k = document.createElement('button'); k.type = 'button'; k.className = 'as-kopiuj'; k.textContent = '📋 ' + tt('as.copy_short');
            k.addEventListener('click', async () => { try { await navigator.clipboard.writeText(tekst); k.textContent = '✅ ' + tt('as.copied'); } catch (e) { k.textContent = '⚠️ ' + tt('as.copy_manual'); } });
            d.appendChild(k);
        }
        r.appendChild(d); r.scrollTop = r.scrollHeight;
    }

    async function wyslijPytanie(tekst, opcje) {
        const o = opcje || {};
        tekst = String(tekst || '').trim();
        if (!tekst || stan.zajety || !sesjaAdmin()) return;
        stan.zajety = true; el('as-wyslij').disabled = true;
        dodajKomunikat('user', tekst);
        historia.push({ rola: 'user', tresc: tekst });
        if (!o.zostawPole) el('as-tresc').value = '';
        const mysli = document.createElement('div'); mysli.className = 'as-msg as-system'; mysli.textContent = '⏳ ' + tt('as.thinking'); el('as-rozmowa').appendChild(mysli);
        const w = await zapytaj({ uzyjDanych: o.uzyjDanych !== undefined ? o.uzyjDanych : el('as-dane').checked, ekran: o.ekran, kontakt: o.kontakt, zakres: o.zakres, rok: o.rok, miesiac: o.miesiac, wiedza: o.wiedza });
        mysli.remove();
        stan.zajety = false; el('as-wyslij').disabled = false;
        if (w && w.sukces) {
            historia.push({ rola: 'assistant', tresc: w.odpowiedz });
            dodajKomunikat('assistant', w.odpowiedz);
            if (w.uzyty_zapasowy) dodajKomunikat('system', tt('as.model_fallback', { model: w.model }));
            stan.status = 'on'; stan.limitTekst = tekstLimitu(w.limit_pozostaly);
            odswiezStatus();
            return w;
        }
        historia.pop();   // pytanie bez odpowiedzi nie zostaje w kontekście
        dodajKomunikat('blad', opisBledu(w));
        stan.limitTekst = tekstLimitu(w && w.limit_pozostaly);
        ustawStatusZBledu(w);
        return w;
    }

    // ------------------------------------------------------------------ zgoda Admina na wysłanie fragmentu (podgląd ZAMASKOWANEGO tekstu) ---
    function okno(html) {
        const tlo = document.createElement('div');
        tlo.className = 'kontakt-tlo'; tlo.setAttribute('data-zrzut-ukryj', '1');
        tlo.innerHTML = `<div class="kontakt-okno">${html}</div>`;
        document.body.appendChild(tlo);
        const zamknij = () => tlo.remove();
        tlo.addEventListener('click', (e) => { if (e.target === tlo) zamknij(); });
        return { tlo, zamknij };
    }

    function tekstAktywnejZakladki() {
        const karta = document.querySelector('[id^="tab-content-"]:not(.hidden)');
        return karta ? { zakladka: karta.id.replace('tab-content-', ''), tekst: (karta.innerText || '').trim() } : null;
    }

    function wyjasnijWpis() {
        const e = tekstAktywnejZakladki();
        if (!e || !e.tekst) { dodajKomunikat('system', tt('as.screen_empty')); return; }
        const maska = S.maskuj(e.tekst, S.MAKS_EKRAN);
        const { tlo, zamknij } = okno(`<h3>🖥️ ${escHtml(tt('as.screen_title'))}</h3><p class="kt-dim">${escHtml(tt('as.screen_hint'))}</p>
            <textarea id="as-ekran-tekst" rows="10" maxlength="${S.MAKS_EKRAN}"></textarea>
            <label class="kt-wiersz"><input type="checkbox" id="as-ekran-zgoda"> <span>${escHtml(tt('as.screen_consent'))}</span></label>
            <div class="kt-przyciski"><button type="button" class="btn" id="as-ekran-wyslij" disabled>${escHtml(tt('as.send'))}</button><button type="button" class="btn btn-secondary" id="as-ekran-anuluj">${escHtml(tt('common.cancel'))}</button></div>`);
        tlo.querySelector('#as-ekran-tekst').value = maska;
        const zgoda = tlo.querySelector('#as-ekran-zgoda'), wyslij = tlo.querySelector('#as-ekran-wyslij');
        zgoda.addEventListener('change', () => { wyslij.disabled = !zgoda.checked; });
        tlo.querySelector('#as-ekran-anuluj').addEventListener('click', zamknij);
        wyslij.addEventListener('click', () => {
            const edytowany = tlo.querySelector('#as-ekran-tekst').value;   // Admin może jeszcze coś usunąć; serwer maskuje ponownie
            zamknij();
            wyslijPytanie(tt('as.q_entry'), { ekran: { zakladka: e.zakladka, tekst: edytowany }, uzyjDanych: false });
        });
    }

    function escHtml(v) { return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ------------------------------------------------------------------ v2.15.06: diagnostyka kiosku, procedury, raport miesięczny ---
    const TEMATY_PROCEDUR = ['sync', 'acc36', 'kiosk_lost', 'token', 'pin_lock', 'rodo', 'month_close', 'retention'];

    // Diagnostyka: techniczne dane wybranego kiosku (bez danych osobowych) + opcjonalnie komunikat błędu wklejony przez Admina; zgoda i podgląd jak przy ekranie
    function diagnozujKiosk() {
        const lista = (typeof biezacaListaKioskow !== 'undefined' && Array.isArray(biezacaListaKioskow)) ? biezacaListaKioskow : [];
        const { tlo, zamknij } = okno(`<h3>🩺 ${escHtml(tt('as.kiosk_title'))}</h3><p class="kt-dim">${escHtml(tt('as.kiosk_hint'))}</p>
            <select id="as-kiosk-wybor"></select>
            <label class="kt-etykieta">${escHtml(tt('as.kiosk_error_label'))}</label><textarea id="as-kiosk-blad" rows="3" maxlength="1000"></textarea>
            <label class="kt-etykieta">${escHtml(tt('as.screen_title'))}</label><textarea id="as-kiosk-podglad" rows="8" maxlength="${S.MAKS_EKRAN}"></textarea>
            <label class="kt-wiersz"><input type="checkbox" id="as-kiosk-zgoda"> <span>${escHtml(tt('as.screen_consent'))}</span></label>
            <div class="kt-przyciski"><button type="button" class="btn" id="as-kiosk-wyslij" disabled>${escHtml(tt('as.send'))}</button><button type="button" class="btn btn-secondary" id="as-kiosk-anuluj">${escHtml(tt('common.cancel'))}</button></div>`);
        const sel = tlo.querySelector('#as-kiosk-wybor'), blad = tlo.querySelector('#as-kiosk-blad'), podglad = tlo.querySelector('#as-kiosk-podglad');
        const zgoda = tlo.querySelector('#as-kiosk-zgoda'), wyslij = tlo.querySelector('#as-kiosk-wyslij');
        const nic = document.createElement('option'); nic.value = '-1'; nic.textContent = tt('as.kiosk_none'); sel.appendChild(nic);
        lista.forEach((k, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `#${i + 1} · ${k.online ? tt('as.kiosk_online') : tt('as.kiosk_offline')}`; sel.appendChild(o); });
        // anonimowo: numer kolejny zamiast identyfikatora i nazwy; liczby i flagi techniczne z pola diagnostycznego (klucze osobowe wycina czystyAgregat)
        const zloz = () => {
            const k = lista[Number(sel.value)], czesci = [];
            if (k) {
                const minut = k.ostatni_ping ? Math.max(0, Math.round((Date.now() - new Date(k.ostatni_ping).getTime()) / 60000)) : null;
                czesci.push(`Kiosk #${Number(sel.value) + 1}: ${k.online ? 'online' : 'offline'}; ostatni ping: ${minut === null ? 'brak' : minut + ' min temu'}; wersja kiosku: ${k.wersja || k.ostatnia_wersja || '?'}; wersja aplikacji: ${typeof WERSJA_APLIKACJI !== 'undefined' ? WERSJA_APLIKACJI : '?'}`);
                let dane = k.ostatnie_dane; if (typeof dane === 'string') { try { dane = JSON.parse(dane); } catch (e) { dane = null; } }
                if (dane && typeof dane === 'object') czesci.push('Dane diagnostyczne: ' + JSON.stringify(S.czystyAgregat(dane)));
            }
            if (blad.value.trim()) czesci.push('Komunikat / objaw opisany przez Admina: ' + blad.value.trim());
            podglad.value = S.maskuj(czesci.join('\n'), S.MAKS_EKRAN);
        };
        sel.addEventListener('change', zloz); blad.addEventListener('input', zloz); zloz();
        zgoda.addEventListener('change', () => { wyslij.disabled = !zgoda.checked; });
        tlo.querySelector('#as-kiosk-anuluj').addEventListener('click', zamknij);
        wyslij.addEventListener('click', () => {
            const tekst = podglad.value; zamknij();
            if (!tekst.trim()) { dodajKomunikat('system', tt('as.screen_empty')); return; }
            wyslijPytanie(tt('as.q_kiosk'), { ekran: { zakladka: 'kioski', tekst }, uzyjDanych: true, zakres: 'podstawowy', wiedza: true });
        });
    }

    // Procedury: wybór tematu (lub własne pytanie) → checklista oparta na wiedzy o systemie; bez danych z bazy
    function przewodnikProcedur() {
        const { tlo, zamknij } = okno(`<h3>📖 ${escHtml(tt('as.proc_title'))}</h3><select id="as-proc-temat"></select>
            <label class="kt-etykieta">${escHtml(tt('as.proc_own'))}</label><textarea id="as-proc-wlasne" rows="2" maxlength="300"></textarea>
            <div class="kt-przyciski"><button type="button" class="btn" id="as-proc-ok">${escHtml(tt('as.send'))}</button><button type="button" class="btn btn-secondary" id="as-proc-anuluj">${escHtml(tt('common.cancel'))}</button></div>`);
        const sel = tlo.querySelector('#as-proc-temat');
        TEMATY_PROCEDUR.forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = tt('as.proc_' + k); sel.appendChild(o); });
        tlo.querySelector('#as-proc-anuluj').addEventListener('click', zamknij);
        tlo.querySelector('#as-proc-ok').addEventListener('click', () => {
            const wlasne = tlo.querySelector('#as-proc-wlasne').value.trim(), temat = tt('as.proc_' + sel.value); zamknij();
            wyslijPytanie(tt('as.q_proc', { temat: wlasne || temat }), { uzyjDanych: false, wiedza: true });
        });
    }

    // Raport miesięczny dla proboszcza: zagregowane liczby za wybrany miesiąc → tekst do skopiowania (przycisk 📋 przy odpowiedzi)
    function raportMiesieczny() {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
        const domyslny = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const { tlo, zamknij } = okno(`<h3>📄 ${escHtml(tt('as.month_title'))}</h3><p class="kt-dim">${escHtml(tt('as.month_hint'))}</p>
            <input type="month" id="as-miesiac" value="${domyslny}">
            <div class="kt-przyciski"><button type="button" class="btn" id="as-miesiac-ok">${escHtml(tt('as.month_generate'))}</button><button type="button" class="btn btn-secondary" id="as-miesiac-anuluj">${escHtml(tt('common.cancel'))}</button></div>`);
        tlo.querySelector('#as-miesiac-anuluj').addEventListener('click', zamknij);
        tlo.querySelector('#as-miesiac-ok').addEventListener('click', () => {
            const m = /^(\d{4})-(\d{2})$/.exec(tlo.querySelector('#as-miesiac').value || domyslny); zamknij();
            if (!m) return;
            wyslijPytanie(tt('as.q_month', { miesiac: `${m[1]}-${m[2]}` }), { uzyjDanych: true, zakres: 'miesiac', rok: Number(m[1]), miesiac: Number(m[2]), wiedza: false });
        });
    }

    // ------------------------------------------------------------------ pomoc w odpowiedzi na wiadomość („Kontakt z Adminem”) ---
    function wybierzWiadomosc() {
        const lista = (typeof kontaktDane !== 'undefined' && Array.isArray(kontaktDane)) ? kontaktDane : [];
        if (!lista.length) { dodajKomunikat('system', tt('as.reply_none')); return; }
        const { tlo, zamknij } = okno(`<h3>✉️ ${escHtml(tt('as.reply_pick'))}</h3><select id="as-wybor-wiad"></select>
            <div class="kt-przyciski"><button type="button" class="btn" id="as-wybor-ok">${escHtml(tt('as.reply_next'))}</button><button type="button" class="btn btn-secondary" id="as-wybor-anuluj">${escHtml(tt('common.cancel'))}</button></div>`);
        const sel = tlo.querySelector('#as-wybor-wiad');
        lista.forEach((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = `#${r.id} · ${tt('kt.cat_' + r.kategoria)} · ${String(r.tresc || '').slice(0, 50)}`; sel.appendChild(o); });
        tlo.querySelector('#as-wybor-anuluj').addEventListener('click', zamknij);
        tlo.querySelector('#as-wybor-ok').addEventListener('click', () => { const r = lista[Number(sel.value)]; zamknij(); pomozOdpowiedziec(r); });
    }

    function pomozOdpowiedziec(rekord) {
        if (!rekord || !sesjaAdmin()) return;
        const sanit = S.sanityzujKontakt({ kategoria: rekord.kategoria, tresc: rekord.tresc });
        const { tlo, zamknij } = okno(`<h3>🤖 ${escHtml(tt('as.reply_title'))}</h3><p class="kt-dim">${escHtml(tt('as.reply_hint'))}</p>
            <textarea id="as-kontakt-tekst" rows="7" maxlength="${S.MAKS_TEKST}" readonly></textarea>
            <label class="kt-wiersz"><input type="checkbox" id="as-kontakt-zgoda"> <span>${escHtml(tt('as.reply_consent'))}</span></label>
            <div id="as-kontakt-status" class="kt-status" aria-live="polite"></div>
            <div id="as-szkic-blok" class="hidden"><h4>${escHtml(tt('as.reply_draft_title'))}</h4>
                <textarea id="as-szkic" rows="8" maxlength="4000"></textarea><div class="kt-dim">${escHtml(tt('as.reply_notsent'))}</div>
                <div class="kt-przyciski"><button type="button" class="btn" id="as-szkic-kopiuj">${escHtml(tt('as.copy'))}</button><button type="button" class="btn btn-secondary" id="as-szkic-notatka">${escHtml(tt('as.save_note'))}</button></div></div>
            <div class="kt-przyciski"><button type="button" class="btn" id="as-kontakt-gen" disabled>${escHtml(tt('as.reply_generate'))}</button><button type="button" class="btn btn-secondary" id="as-kontakt-zamknij">${escHtml(tt('as.close'))}</button></div>`);
        tlo.querySelector('#as-kontakt-tekst').value = sanit ? sanit.tresc : '';   // widać DOKŁADNIE to, co zostanie wysłane (po zamaskowaniu)
        const zgoda = tlo.querySelector('#as-kontakt-zgoda'), gen = tlo.querySelector('#as-kontakt-gen'), st = tlo.querySelector('#as-kontakt-status');
        zgoda.addEventListener('change', () => { gen.disabled = !zgoda.checked || !sanit; });
        tlo.querySelector('#as-kontakt-zamknij').addEventListener('click', zamknij);
        gen.addEventListener('click', async () => {
            gen.disabled = true; st.textContent = '⏳ ' + tt('as.thinking');
            const w = await zapytaj({
                uzyjDanych: false, kontakt: { kategoria: rekord.kategoria, tresc: tlo.querySelector('#as-kontakt-tekst').value },
                dodatkowe: [{ rola: 'user', tresc: tt('as.q_reply') }]
            });
            gen.disabled = false;
            if (w && w.sukces) {
                st.textContent = ''; tlo.querySelector('#as-szkic-blok').classList.remove('hidden');
                tlo.querySelector('#as-szkic').value = w.odpowiedz; stan.status = 'on'; odswiezStatus();
            } else { st.textContent = '❌ ' + opisBledu(w); ustawStatusZBledu(w); }
        });
        // „Użyj”: tylko świadome działanie Admina — kopiowanie albo zapis jako notatka; nic nie jest wysyłane do nadawcy
        tlo.querySelector('#as-szkic-kopiuj').addEventListener('click', async () => {
            const txt = tlo.querySelector('#as-szkic').value;
            try { await navigator.clipboard.writeText(txt); st.textContent = '✅ ' + tt('as.copied'); } catch (e) { tlo.querySelector('#as-szkic').select(); st.textContent = '⚠️ ' + tt('as.copy_manual'); }
        });
        tlo.querySelector('#as-szkic-notatka').addEventListener('click', async () => {
            const w = await wywolajRPC('admin_kontakt_status', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: Number(rekord.id), p_status: rekord.status, p_uwagi: tlo.querySelector('#as-szkic').value.slice(0, 500) });
            st.textContent = (w && w.sukces) ? '✅ ' + tt('as.note_saved') : '❌ ' + tt('as.err_generic');
            if (w && w.sukces && typeof odswiezWiadomosci === 'function') odswiezWiadomosci();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zbuduj); else zbuduj();
    window.EMAsystent = { pomozOdpowiedziec, wyczyscWszystko, _historia: () => historia.length };
})();
