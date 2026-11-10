const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuario.models');

const generarJWT = (uid) =>
  jwt.sign({ uid }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Correo y contraseña son requeridos' });
    }

    const usuario = await Usuario.findOne({ email: String(email).toLowerCase().trim() });
    // Mismo mensaje en ambos casos para no revelar qué correos existen
    const valido = usuario && usuario.estado && (await bcrypt.compare(String(password), usuario.password));
    if (!valido) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos' });
    }

    usuario.ultimoAcceso = new Date();
    await usuario.save();

    res.status(200).json({ ok: true, usuario, token: generarJWT(usuario._id.toString()) });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ ok: false, error: 'Internal Server Error' });
  }
};

// Devuelve el usuario de la sesión y renueva el token
const renovar = async (req, res) => {
  res.status(200).json({ ok: true, usuario: req.usuario, token: generarJWT(req.usuario._id.toString()) });
};

module.exports = { login, renovar };
