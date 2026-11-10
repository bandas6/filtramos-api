const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const h = require('./helpers');

let request;
let admin;
let Product;

before(async () => {
  request = supertest(await h.iniciar());
  Product = require('../models/productos.models');
  admin = await h.token(request, 'admin');
});
after(h.detener);
beforeEach(() => h.limpiar(Product));

const crear = (body, t = admin) =>
  request.post('/api/productos/crear').set('Authorization', `Bearer ${t}`).send(body);
const editar = (id, body, t = admin) =>
  request.put(`/api/productos/actualizar/${id}`).set('Authorization', `Bearer ${t}`).send(body);

test('crear calcula referenciaNormalizada y no la expone', async () => {
  const res = await crear({ referencia: ' af-100 ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.product.referencia, 'af-100');
  assert.equal(res.body.product.referenciaNormalizada, undefined);
  const doc = await Product.findById(res.body.product.uid).lean();
  assert.equal(doc.referenciaNormalizada, 'AF-100');
});

test('unicidad: mayúsculas y espacios no cuentan, guiones sí', async () => {
  assert.equal((await crear({ referencia: 'AF-100' })).status, 201);
  assert.equal((await crear({ referencia: 'af-100' })).status, 400);
  assert.equal((await crear({ referencia: 'AF 100' })).status, 201);
  assert.equal((await crear({ referencia: 'af100' })).status, 400, 'AF 100 y af100 son la misma');
  assert.equal(await Product.countDocuments(), 2, 'AF-100 y AF100 son distintas');
});

test('el índice único protege aunque se salte la validación del controlador', async () => {
  await new Product({ referencia: 'XZ-1' }).save();
  await assert.rejects(new Product({ referencia: 'xz-1' }).save(), (e) => e.code === 11000);
});

test('editar a una referencia que ya existe responde 400', async () => {
  await crear({ referencia: 'AF-100' });
  const otro = (await crear({ referencia: 'AF-200' })).body.product;
  const res = await editar(otro.uid, { referencia: ' af-100' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Ya existe/);
});

test('buscador ignora guiones, espacios y mayúsculas, también en equivalencias', async () => {
  await crear({ referencia: 'AF-100', equivalencias: ['Fleetguard P-181'] });
  await crear({ referencia: 'BX-7' });
  const buscar = (q) => request.get('/api/productos/obtener').query({ q });
  assert.deepEqual((await buscar('af100')).body.products.map((p) => p.referencia), ['AF-100']);
  assert.deepEqual((await buscar('af 1')).body.products.map((p) => p.referencia), ['AF-100']);
  assert.deepEqual((await buscar('p181')).body.products.map((p) => p.referencia), ['AF-100']);
  assert.equal((await buscar('')).body.products.length, 2);
});

test('editar recalcula la clave de búsqueda', async () => {
  const p = (await crear({ referencia: 'AF-100' })).body.product;
  await editar(p.uid, { referencia: 'QQ-9', equivalencias: ['Marca Z-1'] });
  const buscar = async (q) => (await request.get('/api/productos/obtener').query({ q })).body.products.length;
  assert.equal(await buscar('af100'), 0);
  assert.equal(await buscar('qq9'), 1);
  assert.equal(await buscar('z1'), 1);
});

test('editar: los campos vacíos se borran, los demás se conservan', async () => {
  const p = (await crear({ referencia: 'AF-100', diametroInterno: 50, alto: 120, malla: 'Expandida' })).body.product;
  const res = await editar(p.uid, { diametroInterno: null, malla: '', alto: 130 });
  assert.equal(res.status, 200);
  assert.equal(res.body.product.alto, 130);
  assert.equal('diametroInterno' in res.body.product, false);
  assert.equal('malla' in res.body.product, false);
});

test('editar con referencia vacía responde 400', async () => {
  const p = (await crear({ referencia: 'AF-100' })).body.product;
  assert.equal((await editar(p.uid, { referencia: '  ' })).status, 400);
});

test('id inválido o inexistente responde 404', async () => {
  assert.equal((await editar('xyz', { alto: 1 })).status, 404);
  assert.equal((await editar('6af3478892ea409f52896240', { alto: 1 })).status, 404);
  assert.equal((await request.get('/api/productos/obtenerPorId/xyz')).status, 404);
});

test('escritura: sin sesión 401, con rol bodega o ventas 403', async () => {
  assert.equal((await request.post('/api/productos/crear').send({ referencia: 'A-1' })).status, 401);
  assert.equal((await crear({ referencia: 'A-1' }, await h.token(request, 'bodega'))).status, 403);
  assert.equal((await crear({ referencia: 'A-1' }, await h.token(request, 'ventas'))).status, 403);
});

test('no se pueden escribir campos fuera de la lista ni los calculados', async () => {
  const res = await crear({ referencia: 'AF-1', referenciaNormalizada: 'OTRA', claveBusqueda: ['X'], estado: false });
  const doc = await Product.findById(res.body.product.uid).lean();
  assert.equal(doc.referenciaNormalizada, 'AF-1');
  assert.deepEqual(doc.claveBusqueda, ['AF1']);
  assert.equal(doc.estado, true);
});
