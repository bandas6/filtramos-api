const mongoose = require('mongoose');

const TIPOS = ['entrada', 'salida', 'ajuste', 'reserva', 'liberacion'];
const MOTIVOS = ['produccion', 'venta', 'devolucion', 'conteo-fisico', 'carga-inicial', 'pedido-web'];
const ORIGENES = ['manual', 'siigo', 'importacion', 'web'];

// Historial de inventario. Es inmutable: un error se corrige con un movimiento de ajuste.
const movimientoSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  referencia: { type: String, required: true },          // copia de la referencia al momento del movimiento
  tipo: { type: String, enum: TIPOS, required: true },
  cantidad: { type: Number, required: true },            // con signo: + suma, − resta
  motivo: { type: String, enum: MOTIVOS, required: true },
  origen: { type: String, enum: ORIGENES, default: 'manual' },
  referenciaExterna: { type: String, trim: true },       // p. ej. número de factura o de pedido
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: { type: String },
  nota: { type: String, trim: true, maxlength: 300 },
  stockResultante: { type: Number },
  reservadoResultante: { type: Number },
  fecha: { type: Date, default: Date.now }
}, { collection: 'movimientos' });

movimientoSchema.index({ producto: 1, fecha: -1 }, { name: 'producto_fecha' });
movimientoSchema.index({ fecha: -1 }, { name: 'fecha' });
// Un mismo documento externo (factura, pedido…) no se registra dos veces
movimientoSchema.index(
  { origen: 1, referenciaExterna: 1, producto: 1, tipo: 1 },
  { unique: true, name: 'externo_unico', partialFilterExpression: { referenciaExterna: { $type: 'string' } } }
);

// Inmutable: no se edita ni se borra por la aplicación
function prohibido() {
  throw new Error('Los movimientos de inventario no se editan ni se borran; registre un ajuste.');
}
movimientoSchema.pre('save', function () { if (!this.isNew) prohibido(); });
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  movimientoSchema.pre(op, function () {
    if (this.getOptions?.().permitirBorradoDemo) return; // solo seed:demo --borrar
    prohibido();
  });
}

movimientoSchema.methods.toJSON = function () {
  const { __v, _id, ...m } = this.toObject();
  m.uid = _id;
  return m;
};

module.exports = mongoose.model('Movimiento', movimientoSchema);
module.exports.TIPOS = TIPOS;
module.exports.MOTIVOS = MOTIVOS;
module.exports.ORIGENES = ORIGENES;
