const mongoose = require('mongoose');

const issueSchema = new mongoose.Schema({
    // Reporter info
    reporterId: {
        type: String,
        required: true
    },
    isAnonymous: {
        type: Boolean,
        default: true
    },

    // Location
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true
        },
        address: {
            type: String,
            required: true
        },
        locality: String,
        city: String,
        state: String,
        pincode: String
    },

    // Issue details
    category: {
        type: String,
        enum: ['pothole', 'waste', 'streetlight', 'water', 'safety', 'other'],
        required: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 1000
    },

    // Media
    mediaUrls: [{
        url: String,
        type: { type: String, enum: ['image', 'video'] },
        uploadedAt: Date
    }],
    voiceNoteUrl: String,

    // AI Analysis
    aiScore: {
        urgency: { type: Number, min: 0, max: 100, default: 50 },
        validity: { type: Number, min: 0, max: 100, default: 50 },
        predictedCategory: String,
        confidence: { type: Number, min: 0, max: 100 },
        analyzedAt: Date
    },

    // Status
    status: {
        type: String,
        enum: ['pending', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected'],
        default: 'pending'
    },

    // Voting
    votes: {
        up: { type: Number, default: 0 },
        down: { type: Number, default: 0 }
    },
    voters: [{
        oderId: String,
        voteType: { type: String, enum: ['up', 'down'] },
        votedAt: Date
    }],

    // Assignment
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedAt: Date,
    assignedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    // Resolution
    resolution: {
        notes: String,
        beforeImageUrl: String,
        afterImageUrl: String,
        resolvedAt: Date,
        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },

    // Timestamps for status changes
    statusHistory: [{
        status: String,
        changedAt: { type: Date, default: Date.now },
        changedBy: String,
        notes: String
    }],

    // Analytics
    viewCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 }

}, {
    timestamps: true
});

// Geospatial index for location queries
issueSchema.index({ location: '2dsphere' });

// Compound indexes for common queries
issueSchema.index({ status: 1, category: 1 });
issueSchema.index({ 'aiScore.urgency': -1 });
issueSchema.index({ createdAt: -1 });
issueSchema.index({ reporterId: 1 });

// Virtual for net votes
issueSchema.virtual('netVotes').get(function () {
    return this.votes.up - this.votes.down;
});

// Methods
issueSchema.methods.addVote = async function (oderId, voteType) {
    // Check if user already voted
    const existingVote = this.voters.find(v => v.oderId === oderId);

    if (existingVote) {
        if (existingVote.voteType === voteType) {
            // Remove vote
            this.voters = this.voters.filter(v => v.oderId !== oderId);
            this.votes[voteType] -= 1;
        } else {
            // Change vote
            this.votes[existingVote.voteType] -= 1;
            existingVote.voteType = voteType;
            existingVote.votedAt = new Date();
            this.votes[voteType] += 1;
        }
    } else {
        // New vote
        this.voters.push({ oderId, voteType, votedAt: new Date() });
        this.votes[voteType] += 1;
    }

    await this.save();
    return this.votes;
};

issueSchema.methods.updateStatus = async function (newStatus, userId, notes = '') {
    this.status = newStatus;
    this.statusHistory.push({
        status: newStatus,
        changedBy: userId,
        notes
    });

    if (newStatus === 'resolved') {
        this.resolution.resolvedAt = new Date();
        this.resolution.resolvedBy = userId;
        if (notes) this.resolution.notes = notes;
    }

    await this.save();
    return this;
};

// Statics
issueSchema.statics.findNearby = async function (coordinates, radiusKm = 5) {
    return this.find({
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates
                },
                $maxDistance: radiusKm * 1000
            }
        }
    });
};

issueSchema.statics.getStats = async function () {
    return this.aggregate([
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                verified: { $sum: { $cond: [{ $eq: ['$status', 'verified'] }, 1, 0] } },
                inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
                resolved: { $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] } },
                avgUrgency: { $avg: '$aiScore.urgency' }
            }
        }
    ]);
};

module.exports = mongoose.model('Issue', issueSchema);
