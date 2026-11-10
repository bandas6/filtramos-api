const mongoose = require('mongoose');
const Product = require('../../models/productos.models');
const Movimiento = require('../../models/movimiento.models');
const { registrar, ErrorInventario } = require('../../services/inventario');
const { disponibilidadProducto, disponibilidadKit } = require('../../utils/disponibilidad');
const { claveDeBusqueda, normalizarReferencia } = require('../../utils/referencias');

// Nivel de la barra (0–1): lleno al doble del mínimo; sin mínimo, lleno si hay disponible
const nivelDe = (disponible, minimo) => {
  if (disponible <= 0) return 0;
  if (!minimo) return 1;
  return Math.min(disponible / (2 * minimo), 1);
};

// GET /api/admin/inventario?q=&soloBajoMinimo=1
const inventario = async (req, res) => {
  const productos = await Product.find({ estado: true }, {
    referencia: 1, tipo: 1, stock: 1, reservado: 1, stockMinimo: 1, kit: 1, referenciaNormalizada: 1, claveBusqueda: 1
  }).sort({ referenciaNormalizada: 1 }).lean();
  const porId = new Map(productos.map((p) => [String(p._id), p]));

  const filas = productos.map((p) => {
    if (p.tipo === 'kit') {
      const d = disponibilidadKit((p.kit || []).map((c) => ({ producto: porId.get(String(c.producto)), cantidad: c.cantidad })));
      return {
        uid: p._id, referencia: p.referencia, tipo: p.tipo, esKit: true,
        stock: null, reservado: null, stockMinimo: null, ...d, nivel: d.disponible > 0 ? 1 : 0,
        componentes: (p.kit || []).map((c) => porId.get(String(c.producto))?.referencia).filter(Boolean)
      };
    }
    const d = disponibilidadProducto(p);
    return {
      uid: p._id, referencia: p.referencia, tipo: p.tipo, esKit: false,
      stock: p.stock, reservado: p.reservado, stockMinimo: p.stockMinimo, ...d, nivel: nivelDe(d.disponible, p.stockMinimo)
    };
  });

  const simples = filas.filter((f) => !f.esKit);
  const indicadores = {
    referenciasActivas: simples.length,
    bajoMinimo: simples.filter((f) => f.disponible > 0 && f.stockMinimo > 0 && f.disponible < f.stockMinimo).length,
    enCero: simples.filter((f) => f.disponible <= 0).length,
    unidadesReservadas: simples.reduce((s, f) => s + (f.reservado || 0), 0)
  };

  let resultado = filas;
  const clave = claveDeBusqueda(req.query.q);
  if (clave) {
    const ids = new Set(productos.filter((p) => (p.claveBusqueda || []).some((k) => k.includes(clave))).map((p) => String(p._id)));
    resultado = resultado.filter((f) => ids.has(String(f.uid)));
  }
  if (req.query.soloBajoMinimo === '1' || req.query.soloBajoMinimo === 'true') {
    resultado = resultado.filter((f) => f.estado !== 'disponible');
  }

  res.json({ ok: true, indicadores, productos: resultado });
};

// GET /api/admin/movimientos?producto=&pagina=&porPagina=
const listarMovimientos = async (req, res) => {
  const filtro = {};
  if (req.query.producto) {
    if (!mongoose.isValidObjectId(req.query.producto)) return res.status(400).json({ ok: false, error: 'Producto no válido' });
    filtro.producto = req.query.producto;
  }
  const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 20, 1), 100);
  const total = await Movimiento.countDocuments(filtro);
  const paginas = Math.max(Math.ceil(total / porPagina), 1);
  const pagina = Math.min(Math.max(parseInt(req.query.pagina, 10) || 1, 1), paginas);
  const movimientos = await Movimiento.find(filtro).sort({ fecha: -1, _id: -1 }).skip((pagina - 1) * porPagina).limit(porPagina);
  res.json({ ok: true, movimientos, total, pagina, paginas, porPagina });
};

// POST /api/admin/movimientos  (admin y bodega)
// { producto | referencia, tipo: entrada|salida|ajuste, cantidad, stockContado (ajuste), motivo, nota }
const crearMovimiento = async (req, res) => {
  const b = req.body || {};
  if (!['entrada', 'salida', 'ajuste'].includes(b.tipo)) {
    return res.status(400).json({ ok: false, error: 'Desde el panel solo se registran entradas, salidas y ajustes' });
  }
  let producto = b.producto;
  if (!producto && b.referencia) {
    const p = await Product.findOne({ referenciaNormalizada: String(b.referencia).toUpperCase().replace(/\s+/g, ''), estado: true }, { _id: 1 });
    if (!p) return res.status(404).json({ ok: false, error: `No existe la referencia ${b.referencia}` });
    producto = p._id;
  }
  try {
    const mov = await registrar({
      producto, tipo: b.tipo, motivo: b.motivo, cantidad: b.cantidad, stockContado: b.stockContado,
      nota: b.nota, origen: 'manual', usuario: req.usuario
    });
    res.status(201).json({ ok: true, movimiento: mov });
  } catch (err) {
    if (err instanceof ErrorInventario) return res.status(err.status).json({ ok: false, error: err.message });
    throw err;
  }
};

module.exports = { inventario, listarMovimientos, crearMovimiento };
