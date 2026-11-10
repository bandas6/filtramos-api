const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbConnection } = require('../database/config');

class Server {

  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;

    this.middlewares();
    this.routes();
  }

  middlewares() {
    // CORS: solo los orígenes configurados en CORS_ORIGINS
    const origenes = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    this.app.use(cors({
      origin: (origin, callback) => {
        // Peticiones sin origen (curl, servidor a servidor) o de un origen permitido
        if (!origin || origenes.includes(origin)) return callback(null, true);
        return callback(null, false);
      }
    }));

    this.app.use(express.json({ limit: '1mb' }));

    // Archivos públicos (imágenes subidas y logo)
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  routes() {
    this.app.use('/api/auth', require('../router/auth.router'));
    this.app.use('/api/productos', require('../router/productos.router'));

    // Errores no controlados (por ejemplo, archivo rechazado por multer)
    this.app.use((err, req, res, next) => {
      console.error(err);
      res.status(err.status || 400).json({ ok: false, error: err.message || 'Solicitud inválida' });
    });
  }

  async listen() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('Defina JWT_SECRET (mínimo 32 caracteres) en .env');
    }
    await dbConnection();
    this.app.listen(this.port, () => {
      console.log(`Server is running on port ${this.port}`);
    });
  }
}

module.exports = Server;
