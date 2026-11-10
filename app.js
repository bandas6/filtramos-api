require('dotenv').config();
const Server = require('./models/server');

const server = new Server();

server.listen().catch((err) => {
  console.error('No se pudo iniciar el servidor:', err.message);
  process.exit(1);
});
