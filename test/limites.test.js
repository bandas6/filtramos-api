const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const h = require('./helpers');

let request;

before(async () => {
  process.env.LIMITE_FORMULARIOS_HORA = '3';
  request = supertest(await h.iniciar());
});
after(h.detener);

test('límite de formularios públicos por IP', async () => {
  const estados = [];
  for (let i = 0; i < 4; i++) estados.push((await request.post('/api/public/recordatorios').send({ whatsapp: '1' })).status);
  assert.deepEqual(estados, [400, 400, 400, 429]);
});

test('el límite de formularios no afecta la lectura del catálogo', async () => {
  assert.equal((await request.get('/api/public/productos')).status, 200);
});
