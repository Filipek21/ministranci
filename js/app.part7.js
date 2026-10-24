
// ============================================================================
// v2.7 — STAŁY KOD WERYFIKACYJNY (3 cyfry) dla Admina i Księdza
//   • pierwsze logowanie po wdrożeniu: wymuszone, jednorazowe ustawienie własnego kodu
//   • kod jest stały — samodzielnie go nie zmienisz; reset wykonuje Admin (zakładka Ministranci)
//   • po zalogowaniu kod jest automatycznie doklejany do PIN-u w wywołaniach funkcji serwera (supabase-client.js)
// ============================================================================

// Stan kodów w Ministrantach: id konta → true (ustawiony). kod3Dostepne = serwer ma sql/19.
let kod3Mapa = {};
let kod3Dostepne = false;

async function ladujStatusKod3() {
    kod3Mapa = {};
    kod3Dostepne = false;
    if (!sesja || !sesja.is_admin) return;
    const w = await wywolajRPC('admin_kod3_status', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin });
    if (!w.sukces) return;                       // brak sql/19 lub błąd — po prostu nie pokazujemy znaczników
    kod3Dostepne = true;
    (w.dane || []).forEach(x => { kod3Mapa[String(x.ministrant_id)] = true; });
}

// Okno wymuszające ustawienie kodu. Zwraca ustawiony kod (string) albo null, gdy użytkownik zrezygnował.
function wymusUstawienieKodu3(kod, pin) {
    return new Promise((resolve) => {
        const modal = zbudujModal('modal-ustaw-kod3', 440, 1200);
        modal.overlay.addEventListener('click', (e) => { if (e.target === modal.overlay) e.stopImmediatePropagation(); }, true);   // kliknięcie w TŁO nie zamyka okna (przyciski w oknie działają normalnie)
        modal.body.innerHTML = `
            <h3>🔐 ${esc(t('k3.title'))}</h3>
            <p style="color:var(--text-dim); font-size:0.9rem;">${esc(t('k3.hint'))}</p>
            <label class="form-etykieta">${esc(t('k3.code'))}</label>
            <input type="password" id="k3-nowy" maxlength="3" inputmode="numeric" autocomplete="off">
            <label class="form-etykieta">${esc(t('k3.repeat'))}</label>
            <input type="password" id="k3-powtorz" maxlength="3" inputmode="numeric" autocomplete="off">
            <button class="btn" id="btn-k3-zapisz">${esc(t('k3.save'))}</button>
            <button class="btn btn-secondary" id="btn-k3-anuluj">${esc(t('k3.cancel'))}</button>
            <div id="k3-status" style="margin-top:8px;"></div>`;
        const status = $('k3-status');
        const blad3 = (tekst) => { status.style.color = 'var(--err)'; status.textContent = '❌ ' + tekst; };

        $('btn-k3-anuluj').addEventListener('click', () => { modal.zamknij(); resolve(null); });
        $('btn-k3-zapisz').addEventListener('click', async () => {
            const a = $('k3-nowy').value.trim(), b = $('k3-powtorz').value.trim();
            if (!/^\d{3}$/.test(a)) { blad3(t('login.k3_bad')); return; }
            if (a !== b) { blad3(t('k3.mismatch')); return; }
            const w = await wywolajRPC('ustaw_kod3', { p_kod: kod, p_pin: pin, p_kod3: a, p_kod3_powtorz: b });
            if (!w.sukces) { blad3(blad(w)); return; }
            status.style.color = 'var(--ok)'; status.textContent = '✅ ' + t('k3.saved');
            modal.zamknij();
            resolve(a);
        });
        setTimeout(() => { const el = $('k3-nowy'); if (el) el.focus(); }, 50);
    });
}

// Admin: reset kodu Księdza (osoba ustawi nowy przy następnym logowaniu)
AKCJE['mi-reset-k3'] = async (d) => {
    if (!sesja.is_admin) return;
    if (!confirm(t('mi.k3_confirm'))) return;
    const w = await wywolajRPC('admin_kod3_reset', { p_kod_admina: sesja.kod, p_pin_admina: sesja.pin, p_ministrant_id: String(d.id) });
    $('ministrant-status').textContent = w.sukces ? '✅ ' + t('mi.k3_done') : ('❌ ' + blad(w));
    await odswiezListeMinistrantow();
};
