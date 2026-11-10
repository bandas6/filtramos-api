const mongoose = require('mongoose');
const Product = require('../models/productos.models');
const { normalizarReferencia, claveDeBusqueda } = require('../utils/referencias');
const Files = require('../models/files.models');
const ejs = require('ejs');
const path = require('path');
const { generatePdf: generatePdfFile, generatePdfFromHtml } = require('../utils/generador-pdf.utils');
const { getBase64Image } = require('../middlewares/genB64');

// Campos que se pueden escribir desde el panel (evita que se cuelen otros, p. ej. _id)
const CAMPOS = [
  'referencia', 'diametroExterno', 'diametroInterno', 'alto', 'alturaPliegue', 'cortePapel',
  'cantidadPliegues', 'malla', 'longitudMallaExterna', 'longitudMallaInterna', 'polibretano',
  'anillo', 'tapa', 'aplicaciones', 'equivalencias', 'imagesUrl', 'papeles', 'category', 'stock'
];
const limpiar = (body = {}) =>
  Object.fromEntries(Object.entries(body).filter(([k]) => CAMPOS.includes(k)));

// null o '' significa "sin dato"
const vacio = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

const esErrorDeDatos = (error) => error.name === 'ValidationError' || error.name === 'CastError';

// Busca otro producto con la misma referencia normalizada (mayúsculas y espacios no cuentan; guiones sí)
const referenciaEnUso = (referencia, excluirId) => {
  const filtro = { referenciaNormalizada: normalizarReferencia(referencia) };
  if (excluirId) filtro._id = { $ne: excluirId };
  return Product.exists(filtro);
};

// Obtener todos los productos. ?q= busca en referencia y equivalencias ignorando mayúsculas, espacios y guiones
const getAll = async (req, res) => {
  try {
    const clave = claveDeBusqueda(req.query.q);
    const filtro = clave ? { claveBusqueda: { $regex: clave } } : {};
    const products = await Product.find(filtro);
    res.status(200).json({ ok: true, products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Obtener un producto por ID
const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ ok: false, error: 'Product not found' });
    res.status(200).json({ ok: true, product });
  } catch (error) {
    if (esErrorDeDatos(error)) return res.status(404).json({ ok: false, error: 'Product not found' });
    console.error('Error fetching product by ID:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Crear producto
const create = async (req, res) => {
  try {
    const data = Object.fromEntries(Object.entries(limpiar(req.body)).filter(([, v]) => !vacio(v)));
    data.referencia = String(data.referencia || '').trim();

    if (!data.referencia) {
      return res.status(400).json({ ok: false, error: 'La referencia es requerida' });
    }

    if (await referenciaEnUso(data.referencia)) {
      return res.status(400).json({ ok: false, error: `Ya existe un producto con la referencia ${data.referencia}` });
    }

    const product = new Product(data);
    await product.save();

    res.status(201).json({ ok: true, product });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ ok: false, error: 'Ya existe un producto con esa referencia' });
    if (esErrorDeDatos(error)) return res.status(400).json({ ok: false, error: error.message });
    console.error('Error creating product:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Subir una imagen a la biblioteca de imágenes
const createWithImage = async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre || !req.file) {
      return res.status(400).json({ ok: false, error: 'El nombre y la imagen son requeridos' });
    }

    const file = new Files({
      nombre,
      imagen: `/uploads/${req.file.filename}`
    });

    await file.save();

    res.status(201).json({ ok: true, file });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Listar imágenes disponibles
const getFiles = async (req, res) => {
  try {
    const files = await Files.find({ estado: true });
    res.status(200).json({ ok: true, files });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Actualizar producto
const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }
    const data = limpiar(req.body);

    if ('referencia' in data) {
      data.referencia = String(data.referencia || '').trim();
      if (!data.referencia) {
        return res.status(400).json({ ok: false, error: 'La referencia no puede quedar vacía' });
      }
      if (await referenciaEnUso(data.referencia, id)) {
        return res.status(400).json({ ok: false, error: `Ya existe un producto con la referencia ${data.referencia}` });
      }
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }

    // Los campos enviados vacíos (null o '') se borran del documento.
    // Se guarda con save() para que el modelo recalcule la referencia normalizada y la clave de búsqueda.
    for (const [campo, valor] of Object.entries(data)) {
      product.set(campo, vacio(valor) ? undefined : valor);
    }
    await product.save();

    res.status(200).json({ ok: true, product });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ ok: false, error: 'Ya existe un producto con esa referencia' });
    if (esErrorDeDatos(error)) return res.status(400).json({ ok: false, error: error.message });
    console.error('Error updating product:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Eliminar producto
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Product.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }

    res.status(200).json({ ok: true, message: 'Product deleted successfully' });
  } catch (error) {
    if (esErrorDeDatos(error)) return res.status(404).json({ ok: false, error: 'Product not found' });
    console.error('Error deleting product:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Generar PDF básico
const generatePdf = async (req, res) => {
  try {
    const products = await Product.find();
    const pdfBuffer = await generatePdfFile(products);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=catalogo.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Generar el catálogo PDF a partir de la plantilla HTML
const generatePdfHtml = async (req, res) => {
  try {
    const products = await Product.find();

    // Convertir imágenes a base64 por producto
    const productsWithImages = products.map(p => ({
      ...p.toObject(),
      imagesBase64: Array.isArray(p.imagesUrl)
        ? p.imagesUrl.map(url => getBase64Image(url))
        : []
    }));

    const html = await ejs.renderFile(
      path.join(__dirname, '../templates/catalogo.ejs'),
      { products: productsWithImages, logoBase64: getBase64Image('/uploads/logo.png') }
    );

    const pdfBuffer = await generatePdfFromHtml(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=catalogo.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF from HTML:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

module.exports = {
  getAll,
  getById,
  create,
  createWithImage,
  update,
  remove,
  generatePdf,
  generatePdfHtml,
  getFiles
};
