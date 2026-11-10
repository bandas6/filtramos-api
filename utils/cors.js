// Orígenes CORS y advertencias de configuración (se registran al arrancar la API).

const origenesDe = (texto) => String(texto || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);

// Devuelve una lista de advertencias en español; vacía si todo está bien.
function advertenciasCors(env = process.env) {
  const origenes = origenesDe(env.CORS_ORIGINS);
  const avisos = [];
  if (!origenes.length) {
    avisos.push('CORS_ORIGINS está vacío: el panel y el sitio no podrán llamar a la API desde el navegador.');
    return avisos;
  }
  // PANEL_URL y SITIO_URL son opcionales: si están definidas, deben estar permitidas
  for (const variable of ['PANEL_URL', 'SITIO_URL']) {
    const url = origenesDe(env[variable])[0];
    if (!url) continue;
    let origen;
    try { origen = new URL(url).origin; } catch { avisos.push(`${variable} no es una URL válida: "${url}".`); continue; }
    if (!origenes.includes(origen)) avisos.push(`CORS_ORIGINS no incluye ${origen} (${variable}): el navegador bloqueará esas peticiones.`);
  }
  if (env.NODE_ENV !== 'production' && !env.PANEL_URL && !origenes.includes('http://localhost:4200')) {
    avisos.push('CORS_ORIGINS no incluye http://localhost:4200: el panel local (ng serve) no podrá conectarse.');
  }
  return avisos;
}

module.exports = { origenesDe, advertenciasCors };
