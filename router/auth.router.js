const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, renovar } = require('../controllers/auth.controller');
const { validarJWT } = require('../middlewares/validar-jwt');

const router = express.Router();

// Máximo 10 intentos FALLIDOS de login cada 15 minutos por IP
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Espere unos minutos.' }
});

router.post('/login', limiteLogin, login);
router.get('/renovar', validarJWT, renovar);

module.exports = router;
