// ============================================================================
// v2.12.05 — KALENDARZ INTERAKTYWNY + SORTOWANIE I FILTROWANIE TABEL + teksty pomocnicze
//
//  1) Kalendarz interaktywny (widok Miesiąc / Tydzień / Lista) — Admin, Ksiądz (zakładka Kalendarz) i Ministrant (panel główny):
//     wszystkie wydarzenia, zaplanowane i odbyte, kolorowane wg typu; filtry (typ, status, wyszukiwarka), szczegóły dnia,
//     przesuwanie palcem / strzałkami, „Dodaj wydarzenie tego dnia” (Admin/Ksiądz).
//  2) Każda tabela o id „tabela-…” / „mm-…” dostaje: sortowanie po kliknięciu nagłówka (liczby, daty, kody MIN-014, tekst)
//     oraz pole filtrowania z licznikiem wierszy. Działa też po odświeżeniu danych (MutationObserver).
//  3) window.emTx(klucz, zmienne) — małe tłumaczenia (pl/en/uk) dla elementów dodanych w tej wersji.
// Moduł niczego nie zapisuje w bazie — tylko czyta tabelę/widok `kalendarz` (jak reszta aplikacji).
// ============================================================================
(function () {
    'use strict';

    // ------------------------------------------------------------------ TŁUMACZENIA ----
    const TX = {
        pl: {
            cal_title: '📅 Kalendarz interaktywny', month: 'Miesiąc', week: 'Tydzień', list: 'Lista', today: 'Dziś', prev: 'Poprzedni', next: 'Następny',
            all_types: 'Wszystkie typy', all_status: 'Wszystkie', planned: 'Zaplanowane', done: 'Odbyte', live: 'Trwa teraz',
            search_ph: 'Szukaj wydarzenia…', none: 'Brak wydarzeń w tym okresie.', none_day: 'Ten dzień jest wolny — brak wydarzeń.',
            more: '+{n} więcej', add_here: '➕ Dodaj wydarzenie tego dnia', window: 'Okno rejestracji w Kiosku', block: 'Część bloku połączonego',
            summary: 'Zaplanowane: {p} · Odbyte: {d} · Razem: {n}', loading: 'Ładowanie…', pick_day: 'Kliknij dzień, aby zobaczyć szczegóły.',
            filter_ph: 'Filtruj tabelę…', rows: 'Wiersze: {a}/{b}', clear: 'Wyczyść', sort_hint: 'Kliknij nagłówek, aby sortować',
            aud_count: 'Wpisów: {n} (limit {limit})', today_marker: 'dziś', err: 'Nie udało się wczytać kalendarza.', retry: 'Spróbuj ponownie',
            wd_tip: 'Dzień tygodnia', types: 'Typ', status: 'Status'
        },
        en: {
            cal_title: '📅 Interactive calendar', month: 'Month', week: 'Week', list: 'List', today: 'Today', prev: 'Previous', next: 'Next',
            all_types: 'All types', all_status: 'All', planned: 'Planned', done: 'Completed', live: 'Happening now',
            search_ph: 'Search events…', none: 'No events in this period.', none_day: 'This day is free — no events.',
            more: '+{n} more', add_here: '➕ Add an event on this day', window: 'Kiosk registration window', block: 'Part of a linked block',
            summary: 'Planned: {p} · Completed: {d} · Total: {n}', loading: 'Loading…', pick_day: 'Click a day to see details.',
            filter_ph: 'Filter table…', rows: 'Rows: {a}/{b}', clear: 'Clear', sort_hint: 'Click a header to sort',
            aud_count: 'Entries: {n} (limit {limit})', today_marker: 'today', err: 'Could not load the calendar.', retry: 'Try again',
            wd_tip: 'Weekday', types: 'Type', status: 'Status'
        },
        uk: {
            cal_title: '📅 Інтерактивний календар', month: 'Місяць', week: 'Тиждень', list: 'Список', today: 'Сьогодні', prev: 'Попередній', next: 'Наступний',
            all_types: 'Усі типи', all_status: 'Усі', planned: 'Заплановані', done: 'Проведені', live: 'Триває зараз',
            search_ph: 'Шукати подію…', none: 'У цей період подій немає.', none_day: 'Цей день вільний — подій немає.',
            more: '+ще {n}', add_here: '➕ Додати подію на цей день', window: 'Вікно реєстрації в Кіоску', block: 'Частина пов’язаного блоку',
            summary: 'Заплановано: {p} · Проведено: {d} · Разом: {n}', loading: 'Завантаження…', pick_day: 'Натисніть день, щоб побачити подробиці.',
            filter_ph: 'Фільтрувати таблицю…', rows: 'Рядки: {a}/{b}', clear: 'Очистити', sort_hint: 'Натисніть заголовок, щоб сортувати',
            aud_count: 'Записів: {n} (ліміт {limit})', today_marker: 'сьогодні', err: 'Не вдалося завантажити календар.', retry: 'Спробувати ще раз',
            wd_tip: 'День тижня', types: 'Тип', status: 'Статус'
        }
    };
    function jezyk() { try { return (typeof jezykBiezacy !== 'undefined' && TX[jezykBiezacy]) ? jezykBiezacy : 'pl'; } catch (e) { return 'pl'; } }
    function tx(klucz, zm) {
        let s = (TX[jezyk()] || TX.pl)[klucz];
        if (s === undefined) s = TX.pl[klucz];
        if (s === undefined) return klucz;
        return s.replace(/\{(\w+)\}/g, (_, n) => (zm && zm[n] !== undefined) ? String(zm[n]) : '{' + n + '}');
    }
    window.emTx = tx;

    function loc() { try { return (typeof locale === 'function') ? locale() : 'pl-PL'; } catch (e) { return 'pl-PL'; } }
    function ucfirst(s) { return String(s).replace(/^./, c => c.toLocaleUpperCase(loc())); }
    function h(v) { return (typeof esc === 'function') ? esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ------------------------------------------------------------------ DATY ----
    const DZIEN = 86400000;
    function poczatekDnia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function dodajDni(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function klucz(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    function poniedzialek(d) { const x = poczatekDnia(d); return dodajDni(x, -((x.getDay() + 6) % 7)); }   // tydzień od poniedziałku
    function godz(iso) { return new Date(iso).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); }
    function nazwaTypu(typ) {
        const f = (typeof etykieta === 'function') ? etykieta('cal.type.' + typ, typ) : typ;
        return f;
    }
    const IKONY = { msza: '⛪', nabozenstwo: '🕯️', zbiorka: '👥' };
    const TYPY = ['msza', 'nabozenstwo', 'zbiorka'];
    function ikona(typ) { return IKONY[typ] || '📌'; }

    function status(w, teraz) {
        const start = new Date(w.data_wydarzenia).getTime();
        const oS = w.okno_start ? new Date(w.okno_start).getTime() : start - 15 * 60000;
        const oK = w.okno_koniec ? new Date(w.okno_koniec).getTime() : start + 5 * 60000;
        if (teraz >= oS && teraz <= oK) return 'live';
        return start < teraz ? 'done' : 'planned';
    }

    // ------------------------------------------------------------------ KALENDARZ ----
    const instancje = [];

    function Kalendarz(root, opcje) {
        this.root = root; this.admin = !!(opcje && opcje.admin);
        this.tryb = 'month'; this.kursor = poczatekDnia(new Date());
        this.typy = new Set(TYPY); this.status = 'all'; this.q = '';
        this.dane = []; this.cache = new Map(); this.wybranyDzien = klucz(new Date()); this.kierunek = 0; this.numer = 0;
        this.zbuduj(); this.podepnij(); this.odswiez();
    }

    Kalendarz.prototype.zbuduj = function () {
        const r = this.root;
        r.classList.add('kal-int');
        r.innerHTML = `
            <h3 class="kal-naglowek">${h(tx('cal_title'))}</h3>
            <div class="kal-pasek">
                <div class="kal-nawigacja">
                    <button type="button" class="kal-btn" data-kal="prev" aria-label="${h(tx('prev'))}" title="${h(tx('prev'))}">‹</button>
                    <strong class="kal-tytul" aria-live="polite"></strong>
                    <button type="button" class="kal-btn" data-kal="next" aria-label="${h(tx('next'))}" title="${h(tx('next'))}">›</button>
                    <button type="button" class="kal-btn kal-btn-dzis" data-kal="today">${h(tx('today'))}</button>
                </div>
                <div class="kal-tryby" role="tablist">
                    <button type="button" class="kal-btn" data-tryb="month">${h(tx('month'))}</button>
                    <button type="button" class="kal-btn" data-tryb="week">${h(tx('week'))}</button>
                    <button type="button" class="kal-btn" data-tryb="list">${h(tx('list'))}</button>
                </div>
            </div>
            <div class="kal-filtry">
                <div class="kal-chipy">${TYPY.map(t2 => `<button type="button" class="kal-chip typ-${t2} aktywny" data-typ="${t2}">${ikona(t2)} <span>${h(nazwaTypu(t2).replace(/^[^\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+\s*/, ''))}</span></button>`).join('')}</div>
                <select class="kal-status" aria-label="${h(tx('status'))}">
                    <option value="all">${h(tx('all_status'))}</option>
                    <option value="planned">${h(tx('planned'))}</option>
                    <option value="done">${h(tx('done'))}</option>
                </select>
                <input type="search" class="kal-szukaj" placeholder="${h(tx('search_ph'))}" autocomplete="off">
            </div>
            <div class="kal-podsumowanie"></div>
            <div class="kal-widok" tabindex="0"></div>
            <div class="kal-szczegoly"></div>`;
        this.el = {
            tytul: r.querySelector('.kal-tytul'), widok: r.querySelector('.kal-widok'), szczegoly: r.querySelector('.kal-szczegoly'),
            podsumowanie: r.querySelector('.kal-podsumowanie'), status: r.querySelector('.kal-status'), szukaj: r.querySelector('.kal-szukaj')
        };
    };

    Kalendarz.prototype.podepnij = function () {
        const self = this, r = this.root;
        r.addEventListener('click', function (e) {
            const b = e.target.closest('[data-kal],[data-tryb],[data-typ],[data-dzien],[data-wyd],[data-dodaj],[data-ponow]');
            if (!b || !r.contains(b)) return;
            if (b.dataset.kal === 'prev') self.przesun(-1);
            else if (b.dataset.kal === 'next') self.przesun(1);
            else if (b.dataset.kal === 'today') { self.kursor = poczatekDnia(new Date()); self.wybranyDzien = klucz(self.kursor); self.kierunek = 0; self.odswiez(); }
            else if (b.dataset.tryb) { self.tryb = b.dataset.tryb; self.kierunek = 0; self.odswiez(); }
            else if (b.dataset.typ) {
                const t2 = b.dataset.typ;
                if (self.typy.has(t2)) { if (self.typy.size > 1) self.typy.delete(t2); } else self.typy.add(t2);
                self.render();
            }
            else if (b.dataset.dzien) { self.wybranyDzien = b.dataset.dzien; self.render(); self.el.szczegoly.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
            else if (b.dataset.wyd) { self.wybranyDzien = b.dataset.dzienwyd || self.wybranyDzien; self.render(b.dataset.wyd); }
            else if (b.dataset.dodaj) self.dodajWydarzenie(b.dataset.dodaj);
            else if (b.dataset.ponow) self.odswiez(true);
        });
        this.el.status.addEventListener('change', () => { self.status = self.el.status.value; self.render(); });
        let timer = null;
        this.el.szukaj.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { self.q = self.el.szukaj.value.trim().toLowerCase(); self.render(); }, 160); });

        // klawiatura: ← → zmiana okresu, T = dziś
        this.el.widok.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { self.przesun(-1); e.preventDefault(); }
            else if (e.key === 'ArrowRight') { self.przesun(1); e.preventDefault(); }
            else if (e.key === 't' || e.key === 'T') { self.kursor = poczatekDnia(new Date()); self.wybranyDzien = klucz(self.kursor); self.odswiez(); }
        });
        // przesunięcie palcem (dotyk)
        let x0 = null, y0 = null;
        this.el.widok.addEventListener('touchstart', (e) => { const p = e.touches[0]; x0 = p.clientX; y0 = p.clientY; }, { passive: true });
        this.el.widok.addEventListener('touchend', (e) => {
            if (x0 === null) return;
            const p = e.changedTouches[0], dx = p.clientX - x0, dy = p.clientY - y0; x0 = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) self.przesun(dx < 0 ? 1 : -1);
        }, { passive: true });
    };

    Kalendarz.prototype.przesun = function (kierunek) {
        this.kierunek = kierunek;
        if (this.tryb === 'week') this.kursor = dodajDni(this.kursor, 7 * kierunek);
        else this.kursor = new Date(this.kursor.getFullYear(), this.kursor.getMonth() + kierunek, 1);
        if (this.tryb !== 'week') this.wybranyDzien = klucz(this.kursor);
        this.odswiez();
    };

    Kalendarz.prototype.zakres = function () {
        if (this.tryb === 'week') { const s = poniedzialek(this.kursor); return [s, dodajDni(s, 7)]; }
        const p = new Date(this.kursor.getFullYear(), this.kursor.getMonth(), 1);
        if (this.tryb === 'list') return [p, new Date(p.getFullYear(), p.getMonth() + 1, 1)];
        const s = poniedzialek(p), k = new Date(p.getFullYear(), p.getMonth() + 1, 1);
        return [s, dodajDni(poniedzialek(dodajDni(k, -1)), 7)];
    };

    Kalendarz.prototype.odswiez = async function (wymus) {
        if (!this.root.isConnected) return;
        if (!wymus && this.root.offsetParent === null && this.dane.length) { this.nieaktualne = true; return; }   // ukryta zakładka — odświeżymy po pokazaniu
        this.nieaktualne = false;
        const moj = ++this.numer, [od, doo] = this.zakres(), kl = od.getTime() + '_' + doo.getTime();
        this.root.classList.add('kal-laduje');
        let dane = null;
        try {
            if (typeof supabaseClient === 'undefined') throw new Error('brak klienta');
            const wynik = await odczytajZBledem(supabaseClient.from('kalendarz').select('*')
                .gte('data_wydarzenia', od.toISOString()).lt('data_wydarzenia', doo.toISOString())
                .order('data_wydarzenia', { ascending: true }).limit(1500), 'kalendarz');
            dane = wynik && wynik.data;
            if (wynik && wynik.error) dane = null;
        } catch (e) { console.error('Kalendarz interaktywny:', e); dane = null; }
        if (moj !== this.numer) return;
        this.root.classList.remove('kal-laduje');
        if (dane === null) {
            if (this.cache.has(kl)) dane = this.cache.get(kl);
            else { this.dane = []; this.el.tytul.textContent = this.tytul(); this.el.widok.innerHTML = `<div class="kal-pusty">⚠️ ${h(tx('err'))} <button type="button" class="kal-btn" data-ponow="1">${h(tx('retry'))}</button></div>`; return; }
        } else this.cache.set(kl, dane);
        this.dane = dane;
        this.render();
    };

    Kalendarz.prototype.tytul = function () {
        const f = (o, d) => new Intl.DateTimeFormat(loc(), o).format(d);
        if (this.tryb === 'week') {
            const s = poniedzialek(this.kursor), k = dodajDni(s, 6);
            return f({ day: 'numeric', month: 'short' }, s) + ' – ' + f({ day: 'numeric', month: 'short', year: 'numeric' }, k);
        }
        return ucfirst(f({ month: 'long', year: 'numeric' }, this.kursor));
    };

    Kalendarz.prototype.przefiltrowane = function () {
        const teraz = Date.now(), q = this.q;
        return this.dane.map(w => Object.assign({}, w, { _st: status(w, teraz) })).filter(w => {
            if (!this.typy.has(w.typ)) return false;
            if (this.status === 'planned' && w._st === 'done') return false;
            if (this.status === 'done' && w._st !== 'done') return false;
            if (q && !((w.nazwa || '') + ' ' + nazwaTypu(w.typ) + ' ' + godz(w.data_wydarzenia)).toLowerCase().includes(q)) return false;
            return true;
        });
    };

    Kalendarz.prototype.chip = function (w, pelny) {
        const d = new Date(w.data_wydarzenia), dk = klucz(d);
        return `<button type="button" class="kal-wyd typ-${h(w.typ)} st-${w._st}" data-wyd="${h(w.id)}" data-dzienwyd="${dk}" title="${h(w.nazwa || nazwaTypu(w.typ))} — ${h(godz(w.data_wydarzenia))}">
            <span class="kal-wyd-ikona">${w._st === 'done' ? '✓' : ikona(w.typ)}</span><span class="kal-wyd-godz">${h(godz(w.data_wydarzenia))}</span>${pelny ? `<span class="kal-wyd-nazwa">${h(w.nazwa || nazwaTypu(w.typ))}</span>` : ''}</button>`;
    };

    Kalendarz.prototype.render = function (zaznaczWyd) {
        const lista = this.przefiltrowane(), tryb = this.tryb, teraz = new Date(), dzis = klucz(teraz);
        const po = {}; lista.forEach(w => { const k = klucz(new Date(w.data_wydarzenia)); (po[k] = po[k] || []).push(w); });
        this.el.tytul.textContent = this.tytul();
        this.root.querySelectorAll('[data-tryb]').forEach(b => b.classList.toggle('aktywny', b.dataset.tryb === tryb));
        this.root.querySelectorAll('[data-typ]').forEach(b => b.classList.toggle('aktywny', this.typy.has(b.dataset.typ)));
        const planned = lista.filter(w => w._st !== 'done').length, done = lista.length - planned;
        this.el.podsumowanie.innerHTML = `<span class="kal-licznik">${h(tx('summary', { p: planned, d: done, n: lista.length }))}</span>
            <span class="kal-legenda"><i class="typ-msza"></i>${h(nazwaTypu('msza').replace(/^\S+\s/, ''))} <i class="typ-nabozenstwo"></i>${h(nazwaTypu('nabozenstwo').replace(/^\S+\s/, ''))} <i class="typ-zbiorka"></i>${h(nazwaTypu('zbiorka').replace(/^\S+\s/, ''))} <i class="odbyte"></i>${h(tx('done'))}</span>`;

        const anim = this.kierunek > 0 ? 'kal-slide-lewo' : this.kierunek < 0 ? 'kal-slide-prawo' : 'kal-slide-gora';
        let html = '';
        if (tryb === 'month') {
            const [od] = this.zakres(), p = new Date(this.kursor.getFullYear(), this.kursor.getMonth(), 1);
            const tygodni = Math.ceil((((p.getDay() + 6) % 7) + new Date(p.getFullYear(), p.getMonth() + 1, 0).getDate()) / 7);
            const nazwyDni = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc(), { weekday: 'short' }).format(dodajDni(od, i)));
            html += `<div class="kal-siatka kal-miesiac">${nazwyDni.map((n, i) => `<div class="kal-dzien-nazwa${i > 4 ? ' weekend' : ''}">${h(ucfirst(n))}</div>`).join('')}`;
            for (let i = 0; i < tygodni * 7; i++) {
                const d = dodajDni(od, i), k = klucz(d), ev = po[k] || [], poza = d.getMonth() !== p.getMonth();
                const pokaz = ev.slice(0, 3);
                html += `<div class="kal-komorka${poza ? ' poza' : ''}${k === dzis ? ' dzis' : ''}${k === this.wybranyDzien ? ' wybrany' : ''}${(i % 7) > 4 ? ' weekend' : ''}${ev.length ? ' ma-wyd' : ''}" data-dzien="${k}" role="button" tabindex="0" style="--i:${i}">
                    <span class="kal-numer">${d.getDate()}</span>
                    <div class="kal-wyd-lista">${pokaz.map(w => this.chip(w, false)).join('')}${ev.length > 3 ? `<span class="kal-wiecej">${h(tx('more', { n: ev.length - 3 }))}</span>` : ''}</div>
                    ${ev.length ? `<span class="kal-kropki">${ev.slice(0, 5).map(w => `<i class="typ-${h(w.typ)}${w._st === 'done' ? ' odbyte' : ''}"></i>`).join('')}</span>` : ''}
                </div>`;
            }
            html += '</div>';
        } else if (tryb === 'week') {
            const s = poniedzialek(this.kursor);
            html += `<div class="kal-siatka kal-tydzien">`;
            for (let i = 0; i < 7; i++) {
                const d = dodajDni(s, i), k = klucz(d), ev = po[k] || [];
                html += `<div class="kal-kolumna${k === dzis ? ' dzis' : ''}${k === this.wybranyDzien ? ' wybrany' : ''}" style="--i:${i}">
                    <button type="button" class="kal-kolumna-glowa" data-dzien="${k}"><span>${h(ucfirst(new Intl.DateTimeFormat(loc(), { weekday: 'short' }).format(d)))}</span><b>${d.getDate()}</b></button>
                    <div class="kal-kolumna-tresc">${ev.length ? ev.map(w => this.chip(w, true)).join('') : '<span class="kal-pusto">—</span>'}</div></div>`;
            }
            html += '</div>';
        } else {
            const dni = Object.keys(po).sort();
            html += `<div class="kal-agenda">${dni.length ? dni.map((k, gi) => {
                const d = new Date(k + 'T12:00:00');
                return `<div class="kal-agenda-dzien${k === dzis ? ' dzis' : ''}" style="--i:${gi}"><div class="kal-agenda-data"><b>${d.getDate()}</b><span>${h(ucfirst(new Intl.DateTimeFormat(loc(), { weekday: 'long' }).format(d)))}</span></div>
                    <div class="kal-agenda-wyd">${po[k].map(w => this.chip(w, true)).join('')}</div></div>`;
            }).join('') : `<div class="kal-pusty">${h(tx('none'))}</div>`}</div>`;
        }
        this.el.widok.innerHTML = `<div class="kal-plansza ${anim}">${html}</div>`;
        this.kierunek = 0;
        // dostępność: Enter / spacja na komórce dnia
        this.el.widok.querySelectorAll('.kal-komorka').forEach(c => c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.click(); } }));
        this.renderSzczegoly(po, zaznaczWyd);
    };

    Kalendarz.prototype.renderSzczegoly = function (po, zaznaczWyd) {
        const k = this.wybranyDzien, ev = (po && po[k]) || [], d = new Date(k + 'T12:00:00');
        const tytul = ucfirst(new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d));
        const dodaj = (this.admin && typeof sesja !== 'undefined' && sesja) ? `<button type="button" class="btn btn-secondary kal-dodaj" data-dodaj="${k}">${h(tx('add_here'))}</button>` : '';
        const admin = (typeof sesja !== 'undefined' && sesja && (sesja.is_admin || sesja.is_moderator));   // v2.15.03: Ksiądz też edytuje i usuwa wydarzenia
        this.el.szczegoly.innerHTML = `<div class="kal-szcz-glowa"><strong>${h(tytul)}</strong>${k === klucz(new Date()) ? ` <span class="kal-znaczek-dzis">${h(tx('today_marker'))}</span>` : ''}</div>
            ${ev.length ? ev.map((w, i) => {
                const st = w._st, etykietaSt = st === 'done' ? tx('done') : st === 'live' ? tx('live') : tx('planned');
                const okno = (w.okno_start && w.okno_koniec) ? `<div class="kal-szcz-meta">🕒 ${h(tx('window'))}: ${h(godz(w.okno_start))}–${h(godz(w.okno_koniec))}</div>` : '';
                return `<div class="kal-karta typ-${h(w.typ)} st-${st}${String(w.id) === String(zaznaczWyd) ? ' zaznaczone' : ''}" style="--i:${i}">
                    <div class="kal-karta-gora"><span class="kal-karta-ikona">${ikona(w.typ)}</span><div><b>${h(w.nazwa || nazwaTypu(w.typ))}${w.polaczone_id ? ' 🔗' : ''}</b>
                    <div class="kal-szcz-meta">${h(nazwaTypu(w.typ))} · ${h(godz(w.data_wydarzenia))}</div></div><span class="kal-stan st-${st}">${h(etykietaSt)}</span></div>
                    ${okno}${w.polaczone_id ? `<div class="kal-szcz-meta">🔗 ${h(tx('block'))}</div>` : ''}
                    ${admin ? `<div class="kal-karta-akcje"><button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="cal-edytuj" data-id="${h(w.id)}">✏️ ${h((typeof t === 'function') ? t('cal.act_edit') : 'Edytuj')}</button>
                    <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="cal-nazwa" data-id="${h(w.id)}" data-nazwa="${h(w.nazwa)}">${h((typeof t === 'function') ? t('cal.act_rename') : '✏️')}</button>
                    <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="cal-usun" data-id="${h(w.id)}">${h((typeof t === 'function') ? t('cal.act_delete') : '🗑')}</button></div>` : ''}
                </div>`;
            }).join('') : `<div class="kal-pusty">${h(tx('none_day'))}</div>`}
            ${dodaj}`;
        if (zaznaczWyd) {
            const el = this.el.szczegoly.querySelector('.zaznaczone');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    };

    Kalendarz.prototype.dodajWydarzenie = function (dzien) {
        const pole = document.getElementById('nowe-data');
        if (!pole) return;
        const stare = pole.value || '', godzina = /T(\d\d:\d\d)/.test(stare) ? stare.match(/T(\d\d:\d\d)/)[1] : '18:00';
        pole.value = dzien + 'T' + godzina;
        pole.dispatchEvent(new Event('change', { bubbles: true }));
        const cel = document.getElementById('nowe-typ') || pole;
        cel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { try { cel.focus({ preventScroll: true }); } catch (e) { /* ignore */ } cel.classList.add('em-blysk-pola'); setTimeout(() => cel.classList.remove('em-blysk-pola'), 1400); }, 350);
    };

    // API globalne
    window.kalInt = {
        odswiez: function () { instancje.forEach(k => { k.cache.clear(); k.odswiez(true); }); },
        instancje: instancje
    };

    function zamontuj(id, opcje) {
        const el = document.getElementById(id);
        if (el && !el._kal) { el._kal = new Kalendarz(el, opcje); instancje.push(el._kal); }
    }
    function start() {
        zamontuj('kal-int-admin', { admin: true });
        zamontuj('kal-int-ministrant', { admin: false });
        // gdy ukryta karta/zakładka zostanie pokazana — dociągnij dane i odśwież (zmiana klasy .hidden)
        const obs = new MutationObserver(() => instancje.forEach(k => { if (k.root.offsetParent !== null && k.nieaktualne) k.odswiez(true); }));
        ['widok-ministrant', 'widok-admin', 'tab-content-kalendarz'].forEach(id => { const e = document.getElementById(id); if (e) obs.observe(e, { attributes: true, attributeFilter: ['class'] }); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) instancje.forEach(k => { if (k.root.offsetParent !== null) k.odswiez(true); }); });
        // zmiana języka — przebuduj
        document.addEventListener('click', (e) => {
            if (e.target.closest && e.target.closest('[data-jezyk-switch] *')) setTimeout(() => instancje.forEach(k => { k.zbuduj(); k.render(); }), 250);
        });
        // odświeżanie co 5 minut (widoczne instancje) — status „odbyte / trwa teraz” zmienia się z czasem
        setInterval(() => instancje.forEach(k => { if (k.root.offsetParent !== null) k.render(); }), 60000);
        setInterval(() => instancje.forEach(k => { if (k.root.offsetParent !== null) { k.cache.clear(); k.odswiez(true); } }), 300000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

    // ------------------------------------------------------------------ SORTOWANIE I FILTROWANIE TABEL ----
    const MIN_WIERSZY_NARZEDZI = 6;       // pasek filtra pojawia się, gdy tabela ma co najmniej tyle wierszy (lub filtr jest aktywny)
    let wTrakcie = false;

    function typKomorki(txt) {
        const s = String(txt).trim();
        if (!s) return { t: 'e', v: '' };
        let m = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);       // 25.10.2026, 18:00
        if (m) return { t: 'd', v: new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime() };
        m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);                                   // 2026-10-25 18:00
        if (m) return { t: 'd', v: new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)).getTime() };
        m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?/i);   // 10/25/2026, 6:00 PM
        if (m) { let hh = +(m[4] || 0); if (m[6]) { hh = hh % 12 + (/pm/i.test(m[6]) ? 12 : 0); } return { t: 'd', v: new Date(+m[3], +m[1] - 1, +m[2], hh, +(m[5] || 0)).getTime() }; }
        m = s.match(/^([+\-−]?\s?\d+(?:[.,]\d+)?)(?:\s*(?:pkt|pts|p\.|%|min|szt\.?|x))?$/i);                  // 12, 1,5, +3 pkt, 80%
        if (m) return { t: 'n', v: parseFloat(m[1].replace('−', '-').replace(/\s/g, '').replace(',', '.')) };
        return { t: 's', v: s.toLocaleLowerCase(loc()) };
    }
    function wartosc(td) {
        if (!td) return { t: 'e', v: '' };
        if (td.dataset && td.dataset.sort !== undefined) return typKomorki(td.dataset.sort);
        return typKomorki(td.textContent.replace(/\s+/g, ' '));
    }
    function porownaj(a, b) {
        if (a.t === 'e' && b.t === 'e') return 0;
        if (a.t === 'e') return 1;           // puste zawsze na końcu
        if (b.t === 'e') return -1;
        if ((a.t === 'n' || a.t === 'd') && a.t === b.t) return a.v - b.v;
        return String(a.v).localeCompare(String(b.v), loc(), { numeric: true, sensitivity: 'base' });
    }
    function czyWierszDanych(tr, kolumny) {
        if (tr.cells.length === 1 && tr.cells[0].colSpan > 1) return false;     // komunikat „brak danych” / „błąd”
        return tr.cells.length >= Math.min(2, kolumny || 2);
    }

    function przygotujTabele(tab) {
        if (tab._emNarz || tab.dataset.bezNarzedzi !== undefined) return;
        const id = tab.id || '';
        if (!/^(tabela-|mm-)/.test(id)) return;
        const tbody = tab.tBodies[0]; if (!tbody) return;
        tab._emNarz = { kol: -1, kier: 1, q: '', obs: null, toolbar: null };
        const st = tab._emNarz;
        const wiersze0 = () => Array.from(tbody.rows);

        // pasek narzędzi (filtr + licznik)
        const opakowanie = (tab.parentElement && tab.parentElement.classList.contains('tabela-przewijana')) ? tab.parentElement : tab;
        const bar = document.createElement('div');
        bar.className = 'tabela-narzedzia'; bar.hidden = true;
        bar.innerHTML = `<input type="search" class="tabela-filtr" placeholder="${h(tx('filter_ph'))}" aria-label="${h(tx('filter_ph'))}" autocomplete="off">
            <span class="tabela-licznik"></span><button type="button" class="kal-btn tabela-wyczysc" hidden>${h(tx('clear'))}</button>`;
        opakowanie.parentElement.insertBefore(bar, opakowanie);
        st.toolbar = bar;
        const inp = bar.querySelector('.tabela-filtr'), lic = bar.querySelector('.tabela-licznik'), wyczysc = bar.querySelector('.tabela-wyczysc');
        let timer = null;
        inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = inp.value.trim().toLocaleLowerCase(loc()); zastosuj(); }, 140); });
        wyczysc.addEventListener('click', () => { inp.value = ''; st.q = ''; zastosuj(); inp.focus(); });

        // sortowanie po kliknięciu nagłówka
        const naglowki = () => (tab.tHead && tab.tHead.rows.length) ? Array.from(tab.tHead.rows[tab.tHead.rows.length - 1].cells) : [];
        if (tab.tHead) {
            tab.tHead.addEventListener('click', (e) => {
                const th = e.target.closest('th'); if (!th || th.classList.contains('admin-only-akcja') || th.dataset.bezSortu !== undefined) return;
                const idx = naglowki().indexOf(th); if (idx < 0 || st.blokadaSortu) return;
                if (st.kol === idx) st.kier = -st.kier; else { st.kol = idx; st.kier = 1; }
                zastosuj();
            });
            tab.tHead.title = tx('sort_hint');
        }

        function zastosuj() {
            if (wTrakcie) return; wTrakcie = true;
            try {
                const ths = naglowki(), kol = ths.length;
                const wiersze = wiersze0();
                const dane = wiersze.filter(tr => czyWierszDanych(tr, kol));
                // tabele z wierszami „szczegółów” (pojedyncza komórka colspan między wierszami danych) — nie przestawiamy
                const maSzczegoly = wiersze.some(tr => tr.cells.length === 1 && tr.cells[0].colSpan > 1) && dane.length > 0 && wiersze.length > dane.length;
                st.blokadaSortu = maSzczegoly;

                // sortowanie
                if (!maSzczegoly && st.kol >= 0 && st.kol < kol && dane.length > 1) {
                    const klucze = new Map(dane.map(tr => [tr, wartosc(tr.cells[st.kol])]));
                    const posortowane = dane.map((tr, i) => ({ tr, i })).sort((x, y) => (porownaj(klucze.get(x.tr), klucze.get(y.tr)) * st.kier) || (x.i - y.i)).map(o => o.tr);
                    const komunikaty = wiersze.filter(tr => !dane.includes(tr));
                    posortowane.forEach(tr => tbody.appendChild(tr));
                    komunikaty.forEach(tr => tbody.appendChild(tr));
                }
                // strzałki w nagłówkach (atrybut — przetrwa zmianę języka)
                ths.forEach((th, i) => { if (i === st.kol && !maSzczegoly) th.setAttribute('data-em-sort', st.kier > 0 ? 'asc' : 'desc'); else th.removeAttribute('data-em-sort'); th.classList.toggle('em-sortowalna', !maSzczegoly && !th.classList.contains('admin-only-akcja')); });

                // filtrowanie
                let widoczne = 0, ostatniaWidoczna = true, i = 0;
                Array.from(tbody.rows).forEach(tr => {
                    const jestDanych = czyWierszDanych(tr, kol);
                    let pokaz;
                    if (!jestDanych) pokaz = (tr.cells.length === 1 && tr.cells[0].colSpan > 1 && dane.length) ? ostatniaWidoczna : true;
                    else { pokaz = !st.q || tr.textContent.toLocaleLowerCase(loc()).includes(st.q); ostatniaWidoczna = pokaz; }
                    tr.hidden = !pokaz;
                    if (pokaz && jestDanych) { widoczne++; tr.style.setProperty('--em-i', String(Math.min(i++, 18))); }
                });
                // pasek narzędzi
                bar.hidden = !(dane.length >= MIN_WIERSZY_NARZEDZI || st.q);
                lic.textContent = tx('rows', { a: widoczne, b: dane.length });
                wyczysc.hidden = !st.q;
                tab.classList.toggle('em-brak-wynikow', !!st.q && widoczne === 0 && dane.length > 0);
            } finally { wTrakcie = false; }
        }
        st.zastosuj = zastosuj;

        // odśwież po zmianie zawartości tabeli (np. po pobraniu nowych danych z serwera)
        let rafId = 0;
        st.obs = new MutationObserver(() => { if (wTrakcie) return; cancelAnimationFrame(rafId); rafId = requestAnimationFrame(zastosuj); });
        st.obs.observe(tbody, { childList: true });
        zastosuj();
    }

    function przejrzyjTabele() { document.querySelectorAll('table[id]').forEach(przygotujTabele); }
    function startTabel() {
        przejrzyjTabele();
        // tabele tworzone później (np. po zalogowaniu) — przeglądamy dokument rzadko i tanio
        let czeka = false;
        new MutationObserver(() => { if (czeka) return; czeka = true; setTimeout(() => { czeka = false; przejrzyjTabele(); }, 400); })
            .observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startTabel); else startTabel();

    // Audyt: lista wierszy aktualnie widocznych (po filtrze i sortowaniu) — używana przez eksport CSV
    window.audytWidoczne = function (wszystkie) {
        const tab = document.getElementById('tabela-audyt'); if (!tab || !tab.tBodies[0]) return wszystkie;
        const wynik = [];
        Array.from(tab.tBodies[0].rows).forEach(tr => { if (!tr.hidden && tr.dataset.i !== undefined && wszystkie[Number(tr.dataset.i)]) wynik.push(wszystkie[Number(tr.dataset.i)]); });
        return wynik.length || !wszystkie.length ? wynik : wszystkie;
    };
})();
