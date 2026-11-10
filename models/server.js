const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { dbConnection } = require('../database/config');

class Server {

  constructor() {
    this.app = express();
    this.port = process.env.PORT || 8080;

    // Detrás del proxy de Render: req.ip es la IP real del cliente (necesario para los límites de peticiones)
    this.app.set('trust proxy', 1);

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

    // Errores no controlados. Solo se devuelve el mensaje real en errores esperados del cliente.
    this.app.use((err, req, res, next) => {
      if (err instanceof multer.MulterError) {
        const error = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera el máximo de 5 MB' : err.message;
        return res.status(400).json({ ok: false, error });
      }
      const status = err.status || err.statusCode;
      if (status >= 400 && status < 500) {
        return res.status(status).json({ ok: false, error: err.message || 'Solicitud inválida' });
      }
      console.error(err);
      res.status(500).json({ ok: false, error: 'Error interno del servidor' });
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
