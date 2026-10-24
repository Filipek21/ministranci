-- ============================================================================
-- 20_reczna_obecnosc_ping.sql  (wersja aplikacji 2.8.00)
--
-- 1) admin_dodaj_obecnosc_reczna — Admin i Ksiądz sami dodają komuś:
--      • obecność na mszy / wydarzeniu (typ 'msza'),
--      • obecność specjalną = zgłoszenie (typ 'zgloszenie': pogrzeb / ślub / inne) — od razu zatwierdzoną z punktami.
--    Działa z panelu (telefon, komputer — po zalogowaniu na stronie) ORAZ z Kiosku
--    (odbicie plakietki → PIN → kod 3-cyfrowy → „Zaloguj się jako …”). Wszystko trafia do księgi punktów (sql/17) i audytu.
-- 2) PING KIOSKU z odpowiedzią „na żywo” w oknie Admina:
--      admin_ping_kiosk       — Admin zleca ping,
--      kiosk_pobierz_zadania  — Kiosk (co kilka sekund) pyta, czy ktoś go pinguje,
--      kiosk_odpowiedz_ping   — Kiosk odsyła dane diagnostyczne,
--      admin_ping_status      — okno Admina odczytuje odpowiedź + czas reakcji w milisekundach.
--
-- Uruchom w SQL Editorze PO plikach 14–19. Idempotentny.
-- ============================================================================

do $chk$
begin
    if to_regprocedure('public._czy_staff_17(text,text)') is null or to_regprocedure('public._czy_admin_14(text,text)') is null then
        raise exception 'Najpierw wykonaj sql/14 i sql/17 (brak funkcji pomocniczych). Nic nie zmieniono.';
    end if;
    if to_regclass('public.obecnosci') is null then
        raise exception 'Brak tabeli public.obecnosci. Nic nie zmieniono.';
    end if;
end $chk$;

-- ---------------------------------------------------------------------------
-- Wspólne: dodanie / nadpisanie obecności (bez sprawdzania uprawnień — woła je funkcja z autoryzacją)
-- ---------------------------------------------------------------------------
create or replace function public._obecnosc_dodaj_20(p_ministrant_id text, p_wydarzenie_id text, p_punkty int, p_zaliczone_jako text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_typ text; n int;
begin
    select format_type(a.atttypid, a.atttypmod) into v_typ from pg_attribute a
     where a.attrelid = 'public.obecnosci'::regclass and a.attname = 'zaliczone_jako' and not a.attisdropped;

    -- jest już obecność tej osoby na tym wydarzeniu → poprawiamy punkty (zamiast błędu „unique_violation”)
    if exists (select 1 from public.obecnosci o where o.ministrant_id::text = p_ministrant_id and o.wydarzenie_id::text = p_wydarzenie_id) then
        execute format('update public.obecnosci set punkty = $1, zaliczone_jako = $2::%s where ministrant_id::text = $3 and wydarzenie_id::text = $4', v_typ)
            using p_punkty, p_zaliczone_jako, p_ministrant_id, p_wydarzenie_id;
        return jsonb_build_object('sukces', true, 'akcja', 'zaktualizowano');
    end if;

    execute format('insert into public.obecnosci (ministrant_id, wydarzenie_id, punkty, zaliczone_jako, data_zapisu)
                    select m.id, w.id, $1, $2::%s, now() from public.ministranci m, public.kalendarz w
                     where m.id::text = $3 and w.id::text = $4', v_typ)
        using p_punkty, p_zaliczone_jako, p_ministrant_id, p_wydarzenie_id;
    get diagnostics n = row_count;
    if n = 0 then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono ministranta lub wydarzenia.'); end if;
    return jsonb_build_object('sukces', true, 'akcja', 'dodano');
end $$;
revoke all on function public._obecnosc_dodaj_20(text, text, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Wspólne: zgłoszenie specjalne dodane przez Admina/Księdza i od razu zatwierdzone.
-- Tabela zgłoszeń jest wykrywana z bazy (kolumny ministrant_id + typ + status) — nie zakładam jej nazwy.
-- ---------------------------------------------------------------------------
create or replace function public._zgloszenie_reczne_20(p_kod_admina text, p_pin_admina text, p_ministrant_id text, p_typ text, p_punkty int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_tab text; v_idtyp text; v_cols text; v_json jsonb; v_id text; v_wyn jsonb;
begin
    select c.table_name into v_tab
      from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
     where c.table_schema = 'public'
     group by c.table_name
    having bool_or(c.column_name = 'ministrant_id') and bool_or(c.column_name = 'typ') and bool_or(c.column_name = 'status')
       and c.table_name not in ('obecnosci', 'ksiega_punktow', 'skany_plakietek')
     order by (c.table_name like '%zglosz%') desc, c.table_name
     limit 1;
    if v_tab is null then
        return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono tabeli zgłoszeń w bazie.');
    end if;

    select format_type(a.atttypid, a.atttypmod) into v_idtyp from pg_attribute a
     where a.attrelid = ('public.' || quote_ident(v_tab))::regclass and a.attname = 'id' and not a.attisdropped;

    v_json := jsonb_build_object('ministrant_id', p_ministrant_id, 'typ', p_typ, 'status', 'oczekujace', 'data_zgloszenia', now());
    select string_agg(format('%I', c.column_name), ', ') into v_cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = v_tab and v_json ? c.column_name;

    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id::text', v_tab, v_cols, v_cols, v_tab)
        into v_id using v_json;

    -- zatwierdzenie istniejącą funkcją (ta sama ścieżka punktowania co w zakładce „Zgłoszenia”); starsze funkcje znają sam PIN (4 cyfry)
    execute format('select to_jsonb(public.rozpatrz_zgloszenie(p_kod_admina => $1, p_pin_admina => $2, p_zgloszenie_id => $3::%s, p_decyzja => $4, p_punkty => $5))', v_idtyp)
        into v_wyn using p_kod_admina, left(p_pin_admina, 4), v_id, 'zatwierdz', p_punkty;
    return coalesce(v_wyn, jsonb_build_object('sukces', true)) || jsonb_build_object('zgloszenie_id', v_id);
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się dodać zgłoszenia: ' || sqlerrm);
end $$;
revoke all on function public._zgloszenie_reczne_20(text, text, text, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Główna funkcja: Admin + Ksiądz
-- ---------------------------------------------------------------------------
create or replace function public.admin_dodaj_obecnosc_reczna(
    p_kod_admina text, p_pin_admina text, p_ministrant_id text,
    p_rodzaj text,                               -- 'msza' | 'zgloszenie'
    p_wydarzenie_id text default null,           -- wymagane dla 'msza'
    p_punkty int default 1,
    p_zaliczone_jako text default 'zbiorka',
    p_typ_zgloszenia text default 'inne',        -- dla 'zgloszenie': 'pogrzeb' | 'slub' | 'inne'
    p_powod text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_rola text; j jsonb; v_wyn jsonb; v_zrodlo text;
begin
    v_rola := public._rola_staff_18(p_kod_admina, p_pin_admina);
    if v_rola is null then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;

    select to_jsonb(m) into j from public.ministranci m where m.id::text = p_ministrant_id;
    if j is null then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono ministranta.'); end if;
    -- Ksiądz nie dopisuje punktów kontom Admina (Admin — każdemu)
    if v_rola = 'moderator' and coalesce((j->>'is_admin')::boolean, false) then
        return jsonb_build_object('sukces', false, 'blad', 'Ksiądz nie może dodawać obecności kontu Admina.');
    end if;
    if coalesce((j->>'aktywny')::boolean, true) is false then
        return jsonb_build_object('sukces', false, 'blad', 'To konto jest nieaktywne.');
    end if;
    if p_punkty is null or p_punkty < 0 or p_punkty > 100 then
        return jsonb_build_object('sukces', false, 'blad', 'Punkty muszą mieścić się w zakresie 0…100.');
    end if;
    if p_rodzaj not in ('msza', 'zgloszenie') then
        return jsonb_build_object('sukces', false, 'blad', 'Nieznany rodzaj obecności.');
    end if;

    v_zrodlo := case when v_rola = 'admin' then 'admin_panel' else 'admin_panel' end;
    perform public._ustaw_audyt_17(p_kod_admina, coalesce(nullif(btrim(p_powod), ''), 'dodane ręcznie (' || p_rodzaj || ')'));

    if p_rodzaj = 'msza' then
        if p_wydarzenie_id is null or btrim(p_wydarzenie_id) = '' then
            return jsonb_build_object('sukces', false, 'blad', 'Wybierz wydarzenie (mszę).');
        end if;
        v_wyn := public._obecnosc_dodaj_20(p_ministrant_id, p_wydarzenie_id, p_punkty, coalesce(nullif(btrim(p_zaliczone_jako), ''), 'zbiorka'));
    else
        if p_typ_zgloszenia not in ('pogrzeb', 'slub', 'inne') then
            return jsonb_build_object('sukces', false, 'blad', 'Nieznany typ zgłoszenia.');
        end if;
        v_wyn := public._zgloszenie_reczne_20(p_kod_admina, p_pin_admina, p_ministrant_id, p_typ_zgloszenia, p_punkty);
    end if;

    if coalesce((v_wyn->>'sukces')::boolean, false) and to_regclass('public.dziennik_audytu') is not null then
        insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
        values (p_kod_admina, 'obecnosci', 'dodano_recznie', j->>'kod',
                jsonb_build_object('rodzaj', p_rodzaj, 'wydarzenie_id', p_wydarzenie_id, 'typ_zgloszenia', p_typ_zgloszenia,
                                   'punkty', p_punkty, 'powod', left(p_powod, 200)));
    end if;
    return v_wyn;
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się dodać: ' || sqlerrm);
end $$;
grant execute on function public.admin_dodaj_obecnosc_reczna(text, text, text, text, text, int, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) PING KIOSKU na żywo
-- ---------------------------------------------------------------------------
create table if not exists public.kioski_ping_zadania (
    id             bigserial primary key,
    kiosk_id       text not null,
    zlecil         text,
    utworzono      timestamptz not null default clock_timestamp(),
    odpowiedziano  timestamptz,
    odpowiedz      jsonb
);
create index if not exists kioski_ping_zadania_idx on public.kioski_ping_zadania (kiosk_id, utworzono desc);
alter table public.kioski_ping_zadania enable row level security;   -- bez polityk: dostęp tylko przez funkcje poniżej

create or replace function public.admin_ping_kiosk(p_kod_admina text, p_pin_admina text, p_kiosk_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_id bigint; v_ostatni timestamptz;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień (wymagany Admin).');
    end if;
    if p_kiosk_id is null or length(btrim(p_kiosk_id)) = 0 then
        return jsonb_build_object('sukces', false, 'blad', 'Nie podano Kiosku.');
    end if;
    -- hamulec: max 1 ping na kiosk co 2 s
    select max(utworzono) into v_ostatni from public.kioski_ping_zadania where kiosk_id = p_kiosk_id;
    if v_ostatni is not null and v_ostatni > clock_timestamp() - interval '2 seconds' then
        return jsonb_build_object('sukces', false, 'blad', 'Poczekaj chwilę przed kolejnym pingiem.');
    end if;
    insert into public.kioski_ping_zadania (kiosk_id, zlecil) values (left(p_kiosk_id, 120), p_kod_admina) returning id into v_id;
    delete from public.kioski_ping_zadania where utworzono < now() - interval '2 days';
    return jsonb_build_object('sukces', true, 'zadanie_id', v_id);
end $$;
grant execute on function public.admin_ping_kiosk(text, text, text) to anon, authenticated;

-- Kiosk: „czy ktoś mnie pinguje?” (bez PIN-u — zwraca wyłącznie numery otwartych zadań tego kiosku)
create or replace function public.kiosk_pobierz_zadania(p_kiosk_id text)
returns jsonb language sql security definer set search_path = public, extensions stable as $$
    select jsonb_build_object('sukces', true, 'zadania', coalesce((
        select jsonb_agg(z.id order by z.id) from public.kioski_ping_zadania z
         where z.kiosk_id = left(coalesce(p_kiosk_id, ''), 120) and z.odpowiedziano is null and z.utworzono > now() - interval '2 minutes'), '[]'::jsonb)) $$;
grant execute on function public.kiosk_pobierz_zadania(text) to anon, authenticated;

create or replace function public.kiosk_odpowiedz_ping(p_kiosk_id text, p_zadanie_id bigint, p_dane jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
begin
    update public.kioski_ping_zadania
       set odpowiedziano = clock_timestamp(), odpowiedz = case when length(coalesce(p_dane, '{}'::jsonb)::text) <= 4000 then coalesce(p_dane, '{}'::jsonb) else '{}'::jsonb end
     where id = p_zadanie_id and kiosk_id = left(coalesce(p_kiosk_id, ''), 120) and odpowiedziano is null;
    get diagnostics n = row_count;
    return jsonb_build_object('sukces', n > 0);
end $$;
grant execute on function public.kiosk_odpowiedz_ping(text, bigint, jsonb) to anon, authenticated;

create or replace function public.admin_ping_status(p_kod_admina text, p_pin_admina text, p_zadanie_id bigint)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare z public.kioski_ping_zadania%rowtype;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień (wymagany Admin).');
    end if;
    select * into z from public.kioski_ping_zadania where id = p_zadanie_id;
    if not found then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono pingu.'); end if;
    return jsonb_build_object('sukces', true, 'odpowiedziano', z.odpowiedziano is not null, 'utworzono', z.utworzono,
        'czas_odpowiedzi_ms', case when z.odpowiedziano is not null then round(extract(epoch from (z.odpowiedziano - z.utworzono)) * 1000)::int end,
        'odpowiedz', z.odpowiedz, 'czas_serwera', clock_timestamp());
end $$;
grant execute on function public.admin_ping_status(text, text, bigint) to anon, authenticated;

notify pgrst, 'reload schema';

-- Kontrola po uruchomieniu (powinno zwrócić 6 wierszy):
-- select proname from pg_proc where proname in ('admin_dodaj_obecnosc_reczna','admin_ping_kiosk','kiosk_pobierz_zadania',
--   'kiosk_odpowiedz_ping','admin_ping_status','_obecnosc_dodaj_20');
