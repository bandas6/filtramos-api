// Revisa referencias duplicadas según la normalización (mayúsculas y espacios no cuentan; guiones sí)
// y, si no hay, completa los campos calculados y sincroniza los índices del modelo.
// Uso:
//   npm run revisar-referencias   -> solo muestra duplicados y productos sin referencia; no cambia nada
//   npm run indice-referencia     -> además completa referenciaNormalizada/claveBusqueda y crea los índices
require('dotenv').config();
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const Product = require('../models/productos.models');
const { normalizarReferencia, claveDeBusqueda } = require('../utils/referencias');

const crear = process.argv.includes('--crear');

(async () => {
  await dbConnection();
  const col = Product.collection;
  const docs = await col.find({}, { projection: { referencia: 1, equivalencias: 1 } }).toArray();

  const sinReferencia = docs.filter((d) => !normalizarReferencia(d.referencia));
  const grupos = new Map();
  for (const d of docs) {
    const n = normalizarReferencia(d.referencia);
    if (!n) continue;
    if (!grupos.has(n)) grupos.set(n, []);
    grupos.get(n).push(d);
  }
  const duplicados = [...grupos].filter(([, items]) => items.length > 1);

  console.log(`Productos: ${docs.length}`);
  console.log(`Sin referencia: ${sinReferencia.length}`);
  sinReferencia.forEach((p) => console.log(`  - ${p._id}`));
  console.log(`Referencias duplicadas: ${duplicados.length}`);
  duplicados.forEach(([n, items]) => {
    console.log(`  "${n}" (${items.length}):`);
    items.forEach((i) => console.log(`     ${i._id}  ${JSON.stringify(i.referencia)}`));
  });

  if (crear) {
    if (duplicados.length) {
      console.error('No se crean los índices: corrija primero los duplicados.');
      process.exitCode = 1;
    } else {
      // Completa los campos calculados en documentos anteriores al hook
      const ops = docs.map((d) => ({
        updateOne: {
          filter: { _id: d._id },
          update: normalizarReferencia(d.referencia)
            ? {
              $set: {
                referenciaNormalizada: normalizarReferencia(d.referencia),
                claveBusqueda: [...new Set([d.referencia, ...(d.equivalencias || [])].map(claveDeBusqueda).filter(Boolean))]
              }
            }
            : { $unset: { referenciaNormalizada: '' } }
        }
      }));
      if (ops.length) await col.bulkWrite(ops);
      // Crea los índices del modelo y elimina los que ya no están definidos (p. ej. el de colación anterior)
      const eliminados = await Product.syncIndexes();
      console.log(`Índices sincronizados. Eliminados: ${eliminados.length ? eliminados.join(', ') : 'ninguno'}`);
    }
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
