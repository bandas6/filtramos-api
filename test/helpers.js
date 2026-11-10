// Entorno de pruebas: MongoDB en memoria en modo réplica (permite transacciones).
// Respaldo si no se puede descargar mongod: definir MONGO_TEST_URI con una base cuyo nombre termine en _test.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = 'filtramos_test';
let replSet = null;
let uploads = null;

// Imagen PNG real (el logo) para probar subidas
const PNG = fs.readFileSync(path.join(__dirname, '..', 'public', 'uploads', 'logo.png'));

async function iniciar() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'x'.repeat(48);
  process.env.CORS_ORIGINS = 'http://localhost:4200';
  // Las imágenes de prueba van a una carpeta temporal, nunca a public/uploads
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'filtramos-test-'));
  process.env.UPLOADS_DIR = uploads;

  let uri = process.env.MONGO_TEST_URI;
  if (!uri) {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    uri = replSet.getUri(BASE);
  }
  await mongoose.connect(uri);

  // Nunca correr contra una base que no sea de pruebas
  const nombre = mongoose.connection.db.databaseName;
  if (!nombre.endsWith('_test')) {
    await mongoose.disconnect();
    throw new Error(`Pruebas canceladas: la base "${nombre}" no termina en _test`);
  }
  await mongoose.connection.db.dropDatabase();
  for (const archivo of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
    if (archivo.endsWith('.models.js')) require(path.join(__dirname, '..', 'models', archivo));
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  const Server = require('../models/server');
  return new Server().app;
}

async function detener() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
  if (uploads) fs.rmSync(uploads, { recursive: true, force: true });
}

async function limpiar(...modelos) {
  await Promise.all(modelos.map((m) => m.deleteMany({})));
}

async function crearUsuario({ email, rol = 'admin', password = 'clave-de-prueba-123', estado = true }) {
  const Usuario = require('../models/usuario.models');
  return Usuario.create({ nombre: `Prueba ${rol}`, email, rol, estado, password: await bcrypt.hash(password, 4) });
}

// Devuelve el token de sesión de un usuario nuevo con el rol indicado
async function token(request, rol = 'admin') {
  const email = `${rol}-${Date.now()}-${Math.random().toString(36).slice(2)}@prueba.test`;
  await crearUsuario({ email, rol });
  const res = await request.post('/api/auth/login').send({ email, password: 'clave-de-prueba-123' });
  return res.body.token;
}

// Producto completo y publicable (tipo, precio, foto)
const completo = (referencia, extra = {}) => ({
  referencia, tipo: 'aire-primario', precios: { publico: 1000 }, imagesUrl: ['/uploads/foto.png'], ...extra
});

module.exports = { iniciar, detener, limpiar, crearUsuario, token, completo, PNG, carpetaUploads: () => uploads };
