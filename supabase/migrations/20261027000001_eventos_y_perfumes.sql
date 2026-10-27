-- ═══════════════════════════════════════════════════════════════════════════
-- Guardarropa · Migración 5: eventos, ocasiones y perfumes
--
-- · outfit_events: los eventos del generador (Ejercicio, Pulcro, Íntimo…).
--   Reemplazan a los presets en la pantalla Generar.
-- · occasions: cada evento tiene una o más ocasiones (p. ej. Pulcro →
--   "Oficina" y "Paseo / Reunión familiar"). La ocasión decide:
--     style_ids       estilos permitidos para la ropa
--     perfumes_hot    perfumes para calor     ┐ en orden: el primero es el
--     perfumes_mild   perfumes para templado  │ principal, los demás son
--     perfumes_cold   perfumes para frío      ┘ secundarios
--   Arreglos en lugar de tablas intermedias (igual que garments.style_ids):
--   una fila = un cambio atómico al sincronizar.
-- · perfumes: tu colección. status 'archived' = ya no se sugiere.
-- · wear_log.perfume_id: el perfume que usaste ese día ("Lo usé hoy").
--
-- Idempotente: se puede volver a correr sin que falle.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.outfit_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, id)
);

create table if not exists public.occasions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id       uuid not null,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  style_ids      uuid[] not null default '{}',
  perfumes_hot   uuid[] not null default '{}',
  perfumes_mild  uuid[] not null default '{}',
  perfumes_cold  uuid[] not null default '{}',
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (user_id, id),
  foreign key (user_id, event_id) references public.outfit_events (user_id, id)
);

create table if not exists public.perfumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  notes       text check (notes is null or char_length(notes) <= 1000),
  status      text not null default 'available' check (status in ('available', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (user_id, id)
);

create index if not exists occasions_event_idx on public.occasions (user_id, event_id);

-- ─── Perfume del día en el historial ───────────────────────────────────────
alter table public.wear_log add column if not exists perfume_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wear_log_perfume_fk') then
    alter table public.wear_log
      add constraint wear_log_perfume_fk
      foreign key (user_id, perfume_id) references public.perfumes (user_id, id)
      on delete set null (perfume_id);
  end if;
end;
$$;

-- ─── Triggers, índice de sincronización y RLS (igual que la migración 1) ──
do $$
declare
  t text;
begin
  foreach t in array array['outfit_events', 'occasions', 'perfumes']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);

    execute format(
      'create index if not exists %I on public.%I (user_id, updated_at)',
      t || '_sync_idx', t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select auth.uid()) = user_id)',
      t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select auth.uid()) = user_id)',
      t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)',
      t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using ((select auth.uid()) = user_id)',
      t || '_delete_own', t);

    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;
