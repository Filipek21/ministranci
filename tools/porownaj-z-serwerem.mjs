// Porównuje kopię plików z Twojego serwera (np. sklonowane repozytorium GitHub Pages) z tą paczką i pokazuje, KTÓRE pliki trzeba wgrać.
//   node tools/porownaj-z-serwerem.mjs <katalog-z-kopią-serwera>            → tylko pliki działające w produkcji
//   node tools/porownaj-z-serwerem.mjs <katalog> --wszystko                 → także testy, dokumentację i narzędzia
// Porównuje sumy SHA-256 treści (nie daty), więc wynik jest dokładny niezależnie od tego, z której wersji aktualizujesz.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serwer = process.argv[2] ? path.resolve(process.argv[2]) : null;
const wszystko = process.argv.includes('--wszystko');
if (!serwer || !fs.existsSync(serwer)) { console.error('Podaj katalog z kopią serwera, np.: node tools/porownaj-z-serwerem.mjs C:\\moje\\repozytorium'); process.exit(2); }

const POMIJAJ = /^(\.git|node_modules)(\/|$)/;
const TYLKO_DEWELOPERSKIE = /^(tests|docs|tools)\/|^package(-lock)?\.json$|^\.github\//;
const suma = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function lista(dir, pref = '') {
    const w = [];
    for (const e of fs.readdirSync(path.join(dir, pref), { withFileTypes: true })) {
        const rel = pref ? pref + '/' + e.name : e.name;
        if (POMIJAJ.test(rel)) continue;
        if (e.isDirectory()) w.push(...lista(dir, rel)); else w.push(rel);
    }
    return w;
}
const mojeWszystkie = lista(korzen);
const moje = mojeWszystkie.filter((f) => wszystko || !TYLKO_DEWELOPERSKIE.test(f));
const nowe = [], zmienione = [], bez = [];
for (const f of moje) {
    const s = path.join(serwer, f);
    if (!fs.existsSync(s)) nowe.push(f);
    else if (suma(s) !== suma(path.join(korzen, f))) zmienione.push(f); else bez.push(f);
}
const nadmiarowe = lista(serwer).filter((f) => !mojeWszystkie.includes(f) && (wszystko || !TYLKO_DEWELOPERSKIE.test(f)));
const druk = (t, l) => { console.log(`\n${t} (${l.length})`); l.forEach((f) => console.log('  ' + f)); };
druk('NOWE — brak ich na serwerze, DODAJ', nowe);
druk('ZMIENIONE — różnią się od serwera, ZASTĄP', zmienione);
console.log(`\nIdentyczne, nie ruszaj: ${bez.length}`);
if (nadmiarowe.length) druk('Są tylko na serwerze (nie ma ich w paczce) — NIE USUWAJ bez sprawdzenia', nadmiarowe);
console.log('\nSQL (katalog sql/) i Edge Function (supabase/functions/) NIE trafiają na GitHub Pages — wgrywa się je osobno w Supabase (patrz instrukcja).');
