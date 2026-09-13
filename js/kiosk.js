// ============================================================================
// LOGIKA KIOSKU — nasłuchiwanie skanera QR (USB, działa jako klawiatura HID),
// klawiatura PIN, obsługa bloków połączonych, tryb awaryjny Admina.
// ============================================================================

const skanerInput = document.getElementById('skaner-input');
const ekranCzekanie = document.getElementById('ekran-czekanie');
const ekranPin = document.getElementById('ekran-pin');
const ekranBlok = document.getElementById('ekran-blok');
const ekranWynik = document.getElementById('ekran-wynik');
const ekranAdminAwaryjny = document.getElementById('ekran-admin-awaryjny');

let biezacyKod = null;
let biezacyProfil = null;
let pinBufor = '';
let aktywneWydarzenie = null;   // wydarzenie z otwartym oknem czasowym, wybrane do zapisu
let trybAdminAwaryjny = false;

// Utrzymuj focus na ukrytym inpucie, żeby skaner USB zawsze trafiał w pole
function przywrocFocus() {
    if (ekranCzekanie.classList.contains('hidden')) return;
    skanerInput.focus();
}
setInterval(przywrocFocus, 500);
skanerInput.focus();
document.addEventListener('click', przywrocFocus);

function pokazEkran(ekran) {
    [ekranCzekanie, ekranPin, ekranBlok, ekranWynik, ekranAdminAwaryjny].forEach(e => e.classList.add('hidden'));
    ekran.classList.remove('hidden');
}

function resetDoCzekania() {
    biezacyKod = null;
    biezacyProfil = null;
    pinBufor = '';
    aktywneWydarzenie = null;
    trybAdminAwaryjny = false;
    odswiezPinKropki();
    skanerInput.value = '';
    pokazEkran(ekranCzekanie);
    setTimeout(() => skanerInput.focus(), 50);
}

// --- 1. Nasłuchiwanie skanera (skaner "wpisuje" kod i wysyła Enter) ---
skanerInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const kod = skanerInput.value.trim();
        skanerInput.value = '';
        if (kod.length === 0) return;
        await obslugaZeskanowanegoKodu(kod);
    }
});

async function obslugaZeskanowanegoKodu(kod) {
    const wynik = await wywolajRPC('pobierz_po_kodzie', { p_kod: kod });
    if (!wynik.sukces) {
        pokazKomunikatWyniku(false, wynik.blad || 'Nieznany kod QR.');
        return;
    }
    biezacyKod = kod;
    biezacyProfil = wynik;
    document.getElementById('pin-imie').textContent = `${wynik.imie} ${wynik.nazwisko}`;
    document.getElementById('pin-kod').textContent = wynik.kod;
    document.getElementById('btn-tryb-admin').classList.toggle('hidden', !(wynik.is_admin));
    pinBufor = '';
    odswiezPinKropki();
    pokazEkran(ekranPin);
}

// --- 2. Klawiatura PIN ---
document.querySelectorAll('.numpad button[data-n]').forEach(btn => {
    btn.addEventListener('click', () => {
        if (pinBufor.length >= 4) return;
        pinBufor += btn.dataset.n;
        odswiezPinKropki();
        if (pinBufor.length === 4) {
            setTimeout(() => zatwierdzPin(false), 150);
        }
    });
});
document.getElementById('btn-wyczysc').addEventListener('click', () => {
    pinBufor = pinBufor.slice(0, -1);
    odswiezPinKropki();
});
document.getElementById('btn-ok').addEventListener('click', () => zatwierdzPin(false));
document.getElementById('btn-tryb-admin').addEventListener('click', () => zatwierdzPin(true));
document.getElementById('btn-to-nie-ja').addEventListener('click', resetDoCzekania);
document.getElementById('btn-to-nie-ja-2').addEventListener('click', resetDoCzekania);

function odswiezPinKropki() {
    const kropki = document.querySelectorAll('#pin-kropki .pin-dot');
    kropki.forEach((k, i) => k.classList.toggle('filled', i < pinBufor.length));
}

async function zatwierdzPin(jakoAdminAwaryjny) {
    if (pinBufor.length !== 4) return;

    if (jakoAdminAwaryjny) {
        // Weryfikujemy logując się normalnie (zaloguj) — jeśli PIN poprawny i is_admin, wchodzimy w tryb awaryjny
        const wynik = await wywolajRPC('zaloguj', { p_kod: biezacyKod, p_pin: pinBufor });
        if (!wynik.sukces || !wynik.is_admin) {
            pokazKomunikatWyniku(false, 'Nieprawidłowy PIN administratora.');
            return;
        }
        trybAdminAwaryjny = true;
        await wejdzWTrybAwaryjny();
        return;
    }

    // Sprawdź czy jest aktywne wydarzenie z otwartym oknem
    const { data: kalendarz, error } = await supabaseClient
        .from('kalendarz')
        .select('*')
        .eq('okno_aktywne', true);

    if (error || !kalendarz || kalendarz.length === 0) {
        pokazKomunikatWyniku(false, 'Brak aktywnego wydarzenia w tym momencie. Skontaktuj się z opiekunem.');
        return;
    }

    // Jeśli jest kilka aktywnych okien, bierzemy pierwsze (typowo tylko jedno na raz)
    aktywneWydarzenie = kalendarz[0];

    if (aktywneWydarzenie.polaczone_id) {
        // Blok połączony — pokaż 3 przyciski wyboru
        pokazEkran(ekranBlok);
        return;
    }

    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', {
        p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: 'auto'
    });
    obsluzWynikZapisu(wynikZapisu);
}

// --- 3. Obsługa bloku połączonego ---
document.getElementById('btn-tylko-nabozenstwo').addEventListener('click', () => zapiszBlok('tylko_nabozenstwo'));
document.getElementById('btn-tylko-msza').addEventListener('click', () => zapiszBlok('tylko_msza'));
document.getElementById('btn-oba').addEventListener('click', () => zapiszBlok('oba'));

async function zapiszBlok(wybor) {
    const wynikZapisu = await wywolajRPC('zapisz_obecnosc', {
        p_kod: biezacyKod, p_pin: pinBufor, p_wydarzenie_id: aktywneWydarzenie.id, p_wybor: wybor
    });
    obsluzWynikZapisu(wynikZapisu);
}

function obsluzWynikZapisu(wynik) {
    if (wynik.sukces) {
        pokazKomunikatWyniku(true, `✅ ${wynik.imie}, zaliczono! +${wynik.punkty_przyznane} pkt`);
    } else {
        pokazKomunikatWyniku(false, wynik.blad);
    }
}

function pokazKomunikatWyniku(sukces, tresc) {
    const el = document.getElementById('wynik-tresc');
    el.textContent = tresc;
    el.className = 'status-msg ' + (sukces ? 'ok' : 'err');
    pokazEkran(ekranWynik);
    setTimeout(resetDoCzekania, sukces ? 2500 : 3500);
}
document.getElementById('btn-dalej').addEventListener('click', resetDoCzekania);

// --- 4. Tryb awaryjny Admina ---
async function wejdzWTrybAwaryjny() {
    pokazEkran(ekranAdminAwaryjny);
    const { data: kalendarz } = await supabaseClient
        .from('kalendarz')
        .select('*')
        .order('data_wydarzenia', { ascending: false })
        .limit(20);
    const sel = document.getElementById('awaryjny-wydarzenie');
    sel.innerHTML = (kalendarz || []).map(w =>
        `<option value="${w.id}">${w.nazwa} (${new Date(w.data_wydarzenia).toLocaleString('pl-PL')})</option>`
    ).join('');

    await odswiezOstatnieObecnosci();
}

async function odswiezOstatnieObecnosci() {
    const wynik = await wywolajRPC('admin_ostatnie_obecnosci', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_limit: 20 });
    const tbody = document.getElementById('tabela-ostatnie-obecnosci');
    if (!wynik.sukces) { tbody.innerHTML = `<tr><td colspan="5">❌ ${wynik.blad}</td></tr>`; return; }
    tbody.innerHTML = (wynik.dane || []).map(o => `
        <tr>
            <td>${new Date(o.data_zapisu).toLocaleTimeString('pl-PL', {hour:'2-digit', minute:'2-digit'})}</td>
            <td>${o.imie} ${o.nazwisko} (${o.kod})</td>
            <td>${o.wydarzenie}</td>
            <td>+${o.punkty}</td>
            <td><button class="btn btn-danger" style="width:auto; padding:6px 10px;" onclick="cofnijObecnosc('${o.id}')">Cofnij</button></td>
        </tr>`).join('') || '<tr><td colspan="5">Brak zapisanych obecności.</td></tr>';
}

async function cofnijObecnosc(id) {
    const wynik = await wywolajRPC('admin_cofnij_obecnosc', { p_kod_admina: biezacyKod, p_pin_admina: pinBufor, p_obecnosc_id: id });
    document.getElementById('awaryjny-status').textContent = wynik.sukces ? '✅ Cofnięto obecność.' : ('❌ ' + wynik.blad);
    await odswiezOstatnieObecnosci();
}

document.getElementById('btn-awaryjny-zapisz').addEventListener('click', async () => {
    const kodDocelowy = document.getElementById('awaryjny-kod').value.trim();
    const wydarzenieId = document.getElementById('awaryjny-wydarzenie').value;
    const statusEl = document.getElementById('awaryjny-status');

    if (!kodDocelowy || !wydarzenieId) {
        statusEl.textContent = 'Podaj kod ministranta i wybierz wydarzenie.';
        return;
    }
    // Znajdź id ministranta po kodzie
    const profil = await wywolajRPC('pobierz_po_kodzie', { p_kod: kodDocelowy });
    if (!profil.sukces) {
        statusEl.textContent = 'Nie znaleziono ministranta o takim kodzie.';
        return;
    }
    // Musimy znać ministrant_id — pobierz_po_kodzie go nie zwraca (celowo), więc
    // korzystamy z korekta_obecnosci, które samo znajdzie po id przekazanym z widoku ranking_miesiac.
    const { data: wpis } = await supabaseClient.from('ranking_miesiac').select('ministrant_id').eq('kod', kodDocelowy).single();
    if (!wpis) {
        statusEl.textContent = 'Nie udało się ustalić ID ministranta.';
        return;
    }
    const wynik = await wywolajRPC('korekta_obecnosci', {
        p_kod: biezacyKod, p_pin: pinBufor,
        p_ministrant_id: wpis.ministrant_id,
        p_wydarzenie_id: wydarzenieId,
        p_punkty: 1,
        p_zaliczone_jako: 'zbiorka'
    });
    statusEl.textContent = wynik.sukces ? '✅ Zapisano ręcznie.' : ('❌ ' + wynik.blad);
});

document.getElementById('btn-wyjdz-admin').addEventListener('click', resetDoCzekania);

// Start
resetDoCzekania();
