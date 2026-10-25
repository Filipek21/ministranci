
// ============================================================================
// v2.5 — HISTORIA PUNKTÓW (niezmienna księga) + EDYCJA BAZY DANYCH PRZEZ ADMINA
//
//  • Historia punktów każdego ministranta: kiedy, za co, ile przed → po, kto zmienił, skąd i dlaczego.
//    Księga nigdy nie jest kasowana (sql/17) — nawet usunięcie wpisu zostawia w niej ślad.
//  • Admin: edytuje / usuwa / dodaje punkty, zmienia nazwy i usuwa wydarzenia, edytuje konta, unieważnia plakietki.
//  • Ksiądz: może TYLKO czytać historię punktów (bez modułów Baza danych i Kioski).
// ============================================================================

function brakFunkcjiSerwera(w) { return !!w && (w.kod_pg === 'PGRST202' || w.kod_pg === '42883'); }

// Prosty modal (nakładka + karta). Zwraca { overlay, body, zamknij }
function zbudujModal(id, maxSzerokosc, zIndex) {
    const stary = $(id);
    if (stary) stary.remove();
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:${zIndex || 1000}; display:flex; align-items:flex-start; justify-content:center; padding:16px; overflow:auto;`;
    const karta = document.createElement('div');
    karta.className = 'card';
    karta.style.cssText = `max-width:${maxSzerokosc || 900}px; width:100%; margin:0 auto;`;
    overlay.appendChild(karta);
    document.body.appendChild(overlay);
    const zamknij = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) zamknij(); });
    return { overlay, body: karta, zamknij };
}

// ------------------------------------------------------------------ HISTORIA PUNKTÓW ----
let historiaPunktowStan = null; // { id, nazwa, modal, dane }

function zrodloPunktowT(z) {
    return t('pts.src.' + (['import', 'admin_panel', 'auto', 'nieznane'].includes(z) ? z : 'unknown'));
}
function zmianaTekst(n) { n = Number(n) || 0; return (n > 0 ? '+' : '') + n; }

async function otworzHistoriePunktow(ministrantId, nazwa) {
    const modal = zbudujModal('modal-historia-punktow', 1100, 1000);
    historiaPunktowStan = { id: String(ministrantId), nazwa: nazwa || '', modal, dane: [] };
    modal.body.innerHTML = `<p>⏳ …</p>`;
    await przeladujHistoriePunktow();
}

async function przeladujHistoriePunktow() {
    const st = historiaPunktowStan;
    if (!st || !$('modal-historia-punktow')) return;
    const w = await wywolajRPC('admin_historia_punktow', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: st.id, p_limit: 1000 });
    if (!w.sukces) {
        st.dane = [];
        renderujHistoriePunktow(brakFunkcjiSerwera(w) ? t('pts.need_sql') : blad(w));
        return;
    }
    st.dane = w.dane || [];
    renderujHistoriePunktow(null);
}

function renderujHistoriePunktow(bladTekst) {
    const st = historiaPunktowStan;
    if (!st) return;
    const admin = !!sesja.is_admin;
    const suma = st.dane.length ? st.dane[0].suma_narastajaco : 0;   // dane są od najnowszych
    const widzianeObecnosci = new Set();

    const wiersze = st.dane.map(h => {
        // przyciski edycji tylko przy NAJNOWSZYM wpisie danej obecności, która nadal istnieje
        const pierwszy = !widzianeObecnosci.has(h.obecnosc_id);
        widzianeObecnosci.add(h.obecnosc_id);
        const mozeEdytowac = admin && pierwszy && h.aktualna && h.zdarzenie !== 'usuniecie';
        const kolorZd = h.zdarzenie === 'usuniecie' ? 'var(--err)' : (h.zdarzenie === 'zmiana' ? 'var(--accent-4)' : 'var(--ok)');
        const kolorZm = h.zmiana > 0 ? 'var(--ok)' : (h.zmiana < 0 ? 'var(--err)' : 'var(--text-dim)');
        return `<tr>
            <td style="font-size:0.85rem; white-space:nowrap;">${esc(formatDataCzas(h.kiedy))}</td>
            <td>${esc(h.wydarzenie_nazwa || '—')}${h.zaliczone_po || h.zaliczone_przed ? `<br><small style="color:var(--text-dim)">${esc(h.zaliczone_przed && h.zaliczone_przed !== h.zaliczone_po ? h.zaliczone_przed + ' → ' : '')}${esc(h.zaliczone_po || '')}</small>` : ''}</td>
            <td style="color:${kolorZd}">${esc(t('pts.k.' + h.zdarzenie))}${h.zdarzenie !== 'usuniecie' && pierwszy && h.aktualna ? `<br><small style="color:var(--text-dim)">${esc(t('pts.current_entry'))}</small>` : ''}${!h.aktualna && h.zdarzenie !== 'usuniecie' ? `<br><small style="color:var(--text-dim)">${esc(t('pts.deleted'))}</small>` : ''}</td>
            <td style="color:${kolorZm}; font-weight:800;">${esc(zmianaTekst(h.zmiana))}</td>
            <td>${esc(h.punkty_przed ?? 0)} → ${esc(h.punkty_po ?? 0)}</td>
            <td><b>${esc(h.suma_narastajaco)}</b></td>
            <td>${esc(h.kto_kod || '—')}</td>
            <td style="font-size:0.85rem;">${esc(zrodloPunktowT(h.zrodlo))}</td>
            <td style="font-size:0.85rem;">${esc(h.powod || '—')}</td>
            <td style="white-space:nowrap;">${mozeEdytowac ? `
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="pkt-edytuj" data-obecnosc="${esc(h.obecnosc_id)}">${esc(t('pts.edit'))}</button>
                <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="pkt-usun" data-obecnosc="${esc(h.obecnosc_id)}">${esc(t('pts.delete'))}</button>` : ''}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="10">${esc(t('pts.none'))}</td></tr>`;

    st.modal.body.innerHTML = `
        <div class="top-bar">
            <h3>${esc(t('pts.title', { nazwa: st.nazwa }))}</h3>
            <a href="#" id="btn-zamknij-historie-punktow">${esc(t('common.close'))} ✕</a>
        </div>
        <p style="color:var(--text-dim); font-size:0.9rem;">${esc(t('pts.hint'))}</p>
        ${bladTekst ? `<p style="color:var(--err)">❌ ${esc(bladTekst)}</p>` : `<p style="font-size:1.1rem;"><b>${esc(t('pts.current', { n: suma }))}</b></p>`}
        ${admin && !bladTekst ? `<button class="btn" style="width:auto; margin-bottom:12px;" id="btn-pkt-dodaj-w-historii">${esc(t('pts.add'))}</button>` : ''}
        <div class="tabela-przewijana">
            <table>
                <thead><tr>
                    <th>${esc(t('pts.col_when'))}</th><th>${esc(t('pts.col_event'))}</th><th>${esc(t('pts.col_kind'))}</th>
                    <th>${esc(t('pts.col_change'))}</th><th>${esc(t('pts.col_ba'))}</th><th>${esc(t('pts.col_total'))}</th>
                    <th>${esc(t('pts.col_by'))}</th><th>${esc(t('pts.col_source'))}</th><th>${esc(t('pts.col_reason'))}</th><th>${esc(t('pts.col_actions'))}</th>
                </tr></thead>
                <tbody>${wiersze}</tbody>
            </table>
        </div>`;
    $('btn-zamknij-historie-punktow').addEventListener('click', (e) => { e.preventDefault(); st.modal.zamknij(); historiaPunktowStan = null; });
    const dodaj = $('btn-pkt-dodaj-w-historii');
    if (dodaj) dodaj.addEventListener('click', () => otworzFormularzPunktow({ tryb: 'dodaj', ministrantId: st.id, naZapisano: przeladujHistoriePunktow }));
}

document.addEventListener('zmiana-jezyka', () => { if (historiaPunktowStan && $('modal-historia-punktow')) renderujHistoriePunktow(null); });

// ------------------------------------------------------------ FORMULARZ PUNKTÓW ----
// tryb 'edytuj': { obecnosc: { id, punkty, zaliczone_jako, nazwa } }   tryb 'dodaj': { ministrantId? }
const ZALICZONE_PODPOWIEDZI = ['zbiorka', 'msza', 'nabozenstwo', 'pogrzeb', 'slub', 'inne'];

async function otworzFormularzPunktow(opcje) {
    const edycja = opcje.tryb === 'edytuj';
    const modal = zbudujModal('modal-formularz-punktow', 520, 1100);
    const dop = new Set(ZALICZONE_PODPOWIEDZI);
    (bazaDane && bazaDane.obecnosci || []).forEach(o => { if (o && o.zaliczone_jako) dop.add(o.zaliczone_jako); });
    const datalist = [...dop].map(v => `<option value="${esc(v)}">`).join('');

    let polaWybor = '';
    if (!edycja) {
        // lista ministrantów (jeśli nie wczytana) i ostatnich wydarzeń
        let lista = (typeof biezacaListaMinistrantow !== 'undefined' && biezacaListaMinistrantow.length) ? biezacaListaMinistrantow : (bazaDane.uzytkownicy || []);
        if (!lista.length) { const w = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin }); lista = w.sukces ? (w.dane || []) : []; }
        const { data: wydarzenia } = await odczytajZBledem(supabaseClient.from('kalendarz').select('id,nazwa,data_wydarzenia').order('data_wydarzenia', { ascending: false }).limit(60), 'kalendarz');
        polaWybor = `
            <label class="form-etykieta">${esc(t('pts.f_minister'))}</label>
            <select id="pkt-f-ministrant">${lista.filter(m => m.aktywny !== false).map(m => `<option value="${esc(m.id)}" ${String(m.id) === String(opcje.ministrantId) ? 'selected' : ''}>${esc(m.kod)} — ${esc(m.imie)} ${esc(m.nazwisko)}</option>`).join('')}</select>
            <label class="form-etykieta">${esc(t('pts.f_event'))}</label>
            <select id="pkt-f-wydarzenie">${(wydarzenia || []).map(w => `<option value="${esc(w.id)}">${esc(w.nazwa)} (${esc(formatDataCzas(w.data_wydarzenia))})</option>`).join('')}</select>`;
    }

    modal.body.innerHTML = `
        <div class="top-bar"><h3>${esc(edycja ? t('pts.edit') : t('pts.add'))}</h3><a href="#" id="btn-pkt-f-zamknij">${esc(t('common.close'))} ✕</a></div>
        ${edycja ? `<p style="color:var(--text-dim)">${esc(opcje.obecnosc.nazwa || '')}</p>` : ''}
        ${polaWybor}
        <label class="form-etykieta">${esc(t('pts.f_points'))}</label>
        <input type="number" id="pkt-f-punkty" min="-100" max="100" step="0.5" value="${esc(edycja ? opcje.obecnosc.punkty : 1)}">
        <label class="form-etykieta">${esc(t('pts.f_type'))}</label>
        <input type="text" id="pkt-f-typ" list="pkt-f-typ-lista" maxlength="40" value="${esc(edycja ? (opcje.obecnosc.zaliczone_jako || '') : 'zbiorka')}">
        <datalist id="pkt-f-typ-lista">${datalist}</datalist>
        <label class="form-etykieta">${esc(t('pts.f_reason'))}</label>
        <input type="text" id="pkt-f-powod" maxlength="300">
        <button class="btn" id="btn-pkt-f-zapisz">${esc(t('pts.f_save'))}</button>
        <div id="pkt-f-status" style="margin-top:8px;"></div>`;

    $('btn-pkt-f-zamknij').addEventListener('click', (e) => { e.preventDefault(); modal.zamknij(); });
    $('btn-pkt-f-zapisz').addEventListener('click', async () => {
        const status = $('pkt-f-status');
        const punkty = parsujPunkty($('pkt-f-punkty').value);   // v2.12.01: połówki (krok 0,5)
        if (isNaN(punkty) || punkty < -100 || punkty > 100) { status.style.color = 'var(--err)'; status.textContent = t('pts.err_points'); return; }
        const typ = $('pkt-f-typ').value.trim();
        const powod = $('pkt-f-powod').value.trim() || null;
        status.style.color = ''; status.textContent = '⏳ …';
        let w;
        if (edycja) {
            w = await wywolajRPC('admin_punkty_edytuj', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_obecnosc_id: String(opcje.obecnosc.id), p_punkty: punkty, p_zaliczone_jako: typ || null, p_powod: powod });
        } else {
            w = await wywolajRPC('admin_punkty_dodaj', {
                p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: String($('pkt-f-ministrant').value),
                p_wydarzenie_id: String($('pkt-f-wydarzenie').value), p_punkty: punkty, p_zaliczone_jako: typ || 'zbiorka', p_powod: powod
            });
        }
        if (!w.sukces) {
            status.style.color = 'var(--err)';
            status.textContent = '❌ ' + (brakFunkcjiSerwera(w) ? t('pts.need_sql') : blad(w));
            return;
        }
        status.style.color = 'var(--ok)'; status.textContent = '✅ ' + t('pts.saved');
        modal.zamknij();
        if (opcje.naZapisano) await opcje.naZapisano();
    });
}

// Po każdej zmianie punktów odśwież to, co jest na ekranie
async function odswiezPoZmianiePunktow() {
    if (historiaPunktowStan && $('modal-historia-punktow')) await przeladujHistoriePunktow();
    if (aktywnaZakladka === 'baza') await pokazBazaObecnosci();
    if (aktywnaZakladka === 'ministranci') await odswiezListeMinistrantow();
}

async function usunWpisPunktow(obecnoscId) {
    if (!confirm(t('pts.confirm_delete'))) return;
    const powod = (prompt(t('pts.reason_prompt'), '') || '').trim().slice(0, 300) || null;
    const w = await wywolajRPC('admin_punkty_usun', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_obecnosc_id: String(obecnoscId), p_powod: powod });
    if (!w.sukces) { alert('❌ ' + (brakFunkcjiSerwera(w) ? t('pts.need_sql') : blad(w))); return; }
    await odswiezPoZmianiePunktow();
}

// ------------------------------------------------------------------- AKCJE ----
AKCJE['pkt-historia'] = (d) => otworzHistoriePunktow(d.id, d.nazwa);

// z księgi: edycja / usunięcie aktualnego wpisu
AKCJE['pkt-edytuj'] = (d) => {
    const st = historiaPunktowStan;
    if (!st) return;
    const h = st.dane.find(x => String(x.obecnosc_id) === String(d.obecnosc) && x.aktualna);
    if (!h) return;
    otworzFormularzPunktow({ tryb: 'edytuj', obecnosc: { id: h.obecnosc_id, punkty: h.punkty_po, zaliczone_jako: h.zaliczone_po, nazwa: h.wydarzenie_nazwa }, naZapisano: odswiezPoZmianiePunktow });
};
AKCJE['pkt-usun'] = (d) => usunWpisPunktow(d.obecnosc);

// z Bazy danych → Obecności
AKCJE['pkt-edytuj-ob'] = (d) => {
    const o = bazaDane.obecnosci.find(x => String(x.id) === String(d.id));
    if (!o) return;
    otworzFormularzPunktow({ tryb: 'edytuj', obecnosc: { id: o.id, punkty: o.punkty, zaliczone_jako: o.zaliczone_jako, nazwa: `${o.imie} ${o.nazwisko} — ${o.nazwa || ''}` }, naZapisano: odswiezPoZmianiePunktow });
};
AKCJE['pkt-usun-ob'] = (d) => usunWpisPunktow(d.id);
$('btn-baza-punkty-dodaj').addEventListener('click', () => otworzFormularzPunktow({ tryb: 'dodaj', naZapisano: odswiezPoZmianiePunktow }));

// z Bazy danych → Użytkownicy (edycja kont używa istniejącego formularza w zakładce Ministranci)
AKCJE['db-edytuj-uzytkownika'] = async (d) => {
    document.querySelector('.tabs button[data-tab="ministranci"]').click();
    await odswiezListeMinistrantow();
    rozpocznijEdycjeMinistranta(d.id);
};
AKCJE['db-dezaktywuj'] = async (d) => { await AKCJE['mi-dezaktywuj'](d); await odswiezBazaDanych(); };
AKCJE['db-przywroc'] = async (d) => { await AKCJE['mi-przywroc'](d); await odswiezBazaDanych(); };
AKCJE['db-bdg-uniewaznij'] = (d) => AKCJE['bdg-uniewaznij'](d);

// Kalendarz: zmiana nazwy i usuwanie wydarzenia (Admin)
AKCJE['cal-nazwa'] = async (d) => {
    const nowa = (prompt(t('cal.rename_prompt'), d.nazwa || '') || '').trim();
    if (!nowa || nowa === d.nazwa) return;
    const w = await wywolajRPC('admin_wydarzenie_zmien_nazwe', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_wydarzenie_id: String(d.id), p_nazwa: nowa });
    if (!w.sukces) { alert('❌ ' + (brakFunkcjiSerwera(w) ? t('cal.need_sql') : blad(w))); return; }
    $('wydarzenie-status').style.color = 'var(--ok)';
    $('wydarzenie-status').textContent = '✅ ' + t('cal.renamed');
    await odswiezKalendarz();
};
AKCJE['cal-usun'] = async (d) => {
    if (!confirm(t('cal.confirm_delete'))) return;
    const param = { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_wydarzenie_id: String(d.id), p_wymus: false };
    let w = await wywolajRPC('admin_wydarzenie_usun', param);
    if (!w.sukces && w.wymaga_potwierdzenia) {
        if (!confirm(t('cal.confirm_delete_att', { n: w.liczba }))) return;
        w = await wywolajRPC('admin_wydarzenie_usun', Object.assign({}, param, { p_wymus: true }));
    }
    if (!w.sukces) { alert('❌ ' + (brakFunkcjiSerwera(w) ? t('cal.need_sql') : blad(w))); return; }
    $('wydarzenie-status').style.color = 'var(--ok)';
    $('wydarzenie-status').textContent = '✅ ' + t('cal.deleted');
    await odswiezKalendarz();
};
