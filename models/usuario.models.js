const mongoose = require('mongoose');

const ROLES = ['admin', 'bodega', 'ventas'];

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  rol: { type: String, enum: ROLES, default: 'ventas' },
  estado: { type: Boolean, default: true },
  ultimoAcceso: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

usuarioSchema.methods.toJSON = function () {
  const { __v, _id, password, ...usuario } = this.toObject();
  usuario.uid = _id;
  return usuario;
};

module.exports = mongoose.model('Usuario', usuarioSchema);
module.exports.ROLES = ROLES;
