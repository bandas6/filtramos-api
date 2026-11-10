// Interfaz de almacenamiento de imágenes. El resto del código solo usa estas funciones:
//   guardar({ buffer, extension, carpeta }) -> { url }
//   eliminar(url) -> void
//   leer(url) -> Buffer | null
// Hoy: disco local (public/uploads). En la etapa E se agrega ./cloudinary.js con la misma
// interfaz y se elige con ALMACENAMIENTO=cloudinary, sin tocar controladores ni panel.
const proveedores = {
  local: () => require('./local')
};

const nombre = process.env.ALMACENAMIENTO || 'local';
if (!proveedores[nombre]) {
  throw new Error(`ALMACENAMIENTO="${nombre}" no está disponible (opciones: ${Object.keys(proveedores).join(', ')})`);
}

module.exports = proveedores[nombre]();
