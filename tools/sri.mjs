// ============================================================================
// SRI + przypięcie wersji bibliotek z CDN (v2.15.14). Wymaga INTERNETU — uruchom lokalnie, nie w piaskownicy.
//   node tools/sri.mjs            → raport: co zostałoby zmienione (nic nie zapisuje)
//   node tools/sri.mjs --zapisz   → przypina `@2` do dokładnej wersji i dopisuje integrity + crossorigin
//                                   w app.html i kiosk.html oraz zmienia adres w sw.js (CDN)
// Dlaczego narzędzie, a nie wpisane „na sztywno”: sumy kontrolne MUSZĄ pochodzić z faktycznie pobranego pliku.
// Błędna suma = biblioteka nie załaduje się i cała aplikacja przestanie działać, więc nie wolno jej zgadywać.
// Po każdej zmianie wersji biblioteki uruchom narzędzie ponownie.
// ============================================================================
import fs from 'node:fs';
import crypto from 'node:crypto';

export const sha384 = (buf) => 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
export const jestDokladna = (spec) => /^\d+\.\d+\.\d+$/.test(spec);
export const rozbij = (url) => { const m = /^(https:\/\/cdn\.jsdelivr\.net\/npm\/)((?:@[^/@]+\/)?[^@/]+)@([^/]+)(\/.*)?$/.exec(url); return m ? { baza: m[1], pakiet: m[2], spec: m[3], sciezka: m[4] || '' } : null; };
export const zloz = (r, wersja) => r.baza + r.pakiet + '@' + wersja + r.sciezka;

export function wpiszIntegrity(html, staryUrl, nowyUrl, suma) {
    const wzor = new RegExp('<script src="' + staryUrl.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '"(?: integrity="[^"]*")?(?: crossorigin="[^"]*")?></script>');
    if (!wzor.test(html)) return html;
    return html.replace(wzor, '<script src="' + nowyUrl + '" integrity="' + suma + '" crossorigin="anonymous"></script>');
}

export async function przetworz({ pobierz, pobierzJson, pliki, zapisz }) {
    const raport = [];
    for (const plik of pliki) {
        let tekst = fs.readFileSync(plik, 'utf8');
        const adresy = [...tekst.matchAll(/<script src="(https:\/\/cdn\.jsdelivr\.net\/npm\/[^"]+)"/g)].map(m => m[1]);
        for (const url of adresy) {
            const r = rozbij(url); if (!r) continue;
            let wersja = r.spec;
            if (!jestDokladna(wersja)) wersja = (await pobierzJson('https://data.jsdelivr.com/v1/packages/npm/' + r.pakiet + '/resolved?specifier=' + encodeURIComponent(r.spec))).version;
            const nowyUrl = zloz(r, wersja);
            const suma = sha384(await pobierz(nowyUrl));
            raport.push({ plik, url, nowyUrl, suma });
            if (zapisz) { tekst = wpiszIntegrity(tekst, url, nowyUrl, suma); tekst = tekst.split(url + '"').join(nowyUrl + '"').split(url + ' ').join(nowyUrl + ' ').split(url + ';').join(nowyUrl + ';'); }   // v2.15.16: także adresy w CSP
        }
        if (zapisz) {
            if (plik === 'sw.js') { /* adresy CDN w sw.js zmieniane niżej */ }
            fs.writeFileSync(plik, tekst, 'utf8');
        }
    }
    if (zapisz && fs.existsSync('sw.js')) {
        let sw = fs.readFileSync('sw.js', 'utf8');
        for (const x of raport) sw = sw.split("'" + x.url + "'").join("'" + x.nowyUrl + "'");
        fs.writeFileSync('sw.js', sw, 'utf8');
    }
    return raport;
}

const bezposrednio = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href;
if (bezposrednio) {
    const zapisz = process.argv.includes('--zapisz');
    const pobierz = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' → ' + r.status); return Buffer.from(await r.arrayBuffer()); };
    const pobierzJson = async (u) => JSON.parse((await pobierz(u)).toString('utf8'));
    przetworz({ pobierz, pobierzJson, pliki: ['app.html', 'kiosk.html'], zapisz }).then(r => {
        for (const x of r) console.log((zapisz ? 'ZAPISANO ' : 'do zmiany ') + x.plik + ': ' + x.url + ' → ' + x.nowyUrl + '\n   ' + x.suma);
        if (!zapisz) console.log('\nTo był tylko raport. Dodaj --zapisz, aby wprowadzić zmiany, a potem: npm test');
    }).catch(e => { console.error('Błąd (brak internetu?):', e.message); process.exit(1); });
}
