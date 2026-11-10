const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const h = require('./helpers');
const { estadoDe, disponibilidadKit } = require('../utils/disponibilidad');

let request;
let admin;
let Product;
let Movimiento;
let inventario;

before(async () => {
  request = supertest(await h.iniciar());
  Product = require('../models/productos.models');
  Movimiento = require('../models/movimiento.models');
  inventario = require('../services/inventario');
  admin = await h.token(request, 'admin');
});
after(h.detener);
beforeEach(async () => {
  await Product.deleteMany({});
  await Movimiento.collection.deleteMany({}); // directo a la colección: el modelo no permite borrar
});

const auth = (req, t = admin) => req.set('Authorization', `Bearer ${t}`);
const crearProducto = async (referencia, extra = {}) =>
  (await auth(request.post('/api/admin/productos')).send({ referencia, tipo: 'aire-primario', ...extra })).body.producto;
const mover = (body, t) => auth(request.post('/api/admin/movimientos'), t).send(body);
const stockDe = async (id) => (await Product.findById(id).lean()).stock;

// ---- Regla de disponibilidad

test('disponibilidad: disponible, últimas (Quedan N solo si N ≤ 5) y bajo pedido', () => {
  assert.deepEqual(estadoDe(20, 10), { estado: 'disponible', quedan: null });
  assert.deepEqual(estadoDe(10, 10), { estado: 'disponible', quedan: null }, 'igual al mínimo no es "bajo"');
  assert.deepEqual(estadoDe(8, 10), { estado: 'ultimas', quedan: null });
  assert.deepEqual(estadoDe(5, 10), { estado: 'ultimas', quedan: 5 });
  assert.deepEqual(estadoDe(3, 0), { estado: 'disponible', quedan: null }, 'sin mínimo: disponible');
  assert.deepEqual(estadoDe(0, 10), { estado: 'bajo-pedido', quedan: null });
  assert.deepEqual(estadoDe(-2, 0), { estado: 'bajo-pedido', quedan: null }, 'reservado mayor que el stock');
});

test('disponibilidad de kit: mínimo de componentes y peor estado', () => {
  const p = (stock, reservado = 0, stockMinimo = 0) => ({ stock, reservado, stockMinimo });
  assert.deepEqual(disponibilidadKit([{ producto: p(10), cantidad: 1 }, { producto: p(7), cantidad: 2 }]), { disponible: 3, estado: 'disponible', quedan: null });
  assert.equal(disponibilidadKit([{ producto: p(10), cantidad: 1 }, { producto: p(0), cantidad: 1 }]).estado, 'bajo-pedido');
  assert.deepEqual(disponibilidadKit([{ producto: p(20, 0, 30), cantidad: 1 }, { producto: p(50), cantidad: 1 }]), { disponible: 20, estado: 'ultimas', quedan: null });
  assert.equal(disponibilidadKit([]).estado, 'bajo-pedido');
});

// ---- Movimientos

test('entrada suma stock y guarda el movimiento con usuario y resultado', async () => {
  const p = await crearProducto('INV-1');
  const res = await mover({ producto: p.uid, tipo: 'entrada', cantidad: 12, motivo: 'produccion', nota: 'lote 7' });
  assert.equal(res.status, 201);
  assert.equal(res.body.movimiento.cantidad, 12);
  assert.equal(res.body.movimiento.stockResultante, 12);
  assert.match(res.body.movimiento.usuarioNombre, /Prueba admin/);
  assert.equal(await stockDe(p.uid), 12);
});

test('se puede registrar por referencia (normalizada)', async () => {
  const p = await crearProducto('INV-REF-1');
  const res = await mover({ referencia: 'inv-ref-1', tipo: 'entrada', cantidad: 3, motivo: 'produccion' });
  assert.equal(res.status, 201);
  assert.equal(await stockDe(p.uid), 3);
  assert.equal((await mover({ referencia: 'NO-EXISTE', tipo: 'entrada', cantidad: 1, motivo: 'produccion' })).status, 404);
});

test('salida mayor que el stock se rechaza y no deja rastro', async () => {
  const p = await crearProducto('INV-2');
  await mover({ producto: p.uid, tipo: 'entrada', cantidad: 5, motivo: 'produccion' });
  const res = await mover({ producto: p.uid, tipo: 'salida', cantidad: 6, motivo: 'venta' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Stock insuficiente/);
  assert.equal(await stockDe(p.uid), 5);
  assert.equal(await Movimiento.countDocuments({ producto: p.uid }), 1);
});

test('ajuste por conteo físico: registra la diferencia', async () => {
  const p = await crearProducto('INV-3');
  await mover({ producto: p.uid, tipo: 'entrada', cantidad: 10, motivo: 'produccion' });
  const res = await mover({ producto: p.uid, tipo: 'ajuste', stockContado: 7, motivo: 'conteo-fisico' });
  assert.equal(res.status, 201);
  assert.equal(res.body.movimiento.cantidad, -3);
  assert.equal(await stockDe(p.uid), 7);
  assert.equal((await mover({ producto: p.uid, tipo: 'ajuste', stockContado: 7, motivo: 'conteo-fisico' })).status, 400, 'sin diferencia');
  assert.equal((await mover({ producto: p.uid, tipo: 'ajuste', stockContado: -1, motivo: 'conteo-fisico' })).status, 400);
});

test('validaciones: cantidad, motivo según tipo, tipos reservados al sistema y kits', async () => {
  const p = await crearProducto('INV-4');
  assert.equal((await mover({ producto: p.uid, tipo: 'entrada', cantidad: 0, motivo: 'produccion' })).status, 400);
  assert.equal((await mover({ producto: p.uid, tipo: 'entrada', cantidad: 1.5, motivo: 'produccion' })).status, 400);
  assert.equal((await mover({ producto: p.uid, tipo: 'entrada', cantidad: 1, motivo: 'venta' })).status, 400);
  assert.equal((await mover({ producto: p.uid, tipo: 'reserva', cantidad: 1, motivo: 'pedido-web' })).status, 400);
  const kit = await crearProducto('KIT-INV', { tipo: 'kit', kit: [{ producto: p.uid }] });
  const r = await mover({ producto: kit.uid, tipo: 'entrada', cantidad: 1, motivo: 'produccion' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /kits/i);
  assert.equal((await mover({ producto: 'xyz', tipo: 'entrada', cantidad: 1, motivo: 'produccion' })).status, 404);
});

test('roles: admin y bodega registran; ventas solo consulta', async () => {
  const p = await crearProducto('INV-5');
  const bodega = await h.token(request, 'bodega');
  const ventas = await h.token(request, 'ventas');
  assert.equal((await mover({ producto: p.uid, tipo: 'entrada', cantidad: 1, motivo: 'produccion' }, bodega)).status, 201);
  assert.equal((await mover({ producto: p.uid, tipo: 'entrada', cantidad: 1, motivo: 'produccion' }, ventas)).status, 403);
  assert.equal((await auth(request.get('/api/admin/inventario'), ventas)).status, 200);
  assert.equal((await auth(request.get('/api/admin/movimientos'), ventas)).status, 200);
  assert.equal((await request.post('/api/admin/movimientos').send({})).status, 401);
});

test('atomicidad: 20 salidas simultáneas con stock 10 -> exactamente 10 pasan', async () => {
  const p = await crearProducto('INV-6');
  await mover({ producto: p.uid, tipo: 'entrada', cantidad: 10, motivo: 'produccion' });
  const resultados = await Promise.allSettled(Array.from({ length: 20 }, () =>
    inventario.registrar({ producto: p.uid, tipo: 'salida', cantidad: 1, motivo: 'venta' })));
  const ok = resultados.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 10);
  assert.equal(await stockDe(p.uid), 0);
  assert.equal(await Movimiento.countDocuments({ producto: p.uid, tipo: 'salida' }), 10);
  // El stock final coincide con la suma del historial
  const suma = (await Movimiento.find({ producto: p.uid, tipo: { $in: ['entrada', 'salida', 'ajuste'] } })).reduce((s, m) => s + m.cantidad, 0);
  assert.equal(suma, 0);
});

test('si falla el registro del movimiento, el stock no cambia (transacción)', async () => {
  const p = await crearProducto('INV-7');
  await inventario.registrar({ producto: p.uid, tipo: 'reserva', cantidad: 2, motivo: 'pedido-web', origen: 'web', referenciaExterna: 'PED-1' });
  await assert.rejects(
    inventario.registrar({ producto: p.uid, tipo: 'reserva', cantidad: 2, motivo: 'pedido-web', origen: 'web', referenciaExterna: 'PED-1' }),
    (e) => e.status === 409
  );
  assert.equal((await Product.findById(p.uid).lean()).reservado, 2, 'la reserva duplicada no sumó');
});

test('liberación no deja el reservado en negativo', async () => {
  const p = await crearProducto('INV-8');
  await inventario.registrar({ producto: p.uid, tipo: 'reserva', cantidad: 1, motivo: 'pedido-web', origen: 'web' });
  await assert.rejects(inventario.registrar({ producto: p.uid, tipo: 'liberacion', cantidad: 2, motivo: 'pedido-web', origen: 'web' }));
  await inventario.registrar({ producto: p.uid, tipo: 'liberacion', cantidad: 1, motivo: 'pedido-web', origen: 'web' });
  assert.equal((await Product.findById(p.uid).lean()).reservado, 0);
});

test('el historial es inmutable', async () => {
  const p = await crearProducto('INV-9');
  const { body } = await mover({ producto: p.uid, tipo: 'entrada', cantidad: 4, motivo: 'produccion' });
  const id = body.movimiento.uid;
  await assert.rejects(Movimiento.updateOne({ _id: id }, { cantidad: 400 }), /no se editan/);
  await assert.rejects(Movimiento.deleteOne({ _id: id }), /no se editan/);
  await assert.rejects(Movimiento.findByIdAndUpdate(id, { nota: 'x' }), /no se editan/);
  const doc = await Movimiento.findById(id);
  doc.cantidad = 1;
  await assert.rejects(doc.save(), /no se editan/);
  assert.equal((await Movimiento.findById(id).lean()).cantidad, 4);
});

test('un producto con movimientos no se puede eliminar', async () => {
  const p = await crearProducto('INV-10');
  await mover({ producto: p.uid, tipo: 'entrada', cantidad: 1, motivo: 'produccion' });
  const res = await auth(request.delete(`/api/admin/productos/${p.uid}`));
  assert.equal(res.status, 409);
  assert.match(res.body.error, /movimientos/);
});

test('editar el producto no cambia stock ni reservado', async () => {
  const p = await crearProducto('INV-11');
  await mover({ producto: p.uid, tipo: 'entrada', cantidad: 9, motivo: 'produccion' });
  await auth(request.put(`/api/admin/productos/${p.uid}`)).send({ stock: 999, reservado: 50, alto: 10 });
  const doc = await Product.findById(p.uid).lean();
  assert.deepEqual([doc.stock, doc.reservado, doc.alto], [9, 0, 10]);
});

// ---- Pantalla de inventario

test('inventario: indicadores, estados, nivel y kit calculado', async () => {
  const a = await crearProducto('A-1', { stockMinimo: 10 });
  const b = await crearProducto('B-1', { stockMinimo: 10 });
  const c = await crearProducto('C-1', { stockMinimo: 0 });
  await crearProducto('K-1', { tipo: 'kit', kit: [{ producto: a.uid }, { producto: b.uid }] });
  await inventario.registrar({ producto: a.uid, tipo: 'entrada', cantidad: 30, motivo: 'produccion' });
  await inventario.registrar({ producto: b.uid, tipo: 'entrada', cantidad: 4, motivo: 'produccion' });
  await inventario.registrar({ producto: a.uid, tipo: 'reserva', cantidad: 3, motivo: 'pedido-web', origen: 'web' });

  const r = (await auth(request.get('/api/admin/inventario'))).body;
  assert.deepEqual(r.indicadores, { referenciasActivas: 3, bajoMinimo: 1, enCero: 1, unidadesReservadas: 3 });
  const fila = Object.fromEntries(r.productos.map((f) => [f.referencia, f]));
  assert.deepEqual([fila['A-1'].disponible, fila['A-1'].estado, fila['A-1'].nivel], [27, 'disponible', 1]);
  assert.deepEqual([fila['B-1'].disponible, fila['B-1'].estado, fila['B-1'].quedan], [4, 'ultimas', 4]);
  assert.equal(fila['B-1'].nivel, 0.2);
  assert.deepEqual([fila['C-1'].disponible, fila['C-1'].estado], [0, 'bajo-pedido']);
  assert.deepEqual([fila['K-1'].disponible, fila['K-1'].estado, fila['K-1'].esKit], [4, 'ultimas', true]);
  assert.deepEqual(fila['K-1'].componentes, ['A-1', 'B-1']);

  const bajos = (await auth(request.get('/api/admin/inventario').query({ soloBajoMinimo: '1' }))).body.productos.map((f) => f.referencia);
  assert.deepEqual(bajos, ['B-1', 'C-1', 'K-1']);
  const busqueda = (await auth(request.get('/api/admin/inventario').query({ q: 'b1' }))).body.productos.map((f) => f.referencia);
  assert.deepEqual(busqueda, ['B-1']);
});

test('historial paginado, más reciente primero y filtrable por producto', async () => {
  const a = await crearProducto('H-1');
  const b = await crearProducto('H-2');
  for (let i = 1; i <= 3; i++) await mover({ producto: a.uid, tipo: 'entrada', cantidad: i, motivo: 'produccion' });
  await mover({ producto: b.uid, tipo: 'entrada', cantidad: 9, motivo: 'produccion' });
  const todos = (await auth(request.get('/api/admin/movimientos').query({ porPagina: 2 }))).body;
  assert.deepEqual([todos.total, todos.paginas, todos.movimientos[0].referencia], [4, 2, 'H-2']);
  const deA = (await auth(request.get('/api/admin/movimientos').query({ producto: a.uid }))).body.movimientos.map((m) => m.cantidad);
  assert.deepEqual(deA, [3, 2, 1]);
});
