const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
	// Get token form header
	const token = req.header('x-auth-token');

	// Check if no token exists
	if (!token) {
		return res.status(401).json({ error: 'No token, authorization denied' });
	}

	// Verify token
	try {
		const decoded = jwt.verify(token, process.env.JWTSECRET);
		req.user = decoded.user;
		next();
	} catch (err) {
		res.status(401).json({ error: 'Token is not valid' });
	}
};