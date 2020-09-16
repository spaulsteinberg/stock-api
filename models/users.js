const mongoose = require('mongoose');

const Schema = mongoose.Schema;

//define a schema for the db
const userSchema = new Schema({
    username: String,
    password: String,
    stocksTracking: [String]
})

module.exports = mongoose.model('user', userSchema, 'user-collection'); //name of model, schema it uses, collection name in db