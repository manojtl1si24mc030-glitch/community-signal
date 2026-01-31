const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   PUT /api/v1/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', auth, async (req, res) => {
    try {
        const { displayName, phone, preferences } = req.body;

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (displayName) user.displayName = displayName;
        if (phone) user.phone = phone;
        if (preferences) user.preferences = { ...user.preferences, ...preferences };

        await user.save();

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/v1/users/leaderboard
 * @desc    Get leaderboard
 * @access  Public
 */
router.get('/leaderboard', async (req, res) => {
    try {
        const { period = 'all', limit = 10 } = req.query;

        let dateFilter = {};
        const now = new Date();

        switch (period) {
            case 'weekly':
                dateFilter = {
                    lastActive: { $gte: new Date(now.setDate(now.getDate() - 7)) }
                };
                break;
            case 'monthly':
                dateFilter = {
                    lastActive: { $gte: new Date(now.setMonth(now.getMonth() - 1)) }
                };
                break;
        }

        const users = await User.find({
            ...dateFilter,
            role: 'citizen'
        })
            .sort({ points: -1 })
            .limit(parseInt(limit))
            .select('displayName points stats badges');

        res.json({
            success: true,
            data: users.map((user, index) => ({
                rank: index + 1,
                id: user._id,
                name: user.displayName,
                points: user.points,
                reports: user.stats.totalReports,
                resolved: user.stats.resolvedReports,
                badges: user.badges
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/v1/users/:id/issues
 * @desc    Get issues reported by a user
 * @access  Public
 */
router.get('/:id/issues', async (req, res) => {
    try {
        const Issue = require('../models/Issue');

        const issues = await Issue.find({ reporterId: req.params.id })
            .sort({ createdAt: -1 })
            .limit(20)
            .select('category description status aiScore votes createdAt');

        res.json({
            success: true,
            data: issues
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/v1/users/me/badges
 * @desc    Get current user's badge progress
 * @access  Private
 */
router.get('/me/badges', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Badge definitions with requirements
        const badgeDefinitions = [
            {
                id: 'first_report',
                name: 'First Report',
                description: 'Submit your first issue report',
                requirement: 1,
                statField: 'totalReports',
                icon: 'star'
            },
            {
                id: 'verified_reporter',
                name: 'Verified Reporter',
                description: '10 verified reports',
                requirement: 10,
                statField: 'verifiedReports',
                icon: 'award'
            },
            {
                id: 'community_helper',
                name: 'Community Helper',
                description: '50 issues resolved',
                requirement: 50,
                statField: 'resolvedReports',
                icon: 'target'
            },
            {
                id: 'quick_responder',
                name: 'Quick Responder',
                description: 'Report 5 urgent issues first',
                requirement: 5,
                statField: 'totalReports', // Would need separate tracking for urgent first reports
                icon: 'zap'
            },
            {
                id: 'influencer',
                name: 'Influencer',
                description: '100 upvotes received',
                requirement: 100,
                statField: 'totalVotes',
                icon: 'trending-up'
            }
        ];

        // Calculate progress for each badge
        const badgeProgress = badgeDefinitions.map(badge => {
            const currentValue = user.stats[badge.statField] || 0;
            const progress = Math.min((currentValue / badge.requirement) * 100, 100);
            const earned = user.badges.some(b => b.badgeId === badge.id);

            return {
                id: badge.id,
                name: badge.name,
                description: badge.description,
                icon: badge.icon,
                requirement: badge.requirement,
                currentValue,
                progress: Math.round(progress),
                earned,
                earnedAt: earned ? user.badges.find(b => b.badgeId === badge.id)?.earnedAt : null
            };
        });

        // Check and award new badges
        for (const badge of badgeProgress) {
            if (badge.progress >= 100 && !badge.earned) {
                user.badges.push({
                    badgeId: badge.id,
                    earnedAt: new Date()
                });
            }
        }
        await user.save();

        res.json({
            success: true,
            data: {
                badges: badgeProgress,
                stats: user.stats,
                totalPoints: user.points
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
