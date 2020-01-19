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

let userDB = new DatabaseManager('sessions');
let pipelineDB = new DatabaseManager('pipeline');

app.use(express.json({ extended: true }));
app.use(async (req, res, next) => {
	newServerLog(`${req.method} on ${req.url} - ${new Date()}`);
	next();
});
app.use(express.static(__dirname + '/public'));

app.use('/', (req, res) => res.render('./public/index'));

// USERS
// Expected body: {email, password_hash, firstName, lastName}
app.post('/api/users/register', async (req, res) => {

	if (!req.body.user_id || !req.body.email || !req.body.password_hash) res.sendStatus(400);

	const count = await userDB.query(`SELECT COUNT(1) AS count FROM users WHERE email = "${req.body.email}";`);
	if (count[0].count > 0) return res.json({ error: 'EMAIL ALREADY IN USE' }).status(422);

	await userDB.query(`INSERT INTO users VALUES ("${req.body.user_id}", "${req.body.email}", "${req.body.password_hash}");`)
		.catch(res.send);

	const payload = { user_id: req.body.user_id }
	jwt.sign(payload, process.env.JWTSECRET, { expiresIn: 60 * 60 },
		(e, token) => {
			if (e) throw e;
			res.status(200).json({ token, ...payload });
		}
	);

	newServerLog(`Registered new user: ${req.body.user_id}, ${req.body.firstName} ${req.body.lastName}, ${req.body.email}`)
});
app.post('/api/profiles/register', async (req, res) => {
	if (!req.body.user_id || !req.body.firstName || !req.body.lastName) return res.sendStatus(400);

	await userDB.query(`INSERT INTO profiles VALUES ("${req.body.user_id}", "${req.body.firstName}", "${req.body.lastName}");`)
		.catch(res.send);

	res.sendStatus(200);
});
app.post('/api/users/login', async (req, res) => {

	let rows = await userDB.query(`SELECT * FROM users WHERE email = "${req.body.email}";`).catch(console.log);
	if (rows.length === 0) res.json({ error: "NO ACCOUNT FOUND" })

	let user = rows[0];
	if (user.password_hash == req.body.password_hash) {
		let rows_profiles = await userDB.query(`SELECT * FROM profiles WHERE id = "${user.id}";`).catch(console.log);
		let user_search_history = await userDB.query(`SELECT * FROM profiles_search_history WHERE id = "${user.id}";`).catch(console.log);
		let user_building_saves = await userDB.query(`SELECT * FROM profiles_building_saves WHERE user_id = "${user.id}";`).catch(console.log);
		user = rows_profiles[0];

		const payload = { user_id: user.id }
		jwt.sign(payload, process.env.JWTSECRET, { expiresIn: 60 * 60 },
			(e, token) => {
				if (e) throw e;
				res.status(200).json({
					token,
					...payload,
					firstName: user.first_name,
					lastName: user.last_name,
					search_history: user_search_history.map(s => s.search_term),
					building_saves: user_building_saves.map(s => s.building_address) 
				});
			}
		);
	}
	else res.sendStatus(401);
});
app.put('/api/users/edit', auth, async (req, res) => {

	edits = [];
	for (const change in req.body.changes) {
		edits.push(`${change} = ${req.body.changes[change]}`);
	}
	await userDB.query(`UPDATE users SET ${edits.join(', ')} WHERE id = "${req.body.id}";`);
	res.sendStatus(200);
});
app.put('/api/profiles/edit', auth, async (req, res) => {
	edits = [];
	for (const change in req.body.changes) {
		edits.push(`${change} = ${req.body.changes[change]}`);
	}
	await userDB.query(`UPDATE profiles SET ${edits.join(', ')} WHERE id = "${req.body.id}";`);
	res.sendStatus(200);
});

// BUILDING/UNIT
app.post('/api/profiles/save/building', auth, async (req, res) => {
	if (!req.body.building) return res.sendStatus(400);
	
	const token = req.header('x-auth-token');
	const data = jwt.verify(token, process.env.JWTSECRET);

	await userDB.query(`INSERT INTO profiles_building_saves VALUES ("${data.payload.id}", ${data.building.latitude}, ${data.building.longitude}, "${req.body.building.address}");`).catch(console.log);
});
app.post('/api/profiles/unsave/building', auth, async (req, res) => {
	if (!req.body.building) return res.sendStatus(400);
	
	const token = req.header('x-auth-token');
	const data = jwt.verify(token, process.env.JWTSECRET);

	await userDB.query(`INSERT INTO profiles_building_saves VALUES ("${data.payload.id}", ${data.building.latitude}, ${data.building.longitude}, "${req.body.building.address}");`).catch(console.log);
});

// CAMERA FEATURES
app.post('/api/img-lookup', async (req, res) => {

	if (!req.body) return res.sendStatus(400);
	
	//get housing info from the db and send back
});

// Expects: {body: {city|zipcode}}
app.post('/api/search', async (req, res, next) => {
	// Send search info data to scraper
	// Save results to db
	// Send results to front end
	res.json().status(200)

	// Authenticate
	auth(req, res, next);

	// Save search history
	const token = req.header('x-auth-token');
	const data = jwt.verify(token, process.env.JWTSECRET);
	console.log('payload: ' + data.payload);
	await userDB.query(`INSERT INTO sessions_search_history VALUES ("${data.payload.id}", "${data.payload.searchTerm}");`);
});

// Test/Dev route for hand-picked data (not returned by the pipeline)

// TBD
// app.get('/api/searchHistory', auth, async (req, res) => { 
// 	const token = req.header('x-auth-token');
// 	const data = jwt.verify(token, process.env.JWTSECRET);
// 	const rows = await userDB.query(`SELECT * FROM sessions_search_history WHERE id = "${data.payload.id}"`);
// 	res.json(rows).status(200);
// });

/**
 * @typedef { { building: {id: uuid, address: string, description: string, website: URL, photos: Array<URL>, amenities: string, units: [{ unit: { apn: string, roomNum: number, sqrFt: number, rent: number, website: URL, photos: Array<URL> } }] } }} BuildingStruct
 * @param {DatabaseManager} dbManager 
 * @param {BuildingStruct} buildingStruct
 * @returns {boolean}
 */
const saveBuildingToDB = async (dbManager, buildingStruct) => {

	pipelineDB.query(``)
};


app.listen(process.env.PORT, () => console.log(`Listening on ${process.env.PORT}`));

const newServerLog = (text) => {
	console.log(text);
	fs.appendFileSync('./logs/serverlogs.txt', text + '\n');
}

process.on('uncaughtException', e => {
	console.log('UNCAUGHT EXCEPTION!');
	console.log(e);
});

process.on('unhandledRejection', (reason, promise) => {
	console.log(`UNHANDLED PROMISE REJECTION! Reason ${reason}`);
	console.log(promise);
});
