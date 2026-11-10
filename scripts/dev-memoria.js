// API de desarrollo con MongoDB EN MEMORIA y datos DEMO-. No toca la base del .env.
// Uso: npm run dev:memoria   (todo se pierde al cerrar)
// Usuarios de demostración (solo existen en esta base temporal):
//   admin@demo.local / demo-admin-12345   bodega@demo.local / demo-bodega-12345   ventas@demo.local / demo-ventas-12345
const path = require('path');
const fs = require('fs');
const os = require('os');

(async () => {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });

  // Antes de cargar .env: estas variables tienen prioridad y apuntan a lo temporal
  process.env.MONGO_DBCNN = replSet.getUri('filtramos_dev_memoria');
  process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'filtramos-uploads-'));
  require('dotenv').config();
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = require('crypto').randomBytes(48).toString('hex');

  const mongoose = require('mongoose');
  const bcrypt = require('bcryptjs');
  const { dbConnection } = require('../database/config');
  await dbConnection();
  require('../models/productos.models');
  require('../models/usuario.models');
  require('../models/configuracion.models');
  require('../models/files.models');
  for (const archivo of fs.readdirSync(path.join(__dirname, '..', 'models'))) {
    if (archivo.endsWith('.models.js')) require(path.join(__dirname, '..', 'models', archivo));
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

  const Usuario = mongoose.model('Usuario');
  for (const rol of ['admin', 'bodega', 'ventas']) {
    await Usuario.create({ nombre: `Demo ${rol}`, email: `${rol}@demo.local`, rol, password: await bcrypt.hash(`demo-${rol}-12345`, 4) });
  }

  // Imagen de ejemplo (el logo) para que los productos demo puedan publicarse
  const almacenamiento = require('../services/almacenamiento');
  const logo = fs.readFileSync(path.join(__dirname, '..', 'public', 'uploads', 'logo.png'));
  const { url } = await almacenamiento.guardar({ buffer: logo, extension: 'png' });
  await mongoose.model('Files').create({ nombre: 'Foto de demostración', imagen: url });

  const { crearDemo } = require('./datos-demo');
  const { slugDe } = require('../utils/catalogo');
  const { registrar } = require('../services/inventario');
  const admin = await Usuario.findOne({ rol: 'admin' });
  const creados = await crearDemo(mongoose.model('Product'), { fotoDemo: url, slugDe, registrar, usuario: admin });

  // Arranca el servidor sin volver a conectar
  const Server = require('../models/server');
  const server = new Server();
  server.app.listen(server.port, () => {
    console.log(`API EN MEMORIA en http://localhost:${server.port} · ${creados} productos DEMO- · usuarios *@demo.local`);
  });

  const cerrar = async () => { await mongoose.disconnect(); await replSet.stop(); process.exit(0); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
})().catch((err) => {
  console.error('No se pudo iniciar la API en memoria:', err.message);
  process.exit(1);
});
