// app.js
require('dotenv').config(); // Si usas variables de entorno como PORT
const Server = require('./models/server');

const server = new Server();

server.listen();
