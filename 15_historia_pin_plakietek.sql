-- ============================================================================
-- 15_historia_pin_plakietek.sql  (wersja aplikacji 2.4.00)
--
-- Pełny audyt PIN-ów i plakietek:
--   • historia_pin        — kto zmienił PIN, kiedy, skąd (PWA / Kiosk / korekta Admina). NIGDY samego PIN-u.
--   • historia_plakietek  — wygenerowanie i unieważnienie plakietki (kto, kiedy, powód)
--   • skany_plakietek     — każdy skan plakietki na Kiosku (także odrzucony / offline)
--   • odrzucanie zbyt prostych PIN-ów (0000, 1111, 1212, 1234 …) po stronie serwera
--
-- Uruchom w SQL Editorze Supabase PO plikach 01–14 (korzysta z _czy_admin_14 z pliku 14).
-- Skrypt jest idempotentny. NIE zmienia istniejących funkcji — dodaje nowe (…_audyt) i triggery.
--
-- ZAŁOŻENIA: public.ministranci(id, kod, pin_hash, …), public.plakietki(kod_plakietki, ministrant_id, aktywna, …),
--            istnieją funkcje zmien_pin / admin_zmien_pin_ministranta / admin_generuj_plakietke /
--            admin_uniewaznij_plakietke zwracające json/jsonb z polem "sukces".
-- Wrappery *_audyt budują się automatycznie na podstawie PRAWDZIWYCH sygnatur Twoich funkcji.
-- ============================================================================

-- ---------------------------------------------------------------- tabele ----
create table if not exists public.historia_pin (
    id             bigserial primary key,
    kiedy          timestamptz not null default now(),
    ministrant_id  text not null,
    ministrant_kod text,
    zdarzenie      text not null,            -- 'pin_changed' | 'account_created'
    zrodlo         text,                     -- 'pwa' | 'kiosk' | 'admin' | 'unknown'
    kto_kod        text
);
create index if not exists historia_pin_kiedy_idx on public.historia_pin (kiedy desc);

create table if not exists public.historia_plakietek (
    id             bigserial primary key,
    kiedy          timestamptz not null default now(),
    kod_plakietki  text not null,
    ministrant_id  text,
    ministrant_kod text,
    zdarzenie      text not null,            -- 'generated' | 'revoked'
    kto_kod        text,
    powod          text
);
create index if not exists historia_plakietek_kiedy_idx on public.historia_plakietek (kiedy desc);

create table if not exists public.skany_plakietek (
    id               bigserial primary key,
    kiedy            timestamptz not null default now(),
    kiedy_urzadzenia timestamptz,
    kod_plakietki    text not null,
    ministrant_id    text,
    ministrant_kod   text,
    kiosk_id         text,
    wynik            text not null            -- 'ok' | 'revoked' | 'unknown' | 'offline'
);
create index if not exists skany_plakietek_kiedy_idx on public.skany_plakietek (kiedy desc);

-- Dostęp wyłącznie przez funkcje SECURITY DEFINER poniżej (RLS włączone, brak polityk = brak dostępu bezpośredniego)
alter table public.historia_pin       enable row level security;
alter table public.historia_plakietek enable row level security;
alter table public.skany_plakietek    enable row level security;

-- --------------------------------------------------------------- triggery ----
create or replace function public._tr_pin_audyt()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
    if tg_op = 'INSERT' then
        insert into public.historia_pin (ministrant_id, ministrant_kod, zdarzenie, zrodlo, kto_kod)
        values (new.id::text, new.kod, 'account_created',
                coalesce(nullif(current_setting('em.zrodlo', true), ''), 'admin'),
                nullif(current_setting('em.kto', true), ''));
    elsif new.pin_hash is distinct from old.pin_hash then
        insert into public.historia_pin (ministrant_id, ministrant_kod, zdarzenie, zrodlo, kto_kod)
        values (new.id::text, new.kod, 'pin_changed',
                coalesce(nullif(current_setting('em.zrodlo', true), ''), 'unknown'),
                nullif(current_setting('em.kto', true), ''));
    end if;
    return new;
end $$;

drop trigger if exists trg_ministranci_pin_audyt on public.ministranci;
create trigger trg_ministranci_pin_audyt
    after insert or update of pin_hash on public.ministranci
    for each row execute function public._tr_pin_audyt();

create or replace function public._tr_plakietki_audyt()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_kod text;
begin
    select m.kod into v_kod from public.ministranci m where m.id::text = new.ministrant_id::text;
    if tg_op = 'INSERT' then
        insert into public.historia_plakietek (kod_plakietki, ministrant_id, ministrant_kod, zdarzenie, kto_kod)
        values (new.kod_plakietki::text, new.ministrant_id::text, v_kod, 'generated', nullif(current_setting('em.kto', true), ''));
    elsif old.aktywna is true and new.aktywna is not true then
        insert into public.historia_plakietek (kod_plakietki, ministrant_id, ministrant_kod, zdarzenie, kto_kod, powod)
        values (new.kod_plakietki::text, new.ministrant_id::text, v_kod, 'revoked',
                nullif(current_setting('em.kto', true), ''), nullif(current_setting('em.powod', true), ''));
    end if;
    return new;
end $$;

drop trigger if exists trg_plakietki_audyt on public.plakietki;
create trigger trg_plakietki_audyt
    after insert or update of aktywna on public.plakietki
    for each row execute function public._tr_plakietki_audyt();

-- ----------------------------------------------- zbyt proste PIN-y (serwer) ----
create or replace function public._pin_prosty_ok(p text)
returns boolean language sql immutable as $$
    select p ~ '^[0-9]{4}$'
       and p !~ '^([0-9])\1{3}$'                -- 0000, 1111 …
       and p !~ '^([0-9])([0-9])\1\2$'          -- 1212 …
       and p !~ '^([0-9])\1([0-9])\2$'          -- 1122 …
       and p not in ('0123','1234','2345','3456','4567','5678','6789',
                     '3210','4321','5432','6543','7654','8765','9876',
                     '2580','1357','2468','1379','2000','1004');
$$;

-- ------------------------- wrappery *_audyt (budowane z prawdziwych sygnatur) ----
do $gen$
declare
    r       record;
    v_oid   oid;
    v_n     int;
    v_args  text;
    v_names text[];
    v_call  text;
    i       int;
begin
    for r in select * from (values
        ('zmien_pin', 'zmien_pin_audyt', ', p_zrodlo text default ''pwa''',
         $p$ if not public._pin_prosty_ok(p_nowy_pin) then
                 return jsonb_build_object('sukces', false, 'blad', 'PIN jest zbyt prosty (np. 1234, 1111, 1212). Wybierz inny.');
             end if;
             perform set_config('em.zrodlo', case when p_zrodlo in ('pwa','kiosk') then p_zrodlo else 'pwa' end, true);
             perform set_config('em.kto', coalesce(p_kod, ''), true); $p$),
        ('admin_zmien_pin_ministranta', 'admin_zmien_pin_ministranta_audyt', '',
         $p$ if not public._pin_prosty_ok(p_nowy_pin) then
                 return jsonb_build_object('sukces', false, 'blad', 'PIN jest zbyt prosty (np. 1234, 1111, 1212). Wybierz inny.');
             end if;
             perform set_config('em.zrodlo', 'admin', true);
             perform set_config('em.kto', coalesce(p_kod_admina, ''), true); $p$),
        ('admin_generuj_plakietke', 'admin_generuj_plakietke_audyt', '',
         $p$ perform set_config('em.kto', coalesce(p_kod_admina, ''), true); $p$),
        ('admin_uniewaznij_plakietke', 'admin_uniewaznij_plakietke_audyt', ', p_powod text default null',
         $p$ perform set_config('em.kto', coalesce(p_kod_admina, ''), true);
             perform set_config('em.powod', coalesce(left(p_powod, 200), ''), true); $p$)
    ) as v(orig, nowa, extra, pre)
    loop
        select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.orig;
        if v_n = 0 then raise notice 'Pominięto % — brak funkcji w bazie', r.orig; continue; end if;
        if v_n > 1 then raise exception 'Funkcja % ma kilka przeciążeń — przerwano bez zmian', r.orig; end if;

        select p.oid, pg_get_function_arguments(p.oid), p.proargnames into v_oid, v_args, v_names
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = r.orig;

        v_call := '';
        for i in 1 .. coalesce(array_length(v_names, 1), 0) loop
            v_call := v_call || case when i > 1 then ', ' else '' end || format('%I => %I', v_names[i], v_names[i]);
        end loop;

        execute format($f$
            create or replace function public.%I(%s%s)
            returns jsonb language plpgsql security definer set search_path = public, extensions as $b$
            declare r jsonb;
            begin
                %s
                r := to_jsonb(public.%I(%s));
                return r;
            end $b$ $f$, r.nowa, v_args, r.extra, r.pre, r.orig, v_call);
    end loop;
end $gen$;

-- ---------------------------------------------------- zapis skanu z Kiosku ----
create or replace function public.kiosk_zapisz_skan(
    p_kiosk_id text, p_kod_plakietki text, p_wynik text, p_kiedy_lokalnie timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_mid text; v_mkod text;
begin
    if p_wynik is null or p_wynik not in ('ok', 'revoked', 'unknown', 'offline') then
        return jsonb_build_object('sukces', false, 'blad', 'Nieprawidłowy wynik skanu.');
    end if;
    if coalesce(length(p_kod_plakietki), 0) = 0 or length(p_kod_plakietki) > 80 then
        return jsonb_build_object('sukces', false, 'blad', 'Nieprawidłowy kod plakietki.');
    end if;
    -- hamulec przeciw zaśmiecaniu tabeli (funkcja jest wywoływalna anonimowo)
    if (select count(*) from public.skany_plakietek where kiedy > now() - interval '1 minute') > 120 then
        return jsonb_build_object('sukces', false, 'blad', 'Zbyt wiele zapisów.');
    end if;

    select p.ministrant_id::text, m.kod into v_mid, v_mkod
      from public.plakietki p left join public.ministranci m on m.id = p.ministrant_id
     where p.kod_plakietki::text = p_kod_plakietki limit 1;

    insert into public.skany_plakietek (kiedy_urzadzenia, kod_plakietki, ministrant_id, ministrant_kod, kiosk_id, wynik)
    values (p_kiedy_lokalnie, p_kod_plakietki, v_mid, v_mkod, left(p_kiosk_id, 80), p_wynik);

    if random() < 0.01 then delete from public.skany_plakietek where kiedy < now() - interval '400 days'; end if;
    return jsonb_build_object('sukces', true);
end $$;

-- ----------------------------------------------- odczyt historii (tylko Admin) ----
create or replace function public.admin_historia_pin(p_kod_admina text, p_pin_admina text, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.kiedy desc) from (
            select h.kiedy, h.ministrant_kod, m.imie, m.nazwisko, h.zdarzenie, h.zrodlo, h.kto_kod
              from public.historia_pin h left join public.ministranci m on m.id::text = h.ministrant_id
             order by h.kiedy desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb));
end $$;

create or replace function public.admin_historia_plakietek(p_kod_admina text, p_pin_admina text, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.kiedy desc) from (
            select h.kiedy, h.kod_plakietki, h.ministrant_kod, m.imie, m.nazwisko, h.zdarzenie, h.kto_kod, h.powod
              from public.historia_plakietek h left join public.ministranci m on m.id::text = h.ministrant_id
             order by h.kiedy desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb));
end $$;

create or replace function public.admin_historia_skanow(p_kod_admina text, p_pin_admina text, p_limit int default 100)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.kiedy desc) from (
            select coalesce(s.kiedy_urzadzenia, s.kiedy) as kiedy, s.kod_plakietki, s.ministrant_kod, m.imie, m.nazwisko, s.kiosk_id, s.wynik
              from public.skany_plakietek s left join public.ministranci m on m.id::text = s.ministrant_id
             order by s.kiedy desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) x), '[]'::jsonb));
end $$;

notify pgrst, 'reload schema';

-- Kontrola po uruchomieniu:
-- select proname from pg_proc where proname in ('zmien_pin_audyt','admin_zmien_pin_ministranta_audyt',
--   'admin_generuj_plakietke_audyt','admin_uniewaznij_plakietke_audyt','kiosk_zapisz_skan',
--   'admin_historia_pin','admin_historia_plakietek','admin_historia_skanow');
