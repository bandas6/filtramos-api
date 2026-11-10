// API del sitio público. Nunca expone: precio de distribuidor, stock exacto, mínimo, código Siigo
// ni productos en borrador. La disponibilidad sale como estado (disponible / últimas / bajo pedido).
const mongoose = require('mongoose');
const Product = require('../models/productos.models');
const Movimiento = require('../models/movimiento.models');
const { SolicitudMedida, Recordatorio, Pedido, siguienteNumero } = require('../models/solicitudes.models');
const Configuracion = require('../models/configuracion.models');
const almacenamiento = require('../services/almacenamiento');
const { TIPOS } = require('../utils/catalogo');
const { claveDeBusqueda } = require('../utils/referencias');
const { disponibilidadProducto, disponibilidadKit } = require('../utils/disponibilidad');

const PUBLICADO = { estado: true, publicado: true };
const FICHA = ['diametroExterno', 'diametroInterno', 'alto', 'alturaPliegue', 'cortePapel', 'cantidadPliegues',
  'malla', 'longitudMallaExterna', 'longitudMallaInterna', 'poliuretano', 'anillo', 'tapa'];
const CAMPOS_INVENTARIO = { stock: 1, reservado: 1, stockMinimo: 1, referencia: 1, slug: 1, publicado: 1, estado: 1 };

const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class ErrorPublico extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

// Componentes de los kits de una lista (para su disponibilidad y referencias)
async function mapaComponentes(productos) {
  const ids = [...new Set(productos.flatMap((p) => (p.kit || []).map((c) => String(c.producto))))];
  if (!ids.length) return new Map();
  const comps = await Product.find({ _id: { $in: ids } }, CAMPOS_INVENTARIO).lean();
  return new Map(comps.map((c) => [String(c._id), c]));
}

function disponibilidad(p, comps) {
  const d = p.tipo === 'kit'
    ? disponibilidadKit((p.kit || []).map((c) => ({ producto: comps.get(String(c.producto)), cantidad: c.cantidad })))
    : disponibilidadProducto(p);
  return { estado: d.estado, quedan: d.quedan };
}

// Resumen para tarjetas
function tarjeta(p, comps) {
  return {
    slug: p.slug,
    referencia: p.referencia,
    tipo: p.tipo,
    tipoNombre: TIPOS[p.tipo] || '',
    precio: p.precios?.publico ?? null,
    tieneVolumen: !!p.precios?.volumen?.length,
    equivalencias: (p.equivalencias || []).slice(0, 3),
    diametroExterno: p.diametroExterno ?? null,
    alto: p.alto ?? null,
    imagen: p.imagesUrl?.[0] || null,
    disponibilidad: disponibilidad(p, comps),
    kit: p.tipo === 'kit' ? (p.kit || []).map((c) => comps.get(String(c.producto))?.referencia).filter(Boolean) : undefined,
    aplicaciones: p.tipo === 'kit' ? (p.aplicaciones || []).slice(0, 3) : undefined
  };
}

// Ficha completa
function ficha(p, comps) {
  return {
    ...tarjeta(p, comps),
    descripcion: p.descripcion || null,
    precios: { publico: p.precios?.publico ?? null, volumen: p.precios?.volumen || [] },
    equivalencias: p.equivalencias || [],
    aplicaciones: p.aplicaciones || [],
    papeles: p.papeles || [],
    intervaloCambio: p.intervaloCambio || null,
    imagenes: p.imagesUrl || [],
    ficha: Object.fromEntries(FICHA.filter((k) => p[k] !== undefined && p[k] !== null && p[k] !== '').map((k) => [k, p[k]])),
    componentes: p.tipo === 'kit'
      ? (p.kit || []).map((c) => { const x = comps.get(String(c.producto)); return x && x.publicado && x.estado ? { referencia: x.referencia, slug: x.slug, cantidad: c.cantidad } : null; }).filter(Boolean)
      : [],
    actualizado: p.updatedAt
  };
}

// GET /api/public/productos?q=&tipo=&maquina=&diamExt=&alto=&pagina=
const buscar = async (req, res) => {
  const filtro = { ...PUBLICADO };
  const clave = claveDeBusqueda(req.query.q);
  if (clave) filtro.claveBusqueda = { $regex: clave };
  if (req.query.tipo && TIPOS[req.query.tipo]) filtro.tipo = req.query.tipo;
  const maquina = String(req.query.maquina || '').trim().slice(0, 80);
  if (maquina) filtro.aplicaciones = { $regex: escaparRegex(maquina), $options: 'i' };
  // Medidas con tolerancia: ±2 mm o ±2 % (lo que sea mayor)
  for (const [param, campo] of [['diamExt', 'diametroExterno'], ['alto', 'alto']]) {
    const n = Number(String(req.query[param] || '').replace(',', '.'));
    if (req.query[param] && Number.isFinite(n) && n > 0) {
      const tol = Math.max(2, n * 0.02);
      filtro[campo] = { $gte: n - tol, $lte: n + tol };
    }
  }
  const porPagina = 12;
  const total = await Product.countDocuments(filtro);
  const paginas = Math.max(Math.ceil(total / porPagina), 1);
  const pagina = Math.min(Math.max(parseInt(req.query.pagina, 10) || 1, 1), paginas);
  const productos = await Product.find(filtro).sort({ referenciaNormalizada: 1 }).skip((pagina - 1) * porPagina).limit(porPagina).lean();
  const comps = await mapaComponentes(productos);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ ok: true, productos: productos.map((p) => tarjeta(p, comps)), total, pagina, paginas });
};

// GET /api/public/productos/destacados -> más vendidas (salidas por venta, últimos 180 días)
const destacados = async (req, res) => {
  const desde = new Date(Date.now() - 180 * 24 * 3600 * 1000);
  const ventas = await Movimiento.aggregate([
    { $match: { tipo: 'salida', motivo: { $in: ['venta', 'pedido-web'] }, fecha: { $gte: desde } } },
    { $group: { _id: '$producto', unidades: { $sum: { $abs: '$cantidad' } } } },
    { $sort: { unidades: -1 } },
    { $limit: 20 }
  ]);
  const porVentas = await Product.find({ _id: { $in: ventas.map((v) => v._id) }, ...PUBLICADO, tipo: { $ne: 'kit' } }).lean();
  const orden = new Map(ventas.map((v, i) => [String(v._id), i]));
  const lista = porVentas.sort((a, b) => orden.get(String(a._id)) - orden.get(String(b._id))).slice(0, 4);
  const criterio = lista.length ? 'ventas' : 'recientes';
  if (lista.length < 4) {
    const extra = await Product.find({ ...PUBLICADO, tipo: { $ne: 'kit' }, _id: { $nin: lista.map((p) => p._id) } })
      .sort({ updatedAt: -1 }).limit(4 - lista.length).lean();
    lista.push(...extra);
  }
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ok: true, criterio, productos: lista.map((p) => tarjeta(p, new Map())) });
};

// GET /api/public/kits
const kits = async (req, res) => {
  const lista = await Product.find({ ...PUBLICADO, tipo: 'kit' }).sort({ referenciaNormalizada: 1 }).limit(12).lean();
  const comps = await mapaComponentes(lista);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ ok: true, productos: lista.map((p) => tarjeta(p, comps)) });
};

// GET /api/public/productos/:slug
const detalle = async (req, res) => {
  const slug = String(req.params.slug || '').toLowerCase();
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
  const p = await Product.findOne({ slug, ...PUBLICADO }).lean();
  if (!p) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
  const comps = await mapaComponentes([p]);

  // Relacionados: kits que lo incluyen y los otros componentes de esos kits; si es kit, sus componentes
  const kitsQueLoIncluyen = p.tipo === 'kit' ? [] : await Product.find({ 'kit.producto': p._id, ...PUBLICADO }).lean();
  const idsHermanos = [...new Set(kitsQueLoIncluyen.flatMap((k) => k.kit.map((c) => String(c.producto))))].filter((id) => id !== String(p._id));
  const hermanos = idsHermanos.length ? await Product.find({ _id: { $in: idsHermanos }, ...PUBLICADO }).lean() : [];
  const compsKit = p.tipo === 'kit' ? await Product.find({ _id: { $in: p.kit.map((c) => c.producto) }, ...PUBLICADO }).lean() : [];
  const relacionadosDocs = [...hermanos, ...kitsQueLoIncluyen, ...compsKit].slice(0, 3);
  const compsRel = await mapaComponentes(relacionadosDocs);

  res.set('Cache-Control', 'public, max-age=60');
  res.json({ ok: true, producto: ficha(p, comps), relacionados: relacionadosDocs.map((r) => tarjeta(r, compsRel)) });
};

// GET /api/public/sitemap -> slugs publicados (el servidor del sitio arma sitemap.xml)
const sitemap = async (req, res) => {
  const lista = await Product.find(PUBLICADO, { slug: 1, updatedAt: 1 }).lean();
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ ok: true, productos: lista.filter((p) => p.slug).map((p) => ({ slug: p.slug, actualizado: p.updatedAt })) });
};

// ---------- Formularios

const whatsappValido = (v) => {
  const d = String(v || '').replace(/[\s+()-]/g, '');
  return /^\d{10,15}$/.test(d) ? d : null;
};
const texto = (v, max) => String(v ?? '').trim().slice(0, max);

async function consentimientoDe(req) {
  const b = req.body || {};
  if (!(b.consentimiento === true || b.consentimiento === 'true')) {
    throw new ErrorPublico('Debe aceptar el tratamiento de datos personales para enviar el formulario');
  }
  const conf = await Configuracion.general();
  return { aceptado: true, ip: req.ip, texto: texto(conf.politicaDatos || 'Autorizo el tratamiento de mis datos para responder esta solicitud.', 2000) };
}

// Campo trampa para bots: los humanos no lo ven ni lo llenan
const esBot = (req) => !!String(req.body?.sitioWeb || '').trim();

const responderError = (res, err) => {
  if (err instanceof ErrorPublico) return res.status(err.status).json({ ok: false, error: err.message });
  if (err.name === 'ValidationError') return res.status(400).json({ ok: false, error: Object.values(err.errors).map((e) => e.message).join('. ') });
  throw err;
};

// POST /api/public/solicitudes-medida (multipart: nombre, whatsapp, empresa, medidas, cantidad, foto?, consentimiento)
const solicitudMedida = async (req, res) => {
  try {
    if (esBot(req)) return res.status(201).json({ ok: true });
    const b = req.body || {};
    const nombre = texto(b.nombre, 120);
    const whatsapp = whatsappValido(b.whatsapp);
    const medidas = texto(b.medidas, 2000);
    const cantidad = b.cantidad === undefined || b.cantidad === '' ? 1 : Number(b.cantidad);
    if (!nombre) throw new ErrorPublico('Escriba su nombre');
    if (!whatsapp) throw new ErrorPublico('Escriba un WhatsApp válido, con indicativo (solo números)');
    if (!medidas) throw new ErrorPublico('Cuéntenos las medidas, la máquina o la referencia actual');
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100000) throw new ErrorPublico('Cantidad no válida');
    const consentimiento = await consentimientoDe(req);
    let foto;
    if (req.file) foto = (await almacenamiento.guardar({ buffer: req.file.buffer, extension: req.file.extension, carpeta: 'solicitudes' })).url;
    const s = await SolicitudMedida.create({ nombre, whatsapp, empresa: texto(b.empresa, 120) || undefined, medidas, cantidad, foto, consentimiento });
    res.status(201).json({ ok: true, id: s._id });
  } catch (err) { responderError(res, err); }
};

// POST /api/public/recordatorios { whatsapp, slug?, maquina?, intervalo?, consentimiento }
const recordatorio = async (req, res) => {
  try {
    if (esBot(req)) return res.status(201).json({ ok: true });
    const b = req.body || {};
    const whatsapp = whatsappValido(b.whatsapp);
    if (!whatsapp) throw new ErrorPublico('Escriba un WhatsApp válido, con indicativo (solo números)');
    let producto = null;
    if (b.slug) {
      producto = await Product.findOne({ slug: String(b.slug).toLowerCase(), ...PUBLICADO }, { referencia: 1, intervaloCambio: 1 }).lean();
      if (!producto) throw new ErrorPublico('Producto no encontrado', 404);
    }
    const maquina = texto(b.maquina, 200);
    const consentimiento = await consentimientoDe(req);
    const r = await Recordatorio.create({
      whatsapp, producto: producto?._id, referencia: producto?.referencia, maquina: maquina || undefined,
      intervalo: texto(b.intervalo, 100) || producto?.intervaloCambio || undefined, consentimiento
    });
    res.status(201).json({ ok: true, id: r._id });
  } catch (err) { responderError(res, err); }
};

// Precio unitario según el tramo por volumen que aplica a la cantidad
function precioPorCantidad(p, cantidad) {
  const tramos = [...(p.precios?.volumen || [])].sort((a, b) => b.desde - a.desde);
  const tramo = tramos.find((t) => cantidad >= t.desde);
  return tramo ? tramo.precio : (p.precios?.publico ?? null);
}

// POST /api/public/pedidos { lineas: [{ slug, cantidad }], nombre, whatsapp, empresa?, ciudad, nota?, consentimiento }
const pedido = async (req, res) => {
  try {
    if (esBot(req)) return res.status(201).json({ ok: true });
    const b = req.body || {};
    const nombre = texto(b.nombre, 120);
    const whatsapp = whatsappValido(b.whatsapp);
    const ciudad = texto(b.ciudad, 120);
    if (!nombre) throw new ErrorPublico('Escriba su nombre');
    if (!whatsapp) throw new ErrorPublico('Escriba un WhatsApp válido, con indicativo (solo números)');
    if (!ciudad) throw new ErrorPublico('Escriba la ciudad de entrega');
    if (!Array.isArray(b.lineas) || !b.lineas.length || b.lineas.length > 50) throw new ErrorPublico('El pedido debe tener entre 1 y 50 productos');

    const cantidades = new Map();
    for (const l of b.lineas) {
      const slug = String(l?.slug || '').toLowerCase();
      const cantidad = Number(l?.cantidad);
      if (!slug || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 100000) throw new ErrorPublico('Línea de pedido no válida');
      cantidades.set(slug, (cantidades.get(slug) || 0) + cantidad);
    }
    const productos = await Product.find({ slug: { $in: [...cantidades.keys()] }, ...PUBLICADO }).lean();
    if (productos.length !== cantidades.size) throw new ErrorPublico('Algún producto ya no está disponible en el catálogo. Revise su pedido.');
    const consentimiento = await consentimientoDe(req);

    const lineas = productos.map((p) => {
      const cantidad = cantidades.get(p.slug);
      const precioUnitario = precioPorCantidad(p, cantidad);
      return { producto: p._id, referencia: p.referencia, tipo: p.tipo, cantidad, precioUnitario, subtotal: precioUnitario === null ? null : precioUnitario * cantidad };
    });
    const totalEstimado = lineas.every((l) => l.subtotal !== null) ? lineas.reduce((s, l) => s + l.subtotal, 0) : null;
    const numero = await siguienteNumero('pedido');
    const ped = await Pedido.create({
      numero, lineas, totalEstimado, nombre, whatsapp, empresa: texto(b.empresa, 120) || undefined, ciudad,
      nota: texto(b.nota, 1000) || undefined, consentimiento, historial: [{ estado: 'nuevo' }]
    });
    res.status(201).json({ ok: true, numero: ped.numero, lineas: ped.lineas.map(({ referencia, cantidad, precioUnitario, subtotal }) => ({ referencia, cantidad, precioUnitario, subtotal })), totalEstimado });
  } catch (err) { responderError(res, err); }
};

module.exports = { buscar, destacados, kits, detalle, sitemap, solicitudMedida, recordatorio, pedido, precioPorCantidad };
