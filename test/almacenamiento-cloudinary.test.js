// Adaptador de Cloudinary sin red: credenciales ficticias y subida simulada.
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { v2: cloudinary } = require('cloudinary');

const RUTA = path.join(__dirname, '..', 'services', 'almacenamiento', 'cloudinary.js');
const CLAVES = ['CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_CARPETA'];

function cargar(env) {
  const antes = Object.fromEntries(CLAVES.map((k) => [k, process.env[k]]));
  for (const k of CLAVES) delete process.env[k];
  Object.assign(process.env, env);
  delete require.cache[RUTA];
  try {
    return require(RUTA);
  } finally {
    for (const k of CLAVES) (antes[k] === undefined ? delete process.env[k] : (process.env[k] = antes[k]));
  }
}

const BASE = 'https://res.cloudinary.com/nube-prueba/image/upload/';

test('sin credenciales o sin carpeta no arranca', () => {
  assert.throws(() => cargar({ CLOUDINARY_CARPETA: 'filtramos-dev' }), /faltan las credenciales/);
  assert.throws(() => cargar({ CLOUDINARY_URL: 'cloudinary://k:s@nube-prueba' }), /CLOUDINARY_CARPETA/);
  assert.throws(() => cargar({ CLOUDINARY_URL: 'https://k:s@nube', CLOUDINARY_CARPETA: 'x' }), /cloudinary:\/\//);
});

test('solo reconoce como propias las fotos de su carpeta y su nube', () => {
  const a = cargar({ CLOUDINARY_URL: 'cloudinary://k:s@nube-prueba', CLOUDINARY_CARPETA: 'filtramos-dev' });
  assert.strictEqual(a.idPublicoDe(`${BASE}v123/filtramos-dev/productos/abc.png`), 'filtramos-dev/productos/abc');
  assert.strictEqual(a.idPublicoDe(`${BASE}filtramos-dev/solicitudes/x.jpg`), 'filtramos-dev/solicitudes/x');
  assert.strictEqual(a.idPublicoDe(`${BASE}v1/canchas/foto.png`), null, 'otra carpeta de la cuenta');
  assert.strictEqual(a.idPublicoDe(`${BASE}v1/filtramos-dev-otra/x.png`), null, 'carpeta con el mismo prefijo');
  assert.strictEqual(a.idPublicoDe(`${BASE}v1/filtramos-dev/../canchas/x.png`), null);
  assert.strictEqual(a.idPublicoDe('https://res.cloudinary.com/otra-nube/image/upload/v1/filtramos-dev/x.png'), null);
  assert.strictEqual(a.idPublicoDe('/uploads/x.png'), null);
});

test('eliminar y leer no tocan nada fuera de la carpeta', async () => {
  const a = cargar({ CLOUDINARY_URL: 'cloudinary://k:s@nube-prueba', CLOUDINARY_CARPETA: 'filtramos-dev' });
  const original = cloudinary.uploader.destroy;
  const borrados = [];
  cloudinary.uploader.destroy = async (id) => { borrados.push(id); return { result: 'ok' }; };
  try {
    await a.eliminar(`${BASE}v1/canchas/foto.png`);
    await a.eliminar(`${BASE}v1/filtramos-dev/productos/abc.png`);
    assert.deepStrictEqual(borrados, ['filtramos-dev/productos/abc']);
    assert.strictEqual(await a.leer(`${BASE}v1/canchas/foto.png`), null);
  } finally {
    cloudinary.uploader.destroy = original;
  }
});

test('guardar sube a <carpeta>/productos o <carpeta>/solicitudes con límite de tamaño', async () => {
  const a = cargar({ CLOUDINARY_URL: 'cloudinary://k:s@nube-prueba', CLOUDINARY_CARPETA: 'filtramos-dev' });
  const original = cloudinary.uploader.upload_stream;
  const opciones = [];
  cloudinary.uploader.upload_stream = (op, cb) => {
    opciones.push(op);
    return { end: () => cb(null, { secure_url: `${BASE}v1/${op.folder}/nuevo.png` }) };
  };
  try {
    assert.strictEqual((await a.guardar({ buffer: Buffer.from('x'), extension: 'png' })).url, `${BASE}v1/filtramos-dev/productos/nuevo.png`);
    await a.guardar({ buffer: Buffer.from('x'), extension: 'png', carpeta: 'solicitudes' });
    assert.deepStrictEqual(opciones.map((o) => o.folder), ['filtramos-dev/productos', 'filtramos-dev/solicitudes']);
    assert.deepStrictEqual(opciones[0].transformation, [{ width: 2000, height: 2000, crop: 'limit' }]);
    assert.throws(() => a.guardar({ buffer: Buffer.from('x'), carpeta: '../otra' }), /no válida/);
  } finally {
    cloudinary.uploader.upload_stream = original;
  }
});
