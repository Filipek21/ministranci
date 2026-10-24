-- ============================================================================
-- 16_blokada_pin_v2_cofnij.sql — przywraca stan sprzed 16_blokada_pin_v2.sql
-- (usuwa nakładki, oddaje oryginalnym funkcjom ich nazwy i uprawnienia; tabele blokada_pin* zostają jako archiwum)
-- ============================================================================
do $gen$
declare
    f text; v_orig oid; v_ident text;
begin
    foreach f in array array['zaloguj', 'zapisz_obecnosc', 'zglos_obecnosc_specjalna', 'zmien_pin'] loop
        select p.oid into v_orig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = '_v1_' || f;
        if v_orig is null then continue; end if;
        select pg_get_function_identity_arguments(v_orig) into v_ident;
        execute format('drop function if exists public.%I(%s)', f, v_ident);                    -- nakładka
        execute format('alter function public.%I(%s) rename to %I', '_v1_' || f, v_ident, f);   -- oryginał wraca
        execute format('grant execute on function public.%I(%s) to public, anon, authenticated', f, v_ident);
    end loop;
end $gen$;
drop function if exists public.admin_blokady_pin_lista(text, text);
drop function if exists public.admin_odblokuj_pin_v2(text, text, text);
notify pgrst, 'reload schema';
