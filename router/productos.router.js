const express = require('express');
const router = express.Router();
const controller = require('../controllers/productos.controller');
const upload = require('../middlewares/upload');

router.get('/obtener', controller.getAll);
router.get('/obtenerPorId/:id', controller.getById);
router.post('/crear', controller.create);
router.post('/crear/imagen', upload.single('imagen'), controller.createWithImage);
router.get('/obtener/imagenes', controller.getFiles);
router.put('/actualizar/:id', controller.update);
router.delete('/remover/:id', controller.remove);
router.get('/generarPdf/pdf', controller.generatePdf);
router.get('/generarPdfHtml/pdfHtml', controller.generatePdfHtml);

module.exports = router;
// Exportamos el router para que pueda ser utilizado en otros archivos
// Este archivo define las rutas de la API para manejar productos, incluyendo operaciones CRUD y generación de PDFs.
// Utiliza el controlador para manejar la lógica de negocio y un middleware de subida de archivos (multer) para manejar imágenes.
// Las rutas incluyen:
// - Obtener todos los productos
// - Obtener un producto por ID
// - Crear un producto (con y sin imagen)
// - Actualizar un producto por ID
// - Eliminar un producto por ID
// - Generar un PDF de todos los productos
// - Generar un PDF a partir de HTML de productos
