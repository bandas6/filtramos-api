const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { dbConnection } = require('../database/config');
const { origenesDe, advertenciasCors } = require('../utils/cors');

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
    const origenes = origenesDe(process.env.CORS_ORIGINS);
    if (process.env.NODE_ENV !== 'test') {
      for (const aviso of advertenciasCors()) console.warn(`⚠ ADVERTENCIA CORS: ${aviso}`);
    }

    this.app.use(cors({
      origin: (origin, callback) => {
        // Peticiones sin origen (curl, servidor a servidor) o de un origen permitido
        if (!origin || origenes.includes(origin)) return callback(null, true);
        return callback(null, false);
      }
    }));

    this.app.use(express.json({ limit: '1mb' }));

    // Imágenes del almacenamiento local (si se usa) y archivos públicos (logo)
    const { RAIZ } = require('../services/almacenamiento');
    if (RAIZ) this.app.use('/uploads', express.static(RAIZ, { fallthrough: true }));
    this.app.use(express.static(path.join(__dirname, '../public')));
  }

  routes() {
    this.app.use('/api/auth', require('../router/auth.router'));
    this.app.use('/api/productos', require('../router/productos.router'));
    this.app.use('/api/admin', require('../router/admin.router'));
    this.app.use('/api/public', require('../router/public.router'));

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
    // Express 5 llama este callback también si falla (p. ej. puerto ocupado): el error se propaga
    await new Promise((resolve, reject) => {
      this.app.listen(this.port, (err) => {
        if (err) return reject(new Error(`No se pudo abrir el puerto ${this.port}: ${err.code || err.message}`));
        console.log(`Server is running on port ${this.port}`);
        resolve();
      });
    });
  }
}

module.exports = Server;
