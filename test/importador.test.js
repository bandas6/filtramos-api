const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const supertest = require('supertest');
const h = require('./helpers');
const { aNumero } = require('../services/importador');

let request;
let admin;
let Product;
let Movimiento;
let Preferencia;

before(async () => {
  request = supertest(await h.iniciar());
  Product = require('../models/productos.models');
  Movimiento = require('../models/movimiento.models');
  Preferencia = require('../models/preferencia.models');
  admin = await h.token(request, 'admin');
});
after(h.detener);
beforeEach(async () => {
  await Product.deleteMany({});
  await Movimiento.collection.deleteMany({});
  await Preferencia.deleteMany({});
});

// Crea un .xlsx en memoria. hojas: { nombre: [[fila1], [fila2], ...] }
async function excel(hojas) {
  const libro = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const ws = libro.addWorksheet(nombre);
    filas.forEach((f) => ws.addRow(f));
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

const ENC = ['Ref.', 'Descripción', 'Tipo de filtro', 'Precio', 'Cant.', 'Equivale', 'Observaciones'];
// Asociación manual (índice de columna -> campo)
const ASOC = { 1: 'referencia', 2: 'descripcion', 3: 'tipo', 4: 'precioPublico', 5: 'stock', 6: 'equivalencias' };

const enviar = (ruta, buffer, campos = {}, t = admin) => {
  let r = request.post(`/api/admin/importar/${ruta}`).set('Authorization', `Bearer ${t}`)
    .attach('archivo', buffer, { filename: 'productos.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  for (const [k, v] of Object.entries(campos)) r = r.field(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  return r;
};
const binario = (r) => r.buffer(true).parse((res, cb) => { const d = []; res.on('data', (c) => d.push(c)); res.on('end', () => cb(null, Buffer.concat(d))); });

test('números en formato colombiano e internacional', () => {
  assert.equal(aNumero('125.000'), 125000);
  assert.equal(aNumero('125.000,50'), 125000.5);
  assert.equal(aNumero('$ 1.200'), 1200);
  assert.equal(aNumero('1,5'), 1.5);
  assert.equal(aNumero('12.5'), 12.5);
  assert.equal(aNumero(3000), 3000);
  assert.ok(Number.isNaN(aNumero('a convenir')));
});

test('analizar sin asociación: hojas, columnas con ejemplo y nada propuesto por parecido', async () => {
  const buf = await excel({ Hoja1: [ENC, ['FT-1', 'Filtro', 'Aire primario', 1000, 5, 'Donaldson P181', 'x']], Otra: [['a']] });
  const r = (await enviar('analizar', buf)).body;
  assert.deepEqual(r.hojas.map((x) => x.nombre), ['Hoja1', 'Otra']);
  assert.equal(r.filaEncabezados, 1);
  assert.deepEqual(r.columnas[0], { indice: 1, encabezado: 'Ref.', ejemplo: 'FT-1' });
  // Solo "Descripción" coincide exactamente con la plantilla; "Ref.", "Precio", "Cant." no se adivinan
  assert.deepEqual(r.asociacion, { 2: 'descripcion' }, 'sin sugerencias por parecido');
  assert.deepEqual(r.origen, { 2: 'plantilla' });
  assert.equal(await Product.countDocuments(), 0);
});

test('los encabezados exactos de la plantilla oficial se reconocen', async () => {
  const buf = await excel({ Productos: [['Referencia', 'Precio público', 'Stock inicial', 'Otra cosa'], ['A-1', 10, 1, 'x']] });
  const r = (await enviar('analizar', buf)).body;
  assert.deepEqual(r.asociacion, { 1: 'referencia', 2: 'precioPublico', 3: 'stock' });
  assert.deepEqual(r.origen, { 1: 'plantilla', 2: 'plantilla', 3: 'plantilla' });
});

test('vista previa con errores típicos; no guarda nada', async () => {
  const buf = await excel({
    Hoja1: [
      ENC,
      ['FT-1', 'Bueno', 'Aire primario', '125.000', 5, 'Donaldson P181; Fleetguard: AF 25', ''],
      [null, 'Sin referencia', 'Prefiltro', 100, 1, null, null],
      ['ft-1', 'Repetida', 'Prefiltro', 100, 1, null, null],
      ['FT-2', 'Precio malo', 'Cabina', 'a convenir', 1, null, null],
      ['FT-3', 'Stock negativo', 'Cabina', 100, -4, null, null],
      ['FT-4', 'Tipo raro', 'Cohete', 100, 1, null, null],
      ['FT-5', 'Un kit', 'Kit de mantenimiento', 100, 1, null, null]
    ]
  });
  const r = (await enviar('analizar', buf, { asociacion: ASOC })).body;
  assert.deepEqual(r.resumen, { total: 7, nuevos: 1, actualizan: 0, conErrores: 6 });
  const porFila = Object.fromEntries(r.errores.map((e) => [e.fila, e.errores.join(' | ')]));
  assert.match(porFila[3], /Falta la referencia/);
  assert.match(porFila[4], /Referencia repetida \(también en la fila 2\)/);
  assert.match(porFila[5], /Precio público: no es un número: "a convenir"/);
  assert.match(porFila[6], /Stock inicial: stock negativo/);
  assert.match(porFila[7], /tipo no reconocido/);
  assert.match(porFila[8], /kits/);
  assert.equal(await Product.countDocuments(), 0);
  assert.equal(await Movimiento.countDocuments(), 0);
});

test('hojas múltiples y encabezados en otra fila', async () => {
  const buf = await excel({
    Portada: [['Inventario Filtramos'], ['generado a mano']],
    Datos: [['Lista de precios 2026'], [], [null, null], ENC, ['FT-9', 'Ok', 'Compresor', 50, 2, null, null]]
  });
  const r1 = (await enviar('analizar', buf, { hoja: 'Datos' })).body;
  assert.equal(r1.hoja, 'Datos');
  assert.equal(r1.filaEncabezados, 4, 'detecta la fila de encabezados');
  const r2 = (await enviar('analizar', buf, { hoja: 'Datos', filaEncabezados: 4, asociacion: ASOC })).body;
  assert.deepEqual(r2.resumen, { total: 1, nuevos: 1, actualizan: 0, conErrores: 0 });
  assert.equal((await enviar('analizar', buf, { hoja: 'NoExiste' })).status, 400);
});

test('asociación inválida: sin referencia o un campo en dos columnas', async () => {
  const buf = await excel({ H: [ENC, ['A', 'b', 'Cabina', 1, 1, null, null]] });
  assert.match((await enviar('analizar', buf, { asociacion: { 2: 'descripcion' } })).body.error, /Referencia/);
  assert.match((await enviar('analizar', buf, { asociacion: { 1: 'referencia', 2: 'descripcion', 7: 'descripcion' } })).body.error, /dos columnas/);
});

test('confirmar: con errores y sin "omitir" no guarda nada', async () => {
  const buf = await excel({ H: [ENC, ['OK-1', 'a', 'Cabina', 100, 3, null, null], ['MAL-1', 'b', 'Cabina', 'x', 1, null, null]] });
  const r = await enviar('confirmar', buf, { asociacion: ASOC });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /1 filas con errores/);
  assert.equal(await Product.countDocuments(), 0);
});

test('confirmar con "omitir": crea productos y el stock entra como carga inicial', async () => {
  const buf = await excel({ H: [ENC,
    ['OK-1', 'Uno', 'Aire primario', '125.000', 3, 'Donaldson P181; AF25', ''],
    ['OK-2', 'Dos', 'Prefiltro', 50, 0, null, null],
    ['MAL-1', 'b', 'Cabina', 'x', 1, null, null]] });
  const r = await enviar('confirmar', buf, { asociacion: ASOC, omitirErrores: true });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.creados, r.body.actualizados, r.body.omitidas, r.body.movimientos], [2, 0, 1, 1]);
  const p = await Product.findOne({ referenciaNormalizada: 'OK-1' }).lean();
  assert.deepEqual([p.tipo, p.precios.publico, p.stock, p.slug], ['aire-primario', 125000, 3, 'ok-1']);
  assert.deepEqual(p.equivalencias, [{ marca: 'Donaldson', referencia: 'P181' }, { referencia: 'AF25' }]);
  assert.deepEqual(p.motivosBorrador, ['sin-foto'], 'importado sin foto queda en borrador');
  const mov = await Movimiento.findOne({ producto: p._id }).lean();
  assert.deepEqual([mov.tipo, mov.motivo, mov.origen, mov.cantidad], ['entrada', 'carga-inicial', 'importacion', 3]);
  assert.match(mov.referenciaExterna, /^IMP-/);
  assert.equal(await Movimiento.countDocuments({ producto: (await Product.findOne({ referenciaNormalizada: 'OK-2' }))._id }), 0, 'stock 0 no crea movimiento');
});

test('actualizar: la referencia decide; celdas vacías no borran; con movimientos el stock entra como ajuste y se avisa', async () => {
  await request.post('/api/admin/productos').set('Authorization', `Bearer ${admin}`)
    .send({ referencia: 'EX-1', tipo: 'cabina', descripcion: 'Original', precios: { publico: 900 } });
  const ex = await Product.findOne({ referenciaNormalizada: 'EX-1' });
  await request.post('/api/admin/movimientos').set('Authorization', `Bearer ${admin}`).send({ producto: ex._id, tipo: 'entrada', cantidad: 10, motivo: 'produccion' });

  const buf = await excel({ H: [ENC, ['ex-1', null, null, 1000, 7, null, null]] });
  const prev = (await enviar('analizar', buf, { asociacion: ASOC })).body;
  assert.deepEqual(prev.resumen, { total: 1, nuevos: 0, actualizan: 1, conErrores: 0 });
  assert.match(prev.avisos[0].aviso, /pasará de 10 a 7 con un ajuste/);

  const r = (await enviar('confirmar', buf, { asociacion: ASOC })).body;
  assert.equal(r.actualizados, 1);
  const p = await Product.findById(ex._id).lean();
  assert.deepEqual([p.referencia, p.descripcion, p.tipo, p.precios.publico, p.stock], ['EX-1', 'Original', 'cabina', 1000, 7]);
  const ajuste = await Movimiento.findOne({ producto: ex._id, tipo: 'ajuste' }).lean();
  assert.deepEqual([ajuste.cantidad, ajuste.motivo], [-3, 'carga-inicial']);
});

test('se recuerda la asociación usada', async () => {
  const buf = await excel({ H: [ENC, ['R-1', 'a', 'Cabina', 10, 1, null, 'nota']] });
  await enviar('confirmar', buf, { asociacion: ASOC });
  const r = (await enviar('analizar', buf)).body;
  assert.deepEqual(r.asociacion, Object.fromEntries(Object.entries(ASOC).map(([k, v]) => [k, v])));
  assert.equal(r.origen[1], 'guardada');
  assert.equal(r.origen[7], 'guardada', '"No importar" también se recuerda');
});

test('fórmulas y texto enriquecido se leen por su valor', async () => {
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet('H');
  ws.addRow(['Referencia', 'Precio público', 'Stock inicial']);
  ws.addRow([{ richText: [{ text: 'RT-' }, { text: '1' }] }, { formula: 'A1', result: 2500 }, 4]);
  const buf = Buffer.from(await libro.xlsx.writeBuffer());
  const r = (await enviar('confirmar', buf, { asociacion: { 1: 'referencia', 2: 'precioPublico', 3: 'stock' } })).body;
  assert.equal(r.creados, 1);
  const p = await Product.findOne({ referenciaNormalizada: 'RT-1' }).lean();
  assert.deepEqual([p.precios.publico, p.stock], [2500, 4]);
});

test('Excel de filas con errores', async () => {
  const buf = await excel({ H: [ENC, ['OK-1', 'a', 'Cabina', 1, 1, null, null], [null, 'sin ref', 'Cabina', 1, 1, null, null]] });
  const res = await binario(enviar('errores', buf, { asociacion: ASOC }));
  assert.equal(res.status, 200);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(res.body);
  const ws = libro.worksheets[0];
  assert.equal(ws.rowCount, 2);
  assert.equal(ws.getRow(1).getCell(1).value, 'Fila');
  assert.equal(ws.getRow(2).getCell(1).value, 3);
  assert.match(String(ws.getRow(2).getCell(ENC.length + 2).value), /Falta la referencia/);
});

test('plantilla oficial y exportación que se puede volver a importar sin cambios', async () => {
  const pl = await binario(request.get('/api/admin/importar/plantilla').set('Authorization', `Bearer ${admin}`));
  const libroP = new ExcelJS.Workbook();
  await libroP.xlsx.load(pl.body);
  assert.deepEqual(libroP.worksheets.map((w) => w.name), ['Productos', 'Instrucciones']);
  assert.equal(libroP.worksheets[0].rowCount, 1, 'sin datos de ejemplo');

  const buf = await excel({ H: [ENC, ['RE-1', 'Uno', 'Compresor', 100, 6, 'Mann: C 25', null]] });
  await enviar('confirmar', buf, { asociacion: ASOC });
  const ex = await binario(request.get('/api/admin/exportar').set('Authorization', `Bearer ${await h.token(request, 'ventas')}`));
  assert.equal(ex.status, 200);
  const r = (await enviar('analizar', ex.body)).body;
  assert.equal(r.asociacion[1], 'referencia');
  const prev = (await enviar('analizar', ex.body, { asociacion: r.asociacion })).body;
  assert.deepEqual(prev.resumen, { total: 1, nuevos: 0, actualizan: 1, conErrores: 0 });
  assert.equal(prev.avisos.length, 0, 'mismo stock: sin ajuste');
});

test('archivo que no es .xlsx o .xlsx falso: 400; solo admin importa', async () => {
  const falso = await request.post('/api/admin/importar/analizar').set('Authorization', `Bearer ${admin}`)
    .attach('archivo', Buffer.from('no soy excel'), { filename: 'x.xlsx' });
  assert.equal(falso.status, 400);
  assert.match(falso.body.error, /\.xlsx/);
  const xls = await request.post('/api/admin/importar/analizar').set('Authorization', `Bearer ${admin}`)
    .attach('archivo', Buffer.from('x'), { filename: 'viejo.xls' });
  assert.equal(xls.status, 400);
  const bodega = await h.token(request, 'bodega');
  const buf = await excel({ H: [ENC] });
  assert.equal((await enviar('analizar', buf, {}, bodega)).status, 403);
  assert.equal((await enviar('confirmar', buf, { asociacion: ASOC }, bodega)).status, 403);
});
