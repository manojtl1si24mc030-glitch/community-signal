const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

/**
 * @route   GET /api/v1/admin/dashboard
 * @desc    Get admin dashboard stats
 * @access  Admin
 */
router.get('/dashboard', auth, adminAuth, async (req, res) => {
    try {
        // Issue stats
        const issueStats = await Issue.getStats();

        // Recent issues
        const recentIssues = await Issue.find()
            .sort({ createdAt: -1 })
            .limit(10)
            .select('category description status aiScore location createdAt');

        // Category breakdown
        const categoryBreakdown = await Issue.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // User stats
        const userStats = await User.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    activeUsers: {
                        $sum: {
                            $cond: [
                                { $gte: ['$lastActive', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Daily trend (last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const dailyTrend = await Issue.aggregate([
            { $match: { createdAt: { $gte: weekAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            data: {
                issues: issueStats[0] || {},
                users: userStats[0] || {},
                recentIssues,
                categoryBreakdown,
                dailyTrend
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   PATCH /api/v1/admin/issues/:id/status
 * @desc    Update issue status
 * @access  Admin
 */
router.patch('/issues/:id/status', auth, adminAuth, async (req, res) => {
    try {
        const { status, notes } = req.body;

        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({
                success: false,
                error: 'Issue not found'
            });
        }

        await issue.updateStatus(status, req.user.id, notes);

        // If resolved, award points to reporter
        if (status === 'resolved' && issue.reporterId) {
            const reporter = await User.findOne({
                $or: [
                    { _id: issue.reporterId },
                    { anonymousId: issue.reporterId }
                ]
            });

            if (reporter) {
                reporter.stats.resolvedReports += 1;
                reporter.points += 50; // Bonus for resolved issue
                await reporter.save();
            }
        }

        res.json({
            success: true,
            data: issue
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/v1/admin/issues/:id/assign
 * @desc    Assign issue to authority
 * @access  Admin
 */
router.post('/issues/:id/assign', auth, adminAuth, async (req, res) => {
    try {
        const { assigneeId, notes } = req.body;

        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({
                success: false,
                error: 'Issue not found'
            });
        }

        issue.assignedTo = assigneeId;
        issue.assignedBy = req.user.id;
        issue.assignedAt = new Date();
        issue.status = 'assigned';

        issue.statusHistory.push({
            status: 'assigned',
            changedBy: req.user.id,
            notes: notes || `Assigned to authority`
        });

        await issue.save();

        res.json({
            success: true,
            data: issue
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/v1/admin/issues/:id
 * @desc    Delete/reject issue
 * @access  Admin
 */
router.delete('/issues/:id', auth, adminAuth, async (req, res) => {
    try {
        const { reason } = req.body;

        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({
                success: false,
                error: 'Issue not found'
            });
        }

        // Soft delete by updating status
        issue.status = 'rejected';
        issue.statusHistory.push({
            status: 'rejected',
            changedBy: req.user.id,
            notes: reason || 'Rejected by admin'
        });

        await issue.save();

        res.json({
            success: true,
            message: 'Issue rejected successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/v1/admin/users
 * @desc    Get all users
 * @access  Admin
 */
router.get('/users', auth, adminAuth, async (req, res) => {
    try {
        const { role, page = 1, limit = 20 } = req.query;

        let query = {};
        if (role) query.role = role;

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .select('-password');

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
