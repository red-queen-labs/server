const mysql = require('mysql2/promise');

module.exports = class DatabaseManager {

	constructor() {

		this.connected = false;
		this.getConnection().then(() => {
			this.registerListeners();
		});
	}

	async getConnection () {

		this.pool = mysql.createPool({
			host: process.env.DBHOST,
			user: process.env.DBUSER,
			password: process.env.DBPASSWORD,
			database: process.env.DBNAME,
			connectionLimit: 10,
			charset: 'utf8mb4'
		});
		this.connected = true;
		return true;
		// this.pool.getConnection().then(conn => {
		// 	const res = conn.query('select foo from bar');
		// 	conn.release();
		// 	return res;
		// });
	}

	async registerListeners () {

		this.pool.on('error', e => {

			if (e.code === 'PROTOCOL_CONNECTION_LOST') this.getConnection();
			else throw e;
		});
	}

	// Query the DB, returns rows.
	async query (query, valuesToInject = []) {
		if (!this.connected) return Promise.reject('Not connected to the server - cannot perform query on db.');
		
		const [rows, fields] = await this.pool.execute(query, valuesToInject).catch(e => console.log(`DatabaseManager.query("${query}") - QUERY FAILED: ${e}`));
		return rows;
	}
}
