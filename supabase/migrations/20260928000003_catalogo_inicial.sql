-- ═══════════════════════════════════════════════════════════════════════════
-- Guardarropa · Migración 3: catálogo inicial por usuario
--
-- seed_default_catalog() crea, para el usuario que la llama, las posiciones,
-- tipos, estilos, matriz de estilos, reglas de tipos y dos presets de
-- ejemplo. Todo se puede editar o borrar después desde la app.
--
-- · SECURITY INVOKER: corre con los permisos del usuario, así que RLS aplica.
-- · Idempotente: solo siembra si el usuario nunca ha tenido posiciones (ni
--   borradas). Un candado por usuario evita duplicados si dos dispositivos
--   la llaman a la vez.
-- · La app la llama automáticamente en el primer inicio de sesión.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.seed_default_catalog()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Se requiere una sesión iniciada';
  end if;

  -- Candado por usuario (se libera solo al terminar la transacción).
  perform pg_advisory_xact_lock(hashtextextended('seed_default_catalog:' || uid::text, 0));

  if exists (select 1 from public.positions where user_id = uid) then
    return false; -- ya se sembró antes (aunque luego se hayan borrado)
  end if;

  insert into public.user_settings (user_id) values (uid)
  on conflict (user_id) do nothing;

  -- ── Posiciones ──────────────────────────────────────────────────────────
  insert into public.positions (user_id, name, role, max_items, sort_order) values
    (uid, 'Parte superior', 'top',       1, 10),
    (uid, 'Capa exterior',  'outer',     1, 20),
    (uid, 'Parte inferior', 'bottom',    1, 30),
    (uid, 'Pieza completa', 'full_body', 1, 40),
    (uid, 'Calzado',        'footwear',  1, 50),
    (uid, 'Accesorios',     'accessory', 3, 60);

  -- ── Tipos (nombre, rol de su posición, usos antes de lavar, abrigo) ─────
  insert into public.garment_types
    (user_id, name, position_id, default_wash_uses, default_warmth, sort_order)
  select uid, t.name, p.id, t.wash, t.warmth, t.ord
  from (values
    ('Camiseta',           'top',        1, 'light',  10),
    ('Camisa',             'top',        2, 'light',  20),
    ('Polo',               'top',        2, 'light',  30),
    ('Blusa',              'top',        2, 'light',  40),
    ('Top',                'top',        1, 'light',  50),
    ('Suéter',             'top',        4, 'medium', 60),
    ('Sudadera',           'top',        3, 'medium', 70),
    ('Hoodie',             'top',        3, 'medium', 80),
    ('Chamarra',           'outer',     10, 'medium', 10),
    ('Saco / Blazer',      'outer',      8, 'medium', 20),
    ('Abrigo',             'outer',     15, 'warm',   30),
    ('Chaleco',            'outer',      6, 'medium', 40),
    ('Jeans',              'bottom',     4, 'medium', 10),
    ('Pantalón de vestir', 'bottom',     3, 'medium', 20),
    ('Pantalón casual',    'bottom',     3, 'medium', 30),
    ('Shorts',             'bottom',     2, 'light',  40),
    ('Falda',              'bottom',     3, 'light',  50),
    ('Pants deportivos',   'bottom',     2, 'medium', 60),
    ('Vestido',            'full_body',  2, 'light',  10),
    ('Overol',             'full_body',  3, 'medium', 20),
    ('Traje de baño',      'full_body',  1, 'light',  30),
    ('Zapatos de vestir',  'footwear',   0, 'medium', 10),
    ('Mocasines',          'footwear',   0, 'medium', 20),
    ('Tenis',              'footwear',   0, 'medium', 30),
    ('Botas',              'footwear',   0, 'warm',   40),
    ('Sandalias',          'footwear',   0, 'light',  50),
    ('Chanclas',           'footwear',   0, 'light',  60),
    ('Reloj',              'accessory',  0, 'medium', 10),
    ('Anillo',             'accessory',  0, 'medium', 20),
    ('Cadena',             'accessory',  0, 'medium', 30),
    ('Pulsera',            'accessory',  0, 'medium', 40),
    ('Cinturón',           'accessory',  0, 'medium', 50),
    ('Lentes',             'accessory',  0, 'medium', 60),
    ('Gorra',              'accessory',  5, 'medium', 70),
    ('Bufanda',            'accessory',  5, 'warm',   80)
  ) as t(name, role, wash, warmth, ord)
  join public.positions p
    on p.user_id = uid and p.role = t.role and p.deleted_at is null;

  -- ── Estilos ─────────────────────────────────────────────────────────────
  insert into public.styles (user_id, name, sort_order) values
    (uid, 'Formal',       10),
    (uid, 'Smart casual', 20),
    (uid, 'Casual',       30),
    (uid, 'Deportivo',    40),
    (uid, 'Playa',        50);

  -- ── Nivel 1: matriz de estilos (cada estilo combina siempre consigo) ────
  insert into public.style_compat (user_id, style_a, style_b, compatible)
  select uid, least(a.id, b.id), greatest(a.id, b.id), r.ok
  from (values
    ('Formal',       'Smart casual', true),
    ('Formal',       'Casual',       false),
    ('Formal',       'Deportivo',    false),
    ('Formal',       'Playa',        false),
    ('Smart casual', 'Casual',       true),
    ('Smart casual', 'Deportivo',    false),
    ('Smart casual', 'Playa',        false),
    ('Casual',       'Deportivo',    true),
    ('Casual',       'Playa',        true),
    ('Deportivo',    'Playa',        true)
  ) as r(na, nb, ok)
  join public.styles a on a.user_id = uid and a.name = r.na
  join public.styles b on b.user_id = uid and b.name = r.nb;

  -- ── Nivel 2: reglas de tipos (ganan sobre la matriz de estilos) ─────────
  insert into public.type_rules (user_id, type_a, type_b, allowed)
  select uid, least(a.id, b.id), greatest(a.id, b.id), r.ok
  from (values
    -- prohibidas
    ('Pantalón de vestir', 'Chanclas',          false),
    ('Pantalón de vestir', 'Hoodie',            false),
    ('Pantalón de vestir', 'Sudadera',          false),
    ('Pants deportivos',   'Zapatos de vestir', false),
    ('Pants deportivos',   'Saco / Blazer',     false),
    ('Traje de baño',      'Zapatos de vestir', false),
    ('Traje de baño',      'Botas',             false),
    ('Traje de baño',      'Abrigo',            false),
    ('Traje de baño',      'Bufanda',           false),
    ('Abrigo',             'Shorts',            false),
    ('Abrigo',             'Chanclas',          false),
    ('Saco / Blazer',      'Chanclas',          false),
    -- permitidas aunque sus estilos no coincidan
    ('Jeans',              'Saco / Blazer',     true),
    ('Camiseta',           'Saco / Blazer',     true)
  ) as r(na, nb, ok)
  join public.garment_types a on a.user_id = uid and a.name = r.na
  join public.garment_types b on b.user_id = uid and b.name = r.nb;

  -- ── Presets de ejemplo ──────────────────────────────────────────────────
  insert into public.presets (user_id, name, sort_order, config)
  select uid, 'Verano', 10, jsonb_build_object(
    'weather', 'hot',
    'targetStyleId', null,
    'excludedGarmentIds', '[]'::jsonb,
    'excludedStyleIds', '[]'::jsonb,
    'excludedTypeIds', coalesce((
      select jsonb_agg(gt.id)
      from public.garment_types gt
      where gt.user_id = uid
        and gt.name in ('Abrigo', 'Chamarra', 'Suéter', 'Bufanda', 'Botas')
    ), '[]'::jsonb)
  );

  insert into public.presets (user_id, name, sort_order, config)
  select uid, 'Oficina', 20, jsonb_build_object(
    'weather', null,
    'targetStyleId', s.id,
    'excludedGarmentIds', '[]'::jsonb,
    'excludedStyleIds', '[]'::jsonb,
    'excludedTypeIds', '[]'::jsonb
  )
  from public.styles s
  where s.user_id = uid and s.name = 'Smart casual';

  return true;
end;
$$;

revoke execute on function public.seed_default_catalog() from public, anon;
grant execute on function public.seed_default_catalog() to authenticated;
