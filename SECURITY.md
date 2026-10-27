# Seguridad

> *English:* please report vulnerabilities privately through **GitHub → Security → Report a vulnerability** on this repository. Do not open public issues for security problems.

## Cómo reportar una vulnerabilidad

Repórtala **en privado** desde este repositorio: pestaña **Security → Report a vulnerability**. No abras un *issue* público ni publiques detalles hasta que haya una corrección.

Incluye, si puedes:

- qué componente afecta (app, migraciones SQL, scripts, workflows);
- pasos para reproducirla en un entorno de prueba propio;
- el impacto que crees que tiene.

Es un proyecto personal mantenido en el tiempo libre: la respuesta es de buena fe, sin plazos garantizados. Se avisará cuando haya una corrección y se dará crédito a quien la reporte, si lo desea.

## Qué cubre

| Dentro | Fuera |
|---|---|
| Código de la app (`src/`), migraciones y políticas RLS (`supabase/`), scripts (`scripts/`), workflows (`.github/`) y cabeceras (`vercel.json`) | Fallos de Supabase, Vercel o GitHub como plataformas (repórtalos a ellos) |
| Fugas de datos entre usuarios, saltos de RLS, XSS, manejo inseguro de archivos o claves | Instancias de terceros desplegadas con una configuración distinta a la documentada |

**No pruebes contra instancias ajenas.** Para probar, despliega tu propia copia (ver [README](README.md)) o usa la prueba local de RLS: `npm run test:rls` levanta un Postgres desechable sin red.

## Versiones con soporte

Solo la rama `main`. Las correcciones se publican ahí.

## Controles que ya existen

El modelo de amenazas está en [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md). En resumen:

- **Row Level Security** en todas las tablas y en Storage: cada usuario solo ve y modifica lo suyo. `npm run test:rls` lo comprueba en cada cambio (CI).
- El navegador solo recibe la clave **pública**; la app se niega a arrancar con una clave `service_role`/`secret`.
- Sin registro público, fotos en un bucket privado con URL firmadas, CSP estricta sin `unsafe-inline`.
- CI con detección de secretos (gitleaks), auditoría de dependencias de producción, pruebas, y actions fijadas por SHA; Dependabot para actualizaciones.
