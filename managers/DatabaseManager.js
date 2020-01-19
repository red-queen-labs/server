const mysqlPromise = require('mysql2/promise');
const mysql = require('mysql2');

module.exports = class DatabaseManager {

	constructor(database) {

		this.connected = false;
		this.newConnectionPool(database).then(() => {
			this.registerListeners();
		});
	}

	async newConnectionPool (database) {

		this.pool = mysqlPromise.createPool({
			host: process.env.DBHOST,
			user: process.env.DBUSER,
			password: process.env.DBPASSWORD,
			database: database,
			connectionLimit: 10,
			charset: 'utf8mb4'
		});
		this.connected = true;
		// this.pool.getConnection().then(conn => {
		// 	const res = conn.query('select foo from bar');
		// 	conn.release();
		// 	return res;
		// });
	}

	async registerListeners () {

		this.pool.on('error', e => {

			if (e.code === 'PROTOCOL_CONNECTION_LOST') this.newConnectionPool();
			else throw e;
		});
	}

	// Query the DB, returns rows.
	async query (query) {

		if (!this.connected) return Promise.reject('Not connected to the server - cannot perform query on db.');

		const [rows, fields] = await this.pool.execute(query).catch(e => console.log(`DatabaseManager.query("${query}") - QUERY FAILED: ${e}`));
		return rows;
	}
}
//[ BinaryRow { '? + ?': 4 } ]
// [ BinaryRow { '4': 4 } ]
