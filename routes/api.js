const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/users');
const db = "mongodb+srv://chunkles_berg74:56E0sC8TJzvIJh3H@stocks.wfo6x.mongodb.net/users?retryWrites=true&w=majority"

// connect to mongodb hosted on mlab
mongoose.connect(db, {useNewUrlParser: true, useUnifiedTopology: true}, err => {
    console.log(err ? err : "Connected to mongodb");
})


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
            let user = new User(request.body);
            user.save()
            .then(registeredUser => {
                response.status(200).send(registeredUser)
            })
            .catch(error => {
                response.status(400).send(error)
            })
        }
    })
})

// search for username in db. If an error occurs print it. 
// If the user is not found or the passwords do not match send a 401 unauthorized response. Else, the login is a success
router.post('/login', (request, response) => {
    User.findOne({username: request.body.username}, (error, user) => {
        if (error) console.log("Error occurred.");
        else if (!user || user.password !== request.body.password) {
            response.status(401).send("Incorrect username or password.")
        } else {
            response.status(200).send(user)
        }
    })
})

// get the list of subscribed stocks by username
router.get('/userlist', (request, response) => {
    const placeholderForBelow = 'spaulsteinberg12';
    // GET /something?color1=red&color2=blue
    // ^^^ access parameters with 'query'....ex: req.query.color1 === 'red'
    User.findOne({username: placeholderForBelow})
        .select('stocksTracking -_id')
        .exec(function(err, user){
            if (err) console.log(err);
            else response.json(user);
        })
})

// export the router to be used by server
module.exports = router;