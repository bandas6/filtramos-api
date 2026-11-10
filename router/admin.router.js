const express = require('express');
const { validarJWT, tieneRol } = require('../middlewares/validar-jwt');
const upload = require('../middlewares/upload');
const { verificarImagen } = require('../middlewares/upload');
const productos = require('../controllers/admin/productos.controller');
const usuarios = require('../controllers/admin/usuarios.controller');
const ajustes = require('../controllers/admin/ajustes.controller');
const imagenes = require('../controllers/admin/imagenes.controller');
const inventario = require('../controllers/admin/inventario.controller');

const router = express.Router();
const soloAdmin = tieneRol('admin');

// Todo /api/admin exige sesión. Lectura: cualquier rol. Escritura: según la ruta.
router.use(validarJWT);

router.get('/resumen', productos.resumen);
router.get('/productos', productos.listar);
router.get('/productos/opciones', productos.opciones);
router.get('/productos/:id', productos.obtener);
router.post('/productos', soloAdmin, productos.crear);
router.put('/productos/:id', soloAdmin, productos.actualizar);
router.delete('/productos/:id', soloAdmin, productos.eliminar);

router.get('/inventario', inventario.inventario);
router.get('/movimientos', inventario.listarMovimientos);
router.post('/movimientos', tieneRol('admin', 'bodega'), inventario.crearMovimiento);

router.get('/imagenes', imagenes.listar);
router.post('/imagenes', soloAdmin, upload.single('imagen'), verificarImagen(), imagenes.subir);
router.delete('/imagenes/:id', soloAdmin, imagenes.eliminar);

router.get('/ajustes/estado', ajustes.estado);
router.get('/ajustes', soloAdmin, ajustes.obtener);
router.put('/ajustes', soloAdmin, ajustes.guardar);

router.get('/usuarios', soloAdmin, usuarios.listar);
router.post('/usuarios', soloAdmin, usuarios.crear);
router.put('/usuarios/:id', soloAdmin, usuarios.actualizar);
router.post('/usuarios/:id/password', soloAdmin, usuarios.restablecerPassword);

module.exports = router;
