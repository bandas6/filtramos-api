// Importador de productos desde Excel (.xlsx) con exceljs.
// Flujo sin estado: analizar (no guarda nada) -> confirmar (vuelve a validar el mismo archivo y aplica
// todo en una transacción). La asociación de columnas la hace la persona; el sistema solo reconoce
// los encabezados de la plantilla oficial y recuerda la última asociación usada.
// Las sugerencias por nombre de columna esperan el Excel real de la administradora (etapa D).
const ExcelJS = require('exceljs');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Product = require('../models/productos.models');
const Movimiento = require('../models/movimiento.models');
const Preferencia = require('../models/preferencia.models');
const { registrar } = require('./inventario');
const { slugLibre } = require('./catalogo');
const { normalizarReferencia } = require('../utils/referencias');
const { TIPOS } = require('../utils/catalogo');

const MAX_FILAS = 5000;
const CLAVE_ASOCIACION = 'importador.asociacion';

class ErrorImportacion extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Campos que se pueden importar. "etiqueta" es también el encabezado de la plantilla oficial.
const CAMPOS = [
  { clave: 'referencia', etiqueta: 'Referencia', tipo: 'texto', requerido: true, ayuda: 'Llave: si ya existe se actualiza; si no, se crea.' },
  { clave: 'tipo', etiqueta: 'Tipo', tipo: 'tipo', ayuda: `Uno de: ${Object.values(TIPOS).filter((t) => !t.startsWith('Kit')).join(', ')}.` },
  { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto' },
  { clave: 'equivalencias', etiqueta: 'Equivalencias', tipo: 'equivalencias', ayuda: 'Separadas por coma o punto y coma. "Marca Referencia" o "Marca: Referencia".' },
  { clave: 'aplicaciones', etiqueta: 'Aplicaciones', tipo: 'lista', separador: /[;\n]/, ayuda: 'Separadas por punto y coma.' },
  { clave: 'precioPublico', etiqueta: 'Precio público', tipo: 'precio', ayuda: 'Número, sin texto. Ej.: 125000' },
  { clave: 'precioDistribuidor', etiqueta: 'Precio distribuidor', tipo: 'precio' },
  { clave: 'stock', etiqueta: 'Stock inicial', tipo: 'stock', ayuda: 'Entero mayor o igual a 0. Entra como movimiento de carga inicial.' },
  { clave: 'stockMinimo', etiqueta: 'Stock mínimo', tipo: 'entero' },
  { clave: 'codigoSiigo', etiqueta: 'Código Siigo', tipo: 'texto' },
  { clave: 'diametroExterno', etiqueta: 'Diámetro externo (mm)', tipo: 'numero' },
  { clave: 'diametroInterno', etiqueta: 'Diámetro interno (mm)', tipo: 'numero' },
  { clave: 'alto', etiqueta: 'Alto (mm)', tipo: 'numero' },
  { clave: 'alturaPliegue', etiqueta: 'Altura de pliegue (mm)', tipo: 'numero' },
  { clave: 'cortePapel', etiqueta: 'Corte de papel (mm)', tipo: 'numero' },
  { clave: 'cantidadPliegues', etiqueta: 'Cantidad de pliegues', tipo: 'entero' },
  { clave: 'malla', etiqueta: 'Malla', tipo: 'texto' },
  { clave: 'longitudMallaExterna', etiqueta: 'Longitud malla externa', tipo: 'texto' },
  { clave: 'longitudMallaInterna', etiqueta: 'Longitud malla interna', tipo: 'texto' },
  { clave: 'poliuretano', etiqueta: 'Poliuretano', tipo: 'texto' },
  { clave: 'anillo', etiqueta: 'Anillo', tipo: 'texto' },
  { clave: 'tapa', etiqueta: 'Tapa', tipo: 'texto' },
  { clave: 'papeles', etiqueta: 'Papeles', tipo: 'lista', separador: /[,;\n]/ },
  { clave: 'intervaloCambio', etiqueta: 'Intervalo de cambio', tipo: 'texto' }
];
const POR_CLAVE = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ---------- Lectura del archivo

async function leerLibro(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new ErrorImportacion('El archivo debe ser un Excel .xlsx (si es .xls, ábralo en Excel y guárdelo como .xlsx)');
  }
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw new ErrorImportacion('No se pudo leer el archivo. ¿Es un .xlsx válido?');
  }
  if (!libro.worksheets.length) throw new ErrorImportacion('El archivo no tiene hojas');
  return libro;
}

// Valor visible de una celda: resultado de fórmulas, texto enriquecido, hipervínculos, fechas
function valorCelda(celda) {
  let v = celda?.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('result' in v) v = v.result;
    else if (Array.isArray(v.richText)) v = v.richText.map((r) => r.text).join('');
    else if ('text' in v) v = v.text;
    else if ('error' in v) return { error: v.error };
  }
  if (typeof v === 'string') {
    v = v.trim();
    return v === '' ? null : v;
  }
  return v;
}

const filaComoLista = (hoja, n, ancho) => Array.from({ length: ancho }, (_, i) => valorCelda(hoja.getRow(n).getCell(i + 1)));
const filaVacia = (valores) => valores.every((v) => v === null);

// Primera fila (de las 20 primeras) con al menos dos celdas de texto: candidata a encabezados
function detectarFilaEncabezados(hoja) {
  const ancho = hoja.columnCount;
  for (let n = 1; n <= Math.min(hoja.rowCount, 20); n++) {
    const textos = filaComoLista(hoja, n, ancho).filter((v) => typeof v === 'string');
    if (textos.length >= 2) return n;
  }
  return 1;
}

function elegirHoja(libro, nombre) {
  const hoja = nombre ? libro.getWorksheet(nombre) : libro.worksheets.find((h) => h.rowCount > 0) || libro.worksheets[0];
  if (!hoja) throw new ErrorImportacion(`No existe la hoja "${nombre}"`);
  return hoja;
}

function columnasDe(hoja, filaEncabezados) {
  const ancho = hoja.columnCount;
  const encabezados = filaComoLista(hoja, filaEncabezados, ancho);
  // Ejemplo: primer valor no vacío debajo del encabezado
  const ejemplos = Array(ancho).fill(null);
  for (let n = filaEncabezados + 1; n <= Math.min(hoja.rowCount, filaEncabezados + 30); n++) {
    filaComoLista(hoja, n, ancho).forEach((v, i) => { if (ejemplos[i] === null && v !== null) ejemplos[i] = v; });
  }
  return encabezados
    .map((e, i) => ({ indice: i + 1, encabezado: e === null ? `Columna ${i + 1}` : String(e), ejemplo: ejemplos[i] instanceof Date ? ejemplos[i].toISOString().slice(0, 10) : ejemplos[i] }))
    .filter((c, i) => encabezados[i] !== null || ejemplos[i] !== null);
}

// ---------- Conversión de valores

// Números en formato colombiano o internacional: 125000 · 125.000 · 125.000,50 · 1,5 · $ 1.200
function aNumero(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let s = v.replace(/[$\s]/g, '').replace(/COP/i, '');
  if (!/^-?[\d.,]+$/.test(s)) return NaN;
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return Number(s);
}

const TIPO_POR_TEXTO = Object.fromEntries(Object.entries(TIPOS).flatMap(([valor, nombre]) => [[sinTildes(valor), valor], [sinTildes(nombre), valor]]));

function convertir(campo, v) {
  if (v && typeof v === 'object' && 'error' in v) throw new Error('la celda tiene un error de fórmula');
  switch (campo.tipo) {
    case 'texto': return String(v instanceof Date ? v.toISOString().slice(0, 10) : v).trim();
    case 'tipo': {
      const t = TIPO_POR_TEXTO[sinTildes(v).replace(/-/g, ' ')] || TIPO_POR_TEXTO[sinTildes(v)];
      if (!t) throw new Error(`tipo no reconocido: "${v}"`);
      if (t === 'kit') throw new Error('los kits se arman en el panel, no se importan');
      return t;
    }
    case 'precio':
    case 'numero': {
      const n = aNumero(v);
      if (!Number.isFinite(n)) throw new Error(`no es un número: "${v}"`);
      if (n < 0) throw new Error('no puede ser negativo');
      return n;
    }
    case 'entero':
    case 'stock': {
      const n = aNumero(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`debe ser un número entero: "${v}"`);
      if (n < 0) throw new Error(campo.tipo === 'stock' ? 'stock negativo' : 'no puede ser negativo');
      return n;
    }
    case 'lista': return String(v).split(campo.separador).map((x) => x.trim()).filter(Boolean);
    case 'equivalencias':
      return String(v).split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
        const dos = x.indexOf(':');
        if (dos > 0) return { marca: x.slice(0, dos).trim(), referencia: x.slice(dos + 1).trim() };
        const esp = x.indexOf(' ');
        return esp > 0 ? { marca: x.slice(0, esp), referencia: x.slice(esp + 1).trim() } : { referencia: x };
      }).filter((e) => e.referencia);
    default: return v;
  }
}

// ---------- Asociación de columnas

// asociacion: { [indiceColumna]: claveCampo }. Valida que no haya campos repetidos y que esté la referencia.
function validarAsociacion(asociacion, columnas) {
  const indices = new Set(columnas.map((c) => String(c.indice)));
  const limpia = {};
  const usados = new Map();
  for (const [indice, clave] of Object.entries(asociacion || {})) {
    if (!clave) continue;
    if (!indices.has(String(indice))) throw new ErrorImportacion(`La columna ${indice} no existe en la hoja`);
    if (!POR_CLAVE[clave]) throw new ErrorImportacion(`Campo desconocido: ${clave}`);
    if (usados.has(clave)) throw new ErrorImportacion(`"${POR_CLAVE[clave].etiqueta}" está asociado a dos columnas`);
    usados.set(clave, indice);
    limpia[indice] = clave;
  }
  if (!usados.has('referencia')) throw new ErrorImportacion('Asocie una columna a "Referencia": es la llave de cada producto');
  return limpia;
}

// Propuesta inicial: la última asociación guardada (por texto de encabezado) o el encabezado exacto de la plantilla.
// No es una sugerencia por parecido: solo coincidencias exactas.
async function asociacionInicial(columnas) {
  const guardada = (await Preferencia.findOne({ clave: CLAVE_ASOCIACION }).lean())?.valor || {};
  const plantilla = Object.fromEntries(CAMPOS.map((c) => [sinTildes(c.etiqueta), c.clave]));
  const resultado = {};
  const origen = {};
  const usados = new Set();
  for (const c of columnas) {
    const k = sinTildes(c.encabezado);
    const clave = guardada[k] ?? plantilla[k];
    if (clave && POR_CLAVE[clave] && !usados.has(clave)) {
      resultado[c.indice] = clave;
      origen[c.indice] = guardada[k] ? 'guardada' : 'plantilla';
      usados.add(clave);
    } else if (guardada[k] === null) {
      origen[c.indice] = 'guardada'; // la última vez se eligió "No importar"
    }
  }
  return { asociacion: resultado, origen };
}

async function guardarAsociacion(asociacion, columnas, usuario, session = null) {
  const valor = {};
  for (const c of columnas) valor[sinTildes(c.encabezado)] = asociacion[c.indice] || null;
  await Preferencia.updateOne({ clave: CLAVE_ASOCIACION }, { $set: { valor, actualizadoPor: usuario?._id } }, { upsert: true, session });
}

// ---------- Validación de filas

function leerFilas(hoja, filaEncabezados, asociacion) {
  const ancho = hoja.columnCount;
  const filas = [];
  const vistas = new Map(); // referencia normalizada -> primera fila
  if (hoja.rowCount - filaEncabezados > MAX_FILAS) throw new ErrorImportacion(`Máximo ${MAX_FILAS} filas por archivo`);

  for (let n = filaEncabezados + 1; n <= hoja.rowCount; n++) {
    const valores = filaComoLista(hoja, n, ancho);
    if (filaVacia(valores)) continue;
    const datos = {};
    const errores = [];
    for (const [indice, clave] of Object.entries(asociacion)) {
      const v = valores[Number(indice) - 1];
      if (v === null || v === undefined) continue;
      const campo = POR_CLAVE[clave];
      try {
        datos[clave] = convertir(campo, v);
      } catch (e) {
        errores.push(`${campo.etiqueta}: ${e.message}`);
      }
    }
    if (!datos.referencia) {
      if (!errores.some((e) => e.startsWith('Referencia'))) errores.unshift('Falta la referencia');
    } else {
      const norm = normalizarReferencia(datos.referencia);
      if (vistas.has(norm)) errores.push(`Referencia repetida (también en la fila ${vistas.get(norm)})`);
      else vistas.set(norm, n);
      datos.referenciaNormalizada = norm;
    }
    filas.push({ fila: n, datos, errores, valores });
  }
  return filas;
}

// Decide qué pasa con cada fila válida: crear o actualizar, y cómo entra el stock
async function planificar(filas, session = null) {
  const validas = filas.filter((f) => !f.errores.length);
  const normas = validas.map((f) => f.datos.referenciaNormalizada);
  const existentes = await Product.find({ referenciaNormalizada: { $in: normas } }, { referenciaNormalizada: 1, stock: 1, tipo: 1, estado: 1, referencia: 1 }).session(session).lean();
  const porNorma = new Map(existentes.map((p) => [p.referenciaNormalizada, p]));
  const conMovimientos = new Set((await Movimiento.distinct('producto', { producto: { $in: existentes.map((p) => p._id) } }).session(session)).map(String));

  for (const f of validas) {
    const existente = porNorma.get(f.datos.referenciaNormalizada);
    f.accion = existente ? 'actualizar' : 'crear';
    f.existente = existente || null;
    if (existente?.tipo === 'kit') {
      f.errores.push('Esa referencia es un kit: los kits se editan en el panel');
      continue;
    }
    if (existente && !existente.estado) {
      f.errores.push('Esa referencia existe pero está dada de baja');
      continue;
    }
    if ('stock' in f.datos) {
      const actual = existente?.stock || 0;
      if (!existente || !conMovimientos.has(String(existente._id))) {
        f.stock = f.datos.stock > 0 ? { tipo: 'entrada', cantidad: f.datos.stock } : null;
      } else if (f.datos.stock !== actual) {
        f.stock = { tipo: 'ajuste', stockContado: f.datos.stock };
        f.aviso = `${existente.referencia} ya tiene movimientos: el stock pasará de ${actual} a ${f.datos.stock} con un ajuste`;
      }
    }
  }
  return filas;
}

const resumen = (filas) => ({
  total: filas.length,
  nuevos: filas.filter((f) => !f.errores.length && f.accion === 'crear').length,
  actualizan: filas.filter((f) => !f.errores.length && f.accion === 'actualizar').length,
  conErrores: filas.filter((f) => f.errores.length).length
});

// ---------- Operaciones públicas

async function prepararHoja(buffer, { hoja: nombreHoja, filaEncabezados } = {}) {
  const libro = await leerLibro(buffer);
  const hoja = elegirHoja(libro, nombreHoja);
  const fila = Number(filaEncabezados) || detectarFilaEncabezados(hoja);
  if (!Number.isInteger(fila) || fila < 1 || fila > hoja.rowCount) throw new ErrorImportacion('Fila de encabezados no válida');
  return { libro, hoja, filaEncabezados: fila, columnas: columnasDe(hoja, fila) };
}

/** Paso "Asociar columnas" y "Revisar": no guarda nada. */
async function analizar(buffer, { hoja, filaEncabezados, asociacion } = {}) {
  const h = await prepararHoja(buffer, { hoja, filaEncabezados });
  const base = {
    hojas: h.libro.worksheets.map((w) => ({ nombre: w.name, filas: w.actualRowCount })),
    hoja: h.hoja.name,
    filaEncabezados: h.filaEncabezados,
    columnas: h.columnas,
    campos: CAMPOS.map(({ separador, ...c }) => c)
  };
  if (!asociacion) {
    return { ...base, ...(await asociacionInicial(h.columnas)) };
  }
  const limpia = validarAsociacion(asociacion, h.columnas);
  const filas = await planificar(leerFilas(h.hoja, h.filaEncabezados, limpia));
  return {
    ...base,
    asociacion: limpia,
    resumen: resumen(filas),
    errores: filas.filter((f) => f.errores.length).map((f) => ({ fila: f.fila, referencia: f.datos.referencia || null, errores: f.errores })),
    avisos: filas.filter((f) => f.aviso && !f.errores.length).map((f) => ({ fila: f.fila, aviso: f.aviso })),
    muestra: filas.filter((f) => !f.errores.length).slice(0, 20).map((f) => ({
      fila: f.fila, accion: f.accion, referencia: f.datos.referencia,
      campos: Object.keys(f.datos).filter((k) => k !== 'referencia' && k !== 'referenciaNormalizada').map((k) => POR_CLAVE[k].etiqueta),
      stock: f.stock ? (f.stock.tipo === 'entrada' ? `+${f.stock.cantidad} (carga inicial)` : `ajuste a ${f.stock.stockContado}`) : null
    }))
  };
}

// Pasa los datos de la fila al documento. Las celdas vacías no borran datos existentes.
function aplicarDatos(doc, datos) {
  for (const [clave, valor] of Object.entries(datos)) {
    if (['referenciaNormalizada', 'stock'].includes(clave)) continue;
    if (clave === 'precioPublico') doc.set('precios.publico', valor);
    else if (clave === 'precioDistribuidor') doc.set('precios.distribuidor', valor);
    else if (clave === 'referencia') { if (doc.isNew) doc.referencia = valor; }
    else doc.set(clave, valor);
  }
}

/** Paso "Confirmar": vuelve a validar el archivo y aplica todo en una transacción. */
async function confirmar(buffer, { hoja, filaEncabezados, asociacion, omitirErrores = false, usuario, nombreArchivo }) {
  const h = await prepararHoja(buffer, { hoja, filaEncabezados });
  const limpia = validarAsociacion(asociacion, h.columnas);
  const idImportacion = `IMP-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(3).toString('hex')}`;
  const nota = `Importación ${nombreArchivo ? `de ${String(nombreArchivo).slice(0, 80)} ` : ''}(${idImportacion})`;

  const session = await mongoose.startSession();
  let resultado;
  try {
    await session.withTransaction(async () => {
      const filas = await planificar(leerFilas(h.hoja, h.filaEncabezados, limpia), session);
      const r = resumen(filas);
      if (r.conErrores && !omitirErrores) {
        throw new ErrorImportacion(`Hay ${r.conErrores} filas con errores. Corríjalas o marque "Omitir filas con errores".`);
      }
      const validas = filas.filter((f) => !f.errores.length);
      if (!validas.length) throw new ErrorImportacion('No hay filas válidas para importar');

      const usados = new Set();
      let movimientos = 0;
      for (const f of validas) {
        const doc = f.existente ? await Product.findById(f.existente._id).session(session) : new Product();
        aplicarDatos(doc, f.datos);
        if (doc.isNew) doc.slug = await slugLibre(doc.referencia, { session, usados });
        await doc.save({ session });
        if (f.stock) {
          await registrar({
            producto: doc._id, motivo: 'carga-inicial', origen: 'importacion', referenciaExterna: idImportacion,
            usuario, nota, ...f.stock
          }, { session });
          movimientos++;
        }
      }
      await guardarAsociacion(limpia, h.columnas, usuario, session);
      resultado = { idImportacion, creados: r.nuevos, actualizados: r.actualizan, omitidas: r.conErrores, movimientos };
    });
  } catch (err) {
    if (err.code === 11000) throw new ErrorImportacion('Otra persona creó una de estas referencias mientras se importaba. Intente de nuevo.', 409);
    if (err.name === 'ValidationError') throw new ErrorImportacion(Object.values(err.errors).map((e) => e.message).join('. '));
    throw err;
  } finally {
    await session.endSession();
  }
  return resultado;
}

// Excel con las filas que tienen errores (valores originales + columna "Errores")
async function excelDeErrores(buffer, { hoja, filaEncabezados, asociacion }) {
  const h = await prepararHoja(buffer, { hoja, filaEncabezados });
  const limpia = validarAsociacion(asociacion, h.columnas);
  const filas = (await planificar(leerFilas(h.hoja, h.filaEncabezados, limpia))).filter((f) => f.errores.length);
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet('Filas con errores');
  const encabezados = filaComoLista(h.hoja, h.filaEncabezados, h.hoja.columnCount).map((e, i) => (e === null ? `Columna ${i + 1}` : String(e)));
  ws.addRow(['Fila', ...encabezados, 'Errores']).font = { bold: true };
  for (const f of filas) ws.addRow([f.fila, ...f.valores.map((v) => (v && typeof v === 'object' && 'error' in v ? v.error : v)), f.errores.join('; ')]);
  ws.getColumn(encabezados.length + 2).width = 60;
  return libro.xlsx.writeBuffer();
}

// Plantilla oficial: encabezados = etiquetas de CAMPOS, más una hoja de instrucciones. Sin datos de ejemplo.
async function plantilla() {
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = CAMPOS.map((c) => ({ header: c.etiqueta, width: Math.max(14, c.etiqueta.length + 4) }));
  ws.getRow(1).font = { bold: true };
  const ins = libro.addWorksheet('Instrucciones');
  ins.columns = [{ header: 'Columna', width: 28 }, { header: 'Obligatoria', width: 12 }, { header: 'Cómo llenarla', width: 90 }];
  ins.getRow(1).font = { bold: true };
  for (const c of CAMPOS) ins.addRow([c.etiqueta, c.requerido ? 'Sí' : 'No', c.ayuda || '']);
  ins.addRow([]);
  ins.addRow(['Notas', '', 'Las celdas vacías no borran datos de productos que ya existen. Los kits se arman en el panel.']);
  return libro.xlsx.writeBuffer();
}

// Exportación con las mismas columnas de la plantilla (sirve para editar y volver a importar)
async function exportar() {
  const productos = await Product.find({ estado: true, tipo: { $ne: 'kit' } }).sort({ referenciaNormalizada: 1 }).lean();
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = CAMPOS.map((c) => ({ header: c.clave === 'stock' ? 'Stock inicial' : c.etiqueta, width: Math.max(14, c.etiqueta.length + 4) }));
  ws.getRow(1).font = { bold: true };
  for (const p of productos) {
    ws.addRow(CAMPOS.map((c) => {
      switch (c.clave) {
        case 'tipo': return TIPOS[p.tipo] || '';
        case 'precioPublico': return p.precios?.publico ?? null;
        case 'precioDistribuidor': return p.precios?.distribuidor ?? null;
        case 'equivalencias': return (p.equivalencias || []).map((e) => (e.marca ? `${e.marca}: ${e.referencia}` : e.referencia)).join('; ');
        case 'aplicaciones': return (p.aplicaciones || []).join('; ');
        case 'papeles': return (p.papeles || []).join(', ');
        default: return p[c.clave] ?? null;
      }
    }));
  }
  return libro.xlsx.writeBuffer();
}

module.exports = { analizar, confirmar, excelDeErrores, plantilla, exportar, ErrorImportacion, CAMPOS, aNumero };
