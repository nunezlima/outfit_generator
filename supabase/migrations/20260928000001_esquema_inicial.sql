-- ═══════════════════════════════════════════════════════════════════════════
-- Guardarropa · Migración 1: esquema inicial + Row Level Security
--
-- Convenciones (ver docs/DISENO.md):
--   · Todas las tablas tienen user_id (dueño), created_at, updated_at y
--     deleted_at (borrado lógico, necesario para sincronizar borrados).
--   · updated_at lo pone SIEMPRE el servidor (trigger) y la app lo usa como
--     cursor para descargar solo lo que cambió.
--   · Las tablas "padre" tienen UNIQUE (user_id, id) y las "hijas" las
--     referencian con claves foráneas compuestas, así una fila nunca puede
--     apuntar a datos de otro usuario.
--   · RLS activada en todo: cada usuario solo ve y modifica lo suyo.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Función genérica para updated_at ──────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── Posiciones del outfit ─────────────────────────────────────────────────
-- role indica al generador cómo tratar la posición:
--   top / bottom  → obligatorias (salvo que haya pieza completa)
--   full_body     → sustituye a top + bottom
--   footwear      → obligatoria
--   outer / extra → opcionales, máximo 1 prenda
--   accessory     → opcionales, hasta max_items prendas
create table public.positions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  role        text not null check (role in ('top', 'bottom', 'full_body', 'outer', 'footwear', 'accessory', 'extra')),
  max_items   smallint not null default 1 check (max_items between 1 and 10),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, id)
);

-- ─── Tipos de prenda ───────────────────────────────────────────────────────
create table public.garment_types (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 1 and 60),
  position_id        uuid not null,
  -- Valores que se proponen al crear una prenda de este tipo.
  default_wash_uses  smallint not null default 1 check (default_wash_uses between 0 and 999),
  default_warmth     text not null default 'medium' check (default_warmth in ('light', 'medium', 'warm')),
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (user_id, id),
  foreign key (user_id, position_id) references public.positions (user_id, id)
);

-- ─── Estilos ───────────────────────────────────────────────────────────────
create table public.styles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, id)
);

-- ─── Prendas ───────────────────────────────────────────────────────────────
create table public.garments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  type_id          uuid not null,
  -- Estilos como arreglo (ver DISENO.md §2): simplifica la sincronización.
  style_ids        uuid[] not null default '{}',
  color            text check (color is null or char_length(color) <= 30),
  warmth           text not null default 'medium' check (warmth in ('light', 'medium', 'warm')),
  -- 0 = nunca va al cesto automáticamente (p. ej. calzado o accesorios).
  wash_after_uses  smallint not null default 1 check (wash_after_uses between 0 and 999),
  uses_since_wash  smallint not null default 0 check (uses_since_wash >= 0),
  status           text not null default 'available' check (status in ('available', 'laundry', 'archived')),
  notes            text check (notes is null or char_length(notes) <= 1000),
  -- Ruta dentro del bucket privado; siempre en la carpeta del dueño.
  photo_path       text check (photo_path is null or photo_path like (user_id::text || '/%')),
  -- "Reiniciar contadores": el análisis ignora eventos anteriores a esta fecha.
  stats_reset_at   timestamptz,
  -- Marca las prendas creadas con "Cargar datos de ejemplo".
  is_sample        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (user_id, id),
  foreign key (user_id, type_id) references public.garment_types (user_id, id)
);

-- ─── Reglas de compatibilidad (3 niveles) ──────────────────────────────────
-- Clave primaria = el par ordenado (a < b): imposible duplicar un par.
-- Quitar una regla = marcarla con deleted_at; volver a crearla la revive.

-- Nivel 1: matriz de estilos. Un par sin fila se considera compatible.
create table public.style_compat (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  style_a     uuid not null,
  style_b     uuid not null,
  compatible  boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, style_a, style_b),
  check (style_a < style_b),
  foreign key (user_id, style_a) references public.styles (user_id, id) on delete cascade,
  foreign key (user_id, style_b) references public.styles (user_id, id) on delete cascade
);

-- Nivel 2: pares de tipos permitidos o prohibidos.
create table public.type_rules (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type_a      uuid not null,
  type_b      uuid not null,
  allowed     boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, type_a, type_b),
  check (type_a < type_b),
  foreign key (user_id, type_a) references public.garment_types (user_id, id) on delete cascade,
  foreign key (user_id, type_b) references public.garment_types (user_id, id) on delete cascade
);

-- Nivel 3: excepciones entre dos prendas concretas.
create table public.garment_rules (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  garment_a   uuid not null,
  garment_b   uuid not null,
  allowed     boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, garment_a, garment_b),
  check (garment_a < garment_b),
  foreign key (user_id, garment_a) references public.garments (user_id, id) on delete cascade,
  foreign key (user_id, garment_b) references public.garments (user_id, id) on delete cascade
);

-- ─── Presets del generador ─────────────────────────────────────────────────
-- config: { excludedGarmentIds, excludedTypeIds, excludedStyleIds,
--           targetStyleId, weather }
create table public.presets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  config      jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ─── Outfits guardados ─────────────────────────────────────────────────────
create table public.outfits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  tags         text[] not null default '{}',
  garment_ids  uuid[] not null default '{}',
  favorite     boolean not null default false,
  -- Fotos tuyas usándolo (rutas en el bucket privado).
  photo_paths  text[] not null default '{}',
  notes        text check (notes is null or char_length(notes) <= 1000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (user_id, id)
);

-- ─── Historial de uso (calendario) ─────────────────────────────────────────
create table public.wear_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worn_on      date not null,
  garment_ids  uuid[] not null default '{}',
  outfit_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (user_id, outfit_id) references public.outfits (user_id, id) on delete set null (outfit_id)
);

-- ─── Eventos para el detector de prendas evitadas ─────────────────────────
-- Una fila por acción (no por prenda) para ahorrar espacio:
--   shown          → outfit generado y mostrado
--   reject_strong  → cambiaste esa prenda con su botón
--   reject_weak    → regeneraste el outfit completo
create table public.garment_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('shown', 'reject_strong', 'reject_weak')),
  garment_ids  uuid[] not null check (cardinality(garment_ids) between 1 and 30),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ─── Ajustes del usuario ───────────────────────────────────────────────────
-- Su existencia también indica que el catálogo inicial ya se sembró.
create table public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ─── Índices ───────────────────────────────────────────────────────────────
create index garments_type_idx      on public.garments (user_id, type_id);
create index garments_styles_gin    on public.garments using gin (style_ids);
create index garment_types_pos_idx  on public.garment_types (user_id, position_id);
create index wear_log_day_idx       on public.wear_log (user_id, worn_on);
create index wear_log_outfit_idx    on public.wear_log (user_id, outfit_id);

-- ─── Triggers, índice de sincronización y RLS para cada tabla ─────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'positions', 'garment_types', 'styles', 'garments', 'style_compat',
    'type_rules', 'garment_rules', 'presets', 'outfits', 'wear_log',
    'garment_events', 'user_settings'
  ]
  loop
    -- updated_at lo decide el servidor
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);

    -- Índice para el "pull" incremental (updated_at > cursor)
    execute format(
      'create index %I on public.%I (user_id, updated_at)',
      t || '_sync_idx', t);

    -- Row Level Security: solo el dueño
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)',
      t || '_delete_own', t);

    -- Permisos explícitos: solo usuarios con sesión (y siempre filtrados por
    -- las políticas de arriba). El rol anónimo (sin sesión) no toca nada.
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
