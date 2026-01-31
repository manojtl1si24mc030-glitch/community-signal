/**
 * Admin Auth middleware - requires admin role
 */
const adminAuth = (req, res, next) => {
    if (req.user.role !== 'admin' && req.user.role !== 'authority') {
        return res.status(403).json({
            success: false,
            error: 'Access denied. Admin privileges required.'
        });
    }
    next();
};

module.exports = adminAuth;
