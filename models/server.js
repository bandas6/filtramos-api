const express = require('express');
const cors = require('cors');
const { dbConnection } = require('../database/config')

class Server {

    constructor() {

        this.app = express();
        this.port = process.env.PORT;

        this.paths = {
            productos: 'api'
        }

        // Connected DB
        this.conectarDB();

        // middlewares
        this.middlewares();

        // rutas de mi aplicacion
        this.routes();

    }

    async conectarDB() {
        await dbConnection();
    }

    middlewares() {

        // CORS
        this.app.use(cors());

        // lectura y parceo de el body
        this.app.use(express.json());

        // Direcctorio publico
        this.app.use(express.static('public'));

    }


    routes() {
        this.app.use('/api/productos', require('../router/productos.router'));
    }

    async listen() {
        this.app.listen(this.port, async () => {
            console.log(`Server is running on port ${this.port}`);
        });
    }


}

module.exports = Server;