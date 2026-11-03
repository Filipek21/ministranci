// ============================================================================
// PDF PLAKIETEK BEZ ZEWNĘTRZNYCH BIBLIOTEK (v2.8)
//
// Przyczyna błędu „Biblioteka PDF/QR nie została wczytana”: generator plakietek zależał od jsPDF
// i qrcode z CDN. Gdy CDN/sieć/blokada reklam je zatrzymały — PDF nie powstawał.
// Teraz:
//   • kod QR rysuje lokalny enkoder (js/vendor/qr-local.js, window.QRLocal),
//   • strona A4 jest rysowana na <canvas> (polskie/ukraińskie litery działają same, bez osadzania fontów),
//   • PDF składa własny, minimalny zapisywacz (każda strona = obraz JPEG na całej stronie A4).
// Dzięki temu „Pobierz / Drukuj” działa także bez internetu. Zwracany obiekt ma te same metody
// co dokument jsPDF używane w aplikacji: save(), output('bloburl'), autoPrint().
// ============================================================================

const PDF_A4_PX = { w: 1240, h: 1754 };          // A4 @150 dpi
const PDF_MM = (mm) => Math.round(mm / 25.4 * 150);

function stronaPlakietkiNaCanvas(m) {
    const c = document.createElement('canvas');
    c.width = PDF_A4_PX.w; c.height = PDF_A4_PX.h;
    const x = c.getContext('2d');
    const FONT = '"DejaVu Sans", "Segoe UI", Arial, Helvetica, sans-serif';
    const tekst = (txt, mmX, mmY, rozmiarPt, opcje) => {
        const o = opcje || {};
        x.font = (o.bold ? 'bold ' : '') + Math.round(rozmiarPt / 72 * 150) + 'px ' + FONT;
        x.fillStyle = o.kolor || '#000';
        x.textAlign = o.align || 'center';
        x.textBaseline = 'alphabetic';
        x.fillText(String(txt), PDF_MM(mmX), PDF_MM(mmY), o.maxMm ? PDF_MM(o.maxMm) : undefined);
    };
    const ramka = (mmX, mmY, mmW, mmH, promien) => {
        const X = PDF_MM(mmX), Y = PDF_MM(mmY), W = PDF_MM(mmW), H = PDF_MM(mmH), r = PDF_MM(promien);
        x.beginPath();
        x.moveTo(X + r, Y); x.lineTo(X + W - r, Y); x.quadraticCurveTo(X + W, Y, X + W, Y + r);
        x.lineTo(X + W, Y + H - r); x.quadraticCurveTo(X + W, Y + H, X + W - r, Y + H);
        x.lineTo(X + r, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - r);
        x.lineTo(X, Y + r); x.quadraticCurveTo(X, Y, X + r, Y);
        x.closePath(); x.stroke();
    };

    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#969696'; x.lineWidth = 2;
    const dataTekst = formatujDatePelna(m.wygenerowano);

    // ===== GÓRA: QR, imię, nazwisko, kod =====
    ramka(20, 20, 170, 120, 6);
    tekst(t('card.pdf_title'), 105, 32, 10, { kolor: '#787878' });
    const qr = window.QRLocal.toCanvas(String(m.kod_plakietki), { width: 600, margin: 1 });
    const qrMm = 70;
    x.imageSmoothingEnabled = false;
    x.drawImage(qr, PDF_MM(105 - qrMm / 2), PDF_MM(40), PDF_MM(qrMm), PDF_MM(qrMm));
    tekst(`${m.imie} ${m.nazwisko}`, 105, 122, 20, { bold: true, maxMm: 160 });
    tekst(t('card.pdf_code', { kod: m.kod }), 105, 132, 13, { kolor: '#5a5a5a' });

    // ===== LINIA DO PRZECIĘCIA =====
    const yLinia = 155;
    x.save(); x.setLineDash([12, 12]);
    x.beginPath(); x.moveTo(PDF_MM(15), PDF_MM(yLinia)); x.lineTo(PDF_MM(195), PDF_MM(yLinia)); x.stroke();
    x.restore();
    tekst(t('card.pdf_cut'), 105, yLinia - 2, 8, { kolor: '#969696' });

    // ===== DÓŁ: PIN, numer plakietki, data =====
    x.strokeStyle = '#969696';
    ramka(45, yLinia + 15, 120, 45, 4);
    tekst(t('card.pdf_pin', { kod: m.kod }), 105, yLinia + 26, 9, { kolor: '#8c8c8c' });
    tekst(m.pin_jawny ? String(m.pin_jawny) : t('bdg.pin_unknown'), 105, yLinia + 38, 22, { bold: true, kolor: '#323232' });
    tekst(t('card.pdf_badge_no', { kod: m.kod_plakietki }), 105, yLinia + 47, 8, { kolor: '#8c8c8c' });
    tekst(t('card.pdf_generated', { data: dataTekst }), 105, yLinia + 53, 8, { kolor: '#8c8c8c' });
    return c;
}

// Napis „UNIEWAŻNIONA” (obrót wokół środka strony) nakładany po narysowaniu karty.
function nalozZnakUniewaznienia(c, napis) {
    const x = c.getContext('2d');
    x.save();
    x.translate(PDF_MM(105), PDF_MM(90)); x.rotate(-20 * Math.PI / 180);
    x.font = 'bold ' + Math.round(22 / 72 * 150) + 'px "DejaVu Sans","Segoe UI",Arial,sans-serif';
    x.fillStyle = '#c80000'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(napis), 0, 0);
    x.restore();
}

function canvasNaJpegBajty(c) {
    const b64 = c.toDataURL('image/jpeg', 0.92).split(',')[1];
    const bin = atob(b64), n = bin.length, a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = bin.charCodeAt(i);
    return a;
}

// Minimalny zapisywacz PDF: strona A4 (595.28 x 841.89 pt) = jeden obraz JPEG (DCTDecode)
function zlozPdfZJpegow(strony) {
    const enc = new TextEncoder();
    const czesci = []; let dlugosc = 0; const offsety = [];
    const dodaj = (dane) => { const b = (typeof dane === 'string') ? enc.encode(dane) : dane; czesci.push(b); dlugosc += b.length; };
    const obiekt = (nr, tresc) => { offsety[nr] = dlugosc; dodaj(nr + ' 0 obj\n'); dodaj(tresc); dodaj('\nendobj\n'); };
    const nStron = strony.length;
    // numeracja: 1 katalog, 2 lista stron, potem dla strony i: strona, obraz, treść
    dodaj('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    obiekt(1, '<< /Type /Catalog /Pages 2 0 R >>');
    const kids = strony.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
    obiekt(2, `<< /Type /Pages /Count ${nStron} /Kids [ ${kids} ] >>`);
    strony.forEach((s, i) => {
        const nrS = 3 + i * 3, nrObr = nrS + 1, nrTr = nrS + 2;
        obiekt(nrS, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${nrObr} 0 R >> >> /Contents ${nrTr} 0 R >>`);
        offsety[nrObr] = dlugosc;
        dodaj(`${nrObr} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${s.w} /Height ${s.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${s.bajty.length} >>\nstream\n`);
        dodaj(s.bajty); dodaj('\nendstream\nendobj\n');
        const tr = 'q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
        obiekt(nrTr, `<< /Length ${tr.length} >>\nstream\n${tr}\nendstream`);
    });
    const xref = dlugosc, razem = 3 + nStron * 3;
    let tab = `xref\n0 ${razem}\n0000000000 65535 f \n`;
    for (let n = 1; n < razem; n++) tab += String(offsety[n]).padStart(10, '0') + ' 00000 n \n';
    dodaj(tab + `trailer\n<< /Size ${razem} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const wynik = new Uint8Array(dlugosc); let poz = 0;
    czesci.forEach(b => { wynik.set(b, poz); poz += b.length; });
    return wynik;
}

// Obiekt udający dokument jsPDF (te metody wywołuje zapiszPdf / drukujPdf)
function zbudujDokumentLokalny(strony) {
    const bajty = zlozPdfZJpegow(strony);
    const blob = new Blob([bajty], { type: 'application/pdf' });
    let url = null;
    return {
        _lokalny: true,
        output(typ) {
            if (typ === 'blob') return blob;
            if (typ === 'arraybuffer') return bajty.buffer;
            if (!url) url = URL.createObjectURL(blob);
            return url;
        },
        save(nazwa) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = nazwa || 'plakietki.pdf';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        },
        autoPrint() { /* drukowanie wywołuje okno po załadowaniu PDF-a (patrz drukujPdf) */ }
    };
}

async function zbudujPdfPlakietekLokalnie(lista) {
    if (!window.QRLocal) throw new Error('Brak lokalnego enkodera QR (js/vendor/qr-local.js).');
    const strony = [];
    for (const m of lista) {
        const c = stronaPlakietkiNaCanvas(m);
        if (m.aktywna === false) nalozZnakUniewaznienia(c, t('card.pdf_revoked'));
        strony.push({ w: c.width, h: c.height, bajty: canvasNaJpegBajty(c) });
        await new Promise(r => setTimeout(r, 0)); // oddaj sterowanie przeglądarce (płynność przy wielu kartach)
    }
    return zbudujDokumentLokalny(strony);
}
