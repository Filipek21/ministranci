-- ============================================================================
-- 14_dodatki12.sql  (wersja aplikacji 2.3.00)
--
-- 1) admin_usun_kiosk          — Admin usuwa Kiosk (i jego historię pingów) z monitoringu
-- 2) admin_autoryzuj_kiosk     — Admin jednorazowo "uwierzytelnia" urządzenie Kiosku (token)
-- 3) kiosk_pobierz_cache       — Kiosk sam, w tle, odświeża dane offline (bez PIN-u Admina)
--
-- Uruchom w SQL Editorze Supabase PO plikach 01–13.
-- Skrypt jest idempotentny (można go bezpiecznie uruchomić ponownie).
--
-- !! ZAŁOŻENIA, KTÓRE TRZEBA SPRAWDZIĆ (nie miałem wglądu w pliki 01–13) !!
--   a) Funkcja public.zaloguj(p_kod, p_pin, p_zrodlo) istnieje i zwraca json/jsonb
--      z polami sukces, is_admin  (tak jest używana w js/app.js i js/kiosk.js).
--   b) Tabela z plakietkami nazywa się public.plakietki i ma kolumny:
--      kod_plakietki, ministrant_id, aktywna.
--   c) Tabela public.ministranci ma kolumny: id, kod, imie, nazwisko, pin_hash, aktywny.
--   d) Widok public.kalendarz ma kolumny używane w kiosk.js (id, okno_start, okno_koniec, ...).
-- Jeśli któraś nazwa u Ciebie jest inna — popraw TYLKO funkcję kiosk_pobierz_cache()
-- (sekcja 3). Najprościej: otwórz definicję pobierz_cache_offline z pliku 13_dodatki11.sql
-- i wklej jej zapytanie budujące JSON w miejsce oznaczone "ZBUDUJ CACHE".
-- Pozostałe funkcje (1 i 2) nie zależą od nazw tabel.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Pomocnicza: czy podany kod+PIN to Admin? (wykorzystuje istniejące zaloguj(),
-- więc obowiązuje ta sama ochrona przed zgadywaniem PIN-u i ten sam log prób)
-- ----------------------------------------------------------------------------
create or replace function public._czy_admin_14(p_kod text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    w jsonb;
begin
    w := to_jsonb(public.zaloguj(p_kod, p_pin, 'pwa'));
    return coalesce((w->>'sukces')::boolean, false) and coalesce((w->>'is_admin')::boolean, false);
end;
$$;
revoke all on function public._czy_admin_14(text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Tokeny urządzeń Kiosk
-- ----------------------------------------------------------------------------
create table if not exists public.kioski_tokeny (
    kiosk_id    text primary key,
    token_hash  text not null,
    utworzono   timestamptz not null default now(),
    wygasa      timestamptz not null default (now() + interval '180 days'),
    ostatnie_uzycie timestamptz
);
alter table public.kioski_tokeny enable row level security;
-- brak polityk = anon nie ma żadnego dostępu bezpośredniego; wszystko przez funkcje security definer

-- ----------------------------------------------------------------------------
-- 1) Usuwanie Kiosku (tylko Admin)
--    Nazwy tabel nie są zgadywane: usuwamy wiersze o danym kiosk_id ze WSZYSTKICH
--    tabel schematu public, które mają kolumnę kiosk_id (monitoring, pingi, token...).
-- ----------------------------------------------------------------------------
create or replace function public.admin_usun_kiosk(p_kod text, p_pin text, p_kiosk_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    t record;
    usunieto bigint := 0;
    n bigint;
begin
    if not public._czy_admin_14(p_kod, p_pin) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień (wymagany Admin) lub nieprawidłowy PIN.');
    end if;
    if p_kiosk_id is null or length(trim(p_kiosk_id)) = 0 then
        return jsonb_build_object('sukces', false, 'blad', 'Nie podano identyfikatora Kiosku.');
    end if;

    for t in
        select c.table_name
        from information_schema.columns c
        join information_schema.tables tb
          on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
        where c.table_schema = 'public' and c.column_name = 'kiosk_id'
    loop
        execute format('delete from public.%I where kiosk_id::text = $1', t.table_name) using p_kiosk_id;
        get diagnostics n = row_count;
        usunieto := usunieto + n;
    end loop;

    if usunieto = 0 then
        return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono takiego Kiosku (być może już został usunięty).');
    end if;
    return jsonb_build_object('sukces', true, 'usunieto_wierszy', usunieto,
        'informacja', 'Kiosk usunięty. Jeśli urządzenie nadal działa i ma internet, zgłosi się ponownie przy następnym sygnale kontrolnym (do 15 min).');
end;
$$;
grant execute on function public.admin_usun_kiosk(text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Autoryzacja urządzenia Kiosk (tylko Admin) — zwraca jednorazowo token
-- ----------------------------------------------------------------------------
create or replace function public.admin_autoryzuj_kiosk(p_kod text, p_pin text, p_kiosk_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    nowy_token text;
begin
    if not public._czy_admin_14(p_kod, p_pin) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień (wymagany Admin) lub nieprawidłowy PIN.');
    end if;
    if p_kiosk_id is null or length(trim(p_kiosk_id)) = 0 then
        return jsonb_build_object('sukces', false, 'blad', 'Nie podano identyfikatora Kiosku.');
    end if;

    nowy_token := encode(gen_random_bytes(24), 'hex');
    insert into public.kioski_tokeny (kiosk_id, token_hash, utworzono, wygasa)
    values (p_kiosk_id, crypt(nowy_token, gen_salt('bf')), now(), now() + interval '180 days')
    on conflict (kiosk_id) do update
        set token_hash = excluded.token_hash, utworzono = now(), wygasa = excluded.wygasa, ostatnie_uzycie = null;

    return jsonb_build_object('sukces', true, 'token', nowy_token, 'wygasa', now() + interval '180 days');
end;
$$;
grant execute on function public.admin_autoryzuj_kiosk(text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Kiosk sam pobiera cache offline (token zamiast PIN-u Admina)
--    Zwraca TEN SAM kształt JSON, którego oczekuje js/kiosk.js:
--      { sukces, pobrano, plakietki:[{kod_plakietki, ministrant_kod, imie, nazwisko, pin_hash, aktywny}],
--        kalendarz:[{...wiersze widoku kalendarz...}] }
-- ----------------------------------------------------------------------------
create or replace function public.kiosk_pobierz_cache(p_kiosk_id text, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    wpis public.kioski_tokeny%rowtype;
    v_plakietki jsonb;
    v_kalendarz jsonb;
begin
    select * into wpis from public.kioski_tokeny where kiosk_id = p_kiosk_id;
    if not found
       or wpis.wygasa < now()
       or wpis.token_hash <> crypt(coalesce(p_token, ''), wpis.token_hash) then
        return jsonb_build_object('sukces', false, 'kod_bledu', 'token_nieprawidlowy',
            'blad', 'Kiosk nie jest autoryzowany do automatycznego pobierania danych. Admin musi raz kliknąć "Pobierz dane offline" na tym urządzeniu.');
    end if;

    -- ===== ZBUDUJ CACHE (dostosuj do swojej wersji pobierz_cache_offline, jeśli się różni) =====
    select coalesce(jsonb_agg(jsonb_build_object(
               'kod_plakietki',  p.kod_plakietki,
               'ministrant_kod', m.kod,
               'imie',           m.imie,
               'nazwisko',       m.nazwisko,
               'pin_hash',       m.pin_hash,
               'aktywny',        (p.aktywna and m.aktywny)
           )), '[]'::jsonb)
      into v_plakietki
      from public.plakietki p
      join public.ministranci m on m.id = p.ministrant_id
     where p.aktywna;

    select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
      into v_kalendarz
      from public.kalendarz k
     where k.okno_koniec > now() - interval '1 day'
       and k.okno_start  < now() + interval '10 days';
    -- ===== KONIEC =====

    update public.kioski_tokeny set ostatnie_uzycie = now() where kiosk_id = p_kiosk_id;

    return jsonb_build_object('sukces', true, 'pobrano', now(),
                              'plakietki', v_plakietki, 'kalendarz', v_kalendarz);
end;
$$;
grant execute on function public.kiosk_pobierz_cache(text, text) to anon, authenticated;

-- Sprawdzenie po wdrożeniu (powinno zwrócić 3 wiersze):
-- select proname from pg_proc where proname in ('admin_usun_kiosk','admin_autoryzuj_kiosk','kiosk_pobierz_cache');
