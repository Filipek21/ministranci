import fs from 'node:fs'; import vm from 'node:vm'; import test from 'node:test'; import assert from 'node:assert/strict';
// v2.15.09: test silnika pomocy na atrapie DOM (bez przeglądarki) — kiosk: karta/kamera/PIN/msza/wynik; panel Księdza: pomijanie spełnionych kroków.
const src0 = fs.readFileSync(new URL('../js/pomoc.js', import.meta.url), 'utf8');
const src = src0;
test('silnik pomocy: przepływ kiosku i pomijanie kroków w panelu Księdza', () => {
const els = {}; const listeners = {};
function mk(id){ const e={ id, className:'', style:{}, _a:{}, children:[], innerHTML:'', textContent:'', offsetHeight:200, offsetWidth:380, tagName:'DIV',
  classList:{ _s:new Set(), add(...c){c.forEach(x=>this._s.add(x))}, remove(...c){c.forEach(x=>this._s.delete(x))}, contains(c){return this._s.has(c)}, toggle(c,f){ if(f===undefined) f=!this._s.has(c); f?this._s.add(c):this._s.delete(c);} },
  setAttribute(k,v){this._a[k]=v}, getAttribute(k){return this._a[k]}, appendChild(c){this.children.push(c);return c}, getClientRects(){return this.vis===false?[]:[1]}, getBoundingClientRect(){return {left:10,top:100,right:200,bottom:140,width:190,height:40}}, contains(){return false}, closest(){return null}, scrollIntoView(){}, remove(){}, parentNode:null };
  e.classList.add(...String(e.className).split(' ').filter(Boolean)); return e; }
const visible = new Set(['ekran-czekanie']);
const doc = { readyState:'complete', body: mk('body'),
  getElementById(id){ if(['pomoc-widok','pomoc-lista','pomoc-czat-lista','pomoc-ai-status'].includes(id)){ els[id]=els[id]||mk(id); return els[id]; } if(['ekran-czekanie','ekran-pin','ekran-wynik','btn-skaner-kamery','skaner-kamery-okno','ekran-wybor-wydarzenia','ekran-blok','ekran-admin-awaryjny'].includes(id)){ els[id]=els[id]||mk(id); els[id].vis=visible.has(id); return els[id]; } return els[id]||null; },
  createElement(t){ const e=mk(''); e.tagName=t.toUpperCase(); return e; },
  querySelectorAll(sel){ const m=sel.match(/^#([\w-]+)/); if(m){ const e=doc.getElementById(m[1]); return e?[e]:[]; } return []; }, querySelector(){return null},
  addEventListener(t,f){ (listeners[t]=listeners[t]||[]).push(f); } };
const origAppend = doc.body.appendChild.bind(doc.body);
doc.body.appendChild = (c)=>{ if(c.id) els[c.id]=c; return origAppend(c); };
let timers=[]; 
const ctx = { document: doc, window: { addEventListener(){}, matchMedia:()=>({matches:true}), innerHeight:800, innerWidth:400, speechSynthesis:undefined }, localStorage:{ _d:{}, getItem(k){return this._d[k]??null}, setItem(k,v){this._d[k]=v} },
  setInterval:(f)=>{timers.push(f)}, setTimeout:(f)=>{ f(); return 0 }, clearTimeout(){}, requestAnimationFrame:(f)=>f(), console, pinBufor:'', rolaAwaryjna:null, jezykBiezacy:'pl', Math, Date, Array, String, Object, JSON, Set };
ctx.window.document = doc; vm.createContext(ctx); vm.runInContext(src, ctx);
const P = ctx.window.EMPomoc; const tik = timers[0];
const out = []; const ok = (c,m)=>{ out.push(m); assert.ok(c, m); };
ok(P.kontekst()==='kiosk','kontekst kiosk');
ok(P.podpowiedz('kiosk')==='k-obecnosc','podpowiedź kiosku = obecność');
P.otworz(); ok(els['pomoc-widok'].innerHTML.includes('Chcę zapisać obecność')||els['pomoc-lista'].innerHTML.includes('Chcę zapisać obecność'),'menu zawiera temat obecności'); ok(els['pomoc-widok'].innerHTML.includes('Polecam'),'menu ma sekcję „Polecam teraz”');
P.start('k-obecnosc'); ok(els['pomoc-krok'].innerHTML.includes('1. Pokaż swoją kartę') && els['pomoc-krok'].innerHTML.includes('PRZYŁÓŻ'.length? 'PRZYŁÓŻ':''),'krok 1 pokazuje oba sposoby'); ok(els['pomoc-krok'].innerHTML.includes('KLIKNIJ'),'krok 1 wspomina kliknięcie kamery');
// kamera otwarta → krok 2
visible.add('skaner-kamery-okno'); tik(); ok(els['pomoc-krok'].innerHTML.includes('Pokaż kartę kamerze'),'kamera → przeskok do kroku kamery');
// kamera zamknięta, pojawia się PIN
visible.delete('skaner-kamery-okno'); visible.delete('ekran-czekanie'); visible.add('ekran-pin'); tik(); ok(els['pomoc-krok'].innerHTML.includes('Czy to Twoje imię'),'PIN → krok z imieniem');
ctx.pinBufor='1234'; for(let i=0;i<3;i++) tik();
visible.delete('ekran-pin'); visible.add('ekran-wybor-wydarzenia'); tik(); ok(els['pomoc-krok'].innerHTML.includes('Wybierz swoją mszę'),'wybór mszy');
visible.delete('ekran-wybor-wydarzenia'); visible.add('ekran-wynik'); tik(); ok(els['pomoc-krok'].innerHTML.includes('Obecność zapisana'),'wynik → krok końcowy');
visible.delete('ekran-wynik'); visible.add('ekran-czekanie'); tik(); ok(els['pomoc-krok'].innerHTML.includes('Obecność zapisana'),'po resecie kiosku karta końcowa zostaje');
// zakończenie: Dalej na ostatnim kroku → gratulacje
const clk = listeners.click[0]; const btn = { getAttribute:(k)=>k==='data-pomoc'?'dalej':null }; clk({ target:{ closest:()=>btn } });
ok(els['pomoc-toast'].textContent.includes('Brawo'),'gratulacje na koniec'); ok(els['pomoc-krok'].classList.contains('hidden'),'karta schowana po zakończeniu');

// ---- panel Księdza: pomijanie spełnionych kroków
els['ekran-czekanie']=null; const orig=doc.getElementById.bind(doc);
const gid={}; ['widok-login','widok-admin','zg-filtr-status','tabela-zgloszenia'].forEach(i=>{gid[i]=mk(i);});
gid['zg-filtr-status'].value='oczekujace'; gid['zg-filtr-status'].tagName='SELECT';
doc.getElementById=(id)=>{ if(id==='ekran-czekanie') return null; if(gid[id]) return gid[id]; return orig(id); };
const tabBtn=mk('tab'); tabBtn.classList.add('active'); tabBtn._a['data-tab']='zgloszenia';
doc.querySelector=(sel)=> sel.includes('data-tab="zgloszenia"')||sel==='.tabs button.active' ? tabBtn : null;
doc.querySelectorAll=(sel)=>{ const m=sel.match(/^#([\w-]+)/); if(m&&gid[m[1]]) return [gid[m[1]]]; return []; };
ctx.sesja={is_moderator:true,is_admin:false};
ok(P.kontekst()==='ksiadz','kontekst ksiądz'); ok(P.podpowiedz('ksiadz')==='p-zgloszenia','podpowiedź wg otwartej zakładki');
P.start('p-zgloszenia');
ok(els['pomoc-toast'].textContent.includes('Pomijam'),'toast „Pomijam…”');
ok(els['pomoc-krok'].innerHTML.includes('Rozpatrz zgłoszenie'),'zakładka i filtr „Oczekujące” pominięte → od razu tabela zgłoszeń');
ok(els['pomoc-krok'].innerHTML.includes('Krok 1 z 1')===false,'numeracja kroków działa');
gid['zg-filtr-status'].value='wszystkie'; P.zakoncz(); P.start('p-zgloszenia');
ok(els['pomoc-krok'].innerHTML.includes('Pokaż „Oczekujące”'),'filtr NIE jest pominięty, gdy wartość inna');


});
