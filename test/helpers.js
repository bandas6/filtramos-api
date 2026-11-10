// Entorno de pruebas: MongoDB en memoria en modo réplica (permite transacciones).
// Respaldo si no se puede descargar mongod: definir MONGO_TEST_URI con una base cuyo nombre termine en _test.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BASE = 'filtramos_test';
let replSet = null;

async function iniciar() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'x'.repeat(48);
  process.env.CORS_ORIGINS = 'http://localhost:4200';

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
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  const Server = require('../models/server');
  return new Server().app;
}

async function detener() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
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

module.exports = { iniciar, detener, limpiar, crearUsuario, token };
