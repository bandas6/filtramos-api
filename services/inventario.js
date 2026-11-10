// Registro de movimientos de inventario. Único lugar que cambia stock y reservado.
// Cada movimiento actualiza el producto con $inc y guarda el movimiento en la MISMA transacción.
const mongoose = require('mongoose');
const Product = require('../models/productos.models');
const Movimiento = require('../models/movimiento.models');

class ErrorInventario extends Error {
  constructor(mensaje, status = 400) { super(mensaje); this.status = status; }
}

// Motivos permitidos por tipo (los manuales; importación y web usan los suyos)
const MOTIVOS_POR_TIPO = {
  entrada: ['produccion', 'devolucion', 'carga-inicial'],
  salida: ['venta', 'pedido-web'],
  ajuste: ['conteo-fisico', 'carga-inicial'],
  reserva: ['pedido-web'],
  liberacion: ['pedido-web']
};

const enteroPositivo = (n) => Number.isInteger(n) && n > 0;

/**
 * Registra un movimiento y actualiza el producto de forma atómica.
 * @param {object} d
 *   producto (id), tipo, motivo, origen ('manual'), usuario ({_id, nombre}), nota, referenciaExterna
 *   cantidad: entero > 0 para entrada/salida/reserva/liberacion
 *   ajuste: { stockContado } (entero ≥ 0) o { cantidad } con signo (≠ 0)
 * @param {object} [opciones] session: para incluirlo en una transacción mayor (importador, pedidos)
 * @returns {Promise<Movimiento>}
 */
async function registrar(d, { session: externa } = {}) {
  const { tipo, motivo } = d;
  if (!MOTIVOS_POR_TIPO[tipo]) throw new ErrorInventario('Tipo de movimiento no válido');
  if (!MOTIVOS_POR_TIPO[tipo].includes(motivo)) throw new ErrorInventario('Motivo no válido para este tipo de movimiento');
  if (!mongoose.isValidObjectId(d.producto)) throw new ErrorInventario('Producto no encontrado', 404);

  const ejecutar = async (session) => {
    const prod = await Product.findOne({ _id: d.producto, estado: true }, { referencia: 1, tipo: 1, stock: 1, reservado: 1 }).session(session);
    if (!prod) throw new ErrorInventario('Producto no encontrado', 404);
    if (prod.tipo === 'kit') throw new ErrorInventario('Los kits no tienen stock propio: registre el movimiento de cada componente');

    let campo = 'stock';
    let delta;
    const filtro = { _id: prod._id };

    if (tipo === 'ajuste') {
      if (d.stockContado !== undefined && d.stockContado !== null && d.stockContado !== '') {
        const contado = Number(d.stockContado);
        if (!Number.isInteger(contado) || contado < 0) throw new ErrorInventario('El stock contado debe ser un entero mayor o igual a 0');
        delta = contado - prod.stock;
        filtro.stock = prod.stock; // si alguien movió el stock entre la lectura y la escritura, se reintenta
      } else {
        delta = Number(d.cantidad);
        if (!Number.isInteger(delta) || delta === 0) throw new ErrorInventario('La cantidad del ajuste debe ser un entero distinto de 0');
        filtro.stock = { $gte: -delta };
      }
      if (delta === 0) throw new ErrorInventario('El stock contado es igual al actual: no hay nada que ajustar');
    } else {
      const cantidad = Number(d.cantidad);
      if (!enteroPositivo(cantidad)) throw new ErrorInventario('La cantidad debe ser un entero mayor que 0');
      if (tipo === 'entrada') delta = cantidad;
      if (tipo === 'salida') { delta = -cantidad; filtro.stock = { $gte: cantidad }; }
      if (tipo === 'reserva') { campo = 'reservado'; delta = cantidad; }
      if (tipo === 'liberacion') { campo = 'reservado'; delta = -cantidad; filtro.reservado = { $gte: cantidad }; }
    }

    const actualizado = await Product.findOneAndUpdate(filtro, { $inc: { [campo]: delta } }, { new: true, session, projection: { stock: 1, reservado: 1 } });
    if (!actualizado) {
      if (tipo === 'salida') throw new ErrorInventario(`Stock insuficiente: hay ${prod.stock} en stock`);
      if (tipo === 'liberacion') throw new ErrorInventario(`No hay tanto reservado: hay ${prod.reservado}`);
      if (tipo === 'ajuste') throw new ErrorInventario('El stock cambió mientras se registraba el ajuste o quedaría negativo. Intente de nuevo.', 409);
      throw new ErrorInventario('No se pudo registrar el movimiento', 409);
    }

    const [mov] = await Movimiento.create([{
      producto: prod._id,
      referencia: prod.referencia,
      tipo,
      cantidad: delta,
      motivo,
      origen: d.origen || 'manual',
      referenciaExterna: d.referenciaExterna || undefined,
      usuario: d.usuario?._id,
      usuarioNombre: d.usuario?.nombre,
      nota: d.nota ? String(d.nota).trim().slice(0, 300) || undefined : undefined,
      stockResultante: actualizado.stock,
      reservadoResultante: actualizado.reservado
    }], { session });
    return mov;
  };

  try {
    if (externa) return await ejecutar(externa);
    const session = await mongoose.startSession();
    try {
      let resultado;
      await session.withTransaction(async () => { resultado = await ejecutar(session); });
      return resultado;
    } finally {
      await session.endSession();
    }
  } catch (err) {
    if (err.code === 11000) throw new ErrorInventario('Ese documento externo ya fue registrado', 409);
    throw err;
  }
}

module.exports = { registrar, ErrorInventario, MOTIVOS_POR_TIPO };
