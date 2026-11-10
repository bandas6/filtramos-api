// Almacenamiento en Cloudinary, con la misma interfaz que ./local.js.
// Variables: CLOUDINARY_URL (cloudinary://KEY:SECRET@CLOUD) o el trío CLOUDINARY_CLOUD_NAME,
// CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET; además CLOUDINARY_CARPETA (obligatoria).
// CLOUDINARY_CARPETA aísla a Filtramos dentro de la cuenta: solo se suben, leen y borran
// archivos bajo esa carpeta, aunque la cuenta la compartan otros proyectos.
const { v2: cloudinary } = require('cloudinary');
const local = require('./local');

const CARPETAS = ['', 'solicitudes'];
// Las fotos se guardan como máximo a 2000 px por lado; el sitio pide tamaños menores al mostrarlas
const LIMITE_SUBIDA = [{ width: 2000, height: 2000, crop: 'limit' }];

function configurar() {
  const desdeUrl = (() => {
    const v = String(process.env.CLOUDINARY_URL || '').trim();
    if (!v) return null;
    const u = new URL(v);
    if (u.protocol !== 'cloudinary:') throw new Error('CLOUDINARY_URL debe empezar con cloudinary://');
    return { cloud_name: u.hostname, api_key: decodeURIComponent(u.username), api_secret: decodeURIComponent(u.password) };
  })();
  const config = desdeUrl || {
    cloud_name: String(process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
    api_key: String(process.env.CLOUDINARY_API_KEY || '').trim(),
    api_secret: String(process.env.CLOUDINARY_API_SECRET || '').trim()
  };
  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new Error('ALMACENAMIENTO=cloudinary: faltan las credenciales de Cloudinary (vea .env.example)');
  }
  const carpeta = String(process.env.CLOUDINARY_CARPETA || '').trim().replace(/^\/+|\/+$/g, '');
  if (!/^[\w-]+(\/[\w-]+)*$/.test(carpeta)) {
    throw new Error('ALMACENAMIENTO=cloudinary: defina CLOUDINARY_CARPETA (por ejemplo filtramos-dev)');
  }
  cloudinary.config({ ...config, secure: true });
  return { nube: config.cloud_name, carpeta };
}

const { nube, carpeta: CARPETA } = configurar();
const PREFIJO = `https://res.cloudinary.com/${nube}/image/upload/`;

// public_id de una URL nuestra (dentro de CLOUDINARY_CARPETA); null si es de otro lado
function idPublicoDe(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIJO)) return null;
  const resto = url.slice(PREFIJO.length).split('?')[0].split('/');
  if (/^v\d+$/.test(resto[0])) resto.shift();
  const id = resto.join('/').replace(/\.[a-z0-9]+$/i, '');
  if (id.includes('..') || !id.startsWith(`${CARPETA}/`)) return null;
  return id;
}

function guardar({ buffer, carpeta = '' }) {
  if (!CARPETAS.includes(carpeta)) throw new Error('Carpeta de almacenamiento no válida');
  return new Promise((resolver, rechazar) => {
    cloudinary.uploader.upload_stream({
      folder: `${CARPETA}/${carpeta || 'productos'}`,
      resource_type: 'image',
      unique_filename: true,
      overwrite: false,
      transformation: LIMITE_SUBIDA
    }, (err, r) => (err ? rechazar(new Error(`Cloudinary: ${err.message}`)) : resolver({ url: r.secure_url })))
      .end(buffer);
  });
}

async function eliminar(url) {
  if (!url?.startsWith?.(PREFIJO)) return local.eliminar(url); // fotos viejas en disco
  const id = idPublicoDe(url);
  if (id) await cloudinary.uploader.destroy(id, { resource_type: 'image', invalidate: true }).catch(() => {});
}

async function leer(url) {
  if (!url?.startsWith?.(PREFIJO)) return local.leer(url);
  if (!idPublicoDe(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

// RAIZ local se sigue sirviendo en /uploads para las fotos subidas antes del cambio
module.exports = { guardar, eliminar, leer, RAIZ: local.RAIZ, idPublicoDe, CARPETA };
