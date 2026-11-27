// Analiza „ścieżki krytycznej” stron (v2.15.18): ile bajtów skryptów i stylów trzeba pobrać i sparsować, zanim strona ruszy,
// a ile jest ładowane później (data-opoznione). Rozmiar po kompresji gzip (jak na GitHub Pages) liczony lokalnie.
//   node tools/analiza-wydajnosci.mjs            → tabela
//   node tools/analiza-wydajnosci.mjs --budzet   → kod wyjścia 1, gdy strona przekracza budżet z tools/budzet-wydajnosci.json
// Budżet pilnuje, żeby kolejne zmiany nie „puchły” po cichu. To miara ROZMIARU, nie czasu — czasy mierz w DevTools → Lighthouse.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const czytajBin = (p) => fs.readFileSync(path.join(korzen, p.split('?')[0]));
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;

export function analizuj(strona) {
    const html = fs.readFileSync(path.join(korzen, strona), 'utf8');
    const krytyczne = [], opoznione = [], zewnetrzne = [];
    for (const m of html.matchAll(/<script\b([^>]*)>/g)) {
        const src = /src="([^"]+)"/.exec(m[1]); if (!src) continue;
        if (/^https?:/.test(src[1])) { zewnetrzne.push(src[1]); continue; }
        krytyczne.push(src[1].split('?')[0]);
        const op = /data-opoznione="([^"]+)"/.exec(m[1]);
        if (op) op[1].split(/\s+/).filter(Boolean).forEach((f) => opoznione.push(f));
    }
    const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
    const licz = (lista) => lista.reduce((a, f) => { const b = czytajBin(f); a.surowe += b.length; a.gz += gz(b); return a; }, { surowe: 0, gz: 0 });
    return { strona, skryptyKrytyczne: krytyczne.length, krytyczne: licz(krytyczne), css: licz(css), opoznione: licz(opoznione), liczbaOpoznionych: opoznione.length, zewnetrzne, htmlGz: gz(Buffer.from(html)) };
}
export const STRONY = ['index.html', 'app.html', 'kiosk.html'];

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const budzet = JSON.parse(fs.readFileSync(path.join(korzen, 'tools/budzet-wydajnosci.json'), 'utf8'));
    let blad = false;
    for (const s of STRONY) {
        const a = analizuj(s); const b = budzet[s] || {};
        const kB = (n) => (n / 1024).toFixed(1) + ' kB';
        console.log(`${s.padEnd(11)} skryptów blokujących: ${String(a.skryptyKrytyczne).padStart(2)} | JS krytyczny: ${kB(a.krytyczne.surowe)} (gzip ${kB(a.krytyczne.gz)}) | CSS: gzip ${kB(a.css.gz)} | HTML gzip ${kB(a.htmlGz)} | opóźnione (${a.liczbaOpoznionych}): gzip ${kB(a.opoznione.gz)} | zewnętrzne: ${a.zewnetrzne.length}`);
        if (process.argv.includes('--budzet')) {
            for (const [k, v, max] of [['jsKrytycznyGz', a.krytyczne.gz, b.jsKrytycznyGz], ['cssGz', a.css.gz, b.cssGz], ['htmlGz', a.htmlGz, b.htmlGz], ['skryptyBlokujace', a.skryptyKrytyczne, b.skryptyBlokujace]]) if (max && v > max) { console.error(`  PRZEKROCZONY BUDŻET ${s}.${k}: ${v} > ${max}`); blad = true; }
        }
    }
    if (blad) process.exit(1);
}
