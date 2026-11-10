// Migración de datos del modelo anterior al de la etapa B. No borra datos.
//   - polibretano -> poliuretano
//   - equivalencias de texto ("Donaldson P181") -> { marca, referencia } (primera palabra = marca)
//   - diametroExterno de texto -> número (si no es numérico, se deja y se informa)
//   - category -> se conserva y se informa (el tipo nuevo se asigna en el panel)
// Uso:
//   npm run migrar:b               -> muestra lo que cambiaría. No cambia nada.
//   npm run migrar:b -- --aplicar  -> aplica.
require('dotenv').config();
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const { confirmarBase } = require('./confirmar-base');

const aplicar = process.argv.includes('--aplicar');

const equivalenciaDeTexto = (texto) => {
  const t = String(texto).trim();
  const i = t.indexOf(' ');
  return i > 0 ? { marca: t.slice(0, i), referencia: t.slice(i + 1).trim() } : { marca: '', referencia: t };
};

(async () => {
  await dbConnection();
  if (aplicar) await confirmarBase('migrar productos (etapa B)');
  const col = mongoose.connection.db.collection('products');
  const docs = await col.find({}).toArray();
  console.log(`Base: ${mongoose.connection.db.databaseName} · productos: ${docs.length}${aplicar ? '' : ' (solo revisión)'}`);

  let cambios = 0;
  const avisos = [];
  for (const d of docs) {
    const $set = {};
    const $unset = {};
    if (d.polibretano !== undefined) {
      if (d.poliuretano === undefined) $set.poliuretano = d.polibretano;
      $unset.polibretano = '';
    }
    if (Array.isArray(d.equivalencias) && d.equivalencias.some((e) => typeof e === 'string')) {
      $set.equivalencias = d.equivalencias.map((e) => (typeof e === 'string' ? equivalenciaDeTexto(e) : e));
      $set.equivalencias.filter((e) => !e.marca).forEach((e) => avisos.push(`${d.referencia}: equivalencia "${e.referencia}" sin marca`));
    }
    if (typeof d.diametroExterno === 'string') {
      const n = Number(d.diametroExterno.replace(',', '.'));
      if (Number.isFinite(n)) $set.diametroExterno = n;
      else avisos.push(`${d.referencia}: diámetro externo "${d.diametroExterno}" no es numérico`);
    }
    if (d.category && !d.tipo) avisos.push(`${d.referencia}: tenía categoría "${d.category}"; asigne el tipo en el panel`);

    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    if (Object.keys(update).length) {
      cambios++;
      console.log(`- ${d.referencia}: ${JSON.stringify(update)}`);
      if (aplicar) await col.updateOne({ _id: d._id }, update);
    }
  }
  console.log(`Productos con cambios: ${cambios}`);
  avisos.forEach((a) => console.log(`  ⚠ ${a}`));
  if (aplicar && cambios) console.log('Luego ejecute: npm run indices -- --aplicar (recalcula campos y crea índices)');
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
