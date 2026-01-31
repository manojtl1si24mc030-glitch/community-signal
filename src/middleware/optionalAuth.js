const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Optional Auth middleware - attaches user if token present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
            const user = await User.findById(decoded.id);

            if (user) {
                req.user = {
                    id: user._id,
                    role: user.role
                };
            }
        }

        next();
    } catch (error) {
        // Token invalid, but that's okay - continue without user
        next();
    }
};

module.exports = optionalAuth;
