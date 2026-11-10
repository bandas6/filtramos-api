const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuario.models');

// Exige un token válido en el encabezado Authorization: Bearer <token>
const validarJWT = async (req, res, next) => {
  const header = req.header('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'No hay sesión iniciada' });
  }

  try {
    const { uid, iat } = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await Usuario.findById(uid);
    if (!usuario || !usuario.estado) {
      return res.status(401).json({ ok: false, error: 'Usuario no válido' });
    }
    // Token anterior a un cambio de contraseña: ya no vale
    if (usuario.passwordCambiadoEn && iat < Math.floor(usuario.passwordCambiadoEn.getTime() / 1000)) {
      return res.status(401).json({ ok: false, error: 'Sesión vencida o inválida' });
    }
    req.usuario = usuario;
    next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'Sesión vencida o inválida' });
  }
};

// Uso: tieneRol('admin', 'bodega'). Debe ir después de validarJWT.
const tieneRol = (...roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({ ok: false, error: 'No tiene permisos para esta acción' });
  }
  next();
};

module.exports = { validarJWT, tieneRol };
