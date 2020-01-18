const express = require('express');
const expSession = require('express-session');
const sessionStore = require('express-mysql-session');

const fs = require('fs');

const DatabaseManager = require('./managers/DatabaseManager.js');

require('dotenv').config();

const app = express();

var dbManager = new DatabaseManager();

app.use(async (req, res, next) => {
	
	let log = `${req.method} on ${req.url} - ${new Date()}`;

	console.log(log);
	fs.appendFileSync('./logs/serverlogs.txt', log + '\n');

	res.sendStatus(200);
	next();
});

app.listen(process.env.PORT, () => console.log(`Listening on ${process.env.PORT}`));


process.on('uncaughtException', e => {
	console.log('UNCAUGHT EXCEPTION!');
	console.log(e);
});

process.on('unhandledRejection', (reason, promise) => {
	console.log(`UNHANDLED PROMISE REJECTION! Reason ${reason}`);
	console.log(promise);
});
