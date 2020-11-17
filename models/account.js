const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const accountSchema = new Schema({
    username: { type: String, index: true, trim: true},
    accounts: { type: [{
        name: { type: String, trim: true},
        data: { type: [{
            symbol: { type: String },
            values: { type: [{
                position: { type: Number, min: .01 },
                dateOfBuy: { type: String },
                priceOfBuy: { type: Number, min: .01}
            }]
            }
        }]
        }
    }]
    }
});
module.exports = accountSchema;