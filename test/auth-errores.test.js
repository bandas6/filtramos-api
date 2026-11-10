const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const h = require('./helpers');

let request;

before(async () => {
  request = supertest(await h.iniciar());
  await h.crearUsuario({ email: 'admin@prueba.test' });
  await h.crearUsuario({ email: 'inactivo@prueba.test', estado: false });
});
after(h.detener);

const login = (email, password) => request.post('/api/auth/login').send({ email, password });

test('login correcto devuelve token y no expone la contraseña', async () => {
  const res = await login('ADMIN@prueba.test', 'clave-de-prueba-123');
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.usuario.password, undefined);
  assert.equal(res.body.usuario.rol, 'admin');
});

test('login incorrecto o usuario inactivo: 401 con el mismo mensaje', async () => {
  const a = await login('admin@prueba.test', 'mala');
  const b = await login('noexiste@prueba.test', 'mala');
  const c = await login('inactivo@prueba.test', 'clave-de-prueba-123');
  assert.deepEqual([a.status, b.status, c.status], [401, 401, 401]);
  assert.equal(a.body.error, b.body.error);
});

test('el límite de login no cuenta los intentos correctos', async () => {
  for (let i = 0; i < 12; i++) {
    assert.equal((await login('admin@prueba.test', 'clave-de-prueba-123')).status, 200, `intento ${i + 1}`);
  }
});

test('token inválido: 401', async () => {
  const res = await request.get('/api/auth/renovar').set('Authorization', 'Bearer abc');
  assert.equal(res.status, 401);
});

test('JSON mal formado: 400', async () => {
  const res = await request.post('/api/auth/login').set('Content-Type', 'application/json').send('{mal');
  assert.equal(res.status, 400);
});

test('subida: archivo que no es imagen responde 400 con mensaje claro', async () => {
  const t = await h.token(request, 'admin');
  const res = await request.post('/api/admin/imagenes')
    .set('Authorization', `Bearer ${t}`)
    .field('nombre', 'x')
    .attach('imagen', Buffer.from('hola'), { filename: 'x.txt', contentType: 'text/plain' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /JPG, PNG o WEBP/);
});

test('el límite de login bloquea al 11.º intento fallido', async () => {
  let ultimo;
  for (let i = 0; i < 11; i++) ultimo = await login('admin@prueba.test', 'mala');
  assert.equal(ultimo.status, 429);
});
