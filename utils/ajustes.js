// Ajustes del negocio que reemplazan los textos entre corchetes del diseño ([NÚMERO], [24–48 h], ...).
// "publico": se entrega en GET /api/public/ajustes. Los privados solo los ve el admin.
// Si un ajuste público está vacío, el sitio oculta la línea correspondiente.
const AJUSTES = [
  { clave: 'whatsappVentas', etiqueta: 'WhatsApp de ventas', publico: true, obligatorio: true, tipo: 'whatsapp',
    ayuda: 'Con indicativo de país, solo números. Ej.: 57 y el número de celular.' },
  { clave: 'correoContacto', etiqueta: 'Correo de contacto', publico: true, tipo: 'email' },
  { clave: 'direccion', etiqueta: 'Dirección', publico: true },
  { clave: 'ciudad', etiqueta: 'Ciudad', publico: true },
  { clave: 'tiempoDespacho', etiqueta: 'Tiempo de despacho', publico: true, ayuda: 'Se muestra como "Despacho en …". Ej.: 24–48 h' },
  { clave: 'tiempoFabricacion', etiqueta: 'Tiempo de fabricación bajo pedido', publico: true, ayuda: 'Se muestra como "Lo fabricamos en …". Ej.: 8 días hábiles' },
  { clave: 'tiempoRespuestaCotizacion', etiqueta: 'Tiempo de respuesta de cotizaciones', publico: true, ayuda: 'Se muestra como "Cotizamos en …". Ej.: 24 horas' },
  { clave: 'garantia', etiqueta: 'Términos de garantía', publico: true, multilinea: true },
  { clave: 'politicaEnvios', etiqueta: 'Política de envíos', publico: true, multilinea: true },
  { clave: 'politicaDatos', etiqueta: 'Política de tratamiento de datos (Ley 1581)', publico: true, multilinea: true,
    ayuda: 'Texto o enlace que se muestra junto a la casilla de consentimiento de los formularios.' },
  { clave: 'correoAvisos', etiqueta: 'Correo interno para avisos', publico: false, tipo: 'email',
    ayuda: 'No se muestra en el sitio.' }
];

const CLAVES = AJUSTES.map((a) => a.clave);
const PUBLICOS = AJUSTES.filter((a) => a.publico).map((a) => a.clave);

// Devuelve el valor limpio o lanza un mensaje de error
function validarAjuste(def, valor) {
  if (valor === null || valor === undefined) return undefined;
  const texto = String(valor).trim();
  if (!texto) return undefined;
  if (texto.length > 2000) throw new Error(`${def.etiqueta}: máximo 2000 caracteres`);
  if (def.tipo === 'whatsapp') {
    const digitos = texto.replace(/[\s+()-]/g, '');
    if (!/^\d{10,15}$/.test(digitos)) throw new Error(`${def.etiqueta}: escriba solo números, con indicativo de país (10 a 15 dígitos)`);
    return digitos;
  }
  if (def.tipo === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto)) {
    throw new Error(`${def.etiqueta}: correo no válido`);
  }
  return texto;
}

module.exports = { AJUSTES, CLAVES, PUBLICOS, validarAjuste };
