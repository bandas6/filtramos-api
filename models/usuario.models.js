const mongoose = require('mongoose');

const ROLES = ['admin', 'bodega', 'ventas'];

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  rol: { type: String, enum: ROLES, default: 'ventas' },
  estado: { type: Boolean, default: true },
  ultimoAcceso: { type: Date },
  // Las sesiones emitidas antes de esta fecha dejan de valer (al restablecer la contraseña)
  passwordCambiadoEn: { type: Date },
  // Preferencias del panel: cuadros de ayuda cerrados y primeros pasos marcados como "no aplica"
  preferencias: {
    ayudaCerrada: { type: [String], default: [] },
    pasosNoAplica: { type: [String], default: [] }
  },
  createdAt: { type: Date, default: Date.now }
});

usuarioSchema.methods.toJSON = function () {
  const { __v, _id, password, passwordCambiadoEn, ...usuario } = this.toObject();
  usuario.uid = _id;
  return usuario;
};

module.exports = mongoose.model('Usuario', usuarioSchema);
module.exports.ROLES = ROLES;

// Claves válidas para las preferencias (el panel no puede guardar otra cosa)
module.exports.SECCIONES_AYUDA = ['inicio', 'productos', 'inventario', 'importar', 'cotizaciones', 'imagenes', 'usuarios', 'ajustes'];
module.exports.PASOS = ['whatsapp', 'usuarios', 'importar', 'fotos', 'borradores'];
