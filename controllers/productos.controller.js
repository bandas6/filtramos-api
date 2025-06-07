const Product = require('../models/productos.models');
const Files = require('../models/files.models');
const ejs = require('ejs');
const path = require('path');
const { generatePdfFile, generatePdfFromHtml } = require('../utils/generador-pdf.utils');
const { getBase64Image } = require('../middlewares/genB64');

// Obtener todos los productos
const getAll = async (req, res) => {
  try {
    const products = await Product.find();
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
    console.error('Error fetching product by ID:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Crear producto sin imagen
const create = async (req, res) => {
  try {
    const { nombre, precio, descripcion } = req.body;

    if (!nombre || !precio) {
      return res.status(400).json({ ok: false, error: 'Nombre y precio son requeridos' });
    }

    const product = new Product(req.body);
    await product.save();

    res.status(200).json({ ok: true, product });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Crear producto con imagen
const createWithImage = async (req, res) => {
  try {
    const { nombre } = req.body;

    if (!nombre) {
      return res.status(400).json({ ok: false, error: 'Nombre y precio son requeridos' });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const file = new Files({
      nombre,
      imagen: imagePath
    });

    await file.save();

    res.status(200).json({ ok: true, file });
  } catch (error) {
    console.error('Error creating product with image:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Crear producto con imagen
const getFiles = async (req, res) => {
  try {

    const files = await Files.find({ estado: true });

    res.status(200).json({ ok: true, files });

  } catch (error) {
    console.error('Error creating product with image:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Actualizar producto
const update = async (req, res) => {
  try {
    const { id } = req.params;

    const updatedProduct = await Product.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedProduct) {
      return res.status(404).json({ ok: false, error: 'Product not found' });
    }

    res.status(200).json({ ok: true, product: updatedProduct });
  } catch (error) {
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

// Controlador para generar PDF
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

    // Renderizar HTML con las imágenes embebidas
    const html = await ejs.renderFile(
      path.join(__dirname, '../templates/catalogo.ejs'),
      { products: productsWithImages }
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
