const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/productos.controller');

const router = express.Router();

// Lectura pública del catálogo publicado. La escritura está en /api/admin/productos.
router.get('/obtener', controller.getAll);
router.get('/obtenerPorId/:id', controller.getById);

// Generar el PDF es costoso (Chromium): máximo 5 por minuto por IP
const limitePdf = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes del catálogo. Espere un minuto.' }
});
router.get('/generarPdf/pdf', limitePdf, controller.generatePdf);
router.get('/generarPdfHtml/pdfHtml', limitePdf, controller.generatePdfHtml);

module.exports = router;
