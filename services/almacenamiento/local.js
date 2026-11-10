// Almacenamiento en disco: public/uploads/<carpeta>/<aleatorio>.<ext>, servido por express.static.
// Ojo: en Render el disco se borra en cada despliegue (por eso la etapa E pasa a Cloudinary).
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'public', 'uploads'));
const CARPETAS = ['', 'solicitudes'];

async function guardar({ buffer, extension, carpeta = '' }) {
  if (!CARPETAS.includes(carpeta)) throw new Error('Carpeta de almacenamiento no válida');
  const nombre = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
  const destino = path.join(RAIZ, carpeta);
  await fs.mkdir(destino, { recursive: true });
  await fs.writeFile(path.join(destino, nombre), buffer);
  return { url: `/uploads/${carpeta ? `${carpeta}/` : ''}${nombre}` };
}

// Ruta en disco de una URL /uploads/...; null si no es nuestra o sale de la carpeta
function rutaDe(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const archivo = path.resolve(RAIZ, url.slice('/uploads/'.length));
  return archivo.startsWith(RAIZ + path.sep) ? archivo : null;
}

async function eliminar(url) {
  const archivo = rutaDe(url);
  if (archivo) await fs.unlink(archivo).catch(() => {});
}

// Contenido de la imagen (para incrustarla en el PDF); null si no existe
async function leer(url) {
  const archivo = rutaDe(url);
  return archivo ? fs.readFile(archivo).catch(() => null) : null;
}

module.exports = { guardar, eliminar, leer, RAIZ };
