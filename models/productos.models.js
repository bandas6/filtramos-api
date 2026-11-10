const mongoose = require('mongoose');
const { normalizarReferencia, claveDeBusqueda } = require('../utils/referencias');

const productSchema = new mongoose.Schema({
  referencia: { type: String, required: true, trim: true },
  diametroExterno: { type: String },
  diametroInterno: { type: Number },
  alto: { type: Number }, // altura total del elemento (mm)
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
  createdAt: { type: Date, default: Date.now },

  // Calculados en el hook de abajo; no se escriben desde el panel
  referenciaNormalizada: { type: String },        // unicidad: mayúsculas, sin espacios, con guiones
  claveBusqueda: { type: [String], default: [] }  // búsqueda: solo letras y números (referencia y equivalencias)
});

// Única entre los productos que la tienen
productSchema.index(
  { referenciaNormalizada: 1 },
  { unique: true, name: 'referenciaNormalizada_unica', partialFilterExpression: { referenciaNormalizada: { $type: 'string' } } }
);
productSchema.index({ claveBusqueda: 1 }, { name: 'claveBusqueda' });

// Se recalculan en cada save(). Para cambiar referencia o equivalencias use save(), no updateOne/findOneAndUpdate.
productSchema.pre('validate', function () {
  this.referenciaNormalizada = normalizarReferencia(this.referencia) || undefined;
  this.claveBusqueda = [...new Set(
    [this.referencia, ...(this.equivalencias || [])].map(claveDeBusqueda).filter(Boolean)
  )];
});

// Método para modificar la respuesta JSON del modelo
productSchema.methods.toJSON = function () {
  const { __v, _id, estado, referenciaNormalizada, claveBusqueda, ...product } = this.toObject();
  product.uid = _id;
  return product;
};

module.exports = mongoose.model('Product', productSchema);
