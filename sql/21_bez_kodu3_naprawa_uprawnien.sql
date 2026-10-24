-- ============================================================================
-- 21_bez_kodu3_naprawa_uprawnien.sql  (wersja aplikacji 2.9.00)
--
-- 1) Wyłącza kod weryfikacyjny 3-cyfrowy (sql/19): Admin i Ksiądz logują się znów kodem + 4-cyfrowym PIN-em.
--    Tabela kody_weryfikacyjne i funkcje z pliku 19 zostają w bazie (nic nie jest kasowane), ale nie są już wymagane.
-- 2) NAPRAWIA „❌ Brak uprawnień do tej czynności” w panelu Admina (historia PIN-ów, plakietek, użyć, logowań…).
--    Przyczyna: sprawdzanie roli szło przez zaloguj(p_kod, pin, 'pwa') i wymagało kodu 3-cyfrowego doklejonego do PIN-u.
--    Teraz rola jest sprawdzana odporniej: PIN (pierwsze 4 znaki) weryfikowany po haśle konta, a gdy to nie zadziała —
--    przez zaloguj() (oba warianty sygnatury). Dopisek 3-cyfrowy do PIN-u jest ignorowany (stare karty przeglądarek też działają).
--
-- Uruchom PO plikach 14–20. Idempotentny.
-- ============================================================================

do $chk$
begin
    if to_regclass('public.ministranci') is null then
        raise exception 'Brak tabeli public.ministranci. Nic nie zmieniono.';
    end if;
end $chk$;

create or replace function public._crypt_zgodny_21(p_plain text, p_hash text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare v_schema text; ok boolean;
begin
    select n.nspname into v_schema from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'crypt' limit 1;
    if v_schema is null then return false; end if;
    execute format('select %I.crypt($1, $2) = $2', v_schema) into ok using p_plain, p_hash;
    return coalesce(ok, false);
end $$;
revoke all on function public._crypt_zgodny_21(text, text) from public, anon, authenticated;

-- Centralna rola Admina/Księdza: 'admin' | 'moderator' | null (kod 3-cyfrowy NIE jest sprawdzany)
create or replace function public._rola_staff_21(p_kod text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
    j jsonb; w jsonb; v_rola text; ok boolean := false;
    v_pin text := left(coalesce(p_pin, ''), 4);
begin
    if p_kod is null or btrim(p_kod) = '' or v_pin !~ '^[0-9]{4}$' then return null; end if;
    select to_jsonb(m) into j from public.ministranci m where upper(m.kod) = upper(btrim(p_kod)) limit 1;
    if j is null then return null; end if;
    if coalesce((j->>'aktywny')::boolean, true) is false then return null; end if;

    v_rola := case when coalesce((j->>'is_admin')::boolean, false) then 'admin'
                   when coalesce((j->>'is_moderator')::boolean, false) then 'moderator' else null end;
    if v_rola is null then return null; end if;

    -- blokada PIN (sql/16), jeśli założona
    if to_regprocedure('public._pin_stan(text)') is not null then
        begin
            if coalesce((public._pin_stan(p_kod)->>'zablokowany')::boolean, false) then return null; end if;
        exception when others then null;
        end;
    end if;

    -- 1) hasło konta (bcrypt)
    if nullif(j->>'pin_hash', '') is not null then
        begin ok := public._crypt_zgodny_21(v_pin, j->>'pin_hash'); exception when others then ok := false; end;
    end if;

    -- 2) zapas: istniejąca funkcja zaloguj() — wariant z p_zrodlo, potem bez
    if not ok then
        begin
            w := to_jsonb(public.zaloguj(p_kod, v_pin, 'pwa'));
        exception when others then
            begin w := to_jsonb(public.zaloguj(p_kod, v_pin)); exception when others then w := null; end;
        end;
        ok := coalesce((w->>'sukces')::boolean, false);
    end if;

    if not ok then return null; end if;
    return v_rola;
end $$;
revoke all on function public._rola_staff_21(text, text) from public, anon, authenticated;

-- Te same nazwy i sygnatury co w plikach 14 / 17 / 18 / 19 — teraz bez kodu 3-cyfrowego
create or replace function public._rola_staff_19(p_kod text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_21(p_kod, p_pin); end $$;
revoke all on function public._rola_staff_19(text, text) from public, anon, authenticated;

create or replace function public._czy_admin_14(p_kod text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_21(p_kod, p_pin) = 'admin'; end $$;

create or replace function public._czy_staff_17(p_kod text, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_21(p_kod, p_pin) in ('admin', 'moderator'); end $$;

create or replace function public._rola_staff_18(p_kod text, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin return public._rola_staff_21(p_kod, p_pin); end $$;

revoke all on function public._czy_admin_14(text, text) from public, anon, authenticated;
revoke all on function public._czy_staff_17(text, text) from public, anon, authenticated;
revoke all on function public._rola_staff_18(text, text) from public, anon, authenticated;

-- zaloguj_k3 zostaje (żeby stare karty przeglądarek nie dostały błędu), ale jest zwykłym logowaniem
create or replace function public.zaloguj_k3(p_kod text, p_pin text, p_kod3 text default null, p_zrodlo text default 'pwa')
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
    begin
        return to_jsonb(public.zaloguj(p_kod, left(coalesce(p_pin, ''), 4), p_zrodlo));
    exception when undefined_function then
        return to_jsonb(public.zaloguj(p_kod, left(coalesce(p_pin, ''), 4)));
    end;
end $$;
grant execute on function public.zaloguj_k3(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Kontrola: zaloguj się w panelu jako Admin i wejdź w „Historia zmian PIN-ów” — powinny pojawić się dane, a nie „Brak uprawnień”.
-- Gdyby nadal był błąd, wykonaj (podstaw swój kod i PIN):
--   select public._rola_staff_21('TWOJ_KOD', '1234');   -- powinno zwrócić 'admin'
