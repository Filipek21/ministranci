// ============================================================================
// v2.12 — NARZĘDZIA ADMINA + ZDALNE STEROWANIE KIOSKIEM (panel)
//   • zakładka „Narzędzia”: Stan bazy (samotest), spójność punktów, duplikaty kont, awaryjna blokada Kiosku,
//     eksport / import całej bazy,
//   • przycisk „🎛 Steruj” w zakładce Kioski: ponad 12 poleceń wysyłanych do Kiosku na żywo.
// Serwer: sql/24–26.
// ============================================================================

const nar = {
    ok: (el, tekst) => { el.style.color = 'var(--ok)'; el.textContent = '✅ ' + tekst; },
    err: (el, tekst) => { el.style.color = 'var(--err)'; el.textContent = '❌ ' + tekst; },
    brak: (w) => brakFunkcjiSerwera(w)
};
function narBlad(w) { return nar.brak(w) ? t('nar.need_sql') : blad(w); }
const narIkona = { ok: '✅', blad: '❌', ostrzezenie: '⚠️' };

async function odswiezNarzedzia() {
    if (!sesja || !sesja.is_admin) return;
    await odswiezBlokadyKiosku();
}

// ----------------------------------------------------------------- 1. STAN BAZY (samotest) --
$('btn-nar-stan').addEventListener('click', async () => {
    const st = $('nar-stan-status'), wynik = $('nar-stan-wynik');
    st.style.color = ''; st.textContent = '⏳ ' + t('nar.running'); wynik.innerHTML = '';
    const w = await wywolajRPC('admin_stan_bazy', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin });
    if (!w.sukces) { nar.err(st, narBlad(w)); return; }
    const lista = w.sprawdzenia || [];
    const bledy = lista.filter(x => x.status === 'blad'), ostrz = lista.filter(x => x.status === 'ostrzezenie');
    if (bledy.length) nar.err(st, t('nar.state_bad', { n: bledy.length, w: ostrz.length }));
    else if (ostrz.length) { st.style.color = 'var(--warn, #fbbf24)'; st.textContent = '⚠️ ' + t('nar.state_warn', { n: ostrz.length }); }
    else nar.ok(st, t('nar.state_ok', { n: lista.length }));
    const grupy = {};
    lista.forEach(x => { (grupy[x.grupa] = grupy[x.grupa] || []).push(x); });
    wynik.innerHTML = Object.keys(grupy).map(g => `
        <h5 style="margin:10px 0 4px;">${esc(g)}</h5>
        <table><tbody>${grupy[g].map(x => `<tr><td style="width:2em">${narIkona[x.status] || '•'}</td><td>${esc(x.nazwa)}</td>
            <td style="color:var(--text-dim); font-size:0.9rem;">${esc(x.info || '')}${x.plik ? ` — <b>${esc(t('nar.run_file', { plik: x.plik }))}</b>` : ''}</td></tr>`).join('')}</tbody></table>`).join('');
});

// ----------------------------------------------------------------- 2. SPÓJNOŚĆ PUNKTÓW --
let narSpojnosc = null;
async function narSprawdzSpojnosc() {
    const st = $('nar-spoj-status'), wynik = $('nar-spoj-wynik');
    st.style.color = ''; st.textContent = '⏳ ' + t('nar.running');
    const w = await wywolajRPC('admin_spojnosc_punktow', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin });
    if (!w.sukces) { nar.err(st, narBlad(w)); wynik.innerHTML = ''; return; }
    narSpojnosc = w;
    if (w.ok) { nar.ok(st, t('nar.spoj_ok')); wynik.innerHTML = ''; return; }
    st.style.color = 'var(--warn, #fbbf24)';
    st.textContent = '⚠️ ' + t('nar.spoj_issues', { a: w.rozbiezne.length, b: w.duplikaty.length, c: w.osierocone.length, d: w.ujemne.length });
    wynik.innerHTML = (w.rozbiezne.length ? `
        <h5>${esc(t('nar.spoj_diff'))}</h5>
        <div class="tabela-przewijana"><table><thead><tr><th>${esc(t('lst.col_code'))}</th><th>${esc(t('lst.col_who'))}</th><th>${esc(t('nar.col_att'))}</th><th>${esc(t('nar.col_ledger'))}</th><th>Δ</th></tr></thead>
        <tbody>${w.rozbiezne.map(r => `<tr><td>${esc(r.kod)}</td><td>${esc(r.imie)} ${esc(r.nazwisko)}</td><td>${esc(r.obecnosci)}</td><td>${esc(r.ksiega)}</td><td>${esc(r.roznica)}</td></tr>`).join('')}</tbody></table></div>
        <button class="btn btn-secondary" style="width:auto" data-akcja="nar-napraw" data-a="wyrownaj_ksiege">${esc(t('nar.fix_ledger'))}</button>` : '')
      + (w.duplikaty.length ? `<h5>${esc(t('nar.spoj_dupl', { n: w.duplikaty.length }))}</h5>
        <button class="btn btn-secondary" style="width:auto" data-akcja="nar-napraw" data-a="usun_duplikaty">${esc(t('nar.fix_dupl'))}</button>` : '')
      + (w.osierocone.length ? `<h5>${esc(t('nar.spoj_orphans', { n: w.osierocone.length }))}</h5>
        <button class="btn btn-secondary" style="width:auto" data-akcja="nar-napraw" data-a="usun_osierocone">${esc(t('nar.fix_orphans'))}</button>` : '')
      + (w.ujemne.length ? `<h5>${esc(t('nar.spoj_neg', { n: w.ujemne.length }))}</h5>` : '');
}
$('btn-nar-spoj').addEventListener('click', narSprawdzSpojnosc);
AKCJE['nar-napraw'] = async (d) => {
    if (!confirm(t('nar.fix_confirm'))) return;
    const st = $('nar-spoj-status');
    const w = await wywolajRPC('admin_napraw_spojnosc', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_akcja: d.a, p_ministrant_id: null });
    if (!w.sukces) { nar.err(st, narBlad(w)); return; }
    await narSprawdzSpojnosc();
    const st2 = $('nar-spoj-status');
    st2.textContent = '✅ ' + t('nar.fixed', { n: w.liczba }) + ' ' + st2.textContent;
};

// ----------------------------------------------------------------- 3. DUPLIKATY KONT --
let narGrupy = [];
$('btn-nar-dupl').addEventListener('click', async () => {
    const st = $('nar-dupl-status'), wynik = $('nar-dupl-wynik');
    st.style.color = ''; st.textContent = '⏳ ' + t('nar.running');
    const w = await wywolajRPC('admin_duplikaty_kont', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin });
    if (!w.sukces) { nar.err(st, narBlad(w)); return; }
    narGrupy = w.grupy || [];
    if (!narGrupy.length) { nar.ok(st, t('nar.dupl_none')); wynik.innerHTML = ''; return; }
    st.style.color = 'var(--warn, #fbbf24)'; st.textContent = '⚠️ ' + t('nar.dupl_found', { n: narGrupy.length });
    wynik.innerHTML = narGrupy.map((g, gi) => {
        const najlepsze = g.konta.slice().sort((a, b) => (b.aktywny - a.aktywny) || (b.obecnosci - a.obecnosci))[0];
        return `<div class="card" style="margin:8px 0; padding:10px;">
            <div style="color:var(--text-dim); font-size:0.85rem;">${esc(t('nar.dupl_pick'))}</div>
            ${g.konta.map(k => `<label style="display:flex; gap:8px; align-items:center; margin:4px 0;">
                <input type="radio" name="dupl-cel-${gi}" value="${esc(k.id)}" ${k.id === najlepsze.id ? 'checked' : ''} style="width:auto; margin:0;">
                <span>${esc(k.kod)} — ${esc(k.imie)} ${esc(k.nazwisko)} · ${esc(t('nar.col_att'))}: ${esc(k.obecnosci)} · ${esc(k.punkty)} pkt${k.aktywny ? '' : ' · ' + esc(t('common.inactive'))}${k.is_admin ? ' · Admin' : ''}</span></label>`).join('')}
            <button class="btn btn-warn" style="width:auto; margin-top:6px;" data-akcja="nar-scal" data-g="${gi}">${esc(t('nar.merge_btn'))}</button></div>`;
    }).join('');
});
AKCJE['nar-scal'] = async (d) => {
    const g = narGrupy[Number(d.g)];
    if (!g) return;
    const cel = document.querySelector(`input[name="dupl-cel-${d.g}"]:checked`);
    if (!cel) return;
    const zrodla = g.konta.filter(k => k.id !== cel.value && k.aktywny && !k.is_admin);
    if (!zrodla.length) { alert(t('nar.merge_nothing')); return; }
    if (!confirm(t('nar.merge_confirm', { n: zrodla.length }))) return;
    const st = $('nar-dupl-status');
    let przen = 0, kol = 0;
    for (const z of zrodla) {
        const w = await wywolajRPC('admin_scal_konta', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_zrodlo_id: z.id, p_cel_id: cel.value });
        if (!w.sukces) { nar.err(st, narBlad(w)); return; }
        przen += w.przeniesione; kol += w.kolidujace;
    }
    nar.ok(st, t('nar.merged', { a: przen, b: kol }));
    $('btn-nar-dupl').click();
};

// ----------------------------------------------------------------- 4. AWARYJNA BLOKADA KIOSKU --
async function odswiezBlokadyKiosku() {
    const sel = $('nar-blokada-kiosk');
    const wybrany = sel.value;
    const lk = await wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin });
    const kioski = lk.sukces ? (lk.dane || []) : [];
    sel.innerHTML = `<option value="*">${esc(t('nar.lock_all'))}</option>` + kioski.map(k => `<option value="${esc(k.kiosk_id)}">${esc(k.nazwa || k.kiosk_id)}</option>`).join('');
    if (wybrany) sel.value = wybrany;
    const tbody = document.querySelector('#tabela-nar-blokady tbody');
    const w = await wywolajRPC('admin_kiosk_blokady_lista', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin });
    if (!w.sukces) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--err)">❌ ${esc(narBlad(w))}</td></tr>`; return; }
    tbody.innerHTML = (w.dane || []).map(b => `<tr>
        <td>${b.trwa ? '⛔' : '—'}</td><td>${esc(b.kiosk_id === '*' ? t('nar.lock_all') : b.kiosk_id)}</td>
        <td style="font-size:0.85rem;">${esc(formatDataCzas(b.od))}</td><td style="font-size:0.85rem;">${b.do_kiedy ? esc(formatDataCzas(b.do_kiedy)) : esc(t('nar.lock_until_revoked'))}</td>
        <td>${esc(b.powod || '')}</td>
        <td>${b.trwa ? `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="nar-odblokuj" data-id="${esc(b.id)}">✅ ${esc(t('nar.unlock'))}</button>` : esc(b.zdjal || '')}</td></tr>`).join('')
        || `<tr><td colspan="6" style="color:var(--text-dim)">${esc(t('nar.lock_none'))}</td></tr>`;
}
$('btn-nar-zablokuj').addEventListener('click', async () => {
    const st = $('nar-blokada-status');
    const kiosk = $('nar-blokada-kiosk').value;
    const minuty = $('nar-blokada-czas').value === '' ? null : parseInt($('nar-blokada-czas').value, 10);
    if (!confirm(t('nar.lock_confirm', { cel: kiosk === '*' ? t('nar.lock_all') : kiosk }))) return;
    const w = await wywolajRPC('admin_kiosk_blokada_ustaw', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kiosk_id: kiosk, p_minuty: minuty, p_powod: $('nar-blokada-powod').value.trim() || null });
    if (!w.sukces) { nar.err(st, narBlad(w)); return; }
    nar.ok(st, t('nar.lock_set'));
    await odswiezBlokadyKiosku();
});
AKCJE['nar-odblokuj'] = async (d) => {
    const w = await wywolajRPC('admin_kiosk_blokada_zdejmij', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: Number(d.id), p_kiosk_id: null });
    const st = $('nar-blokada-status');
    if (w.sukces) nar.ok(st, t('nar.unlocked')); else nar.err(st, narBlad(w));
    await odswiezBlokadyKiosku();
};
$('btn-nar-odblokuj-wszystkie').addEventListener('click', async () => {
    const w = await wywolajRPC('admin_kiosk_blokada_zdejmij', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: null, p_kiosk_id: null });
    const st = $('nar-blokada-status');
    if (w.sukces) nar.ok(st, t('nar.unlocked')); else nar.err(st, narBlad(w));
    await odswiezBlokadyKiosku();
});

// ----------------------------------------------------------------- 5. EKSPORT / IMPORT BAZY --
let narPlikKopii = null;
$('btn-nar-eksport').addEventListener('click', async () => {
    const st = $('nar-baza-status');
    st.style.color = ''; st.textContent = '⏳ ' + t('nar.running');
    const zHaszami = $('nar-z-haszami').checked;
    if (zHaszami && !confirm(t('nar.export_hash_warn'))) { st.textContent = ''; return; }
    const w = await wywolajRPC('admin_eksport_bazy', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_z_haszami: zHaszami });
    if (!w.sukces) { nar.err(st, narBlad(w)); return; }
    pobierzBlob(new Blob([JSON.stringify(w, null, 1)], { type: 'application/json' }), `kopia-bazy-${dataDoNazwyPliku()}.json`);
    nar.ok(st, t('nar.exported', { n: Object.values(w.liczby || {}).reduce((a, b) => a + b, 0) }));
});
$('nar-plik-kopii').addEventListener('change', async (e) => {
    const st = $('nar-baza-status');
    const plik = e.target.files[0];
    narPlikKopii = null;
    if (!plik) return;
    try {
        const json = JSON.parse(await plik.text());
        if (!json || !json.tabele) throw new Error(t('nar.import_bad_file'));
        narPlikKopii = json;
        nar.ok(st, t('nar.import_loaded', { n: Object.keys(json.tabele).length }));
    } catch (er) { nar.err(st, er.message || t('nar.import_bad_file')); }
});
async function narImport(proba) {
    const st = $('nar-baza-status'), wynik = $('nar-import-wynik');
    if (!narPlikKopii) { nar.err(st, t('nar.import_need_file')); return; }
    if (!proba && !confirm(t('nar.import_confirm'))) return;
    st.style.color = ''; st.textContent = '⏳ ' + t('nar.running');
    const w = await wywolajRPC('admin_import_bazy', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dane: narPlikKopii, p_tryb: $('nar-import-tryb').value, p_proba: proba });
    if (!w.sukces) { nar.err(st, narBlad(w)); return; }
    nar.ok(st, proba ? t('nar.import_dry') : t('nar.import_done'));
    wynik.innerHTML = `<table><thead><tr><th>${esc(t('nar.col_table'))}</th><th>${esc(t('nar.col_new'))}</th><th>${esc(t('nar.col_existing'))}</th><th>${esc(t('nar.col_saved'))}</th></tr></thead><tbody>`
        + Object.entries(w.tabele || {}).map(([n, r]) => `<tr><td>${esc(n)}</td>${r.blad ? `<td colspan="3" style="color:var(--err)">${esc(r.blad)}</td>` : `<td>${esc(r.nowe)}</td><td>${esc(r.istniejace)}</td><td>${esc(r.zapisano)}</td>`}</tr>`).join('')
        + '</tbody></table>';
}
$('btn-nar-import-proba').addEventListener('click', () => narImport(true));
$('btn-nar-import-wykonaj').addEventListener('click', () => narImport(false));

// ================================================================== ZDALNE STEROWANIE KIOSKIEM ====
// {typ, ikona, klucz tłumaczenia, parametry (opcjonalnie prompt)}
const POLECENIA_KIOSKU = [
    { typ: 'ping',              ikona: '📡', k: 'ster.ping' },
    { typ: 'diagnostyka',       ikona: '🩺', k: 'ster.diag' },
    { typ: 'odswiez',           ikona: '🔄', k: 'ster.reload' },
    { typ: 'synchronizuj',      ikona: '🔁', k: 'ster.sync' },
    { typ: 'pobierz_cache',     ikona: '⬇️', k: 'ster.cache_pull' },
    { typ: 'wyczysc_cache',     ikona: '🧹', k: 'ster.cache_clear', potwierdz: true },
    { typ: 'wymus_aktualizacje', ikona: '⬆️', k: 'ster.update' },
    { typ: 'komunikat',         ikona: '📢', k: 'ster.msg' },
    { typ: 'schowaj_komunikat', ikona: '🙈', k: 'ster.msg_hide' },
    { typ: 'jezyk', ikona: '🇵🇱', k: 'ster.lang_pl', parametry: { jezyk: 'pl' } },
    { typ: 'jezyk', ikona: '🇬🇧', k: 'ster.lang_en', parametry: { jezyk: 'en' } },
    { typ: 'jezyk', ikona: '🇺🇦', k: 'ster.lang_uk', parametry: { jezyk: 'uk' } },
    { typ: 'test_skanera',      ikona: '🔫', k: 'ster.test_scanner' },
    { typ: 'restart_skanera',   ikona: '⌨️', k: 'ster.restart_scanner' },
    { typ: 'test_kamery',       ikona: '📷', k: 'ster.test_camera' },
    { typ: 'blokada',           ikona: '⛔', k: 'ster.lock' },
    { typ: 'odblokuj',          ikona: '✅', k: 'ster.unlock' }
];
let sterowanieKioski = [];

function wynikDoHtml(wynik) {
    if (!wynik || typeof wynik !== 'object') return '';
    return '<table><tbody>' + Object.entries(wynik).map(([k, v]) =>
        `<tr><td style="color:var(--text-dim); padding-right:10px;">${esc(k)}</td><td>${esc(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))}</td></tr>`).join('') + '</tbody></table>';
}

async function wyslijPolecenie(kioskId, nazwa, typ, parametry, wynikEl) {
    const w = await wywolajRPC('admin_kiosk_polecenie', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kiosk_id: kioskId, p_typ: typ, p_parametry: parametry || {} });
    if (!w.sukces) { wynikEl.innerHTML += `<div style="color:var(--err)">❌ ${esc(nazwa)}: ${esc(narBlad(w))}</div>`; return; }
    const start = performance.now();
    let st = null;
    while (performance.now() - start < 25000) {
        await new Promise(r => setTimeout(r, 700));
        if (!$('modal-sterowanie')) return;
        st = await wywolajRPC('admin_kiosk_polecenie_status', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: w.polecenie_id });
        if (st.sukces && st.wykonano) break;
    }
    if (st && st.sukces && st.wykonano) {
        wynikEl.innerHTML += `<div style="margin-top:8px;"><b style="color:var(--ok)">✅ ${esc(nazwa)} — ${esc(typ)} (${esc(st.czas_ms)} ms)</b>${wynikDoHtml(st.wynik)}</div>`;
    } else {
        wynikEl.innerHTML += `<div style="margin-top:8px; color:var(--err)">❌ ${esc(nazwa)} — ${esc(typ)}: ${esc(t('ster.no_answer'))}</div>`;
    }
}

AKCJE['kiosk-steruj'] = async (d) => {
    if (!sesja || !sesja.is_admin) { alert(t('sec.admin_only')); return; }
    const nazwa = d.nazwa || d.id;
    const lk = await wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin });
    sterowanieKioski = lk.sukces ? (lk.dane || []).map(k => k.kiosk_id) : [d.id];
    let m = $('modal-sterowanie'); if (m) m.remove();
    m = document.createElement('div');
    m.id = 'modal-sterowanie';
    m.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; display:flex; align-items:center; justify-content:center; padding:16px;';
    m.innerHTML = `<div class="card" style="max-width:560px; width:100%; max-height:92vh; overflow:auto; margin:0;">
        <div class="top-bar"><h3>🎛 ${esc(t('ster.title', { nazwa }))}</h3><a href="#" id="ster-zamknij">${esc(t('common.close'))} ✕</a></div>
        <label style="display:flex; gap:8px; align-items:center; margin:6px 0;"><input type="checkbox" id="ster-wszystkie" style="width:auto; margin:0;"> ${esc(t('ster.all', { n: sterowanieKioski.length }))}</label>
        <div id="ster-przyciski" style="display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:8px; margin:10px 0;"></div>
        <div id="ster-wynik" style="margin-top:8px; font-size:0.92rem;"></div>
        <h4 style="margin-top:14px;">${esc(t('ster.history'))}</h4>
        <div class="tabela-przewijana"><table id="tabela-ster-historia"><tbody></tbody></table></div></div>`;
    document.body.appendChild(m);
    const zamknij = (e) => { if (e) e.preventDefault(); m.remove(); };
    $('ster-zamknij').addEventListener('click', zamknij);
    m.addEventListener('click', (e) => { if (e.target === m) zamknij(); });

    $('ster-przyciski').innerHTML = POLECENIA_KIOSKU.map((p, i) =>
        `<button class="btn btn-secondary" style="margin:0; padding:10px 8px;" data-ster="${i}">${p.ikona} ${esc(t(p.k))}</button>`).join('');
    $('ster-przyciski').addEventListener('click', async (e) => {
        const b = e.target.closest('[data-ster]');
        if (!b) return;
        const p = POLECENIA_KIOSKU[Number(b.dataset.ster)];
        const cele = $('ster-wszystkie').checked ? sterowanieKioski : [d.id];
        const wynikEl = $('ster-wynik');
        if (p.potwierdz && !confirm(t('ster.confirm_generic'))) return;
        let parametry = p.parametry || {};
        if (p.typ === 'komunikat') {
            const tekst = prompt(t('ster.msg_prompt'));
            if (!tekst || !tekst.trim()) return;
            const sek = parseInt(prompt(t('ster.msg_seconds'), '60'), 10);
            parametry = { tekst: tekst.trim(), sekundy: isNaN(sek) ? 60 : sek };
        }
        if (p.typ === 'blokada') {   // blokada awaryjna z okna sterowania: minuty (puste = do odwołania) + powód
            const czas = prompt(t('ster.lock_minutes'), '30');
            if (czas === null) return;
            const powod = prompt(t('ster.lock_reason'), t('ster.lock_reason_default')) || '';
            const kiosk = $('ster-wszystkie').checked ? '*' : d.id;
            const w = await wywolajRPC('admin_kiosk_blokada_ustaw', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kiosk_id: kiosk, p_minuty: czas.trim() === '' ? null : parseInt(czas, 10), p_powod: powod.trim() || null });
            wynikEl.innerHTML += w.sukces ? `<div style="color:var(--ok)">⛔ ${esc(t('nar.lock_set'))}</div>` : `<div style="color:var(--err)">❌ ${esc(narBlad(w))}</div>`;
            return;
        }
        if (p.typ === 'odblokuj') {
            const w = await wywolajRPC('admin_kiosk_blokada_zdejmij', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: null, p_kiosk_id: $('ster-wszystkie').checked ? null : d.id });
            wynikEl.innerHTML += w.sukces ? `<div style="color:var(--ok)">✅ ${esc(t('nar.unlocked'))}</div>` : `<div style="color:var(--err)">❌ ${esc(narBlad(w))}</div>`;
            return;
        }
        if (p.typ === 'ping') { AKCJE['kiosk-ping']({ id: d.id, nazwa }); return; }
        wynikEl.innerHTML += `<div style="color:var(--text-dim); margin-top:6px;">⏳ ${esc(t(p.k))}…</div>`;
        for (const c of cele) await wyslijPolecenie(c, cele.length > 1 ? c : nazwa, p.typ, parametry, wynikEl);
        await odswiezHistorieSterowania(d.id);
    });
    await odswiezHistorieSterowania(d.id);
};

async function odswiezHistorieSterowania(kioskId) {
    const tbody = document.querySelector('#tabela-ster-historia tbody');
    if (!tbody) return;
    const w = await wywolajRPC('admin_kiosk_polecenia_historia', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kiosk_id: kioskId, p_limit: 12 });
    if (!w.sukces) { tbody.innerHTML = `<tr><td style="color:var(--err)">❌ ${esc(narBlad(w))}</td></tr>`; return; }
    tbody.innerHTML = (w.dane || []).map(r => `<tr><td style="font-size:0.85rem; white-space:nowrap;">${esc(formatDataCzas(r.utworzono))}</td><td>${esc(r.typ)}</td><td>${esc(r.zlecil || '')}</td>
        <td>${r.wykonano ? `✅ ${esc(r.czas_ms)} ms` : '⏳'}</td></tr>`).join('') || `<tr><td style="color:var(--text-dim)">${esc(t('ster.no_history'))}</td></tr>`;
}
