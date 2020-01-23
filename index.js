const express = require('express');

const fs = require('fs');

const uuid = require('uuid');
const jwt = require('jsonwebtoken');

const DatabaseManager = require('./managers/DatabaseManager.js');

require('dotenv').config();

const app = express();

let sessionDB = new DatabaseManager(process.env.DBUSERS);
let pipelineDB = new DatabaseManager(process.env.DBPIPELINE);

app.use(express.json({ extended: true }));
app.use(async (req, res, next) => {
	newServerLog(`${req.method} on ${req.url} - ${new Date()}`);
	next();
});
app.get('/', (req, res) => res.sendStatus(200));
// app.use(express.static(__dirname + '/public'));

// app.use('/', (req, res) => res.render('./public/index'));

// USERS
// Expected body: {email, password_hash, firstName, last_name}
app.post('/api/users/register', async (req, res) => {

	if (!req.body.user_id || !req.body.email || !req.body.password_hash || !req.body.first_name || !req.body.last_name) res.status(400).json({error: "MISSING PARAMETERS - Body must contain: user_id, email, password_hash, first_name, and last_name"});

	const count = await sessionDB.query(`SELECT COUNT(1) AS count FROM users WHERE email = "${req.body.email}";`);
	if (count[0].count > 0) return res.json({ error: 'EMAIL ALREADY IN USE' }).status(422);

	await sessionDB.query(`INSERT INTO users VALUES ("${req.body.user_id}", "${req.body.email}", "${req.body.password_hash}");`)
		.catch(res.send);
		await sessionDB.query(`INSERT INTO profiles VALUES ("${req.body.user_id}", "${req.body.first_name}", "${req.body.last_name}");`)
		.catch(e => res.status(500).json(e));

	const payload = { user_id: req.body.user_id }
	jwt.sign(payload, process.env.JWTSECRET, { expiresIn: 60 * 60 },
		(e, token) => {
			if (e) throw e;
			res.status(200).json({ token, ...payload });
		}
	);

	newServerLog(`Registered new user: ${req.body.user_id}, ${req.body.first_name} ${req.body.last_name}, ${req.body.email}`)
});
app.post('/api/users/login', async (req, res) => {

	let rows = await sessionDB.query(`SELECT * FROM users WHERE email = "${req.body.email}";`).catch(console.log);
	let user = rows[0];
	if (rows.length === 0 || user.password_hash != req.body.password_hash) return res.status(401).json({ error: "NO ACCOUNT FOUND" })

	let rows_profiles = await sessionDB.query(`SELECT * FROM profiles WHERE id = "${user.id}";`).catch(console.log);
	let user_search_history = await sessionDB.query(`SELECT * FROM profiles_search_history WHERE id = "${user.id}";`).catch(console.log);
	let user_building_saves = await sessionDB.query(`SELECT * FROM profiles_building_saves WHERE user_id = "${user.id}";`).catch(console.log);
	let profile = rows_profiles[0];

	const payload = { user_id: profile.id }
	jwt.sign(payload, process.env.JWTSECRET, { expiresIn: 60 * 60 },
		(e, token) => {

			if (e) throw e;

			res.status(200).json({
				token,
				...payload,
				first_name: profile.first_name,
				last_name: profile.last_name,
				search_history: user_search_history.map(s => s.search_term),
				building_saves: user_building_saves.map(s => s.building_address) 
			});
		}
	);
});
app.post('/api/users/logout', authUser, async (req, res) => {
	const token = req.header('x-auth-token');
	await sessionDB.query(`INSERT INTO blocked_tokens VALUES ("${req.user.user_id}", "${token}");`);
});
app.put('/api/users/edit', authUser, async (req, res) => {

	edits = [];
	for (const change in req.body.changes) {
		if (!['email', 'password_hash'].some(changable => change == changable)) continue;
		if (change == 'email') {
			const count = await sessionDB.query(`SELECT COUNT(1) AS count FROM users WHERE email = "${req.body.changes[change]}";`);
			if (count[0].count > 0) return res.status(409).json({ error: "EMAIL ALREADY REGISTERED" });
		}
		edits.push(`${change} = "${req.body.changes[change]}"`);
	}
	await sessionDB.query(`UPDATE users SET ${edits.join(', ')} WHERE id = "${req.user.user_id}";`);
	res.sendStatus(200);
});
app.put('/api/profiles/edit', authUser, async (req, res) => {
	edits = [];
	for (const change in req.body.changes) {

		edits.push(`${change} = "${req.body.changes[change]}"`);
	}
	await sessionDB.query(`UPDATE profiles SET ${edits.join(', ')} WHERE id = "${req.user.user_id}";`);
	res.sendStatus(200);
});

// BUILDING/UNIT
app.post('/api/profiles/save/building', authUser, async (req, res) => {
	if (!req.body.building) return res.sendStatus(400);

	await sessionDB.query(`INSERT INTO profiles_building_saves VALUES ("${req.body.payload.id}", "${req.body.building.address}");`).catch(console.log);
});
app.post('/api/profiles/remove/building', authUser, async (req, res) => {
	if (!req.body.building) return res.sendStatus(400);

	await sessionDB.query(`INSERT INTO profiles_building_saves VALUES ("${req.body.payload.id}", "${req.body.building.address}");`).catch(console.log);
});

// CAMERA FEATURES
app.post('/api/img-lookup', async (req, res) => {

	if (!req.body) return res.sendStatus(400);
	
	res.sendStatus(200);
	//get housing info from the db and send back
});

// Expects: {body: {city|zipcode}}
app.post('/api/search', async (req, res, next) => {
	// Send search info data to scraper
	// Save results to db
	// Send results to front end
	res.json().status(200)

	// Authenticate
	authUser(req, res, next);

	// Save search history
	const token = req.header('x-auth-token');
	const data = jwt.verify(token, process.env.JWTSECRET);
	console.log('payload: ' + data.payload);
	await sessionDB.query(`INSERT INTO sessions_search_history VALUES ("${data.payload.id}", "${data.payload.searchTerm}");`);
});
app.get('/api/building/get', async (req, res, next) => {

	const rows = await pipelineDB.query(`SELECT 15 FROM building LEFT JOIN units;`)
	// PARSE DATA
	res.json([]);
});
app.post('/api/building/save', async (req, res, next) => {
	for (const building of req.body.buildings) {
		saveBuildingToDB(building);
	}
	res.sendStatus(200);
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
 * @typedef { { apn: string, roomNum: number, sqrFt: number, rent: number, website: URL, bathrooms: number, bedrooms: number, photos: Array<URL> } } UnitStruct
 * @typedef { {id: uuid, address: string, lat: number, lon: number, website: URL, description: string, photos: Array<URL>, amenities: string, units: Array<UnitStruct>} } BuildingStruct
 * @param {BuildingStruct} buildingStruct
 * @returns {boolean}
 */
const saveBuildingToDB = async (buildingStruct) => {
	if (!buildingStruct) return;
	const building_id = buildingStruct.id == null ? uuid.v4() : buildingStruct.id;

	pipelineDB.query(`INSERT INTO building VALUES ("${building_id}", "${buildingStruct.address}", ${buildingStruct.lat}, ${buildingStruct.lon}, "${buildingStruct.website}", "${buildingStruct.description}", "${buildingStruct.amenities}");`).catch(console.log);
	if (buildingStruct.photos && buildingStruct.photos.length > 0)
		for (const url of buildingStruct.photos) {
			if (!url) continue;
			pipelineDB.query(`INSERT INTO building_photos VALUES ("${building_id}", "${url}");`).catch(console.log);
		}

	for (const unit of buildingStruct.units) {
		if (!unit) continue;
		pipelineDB.query(`INSERT INTO unit VALUES ("${building_id}", "${unit.apn}", ${unit.roomNum}, ${unit.sqrFt}, ${unit.rent}, "${unit.website}", ${unit.bathrooms}, ${unit.bedrooms});`).catch(console.log);
		if (unit.photos && unit.photos.length > 0)
			for (const url of unit.photos) {
				if (!url) continue;
				pipelineDB.query(`INSERT INTO unit_photos VALUES ("${unit.apn}", "${url}")`).catch(console.log);
			}
	}
	return;
};

async function authUser (req, res, next) {
	// Get token form header
	const token = req.header('x-auth-token');

	// Check if no token exists
	if (!token) {
		return res.status(401).json({ error: 'NO TOKEN FOUND' });
	}

	// Verify token
	try {
		const decoded = jwt.verify(token, process.env.JWTSECRET);
		const data = await sessionDB.query(`SELECT COUNT(1) AS count blocked_tokens WHERE token = "${token}";`)
		if (data[0].count > 0) throw new Error();
		req.user = decoded;
		next();
	} catch (err) {
		res.status(401).json({ error: 'INVALID TOKEN' });
	}
}


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
