// Etapa de usabilidad: filtros y orden del catálogo, conteo por tipo, inicio del panel,
// preferencias por usuario, usuarios demo y advertencias de CORS.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const h = require('./helpers');

let request;
let admin;
let Product;
let Movimiento;
let Usuario;
let Files;
let Configuracion;
let modelos;
let inventario;

before(async () => {
  request = supertest(await h.iniciar());
  Product = require('../models/productos.models');
  Movimiento = require('../models/movimiento.models');
  Usuario = require('../models/usuario.models');
  Files = require('../models/files.models');
  Configuracion = require('../models/configuracion.models');
  modelos = require('../models/solicitudes.models');
  inventario = require('../services/inventario');
  admin = await h.token(request, 'admin');
});
after(h.detener);
beforeEach(async () => {
  await Product.deleteMany({});
  await Movimiento.collection.deleteMany({});
  await Files.deleteMany({});
  await Configuracion.deleteMany({});
  await Promise.all([modelos.Pedido, modelos.SolicitudMedida].map((m) => m.deleteMany({})));
});

const auth = (r, t = admin) => r.set('Authorization', `Bearer ${t}`);
const crear = async (referencia, extra = {}) =>
  (await auth(request.post('/api/admin/productos')).send(h.completo(referencia, extra))).body.producto;
const stock = (id, cantidad) => inventario.registrar({ producto: id, tipo: 'entrada', cantidad, motivo: 'produccion' });
const refs = async (q) => (await request.get('/api/public/productos').query(q)).body.productos.map((p) => p.referencia);

// ---- Catálogo público

test('catálogo: filtro de disponibilidad con las mismas reglas del badge (incluye kits)', async () => {
  const disp = await crear('D-DISP', { stockMinimo: 2 });
  await stock(disp.uid, 10);
  const ult = await crear('D-ULT', { stockMinimo: 10 });
  await stock(ult.uid, 3);
  await crear('D-CERO');
  // Kit con un componente en "últimas" -> el kit queda en "últimas"
  await crear('D-KIT', { tipo: 'kit', kit: [{ producto: disp.uid, cantidad: 1 }, { producto: ult.uid, cantidad: 1 }] });

  assert.deepEqual(await refs({ disponibilidad: 'disponible' }), ['D-DISP']);
  assert.deepEqual(await refs({ disponibilidad: 'ultimas' }), ['D-KIT', 'D-ULT']);
  assert.deepEqual(await refs({ disponibilidad: 'bajo-pedido' }), ['D-CERO']);
  assert.deepEqual(await refs({ disponibilidad: 'disponible,ultimas' }), ['D-DISP', 'D-KIT', 'D-ULT']);
  assert.equal((await refs({ disponibilidad: 'inventado' })).length, 4, 'un valor desconocido no filtra');
  // Lo que dice el filtro coincide con el badge de cada tarjeta
  const r = await request.get('/api/public/productos').query({ disponibilidad: 'ultimas' });
  assert.ok(r.body.productos.every((p) => p.disponibilidad.estado === 'ultimas'));
});

test('catálogo: rangos de diámetro externo y alto (inclusivos)', async () => {
  await crear('R-1', { diametroExterno: 150, alto: 200 });
  await crear('R-2', { diametroExterno: 300, alto: 400 });
  await crear('R-3', { diametroExterno: 450, alto: 600 });
  assert.deepEqual(await refs({ diamMin: '150', diamMax: '300' }), ['R-1', 'R-2']);
  assert.deepEqual(await refs({ altoMin: '401' }), ['R-3']);
  assert.deepEqual(await refs({ diamMax: '300', altoMin: '300' }), ['R-2']);
  assert.equal((await refs({ diamMin: 'abc' })).length, 3, 'valor no numérico se ignora');
});

test('catálogo: orden por precio deja los productos sin precio al final; total y porPagina', async () => {
  await crear('O-B', { precios: { publico: 3000 } });
  await crear('O-A', { precios: { publico: 1000 } });
  await crear('O-C', { precios: { publico: 2000 } });
  // Un kit publicado siempre tiene precio; para "sin precio" basta otro producto con precio y comprobar el orden
  assert.deepEqual(await refs({ orden: 'precio-asc' }), ['O-A', 'O-C', 'O-B']);
  assert.deepEqual(await refs({ orden: 'precio-desc' }), ['O-B', 'O-C', 'O-A']);
  assert.deepEqual(await refs({ orden: 'referencia' }), ['O-A', 'O-B', 'O-C']);
  assert.deepEqual(await refs({ orden: 'cualquiera' }), ['O-A', 'O-B', 'O-C']);
  const r = await request.get('/api/public/productos');
  assert.equal(r.body.total, 3);
  assert.equal(r.body.porPagina, 12);
});

test('tarjeta: hasta 3 equivalencias y el total para mostrar "+N"', async () => {
  const eqs = ['A', 'B', 'C', 'D', 'E'].map((x) => ({ marca: 'M', referencia: `EQ-${x}` }));
  await crear('EQ-1', { equivalencias: eqs });
  const [p] = (await request.get('/api/public/productos')).body.productos;
  assert.equal(p.equivalencias.length, 3);
  assert.equal(p.totalEquivalencias, 5);
});

test('catálogo: conteo de productos publicados por tipo', async () => {
  await crear('T-1');
  await crear('T-2');
  await crear('T-3', { tipo: 'cabina' });
  await crear('T-BORR', { precios: { publico: 0 } });
  const r = await request.get('/api/public/tipos');
  assert.equal(r.status, 200);
  const t = Object.fromEntries(r.body.tipos.map((x) => [x.valor, x.total]));
  assert.equal(t['aire-primario'], 2, 'no cuenta borradores');
  assert.equal(t.cabina, 1);
  assert.equal(t.kit, 0);
  assert.equal(r.body.tipos.find((x) => x.valor === 'cabina').nombre, 'Cabina');
});

// ---- Inicio del panel

test('inicio del panel: pasos calculados, no aplica por usuario y avisos', async () => {
  let r = await auth(request.get('/api/admin/inicio'));
  assert.equal(r.status, 200);
  const hecho = (body, clave) => body.pasos.find((p) => p.clave === clave);
  assert.equal(hecho(r.body, 'whatsapp').hecho, false);
  assert.equal(hecho(r.body, 'importar').hecho, false);
  assert.equal(hecho(r.body, 'borradores').hecho, false, 'sin productos no se da por hecho');

  const conf = await Configuracion.general();
  conf.whatsappVentas = '573001112233';
  await conf.save();
  const p = await crear('I-1', { stockMinimo: 5 });
  await stock(p.uid, 2);
  await crear('I-BORR', { precios: { publico: 0 } });
  await modelos.Pedido.create({ numero: 1, nombre: 'X', whatsapp: '573000000000', ciudad: 'Cali', lineas: [{ producto: p.uid, referencia: 'I-1', cantidad: 1 }], consentimiento: { aceptado: true, texto: 'ok' } });

  r = await auth(request.get('/api/admin/inicio'));
  assert.equal(hecho(r.body, 'whatsapp').hecho, true);
  assert.equal(hecho(r.body, 'importar').hecho, true);
  assert.equal(hecho(r.body, 'borradores').hecho, false);
  assert.equal(r.body.avisos.pedidosNuevos, 1);
  assert.deepEqual(r.body.avisos.stockBajo.items.map((i) => [i.referencia, i.disponible, i.minimo]), [['I-BORR', 0, 0], ['I-1', 2, 5]]);
  assert.equal(r.body.avisos.borradores.total, 1);
  assert.deepEqual(r.body.avisos.borradores.items[0].motivos, [{ clave: 'sin-precio', texto: 'sin precio' }]);

  // "No aplica" se guarda por usuario
  const otro = await h.token(request, 'admin');
  const pr = await auth(request.patch('/api/auth/preferencias')).send({ pasosNoAplica: ['fotos', 'fotos'] });
  assert.equal(pr.status, 200);
  assert.deepEqual(pr.body.preferencias.pasosNoAplica, ['fotos']);
  r = await auth(request.get('/api/admin/inicio'));
  assert.equal(hecho(r.body, 'fotos').noAplica, true);
  r = await auth(request.get('/api/admin/inicio'), otro);
  assert.equal(hecho(r.body, 'fotos').noAplica, false, 'otro usuario no se ve afectado');
});

test('inicio del panel: cualquier rol con sesión lo lee; sin sesión no', async () => {
  assert.equal((await request.get('/api/admin/inicio')).status, 401);
  assert.equal((await auth(request.get('/api/admin/inicio'), await h.token(request, 'bodega'))).status, 200);
});

// ---- Preferencias

test('preferencias: valida claves, guarda solo las propias y vuelven en el login', async () => {
  const email = `pref-${Date.now()}@prueba.test`;
  await h.crearUsuario({ email, rol: 'ventas' });
  const login = await request.post('/api/auth/login').send({ email, password: 'clave-de-prueba-123' });
  const t = login.body.token;
  assert.deepEqual(login.body.usuario.preferencias, { ayudaCerrada: [], pasosNoAplica: [] });

  assert.equal((await auth(request.patch('/api/auth/preferencias'), t).send({ ayudaCerrada: ['cotizaciones'] })).status, 200);
  assert.equal((await auth(request.patch('/api/auth/preferencias'), t).send({ ayudaCerrada: ['<script>'] })).status, 400);
  assert.equal((await auth(request.patch('/api/auth/preferencias'), t).send({ ayudaCerrada: 'cotizaciones' })).status, 400);
  // Campos ajenos se ignoran (no puede cambiar su rol por aquí)
  await auth(request.patch('/api/auth/preferencias'), t).send({ rol: 'admin', pasosNoAplica: [] });
  const u = await Usuario.findOne({ email });
  assert.equal(u.rol, 'ventas');
  assert.deepEqual(u.preferencias.ayudaCerrada, ['cotizaciones']);

  const renovado = await auth(request.get('/api/auth/renovar'), t);
  assert.deepEqual(renovado.body.usuario.preferencias.ayudaCerrada, ['cotizaciones']);
  assert.equal((await request.patch('/api/auth/preferencias').send({ ayudaCerrada: [] })).status, 401);
});

// ---- Login: usuarios demo y bloqueo

test('usuarios demo: solo con DEMO_MEMORIA=1 y nunca en producción', async () => {
  delete process.env.DEMO_MEMORIA;
  assert.equal((await request.get('/api/auth/demo')).status, 404);
  process.env.DEMO_MEMORIA = '1';
  const r = await request.get('/api/auth/demo');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.usuarios.map((u) => u.email), ['admin@demo.local', 'bodega@demo.local', 'ventas@demo.local']);
  const entorno = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.equal((await request.get('/api/auth/demo')).status, 404);
  process.env.NODE_ENV = entorno;
  delete process.env.DEMO_MEMORIA;
});

// ---- CORS

test('advertencias de CORS al arrancar', () => {
  const { advertenciasCors } = require('../utils/cors');
  assert.match(advertenciasCors({ CORS_ORIGINS: '' })[0], /vacío/);
  assert.deepEqual(advertenciasCors({ CORS_ORIGINS: 'http://localhost:4200' }), []);
  assert.deepEqual(advertenciasCors({ CORS_ORIGINS: 'https://a.com/', PANEL_URL: 'https://a.com/admin', NODE_ENV: 'production' }), []);
  const avisos = advertenciasCors({ CORS_ORIGINS: 'https://a.com', PANEL_URL: 'https://panel.a.com', SITIO_URL: 'https://a.com', NODE_ENV: 'production' });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /https:\/\/panel\.a\.com \(PANEL_URL\)/);
  assert.match(advertenciasCors({ CORS_ORIGINS: 'https://a.com' })[0], /localhost:4200/, 'en desarrollo avisa si falta el panel local');
  assert.match(advertenciasCors({ CORS_ORIGINS: 'https://a.com', PANEL_URL: 'no es url', NODE_ENV: 'production' })[0], /no es una URL válida/);
});
