const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  referencia: { type: String },
  diametroExterno: { type: String },
  diametroInterno: { type: Number },
  alturaPliegue: { type: Number },
  cortePapel: { type: Number },
  cantidadPliegues: { type: Number },
  malla: { type: String },
  longitudMallaExterna: { type: String },
  longitudMallaInterna: { type: String },
  polibretano: { type: String },
  anillo: { type: String },
  tapa: { type: String }, // Normaliza nombres: no uses mayúsculas para claves
  aplicaciones: { type: [String], default: [] },
  equivalencias: { type: [String], default: [] },
  imagesUrl: { type: [String], default: [] },
  papeles: { type: [String], default: [] },
  estado: { type: Boolean, default: true },
  category: { type: String },
  stock: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// Método para modificar la respuesta JSON del modelo
productSchema.methods.toJSON = function () {
  const { __v, _id, estado, ...product } = this.toObject();
  product.uid = _id;
  return product;
};

module.exports = mongoose.model('Product', productSchema);
