# Raport v2.15.04 — paczkowanie i rate-limit synchronizacji

## Zmiany
* **Klient (`js/paczki.js`, `js/kiosk.js`):** wpisy z kolejki offline lecą paczkami (≤ 5 wpisów, ≤ 8 KB, jeden rodzaj, od najstarszego). ACK per wpis; sieć → brak ACK; `rate_limit` → brak ACK i bez podbijania prób, odczekanie 15–30 s; sukces częściowy → ACK tylko potwierdzonych. Komunikat w pasku stanu (PL/EN/UK: `k.sync_rate_limit`).
* **Serwer (`sql/37_paczki_rate_limit_v2_15_04.sql`):** `kiosk_zapisz_paczke` (wynik per wpis), limit 25/min/kiosk (1–2 aktywne kioski) lub 20/min/kiosk (≥ 3), osobny łagodny licznik cache (10/min), audyt retencji liczony do limitu wysyłania, ping bez limitu. Okno stałe 1-minutowe.
* Zgodność wsteczna: stary klient (po 1 wpisie) działa; nowy klient na serwerze bez sql/37 wraca do wysyłania pojedynczego.
* Poza zakresem (bez zmian): logika 36 h / akceptacji Admina, szyfrowanie magazynu, kontakt z administratorem.
* Szczegóły: `docs/SZYFR_MINISTRANCKI.md` §13.

## Testy
`npm test`: 81 przechodzi, w tym `tests/paczki.test.mjs`: podział (liczba i rozmiar), osobne rodzaje, sukces częściowy, błąd sieci, rate_limit bez podbijania prób, powrót do starej ścieżki, kontrakt SQL (25 vs 20, kolejność token → rozmiar → limit → wpisy).

## Nie sprawdzono
* `sql/37` nie był uruchomiony (brak PostgreSQL) — sprawdzono tylko tekst kontraktu w testach. Najpierw kopia/staging, po plikach 14–36.
* Atrapa serwera w testach modeluje kontrakt; to nie jest test SQL ani wielu kiosków naraz.
* Ping nie zwiększa licznika aktywności (patrz SZYFR §13.3) — przy dokładnym liczeniu „aktywnych” kiosków może ich wyjść mniej niż w rzeczywistości, więc limit 25 bywa stosowany tam, gdzie powinien być 20.
