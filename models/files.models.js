const mongoose = require('mongoose');

const filesSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  imagen: { type: String, required: true },
  estado: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Método para modificar la respuesta JSON del modelo
filesSchema.methods.toJSON = function () {
  const { __v, _id, estado, ...files } = this.toObject();
  files.uid = _id;
  return files;
};

module.exports = mongoose.model('Files', filesSchema);
