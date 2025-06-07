const fs = require('fs');
const path = require('path');

function getBase64Image(relativePath) {
  const absolutePath = path.join(__dirname, '..', 'public', relativePath); // ajusta si estás en otra carpeta
  try {
    const file = fs.readFileSync(absolutePath);
    const ext = path.extname(relativePath).substring(1); // jpg, png, etc
    return `data:image/${ext};base64,${file.toString('base64')}`;
  } catch (err) {
    console.warn('No se pudo cargar imagen:', relativePath);
    return null;
  }
}

module.exports = {
  getBase64Image
};