-- ═══════════════════════════════════════════════════════════════════════════
-- Guardarropa · Migración 4: clima por prenda y capa intermedia
--
-- · garments.climate: temporada de la prenda.
--     'hot'  → solo días de calor
--     'all'  → todo el año (sale con cualquier clima)
--     'cold' → solo días de frío
--   El generador ya no deduce el clima del nivel de abrigo: el abrigo
--   (ligera / media / abrigadora) queda como descripción de la capa.
--
-- · Nuevo rol de posición 'mid' (capa intermedia): suéteres, sudaderas,
--   sobrecamisas. Es opcional y puede ir sola en el torso, sin prenda ligera
--   debajo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.garments
  add column climate text not null default 'all'
  check (climate in ('hot', 'all', 'cold'));

alter table public.positions drop constraint positions_role_check;
alter table public.positions
  add constraint positions_role_check
  check (role in ('top', 'mid', 'bottom', 'full_body', 'outer', 'footwear', 'accessory', 'extra'));
