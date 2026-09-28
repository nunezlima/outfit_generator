-- ═══════════════════════════════════════════════════════════════════════════
-- Guardarropa · Migración 2: bucket PRIVADO para fotos + políticas
--
-- Estructura de rutas (la primera carpeta SIEMPRE es el id del usuario):
--   <user_id>/garments/<garment_id>-<marca>.webp       foto de la prenda
--   <user_id>/garments/<garment_id>-<marca>_thumb.webp miniatura
--   <user_id>/outfits/<outfit_id>/<uuid>.webp          fotos tuyas con el outfit
--
-- Las imágenes se muestran con URL firmadas temporales (no hay URL pública).
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wardrobe', 'wardrobe', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects ya tiene RLS activado por Supabase; solo agregamos políticas.
create policy "wardrobe_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "wardrobe_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "wardrobe_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "wardrobe_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
