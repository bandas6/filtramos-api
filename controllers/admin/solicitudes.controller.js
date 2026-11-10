// Cotizaciones y pedidos del sitio: pedidos, solicitudes a medida y recordatorios.
// Los cambios de estado de un pedido mueven el inventario en una transacción:
//   nuevo -> confirmado   : reserva el stock (los kits reservan sus componentes)
//   confirmado -> despachado : salida + liberación de la reserva
//   confirmado -> cancelado  : liberación
//   nuevo -> cancelado       : sin movimientos
const mongoose = require('mongoose');
const Product = require('../../models/productos.models');
const { Pedido, SolicitudMedida, Recordatorio } = require('../../models/solicitudes.models');
const { registrar, ErrorInventario } = require('../../services/inventario');

const TRANSICIONES = {
  nuevo: ['confirmado', 'cancelado'],
  confirmado: ['despachado', 'cancelado'],
  despachado: [],
  cancelado: []
};

const paginar = async (Modelo, filtro, req) => {
  const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 20, 1), 100);
  const total = await Modelo.countDocuments(filtro);
  const paginas = Math.max(Math.ceil(total / porPagina), 1);
  const pagina = Math.min(Math.max(parseInt(req.query.pagina, 10) || 1, 1), paginas);
  const items = await Modelo.find(filtro).sort({ createdAt: -1 }).skip((pagina - 1) * porPagina).limit(porPagina);
  return { items, total, pagina, paginas };
};

const filtroEstado = (req, validos) => (validos.includes(req.query.estado) ? { estado: req.query.estado } : {});

// Unidades por producto simple (los kits se abren en componentes)
async function unidadesPorProducto(pedido, session) {
  const total = new Map();
  for (const l of pedido.lineas) {
    const p = await Product.findById(l.producto, { tipo: 1, kit: 1 }).session(session).lean();
    if (!p) throw new ErrorInventario(`El producto ${l.referencia} ya no existe`, 409);
    const partes = p.tipo === 'kit' ? p.kit.map((c) => [String(c.producto), c.cantidad * l.cantidad]) : [[String(p._id), l.cantidad]];
    for (const [id, n] of partes) total.set(id, (total.get(id) || 0) + n);
  }
  return total;
}

// ---- Pedidos
const listarPedidos = async (req, res) => {
  const r = await paginar(Pedido, filtroEstado(req, Object.keys(TRANSICIONES)), req);
  res.json({ ok: true, pedidos: r.items, total: r.total, pagina: r.pagina, paginas: r.paginas });
};

const cambiarEstadoPedido = async (req, res) => {
  const { id } = req.params;
  const nuevo = req.body?.estado;
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });

  const session = await mongoose.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => {
      const ped = await Pedido.findById(id).session(session);
      if (!ped) throw new ErrorInventario('Pedido no encontrado', 404);
      if (!TRANSICIONES[ped.estado].includes(nuevo)) {
        throw new ErrorInventario(`Un pedido ${ped.estado} no puede pasar a ${nuevo || '(vacío)'}`);
      }
      const ref = `PED-${ped.numero}`;
      const base = { motivo: 'pedido-web', origen: 'web', referenciaExterna: ref, usuario: req.usuario };
      const unidades = await unidadesPorProducto(ped, session);

      for (const [producto, cantidad] of unidades) {
        if (nuevo === 'confirmado') await registrar({ ...base, producto, cantidad, tipo: 'reserva', nota: `Pedido #${ped.numero}` }, { session });
        if (nuevo === 'despachado') {
          await registrar({ ...base, producto, cantidad, tipo: 'salida', nota: `Pedido #${ped.numero} despachado` }, { session });
          await registrar({ ...base, producto, cantidad, tipo: 'liberacion', nota: `Pedido #${ped.numero} despachado` }, { session });
        }
        if (nuevo === 'cancelado' && ped.estado === 'confirmado') {
          await registrar({ ...base, producto, cantidad, tipo: 'liberacion', nota: `Pedido #${ped.numero} cancelado` }, { session });
        }
      }
      ped.estado = nuevo;
      ped.historial.push({ estado: nuevo, usuarioNombre: req.usuario.nombre });
      await ped.save({ session });
      resultado = ped;
    });
    res.json({ ok: true, pedido: resultado });
  } catch (err) {
    if (err instanceof ErrorInventario) {
      const msg = err.message.startsWith('Stock insuficiente') ? `No hay stock suficiente para despachar: ${err.message}` : err.message;
      return res.status(err.status).json({ ok: false, error: msg });
    }
    throw err;
  } finally {
    await session.endSession();
  }
};

// ---- Solicitudes a medida
const listarMedida = async (req, res) => {
  const r = await paginar(SolicitudMedida, filtroEstado(req, ['nuevo', 'cotizado', 'cerrado']), req);
  res.json({ ok: true, solicitudes: r.items, total: r.total, pagina: r.pagina, paginas: r.paginas });
};

const actualizarMedida = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
  const s = await SolicitudMedida.findById(req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada' });
  if (req.body?.estado !== undefined) {
    if (!['nuevo', 'cotizado', 'cerrado'].includes(req.body.estado)) return res.status(400).json({ ok: false, error: 'Estado no válido' });
    s.estado = req.body.estado;
  }
  if (req.body?.notaInterna !== undefined) s.notaInterna = String(req.body.notaInterna).slice(0, 2000);
  await s.save();
  res.json({ ok: true, solicitud: s });
};

// ---- Recordatorios
const listarRecordatorios = async (req, res) => {
  const r = await paginar(Recordatorio, filtroEstado(req, ['activo', 'inactivo']), req);
  res.json({ ok: true, recordatorios: r.items, total: r.total, pagina: r.pagina, paginas: r.paginas });
};

const actualizarRecordatorio = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'Recordatorio no encontrado' });
  const r = await Recordatorio.findById(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: 'Recordatorio no encontrado' });
  if (req.body?.estado !== undefined) {
    if (!['activo', 'inactivo'].includes(req.body.estado)) return res.status(400).json({ ok: false, error: 'Estado no válido' });
    r.estado = req.body.estado;
  }
  if (req.body?.proximaFecha !== undefined) {
    const f = req.body.proximaFecha ? new Date(req.body.proximaFecha) : null;
    if (f && Number.isNaN(f.getTime())) return res.status(400).json({ ok: false, error: 'Fecha no válida' });
    r.proximaFecha = f || undefined;
  }
  await r.save();
  res.json({ ok: true, recordatorio: r });
};

// Conteo de pendientes para el menú
const pendientes = async (req, res) => {
  const [pedidos, medida] = await Promise.all([
    Pedido.countDocuments({ estado: 'nuevo' }),
    SolicitudMedida.countDocuments({ estado: 'nuevo' })
  ]);
  res.json({ ok: true, pedidos, medida });
};

module.exports = { listarPedidos, cambiarEstadoPedido, listarMedida, actualizarMedida, listarRecordatorios, actualizarRecordatorio, pendientes };
