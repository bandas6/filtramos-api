# Filtramos API

API del catálogo, inventario y panel interno de Filtramos SAS (Node.js, Express, MongoDB).

## Puesta en marcha

1. Instale dependencias: `npm install`
2. Copie `.env.example` como `.env` y complete los valores. **Nunca suba `.env` al repositorio.**
3. Cree el usuario administrador (defina `ADMIN_NOMBRE`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env`):
   `npm run crear-admin` y luego borre `ADMIN_PASSWORD` del `.env`.
4. Inicie: `npm start` (o `npm run dev` para recargar al guardar).

## Autenticación

- `POST /api/auth/login` con `{ email, password }` devuelve `{ token, usuario }`.
- Envíe el token en el encabezado `Authorization: Bearer <token>`.
- `GET /api/auth/renovar` devuelve el usuario de la sesión y un token nuevo.
- Roles: `admin`, `bodega`, `ventas`. Crear, editar, borrar productos y subir imágenes requiere `admin`.
- El login permite 10 intentos cada 15 minutos por IP.

## Rutas de productos

| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/productos/obtener` | Público |
| GET | `/api/productos/obtenerPorId/:id` | Público |
| GET | `/api/productos/generarPdfHtml/pdfHtml` | Público (catálogo PDF) |
| GET | `/api/productos/obtener/imagenes` | Sesión |
| POST | `/api/productos/crear` | admin |
| POST | `/api/productos/crear/imagen` | admin (JPG/PNG/WEBP, máx. 5 MB) |
| PUT | `/api/productos/actualizar/:id` | admin |
| DELETE | `/api/productos/remover/:id` | admin |

El catálogo PDF admite 5 solicitudes por minuto por IP. El login cuenta solo los intentos fallidos.

## Referencias únicas

- **Unicidad** (`referenciaNormalizada`, índice único): no cuentan mayúsculas ni espacios; los guiones sí.
  `af-100` = `AF-100`, `AF 100` = `AF100`, pero `AF-100` ≠ `AF100`.
- **Búsqueda** (`claveBusqueda`, en referencia y equivalencias): solo letras y números. `af100` encuentra `AF-100`.
  `GET /api/productos/obtener?q=af100`.
- Ambos campos los calcula el modelo al guardar con `save()`; no se envían desde el panel.

Antes de una carga masiva:

- `npm run revisar-referencias`: lista productos sin referencia y referencias duplicadas. No cambia nada.
- `npm run indice-referencia`: si no hay duplicados, completa los campos calculados y sincroniza los índices.

## Pruebas y datos de prueba

- `npm test`: pruebas de la API sobre MongoDB en memoria (modo réplica). No toca la base real. Como respaldo
  se puede usar `MONGO_TEST_URI`, pero las pruebas se niegan a correr si la base no termina en `_test`.
- `npm run seed:demo`: crea productos ficticios `DEMO-…`; `npm run seed:demo -- --borrar` los elimina.
  Solo en local: requiere `PERMITIR_DEMO=1` en `.env`, `PUBLIC_URL` en localhost y que `NODE_ENV` no sea `production`.

## Pendiente conocido

- El panel guarda el token en `localStorage` (expuesto si hubiera un XSS). Se revisará junto con el catálogo público (cookie `httpOnly`).

- Las imágenes se guardan en el disco del servidor (`public/uploads`). En hostings como Render ese disco se borra en cada despliegue; se moverán a un almacenamiento externo en la Fase 1.
- El campo `polibretano` conserva su nombre para no romper los datos existentes; se renombrará a `poliuretano` con la migración desde Excel.
