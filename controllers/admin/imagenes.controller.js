const mongoose = require('mongoose');
const Files = require('../../models/files.models');
const Product = require('../../models/productos.models');
const almacenamiento = require('../../services/almacenamiento');

// GET /api/admin/imagenes
const listar = async (req, res) => {
  const files = await Files.find({ estado: true }).sort({ createdAt: -1 });
  res.json({ ok: true, imagenes: files });
};

// POST /api/admin/imagenes (multipart: imagen, nombre)
const subir = async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim() || req.file.originalname;
  const { url } = await almacenamiento.guardar({ buffer: req.file.buffer, extension: req.file.extension });
  const file = await Files.create({ nombre: nombre.slice(0, 120), imagen: url });
  res.status(201).json({ ok: true, imagen: file });
};

// DELETE /api/admin/imagenes/:id (no se borra si algún producto la usa)
const eliminar = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: 'Imagen no encontrada' });
  const file = await Files.findById(req.params.id);
  if (!file) return res.status(404).json({ ok: false, error: 'Imagen no encontrada' });
  const enUso = await Product.find({ imagesUrl: file.imagen, estado: true }, { referencia: 1 }).lean();
  if (enUso.length) {
    return res.status(409).json({ ok: false, error: `La usan: ${enUso.map((p) => p.referencia).join(', ')}` });
  }
  await file.deleteOne();
  await almacenamiento.eliminar(file.imagen);
  res.json({ ok: true });
};

module.exports = { listar, subir, eliminar };
