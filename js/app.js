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

// Ministranci
document.getElementById('btn-dodaj-ministranta').addEventListener('click', async () => {
    const imie = document.getElementById('mi-imie').value.trim();
    const nazwisko = document.getElementById('mi-nazwisko').value.trim();
    const kod = document.getElementById('mi-kod').value.trim();
    const pin = document.getElementById('mi-pin').value.trim();
    const status = document.getElementById('ministrant-status');

    if (!imie || !nazwisko || !kod || pin.length !== 4) {
        status.textContent = 'Uzupełnij wszystkie pola (PIN = 4 cyfry).'; return;
    }

    const wynik = await wywolajRPC('admin_dodaj_ministranta', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin,
        p_imie: imie, p_nazwisko: nazwisko, p_nowy_kod: kod, p_nowy_pin: pin
    });
    status.textContent = wynik.sukces ? `✅ Dodano ${kod}. Zapisz PIN — nie da się go odczytać ponownie!` : ('❌ ' + wynik.blad);
    if (wynik.sukces) {
        ['mi-imie','mi-nazwisko','mi-kod','mi-pin'].forEach(id => document.getElementById(id).value = '');
        await odswiezListeMinistrantow();
    }
});

async function odswiezListeMinistrantow() {
    const { data } = await supabaseClient.from('ranking_miesiac').select('*').order('kod');
    document.querySelector('#tabela-ministranci tbody').innerHTML = (data || []).map(m =>
        `<tr><td>${m.kod}</td><td>${m.imie} ${m.nazwisko}</td><td>${m.punkty_miesiac}</td></tr>`
    ).join('');
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

let wierszeKart = [];
function dodajWierszKarty() {
    const idx = wierszeKart.length;
    wierszeKart.push({ imie: '', nazwisko: '', kod: '', pin: '' });
    renderujWierszeKart();
}
document.getElementById('btn-dodaj-wiersz-karty').addEventListener('click', dodajWierszKarty);

function renderujWierszeKart() {
    const cont = document.getElementById('karty-lista');
    cont.innerHTML = wierszeKart.map((w, i) => `
        <div style="display:flex; gap:8px; margin-bottom:8px;">
            <input type="text" placeholder="Imię" value="${w.imie}" onchange="wierszeKart[${i}].imie=this.value">
            <input type="text" placeholder="Nazwisko" value="${w.nazwisko}" onchange="wierszeKart[${i}].nazwisko=this.value">
            <input type="text" placeholder="Kod" value="${w.kod}" onchange="wierszeKart[${i}].kod=this.value">
            <input type="text" placeholder="PIN" maxlength="4" value="${w.pin}" onchange="wierszeKart[${i}].pin=this.value">
        </div>`).join('');
}
dodajWierszKarty(); // start z jednym wierszem

document.getElementById('btn-generuj-pdf').addEventListener('click', async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });

    const kartaW = 85, kartaH = 54; // rozmiar wizytówki ~ jak karta kredytowa x2
    const marginX = 12, marginY = 15, gapX = 6, gapY = 6;
    const naWiersz = 2;
    let x = marginX, y = marginY, i = 0;

    for (const w of wierszeKart) {
        if (!w.kod) continue;

        // Ramka karty
        doc.setDrawColor(180);
        doc.roundedRect(x, y, kartaW, kartaH, 3, 3);

        // Kod QR (WYŁĄCZNIE QR — bez kodu kreskowego)
        const qrDataUrl = await QRCode.toDataURL(w.kod, { margin: 1, width: 300 });
        doc.addImage(qrDataUrl, 'PNG', x + 6, y + 7, 38, 38);

        // Dane tekstowe
        doc.setFontSize(12);
        doc.text(`${w.imie}`, x + 48, y + 16);
        doc.setFontSize(11);
        doc.text(`${w.nazwisko}`, x + 48, y + 22);
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Kod: ${w.kod}`, x + 48, y + 32);
        doc.text(`PIN: ${w.pin || '----'}`, x + 48, y + 38);
        doc.setTextColor(0);
        doc.setFontSize(7);
        doc.text('E-Ministranci', x + 48, y + 48);

        i++;
        if (i % naWiersz === 0) {
            x = marginX;
            y += kartaH + gapY;
        } else {
            x += kartaW + gapX;
        }
        if (y + kartaH > 280) { doc.addPage(); x = marginX; y = marginY; }
    }

    doc.save('karty-ministranci.pdf');
});
