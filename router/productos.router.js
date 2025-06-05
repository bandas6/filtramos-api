// routes/product.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/productos.controller');

router.get('/', controller.getAll);
router.post('', controller.create);
router.get('/pdf', controller.generatePdf); // Generar PDF del catálogo
router.get('/pdfHtml', controller.generatePdfHtml);
// otros endpoints: update, delete, etc.

module.exports = router;
