const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');
const h = require('./helpers');

let request;
let admin;
let Product;
let Movimiento;
let modelos;
let inventario;

before(async () => {
  process.env.LIMITE_FORMULARIOS_HORA = '1000'; // el límite se prueba en limites.test.js
  request = supertest(await h.iniciar());
  Product = require('../models/productos.models');
  Movimiento = require('../models/movimiento.models');
  modelos = require('../models/solicitudes.models');
  inventario = require('../services/inventario');
  admin = await h.token(request, 'admin');
});
after(h.detener);
beforeEach(async () => {
  await Product.deleteMany({});
  await Movimiento.collection.deleteMany({});
  await Promise.all([modelos.Pedido, modelos.SolicitudMedida, modelos.Recordatorio, modelos.Contador].map((m) => m.deleteMany({})));
});

const auth = (r, t = admin) => r.set('Authorization', `Bearer ${t}`);
const crear = async (referencia, extra = {}) =>
  (await auth(request.post('/api/admin/productos')).send(h.completo(referencia, extra))).body.producto;
const stock = (id, cantidad) => inventario.registrar({ producto: id, tipo: 'entrada', cantidad, motivo: 'produccion' });

// ---- Lectura pública

test('búsqueda pública: solo publicados y sin datos privados', async () => {
  const p = await crear('PUB-1', { precios: { publico: 1000, distribuidor: 700 }, codigoSiigo: 'SG-1', stockMinimo: 3,
    equivalencias: [{ marca: 'Fleetguard', referencia: 'AF-25' }] });
  await stock(p.uid, 2);
  await crear('BORR-1', { precios: { publico: 0 } });
  const r = await request.get('/api/public/productos');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.productos.map((x) => x.referencia), ['PUB-1']);
  const json = JSON.stringify(r.body);
  for (const privado of ['700', 'SG-1', 'distribuidor', 'stockMinimo', '"stock"', 'reservado', 'codigoSiigo']) {
    assert.equal(json.includes(privado), false, `no debe exponer ${privado}`);
  }
  assert.deepEqual(r.body.productos[0].disponibilidad, { estado: 'ultimas', quedan: 2 });
});

test('búsqueda por equivalencia, máquina, tipo y medidas con tolerancia', async () => {
  await crear('A-1', { equivalencias: [{ marca: 'Donaldson', referencia: 'P181052' }], aplicaciones: ['Kenworth T800'], diametroExterno: 300, alto: 400 });
  await crear('B-1', { tipo: 'cabina', aplicaciones: ['Tractor X'], diametroExterno: 150, alto: 100 });
  const refs = async (q) => (await request.get('/api/public/productos').query(q)).body.productos.map((p) => p.referencia);
  assert.deepEqual(await refs({ q: 'p 181052' }), ['A-1']);
  assert.deepEqual(await refs({ maquina: 'kenworth' }), ['A-1']);
  assert.deepEqual(await refs({ tipo: 'cabina' }), ['B-1']);
  assert.deepEqual(await refs({ diamExt: '303' }), ['A-1'], 'tolerancia ±2 %');
  assert.deepEqual(await refs({ diamExt: '320' }), []);
  assert.deepEqual(await refs({ diamExt: '150', alto: '101' }), ['B-1']);
  assert.deepEqual(await refs({ maquina: '.*' }), [], 'la búsqueda por máquina no acepta expresiones regulares');
});

test('ficha por slug con precios por volumen y relacionados; borrador da 404', async () => {
  const a = await crear('FT-AP-1', { precios: { publico: 100, volumen: [{ desde: 10, precio: 90 }] }, intervaloCambio: '500 horas', alto: 400 });
  const b = await crear('FT-AS-1');
  await crear('KIT-1', { tipo: 'kit', kit: [{ producto: a.uid }, { producto: b.uid }] });
  await crear('BORR', { precios: { publico: null } });
  const r = await request.get('/api/public/productos/ft-ap-1');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.producto.precios.volumen, [{ desde: 10, precio: 90 }]);
  assert.equal(r.body.producto.intervaloCambio, '500 horas');
  assert.deepEqual(r.body.producto.ficha, { alto: 400 });
  assert.deepEqual(r.body.relacionados.map((x) => x.referencia).sort(), ['FT-AS-1', 'KIT-1']);
  assert.equal((await request.get('/api/public/productos/borr')).status, 404);
  assert.equal((await request.get('/api/public/productos/..%2F..%2Fetc')).status, 404);
});

test('kits públicos con disponibilidad calculada por componentes', async () => {
  const a = await crear('C-1');
  const b = await crear('C-2');
  await stock(a.uid, 10);
  await stock(b.uid, 3);
  await crear('KIT-A', { tipo: 'kit', kit: [{ producto: a.uid }, { producto: b.uid }] });
  const k = (await request.get('/api/public/kits')).body.productos[0];
  assert.deepEqual(k.kit, ['C-1', 'C-2']);
  assert.equal(k.disponibilidad.estado, 'disponible');
});

test('destacados: "recientes" sin ventas; "ventas" cuando las hay', async () => {
  const a = await crear('V-1');
  const b = await crear('V-2');
  let r = (await request.get('/api/public/productos/destacados')).body;
  assert.equal(r.criterio, 'recientes');
  await stock(b.uid, 5);
  await inventario.registrar({ producto: b.uid, tipo: 'salida', cantidad: 3, motivo: 'venta' });
  r = (await request.get('/api/public/productos/destacados')).body;
  assert.equal(r.criterio, 'ventas');
  assert.equal(r.productos[0].referencia, 'V-2');
  assert.ok(a);
});

test('sitemap: solo slugs publicados', async () => {
  await crear('S-1');
  await crear('S-2', { publicar: false });
  assert.deepEqual((await request.get('/api/public/sitemap')).body.productos.map((p) => p.slug), ['s-1']);
});

// ---- Formularios

test('solicitud a medida: exige consentimiento y datos; guarda foto y consentimiento', async () => {
  const base = { nombre: 'Ana', whatsapp: '+57 300 000 0000', medidas: 'Ø 300 x 400', cantidad: '2' };
  const enviar = (campos, foto) => {
    let r = request.post('/api/public/solicitudes-medida');
    for (const [k, v] of Object.entries(campos)) r = r.field(k, v);
    if (foto) r = r.attach('foto', h.PNG, { filename: 'filtro.png', contentType: 'image/png' });
    return r;
  };
  assert.match((await enviar(base)).body.error, /tratamiento de datos/);
  assert.equal((await enviar({ ...base, whatsapp: '123', consentimiento: 'true' })).status, 400);
  assert.equal((await enviar({ ...base, medidas: '', consentimiento: 'true' })).status, 400);
  const ok = await enviar({ ...base, consentimiento: 'true' }, true);
  assert.equal(ok.status, 201);
  const s = await modelos.SolicitudMedida.findById(ok.body.id).lean();
  assert.equal(s.whatsapp, '573000000000');
  assert.equal(s.consentimiento.aceptado, true);
  assert.ok(s.consentimiento.texto);
  assert.match(s.foto, /^\/uploads\/solicitudes\//);
  assert.ok(fs.existsSync(path.join(h.carpetaUploads(), s.foto.slice('/uploads/'.length))));
});

test('campo trampa: un bot recibe 201 pero no se guarda nada', async () => {
  const r = await request.post('/api/public/recordatorios').send({ whatsapp: '573000000000', maquina: 'x', consentimiento: true, sitioWeb: 'http://spam' });
  assert.equal(r.status, 201);
  assert.equal(await modelos.Recordatorio.countDocuments(), 0);
});

test('recordatorio: por producto toma su intervalo', async () => {
  await crear('R-1', { intervaloCambio: '500 horas' });
  const r = await request.post('/api/public/recordatorios').send({ whatsapp: '573000000001', slug: 'r-1', consentimiento: true });
  assert.equal(r.status, 201);
  const doc = await modelos.Recordatorio.findById(r.body.id).lean();
  assert.deepEqual([doc.referencia, doc.intervalo], ['R-1', '500 horas']);
});

test('pedido: precio por tramo, total, número consecutivo; productos en borrador se rechazan', async () => {
  await crear('P-1', { precios: { publico: 100, volumen: [{ desde: 10, precio: 90 }, { desde: 50, precio: 80 }] } });
  await crear('P-2', { precios: { publico: 50 } });
  await crear('P-BORR', { publicar: false });
  const datos = { nombre: 'Ana', whatsapp: '573000000000', ciudad: 'Ciudad', consentimiento: true };
  const r1 = await request.post('/api/public/pedidos').send({ ...datos, lineas: [{ slug: 'p-1', cantidad: 12 }, { slug: 'p-2', cantidad: 1 }] });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.numero, 1);
  assert.deepEqual(r1.body.lineas.map((l) => [l.referencia, l.precioUnitario, l.subtotal]).sort(), [['P-1', 90, 1080], ['P-2', 50, 50]]);
  assert.equal(r1.body.totalEstimado, 1130);
  const r2 = await request.post('/api/public/pedidos').send({ ...datos, lineas: [{ slug: 'p-1', cantidad: 60 }] });
  assert.deepEqual([r2.body.numero, r2.body.lineas[0].precioUnitario], [2, 80]);
  assert.equal((await request.post('/api/public/pedidos').send({ ...datos, lineas: [{ slug: 'p-borr', cantidad: 1 }] })).status, 400);
  assert.equal((await request.post('/api/public/pedidos').send({ ...datos, consentimiento: false, lineas: [{ slug: 'p-1', cantidad: 1 }] })).status, 400);
  assert.equal((await request.post('/api/public/pedidos').send({ ...datos, lineas: [] })).status, 400);
});

// ---- Gestión de pedidos (inventario)

async function pedidoDe(lineas) {
  const r = await request.post('/api/public/pedidos').send({ nombre: 'Ana', whatsapp: '573000000000', ciudad: 'C', consentimiento: true, lineas });
  return modelos.Pedido.findOne({ numero: r.body.numero });
}
const estado = (id, nuevo, t) => auth(request.put(`/api/admin/pedidos/${id}/estado`), t).send({ estado: nuevo });
const inv = async (ref) => Product.findOne({ referenciaNormalizada: ref }).lean();

test('pedido: confirmar reserva (kits por componentes), despachar descuenta y libera', async () => {
  const a = await crear('PA-1');
  const b = await crear('PB-1');
  await stock(a.uid, 10);
  await stock(b.uid, 10);
  await crear('PK-1', { tipo: 'kit', kit: [{ producto: a.uid, cantidad: 1 }, { producto: b.uid, cantidad: 2 }] });
  const ped = await pedidoDe([{ slug: 'pk-1', cantidad: 2 }, { slug: 'pa-1', cantidad: 1 }]);

  assert.equal((await estado(ped._id, 'confirmado')).status, 200);
  assert.deepEqual([(await inv('PA-1')).reservado, (await inv('PB-1')).reservado], [3, 4]);
  assert.equal((await estado(ped._id, 'confirmado')).status, 400, 'no se confirma dos veces');

  assert.equal((await estado(ped._id, 'despachado')).status, 200);
  const pa = await inv('PA-1');
  const pb = await inv('PB-1');
  assert.deepEqual([pa.stock, pa.reservado, pb.stock, pb.reservado], [7, 0, 6, 0]);
  assert.equal(await Movimiento.countDocuments({ referenciaExterna: `PED-${ped.numero}` }), 6);
  assert.equal((await estado(ped._id, 'cancelado')).status, 400, 'un despachado no se cancela');
});

test('pedido: cancelar después de confirmar libera la reserva', async () => {
  const a = await crear('PC-1');
  const ped = await pedidoDe([{ slug: 'pc-1', cantidad: 4 }]);
  await estado(ped._id, 'confirmado');
  assert.equal((await inv('PC-1')).reservado, 4, 'se reserva aunque no haya stock (bajo pedido)');
  await estado(ped._id, 'cancelado');
  assert.equal((await inv('PC-1')).reservado, 0);
  assert.ok(a);
});

test('pedido: despachar sin stock falla y no cambia nada', async () => {
  await crear('PD-1');
  const ped = await pedidoDe([{ slug: 'pd-1', cantidad: 2 }]);
  await estado(ped._id, 'confirmado');
  const r = await estado(ped._id, 'despachado');
  assert.equal(r.status, 400);
  assert.match(r.body.error, /stock suficiente/);
  assert.equal((await modelos.Pedido.findById(ped._id)).estado, 'confirmado');
  assert.equal((await inv('PD-1')).reservado, 2);
});

test('roles: bodega consulta pedidos; ventas y admin los gestionan', async () => {
  await crear('PE-1');
  const ped = await pedidoDe([{ slug: 'pe-1', cantidad: 1 }]);
  const bodega = await h.token(request, 'bodega');
  const ventas = await h.token(request, 'ventas');
  assert.equal((await auth(request.get('/api/admin/pedidos'), bodega)).status, 200);
  assert.equal((await estado(ped._id, 'cancelado', bodega)).status, 403);
  assert.equal((await estado(ped._id, 'cancelado', ventas)).status, 200);
  assert.equal((await request.get('/api/admin/pedidos')).status, 401);
});

test('solicitudes a medida y recordatorios: cambio de estado y pendientes', async () => {
  const s = await modelos.SolicitudMedida.create({ nombre: 'A', whatsapp: '573000000000', medidas: 'x', consentimiento: { aceptado: true } });
  assert.equal((await auth(request.get('/api/admin/solicitudes/pendientes'))).body.medida, 1);
  const r = await auth(request.put(`/api/admin/solicitudes-medida/${s._id}`)).send({ estado: 'cotizado', notaInterna: 'Enviada' });
  assert.deepEqual([r.body.solicitud.estado, r.body.solicitud.notaInterna], ['cotizado', 'Enviada']);
  assert.equal((await auth(request.put(`/api/admin/solicitudes-medida/${s._id}`)).send({ estado: 'raro' })).status, 400);
  const rec = await modelos.Recordatorio.create({ whatsapp: '573000000000', maquina: 'M', consentimiento: { aceptado: true } });
  const r2 = await auth(request.put(`/api/admin/recordatorios/${rec._id}`)).send({ estado: 'inactivo', proximaFecha: '2027-01-15' });
  assert.equal(r2.body.recordatorio.estado, 'inactivo');
});
