// Crea (o actualiza la contraseña de) el usuario administrador.
// Uso: definir ADMIN_NOMBRE, ADMIN_EMAIL y ADMIN_PASSWORD en .env y ejecutar `npm run crear-admin`
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { dbConnection } = require('../database/config');
const Usuario = require('../models/usuario.models');

(async () => {
  const { ADMIN_NOMBRE, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_NOMBRE || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Defina ADMIN_NOMBRE, ADMIN_EMAIL y ADMIN_PASSWORD en .env');
    process.exit(1);
  }
  if (ADMIN_PASSWORD.length < 10) {
    console.error('La contraseña debe tener al menos 10 caracteres');
    process.exit(1);
  }

  await dbConnection();
  const password = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const email = ADMIN_EMAIL.toLowerCase().trim();
  const usuario = await Usuario.findOneAndUpdate(
    { email },
    { nombre: ADMIN_NOMBRE, email, password, rol: 'admin', estado: true },
    { upsert: true, new: true }
  );
  console.log(`Administrador listo: ${usuario.email}`);
  console.log('Borre ADMIN_PASSWORD del archivo .env.');
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
