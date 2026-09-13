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

    const wynik = await wywolajRPC('zaloguj', { p_kod: kod, p_pin: pin });
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

// --- PANEL MINISTRANTA ---
async function pokazPanelMinistranta() {
    pokazWidok(widokMinistrant);
    document.getElementById('mm-imie').textContent = `${sesja.imie} ${sesja.nazwisko} (${sesja.kod})`;

    const { data: historia } = await supabaseClient
        .from('historia_miesiac')
        .select('*')
        .eq('ministrant_id', sesja.id)
        .order('data_zapisu', { ascending: false });

    const sumaPunktow = (historia || []).reduce((s, h) => s + h.punkty, 0);
    document.getElementById('mm-punkty').textContent = sumaPunktow;

    const tbodyHist = document.querySelector('#mm-historia tbody');
    tbodyHist.innerHTML = (historia || []).map(h =>
        `<tr><td>${h.nazwa}</td><td>${new Date(h.data_wydarzenia).toLocaleDateString('pl-PL')}</td><td>+${h.punkty} pkt</td></tr>`
    ).join('') || '<tr><td colspan="3">Brak obecności w tym miesiącu.</td></tr>';

    const { data: ranking } = await supabaseClient.from('ranking_miesiac').select('*').order('pozycja');
    const tbodyRank = document.querySelector('#mm-ranking tbody');
    tbodyRank.innerHTML = (ranking || []).map(r =>
        `<tr class="${r.ministrant_id === sesja.id ? 'podswietlone' : ''}">
            <td>${r.pozycja}.</td><td>${r.imie} ${r.nazwisko}</td><td>${r.punkty_miesiac} pkt</td>
        </tr>`
    ).join('');
}

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
    }
    await odswiezKalendarz();
    await odswiezListeMinistrantow();
}

document.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ['kalendarz', 'ministranci', 'karty', 'bezpieczenstwo'].forEach(t => {
            document.getElementById('tab-content-' + t).classList.toggle('hidden', t !== btn.dataset.tab);
        });
        if (btn.dataset.tab === 'bezpieczenstwo') odswiezBezpieczenstwo();
        if (btn.dataset.tab === 'karty') odswiezRosterKart();
    });
});

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
    const status = document.getElementById('ministrant-status');
    status.textContent = '';

    if (!imie || !nazwisko || !kod) { status.textContent = 'Uzupełnij imię, nazwisko i kod.'; return; }

    if (edytowanyMinistrantId) {
        // --- TRYB EDYCJI ---
        const wynik = await wywolajRPC('admin_edytuj_ministranta', {
            p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
            p_ministrant_id: edytowanyMinistrantId,
            p_nowe_imie: imie, p_nowe_nazwisko: nazwisko, p_nowy_kod: kod
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
        p_imie: imie, p_nazwisko: nazwisko, p_nowy_kod: kod, p_nowy_pin: pin
    });
    status.textContent = wynik.sukces ? `✅ Dodano ${kod}.` : ('❌ ' + wynik.blad);
    if (wynik.sukces) {
        ['mi-imie','mi-nazwisko','mi-kod','mi-pin'].forEach(id => document.getElementById(id).value = '');
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
    document.getElementById('btn-dodaj-ministranta').textContent = 'Zapisz zmiany';
    document.getElementById('btn-anuluj-edycje').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function zakonczEdycjeMinistranta() {
    edytowanyMinistrantId = null;
    document.getElementById('mi-tytul-formularza').textContent = 'Dodaj ministranta';
    ['mi-imie','mi-nazwisko','mi-kod','mi-pin'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('mi-pin').placeholder = 'PIN (4 cyfry)';
    document.getElementById('btn-dodaj-ministranta').textContent = 'Dodaj';
    document.getElementById('btn-anuluj-edycje').classList.add('hidden');
}
document.getElementById('btn-anuluj-edycje').addEventListener('click', zakonczEdycjeMinistranta);

async function odswiezListeMinistrantow() {
    const wynik = await wywolajRPC('admin_lista_ministrantow', { p_kod: sesja.kod, p_pin: sesja.pin });
    if (!wynik.sukces) {
        document.querySelector('#tabela-ministranci tbody').innerHTML = `<tr><td colspan="7">❌ ${wynik.blad}</td></tr>`;
        return;
    }
    biezacaListaMinistrantow = wynik.dane || [];
    document.querySelector('#tabela-ministranci tbody').innerHTML = biezacaListaMinistrantow.map(m => `
        <tr>
            <td>${m.kod}</td>
            <td>${m.imie} ${m.nazwisko}${m.is_admin ? ' 👑' : ''}${m.is_moderator ? ' ⛪' : ''}</td>
            <td>${m.pin_jawny ?? '—'}</td>
            <td>${m.punkty_miesiac}</td>
            <td style="color:${m.aktywny ? 'var(--ok)' : 'var(--err)'}">${m.aktywny ? 'aktywny' : 'nieaktywny'}</td>
            <td>${m.liczba_aktywnych_plakietek}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="rozpocznijEdycjeMinistranta('${m.id}')">Edytuj</button>
                <button class="btn btn-secondary" style="width:auto; padding:6px 10px;" onclick="otworzPlakietki('${m.id}', '${m.imie} ${m.nazwisko}')">Plakietki</button>
                ${m.aktywny
                    ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="dezaktywujMinistranta('${m.id}')">Dezaktywuj</button>`
                    : `<button class="btn" style="width:auto; padding:6px 10px;" onclick="przywrocMinistranta('${m.id}')">Przywróć</button>`}
            </td>
        </tr>`).join('') || '<tr><td colspan="7">Brak ministrantów.</td></tr>';
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
    tbody.innerHTML = (wynik.dane || []).map(p => `
        <tr>
            <td>${p.kod_plakietki}</td>
            <td>${new Date(p.wygenerowano).toLocaleString('pl-PL')}</td>
            <td style="color:${p.aktywna ? 'var(--ok)' : 'var(--err)'}">${p.aktywna ? 'aktywna' : 'unieważniona'}</td>
            <td>${p.aktywna ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="uniewaznijPlakietkeZPanelu('${p.kod_plakietki}')">Unieważnij</button>` : '—'}</td>
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

    status.textContent = 'Generuję plakietki i PDF…';
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    let pierwsza = true;

    for (const m of wybrani) {
        // Nowa, unikalna plakietka dla tej karty (osobny kod w QR, można później unieważnić bez ruszania konta)
        const plakietka = await wywolajRPC('admin_generuj_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: m.id });
        if (!plakietka.sukces) { status.textContent = `❌ Błąd dla ${m.kod}: ${plakietka.blad}`; continue; }

        if (!pierwsza) doc.addPage();
        pierwsza = false;

        const dataGeneracji = new Date(plakietka.wygenerowano);
        const dataTekst = dataGeneracji.toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });

        // ================= GÓRA STRONY: plakietka (QR + dane) =================
        doc.setDrawColor(150);
        doc.roundedRect(20, 20, 170, 130, 6, 6);

        doc.setFontSize(10);
        doc.setTextColor(120);
        doc.text('E-Ministranci — Karta Ministranta', 30, 34);
        doc.setTextColor(0);

        // Duży kod QR — zakodowany kod PLAKIETKI (nie kod logowania!), WYŁĄCZNIE QR
        const qrDataUrl = await QRCode.toDataURL(plakietka.kod_plakietki, { margin: 1, width: 400 });
        const qrRozmiar = 65;
        doc.addImage(qrDataUrl, 'PNG', 105 - qrRozmiar / 2, 38, qrRozmiar, qrRozmiar);

        doc.setFontSize(20);
        doc.text(`${m.imie} ${m.nazwisko}`, 105, 114, { align: 'center' });
        doc.setFontSize(13);
        doc.setTextColor(90);
        doc.text(`Kod: ${m.kod}`, 105, 123, { align: 'center' });
        doc.setTextColor(0);

        // Identyfikator TEJ konkretnej plakietki + data wygenerowania (do unieważnienia w razie zgubienia)
        doc.setFontSize(7);
        doc.setTextColor(160);
        doc.text(`Nr plakietki: ${plakietka.kod_plakietki}`, 105, 141, { align: 'center' });
        doc.text(`Wygenerowano: ${dataTekst}`, 105, 146, { align: 'center' });
        doc.setTextColor(0);

        // ================= LINIA DO PRZECIĘCIA =================
        const yLinia = 165;
        doc.setDrawColor(150);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(15, yLinia, 195, yLinia);
        doc.setLineDashPattern([], 0);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('✂ — odetnij i przechowuj osobno —', 105, yLinia - 2, { align: 'center' });
        doc.setTextColor(0);

        // ================= DÓŁ STRONY: osobny, mało widoczny pasek z PIN-em =================
        doc.roundedRect(75, yLinia + 15, 60, 30, 4, 4);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(`PIN — ${m.kod}`, 105, yLinia + 25, { align: 'center' });
        doc.setFontSize(16);
        doc.setTextColor(60);
        doc.text(m.pin_jawny || '----', 105, yLinia + 36, { align: 'center' });
        doc.setTextColor(0);
    }

    doc.save('karty-ministranci.pdf');
    status.textContent = `✅ Wygenerowano PDF dla ${wybrani.length} osób.`;
    zaznaczeniDoWydruku.clear();
    renderujListeKart();
    await odswiezListeMinistrantow();
});

// --- Lista WSZYSTKICH wydanych plakietek (widok globalny, w tej samej zakładce) ---
async function odswiezWszystkiePlakietki() {
    const wynik = await wywolajRPC('admin_lista_plakietek', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: null });
    const tbody = document.querySelector('#tabela-wszystkie-plakietki tbody');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="5">❌ ${wynik.blad}</td></tr>`; return; }
    tbody.innerHTML = (wynik.dane || []).map(p => `
        <tr>
            <td>${p.kod_plakietki}</td>
            <td>${p.imie} ${p.nazwisko} (${p.ministrant_kod})</td>
            <td>${new Date(p.wygenerowano).toLocaleString('pl-PL')}</td>
            <td style="color:${p.aktywna ? 'var(--ok)' : 'var(--err)'}">${p.aktywna ? 'aktywna' : 'unieważniona'}</td>
            <td>${p.aktywna ? `<button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="uniewaznijZListyGlownej('${p.kod_plakietki}')">Unieważnij</button>` : '—'}</td>
        </tr>`).join('') || '<tr><td colspan="5">Brak wydanych plakietek.</td></tr>';
}

async function uniewaznijZListyGlownej(kodPlakietki) {
    if (!confirm(`Unieważnić plakietkę ${kodPlakietki}? Ten kod QR natychmiast przestanie działać w Kiosku.`)) return;
    const wynik = await wywolajRPC('admin_uniewaznij_plakietke', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kod_plakietki: kodPlakietki });
    if (!wynik.sukces) alert('❌ ' + wynik.blad);
    await odswiezWszystkiePlakietki();
}
