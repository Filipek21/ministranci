// ============================================================================
// PWA — Panel Ministranta + Panel Admina/Moderatora
// ============================================================================

let sesja = null; // { id, kod, imie, nazwisko, is_admin, is_moderator, pin } — pin trzymany w pamięci na czas sesji do RPC

const widokLogin = document.getElementById('widok-login');
const widokMinistrant = document.getElementById('widok-ministrant');
const widokAdmin = document.getElementById('widok-admin');

function pokazWidok(w) {
    [widokLogin, widokMinistrant, widokAdmin].forEach(x => x.classList.add('hidden'));
    w.classList.remove('hidden');
}

// --- LOGOWANIE ---
document.getElementById('btn-zaloguj').addEventListener('click', zaloguj);
document.getElementById('login-pin').addEventListener('keydown', e => { if (e.key === 'Enter') zaloguj(); });

async function zaloguj() {
    const kod = document.getElementById('login-kod').value.trim();
    const pin = document.getElementById('login-pin').value.trim();
    const status = document.getElementById('login-status');
    status.textContent = '';

    if (!kod || pin.length !== 4) {
        status.textContent = 'Podaj kod i 4-cyfrowy PIN.';
        return;
    }

    const wynik = await wywolajRPC('zaloguj', { p_kod: kod, p_pin: pin, p_zrodlo: 'pwa' });
    if (!wynik.sukces) {
        status.textContent = wynik.blad;
        return;
    }

    sesja = { ...wynik, pin };
    sessionStorage.setItem('sesja', JSON.stringify(sesja)); // tylko na czas karty przeglądarki

    if (sesja.is_admin || sesja.is_moderator) {
        document.getElementById('btn-panel-admina').classList.remove('hidden');
    }

    await pokazPanelMinistranta();
}

// Wznów sesję po odświeżeniu strony (PWA)
window.addEventListener('DOMContentLoaded', async () => {
    const zapisana = sessionStorage.getItem('sesja');
    if (zapisana) {
        sesja = JSON.parse(zapisana);
        if (sesja.is_admin || sesja.is_moderator) {
            document.getElementById('btn-panel-admina').classList.remove('hidden');
        }
        await pokazPanelMinistranta();
    }
});

document.getElementById('btn-wyloguj').addEventListener('click', wyloguj);
document.getElementById('btn-admin-wyloguj').addEventListener('click', wyloguj);
function wyloguj(e) {
    if (e) e.preventDefault();
    sesja = null;
    sessionStorage.removeItem('sesja');
    pokazWidok(widokLogin);
}

const NAZWY_MIESIECY = ['', 'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

function wypelnijSelektorMiesiecy(selectEl, wybranyMiesiac) {
    selectEl.innerHTML = NAZWY_MIESIECY.slice(1).map((nazwa, i) =>
        `<option value="${i + 1}" ${i + 1 === wybranyMiesiac ? 'selected' : ''}>${nazwa}</option>`
    ).join('');
}

// --- PANEL MINISTRANTA ---
async function pokazPanelMinistranta() {
    pokazWidok(widokMinistrant);
    document.getElementById('mm-imie').textContent = `${sesja.imie} ${sesja.nazwisko} (${sesja.kod})`;

    const teraz = new Date();
    wypelnijSelektorMiesiecy(document.getElementById('mm-hist-miesiac'), teraz.getMonth() + 1);
    document.getElementById('mm-hist-rok').value = teraz.getFullYear();

    const { data: ranking } = await supabaseClient.from('ranking_miesiac').select('*').order('pozycja');
    const wlasnyWiersz = (ranking || []).find(r => r.ministrant_id === sesja.id);
    document.getElementById('mm-punkty').textContent = wlasnyWiersz ? wlasnyWiersz.punkty_miesiac : 0;

    const tbodyRank = document.querySelector('#mm-ranking tbody');
    tbodyRank.innerHTML = (ranking || []).map(r =>
        `<tr class="${r.ministrant_id === sesja.id ? 'podswietlone' : ''}">
            <td>${r.pozycja}.</td><td>${r.imie} ${r.nazwisko}</td><td>${r.punkty_miesiac} pkt</td>
        </tr>`
    ).join('');

    await pokazMojaHistorie();
}

async function pokazMojaHistorie() {
    const miesiac = parseInt(document.getElementById('mm-hist-miesiac').value);
    const rok = parseInt(document.getElementById('mm-hist-rok').value);
    const tbody = document.querySelector('#mm-historia tbody');
    const sumaEl = document.getElementById('mm-hist-suma');

    const wynik = await wywolajRPC('moja_historia_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    if (!wynik.sukces) {
        tbody.innerHTML = `<tr><td colspan="4">❌ ${wynik.blad}</td></tr>`;
        sumaEl.textContent = '';
        return;
    }
    sumaEl.textContent = `Suma za ${NAZWY_MIESIECY[miesiac]} ${rok}: ${wynik.suma_punktow} pkt`;
    tbody.innerHTML = (wynik.historia || []).map(h => `
        <tr>
            <td>${h.nazwa}</td>
            <td>${new Date(h.data_wydarzenia).toLocaleDateString('pl-PL')}</td>
            <td>${h.zaliczone_jako}</td>
            <td>+${h.punkty} pkt</td>
        </tr>`).join('') || '<tr><td colspan="4">Brak obecności w tym miesiącu.</td></tr>';
}
document.getElementById('btn-mm-pokaz-historie').addEventListener('click', pokazMojaHistorie);

document.getElementById('btn-zmien-pin').addEventListener('click', async () => {
    const stary = document.getElementById('pin-stary').value.trim();
    const nowy = document.getElementById('pin-nowy').value.trim();
    const status = document.getElementById('zmien-pin-status');
    status.textContent = '';

    if (stary.length !== 4 || nowy.length !== 4) {
        status.textContent = 'Oba PIN-y muszą mieć 4 cyfry.'; return;
    }

    const wynik = await wywolajRPC('zmien_pin', { p_kod: sesja.kod, p_stary_pin: stary, p_nowy_pin: nowy });
    if (wynik.sukces) {
        status.textContent = '✅ PIN zmieniony. Zapamiętaj nowy PIN — zaloguj się nim od teraz.';
        sesja.pin = nowy;
        sessionStorage.setItem('sesja', JSON.stringify(sesja));
        document.getElementById('pin-stary').value = '';
        document.getElementById('pin-nowy').value = '';
    } else {
        status.textContent = '❌ ' + wynik.blad;
    }
});

document.getElementById('btn-panel-admina').addEventListener('click', (e) => { e.preventDefault(); pokazPanelAdmina(); });
document.getElementById('btn-admin-do-panelu-ministranta').addEventListener('click', (e) => { e.preventDefault(); pokazPanelMinistranta(); });

// --- PANEL ADMINA / MODERATORA ---
async function pokazPanelAdmina() {
    pokazWidok(widokAdmin);
    if (!sesja.is_admin) {
        document.getElementById('tab-karty').classList.add('hidden'); // tylko Admin generuje karty
        document.getElementById('mi-formularz-admin-only').classList.add('hidden'); // Ksiądz nie dodaje/edytuje kont
        document.querySelectorAll('.admin-only-akcja').forEach(el => el.classList.add('hidden'));
    } else {
        document.getElementById('mi-formularz-admin-only').classList.remove('hidden');
        document.querySelectorAll('.admin-only-akcja').forEach(el => el.classList.remove('hidden'));
    }
    await odswiezKalendarz();
    await odswiezListeMinistrantow();
}

document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ['kalendarz', 'ministranci', 'obecnosci', 'karty', 'zgloszenia', 'kioski', 'baza', 'bezpieczenstwo'].forEach(t => {
            document.getElementById('tab-content-' + t).classList.toggle('hidden', t !== btn.dataset.tab);
        });
        if (btn.dataset.tab === 'bezpieczenstwo') odswiezBezpieczenstwo();
        if (btn.dataset.tab === 'karty') odswiezRosterKart();
        if (btn.dataset.tab === 'obecnosci') odswiezObecnosciWszystkich();
        if (btn.dataset.tab === 'zgloszenia') odswiezZgloszenia();
        if (btn.dataset.tab === 'kioski') odswiezKioski();
        if (btn.dataset.tab === 'baza') odswiezBazaDanych();
    });
});

async function odswiezZgloszenia() {
    const status = document.getElementById('zg-filtr-status').value || null;
    const wynik = await wywolajRPC('lista_zgloszen', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: status });
    const tbody = document.querySelector('#tabela-zgloszenia tbody');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="7">❌ ${wynik.blad}</td></tr>`; return; }

    const NAZWY = { pogrzeb: '⚱️ Pogrzeb', slub: '💍 Ślub', inne: '📋 Inne' };
    const KOLOR_STATUSU = { oczekujace: 'var(--accent-4)', zatwierdzone: 'var(--ok)', odrzucone: 'var(--err)' };
    const ETYKIETA_STATUSU = { oczekujace: 'oczekujące', zatwierdzone: 'zatwierdzone', odrzucone: 'odrzucone' };

    tbody.innerHTML = (wynik.dane || []).map(z => {
        let akcja = '—';
        if (z.status === 'oczekujace') {
            const disabled = (z.ministrant_is_admin && !sesja.is_admin) ? 'disabled title="Nie można rozpatrzyć zgłoszenia Admina"' : '';
            akcja = `
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="number" min="0" placeholder="pkt" style="width:70px; margin:0;" id="zg-pkt-${z.id}" ${disabled}>
                    <button class="btn" style="width:auto; padding:6px 10px;" ${disabled} onclick="rozpatrzZgloszenie('${z.id}', 'zatwierdz')">Zatwierdź</button>
                    <button class="btn btn-danger" style="width:auto; padding:6px 10px;" ${disabled} onclick="rozpatrzZgloszenie('${z.id}', 'odrzuc')">Odrzuć</button>
                </div>`;
        }
        return `
        <tr>
            <td>${new Date(z.data_zgloszenia).toLocaleString('pl-PL')}</td>
            <td>${z.imie} ${z.nazwisko} (${z.ministrant_kod})${z.ministrant_is_admin ? ' 👑' : ''}</td>
            <td>${NAZWY[z.typ] || z.typ}</td>
            <td style="color:${KOLOR_STATUSU[z.status]}">${ETYKIETA_STATUSU[z.status]}</td>
            <td>${z.punkty ?? '—'}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${z.rozpatrzone_przez_kod ? `${z.rozpatrzone_przez_imie} ${z.rozpatrzone_przez_nazwisko}` : '—'}</td>
            <td>${akcja}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="7">Brak zgłoszeń.</td></tr>';
}
document.getElementById('btn-zg-odswiez').addEventListener('click', odswiezZgloszenia);
document.getElementById('zg-filtr-status').addEventListener('change', odswiezZgloszenia);

async function rozpatrzZgloszenie(id, decyzja) {
    let punkty = null;
    if (decyzja === 'zatwierdz') {
        const pole = document.getElementById(`zg-pkt-${id}`);
        punkty = parseInt(pole.value);
        if (isNaN(punkty) || punkty < 0) { alert('Podaj liczbę punktów (0 lub więcej).'); return; }
    }
    if (decyzja === 'odrzuc' && !confirm('Odrzucić to zgłoszenie?')) return;

    const wynik = await wywolajRPC('rozpatrz_zgloszenie', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
        p_zgloszenie_id: id, p_decyzja: decyzja, p_punkty: punkty
    });
    if (!wynik.sukces) alert('❌ ' + wynik.blad);
    await odswiezZgloszenia();
}

// --- MONITORING KIOSKÓW ---
let biezacaListaKioskow = [];
const NIEDOSTEPNE = '<span style="color:var(--text-dim)">niedostępne</span>';

function formatujDiagnostykeKiosku(d) {
    if (!d) return NIEDOSTEPNE;
    const wiersze = [
        ['Online (navigator)', d.online_navigator === true ? '✅ tak' : d.online_navigator === false ? '❌ nie' : null],
        ['Sieć potwierdzona (kiosk)', d.online_zweryfikowane === true ? '✅ tak' : d.online_zweryfikowane === false ? '❌ nie' : null],
        ['Typ sieci', d.siec_effective_type || d.siec_typ || null],
        ['Prędkość / RTT', (d.siec_downlink_mbps != null || d.siec_rtt_ms != null) ? `${d.siec_downlink_mbps ?? '?'} Mb/s, ${d.siec_rtt_ms ?? '?'} ms` : null],
        ['Rozdzielczość', d.rozdzielczosc || null],
        ['Karta widoczna', d.karta_widoczna === true ? 'tak' : d.karta_widoczna === false ? 'nie (w tle)' : null],
        ['Bateria', d.bateria_procent != null ? `${d.bateria_procent}%${d.bateria_ladowanie ? ' (ładuje się)' : ''}` : null],
        ['Rdzenie CPU / RAM', (d.rdzenie_cpu != null || d.pamiec_gb != null) ? `${d.rdzenie_cpu ?? '?'} rdzeni, ${d.pamiec_gb ?? '?'} GB` : null],
        ['Kolejka offline', d.offline_kolejka_dlugosc != null ? `${d.offline_kolejka_dlugosc} oczek.` : null],
        ['Język', d.jezyk || null]
    ];
    return '<div style="font-size:0.8rem; line-height:1.5;">' + wiersze.map(([etykieta, wartosc]) =>
        `<div><b>${etykieta}:</b> ${wartosc ?? NIEDOSTEPNE}</div>`
    ).join('') + '</div>';
}

async function odswiezKioski() {
    const wynik = await wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin });
    const tbody = document.querySelector('#tabela-kioski tbody');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="6">❌ ${wynik.blad}</td></tr>`; return; }
    biezacaListaKioskow = wynik.dane || [];

    tbody.innerHTML = biezacaListaKioskow.map((k, i) => `
        <tr>
            <td>
                <input type="text" value="${k.nazwa || ''}" id="kiosk-nazwa-${i}" style="margin:0; width:160px;">
                <button class="btn btn-secondary" style="width:auto; padding:4px 8px; margin-top:4px;" onclick="zapiszNazweKiosku('${k.kiosk_id}', ${i})">Zapisz nazwę</button>
            </td>
            <td style="color:${k.online ? 'var(--ok)' : 'var(--err)'}">${k.online ? '🟢 ONLINE' : '🔴 OFFLINE'}</td>
            <td style="font-size:0.85rem;">${k.ostatni_ping ? new Date(k.ostatni_ping).toLocaleString('pl-PL') : '— nigdy —'}</td>
            <td>${k.ostatnia_wersja || NIEDOSTEPNE}</td>
            <td>${formatujDiagnostykeKiosku(k.ostatnie_dane)}</td>
            <td><button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="otworzHistorieKiosku('${k.kiosk_id}', '${(k.nazwa || k.kiosk_id).replace(/'/g, "")}')">Historia</button></td>
        </tr>`).join('') || '<tr><td colspan="6">Żaden Kiosk nie wysłał jeszcze pingu.</td></tr>';
}
document.getElementById('btn-kioski-odswiez').addEventListener('click', odswiezKioski);

async function zapiszNazweKiosku(kioskId, indeks) {
    const nazwa = document.getElementById(`kiosk-nazwa-${indeks}`).value.trim();
    const wynik = await wywolajRPC('admin_nazwij_kiosk', { p_kod: sesja.kod, p_pin: sesja.pin, p_kiosk_id: kioskId, p_nazwa: nazwa });
    if (!wynik.sukces) alert('❌ ' + wynik.blad);
    await odswiezKioski();
}

async function otworzHistorieKiosku(kioskId, nazwa) {
    document.getElementById('historia-kiosku-tytul').textContent = `Historia pingów — ${nazwa}`;
    document.getElementById('panel-historia-kiosku').classList.remove('hidden');
    const wynik = await wywolajRPC('admin_historia_pingow', { p_kod: sesja.kod, p_pin: sesja.pin, p_kiosk_id: kioskId, p_limit: 100 });
    const tbody = document.getElementById('tabela-historia-kiosku');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="6">❌ ${wynik.blad}</td></tr>`; return; }
    tbody.innerHTML = (wynik.dane || []).map(p => {
        const d = p.dane || {};
        return `
        <tr>
            <td>${new Date(p.otrzymano).toLocaleString('pl-PL')}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${d.czas_urzadzenia ? new Date(d.czas_urzadzenia).toLocaleString('pl-PL') : NIEDOSTEPNE}</td>
            <td>${p.wersja || NIEDOSTEPNE}</td>
            <td>${d.online_navigator === true ? '✅' : d.online_navigator === false ? '❌' : NIEDOSTEPNE}</td>
            <td>${d.siec_effective_type || d.siec_typ || NIEDOSTEPNE}</td>
            <td>${d.offline_kolejka_dlugosc ?? NIEDOSTEPNE}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="6">Brak historii.</td></tr>';
}
document.getElementById('btn-zamknij-historie-kiosku').addEventListener('click', () => {
    document.getElementById('panel-historia-kiosku').classList.add('hidden');
});

// ============================================================================
// BAZA DANYCH — czytelny, przeszukiwalny podgląd wszystkiego naraz
// ============================================================================
const bazaDane = { uzytkownicy: [], plakietki: [], obecnosci: [], logowania: [], kioski: [], zgloszeniaOczekujace: [] };
let bazaAktywnyPodtab = 'uzytkownicy';

document.querySelectorAll('.subtabs button[data-podtab]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.subtabs button[data-podtab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        bazaAktywnyPodtab = btn.dataset.podtab;
        ['uzytkownicy', 'plakietki', 'obecnosci', 'logowania', 'kioski-baza', 'synchronizacja'].forEach(t => {
            document.getElementById('podtab-' + t).classList.toggle('hidden', t !== bazaAktywnyPodtab);
        });
        document.getElementById('baza-szukaj').value = '';
        renderujAktywnyPodtabBazy();
    });
});

document.getElementById('baza-szukaj').addEventListener('input', renderujAktywnyPodtabBazy);

function pasujeDoSzukania(tekstSzukany, ...pola) {
    if (!tekstSzukany) return true;
    const s = tekstSzukany.toLowerCase();
    return pola.some(p => (p == null ? '' : p).toString().toLowerCase().includes(s));
}

function renderujAktywnyPodtabBazy() {
    const szukaj = document.getElementById('baza-szukaj').value.trim();
    if (bazaAktywnyPodtab === 'uzytkownicy') renderujBazaUzytkownicy(szukaj);
    else if (bazaAktywnyPodtab === 'plakietki') renderujBazaPlakietki(szukaj);
    else if (bazaAktywnyPodtab === 'obecnosci') renderujBazaObecnosci(szukaj);
    else if (bazaAktywnyPodtab === 'logowania') renderujBazaLogowania(szukaj);
    else if (bazaAktywnyPodtab === 'kioski-baza') renderujBazaKioski(szukaj);
    else if (bazaAktywnyPodtab === 'synchronizacja') renderujBazaSynchronizacja(szukaj);
}

async function odswiezBazaDanych() {
    const teraz = new Date();
    if (!document.getElementById('baza-ob-miesiac').value) {
        wypelnijSelektorMiesiecy(document.getElementById('baza-ob-miesiac'), teraz.getMonth() + 1);
        document.getElementById('baza-ob-rok').value = teraz.getFullYear();
    }

    const wyniki = await Promise.all([
        wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin }),
        wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: null }),
        wywolajRPC('historia_logowan', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_filtr_kod: null, p_limit: 300 }),
        wywolajRPC('admin_lista_kioskow', { p_kod: sesja.kod, p_pin: sesja.pin }),
        wywolajRPC('lista_zgloszen', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_status: 'oczekujace' })
    ]);
    const uzytkownicy = wyniki[0], plakietki = wyniki[1], logowania = wyniki[2], kioski = wyniki[3], zgloszenia = wyniki[4];

    bazaDane.uzytkownicy = uzytkownicy.sukces ? uzytkownicy.dane : [];
    bazaDane.plakietki = plakietki.sukces ? plakietki.dane : [];
    bazaDane.logowania = logowania.sukces ? logowania.dane : [];
    bazaDane.kioski = kioski.sukces ? kioski.dane : [];
    bazaDane.zgloszeniaOczekujace = zgloszenia.sukces ? zgloszenia.dane : [];

    await pokazBazaObecnosci();
    renderujAktywnyPodtabBazy();
}

function renderujBazaUzytkownicy(szukaj) {
    const dane = bazaDane.uzytkownicy.filter(function(m) { return pasujeDoSzukania(szukaj, m.kod, m.imie, m.nazwisko); });
    document.querySelector('#tabela-baza-uzytkownicy tbody').innerHTML = dane.map(function(m) {
        var rola = m.is_admin ? '👑 Admin' : (m.is_moderator ? '⛪ Ksiądz' : 'Ministrant');
        var status = m.aktywny ? 'aktywny' : 'nieaktywny';
        var kolorStatus = m.aktywny ? 'var(--ok)' : 'var(--err)';
        var plakietkaInfo = m.liczba_aktywnych_plakietek > 0 ? (m.liczba_aktywnych_plakietek + ' aktywna') : '<span style="color:var(--text-dim)">brak</span>';
        var logDom = m.ostatnie_logowanie_pwa ? new Date(m.ostatnie_logowanie_pwa).toLocaleString('pl-PL') : '—';
        var logKiosk = m.ostatnie_logowanie_kiosk ? new Date(m.ostatnie_logowanie_kiosk).toLocaleString('pl-PL') : '—';
        return '<tr>' +
            '<td>' + m.kod + '</td>' +
            '<td>' + m.imie + ' ' + m.nazwisko + '</td>' +
            '<td>' + rola + '</td>' +
            '<td style="color:' + kolorStatus + '">' + status + '</td>' +
            '<td>' + plakietkaInfo + '</td>' +
            '<td>' + (m.pin_jawny == null ? '—' : m.pin_jawny) + '</td>' +
            '<td>' + m.punkty_miesiac + '</td>' +
            '<td style="font-size:0.8rem; color:var(--text-dim);">' + logDom + '</td>' +
            '<td style="font-size:0.8rem; color:var(--text-dim);">' + logKiosk + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="9">Brak wyników.</td></tr>';
}

function renderujBazaPlakietki(szukaj) {
    const dane = bazaDane.plakietki.filter(function(p) { return pasujeDoSzukania(szukaj, p.kod_plakietki, p.ministrant_kod, p.imie, p.nazwisko); });
    document.querySelector('#tabela-baza-plakietki tbody').innerHTML = dane.map(function(p) {
        var status = p.aktywna ? 'aktywna' : 'unieważniona';
        var kolor = p.aktywna ? 'var(--ok)' : 'var(--err)';
        var uniewazniono = p.uniewazniona_kiedy ? new Date(p.uniewazniona_kiedy).toLocaleString('pl-PL') : '—';
        return '<tr>' +
            '<td>' + p.kod_plakietki + '</td>' +
            '<td>' + p.imie + ' ' + p.nazwisko + ' (' + p.ministrant_kod + ')</td>' +
            '<td style="color:' + kolor + '">' + status + '</td>' +
            '<td style="font-size:0.85rem;">' + new Date(p.wygenerowano).toLocaleString('pl-PL') + '</td>' +
            '<td style="font-size:0.85rem; color:var(--text-dim);">' + uniewazniono + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="5">Brak wyników.</td></tr>';
}

async function pokazBazaObecnosci() {
    const miesiac = parseInt(document.getElementById('baza-ob-miesiac').value);
    const rok = parseInt(document.getElementById('baza-ob-rok').value);
    const wynik = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    bazaDane.obecnosci = wynik.sukces ? wynik.historia : [];
    if (bazaAktywnyPodtab === 'obecnosci') renderujBazaObecnosci(document.getElementById('baza-szukaj').value.trim());
}
document.getElementById('btn-baza-ob-pokaz').addEventListener('click', pokazBazaObecnosci);

function renderujBazaObecnosci(szukaj) {
    const dane = bazaDane.obecnosci.filter(function(h) { return pasujeDoSzukania(szukaj, h.kod, h.imie, h.nazwisko, h.nazwa, h.zaliczone_jako); });
    document.querySelector('#tabela-baza-obecnosci tbody').innerHTML = dane.map(function(h) {
        return '<tr>' +
            '<td style="font-size:0.85rem;">' + new Date(h.data_zapisu).toLocaleString('pl-PL') + '</td>' +
            '<td>' + h.imie + ' ' + h.nazwisko + ' (' + h.kod + ')</td>' +
            '<td>' + h.nazwa + '</td>' +
            '<td>' + h.zaliczone_jako + '</td>' +
            '<td>+' + h.punkty + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="5">Brak wyników.</td></tr>';
}

function renderujBazaLogowania(szukaj) {
    const dane = bazaDane.logowania.filter(function(l) { return pasujeDoSzukania(szukaj, l.kod, l.powod); });
    document.querySelector('#tabela-baza-logowania tbody').innerHTML = dane.map(function(l) {
        var wynikTekst = l.sukces ? '✅ sukces' : '❌ porażka';
        var kolor = l.sukces ? 'var(--ok)' : 'var(--err)';
        return '<tr>' +
            '<td style="font-size:0.85rem;">' + new Date(l.kiedy).toLocaleString('pl-PL') + '</td>' +
            '<td>' + l.kod + '</td>' +
            '<td style="color:' + kolor + '">' + wynikTekst + '</td>' +
            '<td>' + (l.powod || '—') + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="4">Brak wyników.</td></tr>';
}

function renderujBazaKioski(szukaj) {
    const dane = bazaDane.kioski.filter(function(k) { return pasujeDoSzukania(szukaj, k.nazwa, k.kiosk_id); });
    document.querySelector('#tabela-baza-kioski tbody').innerHTML = dane.map(function(k) {
        var status = k.online ? '🟢 ONLINE' : '🔴 OFFLINE';
        var kolor = k.online ? 'var(--ok)' : 'var(--err)';
        var ostatniPing = k.ostatni_ping ? new Date(k.ostatni_ping).toLocaleString('pl-PL') : '—';
        var kolejka = (k.ostatnie_dane && k.ostatnie_dane.offline_kolejka_dlugosc != null) ? k.ostatnie_dane.offline_kolejka_dlugosc : '—';
        return '<tr>' +
            '<td>' + (k.nazwa || k.kiosk_id) + '</td>' +
            '<td style="color:' + kolor + '">' + status + '</td>' +
            '<td style="font-size:0.85rem;">' + ostatniPing + '</td>' +
            '<td>' + (k.ostatnia_wersja || '—') + '</td>' +
            '<td>' + kolejka + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="5">Brak wyników.</td></tr>';
}

function renderujBazaSynchronizacja(szukaj) {
    const NAZWY = { pogrzeb: '⚱️ Pogrzeb', slub: '💍 Ślub', inne: '📋 Inne' };
    const zgl = bazaDane.zgloszeniaOczekujace.filter(function(z) { return pasujeDoSzukania(szukaj, z.imie, z.nazwisko, z.ministrant_kod, z.typ); });
    document.querySelector('#tabela-baza-sync-zgloszenia tbody').innerHTML = zgl.map(function(z) {
        return '<tr>' +
            '<td style="font-size:0.85rem;">' + new Date(z.data_zgloszenia).toLocaleString('pl-PL') + '</td>' +
            '<td>' + z.imie + ' ' + z.nazwisko + ' (' + z.ministrant_kod + ')</td>' +
            '<td>' + (NAZWY[z.typ] || z.typ) + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="3">Brak oczekujących zgłoszeń.</td></tr>';

    const kioskiZKolejka = bazaDane.kioski.filter(function(k) {
        var dl = (k.ostatnie_dane && k.ostatnie_dane.offline_kolejka_dlugosc) || 0;
        return dl > 0 && pasujeDoSzukania(szukaj, k.nazwa, k.kiosk_id);
    });
    document.querySelector('#tabela-baza-sync-kioski tbody').innerHTML = kioskiZKolejka.map(function(k) {
        var ostatniPing = k.ostatni_ping ? new Date(k.ostatni_ping).toLocaleString('pl-PL') : '—';
        return '<tr>' +
            '<td>' + (k.nazwa || k.kiosk_id) + '</td>' +
            '<td>' + k.ostatnie_dane.offline_kolejka_dlugosc + '</td>' +
            '<td style="font-size:0.85rem;">' + ostatniPing + '</td>' +
            '</tr>';
    }).join('') || '<tr><td colspan="3">Żaden Kiosk nie zgłasza obecnie zaległej kolejki offline.</td></tr>';
}

document.getElementById('btn-baza-synchronizuj').addEventListener('click', async () => {
    const status = document.getElementById('baza-sync-status');
    status.textContent = '⏳ Zlecam synchronizację i odświeżam dane…';
    const wynik = await wywolajRPC('admin_wymus_synchronizacje', { p_kod: sesja.kod, p_pin: sesja.pin });
    await odswiezBazaDanych();
    status.textContent = wynik.sukces
        ? '✅ Zlecono. Kioski, które mają teraz połączenie, odbiorą polecenie w ciągu ok. 20 sekund i wyślą zaległe dane. Urządzenia offline zrobią to, gdy wrócą do sieci.'
        : ('❌ ' + wynik.blad);
});

async function odswiezObecnosciWszystkich() {
    const teraz = new Date();
    const selMiesiac = document.getElementById('ob-miesiac');
    if (!selMiesiac.value) {
        wypelnijSelektorMiesiecy(selMiesiac, teraz.getMonth() + 1);
        document.getElementById('ob-rok').value = teraz.getFullYear();
    }
    await pokazObecnosciWszystkich();
}

async function pokazObecnosciWszystkich() {
    const miesiac = parseInt(document.getElementById('ob-miesiac').value);
    const rok = parseInt(document.getElementById('ob-rok').value);
    const tbody = document.querySelector('#tabela-obecnosci-wszystkich tbody');

    const wynik = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="5">❌ ${wynik.blad}</td></tr>`; return; }

    tbody.innerHTML = (wynik.historia || []).map(h => `
        <tr>
            <td>${new Date(h.data_zapisu).toLocaleString('pl-PL')}</td>
            <td>${h.imie} ${h.nazwisko} (${h.kod})</td>
            <td>${h.nazwa}</td>
            <td>${h.zaliczone_jako}</td>
            <td>+${h.punkty}</td>
        </tr>`).join('') || '<tr><td colspan="5">Brak obecności w tym miesiącu.</td></tr>';
}
document.getElementById('btn-ob-pokaz').addEventListener('click', pokazObecnosciWszystkich);

// Kalendarz
document.getElementById('nowe-blok').addEventListener('change', async (e) => {
    document.getElementById('blok-parowanie').classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) {
        const { data } = await supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(15);
        document.getElementById('blok-z-czym').innerHTML =
            '<option value="">— nie łącz, zacznij nowy blok —</option>' +
            (data || []).map(w => `<option value="${w.id}|${w.polaczone_id || ''}">${w.nazwa}</option>`).join('');
    }
});

document.getElementById('btn-dodaj-wydarzenie').addEventListener('click', async () => {
    const typ = document.getElementById('nowe-typ').value;
    const nazwa = document.getElementById('nowe-nazwa').value.trim();
    const dataVal = document.getElementById('nowe-data').value;
    const przed = parseInt(document.getElementById('nowe-przed').value) || 15;
    const po = parseInt(document.getElementById('nowe-po').value) || 5;
    const status = document.getElementById('wydarzenie-status');

    if (!nazwa || !dataVal) { status.textContent = 'Podaj nazwę i datę.'; return; }

    let polaczoneId = null;
    if (document.getElementById('nowe-blok').checked) {
        const wybor = document.getElementById('blok-z-czym').value;
        if (wybor) {
            const [innyId, istniejacyPolaczoneId] = wybor.split('|');
            polaczoneId = istniejacyPolaczoneId || innyId; // jeśli para nie miała jeszcze polaczone_id, użyj jej id jako wspólnego identyfikatora
            // Uwaga: jeśli innyId nie miał polaczone_id, trzeba by je ustawić na obu — patrz docs/WDROZENIE.md, sekcja "Bloki".
        } else {
            polaczoneId = crypto.randomUUID(); // nowy blok — to wydarzenie będzie jego pierwszą częścią
        }
    }

    const wynik = await wywolajRPC('dodaj_wydarzenie', {
        p_kod: sesja.kod, p_pin: sesja.pin, p_typ: typ, p_nazwa: nazwa,
        p_data_wydarzenia: new Date(dataVal).toISOString(),
        p_minuty_przed: przed, p_minuty_po: po, p_polaczone_id: polaczoneId
    });

    status.textContent = wynik.sukces ? '✅ Dodano.' : ('❌ ' + wynik.blad);
    if (wynik.sukces) { document.getElementById('nowe-nazwa').value = ''; await odswiezKalendarz(); }
});

async function odswiezKalendarz() {
    const { data } = await supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(50);
    document.querySelector('#tabela-kalendarz tbody').innerHTML = (data || []).map(w => `
        <tr>
            <td>${w.nazwa}${w.polaczone_id ? ' 🔗' : ''}</td>
            <td>${w.typ}</td>
            <td>${new Date(w.data_wydarzenia).toLocaleString('pl-PL')}</td>
            <td>${new Date(w.okno_start).toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})}–${new Date(w.okno_koniec).toLocaleTimeString('pl-PL', {hour:'2-digit',minute:'2-digit'})}</td>
        </tr>`).join('');
}

// Ministranci — dodawanie / edycja / PIN / dezaktywacja / plakietki
let edytowanyMinistrantId = null; // null = tryb "dodaj", ustawiony = tryb "edytuj"
let biezacaListaMinistrantow = [];

document.getElementById('btn-dodaj-ministranta').addEventListener('click', async () => {
    const imie = document.getElementById('mi-imie').value.trim();
    const nazwisko = document.getElementById('mi-nazwisko').value.trim();
    const kod = document.getElementById('mi-kod').value.trim();
    const pin = document.getElementById('mi-pin').value.trim();
    const jestModeratorem = document.getElementById('mi-moderator').checked;
    const status = document.getElementById('ministrant-status');
    status.textContent = '';

    if (!imie || !nazwisko || !kod) { status.textContent = 'Uzupełnij imię, nazwisko i kod.'; return; }

    if (edytowanyMinistrantId) {
        // --- TRYB EDYCJI ---
        const wynik = await wywolajRPC('admin_edytuj_ministranta', {
            p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
            p_ministrant_id: edytowanyMinistrantId,
            p_nowe_imie: imie, p_nowe_nazwisko: nazwisko, p_nowy_kod: kod,
            p_is_moderator: jestModeratorem
        });
        if (!wynik.sukces) { status.textContent = '❌ ' + wynik.blad; return; }

        // Jeśli podano też nowy PIN przy edycji — zresetuj go od razu (admin zna nowy PIN, nie musi znać starego)
        if (pin.length === 4) {
            const wynikPin = await wywolajRPC('admin_zmien_pin_ministranta', {
                p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
                p_ministrant_id: edytowanyMinistrantId, p_nowy_pin: pin
            });
            if (!wynikPin.sukces) { status.textContent = '⚠️ Dane zapisane, ale PIN nie: ' + wynikPin.blad; }
        }
        status.textContent = status.textContent || '✅ Zapisano zmiany.';
        zakonczEdycjeMinistranta();
        await odswiezListeMinistrantow();
        return;
    }

    // --- TRYB DODAWANIA ---
    if (pin.length !== 4) { status.textContent = 'PIN musi mieć 4 cyfry.'; return; }
    const wynik = await wywolajRPC('admin_dodaj_ministranta', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
        p_imie: imie, p_nazwisko: nazwisko, p_nowy_kod: kod, p_nowy_pin: pin,
        p_is_moderator: jestModeratorem
    });
    status.textContent = wynik.sukces ? `✅ Dodano ${kod}.` : ('❌ ' + wynik.blad);
    if (wynik.sukces) {
        ['mi-imie','mi-nazwisko','mi-kod','mi-pin'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('mi-moderator').checked = false;
        await odswiezListeMinistrantow();
    }
});

function rozpocznijEdycjeMinistranta(id) {
    const m = biezacaListaMinistrantow.find(x => x.id === id);
    if (!m) return;
    edytowanyMinistrantId = id;
    document.getElementById('mi-tytul-formularza').textContent = `Edytuj: ${m.imie} ${m.nazwisko}`;
    document.getElementById('mi-imie').value = m.imie;
    document.getElementById('mi-nazwisko').value = m.nazwisko;
    document.getElementById('mi-kod').value = m.kod;
    document.getElementById('mi-pin').value = '';
    document.getElementById('mi-pin').placeholder = 'Nowy PIN (zostaw puste, by nie zmieniać)';
    document.getElementById('mi-moderator').checked = !!m.is_moderator;
    document.getElementById('btn-dodaj-ministranta').textContent = 'Zapisz zmiany';
    document.getElementById('btn-anuluj-edycje').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function zakonczEdycjeMinistranta() {
    edytowanyMinistrantId = null;
    document.getElementById('mi-tytul-formularza').textContent = 'Dodaj ministranta';
    ['mi-imie','mi-nazwisko','mi-kod','mi-pin'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('mi-pin').placeholder = 'PIN (4 cyfry)';
    document.getElementById('mi-moderator').checked = false;
    document.getElementById('btn-dodaj-ministranta').textContent = 'Dodaj';
    document.getElementById('btn-anuluj-edycje').classList.add('hidden');
}
document.getElementById('btn-anuluj-edycje').addEventListener('click', zakonczEdycjeMinistranta);

async function przelaczRoleModeratora(id, nowaWartosc) {
    const wynik = await wywolajRPC('admin_ustaw_moderatora', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: id, p_is_moderator: nowaWartosc });
    if (!wynik.sukces) alert('❌ ' + wynik.blad);
    await odswiezListeMinistrantow();
}

async function odswiezListeMinistrantow() {
    const wynik = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    if (!wynik.sukces) {
        document.querySelector('#tabela-ministranci tbody').innerHTML = `<tr><td colspan="9">❌ ${wynik.blad}</td></tr>`;
        return;
    }
    biezacaListaMinistrantow = wynik.dane || [];
    document.querySelector('#tabela-ministranci tbody').innerHTML = biezacaListaMinistrantow.map(m => {
        const ostatnieLogowanie = m.ostatnie_logowanie_pwa ? new Date(m.ostatnie_logowanie_pwa).toLocaleString('pl-PL') : '— nigdy —';
        const ostatniKiosk = m.ostatnie_logowanie_kiosk ? new Date(m.ostatnie_logowanie_kiosk).toLocaleString('pl-PL') : '— nigdy —';
        let akcje = `<button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="otworzPlakietki('${m.id}', '${m.imie} ${m.nazwisko}')">Plakietki</button>`;
        if (sesja.is_admin && !m.is_admin) {
            akcje = `<button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="rozpocznijEdycjeMinistranta('${m.id}')">Edytuj</button>` + akcje;
            akcje += m.is_moderator
                ? `<button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="przelaczRoleModeratora('${m.id}', false)">Odbierz rolę Księdza</button>`
                : `<button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="przelaczRoleModeratora('${m.id}', true)">Nadaj rolę Księdza</button>`;
            akcje += m.aktywny
                ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="dezaktywujMinistranta('${m.id}')">Dezaktywuj</button>`
                : `<button class="btn" style="width:auto; padding:6px 10px;" onclick="przywrocMinistranta('${m.id}')">Przywróć</button>`;
        } else if (m.is_admin) {
            akcje += ` <span style="color:var(--text-dim); font-size:0.8rem;">konto chronione</span>`;
        }
        return `
        <tr>
            <td>${m.kod}</td>
            <td>${m.imie} ${m.nazwisko}${m.is_admin ? ' 👑' : ''}${m.is_moderator ? ' ⛪' : ''}</td>
            <td>${m.pin_jawny ?? '—'}</td>
            <td>${m.punkty_miesiac}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${ostatnieLogowanie}</td>
            <td style="font-size:0.85rem; color:var(--text-dim);">${ostatniKiosk}</td>
            <td style="color:${m.aktywny ? 'var(--ok)' : 'var(--err)'}">${m.aktywny ? 'aktywny' : 'nieaktywny'}</td>
            <td>${m.liczba_aktywnych_plakietek}</td>
            <td style="white-space:nowrap;">${akcje}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="9">Brak ministrantów.</td></tr>';
}

async function dezaktywujMinistranta(id) {
    if (!confirm('Dezaktywować to konto? Nie będzie mogło się logować, a jego karty (plakietki) przestaną działać w Kiosku. Historia obecności zostaje zachowana.')) return;
    const wynik = await wywolajRPC('admin_usun_ministranta', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: id });
    document.getElementById('ministrant-status').textContent = wynik.sukces ? '✅ Konto dezaktywowane.' : ('❌ ' + wynik.blad);
    await odswiezListeMinistrantow();
}

async function przywrocMinistranta(id) {
    const wynik = await wywolajRPC('admin_przywroc_ministranta', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: id });
    document.getElementById('ministrant-status').textContent = wynik.sukces ? ('✅ ' + (wynik.informacja || 'Przywrócono.')) : ('❌ ' + wynik.blad);
    await odswiezListeMinistrantow();
}

// --- PANEL PLAKIETEK (dla jednego ministranta, z poziomu zakładki Ministranci) ---
let plakietkiDlaMinistrantaId = null;

async function otworzPlakietki(ministrantId, imieNazwisko) {
    plakietkiDlaMinistrantaId = ministrantId;
    document.getElementById('plakietki-tytul').textContent = `Plakietki: ${imieNazwisko}`;
    document.getElementById('panel-plakietki').classList.remove('hidden');
    await odswiezPanelPlakietek();
}
document.getElementById('btn-zamknij-plakietki').addEventListener('click', () => {
    document.getElementById('panel-plakietki').classList.add('hidden');
    plakietkiDlaMinistrantaId = null;
});

async function odswiezPanelPlakietek() {
    const wynik = await wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: plakietkiDlaMinistrantaId });
    const tbody = document.getElementById('tabela-plakietki');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="4">❌ ${wynik.blad}</td></tr>`; return; }
    window._plakietkiPanelu = wynik.dane || [];
    tbody.innerHTML = window._plakietkiPanelu.map((p, i) => `
        <tr>
            <td>${p.kod_plakietki}</td>
            <td>${new Date(p.wygenerowano).toLocaleString('pl-PL')}</td>
            <td style="color:${p.aktywna ? 'var(--ok)' : 'var(--err)'}">${p.aktywna ? 'aktywna' : 'unieważniona'}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="pokazPodgladPojedynczej(window._plakietkiPanelu[${i}])">Podgląd</button>
                ${(p.aktywna && sesja.is_admin) ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="uniewaznijPlakietkeZPanelu('${p.kod_plakietki}')">Unieważnij</button>` : ''}
            </td>
        </tr>`).join('') || '<tr><td colspan="4">Brak wydanych plakietek.</td></tr>';
}

document.getElementById('btn-nowa-plakietka').addEventListener('click', async () => {
    const wynik = await wywolajRPC('admin_generuj_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: plakietkiDlaMinistrantaId });
    if (!wynik.sukces) { alert('❌ ' + wynik.blad); return; }
    await odswiezPanelPlakietek();
    await odswiezListeMinistrantow();
});

async function uniewaznijPlakietkeZPanelu(kodPlakietki) {
    if (!confirm(`Unieważnić plakietkę ${kodPlakietki}? Ten kod QR natychmiast przestanie działać w Kiosku.`)) return;
    const wynik = await wywolajRPC('admin_uniewaznij_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kod_plakietki: kodPlakietki });
    if (!wynik.sukces) alert('❌ ' + wynik.blad);
    await odswiezPanelPlakietek();
    await odswiezListeMinistrantow();
}

// --- BEZPIECZEŃSTWO: zablokowane kody + log korekt (tylko Admin widzi odblokowanie, ale log widzi też Moderator) ---
let biezacyLogKorekt = [];

async function odswiezBezpieczenstwo() {
    const { data: zablokowane } = await supabaseClient.from('zablokowane_kody').select('*');
    document.querySelector('#tabela-zablokowane tbody').innerHTML = (zablokowane || []).map(z => `
        <tr>
            <td>${z.kod}</td>
            <td>${z.nieudane_proby}</td>
            <td>${new Date(z.zablokowane_do).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}</td>
            <td><button class="btn btn-secondary" style="width:auto; padding:6px 12px;" onclick="odblokujKod('${z.kod}')">Odblokuj</button></td>
        </tr>`).join('') || '<tr><td colspan="4">Brak zablokowanych kodów.</td></tr>';

    const { data: log } = await supabaseClient.from('log_korekt_czytelny').select('*').limit(200);
    biezacyLogKorekt = log || [];
    document.querySelector('#tabela-log-korekt tbody').innerHTML = biezacyLogKorekt.map(l => `
        <tr>
            <td>${new Date(l.kiedy).toLocaleString('pl-PL')}</td>
            <td>${l.kto_pelne_imie} (${l.kto})</td>
            <td>${l.komu_pelne_imie} (${l.komu_kod})</td>
            <td>${l.wydarzenie} — ${l.zaliczone_jako}</td>
            <td>${l.punkty_przed ?? '—'} → ${l.punkty_po}</td>
        </tr>`).join('') || '<tr><td colspan="5">Brak korekt ręcznych.</td></tr>';

    document.getElementById('raport-rok').value = document.getElementById('raport-rok').value || new Date().getFullYear();
    document.getElementById('raport-miesiac').value = new Date().getMonth() + 1;

    await odswiezHistorieLogowan();
}

const POWODY_PL = {
    ok: 'zalogowano',
    zly_pin: 'zły PIN',
    nieznany_kod: 'nieznany kod',
    zablokowany: 'zablokowany (odrzucono)'
};

async function odswiezHistorieLogowan() {
    const filtr = document.getElementById('historia-logowan-filtr').value.trim() || null;
    const wynik = await wywolajRPC('historia_logowan', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_filtr_kod: filtr, p_limit: 200 });
    const tbody = document.querySelector('#tabela-historia-logowan tbody');
    if (!wynik.sukces) {
        tbody.innerHTML = `<tr><td colspan="4">❌ ${wynik.blad}</td></tr>`;
        return;
    }
    tbody.innerHTML = (wynik.dane || []).map(l => `
        <tr>
            <td>${new Date(l.kiedy).toLocaleString('pl-PL')}</td>
            <td>${l.kod}</td>
            <td style="color:${l.sukces ? 'var(--ok)' : 'var(--err)'}">${l.sukces ? '✅ sukces' : '❌ porażka'}</td>
            <td>${POWODY_PL[l.powod] || l.powod || '—'}</td>
        </tr>`).join('') || '<tr><td colspan="4">Brak zapisanych prób logowania.</td></tr>';
}

document.getElementById('btn-odswiez-historie-logowan').addEventListener('click', odswiezHistorieLogowan);

async function odblokujKod(kod) {
    const wynik = await wywolajRPC('admin_odblokuj_kod', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kod_do_odblokowania: kod });
    document.getElementById('odblokuj-status').textContent = wynik.sukces ? ('✅ ' + (wynik.informacja || 'Odblokowano.')) : ('❌ ' + wynik.blad);
    await odswiezBezpieczenstwo();
}

document.getElementById('btn-odblokuj-recznie').addEventListener('click', () => {
    const kod = document.getElementById('odblokuj-kod-input').value.trim();
    if (!kod) return;
    odblokujKod(kod);
    document.getElementById('odblokuj-kod-input').value = '';
});

// --- Eksport logu korekt: CSV ---
document.getElementById('btn-eksport-log-csv').addEventListener('click', () => {
    if (biezacyLogKorekt.length === 0) { alert('Brak danych do eksportu.'); return; }
    const naglowki = ['Kiedy', 'Kto (kod)', 'Kto (imię)', 'Komu (kod)', 'Komu (imię)', 'Wydarzenie', 'Zaliczone jako', 'Punkty przed', 'Punkty po'];
    const wiersze = biezacyLogKorekt.map(l => [
        new Date(l.kiedy).toLocaleString('pl-PL'), l.kto, l.kto_pelne_imie, l.komu_kod, l.komu_pelne_imie,
        l.wydarzenie, l.zaliczone_jako, l.punkty_przed ?? '', l.punkty_po
    ]);
    const csv = [naglowki, ...wiersze].map(w => w.map(pole => `"${String(pole).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `log-korekt-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
});

// --- Eksport logu korekt: PDF ---
document.getElementById('btn-eksport-log-pdf').addEventListener('click', () => {
    if (biezacyLogKorekt.length === 0) { alert('Brak danych do eksportu.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFontSize(14);
    doc.text('E-Ministranci — Log korekt ręcznych', 14, 15);
    doc.setFontSize(8);
    let y = 25;
    doc.text('Kiedy', 14, y); doc.text('Kto', 45, y); doc.text('Komu', 80, y); doc.text('Wydarzenie', 115, y); doc.text('Pkt', 170, y);
    y += 5;
    doc.setDrawColor(200); doc.line(14, y - 3, 196, y - 3);
    biezacyLogKorekt.forEach(l => {
        if (y > 280) { doc.addPage(); y = 15; }
        doc.text(new Date(l.kiedy).toLocaleString('pl-PL'), 14, y);
        doc.text(`${l.kto_pelne_imie}`, 45, y);
        doc.text(`${l.komu_pelne_imie}`, 80, y);
        doc.text(`${l.wydarzenie} (${l.zaliczone_jako})`, 115, y, { maxWidth: 50 });
        doc.text(`${l.punkty_przed ?? '—'}→${l.punkty_po}`, 170, y);
        y += 6;
    });
    doc.save(`log-korekt-${new Date().toISOString().slice(0,10)}.pdf`);
});

// --- RAPORT MIESIĘCZNY (dowolny wybrany miesiąc, nie tylko bieżący) ---
document.getElementById('btn-generuj-raport').addEventListener('click', async () => {
    const rok = parseInt(document.getElementById('raport-rok').value);
    const miesiac = parseInt(document.getElementById('raport-miesiac').value);
    const status = document.getElementById('raport-status');
    status.textContent = '';

    if (!rok || rok < 2000 || rok > 2100) { status.textContent = 'Podaj poprawny rok.'; return; }

    status.textContent = 'Generuję raport…';
    const wynik = await wywolajRPC('raport_miesiac', { p_kod: sesja.kod, p_pin: sesja.pin, p_rok: rok, p_miesiac: miesiac });
    if (!wynik.sukces) { status.textContent = '❌ ' + wynik.blad; return; }

    const nazwyMiesiecy = ['', 'Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    // --- Strona 1: Ranking miesiąca ---
    doc.setFontSize(16);
    doc.text(`Raport — ${nazwyMiesiecy[miesiac]} ${rok}`, 14, 18);
    doc.setFontSize(12);
    doc.text('Ranking miesiąca', 14, 28);
    doc.setFontSize(9);
    let y = 36;
    doc.text('Poz.', 14, y); doc.text('Kod', 30, y); doc.text('Imię i nazwisko', 55, y); doc.text('Punkty', 160, y);
    y += 5; doc.setDrawColor(200); doc.line(14, y - 3, 196, y - 3);
    wynik.ranking.forEach(r => {
        if (y > 280) { doc.addPage(); y = 15; }
        doc.text(`${r.pozycja}.`, 14, y);
        doc.text(r.kod, 30, y);
        doc.text(`${r.imie} ${r.nazwisko}`, 55, y);
        doc.text(String(r.punkty), 160, y);
        y += 6;
    });

    // --- Kolejna strona: pełna historia obecności ---
    doc.addPage();
    doc.setFontSize(12);
    doc.text(`Historia obecności — ${nazwyMiesiecy[miesiac]} ${rok}`, 14, 18);
    doc.setFontSize(8);
    y = 26;
    doc.text('Data', 14, y); doc.text('Ministrant', 42, y); doc.text('Wydarzenie', 100, y); doc.text('Zaliczone jako', 155, y); doc.text('Pkt', 188, y);
    y += 5; doc.setDrawColor(200); doc.line(14, y - 3, 196, y - 3);
    wynik.historia.forEach(h => {
        if (y > 285) { doc.addPage(); y = 15; }
        doc.text(new Date(h.data_zapisu).toLocaleDateString('pl-PL'), 14, y);
        doc.text(`${h.imie} ${h.nazwisko}`, 42, y);
        doc.text(h.nazwa, 100, y, { maxWidth: 52 });
        doc.text(h.zaliczone_jako, 155, y);
        doc.text(String(h.punkty), 188, y);
        y += 5.5;
    });

    doc.save(`raport-${rok}-${String(miesiac).padStart(2,'0')}.pdf`);
    status.textContent = '✅ Raport pobrany.';
});

// --- GENERATOR KART (QR ONLY) — zaznaczasz komu wydrukować kartę, PIN widoczny automatycznie ---
let rosterKart = [];              // pełna lista ministrantów (z admin_lista_ministrantow, ma pin_jawny)
let zaznaczeniDoWydruku = new Set(); // id ministrantów zaznaczonych checkboxem

async function odswiezRosterKart() {
    const wynik = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    if (!wynik.sukces) {
        document.getElementById('karty-lista').innerHTML = `<p>❌ ${wynik.blad}</p>`;
        return;
    }
    rosterKart = (wynik.dane || []).filter(m => m.aktywny);
    renderujListeKart();
    await odswiezWszystkiePlakietki();
}

function renderujListeKart() {
    const cont = document.getElementById('karty-lista');
    cont.innerHTML = rosterKart.map(m => `
        <label style="display:flex; align-items:center; gap:10px; padding:8px; border-bottom:1px solid #2a3550;">
            <input type="checkbox" style="width:auto" ${zaznaczeniDoWydruku.has(m.id) ? 'checked' : ''}
                   onchange="this.checked ? zaznaczeniDoWydruku.add('${m.id}') : zaznaczeniDoWydruku.delete('${m.id}')">
            <span style="flex:1">${m.kod} — ${m.imie} ${m.nazwisko}</span>
            <span style="color:var(--text-dim)">PIN: ${m.pin_jawny ?? '—'}</span>
        </label>`).join('') || '<p style="color:var(--text-dim)">Brak aktywnych ministrantów.</p>';
}

document.getElementById('btn-generuj-pdf').addEventListener('click', async () => {
    const status = document.getElementById('karty-status');
    const wybrani = rosterKart.filter(m => zaznaczeniDoWydruku.has(m.id));
    if (wybrani.length === 0) { status.textContent = 'Zaznacz przynajmniej jednego ministranta.'; return; }

    status.textContent = 'Generuję plakietki…';
    const wygenerowane = [];

    for (const m of wybrani) {
        // Nowa, unikalna plakietka dla tej karty (osobny kod w QR, można później unieważnić bez ruszania konta)
        const plakietka = await wywolajRPC('admin_generuj_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: m.id });
        if (!plakietka.sukces) { status.textContent = `❌ Błąd dla ${m.kod}: ${plakietka.blad}`; continue; }
        wygenerowane.push({ ...m, kod_plakietki: plakietka.kod_plakietki, wygenerowano: plakietka.wygenerowano, aktywna: true });
    }

    status.textContent = `✅ Wygenerowano ${wygenerowane.length} plakietek. Zobacz podgląd niżej, potem pobierz lub wydrukuj.`;
    renderujPodgladWygenerowanych(wygenerowane);
    zaznaczeniDoWydruku.clear();
    renderujListeKart();
    await odswiezListeMinistrantow();
    await odswiezWszystkiePlakietki();
});

// --- Podgląd świeżo wygenerowanych plakietek (przed pobraniem/wydrukiem) ---
function renderujPodgladWygenerowanych(lista) {
    let cont = document.getElementById('podglad-nowych-plakietek');
    if (!cont) {
        cont = document.createElement('div');
        cont.id = 'podglad-nowych-plakietek';
        document.getElementById('karty-status').after(cont);
    }
    if (lista.length === 0) { cont.innerHTML = ''; return; }

    cont.innerHTML = `
        <h3 style="margin-top:20px;">Podgląd wygenerowanych plakietek</h3>
        <div id="miniaturki-plakietek" style="display:flex; flex-wrap:wrap; gap:14px;"></div>
        <div style="display:flex; gap:8px; margin-top:14px;">
            <button class="btn" id="btn-pobierz-wszystkie">📥 Pobierz wszystkie (PDF)</button>
            <button class="btn btn-secondary" id="btn-drukuj-wszystkie">🖨️ Drukuj wszystkie</button>
        </div>`;

    const miniaturki = document.getElementById('miniaturki-plakietek');
    lista.forEach(m => {
        const wrap = document.createElement('div');
        wrap.style.width = '210px';
        renderujMiniaturkeA4(wrap, m);
        miniaturki.appendChild(wrap);
    });

    document.getElementById('btn-pobierz-wszystkie').addEventListener('click', async () => {
        const doc = await zbudujPdfDlaListy(lista);
        doc.save('karty-ministranci.pdf');
    });
    document.getElementById('btn-drukuj-wszystkie').addEventListener('click', async () => {
        const doc = await zbudujPdfDlaListy(lista);
        drukujDokument(doc);
    });
}

// --- Miniaturka A4 na ekranie (proporcje 210:297, do podglądu przed drukiem) ---
async function renderujMiniaturkeA4(kontener, m) {
    const dataTekst = formatujDatePelna(m.wygenerowano);
    const qrDataUrl = await QRCode.toDataURL(m.kod_plakietki, { margin: 1, width: 300 });
    kontener.innerHTML = `
        <div style="background:white; color:#111; border-radius:6px; overflow:hidden; box-shadow:0 4px 14px rgba(0,0,0,0.4);
                    aspect-ratio:210/297; width:100%; display:flex; flex-direction:column; position:relative; font-family:sans-serif;
                    ${m.aktywna === false ? 'filter:grayscale(1);' : ''}">
            ${m.aktywna === false ? `<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; z-index:2;">
                <div style="background:rgba(200,0,0,0.85); color:white; font-weight:800; padding:6px 16px; border-radius:6px; transform:rotate(-18deg); font-size:0.9rem;">UNIEWAŻNIONA</div>
            </div>` : ''}
            <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:6% 8% 2%; border-bottom:1px dashed #999;">
                <div style="font-size:0.55rem; color:#888; margin-bottom:4%;">E-Ministranci — Karta Ministranta</div>
                <img src="${qrDataUrl}" style="width:55%; aspect-ratio:1/1;">
                <div style="font-weight:800; font-size:0.85rem; margin-top:4%; text-align:center;">${m.imie} ${m.nazwisko}</div>
                <div style="font-size:0.7rem; color:#555;">Kod: ${m.kod}</div>
            </div>
            <div style="flex:0 0 22%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; padding:2%;">
                <div style="font-size:0.5rem; color:#999;">PIN — ${m.kod}</div>
                <div style="font-size:1rem; font-weight:800; color:#333; letter-spacing:2px;">${m.pin_jawny || '----'}</div>
                <div style="font-size:0.45rem; color:#aaa; margin-top:2%;">Nr plakietki: ${m.kod_plakietki}</div>
                <div style="font-size:0.45rem; color:#aaa;">Wygenerowano: ${dataTekst}</div>
            </div>
        </div>`;
}

function formatujDatePelna(iso) {
    const d = new Date(iso);
    return d.toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// --- Budowa PDF (A4) dla listy plakietek — góra: QR+kod+imię+nazwisko; dół: PIN+nr plakietki+data ---
async function zbudujPdfDlaListy(lista) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let pierwsza = true;
    for (const m of lista) {
        if (!pierwsza) doc.addPage();
        pierwsza = false;
        await narysujStronePlakietki(doc, m);
    }
    return doc;
}

async function narysujStronePlakietki(doc, m) {
    const dataTekst = formatujDatePelna(m.wygenerowano);

    // ================= GÓRA STRONY: kod QR, kod ministranta, imię, nazwisko =================
    doc.setDrawColor(150);
    doc.roundedRect(20, 20, 170, 120, 6, 6);

    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text('E-Ministranci — Karta Ministranta', 30, 34);
    doc.setTextColor(0);

    const qrDataUrl = await QRCode.toDataURL(m.kod_plakietki, { margin: 1, width: 400 });
    const qrRozmiar = 70;
    doc.addImage(qrDataUrl, 'PNG', 105 - qrRozmiar / 2, 40, qrRozmiar, qrRozmiar);

    doc.setFontSize(20);
    doc.text(`${m.imie} ${m.nazwisko}`, 105, 122, { align: 'center' });
    doc.setFontSize(13);
    doc.setTextColor(90);
    doc.text(`Kod: ${m.kod}`, 105, 132, { align: 'center' });
    doc.setTextColor(0);

    if (m.aktywna === false) {
        doc.setFontSize(22);
        doc.setTextColor(200, 0, 0);
        doc.text('UNIEWAŻNIONA', 105, 90, { align: 'center', angle: 20 });
        doc.setTextColor(0);
    }

    // ================= LINIA DO PRZECIĘCIA =================
    const yLinia = 155;
    doc.setDrawColor(150);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(15, yLinia, 195, yLinia);
    doc.setLineDashPattern([], 0);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('✂ — odetnij i przechowuj osobno —', 105, yLinia - 2, { align: 'center' });
    doc.setTextColor(0);

    // ================= DÓŁ STRONY: PIN, kod identyfikacyjny plakietki, dokładna data wygenerowania =================
    doc.roundedRect(45, yLinia + 15, 120, 45, 4, 4);
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(`PIN — ${m.kod}`, 105, yLinia + 26, { align: 'center' });
    doc.setFontSize(20);
    doc.setTextColor(50);
    doc.text(m.pin_jawny || '----', 105, yLinia + 38, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Nr plakietki: ${m.kod_plakietki}`, 105, yLinia + 47, { align: 'center' });
    doc.text(`Wygenerowano: ${dataTekst}`, 105, yLinia + 53, { align: 'center' });
    doc.setTextColor(0);
}

function drukujDokument(doc) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
}

// --- Modal: podgląd / pobierz / drukuj POJEDYNCZEJ, już istniejącej plakietki ---
async function pokazPodgladPojedynczej(p) {
    const dane = {
        imie: p.imie, nazwisko: p.nazwisko, kod: p.ministrant_kod,
        pin_jawny: p.pin_jawny, kod_plakietki: p.kod_plakietki,
        wygenerowano: p.wygenerowano, aktywna: p.aktywna
    };
    let modal = document.getElementById('modal-podglad-plakietki');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modal-podglad-plakietki';
        modal.style = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="card" style="max-width:340px; width:100%; max-height:90vh; overflow:auto;">
            <div class="top-bar"><h3>Podgląd plakietki</h3><a href="#" id="btn-zamknij-modal-podglad">Zamknij ✕</a></div>
            <div id="modal-miniaturka"></div>
            <div style="display:flex; gap:8px; margin-top:14px;">
                ${dane.aktywna ? `<button class="btn" id="modal-btn-pobierz">📥 Pobierz</button>
                <button class="btn btn-secondary" id="modal-btn-drukuj">🖨️ Drukuj</button>` : '<p style="color:var(--text-dim)">Ta plakietka jest unieważniona — pobieranie/druk niedostępne.</p>'}
            </div>
        </div>`;
    modal.classList.remove('hidden');
    await renderujMiniaturkeA4(document.getElementById('modal-miniaturka'), dane);

    document.getElementById('btn-zamknij-modal-podglad').addEventListener('click', (e) => { e.preventDefault(); modal.remove(); });
    if (dane.aktywna) {
        document.getElementById('modal-btn-pobierz').addEventListener('click', async () => {
            const doc = await zbudujPdfDlaListy([dane]);
            doc.save(`plakietka-${dane.kod}.pdf`);
        });
        document.getElementById('modal-btn-drukuj').addEventListener('click', async () => {
            const doc = await zbudujPdfDlaListy([dane]);
            drukujDokument(doc);
        });
    }
}

// --- Lista WSZYSTKICH wydanych plakietek (widok globalny, w tej samej zakładce) ---
async function odswiezWszystkiePlakietki() {
    const wynik = await wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: null });
    const tbody = document.querySelector('#tabela-wszystkie-plakietki tbody');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="5">❌ ${wynik.blad}</td></tr>`; return; }
    window._wszystkiePlakietki = wynik.dane || [];
    tbody.innerHTML = (wynik.dane || []).map((p, i) => `
        <tr>
            <td>${p.kod_plakietki}</td>
            <td>${p.imie} ${p.nazwisko} (${p.ministrant_kod})</td>
            <td>${new Date(p.wygenerowano).toLocaleString('pl-PL')}</td>
            <td style="color:${p.aktywna ? 'var(--ok)' : 'var(--err)'}">${p.aktywna ? 'aktywna' : 'unieważniona'}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="pokazPodgladPojedynczej(window._wszystkiePlakietki[${i}])">Podgląd</button>
                ${p.aktywna && sesja.is_admin ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="uniewaznijZListyGlownej('${p.kod_plakietki}')">Unieważnij</button>` : ''}
            </td>
        </tr>`).join('') || '<tr><td colspan="5">Brak wydanych plakietek.</td></tr>';
}

async function uniewaznijZListyGlownej(kodPlakietki) {
    if (!confirm(`Unieważnić plakietkę ${kodPlakietki}? Ten kod QR natychmiast przestanie działać w Kiosku.`)) return;
    const wynik = await wywolajRPC('admin_uniewaznij_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kod_plakietki: kodPlakietki });
    if (!wynik.sukces) alert('❌ ' + wynik.blad);
    await odswiezWszystkiePlakietki();
}
