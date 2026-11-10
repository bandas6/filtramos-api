// Rutas públicas heredadas (/api/productos): lectura del catálogo publicado y catálogo PDF.
// La escritura está en /api/admin/productos; el sitio público nuevo usa /api/public (etapa F).
const mongoose = require('mongoose');
const Product = require('../models/productos.models');
const ejs = require('ejs');
const path = require('path');
const { generatePdf: generatePdfFile, generatePdfFromHtml } = require('../utils/generador-pdf.utils');
const { getBase64Image } = require('../middlewares/genB64');
const { claveDeBusqueda } = require('../utils/referencias');
const { TIPOS } = require('../utils/catalogo');
const almacenamiento = require('../services/almacenamiento');

const PUBLICADOS = { estado: true, publicado: true };

const textoEquivalencias = (p) => (p.equivalencias || []).map((e) => `${e.marca} ${e.referencia}`).join(', ');

// GET /api/productos/obtener?q=  (solo publicados; sin precio de distribuidor)
const getAll = async (req, res) => {
  try {
    const clave = claveDeBusqueda(req.query.q);
    const filtro = clave ? { ...PUBLICADOS, claveBusqueda: { $regex: clave } } : PUBLICADOS;
    const products = await Product.find(filtro).sort({ referenciaNormalizada: 1 });
    res.status(200).json({ ok: true, products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

const getById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    const product = await Product.findOne({ _id: req.params.id, ...PUBLICADOS });
    if (!product) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    res.status(200).json({ ok: true, product });
  } catch (error) {
    console.error('Error fetching product by ID:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

// PDF básico (pdfkit)
const generatePdf = async (req, res) => {
  try {
    const products = await Product.find(PUBLICADOS).sort({ referenciaNormalizada: 1 });
    const pdfBuffer = await generatePdfFile(products.map((p) => ({ ...p.toJSON(), equivalenciasTexto: textoEquivalencias(p) })));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=catalogo.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

const dataUri = async (url) => {
  const buffer = await almacenamiento.leer(url);
  if (!buffer) return null;
  const ext = path.extname(url).slice(1).toLowerCase().replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${buffer.toString('base64')}`;
};

// Catálogo PDF con la plantilla HTML: solo lo publicado (lo que dice el panel)
const generatePdfHtml = async (req, res) => {
  try {
    const products = await Product.find(PUBLICADOS).sort({ referenciaNormalizada: 1 });
    const productsWithImages = await Promise.all(products.map(async (p) => ({
      ...p.toJSON(),
      tipoNombre: TIPOS[p.tipo] || '',
      equivalenciasTexto: textoEquivalencias(p),
      imagesBase64: await Promise.all((p.imagesUrl || []).slice(0, 2).map(dataUri))
    })));

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
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};

module.exports = { getAll, getById, generatePdf, generatePdfHtml };
