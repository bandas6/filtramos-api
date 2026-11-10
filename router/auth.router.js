const express = require('express');
const rateLimit = require('express-rate-limit');
const { login, renovar, preferencias, demo } = require('../controllers/auth.controller');
const { validarJWT } = require('../middlewares/validar-jwt');

const router = express.Router();

// Máximo 10 intentos FALLIDOS de login cada 15 minutos por IP
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  // Dice cuántos minutos faltan para que el panel lo muestre
  handler: (req, res, next, opciones) => {
    const reset = req.rateLimit?.resetTime;
    const minutos = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 60000)) : 15;
    res.status(opciones.statusCode).json({
      ok: false, codigo: 'demasiados-intentos', minutos,
      error: `Demasiados intentos fallidos. Espere ${minutos} minuto${minutos === 1 ? '' : 's'} e intente de nuevo.`
    });
  }
});

router.post('/login', limiteLogin, login);
router.get('/renovar', validarJWT, renovar);
router.patch('/preferencias', validarJWT, preferencias);
router.get('/demo', demo);

module.exports = router;
