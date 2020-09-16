const express = require('express');
const bodyParser = require('body-parser');
const api = require('./routes/api'); // import the routes module

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

app.use('/api', api); //localhost:3000/api will now use the routes from api.js

app.get('/', (request, response) => {
    response.send("Hello from server - Uel de Burg");
})

app.listen(PORT, () =>{
    console.log(`Listening on port ${PORT}`);
})