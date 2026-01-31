const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    otp: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
    },
    verified: {
        type: Boolean,
        default: false
    },
    attempts: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for auto-deletion of expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for faster lookups
otpSchema.index({ email: 1, otp: 1 });
otpSchema.index({ phone: 1, otp: 1 });

// Generate a 6-digit OTP
otpSchema.statics.generateOTP = function () {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// Verify OTP
otpSchema.methods.verify = async function (inputOtp) {
    if (this.attempts >= 5) {
        throw new Error('Too many attempts. Please request a new OTP.');
    }

    this.attempts += 1;

    if (this.otp !== inputOtp) {
        await this.save();
        throw new Error('Invalid OTP');
    }

    if (new Date() > this.expiresAt) {
        throw new Error('OTP has expired');
    }

    this.verified = true;
    await this.save();
    return true;
};

module.exports = mongoose.model('OTP', otpSchema);
