// Datos de prueba ficticios para desarrollo. Todas las referencias empiezan por DEMO-.
// Uso:
//   npm run seed:demo               -> crea los productos DEMO- que falten
//   npm run seed:demo -- --borrar   -> borra solo los productos DEMO- (y, desde la etapa C, sus movimientos)
// Protección: se niega a correr en producción. Requiere PERMITIR_DEMO=1 en .env y PUBLIC_URL en localhost.
require('dotenv').config();
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const Product = require('../models/productos.models');

const PREFIJO = 'DEMO-';
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

// Valores claramente ficticios: no son precios, equivalencias ni medidas reales.
const PRODUCTOS = [
  { referencia: 'DEMO-AP-001', category: 'Aire primario', diametroExterno: '300', diametroInterno: 180, alto: 400, equivalencias: ['DEMO-MARCA-A 001'], aplicaciones: ['Máquina de prueba 1'], stock: 40 },
  { referencia: 'DEMO-AP-002', category: 'Aire primario', diametroExterno: '260', diametroInterno: 150, alto: 350, equivalencias: ['DEMO-MARCA-B 002'], aplicaciones: ['Máquina de prueba 2'], stock: 3 },
  { referencia: 'DEMO-AS-001', category: 'Aire seguridad', diametroExterno: '170', diametroInterno: 120, alto: 380, equivalencias: ['DEMO-MARCA-A 101'], stock: 12 },
  { referencia: 'DEMO-PF-001', category: 'Prefiltro', diametroExterno: '320', alto: 100, stock: 0 },
  { referencia: 'DEMO-CO-001', category: 'Compresor', diametroExterno: '140', diametroInterno: 80, alto: 200, equivalencias: ['DEMO-MARCA-C 55'], stock: 1 },
  { referencia: 'DEMO-CA-001', category: 'Cabina', alto: 50, stock: 25 },
  { referencia: 'DEMO-KIT-001', category: 'Kit', aplicaciones: ['Máquina de prueba 1'], stock: 0 }
];

(async () => {
  verificarEntorno();
  await dbConnection();

  if (borrar) {
    const { deletedCount } = await Product.deleteMany({ referenciaNormalizada: { $regex: `^${PREFIJO}` } });
    console.log(`Productos DEMO- borrados: ${deletedCount}`);
  } else {
    let creados = 0;
    for (const p of PRODUCTOS) {
      if (await Product.exists({ referenciaNormalizada: p.referencia })) continue;
      await new Product(p).save();
      creados++;
    }
    console.log(`Productos DEMO- creados: ${creados} (ya existían: ${PRODUCTOS.length - creados})`);
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
