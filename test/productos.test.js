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

const conToken = (req, t = admin) => req.set('Authorization', `Bearer ${t}`);
const crear = (body, t) => conToken(request.post('/api/admin/productos'), t).send(body);
const editar = (id, body, t) => conToken(request.put(`/api/admin/productos/${id}`), t).send(body);
const listar = (query = {}, t) => conToken(request.get('/api/admin/productos'), t).query(query);

// ---- Referencia: unicidad y búsqueda (etapa A, ahora por las rutas de admin)

test('crear calcula referenciaNormalizada y no la expone', async () => {
  const res = await crear({ referencia: ' af-100 ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.producto.referencia, 'af-100');
  assert.equal(res.body.producto.referenciaNormalizada, undefined);
  assert.equal((await Product.findById(res.body.producto.uid).lean()).referenciaNormalizada, 'AF-100');
});

test('unicidad: mayúsculas y espacios no cuentan, guiones sí', async () => {
  assert.equal((await crear({ referencia: 'AF-100' })).status, 201);
  assert.equal((await crear({ referencia: 'af-100' })).status, 400);
  assert.equal((await crear({ referencia: 'AF 100' })).status, 201);
  assert.equal((await crear({ referencia: 'af100' })).status, 400);
  assert.equal(await Product.countDocuments(), 2);
});

test('el índice único protege aunque se salte el controlador', async () => {
  await new Product({ referencia: 'XZ-1' }).save();
  await assert.rejects(new Product({ referencia: 'xz-1' }).save(), (e) => e.code === 11000);
});

test('editar a una referencia que ya existe responde 400', async () => {
  await crear({ referencia: 'AF-100' });
  const otro = (await crear({ referencia: 'AF-200' })).body.producto;
  const res = await editar(otro.uid, { referencia: ' af-100' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /Ya existe/);
});

test('buscador: referencia, equivalencia (con o sin marca) y aplicación', async () => {
  await crear({ referencia: 'AF-100', equivalencias: [{ marca: 'Fleetguard', referencia: 'P-181' }], aplicaciones: ['Kenworth T800'] });
  await crear({ referencia: 'BX-7' });
  const refs = async (q) => (await listar({ q })).body.productos.map((p) => p.referencia);
  assert.deepEqual(await refs('af100'), ['AF-100']);
  assert.deepEqual(await refs('p181'), ['AF-100']);
  assert.deepEqual(await refs('fleetguard p 181'), ['AF-100']);
  assert.deepEqual(await refs('t800'), ['AF-100']);
  assert.equal((await refs('')).length, 2);
});

// ---- Publicación

test('regla de publicación: borrador con motivos hasta tener tipo, precio y foto', async () => {
  const p = (await crear({ referencia: 'P-1' })).body.producto;
  assert.equal(p.publicado, false);
  assert.deepEqual(p.motivosBorrador, ['sin-tipo', 'sin-precio', 'sin-foto']);

  const r1 = (await editar(p.uid, { tipo: 'compresor', precios: { publico: 5000 } })).body.producto;
  assert.deepEqual(r1.motivosBorrador, ['sin-foto']);

  const r2 = (await editar(p.uid, { imagesUrl: ['/uploads/a.png'] })).body.producto;
  assert.equal(r2.publicado, true);
  assert.deepEqual(r2.motivosBorrador, []);

  const r3 = (await editar(p.uid, { publicar: false })).body.producto;
  assert.equal(r3.publicado, false);
  assert.deepEqual(r3.motivosBorrador, ['oculto']);

  const r4 = (await editar(p.uid, { publicar: true, precios: { publico: null } })).body.producto;
  assert.deepEqual(r4.motivosBorrador, ['sin-precio'], 'vaciar el precio lo devuelve a borrador');
});

test('precio 0 cuenta como sin precio', async () => {
  const p = (await crear(h.completo('P-0', { precios: { publico: 0 } }))).body.producto;
  assert.deepEqual(p.motivosBorrador, ['sin-precio']);
});

// ---- Precios

test('precio de distribuidor: lo ve el admin, nunca la ruta pública', async () => {
  await crear(h.completo('D-1', { precios: { publico: 1000, distribuidor: 700 } }));
  const adminVe = (await listar()).body.productos[0].precios;
  assert.equal(adminVe.distribuidor, 700);
  const publico = await request.get('/api/productos/obtener');
  assert.equal(publico.body.products.length, 1);
  assert.equal(publico.body.products[0].precios.distribuidor, undefined);
  assert.equal(JSON.stringify(publico.body).includes('700'), false);
});

test('la ruta pública solo lista publicados', async () => {
  await crear(h.completo('PUB-1'));
  await crear({ referencia: 'BORR-1' });
  const res = await request.get('/api/productos/obtener');
  assert.deepEqual(res.body.products.map((p) => p.referencia), ['PUB-1']);
});

test('tramos por volumen: se ordenan; repetidos o desde < 2 se rechazan', async () => {
  const p = (await crear(h.completo('V-1', { precios: { publico: 100, volumen: [{ desde: 50, precio: 80 }, { desde: 10, precio: 90 }] } }))).body.producto;
  assert.deepEqual(p.precios.volumen.map((t) => t.desde), [10, 50]);
  assert.equal((await editar(p.uid, { precios: { publico: 100, volumen: [{ desde: 10, precio: 1 }, { desde: 10, precio: 2 }] } })).status, 400);
  assert.equal((await editar(p.uid, { precios: { publico: 100, volumen: [{ desde: 1, precio: 1 }] } })).status, 400);
  assert.equal((await editar(p.uid, { precios: { publico: -5 } })).status, 400);
});

// ---- Slug

test('slug: se crea desde la referencia, es único y no cambia al renombrar', async () => {
  const a = (await crear({ referencia: 'FT-AP 1021/B' })).body.producto;
  assert.equal(a.slug, 'ft-ap-1021-b');
  const b = (await crear({ referencia: 'FT-AP-1021-B' })).body.producto; // otra referencia, mismo slug base
  assert.equal(b.slug, 'ft-ap-1021-b-2');
  const renombrado = (await editar(a.uid, { referencia: 'NUEVA-1' })).body.producto;
  assert.equal(renombrado.slug, 'ft-ap-1021-b');
});

// ---- Kits

test('kit: válido con componentes; el admin ve la referencia de cada componente', async () => {
  const a = (await crear(h.completo('C-1'))).body.producto;
  const b = (await crear(h.completo('C-2'))).body.producto;
  const kit = await crear(h.completo('KIT-1', { tipo: 'kit', kit: [{ producto: a.uid, cantidad: 1 }, { producto: b.uid, cantidad: 2 }] }));
  assert.equal(kit.status, 201);
  assert.equal(kit.body.producto.publicado, true);
  assert.deepEqual(kit.body.producto.kit.map((c) => [c.referencia, c.cantidad]), [['C-1', 1], ['C-2', 2]]);
});

test('kit: sin componentes queda en borrador', async () => {
  const kit = (await crear(h.completo('KIT-0', { tipo: 'kit' }))).body.producto;
  assert.deepEqual(kit.motivosBorrador, ['sin-componentes']);
});

test('kit: no admite otro kit, a sí mismo, repetidos ni componentes inexistentes', async () => {
  const a = (await crear(h.completo('C-1'))).body.producto;
  const k1 = (await crear(h.completo('KIT-1', { tipo: 'kit', kit: [{ producto: a.uid }] }))).body.producto;
  assert.equal((await crear(h.completo('KIT-2', { tipo: 'kit', kit: [{ producto: k1.uid }] }))).status, 400);
  assert.equal((await editar(k1.uid, { kit: [{ producto: k1.uid }] })).status, 400);
  assert.equal((await crear(h.completo('KIT-3', { tipo: 'kit', kit: [{ producto: a.uid }, { producto: a.uid }] }))).status, 400);
  assert.equal((await crear(h.completo('KIT-4', { tipo: 'kit', kit: [{ producto: '6af3478892ea409f52896240' }] }))).status, 400);
  assert.equal((await crear(h.completo('KIT-5', { tipo: 'kit', kit: [{ producto: a.uid, cantidad: 0 }] }))).status, 400);
});

test('un componente de un kit no se puede eliminar ni volver kit', async () => {
  const a = (await crear(h.completo('C-1'))).body.producto;
  await crear(h.completo('KIT-1', { tipo: 'kit', kit: [{ producto: a.uid }] }));
  const borrar = await conToken(request.delete(`/api/admin/productos/${a.uid}`));
  assert.equal(borrar.status, 409);
  assert.match(borrar.body.error, /KIT-1/);
  assert.equal((await editar(a.uid, { tipo: 'kit' })).status, 400);
});

test('si deja de ser kit, se vacían los componentes', async () => {
  const a = (await crear(h.completo('C-1'))).body.producto;
  const k = (await crear(h.completo('KIT-1', { tipo: 'kit', kit: [{ producto: a.uid }] }))).body.producto;
  const r = (await editar(k.uid, { tipo: 'cabina' })).body.producto;
  assert.deepEqual(r.kit, []);
});

// ---- Campos y validación

test('editar: los campos vacíos se borran, los demás se conservan', async () => {
  const p = (await crear({ referencia: 'AF-100', diametroInterno: 50, alto: 120, malla: 'Expandida' })).body.producto;
  const res = await editar(p.uid, { diametroInterno: null, malla: '', alto: 130 });
  assert.equal(res.status, 200);
  assert.equal(res.body.producto.alto, 130);
  assert.equal('diametroInterno' in res.body.producto, false);
  assert.equal('malla' in res.body.producto, false);
});

test('poliuretano reemplaza a polibretano', async () => {
  const p = (await crear({ referencia: 'PU-1', poliuretano: 'Flexible', polibretano: 'viejo' })).body.producto;
  assert.equal(p.poliuretano, 'Flexible');
  assert.equal(p.polibretano, undefined);
});

test('no se pueden escribir campos calculados ni de inventario', async () => {
  const res = await crear({ referencia: 'AF-1', referenciaNormalizada: 'OTRA', publicado: true, stock: 99, reservado: 5, slug: 'x', estado: false });
  const doc = await Product.findById(res.body.producto.uid).lean();
  assert.equal(doc.referenciaNormalizada, 'AF-1');
  assert.equal(doc.publicado, false);
  assert.equal(doc.stock, 0);
  assert.equal(doc.reservado, 0);
  assert.equal(doc.slug, 'af-1');
  assert.equal(doc.estado, true);
});

test('fotos: solo rutas de la biblioteca o https', async () => {
  assert.equal((await crear({ referencia: 'F-1', imagesUrl: ['javascript:alert(1)'] })).status, 400);
  assert.equal((await crear({ referencia: 'F-2', imagesUrl: ['/uploads/../.env'] })).status, 400);
  assert.equal((await crear({ referencia: 'F-3', imagesUrl: ['/uploads/a.png', 'https://res.cloudinary.com/x.jpg'] })).status, 201);
});

test('tipo no válido o número no válido: 400 con mensaje en español', async () => {
  const r1 = await crear({ referencia: 'T-1', tipo: 'cohete' });
  assert.equal(r1.status, 400);
  assert.match(r1.body.error, /Tipo de producto no válido/);
  const r2 = await crear({ referencia: 'T-2', alto: 'alto' });
  assert.equal(r2.status, 400);
});

test('listar: filtros por tipo y estado, y paginación', async () => {
  for (let i = 1; i <= 12; i++) await crear(h.completo(`L-${String(i).padStart(2, '0')}`));
  await crear({ referencia: 'L-BORR', tipo: 'cabina' });
  const p1 = (await listar({ porPagina: 5 })).body;
  assert.deepEqual([p1.total, p1.paginas, p1.productos.length, p1.productos[0].referencia], [13, 3, 5, 'L-01']);
  const p3 = (await listar({ porPagina: 5, pagina: 3 })).body;
  assert.equal(p3.productos.length, 3);
  assert.equal((await listar({ tipo: 'cabina' })).body.total, 1);
  assert.equal((await listar({ estado: 'borrador' })).body.total, 1);
  assert.equal((await listar({ estado: 'publicado' })).body.total, 12);
  assert.equal((await listar({ tipo: 'nave' })).status, 400);
});

test('resumen: publicados, sin foto, sin precio y stock bajo', async () => {
  await crear(h.completo('R-1', { stockMinimo: 0 }));
  await crear({ referencia: 'R-2', tipo: 'cabina', precios: { publico: 10 } });
  await crear({ referencia: 'R-3', tipo: 'cabina', imagesUrl: ['/uploads/x.png'] });
  await Product.updateOne({ referenciaNormalizada: 'R-1' }, { $set: { stock: 50, stockMinimo: 10 } });
  await Product.updateOne({ referenciaNormalizada: 'R-2' }, { $set: { stock: 3, stockMinimo: 10 } });
  const r = (await conToken(request.get('/api/admin/resumen'))).body.resumen;
  assert.deepEqual(r, { publicados: 1, borradores: 2, sinFoto: 1, sinPrecio: 1, stockBajo: 2 });
});

test('roles: lectura para todos con sesión; escritura solo admin', async () => {
  const bodega = await h.token(request, 'bodega');
  const ventas = await h.token(request, 'ventas');
  assert.equal((await request.get('/api/admin/productos')).status, 401);
  assert.equal((await listar({}, bodega)).status, 200);
  assert.equal((await listar({}, ventas)).status, 200);
  assert.equal((await crear({ referencia: 'A-1' }, bodega)).status, 403);
  assert.equal((await crear({ referencia: 'A-1' }, ventas)).status, 403);
});

test('id inválido o inexistente: 404', async () => {
  assert.equal((await editar('xyz', { alto: 1 })).status, 404);
  assert.equal((await editar('6af3478892ea409f52896240', { alto: 1 })).status, 404);
  assert.equal((await conToken(request.get('/api/admin/productos/xyz'))).status, 404);
  assert.equal((await conToken(request.delete('/api/admin/productos/6af3478892ea409f52896240'))).status, 404);
  assert.equal((await request.get('/api/productos/obtenerPorId/xyz')).status, 404);
});
