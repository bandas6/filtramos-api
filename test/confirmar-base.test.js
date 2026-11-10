// Protección de los scripts que escriben: solo con MongoDB en memoria (nunca la base del .env).
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { esSegura } = require('../scripts/confirmar-base');

let replSet;
before(async () => { replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } }); });
after(async () => { await replSet?.stop(); });

// Corre crear-admin sin terminal interactiva contra la base en memoria indicada
function crearAdmin(base, extra = {}) {
  const env = {
    ...process.env, MONGO_DBCNN: replSet.getUri(base), ADMIN_NOMBRE: 'Prueba',
    ADMIN_EMAIL: 'prueba@demo.local', ADMIN_PASSWORD: 'prueba-12345', ...extra
  };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'crear-admin.js')], {
    env,
    input: '', encoding: 'utf8', timeout: 60000
  });
}

async function usuariosEn(base) {
  const c = await mongoose.createConnection(replSet.getUri(base)).asPromise();
  const n = await c.db.collection('usuarios').countDocuments().catch(() => 0);
  await c.close();
  return n;
}

test('bases seguras: solo las que terminan en _dev o _test', () => {
  assert.ok(esSegura('filtramos_dev'));
  assert.ok(esSegura('filtramos_test'));
  assert.ok(!esSegura('filtramos'));
  assert.ok(!esSegura('filtramos_dev_copia'));
});

test('base de producción sin confirmación: no escribe nada', async () => {
  const r = crearAdmin('filtramos', { CONFIRMAR_BASE: undefined });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout, /Base de datos: filtramos/);
  assert.match(r.stderr, /No se hizo nada/);
  assert.strictEqual(await usuariosEn('filtramos'), 0);
});

test('confirmación con un nombre distinto: no escribe nada', async () => {
  const r = crearAdmin('filtramos', { CONFIRMAR_BASE: 'filtramos_dev' });
  assert.notStrictEqual(r.status, 0);
  assert.strictEqual(await usuariosEn('filtramos'), 0);
});

test('confirmación con el nombre exacto: escribe', async () => {
  const r = crearAdmin('filtramos', { CONFIRMAR_BASE: 'filtramos' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(await usuariosEn('filtramos'), 1);
});

test('base _dev: escribe sin pedir confirmación', async () => {
  const r = crearAdmin('otra_dev', { CONFIRMAR_BASE: undefined });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(await usuariosEn('otra_dev'), 1);
});
