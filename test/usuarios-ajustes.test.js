const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const h = require('./helpers');

let request;
let Usuario;

before(async () => {
  request = supertest(await h.iniciar());
  Usuario = require('../models/usuario.models');
});
after(h.detener);

const auth = (req, t) => req.set('Authorization', `Bearer ${t}`);
const login = async (email, password = 'clave-de-prueba-123') =>
  (await request.post('/api/auth/login').send({ email, password })).body.token;

// ---- Usuarios

test('usuarios: solo admin', async () => {
  const bodega = await h.token(request, 'bodega');
  assert.equal((await auth(request.get('/api/admin/usuarios'), bodega)).status, 403);
  assert.equal((await auth(request.post('/api/admin/usuarios'), bodega).send({})).status, 403);
});

test('crear usuario: valida datos y no repite correo', async () => {
  const admin = await h.token(request, 'admin');
  const crear = (body) => auth(request.post('/api/admin/usuarios'), admin).send(body);
  const base = { nombre: 'Ana', email: 'ana@prueba.test', rol: 'bodega', password: 'una-clave-larga' };
  assert.equal((await crear({ ...base, password: 'corta' })).status, 400);
  assert.equal((await crear({ ...base, email: 'no-es-correo' })).status, 400);
  assert.equal((await crear({ ...base, rol: 'jefe' })).status, 400);
  assert.equal((await crear({ ...base, nombre: ' ' })).status, 400);
  const ok = await crear(base);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.usuario.password, undefined);
  assert.equal((await crear({ ...base, email: 'ANA@prueba.test' })).status, 400);
  assert.ok(await login('ana@prueba.test', 'una-clave-larga'));
});

test('nadie se desactiva a sí mismo', async () => {
  await h.crearUsuario({ email: 'yo@prueba.test' });
  const yo = await login('yo@prueba.test');
  const id = (await Usuario.findOne({ email: 'yo@prueba.test' }))._id;
  const res = await auth(request.put(`/api/admin/usuarios/${id}`), yo).send({ estado: false });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /sí mismo/);
});

test('no se puede quitar el último admin (ni por rol ni desactivándolo)', async () => {
  await Usuario.deleteMany({});
  await h.crearUsuario({ email: 'unico@prueba.test' });
  const unico = await login('unico@prueba.test');
  const id = (await Usuario.findOne({ email: 'unico@prueba.test' }))._id;
  const r = await auth(request.put(`/api/admin/usuarios/${id}`), unico).send({ rol: 'ventas' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /al menos un administrador/);

  // Con un segundo admin sí se puede
  await h.crearUsuario({ email: 'otro@prueba.test' });
  const otro = await login('otro@prueba.test');
  assert.equal((await auth(request.put(`/api/admin/usuarios/${id}`), unico).send({ rol: 'ventas' })).status, 200);
  // Y ahora "otro" es el último: nadie puede desactivarlo
  const idOtro = (await Usuario.findOne({ email: 'otro@prueba.test' }))._id;
  await h.crearUsuario({ email: 'tercero@prueba.test', rol: 'bodega' });
  assert.equal((await auth(request.put(`/api/admin/usuarios/${idOtro}`), otro).send({ rol: 'bodega' })).status, 400);
});

test('desactivar: ya no inicia sesión y su token deja de valer', async () => {
  const admin = await h.token(request, 'admin');
  await h.crearUsuario({ email: 'baja@prueba.test', rol: 'ventas' });
  const suToken = await login('baja@prueba.test');
  const id = (await Usuario.findOne({ email: 'baja@prueba.test' }))._id;
  assert.equal((await auth(request.put(`/api/admin/usuarios/${id}`), admin).send({ estado: false })).status, 200);
  assert.equal((await auth(request.get('/api/auth/renovar'), suToken)).status, 401);
  assert.equal(await login('baja@prueba.test'), undefined);
});

test('cambiar rol se aplica de inmediato', async () => {
  const admin = await h.token(request, 'admin');
  await h.crearUsuario({ email: 'rol@prueba.test', rol: 'ventas' });
  const suToken = await login('rol@prueba.test');
  const id = (await Usuario.findOne({ email: 'rol@prueba.test' }))._id;
  assert.equal((await auth(request.post('/api/admin/productos'), suToken).send({ referencia: 'Z-1' })).status, 403);
  await auth(request.put(`/api/admin/usuarios/${id}`), admin).send({ rol: 'admin' });
  assert.equal((await auth(request.post('/api/admin/productos'), suToken).send({ referencia: 'Z-1' })).status, 201);
});

test('restablecer contraseña: valida largo, cierra sesiones viejas y la nueva funciona', async () => {
  const admin = await h.token(request, 'admin');
  await h.crearUsuario({ email: 'olvido@prueba.test', rol: 'bodega' });
  const viejo = await login('olvido@prueba.test');
  const id = (await Usuario.findOne({ email: 'olvido@prueba.test' }))._id;
  const url = `/api/admin/usuarios/${id}/password`;
  assert.equal((await auth(request.post(url), admin).send({ password: 'corta' })).status, 400);

  await new Promise((r) => setTimeout(r, 1100)); // el token viejo debe ser de un segundo anterior
  const res = await auth(request.post(url), admin).send({ password: 'nueva-clave-segura' });
  assert.equal(res.status, 200);
  assert.equal(res.body.cerroSesion, false);
  assert.equal((await auth(request.get('/api/auth/renovar'), viejo)).status, 401);
  assert.equal(await login('olvido@prueba.test'), undefined);
  assert.ok(await login('olvido@prueba.test', 'nueva-clave-segura'));
});

test('usuario inexistente o id inválido: 404', async () => {
  const admin = await h.token(request, 'admin');
  assert.equal((await auth(request.put('/api/admin/usuarios/xyz'), admin).send({})).status, 404);
  assert.equal((await auth(request.post('/api/admin/usuarios/6af3478892ea409f52896240/password'), admin).send({ password: 'una-clave-larga' })).status, 404);
});

// ---- Ajustes

test('ajustes: falta el WhatsApp hasta que se guarda; valida formato', async () => {
  const admin = await h.token(request, 'admin');
  const bodega = await h.token(request, 'bodega');
  const estado = async () => (await auth(request.get('/api/admin/ajustes/estado'), bodega)).body.faltantes;
  assert.deepEqual(await estado(), ['whatsappVentas']);

  const mal = await auth(request.put('/api/admin/ajustes'), admin).send({ whatsappVentas: '300-abc' });
  assert.equal(mal.status, 400);
  const ok = await auth(request.put('/api/admin/ajustes'), admin).send({ whatsappVentas: '+57 300 000 0000', tiempoDespacho: '24–48 h' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.valores.whatsappVentas, '573000000000');
  assert.deepEqual(await estado(), []);
});

test('ajustes: solo admin los ve y edita; bodega solo el estado', async () => {
  const bodega = await h.token(request, 'bodega');
  assert.equal((await auth(request.get('/api/admin/ajustes'), bodega)).status, 403);
  assert.equal((await auth(request.put('/api/admin/ajustes'), bodega).send({ ciudad: 'X' })).status, 403);
});

test('ajustes públicos: solo los públicos con valor; los privados nunca', async () => {
  const admin = await h.token(request, 'admin');
  await auth(request.put('/api/admin/ajustes'), admin).send({ correoAvisos: 'interno@prueba.test', ciudad: 'Ciudad Demo', direccion: '' });
  const res = await request.get('/api/public/ajustes');
  assert.equal(res.status, 200);
  assert.equal(res.body.ajustes.ciudad, 'Ciudad Demo');
  assert.equal('correoAvisos' in res.body.ajustes, false);
  assert.equal('direccion' in res.body.ajustes, false);
  assert.equal(JSON.stringify(res.body).includes('interno@'), false);
});
