const multer = require('multer');
const path = require('path');

const EXTENSIONES = ['.jpg', '.jpeg', '.png', '.webp'];

// Los archivos quedan en memoria; el servicio de almacenamiento decide dónde se guardan
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype.startsWith('image/') && EXTENSIONES.includes(ext)) return cb(null, true);
  const err = new Error('Solo se permiten imágenes JPG, PNG o WEBP');
  err.status = 400;
  cb(err);
};

const upload = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// El tipo real se comprueba por el contenido (firma del archivo), no por el nombre que envía el cliente
function tipoReal(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

// Uso: upload.single('imagen'), verificarImagen({ requerida: true })
const verificarImagen = ({ requerida = true } = {}) => (req, res, next) => {
  if (!req.file) {
    if (!requerida) return next();
    return res.status(400).json({ ok: false, error: 'Adjunte una imagen' });
  }
  const tipo = tipoReal(req.file.buffer);
  if (!tipo) return res.status(400).json({ ok: false, error: 'Solo se permiten imágenes JPG, PNG o WEBP' });
  req.file.extension = tipo;
  next();
};

module.exports = upload;
module.exports.verificarImagen = verificarImagen;
module.exports.tipoReal = tipoReal;
