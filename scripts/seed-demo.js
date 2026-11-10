// Datos de prueba ficticios para desarrollo. Todas las referencias empiezan por DEMO-.
// Uso:
//   npm run seed:demo               -> crea los productos DEMO- que falten
//   npm run seed:demo -- --borrar   -> borra solo los productos DEMO- (y, desde la etapa C, sus movimientos)
// Protección: se niega a correr en producción. Requiere PERMITIR_DEMO=1 en .env y PUBLIC_URL en localhost.
require('dotenv').config();
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const Product = require('../models/productos.models');
const { slugDe } = require('../utils/catalogo');
const { PREFIJO, crearDemo } = require('./datos-demo');
const borrar = process.argv.includes('--borrar');

function verificarEntorno() {
  const motivos = [];
  if (process.env.NODE_ENV === 'production') motivos.push('NODE_ENV=production');
  if (process.env.PERMITIR_DEMO !== '1') motivos.push('falta PERMITIR_DEMO=1 en .env');
  let host = '';
  try { host = new URL(process.env.PUBLIC_URL || '').hostname; } catch { /* URL inválida */ }
  if (!['localhost', '127.0.0.1'].includes(host)) motivos.push('PUBLIC_URL no es localhost');
  if (motivos.length) {
    console.error(`seed:demo cancelado (${motivos.join('; ')}). Solo se usa en desarrollo local.`);
    process.exit(1);
  }
}

(async () => {
  verificarEntorno();
  await dbConnection();

  if (borrar) {
    const { deletedCount } = await Product.deleteMany({ referenciaNormalizada: { $regex: `^${PREFIJO}` } });
    console.log(`Productos DEMO- borrados: ${deletedCount}`);
  } else {
    const creados = await crearDemo(Product, { slugDe });
    console.log(`Productos DEMO- creados: ${creados}`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
