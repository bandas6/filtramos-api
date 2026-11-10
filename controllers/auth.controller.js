const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Usuario = require('../models/usuario.models');
const { SECCIONES_AYUDA, PASOS } = require('../models/usuario.models');

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

// PATCH /api/auth/preferencias  { ayudaCerrada?: string[], pasosNoAplica?: string[] }
// Solo cambia las preferencias del propio usuario; ignora claves desconocidas.
const preferencias = async (req, res) => {
  const cuerpo = req.body || {};
  const validas = { ayudaCerrada: SECCIONES_AYUDA, pasosNoAplica: PASOS };
  for (const [campo, permitidas] of Object.entries(validas)) {
    if (!(campo in cuerpo)) continue;
    if (!Array.isArray(cuerpo[campo])) {
      return res.status(400).json({ ok: false, error: `${campo} debe ser una lista` });
    }
    const lista = [...new Set(cuerpo[campo].map(String))];
    const raras = lista.filter((v) => !permitidas.includes(v));
    if (raras.length) return res.status(400).json({ ok: false, error: `Valores no válidos: ${raras.join(', ')}` });
    req.usuario.set(`preferencias.${campo}`, lista);
  }
  await req.usuario.save();
  res.json({ ok: true, preferencias: req.usuario.preferencias });
};

// GET /api/auth/demo -> usuarios de demostración. SOLO existe con la API en memoria (DEMO_MEMORIA=1).
const demo = (req, res) => {
  if (process.env.DEMO_MEMORIA !== '1' || process.env.NODE_ENV === 'production') return res.status(404).json({ ok: false, error: 'No encontrado' });
  res.json({
    ok: true,
    usuarios: ['admin', 'bodega', 'ventas'].map((rol) => ({ rol, email: `${rol}@demo.local`, password: `demo-${rol}-12345` }))
  });
};

module.exports = { login, renovar, preferencias, demo };
