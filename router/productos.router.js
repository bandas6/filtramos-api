// routes/product.routes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/productos.controller');

router.get('/obtener', controller.getAll);
router.post('/crear', controller.create);
router.put('/actualizar/:id', controller.update); // Actualizar producto por ID
router.delete('/remover/:id', controller.remove); // Eliminar producto por ID
router.get('/obtenerPorId/:id', controller.getById); // Obtener producto por ID
router.get('/generarPdf/pdf', controller.generatePdf); // Generar PDF del catálogo
router.get('/generarPdfHtml/pdfHtml', controller.generatePdfHtml);
// otros endpoints: update, delete, etc.

module.exports = router;
