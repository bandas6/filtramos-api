const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const Usuario = require('../../models/usuario.models');
const { ROLES } = require('../../models/usuario.models');

const MIN_PASSWORD = 10;
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const error400 = (res, error) => res.status(400).json({ ok: false, error });
const noEncontrado = (res) => res.status(404).json({ ok: false, error: 'Usuario no encontrado' });

// ¿Quedaría al menos otro administrador activo si este deja de serlo?
const hayOtroAdmin = (id) => Usuario.exists({ _id: { $ne: id }, rol: 'admin', estado: true });

// GET /api/admin/usuarios
const listar = async (req, res) => {
  const usuarios = await Usuario.find().sort({ estado: -1, nombre: 1 });
  res.json({ ok: true, usuarios, roles: ROLES });
};

// POST /api/admin/usuarios  { nombre, email, rol, password }
const crear = async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const email = String(req.body?.email || '').toLowerCase().trim();
  const rol = req.body?.rol;
  const password = String(req.body?.password || '');

  if (!nombre) return error400(res, 'El nombre es requerido');
  if (!emailValido(email)) return error400(res, 'Escriba un correo válido');
  if (!ROLES.includes(rol)) return error400(res, 'Rol no válido');
  if (password.length < MIN_PASSWORD) return error400(res, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);
  if (await Usuario.exists({ email })) return error400(res, 'Ya existe un usuario con ese correo');

  try {
    const usuario = await Usuario.create({ nombre, email, rol, password: await bcrypt.hash(password, 10) });
    res.status(201).json({ ok: true, usuario });
  } catch (err) {
    if (err.code === 11000) return error400(res, 'Ya existe un usuario con ese correo');
    throw err;
  }
};

// PUT /api/admin/usuarios/:id  { nombre?, rol?, estado? }
const actualizar = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return noEncontrado(res);
  const usuario = await Usuario.findById(id);
  if (!usuario) return noEncontrado(res);

  const cambios = {};
  if (req.body?.nombre !== undefined) {
    cambios.nombre = String(req.body.nombre).trim();
    if (!cambios.nombre) return error400(res, 'El nombre es requerido');
  }
  if (req.body?.rol !== undefined) {
    if (!ROLES.includes(req.body.rol)) return error400(res, 'Rol no válido');
    cambios.rol = req.body.rol;
  }
  if (req.body?.estado !== undefined) {
    if (typeof req.body.estado !== 'boolean') return error400(res, 'Estado no válido');
    cambios.estado = req.body.estado;
  }

  const esUnoMismo = String(usuario._id) === String(req.usuario._id);
  if (esUnoMismo && cambios.estado === false) return error400(res, 'No puede desactivarse a sí mismo');

  const dejaDeSerAdminActivo = usuario.rol === 'admin' && usuario.estado &&
    ((cambios.rol && cambios.rol !== 'admin') || cambios.estado === false);
  if (dejaDeSerAdminActivo && !(await hayOtroAdmin(usuario._id))) {
    return error400(res, 'Debe quedar al menos un administrador activo');
  }

  usuario.set(cambios);
  await usuario.save();
  res.json({ ok: true, usuario });
};

// POST /api/admin/usuarios/:id/password  { password }
// Fija una contraseña nueva y cierra las sesiones abiertas de ese usuario.
const restablecerPassword = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return noEncontrado(res);
  const password = String(req.body?.password || '');
  if (password.length < MIN_PASSWORD) return error400(res, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`);

  const usuario = await Usuario.findById(id);
  if (!usuario) return noEncontrado(res);
  usuario.password = await bcrypt.hash(password, 10);
  usuario.passwordCambiadoEn = new Date();
  await usuario.save();
  res.json({ ok: true, cerroSesion: String(usuario._id) === String(req.usuario._id) });
};

module.exports = { listar, crear, actualizar, restablecerPassword };
