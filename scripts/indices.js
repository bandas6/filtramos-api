// Índices de todos los modelos. La app no los crea sola (autoIndex: false).
// Uso:
//   npm run indices               -> muestra qué índices se crearían o eliminarían. No cambia nada.
//   npm run indices -- --aplicar  -> los aplica. Se niega si hay referencias duplicadas.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const { confirmarBase } = require('./confirmar-base');
const { normalizarReferencia } = require('../utils/referencias');

const aplicar = process.argv.includes('--aplicar');

(async () => {
  for (const archivo of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
    if (archivo.endsWith('.models.js')) require(path.join(__dirname, '..', 'models', archivo));
  }
  await dbConnection();
  console.log(`Base: ${mongoose.connection.db.databaseName}${aplicar ? '' : ' (solo revisión, sin cambios)'}`);

  // Antes de crear el índice único de referencia: no puede haber duplicados
  const productos = await mongoose.model('Product').collection
    .find({}, { projection: { referencia: 1 } }).toArray();
  const vistos = new Map();
  for (const p of productos) {
    const n = normalizarReferencia(p.referencia);
    if (n) vistos.set(n, [...(vistos.get(n) || []), p._id]);
  }
  const duplicados = [...vistos].filter(([, ids]) => ids.length > 1);
  if (duplicados.length) {
    console.log('Referencias duplicadas (corríjalas antes de aplicar):');
    duplicados.forEach(([n, ids]) => console.log(`  ${n}: ${ids.join(', ')}`));
  }

  for (const modelo of Object.values(mongoose.models)) {
    const { toCreate, toDrop } = await modelo.diffIndexes();
    const crear = toCreate.map((i) => (i.options?.name || JSON.stringify(i.key || i)));
    console.log(`- ${modelo.collection.name}: crear [${crear.join(', ') || '—'}], eliminar [${toDrop.join(', ') || '—'}]`);
  }

  if (aplicar) {
    await confirmarBase('aplicar índices');
    if (duplicados.length) {
      console.error('No se aplicó nada: hay referencias duplicadas.');
      process.exitCode = 1;
    } else {
      // Completa campos calculados de productos anteriores a los hooks (save recalcula todo)
      const Product = mongoose.model('Product');
      for await (const doc of Product.find()) await doc.save({ validateBeforeSave: true });
      for (const modelo of Object.values(mongoose.models)) await modelo.syncIndexes();
      console.log('Índices aplicados.');
    }
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
