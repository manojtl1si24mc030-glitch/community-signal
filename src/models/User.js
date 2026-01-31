const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Anonymous users have anonymousId, registered users have email
    anonymousId: {
        type: String,
        unique: true,
        sparse: true
    },
    email: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        select: false
    },
    phone: {
        type: String,
        trim: true
    },
    displayName: {
        type: String,
        trim: true,
        default: 'Anonymous User'
    },
    role: {
        type: String,
        enum: ['citizen', 'ngo', 'authority', 'admin'],
        default: 'citizen'
    },

    // Gamification
    points: {
        type: Number,
        default: 0
    },
    badges: [{
        badgeId: String,
        earnedAt: Date
    }],

    // Stats
    stats: {
        totalReports: { type: Number, default: 0 },
        verifiedReports: { type: Number, default: 0 },
        resolvedReports: { type: Number, default: 0 },
        totalVotes: { type: Number, default: 0 }
    },

    // Preferences
    preferences: {
        notifications: { type: Boolean, default: true },
        emailAlerts: { type: Boolean, default: false },
        whatsappAlerts: { type: Boolean, default: false }
    },

    // Activity
    lastActive: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes
userSchema.index({ points: -1 }); // For leaderboard
userSchema.index({ 'stats.totalReports': -1 });

// Methods
userSchema.methods.addPoints = async function (points, reason) {
    this.points += points;
    await this.save();
    return this.points;
};

userSchema.methods.updateStats = async function (field) {
    if (this.stats[field] !== undefined) {
        this.stats[field] += 1;
        await this.save();
    }
};

module.exports = mongoose.model('User', userSchema);
