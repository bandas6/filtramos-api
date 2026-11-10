const mongoose = require('mongoose');

// La app nunca crea índices ni colecciones al arrancar: se aplican con `npm run indices`
// (scripts/indices.js), para que un cambio de modelo no toque la base sin que nadie lo decida.
const dbConnection = async (uri = process.env.MONGO_DBCNN) => {
  if (!uri) {
    throw new Error('Falta la variable MONGO_DBCNN (vea .env.example)');
  }
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  console.log('DB online');
};

module.exports = { dbConnection };
