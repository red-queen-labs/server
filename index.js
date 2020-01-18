const express = require('express');
const bodyParser = require('body-parser');
const expSession = require('express-session');
const sessionStore = require('express-mysql-session');

const fs = require('fs');

const uuid = require('uuid');
const jwt = require('jsonwebtoken');
const auth = require('./middleware/auth.js');

const DatabaseManager = require('./managers/DatabaseManager.js');

require('dotenv').config();

const app = express();

var dbManager = new DatabaseManager();
app.use(express.urlencoded({extended: true}));
app.use(async (req, res, next) => {
	
	let log = `${req.method} on ${req.url} - ${new Date()}`;

	console.log(log);
	fs.appendFileSync('./logs/serverlogs.txt', log + '\n');

	res.sendStatus(200);
	next();
});

// Expected body: {id, email, password_hash, firstName, lastName}
app.post('/api/users/register', async (req, res) => {

	console.log(req.body)
	await dbManager.query(`INSERT INTO users VALUES ("?", "?", "?");`, [req.body.id, req.body.email, req.body.password_hash])
		.catch(res.send);
	await dbManager.query(`INSERT INTO profiles VALUES ("?", "?", "?");`, [req.body.id, req.body.firstName, req.body.lastName])
		.catch(res.send);
	res.status(200).json({id: req.body.id})
});
app.post('/api/users/login', async (req, res) => {
	
	const rows = await dbManager.query(`SELECT * FROM users WHERE email = "?";`, req.body.email)
		.catch(console.log);
	const pw_hash = rows.password_hash;

	if (pw_hash == req.body.password_hash) res.status(200).json();
	else res.sendStatus(401);
});
app.put('api/users/edit', async (req, res) => {
	edits = [];
	for (const change in req.body.changes) {
		edits.push(`${change} = ${req.body.changes[change]}`);
	}
	await dbManager.query(`UPDATE users SET ? WHERE id = "?";`, [edits.join(', '), req.body.id]);
	res.sendStatus(200);
});

app.get('/api/searchHistory', auth, async (req, res) => {
	
	const token = req.header('x-auth-token');
	const data = jwt.verify(token, process.env.JWTSECRET);

	const rows = await dbManager.query(`SELECT * FROM sessions_search_history WHERE id = "?"`, [data.payload.id]);

	res.json(rows).status(200);
});

// Expects: body: {apn}
app.post('/api/search', async (req, res, next) => {
	// Send data to scraper

	// Send back results
	res.status(200).json({ building: { units: [{ apn: "", roomNum: "", rent: "", website: "" }, { apn: "", roomNum: "", rent: "", website: "" }], photos: [], websiteLink: "" } })

	// Authenticate
	auth(req, res, next);

	// Save search history
	const token = req.header('x-auth-token');
	const data = jwt.verify(token, process.env.JWTSECRET);
	console.log('payload: ' + data.payload);
	await dbManager.query(`INSERT INTO sessions_search_history VALUES ("?", "?");`, [data.payload.id, data.payload.searchTerm]);
});

// Test/Dev route for hand-picked data (not returned by the pipeline)

app.listen(process.env.PORT, () => console.log(`Listening on ${process.env.PORT}`));


process.on('uncaughtException', e => {
	console.log('UNCAUGHT EXCEPTION!');
	console.log(e);
});

process.on('unhandledRejection', (reason, promise) => {
	console.log(`UNHANDLED PROMISE REJECTION! Reason ${reason}`);
	console.log(promise);
});
