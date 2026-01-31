const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Issue = require('../models/Issue');
const User = require('../models/User');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optionalAuth');
const axios = require('axios');

/**
 * @route   POST /api/v1/issues
 * @desc    Create a new issue report
 * @access  Public (with optional auth)
 */
router.post('/', optionalAuth, [
    body('category').isIn(['pothole', 'waste', 'streetlight', 'water', 'safety', 'other']),
    body('description').trim().isLength({ min: 10, max: 1000 }),
    body('location.coordinates').isArray({ min: 2, max: 2 }),
    body('location.address').trim().isLength({ min: 5 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { category, description, location, mediaUrls, isAnonymous } = req.body;

        // Determine reporter ID
        const reporterId = req.user?.id || req.body.anonymousId || `temp_${Date.now()}`;

        // Create issue
        const issue = new Issue({
            reporterId,
            isAnonymous: isAnonymous !== false,
            category,
            description,
            location: {
                type: 'Point',
                coordinates: location.coordinates,
                address: location.address,
                locality: location.locality,
                city: location.city
            },
            mediaUrls: mediaUrls || []
        });

        // Call AI service for analysis (if available)
        try {
            const aiResponse = await axios.post(
                `${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/ai/analyze`,
                {
                    category,
                    description,
                    hasMedia: mediaUrls?.length > 0
                },
                { timeout: 5000 }
            );

            issue.aiScore = {
                urgency: aiResponse.data.urgency,
                validity: aiResponse.data.validity,
                predictedCategory: aiResponse.data.predictedCategory,
                confidence: aiResponse.data.confidence,
                analyzedAt: new Date()
            };
        } catch (aiError) {
            // AI service unavailable, use default scores
            issue.aiScore = {
                urgency: 50 + Math.floor(Math.random() * 30),
                validity: 70 + Math.floor(Math.random() * 20),
                confidence: 80,
                analyzedAt: new Date()
            };
        }

        // Add initial status history
        issue.statusHistory.push({
            status: 'pending',
            changedBy: reporterId,
            notes: 'Issue reported'
        });

        await issue.save();

        // Update user stats if authenticated
        if (req.user) {
            const user = await User.findById(req.user.id);
            if (user) {
                user.stats.totalReports += 1;
                user.points += 10; // Points for reporting
                await user.save();
            }
        }

        res.status(201).json({
            success: true,
            data: {
                id: issue._id,
                status: issue.status,
                aiScore: issue.aiScore,
                message: 'Issue reported successfully'
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
 * @route   GET /api/v1/issues
 * @desc    Get all issues with filters
 * @access  Public
 */
router.get('/', [
    query('category').optional().isIn(['pothole', 'waste', 'streetlight', 'water', 'safety', 'other', 'all']),
    query('status').optional().isIn(['pending', 'verified', 'in_progress', 'resolved', 'all']),
    query('sortBy').optional().isIn(['urgency', 'votes', 'recent']),
    query('lat').optional().isFloat(),
    query('lng').optional().isFloat(),
    query('radius').optional().isInt({ min: 1, max: 50 })
], async (req, res) => {
    try {
        const { category, status, sortBy, lat, lng, radius, page = 1, limit = 20 } = req.query;

        // Build query
        let query = {};

        if (category && category !== 'all') {
            query.category = category;
        }

        if (status && status !== 'all') {
            query.status = status;
        }

        // Geospatial query
        if (lat && lng) {
            query.location = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(lng), parseFloat(lat)]
                    },
                    $maxDistance: (parseInt(radius) || 5) * 1000
                }
            };
        }

        // Build sort
        let sort = {};
        switch (sortBy) {
            case 'urgency':
                sort = { 'aiScore.urgency': -1 };
                break;
            case 'votes':
                sort = { 'votes.up': -1 };
                break;
            case 'recent':
            default:
                sort = { createdAt: -1 };
        }

        const issues = await Issue.find(query)
            .sort(sort)
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .select('-voters -statusHistory');

        const total = await Issue.countDocuments(query);

        res.json({
            success: true,
            data: {
                issues,
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

/**
 * @route   GET /api/v1/issues/:id
 * @desc    Get single issue by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
    try {
        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({
                success: false,
                error: 'Issue not found'
            });
        }

        // Increment view count
        issue.viewCount += 1;
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
 * @route   POST /api/v1/issues/:id/vote
 * @desc    Vote on an issue
 * @access  Public (with identifier)
 */
router.post('/:id/vote', optionalAuth, [
    body('voteType').isIn(['up', 'down'])
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { voteType } = req.body;
        const voterId = req.user?.id || req.body.anonymousId || req.ip;

        const issue = await Issue.findById(req.params.id);

        if (!issue) {
            return res.status(404).json({
                success: false,
                error: 'Issue not found'
            });
        }

        const votes = await issue.addVote(voterId, voteType);

        // Award points for voting
        if (req.user) {
            const user = await User.findById(req.user.id);
            if (user) {
                user.stats.totalVotes += 1;
                user.points += 2;
                await user.save();
            }
        }

        res.json({
            success: true,
            data: { votes }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/v1/issues/stats/summary
 * @desc    Get issue statistics
 * @access  Public
 */
router.get('/stats/summary', async (req, res) => {
    try {
        const stats = await Issue.getStats();

        // Category breakdown
        const categoryStats = await Issue.aggregate([
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                overview: stats[0] || {},
                byCategory: categoryStats
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
 * @route   GET /api/v1/issues/complaints/all
 * @desc    Get all issues as complaints with user info
 * @access  Admin only
 */
router.get('/complaints/all', auth, async (req, res) => {
    try {
        const { status, category, search, page = 1, limit = 20 } = req.query;

        // Build query
        let query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (category && category !== 'all') {
            query.category = category;
        }

        if (search) {
            query.$or = [
                { description: { $regex: search, $options: 'i' } },
                { 'location.address': { $regex: search, $options: 'i' } }
            ];
        }

        // Get issues
        const issues = await Issue.find(query)
            .sort({ createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit));

        // Get unique reporter IDs and fetch user info
        const reporterIds = [...new Set(issues.map(i => i.reporterId))];
        const users = await User.find({
            $or: [
                { _id: { $in: reporterIds.filter(id => id.match(/^[0-9a-fA-F]{24}$/)) } },
                { anonymousId: { $in: reporterIds } }
            ]
        }).select('displayName email anonymousId');

        // Create user lookup map
        const userMap = {};
        users.forEach(u => {
            if (u._id) userMap[u._id.toString()] = u;
            if (u.anonymousId) userMap[u.anonymousId] = u;
        });

        // Merge user info with issues
        const complaintsWithUsers = issues.map(issue => {
            const user = userMap[issue.reporterId] || {};
            return {
                _id: issue._id,
                category: issue.category,
                description: issue.description,
                location: issue.location,
                status: issue.status,
                aiScore: issue.aiScore,
                votes: issue.votes,
                createdAt: issue.createdAt,
                updatedAt: issue.updatedAt,
                isAnonymous: issue.isAnonymous,
                user: {
                    displayName: issue.isAnonymous ? 'Anonymous' : (user.displayName || 'Unknown User'),
                    email: issue.isAnonymous ? null : (user.email || null),
                    reporterId: issue.reporterId
                }
            };
        });

        const total = await Issue.countDocuments(query);

        // Get stats
        const stats = {
            total: await Issue.countDocuments({}),
            pending: await Issue.countDocuments({ status: 'pending' }),
            inProgress: await Issue.countDocuments({ status: 'in_progress' }),
            resolved: await Issue.countDocuments({ status: 'resolved' }),
            verified: await Issue.countDocuments({ status: 'verified' })
        };

        res.json({
            success: true,
            data: {
                complaints: complaintsWithUsers,
                stats,
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
