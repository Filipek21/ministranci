-- ============================================================================
-- 17_ksiega_punktow_edycja_bazy.sql  (wersja aplikacji 2.5.00)
--
--  1) KSIĘGA PUNKTÓW (public.ksiega_punktow) — niezmienny, dopisywany dziennik KAŻDEJ zmiany punktów
--     ministranta: przyznanie, zmiana, usunięcie. Zapisuje: kiedy, za co (wydarzenie), ile przed → po,
--     kto zmienił, skąd i dlaczego. Wpisów NIE DA SIĘ edytować ani kasować (triggery blokują UPDATE / DELETE /
--     TRUNCATE) — także wtedy, gdy Admin usunie samą obecność: w księdze zostaje ślad „Usunięcie”.
--     Księga zapełnia się automatycznie triggerem na tabeli obecnosci (Kiosk, zgłoszenia, korekty, panel Admina).
--     Dotychczasowe obecności są jednorazowo zaimportowane (źródło „import”).
--  2) Funkcje Admina do EDYCJI bazy w panelu: edycja / usuwanie / ręczne dodawanie punktów, lista obecności z
--     identyfikatorami, zmiana nazwy i usuwanie wydarzeń.
--
-- Uruchom w SQL Editorze PO plikach 01–16 (korzysta z _czy_admin_14 z pliku 14). Idempotentny.
-- ZAŁOŻENIA (skrypt SPRAWDZA je na początku i przerywa z czytelnym komunikatem, jeśli się nie zgadzają):
--   public.obecnosci(id, ministrant_id, wydarzenie_id, punkty, zaliczone_jako, data_zapisu)
--   public.kalendarz(id, nazwa)        public.ministranci(id, kod, …)
-- ============================================================================

do $chk$
declare brak text;
begin
    select string_agg(c, ', ') into brak from unnest(array['id','ministrant_id','wydarzenie_id','punkty','zaliczone_jako','data_zapisu']) c
     where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'obecnosci' and column_name = c);
    if brak is not null then raise exception 'Tabela public.obecnosci nie ma kolumn: % — sprawdź nazwy i dostosuj skrypt (nic nie zmieniono).', brak; end if;
    select string_agg(c, ', ') into brak from unnest(array['id','nazwa']) c
     where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kalendarz' and column_name = c);
    if brak is not null then raise exception 'Tabela public.kalendarz nie ma kolumn: % (nic nie zmieniono).', brak; end if;
end $chk$;

-- [v2.8 NAPRAWA] „kalendarz” to w tej bazie WIDOK (tabela źródłowa: wydarzenia). Na widoku nie da się zrobić UPDATE/DELETE
-- ani założyć wyzwalacza AFTER — dlatego zapisy kierujemy do tabeli bazowej wskazanej tą funkcją.
create or replace function public._tab_wydarzen() returns text
language plpgsql stable set search_path = public, extensions as $$
declare k text;
begin
    select c.relkind::text into k from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'kalendarz';
    if k in ('r', 'p') then return 'kalendarz'; end if;
    if to_regclass('public.wydarzenia') is not null then return 'wydarzenia'; end if;
    return 'kalendarz';
end $$;

-- ---------------------------------------------------------------- KSIĘGA ----
create table if not exists public.ksiega_punktow (
    id               bigserial primary key,
    kiedy            timestamptz not null default now(),   -- kiedy zdarzenie zaszło (przy imporcie: data_zapisu)
    ministrant_id    text not null,
    ministrant_kod   text,
    obecnosc_id      text,
    wydarzenie_id    text,
    wydarzenie_nazwa text,
    zdarzenie        text not null,                          -- 'przyznanie' | 'zmiana' | 'usuniecie'
    punkty_przed     int,
    punkty_po        int,
    zmiana           int not null default 0,                 -- punkty_po - punkty_przed (wpływ na sumę)
    zaliczone_przed  text,
    zaliczone_po     text,
    kto_kod          text,
    zrodlo           text,                                   -- 'import' | 'admin_panel' | 'auto' | 'nieznane'
    powod            text
);
create index if not exists ksiega_punktow_min_idx on public.ksiega_punktow (ministrant_id, kiedy desc);
create index if not exists ksiega_punktow_obec_idx on public.ksiega_punktow (obecnosc_id);
alter table public.ksiega_punktow enable row level security;   -- brak polityk = dostęp tylko przez funkcje poniżej

-- Niezmienność: żadnych poprawek ani kasowania wpisów księgi
create or replace function public._ksiega_niezmienna() returns trigger language plpgsql as $$
begin
    raise exception 'Księga punktów jest niezmienna — wpisów nie wolno edytować ani usuwać.';
end $$;
drop trigger if exists trg_ksiega_nie_zmieniaj on public.ksiega_punktow;
create trigger trg_ksiega_nie_zmieniaj before update or delete on public.ksiega_punktow
    for each row execute function public._ksiega_niezmienna();
drop trigger if exists trg_ksiega_nie_czysc on public.ksiega_punktow;
create trigger trg_ksiega_nie_czysc before truncate on public.ksiega_punktow
    for each statement execute function public._ksiega_niezmienna();

-- Jednorazowy import istniejących obecności (tylko te, których jeszcze nie ma w księdze)
insert into public.ksiega_punktow (kiedy, ministrant_id, ministrant_kod, obecnosc_id, wydarzenie_id, wydarzenie_nazwa,
                                   zdarzenie, punkty_przed, punkty_po, zmiana, zaliczone_po, zrodlo)
select coalesce(o.data_zapisu, now()), o.ministrant_id::text, m.kod, o.id::text, o.wydarzenie_id::text, k.nazwa,
       'przyznanie', 0, o.punkty::int, o.punkty::int, o.zaliczone_jako::text, 'import'
  from public.obecnosci o
  left join public.ministranci m on m.id::text = o.ministrant_id::text
  left join public.kalendarz   k on k.id::text = o.wydarzenie_id::text
 where not exists (select 1 from public.ksiega_punktow x where x.obecnosc_id = o.id::text);

-- Automatyczny zapis każdej zmiany na obecnosci (INSERT / UPDATE punktów lub typu / DELETE)
create or replace function public._tr_obecnosci_ksiega() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
    o record; v_kod text; v_nazwa text; zr text; kto text; pw text;
    v_zd text; v_przed int; v_po int; v_zp text; v_zpo text;
begin
    if tg_op = 'DELETE' then o := old; else o := new; end if;
    if tg_op = 'UPDATE' then   -- (zagnieżdżone if: PL/pgSQL nie gwarantuje skracania warunków, a OLD nie istnieje przy INSERT)
        if old.punkty is not distinct from new.punkty
           and old.zaliczone_jako::text is not distinct from new.zaliczone_jako::text then
            return new;
        end if;
    end if;

    select m.kod into v_kod from public.ministranci m where m.id::text = o.ministrant_id::text;
    select k.nazwa into v_nazwa from public.kalendarz k where k.id::text = o.wydarzenie_id::text;
    zr  := nullif(current_setting('em.zrodlo', true), '');
    kto := nullif(current_setting('em.kto', true), '');
    pw  := nullif(current_setting('em.powod', true), '');

    if tg_op = 'INSERT' then
        v_zd := 'przyznanie'; v_przed := 0;            v_po := new.punkty::int; v_zp := null;                  v_zpo := new.zaliczone_jako::text;
    elsif tg_op = 'UPDATE' then
        v_zd := 'zmiana';     v_przed := old.punkty::int; v_po := new.punkty::int; v_zp := old.zaliczone_jako::text; v_zpo := new.zaliczone_jako::text;
    else
        v_zd := 'usuniecie';  v_przed := old.punkty::int; v_po := 0;               v_zp := old.zaliczone_jako::text; v_zpo := null;
    end if;
    -- bez znacznika z panelu Admina: INSERT = zapis automatyczny (Kiosk/zgłoszenie), UPDATE/DELETE = korekta/cofnięcie z Kiosku
    zr := coalesce(zr, case when tg_op = 'INSERT' then 'auto' else 'nieznane' end);

    insert into public.ksiega_punktow (ministrant_id, ministrant_kod, obecnosc_id, wydarzenie_id, wydarzenie_nazwa, zdarzenie,
                                       punkty_przed, punkty_po, zmiana, zaliczone_przed, zaliczone_po, kto_kod, zrodlo, powod)
    values (o.ministrant_id::text, v_kod, o.id::text, o.wydarzenie_id::text, v_nazwa, v_zd,
            v_przed, v_po, coalesce(v_po, 0) - coalesce(v_przed, 0), v_zp, v_zpo, kto, zr, left(pw, 300));
    if tg_op = 'DELETE' then return old; end if;
    return new;
exception when others then
    -- księga nigdy nie może zablokować zapisu obecności na Kiosku
    raise warning 'ksiega_punktow: %', sqlerrm;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end $$;

drop trigger if exists trg_obecnosci_ksiega on public.obecnosci;
create trigger trg_obecnosci_ksiega after insert or update or delete on public.obecnosci
    for each row execute function public._tr_obecnosci_ksiega();

-- ---------------------------------------------------- uprawnienia (Admin / Ksiądz) ----
create or replace function public._czy_staff_17(p_kod text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare w jsonb;
begin
    w := to_jsonb(public.zaloguj(p_kod, p_pin, 'pwa'));
    return coalesce((w->>'sukces')::boolean, false)
       and (coalesce((w->>'is_admin')::boolean, false) or coalesce((w->>'is_moderator')::boolean, false));
end $$;
revoke all on function public._czy_staff_17(text, text) from public, anon, authenticated;

create or replace function public._ustaw_audyt_17(p_kto text, p_powod text) returns void
language plpgsql set search_path = public, extensions as $$
begin
    perform set_config('em.zrodlo', 'admin_panel', true);
    perform set_config('em.kto', coalesce(p_kto, ''), true);
    perform set_config('em.powod', coalesce(left(p_powod, 300), ''), true);
end $$;
revoke all on function public._ustaw_audyt_17(text, text) from public, anon, authenticated;

-- ------------------------------------------------------ odczyt księgi (Admin + Ksiądz) ----
create or replace function public.admin_historia_punktow(
    p_kod_admina text, p_pin_admina text, p_ministrant_id text default null, p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_staff_17(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.kiedy desc, x.id desc) from (
            select k.id, k.kiedy, k.ministrant_id, k.ministrant_kod, m.imie, m.nazwisko, k.obecnosc_id, k.wydarzenie_id,
                   k.wydarzenie_nazwa, k.zdarzenie, k.punkty_przed, k.punkty_po, k.zmiana, k.zaliczone_przed, k.zaliczone_po,
                   k.kto_kod, k.zrodlo, k.powod,
                   sum(k.zmiana) over (partition by k.ministrant_id order by k.kiedy, k.id) as suma_narastajaco,
                   exists (select 1 from public.obecnosci o where o.id::text = k.obecnosc_id) as aktualna
              from public.ksiega_punktow k
              left join public.ministranci m on m.id::text = k.ministrant_id
             where (p_ministrant_id is null or k.ministrant_id = p_ministrant_id)
             order by k.kiedy desc, k.id desc
             limit least(greatest(coalesce(p_limit, 500), 1), 2000)) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------ lista obecności z identyfikatorami (Admin) ----
create or replace function public.admin_obecnosci_lista(p_kod_admina text, p_pin_admina text, p_rok int, p_miesiac int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_od timestamp; v_do timestamp;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    v_od := make_date(p_rok, p_miesiac, 1)::timestamp;
    v_do := v_od + interval '1 month';
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(x) order by x.data_zapisu desc) from (
            select o.id::text as id, o.ministrant_id::text as ministrant_id, o.wydarzenie_id::text as wydarzenie_id,
                   m.kod, m.imie, m.nazwisko, k.nazwa, o.zaliczone_jako::text as zaliczone_jako,
                   o.punkty::int as punkty, o.data_zapisu
              from public.obecnosci o
              left join public.ministranci m on m.id::text = o.ministrant_id::text
              left join public.kalendarz   k on k.id::text = o.wydarzenie_id::text
             where (o.data_zapisu at time zone 'Europe/Warsaw') >= v_od and (o.data_zapisu at time zone 'Europe/Warsaw') < v_do
             order by o.data_zapisu desc limit 3000) x), '[]'::jsonb));
end $$;

-- ------------------------------------------------------ edycja punktów (tylko Admin) ----
create or replace function public.admin_punkty_edytuj(
    p_kod_admina text, p_pin_admina text, p_obecnosc_id text, p_punkty int,
    p_zaliczone_jako text default null, p_powod text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_typ text; n int;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    if p_punkty is null or p_punkty < -100 or p_punkty > 100 then
        return jsonb_build_object('sukces', false, 'blad', 'Punkty muszą mieścić się w zakresie -100…100.');
    end if;
    perform public._ustaw_audyt_17(p_kod_admina, p_powod);
    select format_type(a.atttypid, a.atttypmod) into v_typ from pg_attribute a
     where a.attrelid = 'public.obecnosci'::regclass and a.attname = 'zaliczone_jako' and not a.attisdropped;
    if nullif(btrim(coalesce(p_zaliczone_jako, '')), '') is null then
        update public.obecnosci set punkty = p_punkty where id::text = p_obecnosc_id;
    else
        execute format('update public.obecnosci set punkty = $1, zaliczone_jako = $2::%s where id::text = $3', v_typ)
            using p_punkty, btrim(p_zaliczone_jako), p_obecnosc_id;
    end if;
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono takiej obecności (mogła zostać już usunięta).'); end if;
    return jsonb_build_object('sukces', true);
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się zapisać: ' || sqlerrm);
end $$;

create or replace function public.admin_punkty_usun(
    p_kod_admina text, p_pin_admina text, p_obecnosc_id text, p_powod text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    perform public._ustaw_audyt_17(p_kod_admina, p_powod);
    delete from public.obecnosci where id::text = p_obecnosc_id;   -- ślad zostaje w księdze („usuniecie”)
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono takiej obecności.'); end if;
    return jsonb_build_object('sukces', true);
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się usunąć: ' || sqlerrm);
end $$;

create or replace function public.admin_punkty_dodaj(
    p_kod_admina text, p_pin_admina text, p_ministrant_id text, p_wydarzenie_id text, p_punkty int,
    p_zaliczone_jako text default 'zbiorka', p_powod text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_typ text; n int;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    if p_punkty is null or p_punkty < -100 or p_punkty > 100 then
        return jsonb_build_object('sukces', false, 'blad', 'Punkty muszą mieścić się w zakresie -100…100.');
    end if;
    perform public._ustaw_audyt_17(p_kod_admina, p_powod);
    select format_type(a.atttypid, a.atttypmod) into v_typ from pg_attribute a
     where a.attrelid = 'public.obecnosci'::regclass and a.attname = 'zaliczone_jako' and not a.attisdropped;
    execute format('insert into public.obecnosci (ministrant_id, wydarzenie_id, punkty, zaliczone_jako, data_zapisu)
                    select m.id, k.id, $1, $2::%s, now() from public.ministranci m, public.kalendarz k
                     where m.id::text = $3 and k.id::text = $4', v_typ)
        using p_punkty, coalesce(nullif(btrim(p_zaliczone_jako), ''), 'zbiorka'), p_ministrant_id, p_wydarzenie_id;
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono ministranta lub wydarzenia.'); end if;
    return jsonb_build_object('sukces', true);
exception
    when unique_violation then
        return jsonb_build_object('sukces', false, 'blad', 'Ten ministrant ma już obecność na tym wydarzeniu — edytuj istniejący wpis.');
    when others then
        return jsonb_build_object('sukces', false, 'blad', 'Nie udało się dodać: ' || sqlerrm);
end $$;

-- ------------------------------------------------------- wydarzenia (tylko Admin) ----
create or replace function public.admin_wydarzenie_zmien_nazwe(
    p_kod_admina text, p_pin_admina text, p_wydarzenie_id text, p_nazwa text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    if coalesce(length(btrim(p_nazwa)), 0) = 0 or length(p_nazwa) > 120 then
        return jsonb_build_object('sukces', false, 'blad', 'Nazwa musi mieć 1–120 znaków.');
    end if;
    execute format('update public.%I set nazwa = $1 where id::text = $2', public._tab_wydarzen()) using btrim(p_nazwa), p_wydarzenie_id;
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono wydarzenia.'); end if;
    return jsonb_build_object('sukces', true);
end $$;

create or replace function public.admin_wydarzenie_usun(
    p_kod_admina text, p_pin_admina text, p_wydarzenie_id text, p_wymus boolean default false, p_powod text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int; d int;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.');
    end if;
    select count(*) into n from public.obecnosci where wydarzenie_id::text = p_wydarzenie_id;
    if n > 0 and not coalesce(p_wymus, false) then
        return jsonb_build_object('sukces', false, 'wymaga_potwierdzenia', true, 'liczba', n,
                                  'blad', 'Wydarzenie ma zapisane obecności (' || n || ').');
    end if;
    perform public._ustaw_audyt_17(p_kod_admina, coalesce(p_powod, 'usunięcie wydarzenia'));
    delete from public.obecnosci where wydarzenie_id::text = p_wydarzenie_id;     -- każdy wpis trafia do księgi
    execute format('delete from public.%I where id::text = $1', public._tab_wydarzen()) using p_wydarzenie_id;
    get diagnostics d = row_count;
    if d = 0 then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono wydarzenia.'); end if;
    return jsonb_build_object('sukces', true, 'usuniete_obecnosci', n);
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się usunąć: ' || sqlerrm);
end $$;

notify pgrst, 'reload schema';
