const mongoose = require('mongoose');

// Preferencias internas pequeñas (p. ej. la última asociación de columnas del importador)
const preferenciaSchema = new mongoose.Schema({
  clave: { type: String, required: true },
  valor: { type: mongoose.Schema.Types.Mixed },
  actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true, collection: 'preferencias' });

preferenciaSchema.index({ clave: 1 }, { unique: true, name: 'clave_unica' });

module.exports = mongoose.model('Preferencia', preferenciaSchema);
