const mongoose = require('mongoose');
const { CLAVES } = require('../utils/ajustes');

// Un solo documento (clave "general") con los ajustes del negocio
const campos = Object.fromEntries(CLAVES.map((c) => [c, { type: String, trim: true }]));

const configuracionSchema = new mongoose.Schema({
  clave: { type: String, required: true, default: 'general' },
  ...campos,
  actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' }
}, { timestamps: true, collection: 'configuracion' });

configuracionSchema.index({ clave: 1 }, { unique: true, name: 'clave_unica' });

configuracionSchema.statics.general = async function () {
  return (await this.findOne({ clave: 'general' })) || new this({ clave: 'general' });
};

module.exports = mongoose.model('Configuracion', configuracionSchema);
