const express = require('express');
const rateLimit = require('express-rate-limit');
const ajustes = require('../controllers/admin/ajustes.controller');
const publico = require('../controllers/public.controller');
const upload = require('../middlewares/upload');
const { verificarImagen } = require('../middlewares/upload');

const router = express.Router();

const limite = (windowMs, limit, error) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { ok: false, error }
});

// Límite general de la API pública
// Lectura: alto, porque el servidor del sitio (SSR) consulta desde una sola IP
router.use(limite(60 * 1000, 600, 'Demasiadas solicitudes. Espere un momento.'));
// Formularios: más estricto
const limiteFormularios = limite(60 * 60 * 1000, Number(process.env.LIMITE_FORMULARIOS_HORA) || 10, 'Ha enviado muchos formularios. Intente más tarde o escríbanos por WhatsApp.');

router.get('/ajustes', ajustes.publicos);
router.get('/productos', publico.buscar);
router.get('/tipos', publico.tipos);
router.get('/productos/destacados', publico.destacados);
router.get('/productos/:slug', publico.detalle);
router.get('/kits', publico.kits);
router.get('/sitemap', publico.sitemap);

router.post('/solicitudes-medida', limiteFormularios, upload.single('foto'), verificarImagen({ requerida: false }), publico.solicitudMedida);
router.post('/recordatorios', limiteFormularios, publico.recordatorio);
router.post('/pedidos', limiteFormularios, publico.pedido);

module.exports = router;
