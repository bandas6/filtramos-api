const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Convierte una imagen de /public a data URI para incrustarla en el PDF
function getBase64Image(relativePath) {
  if (!relativePath) return null;
  const absolutePath = path.join(PUBLIC_DIR, relativePath);
  // Evita leer archivos fuera de /public (p. ej. "../../.env")
  if (!absolutePath.startsWith(PUBLIC_DIR + path.sep)) return null;
  try {
    const file = fs.readFileSync(absolutePath);
    let ext = path.extname(relativePath).substring(1).toLowerCase();
    if (ext === 'jpg') ext = 'jpeg';
    return `data:image/${ext};base64,${file.toString('base64')}`;
  } catch (err) {
    console.warn('No se pudo cargar imagen:', relativePath);
    return null;
  }
}

module.exports = { getBase64Image };
