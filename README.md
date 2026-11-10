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

## Pendiente conocido

- Las imágenes se guardan en el disco del servidor (`public/uploads`). En hostings como Render ese disco se borra en cada despliegue; se moverán a un almacenamiento externo en la Fase 1.
- El campo `polibretano` conserva su nombre para no romper los datos existentes; se renombrará a `poliuretano` con la migración desde Excel.
