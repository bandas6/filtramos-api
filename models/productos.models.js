const mongoose = require('mongoose');
const { normalizarReferencia, claveDeBusqueda } = require('../utils/referencias');
const { TIPOS, motivosDeBorrador } = require('../utils/catalogo');

const { Schema } = mongoose;

const entero = { validator: Number.isInteger, message: '{PATH} debe ser un número entero' };

const tramoSchema = new Schema({
  desde: { type: Number, required: [true, 'Cada tramo de volumen necesita la cantidad "desde"'], min: [2, 'Los tramos por volumen empiezan desde 2 unidades'], validate: entero },
  precio: { type: Number, required: [true, 'Cada tramo de volumen necesita un precio'], min: [0, 'El precio no puede ser negativo'] }
}, { _id: false });

const equivalenciaSchema = new Schema({
  marca: { type: String, trim: true }, // opcional: hay listas que solo traen la referencia
  referencia: { type: String, trim: true, required: [true, 'Cada equivalencia necesita la referencia'] }
}, { _id: false });

const componenteSchema = new Schema({
  producto: { type: Schema.Types.ObjectId, ref: 'Product', required: [true, 'Cada componente del kit necesita un producto'] },
  cantidad: { type: Number, default: 1, min: [1, 'La cantidad de un componente es al menos 1'], validate: entero }
}, { _id: false });

const numeroMm = { type: Number, min: [0, '{PATH} no puede ser negativo'] };

const productSchema = new Schema({
  referencia: { type: String, required: [true, 'La referencia es requerida'], trim: true },
  slug: { type: String, trim: true },
  tipo: { type: String, enum: { values: Object.keys(TIPOS), message: 'Tipo de producto no válido' } },
  descripcion: { type: String, trim: true },
  codigoSiigo: { type: String, trim: true },

  // El precio de distribuidor nunca sale en las respuestas públicas (ver toJSON)
  precios: {
    publico: { type: Number, min: [0, 'El precio no puede ser negativo'] },
    volumen: { type: [tramoSchema], default: [] },
    distribuidor: { type: Number, min: [0, 'El precio no puede ser negativo'] }
  },

  equivalencias: { type: [equivalenciaSchema], default: [] },
  aplicaciones: { type: [String], default: [] },
  intervaloCambio: { type: String, trim: true }, // p. ej. "500 horas"

  // Ficha técnica (mm salvo cantidadPliegues)
  diametroExterno: numeroMm,
  diametroInterno: numeroMm,
  alto: numeroMm,
  alturaPliegue: numeroMm,
  cortePapel: numeroMm,
  cantidadPliegues: { type: Number, min: [0, 'La cantidad de pliegues no puede ser negativa'], validate: entero },
  malla: { type: String, trim: true },
  longitudMallaExterna: { type: String, trim: true },
  longitudMallaInterna: { type: String, trim: true },
  poliuretano: { type: String, trim: true },
  anillo: { type: String, trim: true },
  tapa: { type: String, trim: true },
  papeles: { type: [String], default: [] },

  // Fotos en orden; la primera es la principal
  imagesUrl: { type: [String], default: [] },

  kit: { type: [componenteSchema], default: [] },

  // Publicación: "publicar" lo decide el admin; "publicado" y "motivosBorrador" se calculan
  publicar: { type: Boolean, default: true },
  publicado: { type: Boolean, default: false },
  motivosBorrador: { type: [String], default: [] },

  // Inventario. En la etapa C se calculan a partir de los movimientos (caché).
  stock: { type: Number, default: 0 },
  reservado: { type: Number, default: 0 },
  stockMinimo: { type: Number, default: 0, min: [0, 'El stock mínimo no puede ser negativo'], validate: entero },

  estado: { type: Boolean, default: true },

  // Calculados en el hook de abajo; no se escriben desde el panel
  referenciaNormalizada: { type: String },        // unicidad: mayúsculas, sin espacios, con guiones
  claveBusqueda: { type: [String], default: [] }  // búsqueda: solo letras y números
}, { timestamps: true });

// Única entre los productos que la tienen
productSchema.index(
  { referenciaNormalizada: 1 },
  { unique: true, name: 'referenciaNormalizada_unica', partialFilterExpression: { referenciaNormalizada: { $type: 'string' } } }
);
productSchema.index({ slug: 1 }, { unique: true, name: 'slug_unico', partialFilterExpression: { slug: { $type: 'string' } } });
productSchema.index({ claveBusqueda: 1 }, { name: 'claveBusqueda' });
productSchema.index({ tipo: 1, publicado: 1 }, { name: 'tipo_publicado' });

// Se recalculan en cada save(). Para cambiar estos datos use save(), no updateOne/findOneAndUpdate.
productSchema.pre('validate', function () {
  this.referenciaNormalizada = normalizarReferencia(this.referencia) || undefined;

  const textos = [
    this.referencia,
    ...(this.equivalencias || []).flatMap((e) => [e.referencia, [e.marca, e.referencia].filter(Boolean).join(' ')]),
    ...(this.aplicaciones || [])
  ];
  this.claveBusqueda = [...new Set(textos.map(claveDeBusqueda).filter(Boolean))];

  // Tramos por volumen: ordenados y sin cantidades repetidas
  const tramos = this.precios?.volumen || [];
  const desdes = tramos.map((t) => t.desde);
  if (new Set(desdes).size !== desdes.length) {
    // (no reasignar la ruta después de invalidar: Mongoose borraría el error)
    this.invalidate('precios.volumen', 'Hay tramos por volumen con la misma cantidad "desde"');
  } else if (tramos.length > 1 && desdes.some((d, i) => i > 0 && d < desdes[i - 1])) {
    this.precios.volumen = [...tramos].sort((a, b) => a.desde - b.desde);
  }

  this.motivosBorrador = motivosDeBorrador(this);
  this.publicado = this.motivosBorrador.length === 0;
});

function serializar(doc, { conPrecioDistribuidor }) {
  const { __v, _id, estado, referenciaNormalizada, claveBusqueda, ...product } = doc.toObject();
  product.uid = _id;
  if (product.precios && !conPrecioDistribuidor) delete product.precios.distribuidor;
  return product;
}

// Respuesta por defecto (pública): sin precio de distribuidor
productSchema.methods.toJSON = function () {
  return serializar(this, { conPrecioDistribuidor: false });
};

// Solo para rutas de admin
productSchema.methods.paraAdmin = function () {
  return serializar(this, { conPrecioDistribuidor: true });
};

module.exports = mongoose.model('Product', productSchema);
