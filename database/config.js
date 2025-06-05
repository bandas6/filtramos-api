const mongoose = require('mongoose');

const dbConnection = async () => {

    try {
        
        mongoose.connect(process.env.MONGO_DBCNN);
        console.log('DB online');

    } catch (error) {

        console.log(error);
        throw new Error('Error a la hora de iniciar la base de datos');

    }

}


module.exports = {
    dbConnection
}