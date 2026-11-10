const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');
const h = require('./helpers');

let request;
let admin;

before(async () => {
  request = supertest(await h.iniciar());
  admin = await h.token(request, 'admin');
});
after(h.detener);

const subir = (buffer, nombreArchivo, tipo, t = admin) =>
  request.post('/api/admin/imagenes').set('Authorization', `Bearer ${t}`)
    .field('nombre', 'Foto de prueba')
    .attach('imagen', buffer, { filename: nombreArchivo, contentType: tipo });

test('subir PNG real: se guarda en la carpeta configurada y se sirve', async () => {
  const res = await subir(h.PNG, 'foto.png', 'image/png');
  assert.equal(res.status, 201);
  const url = res.body.imagen.imagen;
  assert.match(url, /^\/uploads\/[\w-]+\.png$/);
  assert.ok(fs.existsSync(path.join(h.carpetaUploads(), path.basename(url))), 'el archivo está en UPLOADS_DIR');
  const servida = await request.get(url);
  assert.equal(servida.status, 200);
  assert.equal(servida.body.length, h.PNG.length);
});

test('un archivo que dice ser PNG pero no lo es se rechaza', async () => {
  const res = await subir(Buffer.from('<?php echo 1; ?> esto no es una imagen'), 'falsa.png', 'image/png');
  assert.equal(res.status, 400);
  assert.match(res.body.error, /JPG, PNG o WEBP/);
});

test('extensión no permitida: 400', async () => {
  const res = await subir(Buffer.from('hola'), 'x.txt', 'text/plain');
  assert.equal(res.status, 400);
});

test('sin archivo: 400', async () => {
  const res = await request.post('/api/admin/imagenes').set('Authorization', `Bearer ${admin}`).field('nombre', 'x');
  assert.equal(res.status, 400);
});

test('solo admin sube; cualquier rol con sesión lista', async () => {
  const bodega = await h.token(request, 'bodega');
  assert.equal((await subir(h.PNG, 'foto.png', 'image/png', bodega)).status, 403);
  assert.equal((await request.get('/api/admin/imagenes').set('Authorization', `Bearer ${bodega}`)).status, 200);
});

test('eliminar: bloqueado si un producto la usa; si no, borra registro y archivo', async () => {
  const img = (await subir(h.PNG, 'foto.png', 'image/png')).body.imagen;
  await request.post('/api/admin/productos').set('Authorization', `Bearer ${admin}`)
    .send({ referencia: 'IMG-1', imagesUrl: [img.imagen] });
  const bloqueado = await request.delete(`/api/admin/imagenes/${img.uid}`).set('Authorization', `Bearer ${admin}`);
  assert.equal(bloqueado.status, 409);
  assert.match(bloqueado.body.error, /IMG-1/);

  const libre = (await subir(h.PNG, 'otra.png', 'image/png')).body.imagen;
  const archivo = path.join(h.carpetaUploads(), path.basename(libre.imagen));
  assert.equal((await request.delete(`/api/admin/imagenes/${libre.uid}`).set('Authorization', `Bearer ${admin}`)).status, 200);
  assert.equal(fs.existsSync(archivo), false);
});
