# 👕 Guardarropa

App web (PWA, pensada primero para celular) para administrar tu ropa y generar
combinaciones que tengan sentido. Funciona sin conexión y se sincroniza sola
con Supabase cuando vuelve internet.

- **Prendas** con foto (cámara o galería, comprimida a ≤1200 px), tipo, estilos, color, abrigo, usos antes de lavar, estado y notas. Alta rápida con “Guardar y agregar otra”.
- **Generador de outfits** con reglas de compatibilidad en 3 niveles, presets, estilo objetivo, clima, prendas fijadas o bloqueadas, cambio por posición y una rotación que favorece lo que no has usado.
- **Outfits guardados** con favoritos, etiquetas, fotos tuyas usándolos y aviso de “no disponible”.
- **Cesto de ropa sucia** automático, **calendario** de lo que te pusiste y **análisis** de prendas evitadas o poco usadas, con un resumen mensual.
- **Respaldo** completo (datos + fotos) en un `.zip`.

> La propuesta de diseño (modelo de datos, esquema y lógica del generador) está en [`docs/DISENO.md`](docs/DISENO.md).

---

## Índice

1. [Crear el proyecto en Supabase y obtener las claves](#paso-1-crear-el-proyecto-en-supabase-y-obtener-las-claves)
2. [Aplicar las migraciones, desactivar el registro y crear tu usuario](#paso-2-aplicar-las-migraciones-desactivar-el-registro-público-y-crear-tu-usuario)
3. [Subir el código a un repositorio privado de GitHub](#paso-3-subir-el-código-a-un-repositorio-privado-de-github)
4. [Configurar los GitHub Secrets](#paso-4-configurar-los-github-secrets-y-aplicar-las-migraciones)
5. [Conectar el repositorio a Vercel](#paso-5-conectar-el-repositorio-a-vercel)
6. [Actualizaciones futuras](#paso-6-actualizaciones-futuras)
7. [Si una clave se filtra por accidente](#paso-7-si-una-clave-se-filtra-por-accidente)
8. [Desarrollo en tu computadora](#desarrollo-en-tu-computadora)
9. [Cómo funciona por dentro](#cómo-funciona-por-dentro)
10. [Seguridad y privacidad](#seguridad-y-privacidad)

> ℹ️ Los paneles de Supabase, GitHub y Vercel cambian de vez en cuando. Si un
> botón no se llama exactamente igual, busca uno parecido en la misma sección.

---

## Paso 1. Crear el proyecto en Supabase y obtener las claves

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (puedes usar tu cuenta de GitHub).
2. Pulsa **New project**:
   - **Name**: el que quieras, p. ej. `guardarropa`.
   - **Database Password**: pulsa *Generate a password* y **guárdala en tu gestor de contraseñas**. La necesitarás en el paso 4.
   - **Region**: la más cercana a ti.
   - Plan **Free**.
3. Espera 1–2 minutos a que el proyecto se cree.
4. Anota estos tres datos (guárdalos en un lugar privado, **nunca** en el código):

   | Dato | Dónde encontrarlo | Para qué |
   |---|---|---|
   | **Project URL** (`https://xxxx.supabase.co`) | Botón **Connect** arriba, o *Project Settings → Data API* | Vercel y `.env` |
   | **Clave pública** | *Project Settings → API Keys*: la **Publishable key** (`sb_publishable_…`) o, en la pestaña de claves antiguas (*Legacy*), la **anon public** | Vercel y `.env` |
   | **Reference ID** (unas 20 letras) | *Project Settings → General → Project ID* | GitHub Secrets |

> ⚠️ **Nunca** uses la clave **`service_role`** ni la **Secret key** (`sb_secret_…`) en la app: saltan todas las reglas de seguridad. La app se niega a arrancar si detecta una de ellas.

---

## Paso 2. Aplicar las migraciones, desactivar el registro público y crear tu usuario

### 2.1 Aplicar las migraciones (crear tablas, seguridad y bucket de fotos)

Todo el esquema está versionado en [`supabase/migrations`](supabase/migrations):

| Archivo | Qué crea |
|---|---|
| `…0001_esquema_inicial.sql` | Tablas, índices, *triggers* y **Row Level Security** con políticas “solo el dueño” |
| `…0002_storage_fotos.sql` | Bucket **privado** `wardrobe` y sus políticas (cada quien solo su carpeta) |
| `…0003_catalogo_inicial.sql` | Función que crea tus categorías y reglas iniciales la primera vez que entras |

Elige **una** de estas dos formas:

- **Opción A (recomendada, sin instalar nada):** la GitHub Action las aplicará sola en el [paso 4](#paso-4-configurar-los-github-secrets-y-aplicar-las-migraciones). Sigue con 2.2 y vuelve a verificar después.
- **Opción B (desde tu computadora, con Node.js instalado):**
  ```bash
  npx supabase login                               # abre el navegador para autorizar
  npx supabase link --project-ref TU_REFERENCE_ID  # te pide la contraseña de la base
  npx supabase db push                             # aplica las migraciones
  ```

> ❗ No pegues los archivos SQL a mano en el *SQL Editor*: Supabase no sabría que ya se aplicaron y la Action intentaría aplicarlos otra vez (y fallaría). Si ya lo hiciste, márcalos como aplicados con `npx supabase migration repair --status applied 20260928000001` (y lo mismo con `…0002` y `…0003`).

**Cómo verificar:** en *Table Editor* verás las tablas (`garments`, `outfits`…) sin la etiqueta roja “Unrestricted” (= RLS activado), y en *Storage* un bucket `wardrobe` marcado como **Private**.

### 2.2 Desactivar el registro público

La app no tiene pantalla de registro, pero también hay que cerrarlo en el servidor
(si no, alguien podría crear una cuenta llamando directo a la API):

1. *Authentication → Sign In / Providers* (en algunas versiones: *Authentication → Settings*).
2. Desactiva **Allow new users to sign up**.
3. Guarda (**Save**).

Con esto el proveedor *Email* sigue sirviendo para **iniciar sesión**, pero nadie puede crear cuentas nuevas por su cuenta.

### 2.3 Crear tu usuario

1. *Authentication → Users → Add user → Create new user*.
2. Escribe tu correo y una contraseña **larga** (usa tu gestor de contraseñas).
3. Marca **Auto Confirm User** (así no necesitas confirmar por correo).
4. Pulsa **Create user**.

La primera vez que inicies sesión, la app crea sola tus posiciones, tipos, estilos, reglas y dos presets de ejemplo (“Verano” y “Oficina”). Todo es editable.

---

## Paso 3. Subir el código a un repositorio privado de GitHub

**Si ya tienes este código en tu GitHub** (por ejemplo, en una rama creada por Claude):

1. Asegúrate de que el repositorio es **privado**: *Settings → General → Danger Zone → Change repository visibility → Private*.
2. Abre un *Pull Request* de la rama hacia `main` y fusiónalo (**Merge**). Vercel y la Action trabajan sobre `main`.

**Si partes de cero:**

1. En GitHub: **New repository** → nombre → **Private** → *Create repository* (sin README).
2. En tu computadora, dentro de la carpeta del proyecto:
   ```bash
   git init
   git add .
   git status            # revisa que NO aparezca ningún archivo .env
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
   (Si prefieres no usar la terminal, [GitHub Desktop](https://desktop.github.com) hace lo mismo con botones.)

> El archivo `.gitignore` ya excluye `.env` desde el primer commit. Solo `.env.example` (con valores falsos) va al repositorio.

---

## Paso 4. Configurar los GitHub Secrets (y aplicar las migraciones)

La Action [`.github/workflows/supabase-migrations.yml`](.github/workflows/supabase-migrations.yml) aplica las migraciones nuevas cada vez que subes cambios en `supabase/migrations` a `main`. Necesita tres secretos:

1. Crea un **token de acceso** de Supabase: [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → **Generate new token** → nombre “GitHub Actions” → copia el token (solo se muestra una vez).
2. En GitHub: tu repositorio → *Settings → Secrets and variables → Actions → New repository secret*. Crea:

   | Nombre (exacto) | Valor |
   |---|---|
   | `SUPABASE_ACCESS_TOKEN` | El token del punto 1 |
   | `SUPABASE_DB_PASSWORD` | La contraseña de la base del paso 1 (si la perdiste: *Project Settings → Database → Reset database password*) |
   | `SUPABASE_PROJECT_ID` | El **Reference ID** del paso 1 |

3. Ejecuta la Action por primera vez: pestaña **Actions** → **Migraciones de Supabase** → **Run workflow** → rama `main`.
4. Espera la palomita verde ✅. Si sale ❌, abre el paso que falló: el mensaje dice qué secreto falta o qué salió mal.

> Los *secrets* no se ven en los registros ni en el código; GitHub los oculta automáticamente.
> También hay una segunda Action, **CI**, que en cada cambio revisa tipos, pruebas, que compile y que no se haya subido ningún `.env` ni clave por error.

---

## Paso 5. Conectar el repositorio a Vercel

1. Entra a [vercel.com](https://vercel.com) → **Sign Up** con tu cuenta de GitHub (plan **Hobby**, gratis).
2. **Add New… → Project** → junto a tu repositorio pulsa **Import** (si no aparece, pulsa *Adjust GitHub App Permissions* y dale acceso a ese repo privado).
3. *Framework Preset*: **Vite** (se detecta solo; `vercel.json` ya indica el comando y la carpeta).
4. Abre **Environment Variables** y agrega (marca *Production* y *Preview*):

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | Tu Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Tu clave **pública** (publishable o anon) |

5. **Deploy**. En 1–2 minutos tendrás una URL tipo `https://tu-app.vercel.app`.
6. En Vercel → *Settings → Git*, verifica que la **Production Branch** sea `main`. Desde ahora cada `git push` a `main` publica una versión nueva automáticamente.
7. (Recomendado) En Supabase → *Authentication → URL Configuration*, pon tu URL de Vercel como **Site URL**.

**Instalarla en el celular:**
- **iPhone (Safari):** abre la URL → botón *Compartir* → **Agregar a pantalla de inicio**.
- **Android (Chrome):** abre la URL → menú ⋮ → **Instalar app** / *Agregar a pantalla principal*.

> Si cambias las variables de entorno en Vercel, haz **Redeploy** (*Deployments → ⋯ → Redeploy*): Vite las incorpora al compilar.

---

## Paso 6. Actualizaciones futuras

**Cambios en la app (código):**
1. Edita, prueba en local (`npm run dev`, `npm test`).
2. `git commit` y `git push` a `main` (o abre un Pull Request y fusiónalo).
3. Vercel publica solo. En el celular aparecerá el aviso **“Hay una versión nueva de la app → Actualizar”**.

**Cambios en la base de datos:**
1. **Nunca** edites una migración que ya se aplicó. Crea una nueva:
   ```bash
   npx supabase migration new agregar_campo_marca
   ```
   Se crea `supabase/migrations/<fecha>_agregar_campo_marca.sql`; escribe ahí tu SQL (y recuerda RLS si creas tablas nuevas).
2. Súbela a `main`. La Action la aplica sola; revisa la pestaña **Actions**.
3. Si la app necesita la columna nueva, sube el código en el mismo cambio o justo después.

**Respaldo:** de vez en cuando, *Ajustes → Respaldo → Exportar* y guarda el `.zip` en un lugar privado (incluye tus fotos).

> ⏸️ En el plan gratuito, Supabase **pausa** los proyectos después de ~1 semana sin actividad. Si pasa, entra al panel y pulsa **Restore**. Mientras tanto, la app sigue funcionando con los datos guardados en tu celular y sincroniza al reactivarse.

---

## Paso 7. Si una clave se filtra por accidente

Lo que protege tus datos es **RLS** + tu contraseña. Aun así, si algo se filtra, **rótalo** (cámbialo). Borrarlo del historial de Git no basta: alguien pudo copiarlo.

| ¿Qué se filtró? | Qué tan grave | Qué hacer |
|---|---|---|
| **Clave pública** (anon / publishable) | Baja: está pensada para ir en el navegador; RLS impide ver datos ajenos | Si usas *publishable keys*: *Project Settings → API Keys* → crea una nueva, cámbiala en Vercel, **Redeploy**, y borra la vieja. Con la *anon* antigua, la forma de rotarla es rotar el secreto JWT (ver abajo) |
| **service_role** o **Secret key** | 🚨 **Crítica**: da acceso total, sin RLS | De inmediato: *Project Settings → API Keys* → **revoca/borra** la secret key filtrada. Si era la *service_role* antigua (JWT): *Project Settings → JWT Keys* → rota el secreto / migra a nuevas llaves de firma (cierra todas las sesiones y cambia también la anon: actualízala en Vercel). Revisa tus tablas y *Authentication → Logs* |
| **Contraseña de la base** | Alta | *Project Settings → Database → Reset database password*. Actualiza el secret `SUPABASE_DB_PASSWORD` en GitHub |
| **Token de acceso** (`SUPABASE_ACCESS_TOKEN`) | Alta: controla tus proyectos | [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) → **Revoke**. Crea otro y actualiza el secret en GitHub |
| **Tu contraseña de usuario** | Media | *Authentication → Users* → tu usuario → cambia la contraseña; luego en la app, *Ajustes → Cerrar sesión* y vuelve a entrar |

Si la clave llegó a un commit: **primero rota**, después (opcional) limpia el historial con [`git filter-repo`](https://github.com/newren/git-filter-repo) y activa *Settings → Code security → Secret scanning* en GitHub.

---

## Desarrollo en tu computadora

Requisitos: [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
cp .env.example .env      # y escribe tu URL y clave PÚBLICA
npm run dev               # abre http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas unitarias (generador, compatibilidad, análisis, cesto, respaldo) |
| `npm run typecheck` | Revisa tipos de TypeScript |
| `npm run lint` | Revisión de estilo (oxlint) |
| `npm run build` | Compila la versión de producción en `dist/` |

### Estructura

```
src/
  domain/        Lógica PURA (sin interfaz), con pruebas en __tests__/
    compat.ts      Compatibilidad en 3 niveles y sus explicaciones
    generator.ts   Generador: filtros, estructura, búsqueda y diagnóstico
    analysis.ts    Tasa de rechazo, prendas evitadas/sin usar, resumen
    laundry.ts     Reglas del cesto
    colors.ts      Paleta y sugerencias de color
  data/          IndexedDB (Dexie), sincronización, fotos, respaldo
  screens/       Pantallas
  ui/            Componentes reutilizables
  app/           Sesión, tema, estado del generador, rutas
supabase/
  migrations/    Esquema versionado (se aplica con la GitHub Action)
docs/DISENO.md   Propuesta de diseño
```

---

## Cómo funciona por dentro

**Compatibilidad (gana lo más específico):**
1. **Excepción entre dos prendas** (“este hoodie sí va con este pantalón de vestir”).
2. **Regla de tipos** (“pantalón de vestir + chanclas = no”).
3. **Matriz de estilos**: dos prendas combinan si *algún* estilo de una combina con *alguno* de la otra.

Cuando algo se bloquea, la app dice qué regla lo impide, p. ej. *“Regla de tipos: Pantalón de vestir + Chanclas no se combinan.”*

**Generador:** filtra (cesto, archivadas, deseleccionadas, estilo objetivo, clima), elige estructura (superior + inferior, o pieza completa) y llena las posiciones con una búsqueda con retroceso que prueba candidatas en **orden aleatorio ponderado**. El peso favorece lo que no usas hace tiempo (una prenda de ayer sale ~6 veces menos que una olvidada, pero puede salir) y baja un poco las prendas muy rechazadas. Si no hay combinación posible, explica la causa, p. ej. *“No hay calzado disponible con estilo Formal: 2 en el cesto, 3 no son de estilo Formal.”*

**Prendas evitadas:** tasa de rechazo = (rechazos fuertes + débiles × 0.25) ÷ veces mostrada, y solo cuenta tras un mínimo de apariciones (5 por defecto). Cambiar una prenda con su botón es un rechazo fuerte; regenerar todo el outfit, uno débil para cada prenda no bloqueada.

**Sin conexión:** todo se lee y escribe en IndexedDB; los cambios esperan en una cola y se envían en orden al volver internet. El *service worker* guarda la app para abrirla sin red.

Detalle completo en [`docs/DISENO.md`](docs/DISENO.md).

---

## Seguridad y privacidad

- ✅ Ninguna URL, clave ni contraseña en el código ni en el historial: todo por variables de entorno y GitHub Secrets.
- ✅ `.env` en `.gitignore` desde el primer commit; la Action **CI** falla si se sube uno o si detecta una clave.
- ✅ La app solo usa la clave pública y **se niega a arrancar** con una clave `service_role`/`secret`.
- ✅ **RLS** en todas las tablas: cada usuario solo ve y modifica sus filas (y las claves foráneas compuestas impiden referenciar datos de otro).
- ✅ Fotos en un bucket **privado**, por carpeta de usuario, servidas con **URL firmadas** de 1 hora.
- ✅ Sin registro público: la cuenta se crea a mano en Supabase.
- ✅ Cabeceras de seguridad en Vercel (CSP, HSTS, `X-Frame-Options`, etc.). Si algún día usas un dominio propio para Supabase, agrégalo a `connect-src` en `vercel.json`.
- ✅ Al cerrar sesión se borra la copia local del dispositivo.
- ✅ Los datos de ejemplo son 100 % ficticios.
