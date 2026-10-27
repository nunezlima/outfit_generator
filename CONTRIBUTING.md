# Cómo contribuir

Gracias por tu interés. Esta guía resume cómo preparar el entorno, las convenciones del código y lo que la CI revisa en cada cambio.

## Preparar el entorno

Requisitos: [Node.js](https://nodejs.org) 20 o superior. Para la prueba de RLS, además, [Docker](https://docs.docker.com/get-docker/).

```bash
npm ci
cp .env.example .env    # URL y clave PÚBLICA de TU proyecto de Supabase de pruebas
npm run dev             # http://localhost:5173
```

Usa un proyecto de Supabase **propio y de pruebas**, nunca uno con datos reales de otra persona. Las migraciones se aplican con `npx supabase db push` (ver README, paso 2).

## Antes de abrir un pull request

```bash
npm run typecheck   # tipos de TypeScript
npm run lint        # oxlint
npm test            # pruebas unitarias (Vitest)
npm run build       # compila la versión de producción
npm run test:rls    # si tocaste supabase/: aplica las migraciones en un Postgres desechable y prueba RLS
```

La CI ejecuta lo mismo, más `npm audit --omit=dev --audit-level=high` y gitleaks sobre todo el historial. Un PR no se fusiona con la CI en rojo.

## Convenciones

- **Idioma:** identificadores (variables, funciones, tipos) en inglés; comentarios y textos de la interfaz en español neutro.
- **Estructura:** la lógica pura va en `src/domain/` con pruebas en `__tests__/`; el acceso a datos en `src/data/`; las pantallas en `src/screens/`; los componentes reutilizables en `src/ui/`. Ver [`docs/DISENO.md`](docs/DISENO.md).
- **Comentarios:** explican el *porqué* o un comportamiento no evidente, no repiten el código.
- **Estilos:** usa los tokens de `src/styles/global.css` (`--accent`, `--text-muted`, `--content-max`…), no colores ni anchos sueltos. Comprueba modo claro y oscuro, 375 px y escritorio, y un área de toque de 44 px en controles nuevos.
- **Cambios pequeños y con prueba:** si corriges un error, agrega la prueba que lo habría detectado.

## Base de datos

- **Nunca** edites una migración que ya se aplicó: crea una nueva (`npx supabase migration new nombre`).
- Toda tabla nueva en `public` necesita `user_id`, **RLS activado** y políticas de select/insert/update/delete que comparen con `auth.uid()`, y `revoke all ... from anon`. `npm run test:rls` falla si falta algo de esto.
- Las referencias entre tablas usan claves foráneas compuestas `(user_id, id)`, para que una fila nunca apunte a datos de otro usuario.
- Al fusionar en `main`, la Action **Migraciones de Supabase** aplica las migraciones nuevas al proyecto del dueño del repositorio. Revisa el SQL con cuidado en el PR.

## Seguridad

- Nunca subas `.env`, claves, respaldos (`.zip`) ni datos personales. En el navegador solo va la clave **pública**.
- No agregues `unsafe-inline`, `unsafe-eval` ni comodines a la CSP de `vercel.json`: hay una prueba que lo impide.
- Las actions de los workflows van fijadas por SHA, con la versión en un comentario.
- Para reportar una vulnerabilidad, sigue [`SECURITY.md`](SECURITY.md); no abras un *issue* público.
