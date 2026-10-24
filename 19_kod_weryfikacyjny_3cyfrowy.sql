-- ============================================================================
-- 19_kod_weryfikacyjny_3cyfrowy.sql  (wersja aplikacji 2.7.00)
--
-- DRUGI CZYNNIK dla Admina i Księdza: STAŁY kod weryfikacyjny, 3 cyfry (obok 4-cyfrowego PIN-u).
--   • „stały” = ustawiany RAZ (przy pierwszym logowaniu po wdrożeniu), potem nie da się go zmienić samodzielnie.
--     Zresetować go może wyłącznie Admin (Księdza) albo ręcznie SQL (patrz niżej) — wtedy osoba ustawia nowy.
--   • przechowywany jako hash (bcrypt), nigdy jawnie.
--   • ochrona przed zgadywaniem (1000 możliwości): błędny kod → 3 błędy = 5 min, 5 = 30 min, 8 = 24 h, 10 = blokada
--     do resetu przez Admina. Błędy liczą się dopiero po POPRAWNYM PIN-ie.
--   • wymuszenie po stronie serwera: funkcje z plików 14–18 (admin_* i ksiadz_*) przyjmują kod jako DOKLEJONE do PIN-u
--     3 cyfry (PIN 4 + kod 3 = 7 znaków); PIN bez kodu przestaje działać dla kont, które mają kod ustawiony.
--     Klient (przeglądarka i Kiosk) skleja to automatycznie.
--   • UWAGA — funkcje z plików 01–13 (starsze admin_*) nadal sprawdzają sam PIN: nie widzę ich kodu, więc nie mogę ich
--     bezpiecznie zmienić. Dostęp do panelu i do wszystkich nowszych funkcji wymaga już kodu.
--
-- Uruchom PO plikach 14–18. Idempotentny. Przerywa bez zmian, jeśli zależności nie istnieją.
--
-- AWARYJNE ODBLOKOWANIE (gdy jedyny Admin zapomni kod) — w SQL Editorze:
--   delete from public.kody_weryfikacyjne where ministrant_id = (select id::text from public.ministranci where kod = 'TWOJ_KOD');
--   (przy kolejnym logowaniu ustawisz nowy kod)
-- ============================================================================

do $chk$
begin
    if to_regprocedure('public._czy_admin_14(text,text)') is null
       or to_regprocedure('public._czy_staff_17(text,text)') is null
       or to_regprocedure('public._rola_staff_18(text,text)') is null
       or to_regprocedure('public._hash_pin_18(text)') is null then
        raise exception 'Najpierw wykonaj sql/14, 17 i 18 (brak funkcji pomocniczych). Nic nie zmieniono.';
    end if;
    if to_regclass('public.dziennik_audytu') is null then
        raise exception 'Brak tabeli dziennik_audytu (sql/18). Nic nie zmieniono.';
    end if;
end $chk$;

create table if not exists public.kody_weryfikacyjne (
    ministrant_id  text primary key,
    kod_hash       text not null,
    ustawiono      timestamptz not null default now(),
    ustawil        text,                         -- kod konta, które ustawiło (zwykle to samo konto)
    nieudane       int not null default 0,
    zablokowane_do timestamptz,
    trwala         boolean not null default false,
    ostatnia_proba timestamptz
);
alter table public.kody_weryfikacyjne enable row level security;   -- dostęp tylko przez funkcje poniżej

-- Zbyt prosty kod: 000, 111, 123, 321, 012, 210, 100, 200 …
create or replace function public._k3_slaby(p text) returns boolean language sql immutable as $$
    select p !~ '^[0-9]{3}$' or p ~ '^([0-9])\1\1$' or p in ('012','123','234','345','456','567','678','789','210','321','432','543','654','765','876','987','100','200','300','999') $$;

create or replace function public._crypt_zgodny_19(p_plain text, p_hash text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_schema text; ok boolean;
begin
    select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'crypt' limit 1;
    if v_schema is null then raise exception 'Brak rozszerzenia pgcrypto.'; end if;
    execute format('select %I.crypt($1, $2) = $2', v_schema) into ok using p_plain, p_hash;
    return coalesce(ok, false);
end $$;
revoke all on function public._crypt_zgodny_19(text, text) from public, anon, authenticated;

-- Wynik: 'brak_ustawionego' | 'ok' | 'wymagany' (nie podano kodu) | 'zly' | 'zablokowany'
create or replace function public._k3_sprawdz(p_ministrant_id text, p_k3 text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare w public.kody_weryfikacyjne%rowtype; n int; v_do timestamptz;
begin
    select * into w from public.kody_weryfikacyjne where ministrant_id = p_ministrant_id;
    if not found then return 'brak_ustawionego'; end if;
    if w.trwala or (w.zablokowane_do is not null and w.zablokowane_do > now()) then return 'zablokowany'; end if;
    if p_k3 is null or p_k3 !~ '^[0-9]{3}$' then return 'wymagany'; end if;
    if public._crypt_zgodny_19(p_k3, w.kod_hash) then
        if w.nieudane > 0 then
            update public.kody_weryfikacyjne set nieudane = 0, zablokowane_do = null where ministrant_id = p_ministrant_id;
        end if;
        return 'ok';
    end if;
    n := w.nieudane + 1;
    v_do := case when n >= 10 then null when n >= 8 then now() + interval '24 hours'
                 when n >= 5 then now() + interval '30 minutes' when n >= 3 then now() + interval '5 minutes' else null end;
    update public.kody_weryfikacyjne set nieudane = n, zablokowane_do = v_do, trwala = (n >= 10), ostatnia_proba = now()
     where ministrant_id = p_ministrant_id;
    return 'zly';
end $$;
revoke all on function public._k3_sprawdz(text, text) from public, anon, authenticated;

-- Centralna rola: PIN (4) [+ kod 3 doklejony → 7 znaków]. Zwraca 'admin' | 'moderator' | null.
create or replace function public._rola_staff_19(p_kod text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare w jsonb; v_rola text; v_id text; v_pin text := left(coalesce(p_pin, ''), 4);
        v_k3 text := case when length(coalesce(p_pin, '')) = 7 then right(p_pin, 3) else null end;
begin
    w := to_jsonb(public.zaloguj(p_kod, v_pin, 'pwa'));
    if not coalesce((w->>'sukces')::boolean, false) then return null; end if;
    v_rola := case when coalesce((w->>'is_admin')::boolean, false) then 'admin'
                   when coalesce((w->>'is_moderator')::boolean, false) then 'moderator' else null end;
    if v_rola is null then return null; end if;
    select m.id::text into v_id from public.ministranci m where upper(m.kod) = upper(p_kod) limit 1;
    if public._k3_sprawdz(v_id, v_k3) in ('ok', 'brak_ustawionego') then return v_rola; end if;
    return null;
end $$;
revoke all on function public._rola_staff_19(text, text) from public, anon, authenticated;

-- Dotychczasowe pomocniki z plików 14 / 17 / 18 — te same nazwy i sygnatury, teraz z drugim czynnikiem
create or replace function public._czy_admin_14(p_kod text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_19(p_kod, p_pin) = 'admin'; end $$;

create or replace function public._czy_staff_17(p_kod text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_19(p_kod, p_pin) in ('admin', 'moderator'); end $$;

create or replace function public._rola_staff_18(p_kod text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_19(p_kod, p_pin); end $$;

-- ------------------------------------------------------------ logowanie ----
-- Zamiennik zaloguj() dla przeglądarki i Kiosku: konta zwykłe — bez zmian; Admin/Ksiądz — dodatkowo kod 3-cyfrowy.
create or replace function public.zaloguj_k3(p_kod text, p_pin text, p_kod3 text default null, p_zrodlo text default 'pwa')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; v_id text; st text; w public.kody_weryfikacyjne%rowtype;
begin
    r := to_jsonb(public.zaloguj(p_kod, p_pin, p_zrodlo));
    if not coalesce((r->>'sukces')::boolean, false) then return r; end if;
    if not (coalesce((r->>'is_admin')::boolean, false) or coalesce((r->>'is_moderator')::boolean, false)) then return r; end if;

    select m.id::text into v_id from public.ministranci m where upper(m.kod) = upper(p_kod) limit 1;
    st := public._k3_sprawdz(v_id, p_kod3);
    if st = 'ok' then return r || jsonb_build_object('kod3_ok', true); end if;
    if st = 'brak_ustawionego' then return r || jsonb_build_object('kod3_nieustawiony', true); end if;
    if st = 'zablokowany' then
        return jsonb_build_object('sukces', false, 'kod3_blokada', true, 'blad', 'Kod weryfikacyjny zablokowany po błędnych próbach. Odblokować może Admin.');
    end if;
    if st = 'wymagany' then
        return jsonb_build_object('sukces', false, 'wymaga_kodu3', true, 'blad', 'Wymagany kod weryfikacyjny (3 cyfry).');
    end if;
    select * into w from public.kody_weryfikacyjne where ministrant_id = v_id;
    return jsonb_build_object('sukces', false, 'wymaga_kodu3', true,
        'blad', 'Nieprawidłowy kod weryfikacyjny.' || case when w.zablokowane_do is not null and w.zablokowane_do > now() then ' Konto czasowo zablokowane.' else '' end);
end $$;

-- Jednorazowe ustawienie stałego kodu (po poprawnym PIN-ie; tylko Admin/Ksiądz; tylko gdy kodu jeszcze nie ma)
create or replace function public.ustaw_kod3(p_kod text, p_pin text, p_kod3 text, p_kod3_powtorz text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; v_id text;
begin
    r := to_jsonb(public.zaloguj(p_kod, left(coalesce(p_pin, ''), 4), 'pwa'));
    if not coalesce((r->>'sukces')::boolean, false) then return r; end if;
    if not (coalesce((r->>'is_admin')::boolean, false) or coalesce((r->>'is_moderator')::boolean, false)) then
        return jsonb_build_object('sukces', false, 'blad', 'Kod weryfikacyjny dotyczy tylko kont Admina i Księdza.');
    end if;
    select m.id::text into v_id from public.ministranci m where upper(m.kod) = upper(p_kod) limit 1;
    if exists (select 1 from public.kody_weryfikacyjne where ministrant_id = v_id) then
        return jsonb_build_object('sukces', false, 'blad', 'Kod weryfikacyjny jest stały — zmienić go może tylko Admin (reset).');
    end if;
    if p_kod3 is distinct from p_kod3_powtorz then return jsonb_build_object('sukces', false, 'blad', 'Kody się różnią.'); end if;
    if public._k3_slaby(p_kod3) then return jsonb_build_object('sukces', false, 'blad', 'Kod weryfikacyjny jest zbyt prosty (np. 111, 123). Wybierz inny.'); end if;

    insert into public.kody_weryfikacyjne (ministrant_id, kod_hash, ustawil) values (v_id, public._hash_pin_18(p_kod3), p_kod);
    insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
    values (p_kod, 'kod3', 'ustawiono', p_kod, jsonb_build_object('zrodlo', 'pwa'));
    return jsonb_build_object('sukces', true);
end $$;

-- ------------------------------------------------------------- Admin ----
create or replace function public.admin_kod3_status(p_kod_admina text, p_pin_admina text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    return jsonb_build_object('sukces', true, 'dane', coalesce((
        select jsonb_agg(jsonb_build_object('ministrant_id', k.ministrant_id, 'ustawiono', k.ustawiono, 'nieudane', k.nieudane,
                                            'zablokowany', (k.trwala or (k.zablokowane_do is not null and k.zablokowane_do > now()))))
          from public.kody_weryfikacyjne k), '[]'::jsonb));
end $$;

create or replace function public.admin_kod3_reset(p_kod_admina text, p_pin_admina text, p_ministrant_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_kod text; v_json jsonb; n int;
begin
    if not public._czy_admin_14(p_kod_admina, p_pin_admina) then return jsonb_build_object('sukces', false, 'blad', 'Brak uprawnień.'); end if;
    select m.kod, to_jsonb(m) into v_kod, v_json from public.ministranci m where m.id::text = p_ministrant_id;
    if v_kod is null then return jsonb_build_object('sukces', false, 'blad', 'Nie znaleziono konta.'); end if;
    if upper(v_kod) = upper(p_kod_admina) then
        return jsonb_build_object('sukces', false, 'blad', 'Własnego kodu nie można zresetować — poproś innego Admina.');
    end if;
    if not (coalesce((v_json->>'is_admin')::boolean, false) or coalesce((v_json->>'is_moderator')::boolean, false)) then
        return jsonb_build_object('sukces', false, 'blad', 'To konto nie ma kodu weryfikacyjnego.');
    end if;
    delete from public.kody_weryfikacyjne where ministrant_id = p_ministrant_id;
    get diagnostics n = row_count;
    insert into public.dziennik_audytu (kto_kod, kategoria, akcja, obiekt, szczegoly)
    values (p_kod_admina, 'kod3', 'reset', v_kod, jsonb_build_object('mial_kod', n > 0));
    return jsonb_build_object('sukces', true);
end $$;

notify pgrst, 'reload schema';
