const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/users');
const {nanoid} = require('nanoid');
const bcrypt = require('bcryptjs');
const { request } = require('express');
const fs = require('fs');
const readline = require('readline');
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
                        response.status(200).send({'token': token, 'id': registeredUser._id})
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
        if (error) console.log("Error occurred.");
        else if (!user){
            response.status(401).send("Incorrect username or password.");
        }
        else {
            // MUST be candidate and then what is stored in db
            bcrypt.compare(request.body.password, user.password, (err, res) =>{
                if (err) response.status(500).send({status: 1});
                else if (res){
                    let payload = { subject: user._id };
                    let token = jwt.sign(payload, secret_key);
                    response.status(200).send({'token': token, 'id': user._id})
                } else {
                    response.status(401).send("Incorrect username or password.");
                }
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

// need POST, PATCH, GET, DELETE
router.route('/account')
    .post( async (request, response) => {
        console.log("POST ACCOUNT")
        try {
            Account.findOne({username: request.body.username}, async (error, user) => {
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
                    let account = new Account(request.body);
                    await account.save()
                    .then(addedAccount => {
                        response.status(201).send({msg: 'New User and Account created'})
                        console.log(addedAccount)
                    })
                    .catch(err => {
                        response.status(400).send({status:400, msg: err})
                    })
                }
            })
        } catch (err){
            console.log(err);
            response.status(500).send({status: 500, msg: "Internal Server Error"});
            throw err;
        }
    })
    .patch( async (request, response) => {
        const options = { new: true}
        const filter = { username: request.body.username, accountNames: {$ne : request.body.name} }
        const update =  { $push: { accounts: request.body.accounts, accountNames: request.body.name }};
        try {
            // do not await on db call because it is async in the function, awaiting will make two dup calls
            Account.findOneAndUpdate(filter, update, options, async (error, user) => {
                if (error) response.status(500).send({status: 500, msg: "Internal server error", details: error});
                else if (!user) response.status(400).send({status: 400, msg: "Bad Request", details: `Account name: ${request.body.name} already exists.`});
                else {
                    console.log(request.body.accounts)
                    console.log(user.accounts);
                    response.status(200).send({status:200, details: user.accounts})
                }
            })
        } catch(err) {
            console.log(err);
            response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
        }
    })
    .get( async (request, response) => {
        Account.findOne({username: request.query.username}, async (error, user) => {
            try {
                if (error) response.status(500).send({status: 500, msg: "Internal server error", details: error});
                else if (!user) response.status(204).send({status:204, msg: "No Content. User needs to create an account."});
                else response.status(200).send({status: 200, msg: "Success", names: user.accountNames, details: user.accounts});
            } catch (err){
                console.log(err);
                response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
            }
        })
    })
    .delete( async (request, response) => {
        const acc = request.query.name;
        const options = {new: true};
        const filter = {username: request.query.username};
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

// delete a profile
router.delete('/remove/profile', async (request, response) => {
    Account.findOneAndDelete({username: request.query.username}, async (error, user) => {
        try {
            if (error) {
                console.log(error)
                response.status(500).send({status: 500, msg: "Internal server error", details: error});
            }
            else if (!user) response.status(400).send({status:400, msg: "Bad Request", details: "Could not find user"});
            else response.status(200).send({status: 200, msg: "Profile Deleted", details: `${user.username} deleted`});
        } catch (err){
            console.log(err);
            response.status(500).send({status: 500, msg: "Internal Server Error", details: err});
        }
    })
})

// export the router to be used by server
module.exports = router;