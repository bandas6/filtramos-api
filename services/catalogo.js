// Operaciones de catálogo compartidas por el panel y el importador.
const Product = require('../models/productos.models');
const { slugDe } = require('../utils/catalogo');

/**
 * Slug libre a partir de la referencia ("ft-ap-1021", "ft-ap-1021-2", ...).
 * session: para ver lo escrito dentro de una transacción. usados: slugs ya tomados en el mismo lote.
 */
async function slugLibre(referencia, { excluirId, session, usados } = {}) {
  const base = slugDe(referencia) || 'producto';
  for (let n = 1; ; n++) {
    const candidato = n === 1 ? base : `${base}-${n}`;
    if (usados?.has(candidato)) continue;
    const filtro = { slug: candidato };
    if (excluirId) filtro._id = { $ne: excluirId };
    const existe = await Product.exists(filtro).session(session || null);
    if (!existe) {
      usados?.add(candidato);
      return candidato;
    }
  }
}

module.exports = { slugLibre };
