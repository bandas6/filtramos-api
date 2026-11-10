// Revisa referencias duplicadas (sin distinguir mayúsculas) y, si no hay, crea el índice único.
// Uso:
//   npm run revisar-referencias   -> solo muestra duplicados y productos sin referencia; no cambia nada
//   npm run indice-referencia     -> además crea el índice único si no hay duplicados
require('dotenv').config();
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const Product = require('../models/productos.models');

const crear = process.argv.includes('--crear');

(async () => {
  await dbConnection();
  const col = Product.collection;

  const sinReferencia = await col
    .find({ $or: [{ referencia: { $exists: false } }, { referencia: null }, { referencia: '' }] })
    .project({ _id: 1 })
    .toArray();

  const duplicados = await col.aggregate([
    { $match: { referencia: { $type: 'string', $ne: '' } } },
    { $group: { _id: { $toLower: { $trim: { input: '$referencia' } } }, n: { $sum: 1 }, items: { $push: { id: '$_id', referencia: '$referencia' } } } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { _id: 1 } }
  ]).toArray();

  console.log(`Productos sin referencia: ${sinReferencia.length}`);
  sinReferencia.forEach((p) => console.log(`  - ${p._id}`));

  console.log(`Referencias duplicadas: ${duplicados.length}`);
  duplicados.forEach((d) => {
    console.log(`  "${d._id}" (${d.n}):`);
    d.items.forEach((i) => console.log(`     ${i.id}  ${JSON.stringify(i.referencia)}`));
  });

  if (crear) {
    if (duplicados.length) {
      console.error('No se crea el índice: corrija primero los duplicados.');
      process.exitCode = 1;
    } else {
      await col.createIndex(
        { referencia: 1 },
        {
          name: 'referencia_unica',
          unique: true,
          collation: Product.COLACION_REFERENCIA,
          // Los productos viejos sin referencia no bloquean el índice
          partialFilterExpression: { referencia: { $type: 'string' } }
        }
      );
      console.log('Índice único "referencia_unica" creado.');
    }
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
