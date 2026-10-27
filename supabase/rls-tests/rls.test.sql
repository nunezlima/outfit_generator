-- ═══════════════════════════════════════════════════════════════════════════
-- Pruebas de aislamiento entre usuarios (RLS, claves foráneas y Storage).
-- Se ejecuta con scripts/probar-rls.mjs después de supabase-stub.sql y de
-- TODAS las migraciones. Cada comprobación imprime "ok" o "FALLA"; si alguna
-- falla, el script termina con error.
--
-- Escenario: A tiene su catálogo, prendas, outfits, perfumes, historial y una
-- foto. B (otro usuario con sesión) y anon (sin sesión) intentan leer o
-- modificar lo de A conociendo sus id, como haría alguien llamando directo a
-- la API con la clave pública.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\set QUIET on
-- Los resultados de las consultas no interesan: cada comprobación avisa con NOTICE.
\o /dev/null
set client_min_messages = notice;

\set A '00000000-0000-4000-8000-00000000000a'
\set B '00000000-0000-4000-8000-00000000000b'
select set_config('rls.a', :'A', false), set_config('rls.b', :'B', false) \g /dev/null

-- ─── Utilidades ────────────────────────────────────────────────────────────
create schema rls_test;
grant usage on schema rls_test to anon, authenticated;
create table rls_test.results (id serial primary key, ok boolean not null, name text not null, detail text);
grant select, insert on rls_test.results to anon, authenticated;
grant usage on sequence rls_test.results_id_seq to anon, authenticated;

create function rls_test.check(ok boolean, name text, detail text default null) returns void
language plpgsql as $$
begin
  insert into rls_test.results (ok, name, detail) values (coalesce(ok, false), name, detail);
  if coalesce(ok, false) then
    raise notice 'ok    %', name;
  else
    raise notice 'FALLA % (%)', name, coalesce(detail, 's/d');
  end if;
end $$;

-- La sentencia debe fallar con ese SQLSTATE (42501 = sin permiso / RLS,
-- 23503 = clave foránea, 23514 = restricción CHECK).
create function rls_test.throws(sql text, expected text, name text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    perform rls_test.check(sqlstate = expected, name, sqlstate || ': ' || sqlerrm);
    return;
  end;
  perform rls_test.check(false, name, 'no dio error');
end $$;

-- La sentencia (insert/update/delete) debe afectar exactamente n filas.
create function rls_test.affects(sql text, expected bigint, name text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  perform rls_test.check(n = expected, name, format('afectó %s fila(s), se esperaban %s', n, expected));
exception when others then
  perform rls_test.check(false, name, sqlstate || ': ' || sqlerrm);
end $$;

-- La consulta debe devolver exactamente n filas.
create function rls_test.counts(sql text, expected bigint, name text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from (%s) q', sql) into n;
  perform rls_test.check(n = expected, name, format('devolvió %s fila(s), se esperaban %s', n, expected));
exception when others then
  perform rls_test.check(false, name, sqlstate || ': ' || sqlerrm);
end $$;

grant execute on all functions in schema rls_test to anon, authenticated;

insert into auth.users (id, email) values (:'A', 'a@example.test'), (:'B', 'b@example.test');
-- Un segundo bucket para comprobar que las políticas solo abren "wardrobe".
insert into storage.buckets (id, name) values ('otro', 'otro');

-- ═══ 1. Estructura: lo que debe cumplir CUALQUIER migración futura ═════════
select rls_test.counts($q$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
$q$, 0, 'Todas las tablas de public tienen RLS activado');

select rls_test.counts($q$
  select t.tablename, cmd from pg_tables t
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as c(cmd)
  where t.schemaname = 'public'
    and not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = t.tablename and p.cmd = c.cmd)
$q$, 0, 'Cada tabla de public tiene política de select, insert, update y delete');

select rls_test.counts($q$
  select 1 from pg_policies where schemaname = 'public' and roles <> '{authenticated}'
$q$, 0, 'Las políticas de public solo aplican a usuarios con sesión');

select rls_test.counts($q$
  select 1 from pg_policies
  where schemaname = 'public'
    and coalesce(qual, '') || coalesce(with_check, '') not like '%auth.uid()%'
$q$, 0, 'Todas las políticas de public comparan con auth.uid()');

select rls_test.counts($q$
  select 1 from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'
$q$, 0, 'El rol anon no tiene permisos sobre ninguna tabla de public');

select rls_test.counts($q$
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
$q$, 0, 'Ninguna función de public es SECURITY DEFINER');

select rls_test.check(not has_function_privilege('anon', 'public.seed_default_catalog()', 'execute'),
  'anon no puede ejecutar seed_default_catalog()');

select rls_test.counts($q$
  select 1 from storage.buckets
  where id = 'wardrobe' and public = false and file_size_limit <= 5242880
    and allowed_mime_types <@ array['image/jpeg', 'image/webp']
$q$, 1, 'El bucket wardrobe es privado, máx. 5 MB y solo JPEG/WebP');

-- Informativo: privilegios que la API no usa (TRUNCATE no respeta RLS).
do $$
declare n int;
begin
  select count(*) into n from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER');
  raise notice 'info  authenticated conserva % privilegio(s) TRUNCATE/REFERENCES/TRIGGER en public (la API no los expone)', n;
end $$;

-- ═══ 2. A crea sus datos ═══════════════════════════════════════════════════
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'A', 'role', 'authenticated')::text, false) \g /dev/null

select rls_test.check(public.seed_default_catalog(), 'A: seed_default_catalog() siembra su catálogo');
select rls_test.check(not public.seed_default_catalog(), 'A: seed_default_catalog() es idempotente');

insert into public.garments (id, name, type_id, style_ids, photo_path)
select '0000000a-0000-4000-8000-000000000001', 'Camiseta de A', t.id,
       array(select id from public.styles where name = 'Casual'),
       :'A' || '/garments/0000000a-0000-4000-8000-000000000001.webp'
from public.garment_types t where t.name = 'Camiseta';
insert into public.garments (id, name, type_id)
select '0000000a-0000-4000-8000-000000000002', 'Jeans de A', id from public.garment_types where name = 'Jeans';
insert into public.garment_rules (garment_a, garment_b, allowed)
values ('0000000a-0000-4000-8000-000000000001', '0000000a-0000-4000-8000-000000000002', true);
insert into public.outfits (id, name, garment_ids)
values ('0000000a-0000-4000-8000-000000000010', 'Outfit de A',
        '{0000000a-0000-4000-8000-000000000001,0000000a-0000-4000-8000-000000000002}');
insert into public.perfumes (id, name) values ('0000000a-0000-4000-8000-000000000020', 'Perfume de A');
insert into public.outfit_events (id, name) values ('0000000a-0000-4000-8000-000000000030', 'Evento de A');
insert into public.occasions (id, event_id, name)
values ('0000000a-0000-4000-8000-000000000031', '0000000a-0000-4000-8000-000000000030', 'Ocasión de A');
insert into public.wear_log (id, worn_on, garment_ids, outfit_id, perfume_id)
values ('0000000a-0000-4000-8000-000000000040', current_date, '{0000000a-0000-4000-8000-000000000001}',
        '0000000a-0000-4000-8000-000000000010', '0000000a-0000-4000-8000-000000000020');
insert into public.garment_events (kind, garment_ids) values ('shown', '{0000000a-0000-4000-8000-000000000001}');
insert into storage.objects (bucket_id, name, owner)
values ('wardrobe', :'A' || '/garments/0000000a-0000-4000-8000-000000000001.webp', :'A');

select rls_test.counts('select 1 from public.garments', 2, 'A: ve sus 2 prendas');

-- Guardamos lo que A tiene para comprobar al final que nadie lo tocó.
reset role;
create table rls_test.a_snapshot as
select 'garments' as t, count(*) as n, max(updated_at) as last from public.garments where user_id = :'A'
union all select 'outfits', count(*), max(updated_at) from public.outfits where user_id = :'A'
union all select 'perfumes', count(*), max(updated_at) from public.perfumes where user_id = :'A'
union all select 'wear_log', count(*), max(updated_at) from public.wear_log where user_id = :'A'
union all select 'positions', count(*), max(updated_at) from public.positions where user_id = :'A'
union all select 'user_settings', count(*), max(updated_at) from public.user_settings where user_id = :'A'
union all select 'storage', count(*), max(updated_at) from storage.objects where name like :'A' || '/%';
select id as a_position from public.positions where user_id = :'A' and role = 'top' \gset
select id as a_type from public.garment_types where user_id = :'A' and name = 'Camiseta' \gset
select id as a_style1, lead(id) over (order by id) as a_style2 from public.styles where user_id = :'A' order by id limit 1 \gset

-- ═══ 3. anon (sin sesión) ══════════════════════════════════════════════════
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false) \g /dev/null

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    perform rls_test.throws(format('select * from public.%I', t), '42501', format('anon: no puede leer public.%s', t));
  end loop;
end $$;
select rls_test.throws($q$insert into public.styles (user_id, name) values ('00000000-0000-4000-8000-00000000000a', 'x')$q$,
  '42501', 'anon: no puede insertar');
select rls_test.throws('select public.seed_default_catalog()', '42501', 'anon: no puede llamar a seed_default_catalog()');
select rls_test.counts('select 1 from storage.objects', 0, 'anon: no ve ninguna foto');

-- ═══ 4. B (otro usuario con sesión) contra los datos de A ══════════════════
reset role;
set role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'B', 'role', 'authenticated')::text, false) \g /dev/null

-- 4.1 Lectura
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    perform rls_test.counts(format('select 1 from public.%I where user_id = %L', t, current_setting('rls.a')), 0,
      format('B: no ve filas de A en public.%s', t));
  end loop;
end $$;
select rls_test.counts($q$select 1 from storage.objects where name like '00000000-0000-4000-8000-00000000000a/%'$q$, 0,
  'B: no ve las fotos de A');

-- 4.2 Modificar o borrar lo de A conociendo sus id
select rls_test.affects($q$update public.garments set name = 'robada' where id = '0000000a-0000-4000-8000-000000000001'$q$, 0,
  'B: no puede editar una prenda de A');
select rls_test.affects($q$update public.user_settings set prefs = '{"x":1}' where user_id = '00000000-0000-4000-8000-00000000000a'$q$, 0,
  'B: no puede editar los ajustes de A');
select rls_test.affects($q$delete from public.outfits where id = '0000000a-0000-4000-8000-000000000010'$q$, 0,
  'B: no puede borrar un outfit de A');
select rls_test.affects($q$delete from public.wear_log where user_id = '00000000-0000-4000-8000-00000000000a'$q$, 0,
  'B: no puede borrar el historial de A');
select rls_test.affects($q$update storage.objects set name = name where name like '00000000-0000-4000-8000-00000000000a/%'$q$, 0,
  'B: no puede modificar fotos de A');
select rls_test.affects($q$delete from storage.objects where name like '00000000-0000-4000-8000-00000000000a/%'$q$, 0,
  'B: no puede borrar fotos de A');

-- 4.3 Escribir a nombre de A
select rls_test.throws($q$insert into public.styles (user_id, name) values ('00000000-0000-4000-8000-00000000000a', 'intruso')$q$,
  '42501', 'B: no puede crear filas con user_id de A');
select rls_test.throws(format(
  $q$insert into public.garments (id, name, type_id) values ('0000000a-0000-4000-8000-000000000001', 'pisada', %L)
     on conflict (id) do update set name = excluded.name$q$, :'a_type'),
  '42501', 'B: un upsert con el id de una prenda de A no la sobrescribe');
select rls_test.throws($q$insert into storage.objects (bucket_id, name) values ('wardrobe', '00000000-0000-4000-8000-00000000000a/garments/x.webp')$q$,
  '42501', 'B: no puede subir fotos a la carpeta de A');

-- 4.4 B con su propio catálogo
select rls_test.check(public.seed_default_catalog(), 'B: seed_default_catalog() siembra solo su catálogo');
select rls_test.counts('select 1 from public.positions', 6, 'B: ve solo sus 6 posiciones');
select rls_test.throws($q$update public.styles set user_id = '00000000-0000-4000-8000-00000000000a' where name = 'Casual'$q$,
  '42501', 'B: no puede regalarle una fila a A cambiando user_id');

-- 4.5 Referenciar datos de A desde filas de B (claves foráneas compuestas)
select rls_test.throws(format($q$insert into public.garment_types (name, position_id) values ('x', %L)$q$, :'a_position'),
  '23503', 'B: un tipo no puede apuntar a una posición de A');
select rls_test.throws(format($q$insert into public.garments (name, type_id) values ('x', %L)$q$, :'a_type'),
  '23503', 'B: una prenda no puede apuntar a un tipo de A');
select rls_test.throws(format($q$insert into public.style_compat (style_a, style_b, compatible) values (%L, %L, true)$q$, :'a_style1', :'a_style2'),
  '23503', 'B: la matriz de estilos no puede usar estilos de A');
select rls_test.throws($q$insert into public.garment_rules (garment_a, garment_b, allowed)
  values ('0000000a-0000-4000-8000-000000000001', '0000000a-0000-4000-8000-000000000002', false)$q$,
  '23503', 'B: una excepción no puede usar prendas de A');
select rls_test.throws($q$insert into public.occasions (event_id, name) values ('0000000a-0000-4000-8000-000000000030', 'x')$q$,
  '23503', 'B: una ocasión no puede colgar de un evento de A');
select rls_test.throws($q$insert into public.wear_log (worn_on, outfit_id) values (current_date, '0000000a-0000-4000-8000-000000000010')$q$,
  '23503', 'B: su historial no puede apuntar a un outfit de A');
select rls_test.throws($q$insert into public.wear_log (worn_on, perfume_id) values (current_date, '0000000a-0000-4000-8000-000000000020')$q$,
  '23503', 'B: su historial no puede apuntar a un perfume de A');
select rls_test.throws($q$insert into public.garments (name, type_id, photo_path)
  select 'x', id, '00000000-0000-4000-8000-00000000000a/garments/x.webp' from public.garment_types where name = 'Jeans'$q$,
  '23514', 'B: la foto de una prenda solo puede estar en su propia carpeta');

-- 4.6 Storage: lo permitido y lo que no
select rls_test.affects($q$insert into storage.objects (bucket_id, name) values ('wardrobe', '00000000-0000-4000-8000-00000000000b/garments/b.webp')$q$, 1,
  'B: puede subir fotos a su carpeta');
select rls_test.throws($q$insert into storage.objects (bucket_id, name) values ('wardrobe', 'b.webp')$q$,
  '42501', 'B: no puede subir fotos fuera de una carpeta de usuario');
select rls_test.throws($q$insert into storage.objects (bucket_id, name) values ('otro', '00000000-0000-4000-8000-00000000000b/x.webp')$q$,
  '42501', 'B: no puede subir a otro bucket');

-- 4.7 updated_at lo decide el servidor (la sincronización depende de ello)
insert into public.garments (name, type_id, updated_at)
select 'Prenda de B', id, '2000-01-01' from public.garment_types where name = 'Jeans';
select rls_test.counts($q$select 1 from public.garments where updated_at > now() - interval '1 minute'$q$, 1,
  'B: el servidor ignora el updated_at que manda el cliente');

-- ═══ 5. Los datos de A siguen intactos ═════════════════════════════════════
reset role;
select rls_test.counts(format($q$
  select s.t from rls_test.a_snapshot s
  join (
    select 'garments' as t, count(*) as n, max(updated_at) as last from public.garments where user_id = %1$L
    union all select 'outfits', count(*), max(updated_at) from public.outfits where user_id = %1$L
    union all select 'perfumes', count(*), max(updated_at) from public.perfumes where user_id = %1$L
    union all select 'wear_log', count(*), max(updated_at) from public.wear_log where user_id = %1$L
    union all select 'positions', count(*), max(updated_at) from public.positions where user_id = %1$L
    union all select 'user_settings', count(*), max(updated_at) from public.user_settings where user_id = %1$L
    union all select 'storage', count(*), max(updated_at) from storage.objects where name like %1$L || '/%%'
  ) now_ using (t)
  where s.n = now_.n and s.last is not distinct from now_.last
$q$, :'A'), 7, 'A: sus datos siguen intactos después de los intentos de B y anon');

-- ═══ Resumen ═══════════════════════════════════════════════════════════════
do $$
declare passed int; failed int;
begin
  select count(*) filter (where ok), count(*) filter (where not ok) into passed, failed from rls_test.results;
  raise notice '';
  raise notice 'Resumen RLS: % ok, % fallas', passed, failed;
  if failed > 0 then
    raise exception 'Hay % comprobación(es) de RLS que fallaron', failed;
  end if;
end $$;
