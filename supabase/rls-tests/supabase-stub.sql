-- ═══════════════════════════════════════════════════════════════════════════
-- Imitación mínima de Supabase sobre un Postgres vacío, para probar las
-- migraciones y sus políticas RLS en local (ver scripts/probar-rls.mjs).
--
-- Reproduce solo lo que las migraciones usan:
--   · roles anon / authenticated / service_role
--   · auth.users y auth.uid() (lee el "sub" del JWT, como en Supabase)
--   · storage.buckets, storage.objects (con RLS) y storage.foldername()
--   · los permisos por defecto de Supabase en el esquema public: TODO para
--     anon y authenticated. Así la prueba verifica que las migraciones
--     revocan lo que deben, igual que en un proyecto real.
-- ═══════════════════════════════════════════════════════════════════════════

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- ─── auth ──────────────────────────────────────────────────────────────────
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id    uuid primary key,
  email text
);

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

-- ─── storage ───────────────────────────────────────────────────────────────
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create table storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text,
  owner       uuid,
  metadata    jsonb,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (bucket_id, name)
);

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- Misma definición que en Supabase: carpetas de la ruta, sin el archivo.
create function storage.foldername(name text) returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;

-- ─── public: permisos por defecto de Supabase ─────────────────────────────
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
