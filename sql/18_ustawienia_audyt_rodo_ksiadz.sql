-- ============================================================================
-- 18_ustawienia_audyt_rodo_ksiadz.sql  (wersja aplikacji 2.6.00)
--
--  1) USTAWIENIA SYSTEMOWE (ustawienia_systemu): nazwa parafii, domyślne okno rejestracji, ważność cache Kiosku,
--     częstość odświeżania cache, retencja logów, język domyślny — z walidacją zakresów i wpisem do audytu.
--  2) DZIENNIK AUDYTU (dziennik_audytu, niezmienny) + triggery rejestrujące zmiany kont (ministranci) i wydarzeń
--     (kalendarz): co, kiedy, kto, z → na (bez PIN-ów). Widok zbiorczy admin_audyt_zdarzenia łączy: zmiany PIN,
--     plakietki, punkty, blokady, zmiany danych, operacje RODO.
--  3) NARZĘDZIA RODO: eksport danych osoby (art. 15/20), anonimizacja (art. 17), czyszczenie starych logów
--     (retencja) + niezmienny rejestr tych operacji (rodo_rejestr).
--  4) KSIĄDZ: dodawanie ministrantów i zarządzanie nimi (edycja, PIN, aktywność) — wyłącznie zwykłymi ministrantami
--     (nie dotyka kont Admina ani innych Księży).
--
-- Uruchom PO plikach 01–17 (wymaga: 14 → _czy_admin_14; 15 → _pin_prosty_ok, historia_*; 17 → ksiega_punktow).
-- Idempotentny. Skrypt sprawdza zależności na początku i przerywa bez zmian, jeśli czegoś brakuje.
-- ZAŁOŻENIE: public.ministranci(id, kod, imie, nazwisko, pin_hash, aktywny, …); opcjonalne kolumny pin_jawny,
-- is_admin, is_moderator są wykrywane dynamicznie.
-- ============================================================================

do $chk$
begin
    if to_regclass('public.ministranci') is null or to_regclass('public.kalendarz') is null then
        raise exception 'Brak tabel ministranci/kalendarz (nic nie zmieniono).';
    end if;
    if to_regclass('public.ksiega_punktow') is null or to_regclass('public.historia_pin') is null then
        raise exception 'Najpierw wykonaj sql/15 i sql/17 (brak historia_pin / ksiega_punktow). Nic nie zmieniono.';
    end if;
    if to_regprocedure('public._czy_admin_14(text,text)') is null or to_regprocedure('public._pin_prosty_ok(text)') is null then
        raise exception 'Najpierw wykonaj sql/14 i sql/15 (brak _czy_admin_14 / _pin_prosty_ok). Nic nie zmieniono.';
    end if;
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

-- ---------------------------------------------------------- USTAWIENIA ----
create table if not exists public.ustawienia_systemu (
    klucz     text primary key,
    wartosc   jsonb not null,
    opis      text,
    zmienil   text,
    zmieniono timestamptz not null default now()
);
alter table public.ustawienia_systemu enable row level security;

insert into public.ustawienia_systemu (klucz, wartosc, opis) values
    ('nazwa_parafii',       '"Parafia"'::jsonb, 'Nazwa wyświetlana w nagłówkach raportów PDF'),
    ('okno_przed_min',      '15'::jsonb,        'Domyślnie: ile minut PRZED wydarzeniem można się zeskanować'),
    ('okno_po_min',         '5'::jsonb,         'Domyślnie: ile minut PO rozpoczęciu można się zeskanować'),
    ('cache_offline_dni',   '10'::jsonb,        'Ważność danych offline na Kiosku (dni)'),
    ('cache_odswiez_min',   '30'::jsonb,        'Co ile minut Kiosk odświeża dane offline w tle'),
    ('retencja_logowan_dni','365'::jsonb,       'Po ilu dniach narzędzie RODO może usuwać stare logi logowań i skanów'),
    ('domyslny_jezyk',      '"pl"'::jsonb,      'Język domyślny: pl / en / uk')
on conflict (klucz) do nothing;

create or replace function public._ustawienie_ok(p_klucz text, p_w jsonb) returns text
language plpgsql immutable as $$
declare n numeric;
begin
    if p_klucz = 'nazwa_parafii' then
        if jsonb_typeof(p_w) <> 'string' or length(btrim(p_w #>> '{}')) not between 1 and 80 then return 'Nazwa: 1–80 znaków.'; end if;
    elsif p_klucz = 'domyslny_jezyk' then
        if jsonb_typeof(p_w) <> 'string' or (p_w #>> '{}') not in ('pl','en','uk') then return 'Dozwolone: pl, en, uk.'; end if;
    elsif p_klucz in ('okno_przed_min','okno_po_min','cache_offline_dni','cache_odswiez_min','retencja_logowan_dni') then
        if jsonb_typeof(p_w) <> 'number' then return 'Wymagana liczba.'; end if;
        n := (p_w #>> '{}')::numeric;
        if n <> floor(n) then return 'Wymagana liczba całkowita.'; end if;
        if p_klucz in ('okno_przed_min','okno_po_min') and n not between 0 and 240 then return 'Zakres 0–240 minut.'; end if;
        if p_klucz = 'cache_offline_dni' and n not between 1 and 30 then return 'Zakres 1–30 dni.'; end if;
        if p_klucz = 'cache_odswiez_min' and n not between 5 and 720 then return 'Zakres 5–720 minut.'; end if;
        if p_klucz = 'retencja_logowan_dni' and n not between 30 and 3650 then return 'Zakres 30–3650 dni.'; end if;
    else
        return 'Nieznane ustawienie.';
    end if;
    return null;
end $$;

-- Ustawienia bezpieczne do odczytu przez Kiosk (bez logowania)
create or replace function public.ustawienia_publiczne() returns jsonb
language sql security definer set search_path = public, extensions stable as $$
    select coalesce(jsonb_object_agg(klucz, wartosc), '{}'::jsonb)
      from public.ustawienia_systemu
     where klucz in ('nazwa_parafii','okno_przed_min','okno_po_min','cache_offline_dni','cache_odswiez_min','domyslny_jezyk') $$;

create or replace function public.admin_ustawienia_pobierz(p_kod_admina text, p_pin_admina text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(u) order by u.klucz) from (
            select klucz, wartosc, opis, zmienil, zmieniono from public.ustawienia_systemu) u), '[]'::jsonb));
end $$;

-- ------------------------------------------------------------ AUDYT ----
create table if not exists public.dziennik_audytu (
    id        bigserial primary key,
    kiedy     timestamptz not null default now(),
    kto_kod   text,
    kategoria text not null,       -- 'ministranci' | 'kalendarz' | 'ustawienia' | …
    akcja     text not null,       -- 'dodano' | 'zmieniono' | 'usunieto'
    obiekt    text,
    szczegoly jsonb
);
create index if not exists dziennik_audytu_kiedy_idx on public.dziennik_audytu (kiedy desc);
alter table public.dziennik_audytu enable row level security;

create table if not exists public.rodo_rejestr (
    id        bigserial primary key,
    kiedy     timestamptz not null default now(),
    kto_kod   text,
    operacja  text not null,       -- 'eksport' | 'anonimizacja' | 'czyszczenie_logow'
    osoba_ref text,                -- identyfikator techniczny (bez danych osobowych)
    uwagi     text
);
alter table public.rodo_rejestr enable row level security;

-- Niezmienność księgi punktów, dziennika audytu i rejestru RODO.
-- WYJĄTEK: sama procedura anonimizacji RODO (znacznik em.rodo = '1') może poprawić dane identyfikujące osobę.
create or replace function public._ksiega_niezmienna() returns trigger language plpgsql as $$
begin
    if tg_op = 'UPDATE' and coalesce(current_setting('em.rodo', true), '') = '1' then
        return new;
    end if;
    raise exception 'Ten rejestr jest niezmienny — wpisów nie wolno edytować ani usuwać.';
end $$;

do $trg$
declare t text;
begin
    foreach t in array array['dziennik_audytu', 'rodo_rejestr'] loop
        execute format('drop trigger if exists trg_nie_zmieniaj on public.%I', t);
        execute format('create trigger trg_nie_zmieniaj before update or delete on public.%I for each row execute function public._ksiega_niezmienna()', t);
        execute format('drop trigger if exists trg_nie_czysc on public.%I', t);
        execute format('create trigger trg_nie_czysc before truncate on public.%I for each statement execute function public._ksiega_niezmienna()', t);
    end loop;
end $trg$;

-- Generyczny audyt zmian wierszy (bez PIN-ów i pól „technicznych”, które zmieniają się przy każdym logowaniu)
create or replace function public._tr_audyt_generyczny() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
    v_skip text[] := array['pin_hash', 'pin_jawny'];
    v_old jsonb; v_new jsonb; v_diff jsonb; v_kto text;
begin
    if coalesce(current_setting('em.rodo', true), '') = '1' then
        if tg_op = 'DELETE' then return old; end if; return new;
    end if;
    v_kto := nullif(current_setting('em.kto', true), '');

    if tg_op = 'INSERT' then
        v_new := to_jsonb(new) - v_skip;
        insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
        values (v_kto, case when tg_table_name = 'wydarzenia' then 'kalendarz' else tg_table_name end, 'dodano', coalesce(v_new->>'kod', v_new->>'nazwa', v_new->>'id'), v_new);
        return new;
    elsif tg_op = 'UPDATE' then
        v_old := to_jsonb(old) - v_skip; v_new := to_jsonb(new) - v_skip;
        select jsonb_object_agg(n.key, jsonb_build_object('z', o.value, 'na', n.value)) into v_diff
          from jsonb_each(v_new) n join jsonb_each(v_old) o on o.key = n.key
         where n.value is distinct from o.value
           and n.key not like 'ostatni%' and n.key not like 'nieudane%' and n.key not like 'zablokowan%'
           and n.key not like 'proby%' and n.key not in ('updated_at', 'zmieniono');
        if v_diff is not null then
            insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
            values (v_kto, case when tg_table_name = 'wydarzenia' then 'kalendarz' else tg_table_name end, 'zmieniono', coalesce(v_new->>'kod', v_new->>'nazwa', v_new->>'id'), v_diff);
        end if;
        return new;
    else
        v_old := to_jsonb(old) - v_skip;
        insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
        values (v_kto, case when tg_table_name = 'wydarzenia' then 'kalendarz' else tg_table_name end, 'usunieto', coalesce(v_old->>'kod', v_old->>'nazwa', v_old->>'id'), v_old);
        return old;
    end if;
exception when others then
    raise warning 'dziennik_audytu: %', sqlerrm;   -- audyt nigdy nie blokuje operacji
    if tg_op = 'DELETE' then return old; end if;
    return new;
end $$;

drop trigger if exists trg_audyt_ministranci on public.ministranci;
create trigger trg_audyt_ministranci after insert or update or delete on public.ministranci
    for each row execute function public._tr_audyt_generyczny();
-- [v2.8 NAPRAWA] wyzwalacz audytu zakładamy na TABELI wydarzeń (kalendarz jest widokiem — AFTER-wyzwalacza na widoku nie da się utworzyć)
do $trk$
declare v_tab text := public._tab_wydarzen();
begin
    execute format('drop trigger if exists trg_audyt_kalendarz on public.%I', v_tab);
    execute format('create trigger trg_audyt_kalendarz after insert or update or delete on public.%I for each row execute function public._tr_audyt_generyczny()', v_tab);
end $trk$;

-- Zapis ustawienia (+ wpis do audytu)
create or replace function public.admin_ustawienia_zapisz(p_kod_admina text, p_pin_admina text, p_klucz text, p_wartosc jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_blad text; v_stara jsonb;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    v_blad := public._ustawienie_ok(p_klucz, p_wartosc);
    if v_blad is not null then return jsonb_build_object('sukces', false, 'blad', v_blad); end if;
    select wartosc into v_stara from public.ustawienia_systemu where klucz = p_klucz;
    update public.ustawienia_systemu set wartosc = p_wartosc, zmienil = p_kod_admina, zmieniono = now() where klucz = p_klucz;
    insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
    values (p_kod_admina, 'ustawienia', 'zmieniono', p_klucz, jsonb_build_object('z', v_stara, 'na', p_wartosc));
    return jsonb_build_object('sukces', true);
end $$;

-- Zbiorczy widok zdarzeń audytu (Admin)
create or replace function public.admin_audyt_zdarzenia(
    p_kod_admina text, p_pin_admina text, p_limit int default 300, p_kategoria text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_sql text; v_wynik jsonb; v_parts text[] := array[]::text[];
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;

    v_parts := v_parts || $q$select h.kiedy, h.kto_kod, 'pin'::text as kategoria, h.zdarzenie as akcja, h.ministrant_kod as obiekt,
                 jsonb_build_object('zrodlo', h.zrodlo) as szczegoly from public.historia_pin h$q$;
    v_parts := v_parts || $q$select h.kiedy, h.kto_kod, 'plakietki', h.zdarzenie, h.ministrant_kod,
                 jsonb_build_object('plakietka', h.kod_plakietki, 'powod', h.powod) from public.historia_plakietek h$q$;
    v_parts := v_parts || $q$select k.kiedy, k.kto_kod, 'punkty', k.zdarzenie, k.ministrant_kod,
                 jsonb_build_object('wydarzenie', k.wydarzenie_nazwa, 'zmiana', k.zmiana, 'przed', k.punkty_przed, 'po', k.punkty_po,
                                    'zrodlo', k.zrodlo, 'powod', k.powod) from public.ksiega_punktow k$q$;
    v_parts := v_parts || $q$select d.kiedy, d.kto_kod, d.kategoria, d.akcja, d.obiekt, d.szczegoly from public.dziennik_audytu d$q$;
    v_parts := v_parts || $q$select r.kiedy, r.kto_kod, 'rodo', r.operacja, r.osoba_ref, jsonb_build_object('uwagi', r.uwagi) from public.rodo_rejestr r$q$;
    if to_regclass('public.blokada_pin_log') is not null then
        v_parts := v_parts || $q$select b.kiedy, null::text, 'blokady', b.zdarzenie, b.kod,
                     jsonb_build_object('stopien', b.stopien, 'zrodlo', b.zrodlo) from public.blokada_pin_log b$q$;
    end if;

    v_sql := 'select coalesce(jsonb_agg(to_jsonb(z) order by z.kiedy desc), ''[]''::jsonb) from ('
          || 'select * from (' || array_to_string(v_parts, ' union all ') || ') u '
          || 'where ($1::text is null or u.kategoria = $1::text) order by u.kiedy desc limit ' || least(greatest(coalesce(p_limit, 300), 1), 1000) || ') z';
    execute v_sql into v_wynik using p_kategoria;
    return jsonb_build_object('sukces', true, 'dane', v_wynik);
end $$;

-- --------------------------------------------------------------- RODO ----
create or replace function public.admin_rodo_eksport(p_kod_admina text, p_pin_admina text, p_ministrant_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_konto jsonb; v_kod text; v jsonb;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    select to_jsonb(m) - 'pin_hash' - 'pin_jawny', m.kod into v_konto, v_kod from public.ministranci m where m.id::text = p_ministrant_id;
    if v_konto is null then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono osoby.'); end if;

    v := jsonb_build_object(
        'wygenerowano', now(),
        'konto', v_konto,
        'obecnosci', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'wydarzenie', k.nazwa, 'zaliczone_jako', o.zaliczone_jako::text,
                              'punkty', o.punkty, 'data_zapisu', o.data_zapisu) order by o.data_zapisu)
                                 from public.obecnosci o left join public.kalendarz k on k.id::text = o.wydarzenie_id::text
                                where o.ministrant_id::text = p_ministrant_id), '[]'::jsonb),
        'ksiega_punktow', coalesce((select jsonb_agg(to_jsonb(x) order by x.kiedy) from public.ksiega_punktow x where x.ministrant_id = p_ministrant_id), '[]'::jsonb),
        'plakietki', coalesce((select jsonb_agg(to_jsonb(p)) from public.plakietki p where p.ministrant_id::text = p_ministrant_id), '[]'::jsonb),
        'historia_pin', coalesce((select jsonb_agg(jsonb_build_object('kiedy', h.kiedy, 'zdarzenie', h.zdarzenie, 'zrodlo', h.zrodlo) order by h.kiedy)
                                    from public.historia_pin h where h.ministrant_id = p_ministrant_id), '[]'::jsonb),
        'historia_plakietek', coalesce((select jsonb_agg(to_jsonb(h) order by h.kiedy) from public.historia_plakietek h where h.ministrant_id = p_ministrant_id), '[]'::jsonb),
        'skany_plakietek', coalesce((select jsonb_agg(jsonb_build_object('kiedy', s.kiedy, 'plakietka', s.kod_plakietki, 'wynik', s.wynik) order by s.kiedy)
                                       from public.skany_plakietek s where s.ministrant_id = p_ministrant_id), '[]'::jsonb));
    insert into public.rodo_rejestr (kto_kod, operacja, osoba_ref) values (p_kod_admina, 'eksport', p_ministrant_id);
    return jsonb_build_object('sukces', true, 'dane', v);
end $$;

create or replace function public.admin_rodo_anonimizuj(p_kod_admina text, p_pin_admina text, p_ministrant_id text, p_potwierdzenie text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
    v_kod text; v_json jsonb; v_nowy text; v_schema text; v_hash text; v_sets text[] := array[]::text[]; v_has_jawny boolean; t text;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    select m.kod, to_jsonb(m) into v_kod, v_json from public.ministranci m where m.id::text = p_ministrant_id;
    if v_kod is null then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono osoby.'); end if;
    if coalesce((v_json->>'is_admin')::boolean, false) or coalesce((v_json->>'is_moderator')::boolean, false) then
        return jsonb_build_object('sukces', false, 'blad', 'Kont Admina i Księdza nie można anonimizować tym narzędziem.');
    end if;
    if upper(btrim(coalesce(p_potwierdzenie, ''))) <> upper(v_kod) then
        return jsonb_build_object('sukces', false, 'blad', 'Potwierdzenie nie zgadza się z kodem osoby.');
    end if;

    v_nowy := 'ANON-' || left(md5(random()::text || clock_timestamp()::text), 8);
    perform set_config('em.rodo', '1', true);                       -- zdejmuje niezmienność tylko na czas tej transakcji
    perform set_config('em.kto', p_kod_admina, true);

    select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'crypt' limit 1;
    if v_schema is not null then
        execute format('select %I.crypt(md5(random()::text), %I.gen_salt(''bf''))', v_schema, v_schema) into v_hash;
    else
        v_hash := md5(random()::text);
    end if;
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ministranci' and column_name = 'pin_jawny') into v_has_jawny;

    execute format('update public.ministranci set kod = $1, imie = ''Anonim'', nazwisko = ''Użytkownik'', aktywny = false, pin_hash = $2%s where id::text = $3',
                   case when v_has_jawny then ', pin_jawny = null' else '' end) using v_nowy, v_hash, p_ministrant_id;
    update public.plakietki set aktywna = false where ministrant_id::text = p_ministrant_id and aktywna is true;

    update public.historia_pin       set ministrant_kod = v_nowy where ministrant_id = p_ministrant_id;
    update public.historia_plakietek set ministrant_kod = v_nowy where ministrant_id = p_ministrant_id;
    update public.skany_plakietek    set ministrant_kod = v_nowy where ministrant_id = p_ministrant_id;
    update public.ksiega_punktow     set ministrant_kod = v_nowy where ministrant_id = p_ministrant_id;
    update public.dziennik_audytu    set szczegoly = jsonb_build_object('zanonimizowano', true), obiekt = v_nowy
     where kategoria = 'ministranci' and (obiekt = v_kod or szczegoly->>'id' = p_ministrant_id);
    if to_regclass('public.blokada_pin') is not null then delete from public.blokada_pin where kod = upper(v_kod); end if;

    -- historia logowań (nazwa tabeli różni się między instalacjami) — usuń wpisy po starym kodzie
    foreach t in array array['logowania', 'historia_logowan', 'log_logowan'] loop
        if to_regclass('public.' || t) is not null
           and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'kod') then
            execute format('delete from public.%I where upper(kod) = upper($1)', t) using v_kod;
        end if;
    end loop;

    insert into public.rodo_rejestr (kto_kod, operacja, osoba_ref, uwagi)
    values (p_kod_admina, 'anonimizacja', p_ministrant_id, 'konto → ' || v_nowy);
    return jsonb_build_object('sukces', true, 'nowy_kod', v_nowy);
end $$;

create or replace function public.admin_rodo_wyczysc_logi(p_kod_admina text, p_pin_admina text, p_dni int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_dni int; t text; n int; v_wynik jsonb := '{}'::jsonb;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    v_dni := greatest(coalesce(p_dni, 365), 30);                     -- twardy dolny limit: 30 dni
    foreach t in array array['logowania', 'historia_logowan', 'log_logowan'] loop
        if to_regclass('public.' || t) is not null
           and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'kiedy') then
            execute format('delete from public.%I where kiedy < now() - make_interval(days => $1)', t) using v_dni;
            get diagnostics n = row_count;
            v_wynik := v_wynik || jsonb_build_object(t, n);
        end if;
    end loop;
    -- skany plakietek mają własną retencję (tabela nie jest „niezmienna”)
    delete from public.skany_plakietek where kiedy < now() - make_interval(days => v_dni);
    get diagnostics n = row_count;
    v_wynik := v_wynik || jsonb_build_object('skany_plakietek', n);
    insert into public.rodo_rejestr (kto_kod, operacja, uwagi) values (p_kod_admina, 'czyszczenie_logow', 'starsze niż ' || v_dni || ' dni: ' || v_wynik::text);
    return jsonb_build_object('sukces', true, 'usuniete', v_wynik, 'dni', v_dni);
end $$;

create or replace function public.admin_rodo_rejestr(p_kod_admina text, p_pin_admina text, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.kiedy desc) from (
            select kiedy, kto_kod, operacja, osoba_ref, uwagi from public.rodo_rejestr
             order by kiedy desc limit least(greatest(coalesce(p_limit, 200), 1), 1000)) r), '[]'::jsonb));
end $$;

-- ------------------------------------------------- KSIĄDZ: ministranci ----
-- rola wywołującego: 'admin' | 'moderator' | null
create or replace function public._rola_staff_18(p_kod text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare w jsonb;
begin
    w := to_jsonb(public.zaloguj(p_kod, p_pin, 'pwa'));
    if not coalesce((w->>'sukces')::boolean, false) then return null; end if;
    if coalesce((w->>'is_admin')::boolean, false) then return 'admin'; end if;
    if coalesce((w->>'is_moderator')::boolean, false) then return 'moderator'; end if;
    return null;
end $$;
revoke all on function public._rola_staff_18(text, text) from public, anon, authenticated;

-- Czy wywołujący może zarządzać wskazanym kontem? Admin: każdym zwykłym; Ksiądz: tylko zwykłymi ministrantami.
create or replace function public._moze_zarzadzac_18(p_rola text, p_ministrant_id text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare j jsonb;
begin
    select to_jsonb(m) into j from public.ministranci m where m.id::text = p_ministrant_id;
    if j is null then return false; end if;
    if coalesce((j->>'is_admin')::boolean, false) then return false; end if;
    if p_rola = 'admin' then return true; end if;
    return p_rola = 'moderator' and not coalesce((j->>'is_moderator')::boolean, false);
end $$;
revoke all on function public._moze_zarzadzac_18(text, text) from public, anon, authenticated;

create or replace function public._hash_pin_18(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_schema text; v_hash text;
begin
    select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'crypt' limit 1;
    if v_schema is null then raise exception 'Brak rozszerzenia pgcrypto (funkcja crypt).'; end if;
    execute format('select %I.crypt($1, %I.gen_salt(''bf''))', v_schema, v_schema) into v_hash using p_pin;
    return v_hash;
end $$;
revoke all on function public._hash_pin_18(text) from public, anon, authenticated;

create or replace function public.ksiadz_dodaj_ministranta(
    p_kod text, p_pin text, p_imie text, p_nazwisko text, p_nowy_kod text, p_nowy_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_rola text; v_cols text; v_json jsonb; v_hash text;
begin
    v_rola := public._rola_staff_18(p_kod, p_pin);
    if v_rola is null then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    if coalesce(length(btrim(p_imie)), 0) not between 1 and 60 or coalesce(length(btrim(p_nazwisko)), 0) not between 1 and 60 then
        return jsonb_build_object('sukces', false, 'blad', 'Imię i nazwisko: 1–60 znaków.');
    end if;
    if p_nowy_kod is null or p_nowy_kod !~ '^[A-Za-z0-9_-]{3,20}$' then
        return jsonb_build_object('sukces', false, 'blad', 'Kod: 3–20 znaków (litery, cyfry, - i _).');
    end if;
    if not public._pin_prosty_ok(p_nowy_pin) then
        return jsonb_build_object('sukces', false, 'blad', 'PIN jest zbyt prosty (np. 1234, 1111, 1212) lub nie ma 4 cyfr.');
    end if;
    if exists (select 1 from public.ministranci where upper(kod) = upper(p_nowy_kod)) then
        return jsonb_build_object('sukces', false, 'blad', 'Ten kod jest już zajęty.');
    end if;

    perform set_config('em.kto', p_kod, true);
    perform set_config('em.zrodlo', 'admin', true);
    v_hash := public._hash_pin_18(p_nowy_pin);
    v_json := jsonb_build_object('kod', btrim(p_nowy_kod), 'imie', btrim(p_imie), 'nazwisko', btrim(p_nazwisko), 'pin_hash', v_hash,
                                 'pin_jawny', p_nowy_pin, 'aktywny', true, 'is_admin', false, 'is_moderator', false);
    select string_agg(format('%I', c.column_name), ', ') into v_cols
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'ministranci' and v_json ? c.column_name;
    execute format('insert into public.ministranci (%s) select %s from jsonb_populate_record(null::public.ministranci, $1)', v_cols, v_cols) using v_json;
    return jsonb_build_object('sukces', true, 'kod', btrim(p_nowy_kod));
exception
    when unique_violation then return jsonb_build_object('sukces', false, 'blad', 'Ten kod jest już zajęty.');
    when others then return jsonb_build_object('sukces', false, 'blad', 'Nie udało się dodać: ' || sqlerrm);
end $$;

create or replace function public.ksiadz_edytuj_ministranta(
    p_kod text, p_pin text, p_ministrant_id text, p_imie text, p_nazwisko text, p_nowy_kod text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_rola text; n int;
begin
    v_rola := public._rola_staff_18(p_kod, p_pin);
    if v_rola is null or not public._moze_zarzadzac_18(v_rola, p_ministrant_id) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień do tego konta.');
    end if;
    if coalesce(length(btrim(p_imie)), 0) not between 1 and 60 or coalesce(length(btrim(p_nazwisko)), 0) not between 1 and 60 then
        return jsonb_build_object('sukces', false, 'blad', 'Imię i nazwisko: 1–60 znaków.');
    end if;
    if p_nowy_kod is null or p_nowy_kod !~ '^[A-Za-z0-9_-]{3,20}$' then
        return jsonb_build_object('sukces', false, 'blad', 'Kod: 3–20 znaków (litery, cyfry, - i _).');
    end if;
    if exists (select 1 from public.ministranci where upper(kod) = upper(p_nowy_kod) and id::text <> p_ministrant_id) then
        return jsonb_build_object('sukces', false, 'blad', 'Ten kod jest już zajęty.');
    end if;
    perform set_config('em.kto', p_kod, true);
    update public.ministranci set imie = btrim(p_imie), nazwisko = btrim(p_nazwisko), kod = btrim(p_nowy_kod) where id::text = p_ministrant_id;
    get diagnostics n = row_count;
    return jsonb_build_object('sukces', n > 0);
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się zapisać: ' || sqlerrm);
end $$;

create or replace function public.ksiadz_ustaw_aktywnosc(p_kod text, p_pin text, p_ministrant_id text, p_aktywny boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_rola text; n int;
begin
    v_rola := public._rola_staff_18(p_kod, p_pin);
    if v_rola is null or not public._moze_zarzadzac_18(v_rola, p_ministrant_id) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień do tego konta.');
    end if;
    perform set_config('em.kto', p_kod, true);
    update public.ministranci set aktywny = coalesce(p_aktywny, false) where id::text = p_ministrant_id;
    get diagnostics n = row_count;
    return jsonb_build_object('sukces', n > 0);
end $$;

create or replace function public.ksiadz_zmien_pin_ministranta(p_kod text, p_pin text, p_ministrant_id text, p_nowy_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_rola text; v_has_jawny boolean; n int;
begin
    v_rola := public._rola_staff_18(p_kod, p_pin);
    if v_rola is null or not public._moze_zarzadzac_18(v_rola, p_ministrant_id) then
        return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień do tego konta.');
    end if;
    if not public._pin_prosty_ok(p_nowy_pin) then
        return jsonb_build_object('sukces', false, 'blad', 'PIN jest zbyt prosty (np. 1234, 1111, 1212) lub nie ma 4 cyfr.');
    end if;
    perform set_config('em.zrodlo', 'admin', true);
    perform set_config('em.kto', p_kod, true);
    select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ministranci' and column_name = 'pin_jawny') into v_has_jawny;
    execute format('update public.ministranci set pin_hash = $1%s where id::text = $2', case when v_has_jawny then ', pin_jawny = $3' else '' end)
        using public._hash_pin_18(p_nowy_pin), p_ministrant_id, p_nowy_pin;
    get diagnostics n = row_count;
    return jsonb_build_object('sukces', n > 0);
exception when others then
    return jsonb_build_object('sukces', false, 'blad', 'Nie udało się zmienić PIN-u: ' || sqlerrm);
end $$;

notify pgrst, 'reload schema';
