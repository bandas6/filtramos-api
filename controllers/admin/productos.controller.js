const mongoose = require('mongoose');
const Product = require('../../models/productos.models');
const Movimiento = require('../../models/movimiento.models');
const { normalizarReferencia, claveDeBusqueda } = require('../../utils/referencias');
const { TIPOS } = require('../../utils/catalogo');
const { slugLibre } = require('../../services/catalogo');

// Campos que el panel puede escribir. stock/reservado los maneja Inventario (etapa C).
const CAMPOS = [
  'referencia', 'tipo', 'descripcion', 'codigoSiigo', 'precios', 'equivalencias', 'aplicaciones',
  'intervaloCambio', 'diametroExterno', 'diametroInterno', 'alto', 'alturaPliegue', 'cortePapel',
  'cantidadPliegues', 'malla', 'longitudMallaExterna', 'longitudMallaInterna', 'poliuretano', 'anillo',
  'tapa', 'papeles', 'imagesUrl', 'kit', 'publicar', 'stockMinimo'
];

const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

class ErrorDeDatos extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Solo rutas de imagen propias o https (Cloudinary en la etapa E); evita "javascript:" y similares
const urlDeImagenValida = (u) => typeof u === 'string' && (/^\/uploads\/[\w.-]+$/.test(u) || /^https:\/\/\S+$/.test(u));

// Toma solo los campos permitidos y normaliza los vacíos (null o '' = borrar)
function leerCuerpo(body = {}) {
  const data = {};
  for (const campo of CAMPOS) {
    if (!(campo in body)) continue;
    data[campo] = vacio(body[campo]) ? undefined : body[campo];
  }
  if (data.precios !== undefined) {
    const p = data.precios || {};
    data.precios = {
      publico: vacio(p.publico) ? undefined : p.publico,
      distribuidor: vacio(p.distribuidor) ? undefined : p.distribuidor,
      volumen: Array.isArray(p.volumen) ? p.volumen.filter((t) => t && !(vacio(t.desde) && vacio(t.precio))) : []
    };
  }
  for (const lista of ['aplicaciones', 'papeles']) {
    if (data[lista] !== undefined) {
      if (!Array.isArray(data[lista])) throw new ErrorDeDatos(`${lista} debe ser una lista`);
      data[lista] = data[lista].map((x) => String(x).trim()).filter(Boolean);
    }
  }
  if (data.equivalencias !== undefined) {
    if (!Array.isArray(data.equivalencias)) throw new ErrorDeDatos('equivalencias debe ser una lista');
    data.equivalencias = data.equivalencias.filter((e) => e && !(vacio(e.marca) && vacio(e.referencia)));
  }
  if (data.imagesUrl !== undefined) {
    if (!Array.isArray(data.imagesUrl) || !data.imagesUrl.every(urlDeImagenValida)) {
      throw new ErrorDeDatos('Las fotos deben ser imágenes de la biblioteca');
    }
    data.imagesUrl = [...new Set(data.imagesUrl)];
  }
  if (data.publicar !== undefined) data.publicar = data.publicar === true || data.publicar === 'true';
  return data;
}

async function validarKit(producto) {
  if (producto.tipo !== 'kit') {
    producto.kit = [];
    return;
  }
  const ids = producto.kit.map((c) => String(c.producto));
  if (new Set(ids).size !== ids.length) throw new ErrorDeDatos('Un producto aparece dos veces en el kit');
  if (producto._id && ids.includes(String(producto._id))) throw new ErrorDeDatos('Un kit no puede incluirse a sí mismo');
  if (!ids.every((id) => mongoose.isValidObjectId(id))) throw new ErrorDeDatos('Componente del kit no válido');
  const componentes = await Product.find({ _id: { $in: ids }, estado: true }, { tipo: 1 }).lean();
  if (componentes.length !== ids.length) throw new ErrorDeDatos('Algún componente del kit no existe');
  if (componentes.some((c) => c.tipo === 'kit')) throw new ErrorDeDatos('Un kit no puede contener otro kit');
}

async function verificarReferencia(referencia, excluirId) {
  const filtro = { referenciaNormalizada: normalizarReferencia(referencia) };
  if (excluirId) filtro._id = { $ne: excluirId };
  if (await Product.exists(filtro)) throw new ErrorDeDatos(`Ya existe un producto con la referencia ${referencia}`);
}

// Respuesta para el panel: con precio de distribuidor y componentes del kit con su referencia
function respuesta(doc) {
  const p = doc.paraAdmin();
  p.kit = (p.kit || []).map((c) => (c.producto && c.producto._id
    ? { producto: c.producto._id, referencia: c.producto.referencia, cantidad: c.cantidad }
    : c));
  return p;
}

function manejarError(res, error, contexto) {
  if (error instanceof ErrorDeDatos) return res.status(error.status).json({ ok: false, error: error.message });
  if (error.code === 11000) return res.status(400).json({ ok: false, error: 'Ya existe un producto con esa referencia' });
  if (error.name === 'ValidationError') {
    return res.status(400).json({ ok: false, error: Object.values(error.errors).map((e) => e.message).join('. ') });
  }
  if (error.name === 'CastError') return res.status(400).json({ ok: false, error: `Valor no válido en ${error.path}` });
  console.error(`Error en ${contexto}:`, error);
  res.status(500).json({ ok: false, error: 'Error interno del servidor' });
}

// GET /api/admin/productos?q=&tipo=&estado=publicado|borrador&pagina=1&porPagina=10
const listar = async (req, res) => {
  try {
    const filtro = { estado: true };
    const clave = claveDeBusqueda(req.query.q);
    if (clave) filtro.claveBusqueda = { $regex: clave };
    if (req.query.tipo) {
      if (!TIPOS[req.query.tipo]) return res.status(400).json({ ok: false, error: 'Tipo no válido' });
      filtro.tipo = req.query.tipo;
    }
    if (req.query.estado === 'publicado') filtro.publicado = true;
    else if (req.query.estado === 'borrador') filtro.publicado = false;

    const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 10, 1), 100);
    const total = await Product.countDocuments(filtro);
    const paginas = Math.max(Math.ceil(total / porPagina), 1);
    const pagina = Math.min(Math.max(parseInt(req.query.pagina, 10) || 1, 1), paginas);

    const docs = await Product.find(filtro)
      .sort({ referenciaNormalizada: 1 })
      .skip((pagina - 1) * porPagina)
      .limit(porPagina)
      .populate('kit.producto', 'referencia');

    res.json({ ok: true, productos: docs.map(respuesta), total, pagina, paginas, porPagina });
  } catch (error) {
    manejarError(res, error, 'listar productos');
  }
};

// GET /api/admin/productos/opciones -> referencias para elegir componentes de un kit
const opciones = async (req, res) => {
  try {
    const docs = await Product.find({ estado: true, tipo: { $ne: 'kit' } }, { referencia: 1, tipo: 1 })
      .sort({ referenciaNormalizada: 1 }).lean();
    res.json({ ok: true, productos: docs.map((d) => ({ uid: d._id, referencia: d.referencia, tipo: d.tipo })) });
  } catch (error) {
    manejarError(res, error, 'opciones de productos');
  }
};

const obtener = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    const doc = await Product.findOne({ _id: req.params.id, estado: true }).populate('kit.producto', 'referencia');
    if (!doc) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    res.json({ ok: true, producto: respuesta(doc) });
  } catch (error) {
    manejarError(res, error, 'obtener producto');
  }
};

const crear = async (req, res) => {
  try {
    const data = leerCuerpo(req.body);
    data.referencia = String(data.referencia || '').trim();
    if (!data.referencia) throw new ErrorDeDatos('La referencia es requerida');
    await verificarReferencia(data.referencia);

    const doc = new Product(data);
    await validarKit(doc);
    doc.slug = await slugLibre(doc.referencia);
    await doc.save();
    await doc.populate('kit.producto', 'referencia');
    res.status(201).json({ ok: true, producto: respuesta(doc) });
  } catch (error) {
    manejarError(res, error, 'crear producto');
  }
};

const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    const doc = await Product.findOne({ _id: id, estado: true });
    if (!doc) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });

    const data = leerCuerpo(req.body);
    if ('referencia' in data) {
      data.referencia = String(data.referencia || '').trim();
      if (!data.referencia) throw new ErrorDeDatos('La referencia no puede quedar vacía');
      await verificarReferencia(data.referencia, id);
    }
    // Un producto que es componente de algún kit no puede volverse kit
    if (data.tipo === 'kit' && doc.tipo !== 'kit' && (await Product.exists({ 'kit.producto': doc._id, estado: true }))) {
      throw new ErrorDeDatos('Este producto es parte de un kit; no puede convertirse en kit');
    }

    for (const [campo, valor] of Object.entries(data)) doc.set(campo, valor);
    await validarKit(doc);
    // El slug se mantiene estable (enlaces y SEO); solo se crea si faltaba
    if (!doc.slug) doc.slug = await slugLibre(doc.referencia, { excluirId: id });
    await doc.save();
    await doc.populate('kit.producto', 'referencia');
    res.json({ ok: true, producto: respuesta(doc) });
  } catch (error) {
    manejarError(res, error, 'actualizar producto');
  }
};

const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    // Con movimientos de inventario no se borra: el historial debe seguir apuntando a un producto
    if (await Movimiento.exists({ producto: id })) {
      return res.status(409).json({ ok: false, error: 'No se puede eliminar: tiene movimientos de inventario. Use "Publicar" para ocultarlo de la web.' });
    }
    const kits = await Product.find({ 'kit.producto': id, estado: true }, { referencia: 1 }).lean();
    if (kits.length) {
      return res.status(409).json({
        ok: false,
        error: `No se puede eliminar: es parte de ${kits.length === 1 ? 'el kit' : 'los kits'} ${kits.map((k) => k.referencia).join(', ')}`
      });
    }
    const borrado = await Product.findByIdAndDelete(id);
    if (!borrado) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    res.json({ ok: true });
  } catch (error) {
    manejarError(res, error, 'eliminar producto');
  }
};

// GET /api/admin/resumen -> indicadores de calidad del catálogo
const resumen = async (req, res) => {
  try {
    const base = { estado: true };
    const [publicados, borradores, sinFoto, sinPrecio, stockBajo] = await Promise.all([
      Product.countDocuments({ ...base, publicado: true }),
      Product.countDocuments({ ...base, publicado: false }),
      Product.countDocuments({ ...base, motivosBorrador: 'sin-foto' }),
      Product.countDocuments({ ...base, motivosBorrador: 'sin-precio' }),
      // Disponible (stock − reservado) en cero o por debajo del mínimo. Los kits se calculan por componentes (etapa C).
      Product.countDocuments({
        ...base,
        tipo: { $ne: 'kit' },
        $expr: {
          $or: [
            { $lte: [{ $subtract: ['$stock', '$reservado'] }, 0] },
            { $lt: [{ $subtract: ['$stock', '$reservado'] }, '$stockMinimo'] }
          ]
        }
      })
    ]);
    res.json({ ok: true, resumen: { publicados, borradores, sinFoto, sinPrecio, stockBajo } });
  } catch (error) {
    manejarError(res, error, 'resumen');
  }
};

module.exports = { listar, opciones, obtener, crear, actualizar, eliminar, resumen };
