const Product = require('../models/productos.models');
const ejs = require('ejs');
const path = require('path');

const { generatePdfFile, generatePdfFromHtml } = require('../utils/generador-pdf.utils'); // renombrado

const getAll = async (req, res) => {
  try {
    const products = await Product.find();
    console.log(products);
    res.status(200).json(
      {
        ok: true,
        products: products
      }
    );
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json(
      {
        ok: false,
        error: 'Internal Server Error'
      }
    );
  }
};

const getById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found'
      });
    }
    res.status(200).json({
      ok: true,
      product: product
    });
  } catch (error) {
    console.error('Error fetching product by ID:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal Server Error'
    });
  }
};

const create = async (req, res) => {
  try {
    const product = new Product(req.body);

    await product.save();

    res.status(200).json({
      ok: true,
      product: product
    });

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal Server Error'
    });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(id, req.body, { new: true });
    if (!product) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found'
      });
    }
    res.status(200).json({
      ok: true,
      product: product
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal Server Error'
    });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({
        ok: false,
        error: 'Product not found'
      });
    }
    res.status(200).json({
      ok: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal Server Error'
    });
  }
};

const generatePdf = async (req, res) => {

  try {

    const products = await Product.find();
    const pdfBuffer = await generatePdfFile(products); // usa el nombre correcto
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdfBuffer);

  } catch (error) {

    console.error('Error generating PDF:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal Server Error'
    });

  }

};

const generatePdfHtml = async (req, res) => {
  try {
    const products = await Product.find();

    const html = await ejs.renderFile(
      path.join(__dirname, '../templates/catalogo.ejs'),
      { products }
    );

    const pdfBuffer = await generatePdfFromHtml(html);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=catalogo.pdf');
    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generating PDF from HTML:', error);
    res.status(500).json({
      ok: false,
      error: 'Internal Server Error'
    });
  }
};



module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  generatePdf,
  generatePdfHtml
};
