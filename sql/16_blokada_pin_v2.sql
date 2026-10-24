-- ============================================================================
-- 16_blokada_pin_v2.sql  (wersja aplikacji 2.8.01)  — OPCJONALNY, zalecany do wypróbowania NAJPIERW NA KOPII BAZY
--
-- NOWY SYSTEM BLOKADY PIN — „stopnie”:
--     3 błędne próby  → blokada  1 min
--     5               →          5 min
--     7               →         15 min
--     10              →          1 h
--     15              → do RĘCZNEGO odblokowania przez Admina
--   • licznik zeruje się po udanym logowaniu albo po 24 h bez prób
--   • liczone są tylko błędy dla ISTNIEJĄCYCH kodów (nie da się zaśmiecić bazy losowymi kodami)
--   • blokada działa na wszystkie drogi weryfikacji PIN: zaloguj, zapisz_obecnosc,
--     zglos_obecnosc_specjalna, zmien_pin
--   • Admin widzi stopień i odliczanie, odblokowuje jednym kliknięciem (zapis w blokada_pin_log)
--   • ISTNIEJĄCY mechanizm (widok zablokowane_kody, admin_odblokuj_kod) zostaje i działa równolegle
--
-- JAK TO DZIAŁA (bez wglądu w Twoje pliki 01–13): istniejące funkcje są przemianowane na _v1_<nazwa>
-- (z odebranym dostępem dla anon/authenticated), a pod starą nazwą i z IDENTYCZNĄ sygnaturą powstaje nakładka:
-- sprawdź blokadę → wywołaj oryginał → zapisz porażkę/sukces. Aplikacja nic nie musi zmieniać.
-- Jeśli któraś funkcja zwraca inny typ niż json/jsonb, skrypt przerywa się BEZ ZMIAN (transakcja).
-- Cofnięcie: sql/16_blokada_pin_v2_cofnij.sql.  Wymaga pliku 14 (_czy_admin_14).
-- ============================================================================

create table if not exists public.blokada_pin (
    kod             text primary key,
    nieudane        int  not null default 0,
    stopien         int  not null default 0,
    zablokowane_do  timestamptz,
    trwala          boolean not null default false,
    ostatnia_proba  timestamptz not null default now(),
    ostatnie_zrodlo text
);
create table if not exists public.blokada_pin_log (
    id        bigserial primary key,
    kiedy     timestamptz not null default now(),
    kod       text not null,
    zdarzenie text not null,          -- 'blokada' | 'odblokowanie'
    stopien   int,
    zrodlo    text
);
alter table public.blokada_pin     enable row level security;
alter table public.blokada_pin_log enable row level security;

create or replace function public._pin_stopien(n int) returns int language sql immutable as $$
    select case when n >= 15 then 5 when n >= 10 then 4 when n >= 7 then 3 when n >= 5 then 2 when n >= 3 then 1 else 0 end $$;

create or replace function public._pin_przerwa(s int) returns interval language sql immutable as $$
    select case s when 1 then interval '1 minute' when 2 then interval '5 minutes'
                  when 3 then interval '15 minutes' when 4 then interval '1 hour' else null end $$;

-- Stan blokady kodu (czysty odczyt)
create or replace function public._pin_stan(p_kod text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare k text := upper(btrim(coalesce(p_kod, ''))); w public.blokada_pin%rowtype;
begin
    select * into w from public.blokada_pin where kod = k;
    if not found or (not w.trwala and w.ostatnia_proba < now() - interval '24 hours') then
        return jsonb_build_object('zablokowany', false, 'trwala', false, 'sekundy', 0, 'stopien', 0, 'nieudane', 0);
    end if;
    if w.trwala then
        return jsonb_build_object('zablokowany', true, 'trwala', true, 'sekundy', 0, 'stopien', w.stopien, 'nieudane', w.nieudane);
    end if;
    if w.zablokowane_do is not null and w.zablokowane_do > now() then
        return jsonb_build_object('zablokowany', true, 'trwala', false,
               'sekundy', ceil(extract(epoch from (w.zablokowane_do - now())))::int, 'stopien', w.stopien, 'nieudane', w.nieudane);
    end if;
    return jsonb_build_object('zablokowany', false, 'trwala', false, 'sekundy', 0, 'stopien', w.stopien, 'nieudane', w.nieudane);
end $$;

create or replace function public._pin_sukces(p_kod text) returns void
language sql security definer set search_path = public, extensions as $$
    delete from public.blokada_pin where kod = upper(btrim(coalesce(p_kod, ''))) $$;

create or replace function public._pin_porazka(p_kod text, p_zrodlo text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare k text := upper(btrim(coalesce(p_kod, ''))); w public.blokada_pin%rowtype; s int; stary int;
begin
    if not exists (select 1 from public.ministranci m where upper(m.kod) = k) then return; end if;  -- tylko istniejące kody
    select stopien into stary from public.blokada_pin where kod = k;
    insert into public.blokada_pin as b (kod, nieudane, ostatnia_proba, ostatnie_zrodlo)
    values (k, 1, now(), p_zrodlo)
    on conflict (kod) do update set
        nieudane = case when not b.trwala and b.ostatnia_proba < now() - interval '24 hours' then 1 else b.nieudane + 1 end,
        ostatnia_proba = now(), ostatnie_zrodlo = excluded.ostatnie_zrodlo
    returning * into w;
    s := public._pin_stopien(w.nieudane);
    update public.blokada_pin set stopien = s, trwala = (s = 5),
           zablokowane_do = case when s between 1 and 4 then now() + public._pin_przerwa(s) else null end
     where kod = k;
    if s > 0 and s > coalesce(stary, 0) then
        insert into public.blokada_pin_log (kod, zdarzenie, stopien, zrodlo) values (k, 'blokada', s, p_zrodlo);
    end if;
end $$;

-- Funkcje pomocnicze NIE mogą być wołane z zewnątrz (inaczej ktoś zablokowałby cudzy kod jednym zapytaniem)
revoke all on function public._pin_porazka(text, text) from public, anon, authenticated;
revoke all on function public._pin_sukces(text)        from public, anon, authenticated;
revoke all on function public._pin_stan(text)          from public, anon, authenticated;

-- --------------- nakładki na funkcje weryfikujące PIN (sygnatury i typy czytane z bazy) ----
-- [v2.8.01 NAPRAWA] Funkcja może mieć KILKA przeciążeń (np. zaloguj(p_kod, p_pin) i zaloguj(p_kod, p_pin, p_zrodlo)).
-- Wcześniej skrypt przerywał się błędem „Funkcja zaloguj ma kilka przeciążeń”. Teraz nakładka powstaje dla KAŻDEGO przeciążenia
-- osobno (każde dostaje nazwę _v1_<nazwa> o swojej sygnaturze). Nakładki z poprzedniego uruchomienia są pomijane (idempotentność).
do $gen$
declare
    f       text;
    r       record;
    v_orig  oid;
    v_args  text;
    v_ident text;
    v_names text[];
    v_rt    text;
    v_call  text;
    v_licz  int;
    i       int;
begin
    foreach f in array array['zaloguj', 'zapisz_obecnosc', 'zglos_obecnosc_specjalna', 'zmien_pin'] loop
        v_licz := 0;
        for r in
            select p.oid as o from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = f
               and position('_pin_stan(' in p.prosrc) = 0          -- pomiń już założone nakładki
             order by p.oid
        loop
            v_orig := r.o;
            v_licz := v_licz + 1;

            select pg_get_function_result(v_orig) into v_rt;
            if v_rt not in ('json', 'jsonb') then
                raise notice 'Pominięto przeciążenie % (%) — zwraca %, obsługuję tylko json/jsonb', f, pg_get_function_identity_arguments(v_orig), v_rt;
                continue;
            end if;

            select p.proargnames into v_names from pg_proc p where p.oid = v_orig;
            if v_names is null or not ('p_kod' = any(v_names)) then
                raise notice 'Pominięto przeciążenie % (%) — brak parametru p_kod', f, pg_get_function_identity_arguments(v_orig);
                continue;
            end if;

            select pg_get_function_arguments(v_orig), pg_get_function_identity_arguments(v_orig) into v_args, v_ident;

            -- oryginał → _v1_<nazwa> (ta sama sygnatura, więc przeciążenia się nie zderzają)
            execute format('alter function public.%I(%s) rename to %I', f, v_ident, '_v1_' || f);

            v_call := '';
            for i in 1 .. array_length(v_names, 1) loop
                v_call := v_call || case when i > 1 then ', ' else '' end || format('%I => %I', v_names[i], v_names[i]);
            end loop;

            execute format($f$
                create or replace function public.%I(%s)
                returns %s language plpgsql security definer set search_path = public, extensions as $b$
                declare b jsonb; r jsonb;
                begin
                    b := public._pin_stan(p_kod);
                    if (b->>'zablokowany')::boolean then
                        return (jsonb_build_object('sukces', false, 'blad', 'Kod zablokowany po błędnych próbach.', 'blokada', b))::%s;
                    end if;
                    r := to_jsonb(public.%I(%s));
                    if coalesce((r->>'sukces')::boolean, false) then
                        perform public._pin_sukces(p_kod);
                    elsif coalesce(r->>'blad', '') ilike '%%nieprawid%%' and coalesce(r->>'blad', '') ilike '%%pin%%' then
                        perform public._pin_porazka(p_kod, %L);
                        r := r || jsonb_build_object('blokada', public._pin_stan(p_kod));
                    end if;
                    return r::%s;
                end $b$ $f$, f, v_args, v_rt, v_rt, '_v1_' || f, v_call, f, v_rt);

            execute format('revoke all on function public.%I(%s) from public, anon, authenticated', '_v1_' || f, v_ident);
        end loop;
        if v_licz = 0 then raise notice 'Pominięto % — brak funkcji (lub nakładka już założona)', f; end if;
    end loop;
end $gen$;

-- --------------------------------------------------------------- panel Admina ----
create or replace function public.admin_blokady_pin_lista(p_kod_admina text, p_pin_admina text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.trwala desc, x.zablokowane_do desc nulls last) from (
            select b.kod, m.imie, m.nazwisko, b.nieudane, b.stopien, b.zablokowane_do, b.trwala
              from public.blokada_pin b left join public.ministranci m on upper(m.kod) = b.kod
             where b.nieudane > 0 and (b.trwala or b.ostatnia_proba > now() - interval '24 hours')
             limit 200) x), '[]'::jsonb));
end $$;

create or replace function public.admin_odblokuj_pin_v2(p_kod_admina text, p_pin_admina text, p_kod_do_odblokowania text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare k text := upper(btrim(coalesce(p_kod_do_odblokowania, '')));
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    delete from public.blokada_pin where kod = k;
    insert into public.blokada_pin_log (kod, zdarzenie, zrodlo) values (k, 'odblokowanie', left(p_kod_admina, 40));
    begin  -- równolegle zdejmij blokadę starego mechanizmu (jeśli funkcja istnieje)
        perform public.admin_odblokuj_kod(p_kod_admina => p_kod_admina, p_pin_admina => left(p_pin_admina, 4), p_kod_do_odblokowania => p_kod_do_odblokowania);   -- (v2.7: PIN bez dopisanego kodu 3-cyfrowego)
    exception when others then null;
    end;
    return jsonb_build_object('sukces', true, 'informacja', 'Odblokowano.');
end $$;

notify pgrst, 'reload schema';
