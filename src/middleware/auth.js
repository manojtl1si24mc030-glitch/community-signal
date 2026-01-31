const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Auth middleware - requires valid JWT token
 */
const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access denied. No token provided.'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found.'
            });
        }

        req.user = {
            id: user._id,
            role: user.role
        };

        next();
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Invalid token.'
        });
    }
};

module.exports = auth;
