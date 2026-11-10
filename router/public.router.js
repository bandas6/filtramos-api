const express = require('express');
const rateLimit = require('express-rate-limit');
const ajustes = require('../controllers/admin/ajustes.controller');

const router = express.Router();

// Límite general de la API pública
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Espere un momento.' }
}));

router.get('/ajustes', ajustes.publicos);

module.exports = router;
