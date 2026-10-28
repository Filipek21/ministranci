// ============================================================================
// v2.8 — RĘCZNA OBECNOŚĆ (Admin + Ksiądz) i PING KIOSKU NA ŻYWO
//
// 1) Zakładka „Ręczna obecność”: prowadzący sam dodaje wskazanej osobie obecność na mszy/wydarzeniu
//    albo obecność specjalną (zgłoszenie: pogrzeb / ślub / inne — od razu zatwierdzoną z punktami).
//    To samo można zrobić w Kiosku (panel awaryjny po zalogowaniu Admina/Księdza) — patrz js/kiosk.js.
//    Serwer: sql/20 → admin_dodaj_obecnosc_reczna.
// 2) Przycisk „Ping” przy każdym Kiosku (zakładka Kioski, tylko Admin): okno z odpowiedzią na żywo —
//    czy Kiosk odpowiada, po ilu milisekundach, jaka wersja, sieć, kolejka offline, różnica zegarów.
//    Serwer: sql/20 → admin_ping_kiosk / admin_ping_status.
// ============================================================================

// ---------------------------------------------------------------- RĘCZNA OBECNOŚĆ --
async function odswiezReczna() {
    if (!sesja) return;
    const selOs = $('man-ministrant');
    const wybranyOs = selOs.value;
    if (!biezacaListaMinistrantow || biezacaListaMinistrantow.length === 0) await odswiezListeMinistrantow();
    const osoby = (biezacaListaMinistrantow || [])
        .filter(m => m.aktywny !== false)
        .filter(m => sesja.is_admin || !m.is_admin);             // Ksiądz nie dopisuje punktów kontom Admina
    selOs.innerHTML = osoby.map(m => `<option value="${esc(m.id)}">${esc(m.imie)} ${esc(m.nazwisko)} (${esc(m.kod)})</option>`).join('');
    if (wybranyOs) selOs.value = wybranyOs;

    const selW = $('man-wydarzenie');
    const wybraneW = selW.value;
    const { data } = await odczytajZBledem(supabaseClient.from('kalendarz').select('*').order('data_wydarzenia', { ascending: false }).limit(40), 'kalendarz');
    selW.innerHTML = (data || []).map(w => `<option value="${esc(w.id)}">${esc(w.nazwa)} — ${esc(formatDataCzas(w.data_wydarzenia))}</option>`).join('');
    if (wybraneW) selW.value = wybraneW;
    przelaczRodzajReczny();
}

function przelaczRodzajReczny() {
    const zgl = $('man-rodzaj').value === 'zgloszenie';
    $('man-blok-msza').classList.toggle('hidden', zgl);
    $('man-blok-zgloszenie').classList.toggle('hidden', !zgl);
}
$('man-rodzaj').addEventListener('change', przelaczRodzajReczny);

$('btn-man-zapisz').addEventListener('click', async () => {
    const st = $('man-status');
    const rodzaj = $('man-rodzaj').value;
    const osoba = $('man-ministrant').value;
    const punktyTekst = $('man-punkty').value.trim();
    const punktyAuto = punktyTekst === '' && rodzaj === 'msza';   // v2.12.01: puste pole = automatycznie wg zasad tygodnia (1 pkt / 2 pkt)
    const punkty = punktyAuto ? null : parsujPunkty(punktyTekst);
    const wydarzenie = $('man-wydarzenie').value;
    st.style.color = '';
    if (!osoba) { st.style.color = 'var(--err)'; st.textContent = t('man.need_person'); return; }
    if (!punktyAuto && (isNaN(punkty) || punkty < 0 || punkty > 100)) { st.style.color = 'var(--err)'; st.textContent = t('man.need_points'); return; }
    if (rodzaj === 'msza' && !wydarzenie) { st.style.color = 'var(--err)'; st.textContent = t('man.need_event'); return; }

    const btn = $('btn-man-zapisz');
    btn.disabled = true;
    st.textContent = '⏳ ' + t('man.saving');
    const wynik = await wywolajRPC('admin_dodaj_obecnosc_reczna', {
        p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: osoba, p_rodzaj: rodzaj,
        p_wydarzenie_id: rodzaj === 'msza' ? wydarzenie : null,
        p_punkty: punkty, p_zaliczone_jako: 'zbiorka',
        p_typ_zgloszenia: $('man-typ-zgloszenia').value,
        p_powod: $('man-powod').value.trim() || null
    });
    btn.disabled = false;
    if (wynik.sukces) {
        st.style.color = 'var(--ok)';
        st.textContent = '✅ ' + (wynik.akcja === 'zaktualizowano' ? t('man.updated') : t('man.saved'));
        $('man-powod').value = '';
    } else {
        const brakFunkcji = wynik.kod_pg === 'PGRST202' || wynik.kod_pg === '42883';
        st.style.color = 'var(--err)';
        st.textContent = '❌ ' + (brakFunkcji ? t('man.need_sql') : blad(wynik));
    }
});

// ---------------------------------------------------------------- PING KIOSKU --
let pingTrwa = false;

function modalPingu() {
    let m = $('modal-ping-kiosku');
    if (m) m.remove();
    m = document.createElement('div');
    m.id = 'modal-ping-kiosku';
    m.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;';
    m.innerHTML = `
        <div class="card" style="max-width:420px; width:100%; max-height:90vh; overflow:auto; margin:0;">
            <div class="top-bar"><h3 id="ping-tytul"></h3><a href="#" id="ping-zamknij">${esc(t('common.close'))} ✕</a></div>
            <div id="ping-wynik" style="margin-top:8px;"></div>
            <div style="display:flex; gap:8px; margin-top:14px;">
                <button class="btn" id="ping-jeszcze" style="width:auto;">${esc(t('ping.again'))}</button>
            </div>
        </div>`;
    document.body.appendChild(m);
    const zamknij = (e) => { if (e) e.preventDefault(); pingTrwa = false; m.remove(); };
    $('ping-zamknij').addEventListener('click', zamknij);
    m.addEventListener('click', (e) => { if (e.target === m) zamknij(); });
    return m;
}

function wierszPing(etykieta, wartosc) {
    return `<div style="padding:3px 0;"><b>${esc(etykieta)}:</b> ${wartosc == null || wartosc === '' ? `<span style="color:var(--text-dim)">${esc(t('common.unavailable'))}</span>` : esc(wartosc)}</div>`;
}

async function wykonajPingKiosku(kioskId, nazwa) {
    const wynikEl = $('ping-wynik');
    const przycisk = $('ping-jeszcze');
    przycisk.disabled = true;
    pingTrwa = true;
    wynikEl.style.color = '';
    wynikEl.innerHTML = `⏳ ${esc(t('ping.sending'))}`;
    const start = performance.now();

    const zlecenie = await wywolajRPC('admin_ping_kiosk', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_kiosk_id: kioskId });
    if (!zlecenie.sukces) {
        const brak = zlecenie.kod_pg === 'PGRST202' || zlecenie.kod_pg === '42883';
        wynikEl.style.color = 'var(--err)';
        wynikEl.textContent = '❌ ' + (brak ? t('ping.need_sql') : blad(zlecenie));
        przycisk.disabled = false; pingTrwa = false;
        return;
    }

    // Odpytujemy co ~700 ms przez maks. 25 s — Kiosk sprawdza zlecenia co kilka sekund
    const LIMIT_MS = 25000;
    let status = null;
    while (pingTrwa && performance.now() - start < LIMIT_MS) {
        await new Promise(r => setTimeout(r, 700));
        if (!pingTrwa || !$('modal-ping-kiosku')) return;
        status = await wywolajRPC('admin_ping_status', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_zadanie_id: zlecenie.zadanie_id });
        if (status.sukces && status.odpowiedziano) break;
        wynikEl.innerHTML = `⏳ ${esc(t('ping.waiting', { s: Math.round((performance.now() - start) / 1000) }))}`;
    }
    pingTrwa = false;
    if (!$('modal-ping-kiosku')) return;
    przycisk.disabled = false;

    if (status && status.sukces && status.odpowiedziano) {
        const d = status.odpowiedz || {};
        const ms = status.czas_odpowiedzi_ms;
        const calkowity = Math.round(performance.now() - start);
        let roznicaZegara = null;
        if (d.czas_urzadzenia) roznicaZegara = Math.round((new Date(d.czas_urzadzenia).getTime() - new Date(status.czas_serwera).getTime()) / 1000);
        wynikEl.innerHTML = `
            <div style="color:var(--ok); font-weight:700; margin-bottom:8px;">✅ ${esc(t('ping.alive', { nazwa }))}</div>
            ${wierszPing(t('ping.latency'), ms != null ? ms + ' ms' : null)}
            ${wierszPing(t('ping.roundtrip'), calkowity + ' ms')}
            ${wierszPing(t('ping.version'), d.wersja)}
            ${wierszPing(t('ping.online'), d.online_navigator === true ? '✅' : d.online_navigator === false ? '❌' : null)}
            ${wierszPing(t('ping.network'), d.siec_effective_type || d.siec_typ)}
            ${wierszPing(t('ping.queue'), d.offline_kolejka_dlugosc)}
            ${wierszPing(t('ping.cache'), d.cache_pobrano ? formatDataCzas(d.cache_pobrano) : null)}
            ${wierszPing(t('ping.device_time'), d.czas_urzadzenia ? formatDataCzas(d.czas_urzadzenia) : null)}
            ${wierszPing(t('ping.clock_diff'), roznicaZegara != null ? roznicaZegara + ' s' : null)}
            ${wierszPing(t('ping.lang'), d.jezyk)}`;
    } else {
        wynikEl.style.color = 'var(--err)';
        wynikEl.innerHTML = `❌ ${esc(t('ping.dead', { nazwa }))}<div style="color:var(--text-dim); margin-top:6px; font-size:0.9rem;">${esc(t('ping.dead_hint'))}</div>`;
    }
}

AKCJE['kiosk-ping'] = (d) => {
    if (!sesja || !sesja.is_admin) { alert(t('sec.admin_only')); return; }
    const nazwa = d.nazwa || d.id;
    modalPingu();
    $('ping-tytul').textContent = t('ping.title', { nazwa });
    $('ping-jeszcze').addEventListener('click', () => { if (!pingTrwa) wykonajPingKiosku(d.id, nazwa); });
    wykonajPingKiosku(d.id, nazwa);
};

// ---------------------------------------------------------------- LOSOWY PIN NOWEGO KONTA (v2.9) --
// Kryptograficznie losowe 4 cyfry, z pominięciem zbyt prostych (0000, 1234, 1212…) — te samo kryterium co pinZbytProsty().
function losujPinMinistranta() {
    for (let i = 0; i < 200; i++) {
        const b = new Uint32Array(1);
        crypto.getRandomValues(b);
        const pin = String(b[0] % 10000).padStart(4, '0');
        if (!pinZbytProsty(pin)) return pin;
    }
    return '7391';
}
