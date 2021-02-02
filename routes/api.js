const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/users');
const {nanoid} = require('nanoid');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const readline = require('readline');
const PositionData = require('../models/PositionData');
const PositionAttributes = require('../models/PositionAttributes');
const CreateProfileResponse = require('../ResponseModels/CreateProfileResponse');
const ErrorResponse = require('../ResponseModels/ErrorResponseModel');
const db = "mongodb+srv://chunkles_berg74:56E0sC8TJzvIJh3H@stocks.wfo6x.mongodb.net/users?retryWrites=true&w=majority"
const db2 = "mongodb+srv://chunkles_berg74:56E0sC8TJzvIJh3H@stocks.wfo6x.mongodb.net/accounts?retryWrites=true&w=majority";
const secret_key = nanoid();
// connect to mongodb hosted on mlab
mongoose.connect(db, {useNewUrlParser: true, useUnifiedTopology: true}, err => {
    console.log(err ? err : "User db connected");
})

//create new connection on a different db from users
const conn = mongoose.createConnection(db2, {useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false}, err =>{
    console.log(err ? err : "Accounts db connected");
})
const Account = conn.model('account', require('../models/account'), 'account-collection')

// root of the routes
router.get('/', (request, response) => {
    response.send("Sent from routes");
})
//convert form data in mongoose model, save user in database
router.post('/register', (request, response) => {
    // see if the username already exists. if it does not add them
    User.findOne({username: request.body.username}, (error, user) => {
        if (error) response.status(500).send({status: 1});
        else if (user){
            response.status(401).send({status: 2});
        } else {
            bcrypt.hash(request.body.password, 8, function(err, hash){
                if (err) response.status(500).send({status: 1});
                else {
                    request.body.password = hash;
                    console.log(hash);
                    let user = new User(request.body);
                    user.save()
                    .then(registeredUser => {
                        let payload = { subject: registeredUser._id };
                        let token = jwt.sign(payload, secret_key); //jwt.sign creates a new token...takes payload/secret key
                        response.status(201).send({'token': token, 'id': registeredUser._id})
                    })
                    .catch(error => {
                        response.status(400).send(error)
                    })
                }
            })
        }
    })
})
// retrieve the master list of all possible stocks asynchronously
router.get('/retrievestocks', async (request, response) => {
    try {
        const nyse = await readNyse();
        const nasdaq = await readNasdaq();
        return response.status(200).send({"nyse": nyse.sort(), "nasdaq": nasdaq.sort()});
    } catch (err){
        console.log(err);
        return response.status(500).send();
    }
})

// read the nyse symbols
async function readNyse(){
    const fileStream1 = fs.createReadStream('./info-files/outputnyse.txt', 'utf-8');
    const rl = readline.createInterface({
        input: fileStream1,
        crlfDelay: Infinity
    });
    let nyseList = []; 
    for await (const line of rl) {
        nyseList.push(line);
    }
    return nyseList;
}
// read the nasdaq symbols
async function readNasdaq(){
    const fileStream2 = fs.createReadStream('./info-files/outputsymbols.txt', 'utf-8');
    const r2 = readline.createInterface({
        input: fileStream2,
        crlfDelay: Infinity
    });
    let nasdaqList = [];
    for await (const line of r2) {
        nasdaqList.push(line);
    }
    return nasdaqList;
}

// search for username in db. If an error occurs print it. 
// If the user is not found or the passwords do not match send a 401 unauthorized response. Else, the login is a success
router.post('/login', (request, response) => {
    User.findOne({username: request.body.username}, (error, user) => {
        if (error) return response.status(500).send("Internal Server Error");
        else if (!user){
            return response.status(401).send("Incorrect username or password.");
        }
        else {
            // MUST be candidate and then what is stored in db
            bcrypt.compare(request.body.password, user.password, (err, res) =>{
                if (err) response.status(500).send({status: 1});
                else if (res){
                    let payload = { subject: user._id };
                    let token = jwt.sign(payload, secret_key);
                    return response.status(200).send({'token': token, 'id': user._id})
                } else {
                    return response.status(401).send("Incorrect username or password.");
                }
            })
        }
    })
})

router.post('/authorize/profile/delete', verifyTokenAuth, async (request, response) => {
    const requestUsername = request.headers.user;
    const requestPassword = request.headers.pass;
    User.findOne({username: requestUsername}, (error, user) => {
        if (error) return response.status(500).send(new ErrorResponse(500, "Internal Server Error"));
        else if (!user) return response.status(401).send(new ErrorResponse(401, "Unauthorized", "Unauthorization error"));
        else {
            bcrypt.compare(requestPassword, user.password, (err, res) => {
                if (err) return response.status(500).send(new ErrorResponse(500, "Internal Server Error"));
                else if (!res) return response.status(401).send(new ErrorResponse(401, "Unauthorized", "Unauthorization error"));
                else return response.status(200).send();
            })
        }
    })
})

router.get('/whoami', verifyTokenAuth, async (request, response) => {
    User.findById({_id: request.query.user})
        .select('username -_id')
        .exec(function(err, user){
            console.log(err, user);
            if (err) response.status(500).send({status: 1});
            else return response.json(user);
        })
})

//verify token auth, split at space to get Bearer token, next tells express we are done here and to move on
function verifyTokenAuth(request, response, next){
    if (!request.headers.authorization){
        return response.status(401).send({status: 2, message: "No authorization"});
    }
    let token = request.headers.authorization.split(' ')[1];
    if (token === null) return response.status(401).send({status: 2, message: "Null token"});
    try {
        let payload = jwt.verify(token, secret_key);
        request.userId = payload.subject;
        next();
    } catch (err) {
        return response.status(401).send({status: 2, message: "Error making token"});
    }
}

router.route('/stock')
    .get(verifyTokenAuth, async (request, response) => {
        //const placeholderForBelow = 'spaulsteinberg12';
        // GET /something?color1=red&color2=blue
        // ^^^ access parameters with 'query'....ex: req.query.color1 === 'red'
        User.findById({_id: request.query.user})
        .select('stocksTracking -_id')
        .exec(function(err, user){
            if (err) response.status(500).send({status: 1});
            else return response.json(user);
        })
    })
    .patch(verifyTokenAuth, async (request, response) => {
        User.findById({_id : request.query.user}, (error, user) => {
            console.log(user);
            if (error) return response.status(500).send({status: 2});
            else if (user.stocksTracking.includes(request.body.symbol)) return response.status(400).send({status: 3}); 
            else {
                User.updateOne({_id : request.query.user}, {$push : {stocksTracking: request.body.symbol}}, (error, user) => {
                    if (error) return response.status(500).send("Server error");
                    else {
                        return response.status(200).send({status: 'OK'});
                    }
                })
            }
        })
    })
    .delete(verifyTokenAuth, async (request, response) => {
        User.findOneAndUpdate({_id: request.query.user}, {$pull: {stocksTracking: request.body.symbol}},
            {new: true}, (error, user) => {
                if (error) return response.status(500).send({status: 2});
                else return response.status(200).send();
        })
    })

// need PATCH, GET, DELETE
router.route('/account')
    .patch(verifyTokenAuth, async (request, response) => {
        const options = { new: true}
        const filter = { username: request.headers.username, accountNames: {$ne : request.body.name} }
        const update =  { $push: { accounts: request.body.accounts, accountNames: request.body.name }};
        try {
            // do not await on db call because it is async in the function, awaiting will make two dup calls
            Account.findOneAndUpdate(filter, update, options, async (error, user) => {
                if (error) response.status(500).send({status: 500, msg: "Internal server error", details: error});
                else if (!user) response.status(400).send({status: 400, msg: "Bad Request", details: `Account name: ${request.body.name} already exists.`});
                else {
                    console.log(request.body.accounts)
                    console.log(user.accounts);
                    const resp = user.accounts.find(_ => _.name === request.body.name)
                    response.status(200).send({status:200, details: resp})
                }
            })
        } catch(err) {
            console.log(err);
            response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
        }
    })
    .get(verifyTokenAuth, async (request, response) => {
        Account.findOne({username: request.headers.username}, async (error, user) => {
            try {
                if (error) response.status(500).send({status: 500, msg: "Internal server error", details: error});
                else if (!user) response.status(404).send({status:404, msg: "No Content. User needs to create an account."});
                else response.status(200).send({names: user.accountNames, details: user.accounts});
            } catch (err){
                console.log(err);
                response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
            }
        })
    })
    .delete(verifyTokenAuth, async (request, response) => {
        const acc = decodeURI(request.query.name);
        const options = {new: true};
        const filter = {username: request.headers.username};
        const update = {$pull: {accounts: {name: acc}, accountNames: acc}};
        Account.findOneAndUpdate(filter, update, options, async (error, user) => {
            try {
                if (error) response.status(500).send({status: 500, msg: "Internal server error", details: error});
                else if (!user) response.status(400).send({status:400, msg: "Bad Request", details: "Could not find user or account name"});
                else {
                    console.log(user.accounts)
                    response.status(200).send({status: 200, msg: "Deleted", details: `${acc} deleted`});
                }
            } catch (err){
                console.log(err);
                response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
            }
        })
    })

// Create and delete profile
router.route('/profile')
    .post(verifyTokenAuth, async (request, response) => {
        console.log("POST ACCOUNT")
        try {
            Account.findOne({username: request.headers.username}, { _id: 0, __v: 0}, async (error, user) => {
                if (error){
                    console.log(error);
                    response.status(500).send({status: 500, msg: "Internal server error", details: error});
                }
                else if (user) {
                    console.log(user)
                    response.status(401).send({status: 401, msg: `Account already exists!`});
                }
                else {
                    console.log(request.body)
                    request.body.username = request.headers.username;
                    let account = new Account(request.body);
                    await account.save()
                    .then(addedAccount => {
                        console.log(addedAccount)
                        return response.status(201).send(new CreateProfileResponse(201, addedAccount.accountNames, addedAccount.accounts));
                    })
                    .catch(err => {
                        return response.status(400).send({status:400, msg: err})
                    })
                }
            })
        } catch (err){
            console.log(err);
            response.status(500).send({status: 500, msg: "Internal Server Error"});
            throw err;
        }
    })
    .get(verifyTokenAuth, async (request, response) => {
        Account.findOne({username: request.headers.username}, {_id: 0, __v: 0}, async (error, user) => {
            try {
                console.log("IN GET")
                if (error) response.status(500).send({status: 500, msg: "Internal server error", details: error});
                else if (!user) return response.status(404).send({status: 404, msg: "User doesnt have a profile"})
                else return response.status(200).send({status: 200, msg: "User has a profile", details: user})
            } catch (err){
                return response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
            }
        })
    })
    .delete(verifyTokenAuth, async (request, response) => {
        Account.findOneAndDelete({username: request.headers.username}, async (error, user) => {
            try {
                if (error) {
                    console.log(error)
                    return response.status(500).send({status: 500, msg: "Internal server error", details: ""});
                }
                else if (!user) return response.status(400).send({status:400, msg: "Bad Request", details: "Could not find user"});
                else return response.status(200).send({status: 200, msg: "Profile Deleted", details: `${user.username} deleted`});
            } catch (err){
                console.log(err);
                return response.status(500).send({status: 500, msg: "Internal Server Error", details: ""});
            }
    })
})

router.get('/profile/exists', verifyTokenAuth, async (request, response) => {
    Account.findOne({username: request.headers.username}, async (error, user) => {
        if (error) return response.status(500).send({status: 500, msg: "Internal server error", details: error});
        else if (!user) return response.status(400).send({status: 400, msg: "Bad Request"})
        else return response.status(200).send({status: 200, msg: "Success", details: user.accountNames})
    })
})

router.route('/position')
    .patch(verifyTokenAuth, async(request, response) => {
        Account.findOne({username: request.headers.username}, async (error, user) => {
            const accountName = request.body.name;
            const symbol = request.body.symbol;
            const payload = request.body.data;
            if (error) return response.status(500).send({status: 500, msg: "Internal server error", details: error});
            else if (!user){
                return response.status(400).send({status: 400, msg: "Bad Request"})
            }
            else {
                // IF POSITION ALREADY EXISTS ADD ONTO THE POSITION
                let i = 0; //hold index so we dont need to dup on create
                let index = 0;
                let samePrice = false;
                for (let acc of user.accounts){
                    if (acc.name === accountName){
                        index = i;
                        for (let details of acc.data){
                            if (details.symbol === symbol){
                                console.log("EXISTING PUSH")
                                for (let vals of details.values){
                                    console.log(vals.priceOfBuy, payload.priceOfBuy)
                                    if (vals.priceOfBuy === payload.priceOfBuy && vals.dateOfBuy === payload.dateOfBuy){
                                        samePrice = true;
                                        vals.position += payload.position;
                                        break;
                                    }
                                }
                                if (!samePrice) details.values.push(payload);
                                return await user.save()
                                .then (successData => {
                                    return response.status(200).send({status: 200, msg: "Success", details: successData.accounts})
                                })
                                .catch(err => {
                                    return response.status(500).send({status: 500, msg: "Internal Server Error", details: err})
                                })
                            }
                        }
                    }
                    i++;
                }
                try {
                    console.log("new", index)
                    //populate structures and save...here if new stock
                    console.log(payload.position, payload.dateOfBuy, payload.priceOfBuy)
                    const attributes = new PositionAttributes(payload.position, payload.dateOfBuy, payload.priceOfBuy);
                    const data = new PositionData(symbol, [].concat(attributes)); //add values attribute as array
                    user.accounts[index].data.push(data)
                    console.log("ATTR:", attributes)
                    console.log("DATA:", data)
                    return await user.save()
                        .then (successData => {
                            return response.status(200).send({status: 200, msg: "Success", details: successData.accounts})
                        })
                        .catch(err => {
                            return response.status(500).send({status: 500, msg: "Internal Server Error", details: err})
                        })
                } catch (e){
                    console.log(e);
                    return response.status(500).send({status: 500, msg: "Internal Server Error", details: e})
                }
            }
        })
    })
    .delete(verifyTokenAuth, async (request, response) => {
        const accountName = request.query.name;
        const symbol = request.query.symbol.toUpperCase();
        const position = request.query.position;
        const date = request.query.date;
        const price = request.query.price;
        Account.findOne({username: request.headers.username}, async (error, user) => {
            if (error) return response.status(500).send({status: 500, msg: "Internal server error", details: error});
            else if (!user) return response.status(400).send({status: 400, msg: "Bad Request"})
            else {
                try {
                    let result = await findPosition(user, accountName, symbol, position, date, price);
                    if (result !== -1) return response.status(200).send({status: 200, msg: "Success", details: result.accounts});
                    return response.status(404).send({status: 404, msg: "Not found"});
                }
                catch (err){
                    return response.status(500).send({status: 500, msg: "Internal server error on delete", details: error})
                }
            }
        })
    })
    .get(verifyTokenAuth, async (request, response) => {
        const filter = { username: request.headers.username}
        Account.findOne(filter, async (error, user) => {
            if (error) return response.status(500).send({status: 500, msg: "Internal server error", details: error});
            else if (!user) return response.status(400).send({status: 400, msg: "Bad Request"});
            else {
                console.log(user)
                for (let acc of user.accounts){
                    console.log(`${acc.name} ---> ${request.body.name}`)
                    if (acc.name === request.body.name){
                        for (let data of acc.data){
                            if (data.symbol === request.body.symbol){
                                return response.status(200).send({status: 200, msg: "Success", symbol: data.symbol, details: data.values})
                            }
                        }
                    }
                }
                return response.status(404).send({status: 404, msg: "No content"});
            }
        })
    })

async function findPosition(user, accountName, symbol, position, date, price){
    console.log(`Account Name: ${accountName}, Symbol: ${symbol}, Position: ${position}, date: ${date}, price: ${price}`)
    for (let acc of user.accounts){
        if (acc.name === accountName){
            for (let i = 0; i < acc.data.length; i++){
                if (acc.data[i].symbol === symbol){
                    for (let k = 0; k < acc.data[i].values.length; k++){
                        console.log(acc.data[i].values[k])
                        if (acc.data[i].values[k].position == position
                            && acc.data[i].values[k].dateOfBuy == date
                            && acc.data[i].values[k].priceOfBuy == price){
                                //delete whole position if there is one left
                                if (acc.data[i].values.length === 1){
                                    return await saveUserPositionDataOnDelete(user, acc.data, i)
                                }
                                else {
                                    return await saveUserPositionDataOnDelete(user, acc.data[i].values, k)
                                }
                            }
                    }
                }
            }
        }
    }
    return -1;
}

async function saveUserPositionDataOnDelete(user, set, index){
    set.splice(index, 1);
    return await user.save()
    .then(savedUser => {
        return Promise.resolve(savedUser)
    })
    .catch(err => {
        return Promise.reject(err);
    })
}
// export the router to be used by server
module.exports = router;