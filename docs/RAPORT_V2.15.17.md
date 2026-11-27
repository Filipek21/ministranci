# Raport v2.15.17 — „dane RODO nie wypłyną do sieci”: kolejna warstwa ochrony

**Najważniejsze, uczciwie:** żaden system oparty na przeglądarce i zewnętrznej bazie nie daje *gwarancji*, że dane nie wyciekną. Ta wersja **zmniejsza** liczbę dróg wycieku i dodaje wykrywanie/blokowanie, ale nie zastępuje: poprawnej konfiguracji bazy (RLS), umów powierzenia (Supabase, Mistral) ani nagłówków HTTP po stronie hostingu. Nic nie usunięto z kodu; zmiany są dodatkami, a testy z poprzednich wersji przechodzą (zmieniono tylko asercje numeru wersji oraz jedną asercję SW — patrz niżej).

## A. Co dodano
| # | Zmiana | Pliki |
|---|---|---|
| 1 | **Strażnik Sieci** — druga linia po CSP: lista dozwolonych adresów budowana z CSP strony + reguły ścieżek (jsDelivr tylko znane pakiety, bez query; Supabase tylko `/rest`, `/functions/asystent`, `/auth`, `/realtime`), blokada żądań z **PESEL** (suma kontrolna + data) w treści lub adresie, obejmuje `fetch`, XHR, `sendBeacon`, WebSocket, EventSource, `window.open`, dynamiczne `<script src>`. Dziennik blokad bez adresów i treści; opakowania zamrożone | `js/straznik-sieci.js` (nowy), 3 strony HTML, `sw.js` |
| 2 | **Service worker blokuje obce hosty** (403) niezależnie od skryptów strony; CDN tylko GET/HEAD | `sw.js` |
| 3 | **CSP: `upgrade-insecure-requests`** | 3 strony HTML |
| 4 | **Asystent AI (jedyna droga danych do strony trzeciej — Mistral):** maskowanie rozszerzone o URL, IP, UUID, IBAN, tokeny/JWT, adresy ulic, kody pocztowe, daty z 2-cyfrowym rokiem i nazwą miesiąca, „ur. 2010”, zaciemnione e-maile, normalizację Unicode (cyfry pełnoszerokie, niewidoczne znaki) oraz maskowanie **znanych imion i nazwisk** z list panelu (`[OSOBA]`) | `js/asystent-sanityzacja.js` (+ kopia w `supabase/functions/asystent/`), `js/asystent.js` |
| 5 | **Kontrola wyjścia (fail-closed):** po maskowaniu osobny skaner przegląda komunikaty; jeśli cokolwiek zostało — **nic nie jest wysyłane do modelu** (kod błędu `pii`, komunikat w PL/EN/UK) | `index.ts`, `i18n.js` |
| 6 | Edge Function: odrzucanie nagłówka `Origin` innego niż `ALLOWED_ORIGIN`, `Cache-Control: no-store`, `nosniff`, limit czasu 30 s dla modelu | `index.ts` |
| 7 | **Ekran prywatności:** gdy karta trafia do tła, cała zawartość jest zasłonięta (migawki przełącznika aplikacji); rozszerzona lista pól usuwanych z cache Kiosku | `js/prywatnosc.js`, `css/style.css` |
| 8 | Redakcja logów konsoli także dla e-maili, telefonów i PESEL | `js/ochrona-start.js` |
| 9 | **V5 (z raportu 2.15.16):** zapis skanu plakietki z tokenem Kiosku i limitem per Kiosk; flaga „brak v2” teraz osobna dla każdej funkcji (wcześniej brak jednej funkcji wyłączyłby v2 dla wszystkich) | `sql/44`, `sql/45`, `js/kiosk.js`, `js/supabase-client.js` |
| 10 | **V7:** opcjonalna poprawka `_rola_staff_21` (blokada fail-closed + zerowanie licznika po sukcesie) | `sql/46` |
| 11 | **Audyt dostępu anon (tylko odczyt):** pokazuje tabele bez RLS, polityki „true”, wrażliwe kolumny, widoki omijające RLS, funkcje dla anon, realtime, `pin_jawny`, publiczne zasobniki | `sql/43` |

## B. Zmiany w istniejących testach (jawnie)
* Asercje numeru wersji → 2.15.17 (5 plików).
* `bezpieczenstwo-ladowanie`: asercja „SW nie zawiera `supabase.co`” → „host występuje tylko jako stała listy dozwolonych” (SW nadal nie zapisuje ani nie obsługuje ruchu Supabase; jedynie go przepuszcza).
* Edge Function nadal **nie loguje** (test z 2.15.05/2.15.16 zachowany).

## C. NIEUDOWODNIONE / ograniczenia
* **Nie uruchomiono** PostgreSQL ani przeglądarki ani Deno. `sql/43–46` i Edge Function są sprawdzone tylko statycznie i testami tekstowymi. **Strażnik Sieci jest testowany na atrapach**, nie w żywej przeglądarce: przed wdrożeniem sprawdź na kopii (logowanie, Kiosk, synchronizacja, PDF/QR, OCR, skaner, Asystent). Wycofanie: usuń linię `js/straznik-sieci.js` z 3 stron HTML.
* **To nie jest ochrona przed XSS**: kod w stronie może zmienić adres strony (nawigacja najwyższego poziomu nie jest blokowana przez `<meta>` CSP) lub zapisać dane przez dozwoloną funkcję bazy. Prawdziwe zamknięcie wymaga nagłówków HTTP (CSP z `navigate-to`/`frame-ancestors`, Trusted Types) — GitHub Pages ich nie pozwala ustawić; rozważ Cloudflare/Netlify przed stroną.
* Strażnik nie widzi ruchu Web Workerów (Tesseract) ani WebSocket w SW; tam działa tylko CSP.
* **Imion i nazwisk nie da się wykryć w 100%**: maskowanie znanych nazw działa na rdzeniach słów (odmiana) z listy panelu; nazwiska spoza list przejdą. Admin nadal widzi i zatwierdza tekst przed wysyłką.
* `upgrade-insecure-requests` — przy testach lokalnych po `http://` (nie `localhost`) może wymuszać https.
* `jsdelivr` nadal bez SRI/przypięcia (`tools/sri.mjs` wymaga sieci — uruchom u siebie).
* **V6, V8 bez zmian:** blokada PIN per kod konta (możliwa odmowa usługi) oraz **`pin_jawny` jawnie w bazie** — to nadal największe ryzyko RODO po stronie bazy; wymaga decyzji projektowej (hash + inny sposób druku plakietek).
* Pliki `sql/01–13` nadal nieznane — uruchom `sql/43` i sprawdź pozycje **WYSOKIE**, zanim uznasz dane za bezpieczne.

## D. Kolejność wdrożenia
1. Wgraj frontend 2.15.17 (wszystkie pliki). Sprawdź panel, Kiosk, Asystent; w konsoli nie powinno być wpisów „Strażnik sieci zablokował”.
2. Wykonaj `sql/43` (odczyt) i przejrzyj wyniki.
3. `sql/44` na kopii → produkcja; gdy WSZYSTKIE Kioski mają ≥ 2.15.17 → `sql/45`.
4. `sql/46` — opcjonalnie, wyłącznie po teście logowania Admina na kopii.
5. Edge Function: wdróż nowy `index.ts` + `sanityzacja.js`; ustaw `ALLOWED_ORIGIN`.
6. Poza kodem: umowa powierzenia z Supabase i Mistral (region UE), włączone 2FA kont Supabase/GitHub, klucz `service_role` nigdy w repozytorium.
