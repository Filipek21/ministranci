// ============================================================================
// app.part13.js — v2.15 — ADMIN: skrzynka „Skontaktuj się z Administratorem”
// Wiadomości z Panelu (podpisane) i z Kiosków (anonimowe lub podpisane), podgląd zrzutu ekranu, statusy, usuwanie, znaczek i powiadomienia.
// Serwer: sql/34_kontakt_z_administratorem.sql. Wołane z monitora Admina (app.part12.js).
// ============================================================================
let kontaktDane = [];
let kontaktPoprzednieNowe = null;

function kontaktAutorTekst(r) {
    if (r.anonimowe) return `🕶️ ${t('kt.adm_anonymous')}`;
    return `${r.autor_imie || '?'} (${r.autor_kod || '?'}) · ${etykieta('kt.role_' + r.autor_rola, r.autor_rola || '')}`;
}

async function odswiezWiadomosci() {
    if (!sesja || !sesja.is_admin) return;
    const tbody = $('tabela-wiadomosci').querySelector('tbody');
    const status = $('kt-adm-status').value || 'nowe';
    tbody.innerHTML = wierszKomunikat(6, '⏳ …');
    let w;
    try { w = await wywolajRPC('admin_kontakt_lista', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: status, p_limit: 500 }); }
    catch (e) { w = { sukces: false, blad: String((e && e.message) || e) }; }
    if (!w || !w.sukces) { tbody.innerHTML = wierszKomunikat(6, '❌ ' + (brakFunkcjiSerwera(w) ? t('kt.adm_need_sql') : blad(w))); kontaktDane = []; return; }
    kontaktDane = w.dane || [];
    ustawZnaczek('wiadomosci-znaczek', Number(w.nowe) || 0);
    kontaktPoprzednieNowe = Number(w.nowe) || 0;
    $('kt-adm-licznik').textContent = t('kt.adm_count', { n: kontaktDane.length, p: Number(w.nowe) || 0 });
    if (!kontaktDane.length) { tbody.innerHTML = wierszKomunikat(6, t('kt.adm_empty')); return; }
    tbody.innerHTML = kontaktDane.map((r, i) => {
        const ctx = r.kontekst || {};
        const kontekstTxt = [ctx.widok, ctx.zakladka, ctx.wersja ? 'v' + ctx.wersja : '', ctx.ekran, ctx.jezyk].filter(Boolean).join(' · ');
        return `<tr data-i="${i}" ${r.status === 'nowe' ? 'style="background:rgba(255,184,79,0.10)"' : ''}>
            <td style="white-space:nowrap; font-size:0.85rem;">${esc(formatDataCzas(r.utworzono))}</td>
            <td>${esc(kontaktAutorTekst(r))}<br><small>${esc(r.zrodlo === 'kiosk' ? '🖥️ ' + t('kt.adm_src_kiosk', { id: r.kiosk_id || '?' }) : '📱 ' + t('kt.adm_src_panel'))}</small></td>
            <td>${esc(etykieta('kt.cat_' + r.kategoria, r.kategoria))}</td>
            <td style="white-space:pre-wrap; word-break:break-word; min-width:220px;">${esc(r.tresc)}${kontekstTxt ? `<br><small style="color:var(--text-dim)">${esc(kontekstTxt)}</small>` : ''}${r.uwagi_admina ? `<br><small>📝 ${esc(r.uwagi_admina)}</small>` : ''}</td>
            <td>${esc(etykieta('kt.adm_st_' + r.status, r.status))}${r.status_kto ? `<br><small>${esc(r.status_kto)}${r.status_kiedy ? ' · ' + esc(formatDataCzas(r.status_kiedy)) : ''}</small>` : ''}</td>
            <td><div class="akc-ctrl">
                ${r.ma_zrzut ? `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="kt-zrzut" data-i="${i}">🖼️ ${esc(t('kt.adm_screenshot'))}</button>` : ''}
                ${r.status !== 'przeczytane' ? `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="kt-status" data-i="${i}" data-st="przeczytane">👁️ ${esc(t('kt.adm_mark_read'))}</button>` : ''}
                ${r.status !== 'zalatwione' ? `<button class="btn" style="width:auto; padding:4px 10px;" data-akcja="kt-status" data-i="${i}" data-st="zalatwione">✅ ${esc(t('kt.adm_mark_done'))}</button>` : ''}
                ${r.status !== 'nowe' ? `<button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="kt-status" data-i="${i}" data-st="nowe">↩ ${esc(t('kt.adm_mark_new'))}</button>` : ''}
                <button class="btn btn-secondary" style="width:auto; padding:4px 10px;" data-akcja="kt-usun" data-i="${i}">🗑️</button>
            </div></td>
        </tr>`;
    }).join('');
}

AKCJE['kt-zrzut'] = async (d) => {
    const r = kontaktDane[Number(d.i)]; if (!r) return;
    const w = await wywolajRPC('admin_kontakt_zrzut', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: Number(r.id) });
    if (!w.sukces) { $('kt-adm-komunikat').textContent = '❌ ' + blad(w); return; }
    const tlo = document.createElement('div');
    tlo.className = 'kontakt-tlo'; tlo.setAttribute('data-zrzut-ukryj', '1');
    tlo.innerHTML = `<div class="kontakt-okno" style="max-width:min(95vw,1100px)"><div class="kt-przyciski" style="justify-content:space-between"><strong>🖼️ ${esc(t('kt.adm_screenshot'))} #${esc(r.id)}</strong><button type="button" class="btn btn-secondary" style="width:auto">${esc(t('kt.close'))}</button></div><img alt="" style="max-width:100%; border-radius:8px; margin-top:8px;"></div>`;
    tlo.querySelector('img').src = w.zrzut;
    const zamknij = () => tlo.remove();
    tlo.querySelector('button').addEventListener('click', zamknij);
    tlo.addEventListener('click', (e) => { if (e.target === tlo) zamknij(); });
    document.body.appendChild(tlo);
};
AKCJE['kt-status'] = async (d) => {
    const r = kontaktDane[Number(d.i)]; if (!r) return;
    const uwagi = d.st === 'zalatwione' ? prompt(t('kt.adm_note'), r.uwagi_admina || '') : null;
    if (d.st === 'zalatwione' && uwagi === null) return;
    const w = await wywolajRPC('admin_kontakt_status', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: Number(r.id), p_status: d.st, p_uwagi: uwagi && uwagi.trim() ? uwagi.trim() : null });
    $('kt-adm-komunikat').textContent = w.sukces ? '' : '❌ ' + blad(w);
    await odswiezWiadomosci();
};
AKCJE['kt-usun'] = async (d) => {
    const r = kontaktDane[Number(d.i)]; if (!r) return;
    if (!confirm(t('kt.adm_confirm_delete'))) return;
    const w = await wywolajRPC('admin_kontakt_usun', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_id: Number(r.id) });
    $('kt-adm-komunikat').textContent = w.sukces ? '' : '❌ ' + blad(w);
    await odswiezWiadomosci();
};
$('kt-adm-status').addEventListener('change', odswiezWiadomosci);
$('btn-kt-adm-odswiez').addEventListener('click', odswiezWiadomosci);
// v2.15.02: minimalizacja danych — usuwa załatwione wiadomości i zrzuty ekranu starsze niż N dni
$('btn-kt-adm-czysc').addEventListener('click', async () => {
    const odp = prompt(t('kt.adm_clean_prompt'), '30');
    if (odp === null) return;
    const dni = parseInt(odp, 10);
    if (!(dni >= 1 && dni <= 3650)) { $('kt-adm-komunikat').textContent = '❌ ' + t('kt.adm_clean_bad'); return; }
    if (!confirm(t('kt.adm_clean_confirm', { n: dni }))) return;
    const w = await wywolajRPC('admin_kontakt_czysc', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_dni: dni });
    $('kt-adm-komunikat').textContent = w.sukces ? '✅ ' + t('kt.adm_clean_done', { m: w.usuniete, z: w.zrzutow_usunietych }) : '❌ ' + (brakFunkcjiSerwera(w) ? t('kt.adm_need_sql') : blad(w));
    await odswiezWiadomosci();
});

// wołane z monitora Admina co minutę: znaczek + powiadomienie o NOWYCH wiadomościach
async function kontaktOdswiezZnaczek() {
    if (!sesja || !sesja.is_admin) return;
    let w;
    try { w = await wywolajRPC('admin_kontakt_licznik', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin }); } catch (e) { return; }
    if (!w || !w.sukces) return;
    const nowe = Number(w.nowe) || 0;
    ustawZnaczek('wiadomosci-znaczek', nowe);
    if (kontaktPoprzednieNowe === null) { if (nowe > 0 && typeof powiadomOstrzezenie === 'function') powiadomOstrzezenie(t('kt.adm_login', { n: nowe })); }
    else if (nowe > kontaktPoprzednieNowe && typeof powiadomOstrzezenie === 'function') powiadomOstrzezenie(t('kt.adm_new', { n: nowe - kontaktPoprzednieNowe }) + (w.pilne > 0 ? ' · ' + t('kt.adm_urgent', { n: w.pilne }) : ''));
    kontaktPoprzednieNowe = nowe;
    if (aktywnaZakladka === 'wiadomosci') odswiezWiadomosci();
}
