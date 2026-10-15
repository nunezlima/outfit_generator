# Propuesta de diseño — Guardarropa

Este documento se escribió **antes** del código. Describe el modelo de datos, el
esquema de la base de datos, la estrategia sin conexión y la lógica del
generador de outfits. El código sigue esta propuesta; si algo cambia en el
futuro, actualiza también este archivo.

---

## 1. Arquitectura general

```
┌──────────────────────── Navegador / PWA ────────────────────────┐
│  React (pantallas)                                              │
│     │  lee con useLiveQuery (reactivo)                          │
│     ▼                                                           │
│  IndexedDB (Dexie) ◄── repo.ts: toda escritura va aquí primero  │
│     │                  y además a la "bandeja de salida"        │
│     ▼                                                           │
│  sync.ts: push (bandeja → Supabase) y pull (cambios → local)    │
│                                                                 │
│  src/domain/*  ← lógica PURA (sin React ni red), con pruebas:   │
│     compatibilidad, filtros, generador, pesos, análisis, cesto  │
└─────────────────────────────────────────────────────────────────┘
                    │ HTTPS (clave pública + JWT del usuario)
                    ▼
┌──────────────── Supabase ────────────────┐
│ Auth (solo login, registro desactivado)  │
│ Postgres con RLS en todas las tablas     │
│ Storage: bucket privado "wardrobe"       │
│   /<user_id>/garments/...  (URL firmadas)│
└──────────────────────────────────────────┘
```

- **Offline-first**: la interfaz nunca espera a la red. Lee de IndexedDB y
  escribe en IndexedDB + una cola (`outbox`). Cuando hay internet, la cola se
  envía a Supabase en orden y luego se descargan los cambios del servidor.
- **La lógica de negocio vive en `src/domain`** (TypeScript puro) para poder
  probarla con Vitest y reutilizarla sin la interfaz.

---

## 2. Modelo de datos

### Entidades

| Entidad | Qué representa |
|---|---|
| **Posición** (`positions`) | Hueco del outfit: parte superior, capa exterior, parte inferior, pieza completa, calzado, accesorios. Editable. Tiene un **rol** que le dice al generador cómo tratarla. |
| **Tipo** (`garment_types`) | Pantalón, camisa, tenis, reloj… Pertenece a una posición. Trae usos-antes-de-lavar por defecto. |
| **Estilo** (`styles`) | Formal, smart casual, casual, playa, deportivo… |
| **Prenda** (`garments`) | Tu ropa real. Tiene tipo, uno o varios estilos, color, abrigo, usos antes de lavar, estado, foto. |
| **Compatibilidad de estilos** (`style_compat`) | Nivel 1: celda de la matriz estilo × estilo. |
| **Regla de tipos** (`type_rules`) | Nivel 2: par de tipos permitido o prohibido. |
| **Regla de prendas** (`garment_rules`) | Nivel 3: excepción entre dos prendas concretas. |
| **Preset** (`presets`) | Selección guardada de filtros del generador ("Verano", "Oficina"). |
| **Outfit guardado** (`outfits`) | Nombre, etiquetas, prendas, favorito, fotos tuyas usándolo. |
| **Registro de uso** (`wear_log`) | Qué te pusiste qué día (alimenta el calendario y las estadísticas). |
| **Eventos** (`garment_events`) | Mostrada / rechazo fuerte / rechazo débil, para detectar prendas evitadas. |
| **Ajustes** (`user_settings`) | Días "sin usar", mínimo de apariciones, peso del rechazo débil, último resumen visto. |

### Roles de posición (lo que entiende el generador)

| Rol | Comportamiento |
|---|---|
| `top` (parte superior) | Obligatoria, salvo que haya pieza completa o que la capa intermedia vaya sola. |
| `mid` (capa intermedia) | Opcional, 0 o 1, más probable con frío. Puede ir sola en el torso. |
| `bottom` (parte inferior) | Obligatoria, salvo que haya pieza completa. |
| `full_body` (pieza completa) | Alternativa a superior + inferior (vestido, overol, traje de baño). |
| `footwear` (calzado) | Obligatoria. |
| `outer` (capa exterior) | Opcional, 0 o 1. Depende del clima. |
| `accessory` (accesorios) | Opcional, de 0 a `max_items` (por defecto 3), nunca dos del mismo tipo. |
| `extra` (otra opcional) | Opcional, 0 o 1. Para posiciones que crees tú (p. ej. "Capa intermedia"). |

El usuario puede renombrar, crear, reordenar y borrar posiciones; al crear una
elige su rol en un selector con explicaciones.

### Decisiones de modelado

- **Estilos de una prenda como arreglo** `style_ids uuid[]` (y prendas de un
  outfit como `garment_ids uuid[]`) en lugar de tablas intermedias: la
  sincronización sin conexión es mucho más simple (una fila = un cambio
  atómico). Al borrar un estilo/prenda, la app limpia los arreglos.
- **Borrado lógico** (`deleted_at`) en todas las tablas: necesario para que
  otro dispositivo se entere de un borrado al sincronizar.
- **Reglas con clave natural**: las tablas de reglas usan como clave primaria
  `(user_id, a, b)` con `a < b`. Así es imposible duplicar un par y "quitar"
  una regla es marcarla borrada; volver a crearla la revive.
- **`wash_after_uses = 0`** significa "nunca va al cesto" (útil para calzado y
  accesorios).
- **Reiniciar contadores** de una prenda = guardar `stats_reset_at`; los
  cálculos ignoran lo anterior. No se borra historial.
- **Eventos agrupados**: una fila de `garment_events` por acción con
  `garment_ids uuid[]` (un outfit generado = 1 fila "shown" con 4–6 prendas),
  para no llenar la base gratuita.

---

## 3. Esquema de base de datos (Postgres / Supabase)

Todas las tablas tienen `user_id uuid not null default auth.uid()`,
`created_at`, `updated_at` (lo pone un *trigger* del servidor en cada
insert/update y sirve de cursor de sincronización) y `deleted_at`.

```
positions      (id pk, user_id, name, role, max_items, sort_order)
garment_types  (id pk, user_id, name, position_id → positions, sort_order,
                default_wash_uses)
styles         (id pk, user_id, name, sort_order)
garments       (id pk, user_id, name, type_id → garment_types,
                style_ids uuid[], color, warmth, wash_after_uses,
                uses_since_wash, status, notes, photo_path,
                stats_reset_at, is_sample)
style_compat   (pk(user_id, style_a, style_b), compatible bool)   -- a < b
type_rules     (pk(user_id, type_a, type_b), allowed bool)         -- a < b
garment_rules  (pk(user_id, garment_a, garment_b), allowed bool)   -- a < b
presets        (id pk, user_id, name, config jsonb, sort_order)
outfits        (id pk, user_id, name, tags text[], garment_ids uuid[],
                favorite, photo_paths text[], notes)
wear_log       (id pk, user_id, worn_on date, garment_ids uuid[],
                outfit_id → outfits)
garment_events (id pk, user_id, kind, garment_ids uuid[])
user_settings  (user_id pk, prefs jsonb)
```

Restricciones (`check`): `name` no vacío, `warmth in ('light','medium','warm')`,
`status in ('available','laundry','archived')`, `wash_after_uses >= 0`,
`role in (...)`, `kind in ('shown','reject_strong','reject_weak')`, `a < b`.

Índices: `(user_id, updated_at)` en cada tabla (para el *pull* incremental),
`garments(type_id)`, GIN en `garments.style_ids`, `wear_log(user_id, worn_on)`.

**RLS**: activada en todas las tablas, con cuatro políticas (select, insert,
update, delete) del tipo `user_id = (select auth.uid())`. No se concede nada al
rol `anon`.

**Storage**: bucket privado `wardrobe` (límite 5 MB por archivo, solo
`image/jpeg` y `image/webp`). Rutas `<user_id>/garments/<id>-<t>.webp`,
`<user_id>/outfits/<id>/<uuid>.webp`, con miniatura `..._thumb.webp`.
Políticas en `storage.objects`: solo si `bucket_id = 'wardrobe'` y la primera
carpeta de la ruta es `auth.uid()`. Se muestran con URL firmadas de 1 hora y se
guardan en IndexedDB para verlas sin conexión.

**Catálogo inicial**: función SQL `seed_default_catalog()` (se ejecuta con los
permisos del usuario, por lo que RLS aplica). Es idempotente: solo siembra si
aún no existe la fila `user_settings` del usuario. Crea posiciones, tipos,
estilos, la matriz de estilos, reglas de tipos razonables y dos presets.

---

## 4. Sincronización sin conexión

1. **Escribir**: `repo.ts` guarda la fila en IndexedDB y agrega una operación
   a `outbox` (si ya había una pendiente para la misma fila, la reemplaza).
2. **Push** (en orden FIFO; operaciones seguidas de la misma tabla se envían
   en lote): `upsert` a Supabase. Las fotos pendientes se suben desde
   IndexedDB. Errores de red → se reintenta después; errores permanentes →
   quedan marcados y se muestran en Ajustes (reintentar o descartar).
3. **Pull**: por tabla, `updated_at > cursor − 2 min` (margen por relojes y
   transacciones), paginado. Filas con `deleted_at` se borran localmente. Si
   una fila tiene cambios locales sin enviar, gana la local hasta enviarse.
4. **Cuándo**: al abrir la app, al recuperar conexión, al volver a la pestaña,
   cada 5 minutos, y 1,5 s después de cualquier cambio local.

Conflictos: "gana la última escritura". Es una app personal: razonable.

---

## 5. Compatibilidad (3 niveles, gana el más específico)

`checkPair(A, B)` responde `{ ok, nivel, motivo }`:

1. **Regla de prendas** (A, B) si existe → decide.
2. **Regla de tipos** (tipo A, tipo B) si existe → decide.
3. **Matriz de estilos**: combinan si **existe algún par** (estilo de A,
   estilo de B) marcado como compatible. Un estilo siempre combina consigo
   mismo; un par sin marcar se considera compatible. Una prenda sin estilos es
   comodín.

Un outfit es válido si **todos los pares** de prendas son compatibles. Los
estilos que deseleccionas en el generador se quitan de las prendas antes de
comparar (una prenda "casual + playa" con "playa" deseleccionado cuenta solo
como casual).

Ejemplo de motivo: *"Regla de tipos: Pantalón de vestir + Chanclas no se
combinan."*

---

## 6. Lógica del generador

### Entradas
Prendas, catálogo, reglas, estadísticas de uso y opciones:
prendas/tipos/estilos excluidos, estilo objetivo, clima, prendas fijadas
(o bloqueadas) y prendas a evitar (la que se está cambiando).

### Paso 1 — Filtrar candidatas (guardando el motivo de cada descarte)
- Estado distinto de *disponible* → fuera (cesto / archivada).
- Prenda, tipo o todos sus estilos deseleccionados → fuera.
- Estilo objetivo: la prenda debe tenerlo.
- Clima (según el campo `climate` de cada prenda: calor, todo el año o frío).
  El nivel de abrigo ya no filtra: solo describe la capa.

| Clima del día | Prendas que participan | Capas |
|---|---|---|
| Calor | calor + todo el año | sin capa intermedia ni exterior |
| Templado | solo todo el año | intermedia 40 %, exterior 50 % |
| Frío | frío + todo el año | intermedia 85 %, exterior 100 % |
| Sin clima | todas | intermedia 35 %, exterior 35 % |

Las prendas **fijadas** se saltan estos filtros (las elegiste tú), pero deben
estar disponibles y ser compatibles con el resto.

### Paso 2 — Estructura
`superior + inferior + calzado` o `pieza completa + calzado`. Si hay una prenda
fijada decide la estructura; si no, se sortea con probabilidad proporcional a
la cantidad de candidatas de cada opción, y si una falla se intenta la otra.
**Torso en capas** (rol `mid`, "Capa intermedia": suéteres, sudaderas,
sobrecamisas). Si entra la capa intermedia (probabilidad según el clima, tabla
de arriba), en el 35 % de los casos va **sola** en el torso, sin prenda ligera
debajo; si no hay prendas ligeras disponibles, va sola siempre. Sobre una
pieza completa también puede entrar, como opcional.
Luego se deciden las demás opcionales: capa exterior (según el clima),
posiciones `extra` (35 %), y cuántos accesorios (0–`max_items`).

### Paso 3 — Búsqueda con retroceso (backtracking)
Se llenan primero las fijadas, luego las obligatorias con menos candidatas
(las más difíciles) y al final las opcionales. En cada posición, las
candidatas compatibles con lo ya elegido se **ordenan al azar ponderado**
(método de Efraimidis–Spirakis: clave = u^(1/peso)); se prueba la primera y,
si más adelante no hay salida, se retrocede y se prueba la siguiente. Una
opcional sin candidata compatible simplemente se omite. Hay un límite de
pasos para que nunca se congele.

### Paso 4 — Pesos (rotación sin volverse predecible)
```
peso = recencia × color × repetición
recencia(d)  = 0.2 + 1.1 · (1 − e^(−d/10))      d = días desde el último uso
               (nunca usada → 1.3; usada hoy → 0.2; hace 1 mes → ~1.25)
color        = 1 si armoniza con lo ya elegido, 0.75 si choca (sugerencia suave)
repetición   = 0.35 si estaba en el outfit anterior (para que "regenerar" cambie)
```
Es aleatoriedad **proporcional**: una prenda usada ayer puede salir, solo es
~6 veces menos probable que una olvidada.

### Paso 5 — Si no hay combinación posible: explicar
1. Posición obligatoria sin candidatas → se resume por qué, p. ej.
   *"No hay calzado disponible con estilo Formal: 2 en el cesto, 1 archivado,
   3 no son Formal."* + sugerencia.
2. Prenda fijada sin pareja → *"Ninguna prenda de Calzado combina con “Camisa
   blanca” (fijada). Motivo más común: Estilos: Formal no combina con Playa."*
3. Dos posiciones sin ningún par compatible → se dice cuáles y la regla más
   frecuente.
4. Si nada de lo anterior, mensaje general con las reglas que más bloquearon.

### Eventos del generador
- Cada outfit generado → evento `shown`; cambiar una prenda → `reject_strong`;
  regenerar todo → `reject_weak`.
- Se siguen guardando, pero **ya no deciden nada**: cambiar una prenda puede
  ser porque no combinaba o porque había otra mejor, no porque la evites.

---

## 7. Análisis del guardarropa

Se basa solo en lo que **de verdad te pones** (registro "Lo usé hoy"), dentro
de un periodo configurable (últimos N días, 60 por defecto).

```
usos en el periodo   = días del periodo en que la usaste (desde que la tienes / el reinicio)
días elegibles       = días del periodo en que ya la tenías
uso esperado         = usos de su grupo × días elegibles ÷ Σ días elegibles del grupo
uso relativo         = usos en el periodo ÷ uso esperado
```
El **grupo** es la posición (parte superior, capa intermedia, calzado…): de
calzado usas uno al día y de accesorios varios, así que no se mezclan. Repartir
según los días elegibles evita juzgar mal a una prenda recién agregada.

- **Panorama**: cuántas prendas suman el 80 % de tus usos y, por grupo,
  cuántas usaste de cuántas tienes.
- **Sin usar**: 0 usos en el periodo (y la tienes hace ≥ 14 días).
- **Poco usadas**: uso relativo ≤ 0.4 con un esperado ≥ 1.
- **Más usadas**: las de más usos en el periodo.
- Con menos de 7 días registrados en el periodo no se sacan conclusiones.

Acciones: archivar, eliminar, reiniciar contadores. Resumen mensual: "Estas N
prendas casi no las usas" (máx. 5: primero las sin usar, luego las poco usadas)
hasta que lo marques como visto.

---

## 8. Cesto de ropa sucia

Marcar un outfit como usado: +1 a `uses_since_wash` de cada prenda; si llega a
`wash_after_uses` (y este es > 0) pasa a `laundry`. "Lavado / listo" → vuelve a
`available` con contador en 0. También se puede mandar al cesto a mano.

---

## 9. Respaldo

Exportar = ZIP con `data.json` (todas las tablas) + carpeta `photos/`.
Importar = *upsert* de todo (reescribiendo `user_id` y la carpeta de las fotos
al usuario actual) y subida de fotos.
