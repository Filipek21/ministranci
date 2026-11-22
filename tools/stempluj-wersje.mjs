// Po zmianie WERSJA_APLIKACJI w js/wersja.js uruchom:  node tools/stempluj-wersje.mjs
// Strony używają STATYCZNYCH tagów z "?v=<wersja>" (zamiast document.write), więc numer trzeba
// wpisać w index.html / app.html / kiosk.html — to narzędzie robi to za Ciebie. Test pilnuje spójności.
import fs from 'node:fs';
const wersja = /WERSJA_APLIKACJI = '([\d.]+)'/.exec(fs.readFileSync('js/wersja.js', 'utf8'))[1];
let zmian = 0;
for (const f of ['index.html', 'app.html', 'kiosk.html', 'czytania.html']) {
    const t = fs.readFileSync(f, 'utf8');
    const n = t.replace(/((?:src|href)="(?:js|css)\/[^"?]+\?v=)[\d.]+(")/g, (m, a, b) => { zmian++; return a + wersja + b; });
    if (n !== t) fs.writeFileSync(f, n, 'utf8');
}
console.log('Wersja ' + wersja + ': przejrzano adresy ?v= (' + zmian + ').');
