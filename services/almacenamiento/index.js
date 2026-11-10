// Interfaz de almacenamiento de imágenes. El resto del código solo usa estas funciones:
//   guardar({ buffer, extension, carpeta }) -> { url }
//   eliminar(url) -> void
//   leer(url) -> Buffer | null
// Proveedores: local (disco, por defecto) y cloudinary. Se elige con ALMACENAMIENTO.
const proveedores = {
  local: () => require('./local'),
  cloudinary: () => require('./cloudinary')
};

const nombre = process.env.ALMACENAMIENTO || 'local';
if (!proveedores[nombre]) {
  throw new Error(`ALMACENAMIENTO="${nombre}" no está disponible (opciones: ${Object.keys(proveedores).join(', ')})`);
}

module.exports = proveedores[nombre]();
