// Pomiar kosztu LOKALNEJ warstwy (szyfrowanie + zapis do atrapy magazynu w pamięci). NIE mierzy sieci ani prawdziwego IndexedDB.
import { createRequire } from 'node:module'; import { webcrypto } from 'node:crypto';
const M = createRequire(import.meta.url)('../js/bezpieczny-magazyn.js');
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
for (const N of [100, 500, 1000]) {
    const m = M.utworz({ adapter: M.MemAdapter(), crypto: webcrypto }); await m.init();
    const dod = [];
    for (let i = 0; i < N; i++) { const t = performance.now(); await m.dodaj('obecnosc', { p_kod: 'M' + i, p_pin: '4821', p_wydarzenie_id: 1, p_wybor: 'auto' }); dod.push(performance.now() - t); }
    let t = performance.now(); const l = await m.wczytajKolejke(); const odczyt = performance.now() - t;
    const ack = []; for (const it of l) { const s = performance.now(); await m.zastosujOdpowiedz(it, { sukces: true }); ack.push(performance.now() - s); }
    console.log(`N=${N}: dodaj p50=${q(dod,.5).toFixed(3)}ms p95=${q(dod,.95).toFixed(3)}ms | odczyt+odszyfrowanie całości=${odczyt.toFixed(0)}ms | ACK p50=${q(ack,.5).toFixed(3)}ms p95=${q(ack,.95).toFixed(3)}ms | wywołań RPC przy sync (obecnie 1/wpis)=${N}`);
}
