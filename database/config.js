const mongoose = require('mongoose');

const dbConnection = async () => {
  if (!process.env.MONGO_DBCNN) {
    throw new Error('Falta la variable MONGO_DBCNN (vea .env.example)');
  }
  await mongoose.connect(process.env.MONGO_DBCNN);
  console.log('DB online');
};

module.exports = { dbConnection };
