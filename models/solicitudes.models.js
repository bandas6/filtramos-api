// Solicitudes del sitio público: fabricación a medida, recordatorios de cambio y pedidos (cotizaciones).
// Cada una guarda el consentimiento de tratamiento de datos (Ley 1581): fecha, IP y texto mostrado.
const mongoose = require('mongoose');

const { Schema } = mongoose;

const consentimientoSchema = new Schema({
  aceptado: { type: Boolean, required: true },
  fecha: { type: Date, default: Date.now },
  ip: String,
  texto: String
}, { _id: false });

const contacto = {
  nombre: { type: String, trim: true, maxlength: 120 },
  whatsapp: { type: String, required: true, trim: true },
  empresa: { type: String, trim: true, maxlength: 120 }
};

const conUid = (schema) => {
  schema.methods.toJSON = function () {
    const { __v, _id, ...o } = this.toObject();
    o.uid = _id;
    return o;
  };
  return schema;
};

// ---- Fabricación a medida
const solicitudMedidaSchema = conUid(new Schema({
  ...contacto,
  nombre: { ...contacto.nombre, required: true },
  medidas: { type: String, required: true, trim: true, maxlength: 2000 },
  cantidad: { type: Number, min: 1, default: 1 },
  foto: String,
  estado: { type: String, enum: ['nuevo', 'cotizado', 'cerrado'], default: 'nuevo' },
  notaInterna: { type: String, trim: true, maxlength: 2000 },
  consentimiento: { type: consentimientoSchema, required: true }
}, { timestamps: true, collection: 'solicitudes_medida' }));
solicitudMedidaSchema.index({ estado: 1, createdAt: -1 }, { name: 'estado_fecha' });

// ---- Recordatorio de cambio
const recordatorioSchema = conUid(new Schema({
  whatsapp: contacto.whatsapp,
  producto: { type: Schema.Types.ObjectId, ref: 'Product' },
  referencia: String,
  maquina: { type: String, trim: true, maxlength: 200 },
  intervalo: { type: String, trim: true, maxlength: 100 },
  proximaFecha: Date,
  estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  consentimiento: { type: consentimientoSchema, required: true }
}, { timestamps: true, collection: 'recordatorios' }));
recordatorioSchema.index({ estado: 1, createdAt: -1 }, { name: 'estado_fecha' });

// ---- Pedido (por ahora cotización: sin pago en línea)
const lineaSchema = new Schema({
  producto: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  referencia: { type: String, required: true },
  tipo: String,
  cantidad: { type: Number, required: true, min: 1 },
  precioUnitario: Number, // según tramo por volumen al momento del pedido (referencial)
  subtotal: Number
}, { _id: false });

const pedidoSchema = conUid(new Schema({
  numero: { type: Number, required: true },
  lineas: { type: [lineaSchema], validate: [(v) => v.length > 0, 'El pedido no tiene productos'] },
  totalEstimado: Number,
  ...contacto,
  nombre: { ...contacto.nombre, required: true },
  ciudad: { type: String, required: true, trim: true, maxlength: 120 },
  nota: { type: String, trim: true, maxlength: 1000 },
  estado: { type: String, enum: ['nuevo', 'confirmado', 'despachado', 'cancelado'], default: 'nuevo' },
  historial: [{ _id: false, estado: String, fecha: { type: Date, default: Date.now }, usuarioNombre: String }],
  consentimiento: { type: consentimientoSchema, required: true }
}, { timestamps: true, collection: 'pedidos' }));
pedidoSchema.index({ numero: 1 }, { unique: true, name: 'numero_unico' });
pedidoSchema.index({ estado: 1, createdAt: -1 }, { name: 'estado_fecha' });

// Contador atómico para el número de pedido
const contadorSchema = new Schema({ _id: String, valor: { type: Number, default: 0 } }, { collection: 'contadores', versionKey: false });
const Contador = mongoose.model('Contador', contadorSchema);
async function siguienteNumero(nombre, session) {
  const c = await Contador.findOneAndUpdate({ _id: nombre }, { $inc: { valor: 1 } }, { upsert: true, new: true, session });
  return c.valor;
}

module.exports = {
  SolicitudMedida: mongoose.model('SolicitudMedida', solicitudMedidaSchema),
  Recordatorio: mongoose.model('Recordatorio', recordatorioSchema),
  Pedido: mongoose.model('Pedido', pedidoSchema),
  Contador,
  siguienteNumero
};
