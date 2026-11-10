const express = require('express');
const router = express.Router();
const controller = require('../controllers/productos.controller');
const upload = require('../middlewares/upload');
const { validarJWT, tieneRol } = require('../middlewares/validar-jwt');

// Lectura pública (catálogo)
router.get('/obtener', controller.getAll);
router.get('/obtenerPorId/:id', controller.getById);
router.get('/generarPdf/pdf', controller.generatePdf);
router.get('/generarPdfHtml/pdfHtml', controller.generatePdfHtml);

// Requieren sesión
router.get('/obtener/imagenes', validarJWT, controller.getFiles);
router.post('/crear', validarJWT, tieneRol('admin'), controller.create);
router.post('/crear/imagen', validarJWT, tieneRol('admin'), upload.single('imagen'), controller.createWithImage);
router.put('/actualizar/:id', validarJWT, tieneRol('admin'), controller.update);
router.delete('/remover/:id', validarJWT, tieneRol('admin'), controller.remove);

module.exports = router;
