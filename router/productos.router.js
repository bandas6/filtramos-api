const express = require('express');
const router = express.Router();
const controller = require('../controllers/productos.controller');
const rateLimit = require('express-rate-limit');
const upload = require('../middlewares/upload');
const { validarJWT, tieneRol } = require('../middlewares/validar-jwt');

// Lectura pública (catálogo)
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

// Requieren sesión
router.get('/obtener/imagenes', validarJWT, controller.getFiles);
router.post('/crear', validarJWT, tieneRol('admin'), controller.create);
router.post('/crear/imagen', validarJWT, tieneRol('admin'), upload.single('imagen'), controller.createWithImage);
router.put('/actualizar/:id', validarJWT, tieneRol('admin'), controller.update);
router.delete('/remover/:id', validarJWT, tieneRol('admin'), controller.remove);

module.exports = router;
