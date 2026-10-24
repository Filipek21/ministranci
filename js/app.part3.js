
// ============================================================================
// KALENDARZ — uproszczone dodawanie wydarzenia
//   Wymagane tylko: typ + data i godzina. Nazwa jest opcjonalna (generuje się sama),
//   okno rejestracji i bloki połączone są w sekcji „Ustawienia zaawansowane”.
// ============================================================================
const NAZWY_AUTO_PL = { msza: 'Msza', nabozenstwo: 'Nabożeństwo', zbiorka: 'Zbiórka' };
const DNI_TYG_PL = ['ndz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];

// Nazwa zapisywana w bazie jest ZAWSZE po polsku (to dane, nie interfejs) — np. „Msza · ndz. 18.10, 9:00”
function autoNazwaWydarzenia(typ, dataVal) {
    const d = new Date(dataVal);
    const dd = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
    const godz = d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
    return `${NAZWY_AUTO_PL[typ] || typ} · ${DNI_TYG_PL[d.getDay()]} ${dd}, ${godz}`;
}

function domyslnaDataWydarzenia() {
    // najbliższa pełna godzina w przyszłości, w formacie datetime-local (czas lokalny)
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

$('nowe-blok').addEventListener('change', async (e) => {
    $('blok-parowanie').classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) {
        const { data } = await supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(15);
        $('blok-z-czym').innerHTML =
            `<option value="">${esc(t('cal.block_none'))}</option>` +
            (data || []).map(w => `<option value="${esc(w.id)}|${esc(w.polaczone_id || '')}">${esc(w.nazwa)} — ${esc(formatDataCzas(w.data_wydarzenia))}</option>`).join('');
    }
});

$('btn-dodaj-wydarzenie').addEventListener('click', async () => {
    const btn = $('btn-dodaj-wydarzenie');
    const typ = $('nowe-typ').value;
    const dataVal = $('nowe-data').value;
    const przedRaw = parseInt($('nowe-przed').value);
    const poRaw = parseInt($('nowe-po').value);
    const przed = isNaN(przedRaw) ? 15 : Math.max(0, przedRaw);   // 0 jest poprawną wartością (wcześniej zamieniało się na 15)
    const po = isNaN(poRaw) ? 5 : Math.max(0, poRaw);
    const status = $('wydarzenie-status');
    status.style.color = '';

    if (!dataVal) { status.textContent = t('cal.need_date'); return; }
    const nazwa = $('nowe-nazwa').value.trim() || autoNazwaWydarzenia(typ, dataVal);

    let polaczoneId = null;
    if ($('nowe-blok').checked) {
        const wybor = $('blok-z-czym').value;
        if (wybor) {
            const [innyId, istniejacyPolaczoneId] = wybor.split('|');
            polaczoneId = istniejacyPolaczoneId || innyId; // jeśli para nie miała polaczone_id, użyj jej id jako wspólnego identyfikatora (patrz docs, sekcja o blokach)
        } else {
            polaczoneId = crypto.randomUUID(); // nowy blok — to wydarzenie będzie jego pierwszą częścią
        }
    }

    btn.disabled = true;
    const wynik = await wywolajRPC('dodaj_wydarzenie', {
        p_kod: sesja.kod, p_pin: sesja.pin, p_typ: typ, p_nazwa: nazwa,
        p_data_wydarzenia: new Date(dataVal).toISOString(),
        p_minuty_przed: przed, p_minuty_po: po, p_polaczone_id: polaczoneId
    });
    btn.disabled = false;

    if (wynik.sukces) {
        status.style.color = 'var(--ok)';
        status.textContent = '✅ ' + t('cal.added', { nazwa });
        $('nowe-nazwa').value = '';
        await odswiezKalendarz();
    } else {
        status.style.color = 'var(--err)';
        status.textContent = '❌ ' + blad(wynik);
    }
});

async function odswiezKalendarz() {
    if (!$('nowe-data').value) $('nowe-data').value = domyslnaDataWydarzenia();
    const { data } = await supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(50);
    $('tabela-kalendarz').querySelector('tbody').innerHTML = (data || []).map(w => `<tr>
        <td>${esc(w.nazwa)}${w.polaczone_id ? ' 🔗' : ''}</td>
        <td>${esc(etykieta('cal.type.' + w.typ, w.typ))}</td>
        <td>${esc(formatDataCzas(w.data_wydarzenia))}</td>
        <td>${esc(formatGodzina(w.okno_start))}–${esc(formatGodzina(w.okno_koniec))}</td>
        ${(sesja && sesja.is_admin) ? `<td style="white-space:nowrap;">
            <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="cal-nazwa" data-id="${esc(w.id)}" data-nazwa="${esc(w.nazwa)}">${esc(t('cal.act_rename'))}</button>
            <button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="cal-usun" data-id="${esc(w.id)}">${esc(t('cal.act_delete'))}</button>
        </td>` : ''}
    </tr>`).join('');
}

// ============================================================================
// MINISTRANCI — dodawanie / edycja / PIN / dezaktywacja / plakietki
// ============================================================================
let edytowanyMinistrantId = null; // null = tryb „dodaj”, ustawiony = tryb „edytuj”
let biezacaListaMinistrantow = [];

$('btn-dodaj-ministranta').addEventListener('click', async () => {
    const imie = $('mi-imie').value.trim();
    const nazwisko = $('mi-nazwisko').value.trim();
    const kod = $('mi-kod').value.trim();
    const pin = $('mi-pin').value.trim();
    const jestModeratorem = $('mi-moderator').checked;
    const status = $('ministrant-status');
    status.textContent = '';

    if (!imie || !nazwisko || !kod) { status.textContent = t('mi.fill'); return; }

    if (edytowanyMinistrantId) {
        // --- TRYB EDYCJI ---
        const wynik = sesja.is_admin
            ? await wywolajRPC('admin_edytuj_ministranta', {
                p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
                p_ministrant_id: edytowanyMinistrantId,
                p_nowe_imie: imie, p_nowe_nazwisko: nazwisko, p_nowy_kod: kod,
                p_is_moderator: jestModeratorem
            })
            : await wywolajRPC('ksiadz_edytuj_ministranta', {   // Ksiądz: tylko zwykli ministranci, bez zmiany ról
                p_kod: sesja.kod, p_pin: sesja.pin, p_ministrant_id: String(edytowanyMinistrantId),
                p_imie: imie, p_nazwisko: nazwisko, p_nowy_kod: kod
            });
        if (!wynik.sukces) { status.textContent = '❌ ' + blad(wynik); return; }

        let komunikat = '';
        if (pin.length === 4) {
            if (pinZbytProsty(pin)) { status.textContent = '⚠️ ' + t('e.pin_weak'); return; }
            const wynikPin = sesja.is_admin
                ? await wywolajRPCZAudytem('admin_zmien_pin_ministranta_audyt', 'admin_zmien_pin_ministranta', {
                    p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
                    p_ministrant_id: edytowanyMinistrantId, p_nowy_pin: pin
                })
                : await wywolajRPC('ksiadz_zmien_pin_ministranta', {
                    p_kod: sesja.kod, p_pin: sesja.pin, p_ministrant_id: String(edytowanyMinistrantId), p_nowy_pin: pin
                });
            if (!wynikPin.sukces) komunikat = '⚠️ ' + t('mi.pin_warn', { blad: blad(wynikPin) });
        }
        zakonczEdycjeMinistranta();
        status.textContent = komunikat || ('✅ ' + t('mi.saved'));
        await odswiezListeMinistrantow();
        return;
    }

    // --- TRYB DODAWANIA ---
    if (pin.length !== 4) { status.textContent = t('mi.pin4'); return; }
    if (pinZbytProsty(pin)) { status.textContent = '❌ ' + t('e.pin_weak'); return; }
    const wynik = sesja.is_admin
        ? await wywolajRPC('admin_dodaj_ministranta', {
            p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
            p_imie: imie, p_nazwisko: nazwisko, p_nowy_kod: kod, p_nowy_pin: pin,
            p_is_moderator: jestModeratorem
        })
        : await wywolajRPC('ksiadz_dodaj_ministranta', {      // Ksiądz dodaje wyłącznie zwykłych ministrantów
            p_kod: sesja.kod, p_pin: sesja.pin, p_imie: imie, p_nazwisko: nazwisko, p_nowy_kod: kod, p_nowy_pin: pin
        });
    status.textContent = wynik.sukces ? '✅ ' + t('mi.added', { kod }) : ('❌ ' + blad(wynik));
    if (wynik.sukces) {
        ['mi-imie', 'mi-nazwisko', 'mi-kod', 'mi-pin'].forEach(id => $(id).value = '');
        $('mi-moderator').checked = false;
        await odswiezListeMinistrantow();
    }
});

function rozpocznijEdycjeMinistranta(id) {
    const m = biezacaListaMinistrantow.find(x => x.id === id);
    if (!m) return;
    edytowanyMinistrantId = id;
    $('mi-tytul-formularza').textContent = t('mi.edit', { n: `${m.imie} ${m.nazwisko}` });
    $('mi-imie').value = m.imie;
    $('mi-nazwisko').value = m.nazwisko;
    $('mi-kod').value = m.kod;
    $('mi-pin').value = '';
    $('mi-pin').placeholder = t('mi.pin_edit_ph');
    $('mi-moderator').checked = !!m.is_moderator;
    $('btn-dodaj-ministranta').textContent = t('mi.btn_save');
    $('btn-anuluj-edycje').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function zakonczEdycjeMinistranta() {
    edytowanyMinistrantId = null;
    $('mi-tytul-formularza').textContent = t('mi.add');
    ['mi-imie', 'mi-nazwisko', 'mi-kod', 'mi-pin'].forEach(id => $(id).value = '');
    $('mi-pin').placeholder = t('mi.pin_ph');
    $('mi-moderator').checked = false;
    $('btn-dodaj-ministranta').textContent = t('mi.btn_add');
    $('btn-anuluj-edycje').classList.add('hidden');
}
$('btn-anuluj-edycje').addEventListener('click', zakonczEdycjeMinistranta);

async function odswiezListeMinistrantow() {
    const tbody = $('tabela-ministranci').querySelector('tbody');
    const wynik = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(9, '❌ ' + blad(wynik)); return; }
    biezacaListaMinistrantow = wynik.dane || [];
    const btnStyl = 'width:auto; padding:6px 10px;';
    if (typeof ladujStatusKod3 === 'function') await ladujStatusKod3();   // które konta Admin/Ksiądz mają ustawiony kod 3-cyfrowy

    tbody.innerHTML = biezacaListaMinistrantow.map(m => {
        const id = esc(m.id);
        let akcje = `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="mi-plakietki" data-id="${id}" data-nazwa="${esc(m.imie + ' ' + m.nazwisko)}">${esc(t('mi.act_badges'))}</button>`
            // Historia punktów (niezmienna księga) — widoczna dla Admina i Księdza; edycja tylko Admin
            + `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="pkt-historia" data-id="${id}" data-nazwa="${esc(m.imie + ' ' + m.nazwisko)}">${esc(t('db.act_history'))}</button>`;
        if (sesja.is_admin && !m.is_admin) {
            akcje = `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="mi-edytuj" data-id="${id}">${esc(t('mi.act_edit'))}</button>` + akcje;
            // Stały kod 3-cyfrowy Księdza: Admin może go zresetować (osoba ustawi nowy przy następnym logowaniu)
            if (m.is_moderator && kod3Mapa[String(m.id)]) {
                akcje += `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="mi-reset-k3" data-id="${id}">${esc(t('mi.act_reset_k3'))}</button>`;
            }
            akcje += m.is_moderator
                ? `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="mi-moderator" data-id="${id}" data-wartosc="0">${esc(t('mi.act_revoke_priest'))}</button>`
                : `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="mi-moderator" data-id="${id}" data-wartosc="1">${esc(t('mi.act_grant_priest'))}</button>`;
            akcje += m.aktywny
                ? `<button class="btn btn-danger" style="${btnStyl}" data-akcja="mi-dezaktywuj" data-id="${id}">${esc(t('mi.act_deactivate'))}</button>`
                : `<button class="btn" style="${btnStyl}" data-akcja="mi-przywroc" data-id="${id}">${esc(t('mi.act_restore'))}</button>`;
        } else if (!sesja.is_admin && !m.is_admin && !m.is_moderator) {
            // Ksiądz prowadzi zwykłych ministrantów: edycja (imię, nazwisko, kod, PIN) i aktywność — bez zmiany ról
            akcje = `<button class="btn btn-secondary" style="${btnStyl}" data-akcja="mi-edytuj" data-id="${id}">${esc(t('mi.act_edit'))}</button>` + akcje;
            akcje += m.aktywny
                ? `<button class="btn btn-danger" style="${btnStyl}" data-akcja="mi-dezaktywuj" data-id="${id}">${esc(t('mi.act_deactivate'))}</button>`
                : `<button class="btn" style="${btnStyl}" data-akcja="mi-przywroc" data-id="${id}">${esc(t('mi.act_restore'))}</button>`;
        } else if (m.is_admin) {
            akcje += ` <span style="color:var(--text-dim); font-size:0.8rem;">${esc(t('mi.protected'))}</span>`;
        }
        return `
        <tr>
            <td>${esc(m.kod)}</td>
            <td>${esc(m.imie)} ${esc(m.nazwisko)}${m.is_admin ? ' 👑' : ''}${m.is_moderator ? ' ⛪' : ''}${(m.is_admin || m.is_moderator) && sesja.is_admin && kod3Dostepne ? ` <small style="color:${kod3Mapa[String(m.id)] ? 'var(--ok)' : 'var(--accent-4)'}">${esc(kod3Mapa[String(m.id)] ? t('mi.k3_set') : t('mi.k3_unset'))}</small>` : ''}</td>
            <td>${esc(m.pin_jawny ?? '—')}</td>
            <td>${esc(m.punkty_miesiac)}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${esc(m.ostatnie_logowanie_pwa ? formatDataCzas(m.ostatnie_logowanie_pwa) : t('common.never'))}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${esc(m.ostatnie_logowanie_kiosk ? formatDataCzas(m.ostatnie_logowanie_kiosk) : t('common.never'))}</td>
            <td style="color:${m.aktywny ? 'var(--ok)' : 'var(--err)'}">${esc(m.aktywny ? t('common.active') : t('common.inactive'))}</td>
            <td>${esc(m.liczba_aktywnych_plakietek)}</td>
            <td style="white-space:nowrap;">${akcje}</td>
        </tr>`;
    }).join('') || wierszKomunikat(9, t('mi.none'));
}

AKCJE['mi-edytuj'] = (d) => rozpocznijEdycjeMinistranta(d.id);
AKCJE['mi-plakietki'] = (d) => otworzPlakietki(d.id, d.nazwa);
AKCJE['mi-moderator'] = async (d) => {
    const wynik = await wywolajRPC('admin_ustaw_moderatora', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: d.id, p_is_moderator: d.wartosc === '1' });
    if (!wynik.sukces) alert('❌ ' + blad(wynik));
    await odswiezListeMinistrantow();
};
AKCJE['mi-dezaktywuj'] = async (d) => {
    if (!confirm(t('mi.confirm_deactivate'))) return;
    const wynik = sesja.is_admin
        ? await wywolajRPC('admin_usun_ministranta', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: d.id })
        : await wywolajRPC('ksiadz_ustaw_aktywnosc', { p_kod: sesja.kod, p_pin: sesja.pin, p_ministrant_id: String(d.id), p_aktywny: false });
    $('ministrant-status').textContent = wynik.sukces ? '✅ ' + t('mi.deactivated') : ('❌ ' + blad(wynik));
    await odswiezListeMinistrantow();
};
AKCJE['mi-przywroc'] = async (d) => {
    const wynik = sesja.is_admin
        ? await wywolajRPC('admin_przywroc_ministranta', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: d.id })
        : await wywolajRPC('ksiadz_ustaw_aktywnosc', { p_kod: sesja.kod, p_pin: sesja.pin, p_ministrant_id: String(d.id), p_aktywny: true });
    $('ministrant-status').textContent = wynik.sukces ? ('✅ ' + (wynik.informacja || t('mi.restored'))) : ('❌ ' + blad(wynik));
    await odswiezListeMinistrantow();
};

// --- PANEL PLAKIETEK (dla jednego ministranta, z zakładki Ministranci) ---
let plakietkiDlaMinistrantaId = null;
let plakietkiDlaMinistrantaNazwa = '';
let plakietkiPanelu = [];
let wszystkiePlakietki = [];

async function otworzPlakietki(ministrantId, imieNazwisko) {
    plakietkiDlaMinistrantaId = ministrantId;
    plakietkiDlaMinistrantaNazwa = imieNazwisko;
    $('plakietki-tytul').textContent = t('bdg.title', { n: imieNazwisko });
    $('panel-plakietki').classList.remove('hidden');
    await odswiezPanelPlakietek();
}
$('btn-zamknij-plakietki').addEventListener('click', () => {
    $('panel-plakietki').classList.add('hidden');
    plakietkiDlaMinistrantaId = null;
});

function wierszePlakietek(lista, kolumny, zMinistrantem, atrybutLista) {
    return lista.map((p, i) => `
        <tr>
            <td>${esc(p.kod_plakietki)}</td>
            ${zMinistrantem ? `<td>${esc(p.imie)} ${esc(p.nazwisko)} (${esc(p.ministrant_kod)})</td>` : ''}
            <td>${esc(formatDataCzas(p.wygenerowano))}</td>
            <td style="color:${p.aktywna ? 'var(--ok)' : 'var(--err)'}">${esc(p.aktywna ? t('bdg.active') : t('bdg.revoked'))}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" data-akcja="bdg-podglad" data-lista="${atrybutLista}" data-i="${i}">${esc(t('bdg.preview'))}</button>
                ${(p.aktywna && sesja.is_admin) ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" data-akcja="bdg-uniewaznij" data-kod="${esc(p.kod_plakietki)}">${esc(t('bdg.revoke'))}</button>` : ''}
            </td>
        </tr>`).join('') || wierszKomunikat(kolumny, t('bdg.none'));
}

async function odswiezPanelPlakietek() {
    const wynik = await wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: plakietkiDlaMinistrantaId });
    const tbody = $('tabela-plakietki');
    if (!wynik.sukces) { tbody.innerHTML = wierszKomunikat(4, '❌ ' + blad(wynik)); return; }
    plakietkiPanelu = wynik.dane || [];
    tbody.innerHTML = wierszePlakietek(plakietkiPanelu, 4, false, 'panel');
}

$('btn-nowa-plakietka').addEventListener('click', async () => {
    const wynik = await wywolajRPCZAudytem('admin_generuj_plakietke_audyt', 'admin_generuj_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: plakietkiDlaMinistrantaId });
    if (!wynik.sukces) { alert('❌ ' + blad(wynik)); return; }
    await odswiezPanelPlakietek();
    await odswiezListeMinistrantow();
});

AKCJE['bdg-podglad'] = (d) => {
    const lista = d.lista === 'panel' ? plakietkiPanelu : wszystkiePlakietki;
    const p = lista[parseInt(d.i)];
    if (p) pokazPodgladPojedynczej(p);
};

AKCJE['bdg-uniewaznij'] = async (d) => {
    if (!confirm(t('bdg.confirm_revoke', { kod: d.kod }))) return;
    // Powód jest opcjonalny (Anuluj/puste = brak powodu); trafia do historii plakietek
    const powod = (prompt(t('bdg.revoke_reason'), '') || '').trim().slice(0, 200) || null;
    const wynik = await wywolajRPCZAudytem('admin_uniewaznij_plakietke_audyt', 'admin_uniewaznij_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kod_plakietki: d.kod }, { p_powod: powod });
    if (!wynik.sukces) alert('❌ ' + blad(wynik));
    if (plakietkiDlaMinistrantaId) await odswiezPanelPlakietek();
    await odswiezListeMinistrantow();
    if (aktywnaZakladka === 'karty') await odswiezWszystkiePlakietki();
    if (aktywnaZakladka === 'baza') await odswiezBazaDanych();
};
