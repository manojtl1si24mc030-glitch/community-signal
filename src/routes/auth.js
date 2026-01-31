const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

// Generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

/**
 * @route   POST /api/v1/auth/anonymous
 * @desc    Get anonymous token for unregistered users
 * @access  Public
 */
router.post('/anonymous', async (req, res) => {
    try {
        const anonymousId = `anon_${uuidv4()}`;

        // Create anonymous user
        const user = await User.create({
            anonymousId,
            displayName: 'Anonymous User',
            role: 'citizen'
        });

        const token = generateToken(user);

        res.status(201).json({
            success: true,
            data: {
                anonymousId,
                token,
                user: {
                    id: user._id,
                    displayName: user.displayName,
                    role: user.role,
                    points: user.points
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
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('displayName').trim().isLength({ min: 2 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, password, displayName, phone } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            email,
            password: hashedPassword,
            displayName,
            phone,
            role: 'citizen'
        });

        const token = generateToken(user);

        res.status(201).json({
            success: true,
            data: {
                token,
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    points: user.points
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
 * @route   POST /api/v1/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').exists()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find user with password
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Update last active
        user.lastActive = new Date();
        await user.save();

        const token = generateToken(user);

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    points: user.points,
                    stats: user.stats,
                    badges: user.badges
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
 * @route   GET /api/v1/auth/verify
 * @desc    Verify token
 * @access  Private
 */
router.get('/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    displayName: user.displayName,
                    role: user.role,
                    points: user.points
                }
            }
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
});

// Import OTP model and email service for password reset
const OTP = require('../models/OTP');
const { sendOTPEmail } = require('../services/emailService');

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Send OTP for password reset
 * @access  Public
 */
router.post('/forgot-password', [
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, phone } = req.body;

        if (!email && !phone) {
            return res.status(400).json({
                success: false,
                error: 'Email or phone number is required'
            });
        }

        // Find user by email or phone
        const query = email ? { email } : { phone };
        const user = await User.findOne(query);

        if (!user) {
            // Don't reveal if user exists
            return res.json({
                success: true,
                message: 'If an account exists, a verification code has been sent'
            });
        }

        // Delete any existing OTPs for this user
        await OTP.deleteMany(query);

        // Generate new OTP
        const otpCode = OTP.generateOTP();
        const otpData = email ? { email, otp: otpCode } : { phone, otp: otpCode };

        await OTP.create(otpData);

        // Send OTP via email (for now, only email is implemented)
        if (email) {
            try {
                await sendOTPEmail(email, otpCode);
            } catch (emailError) {
                // In development, still return success and log OTP
                if (process.env.NODE_ENV !== 'production') {
                    console.log(`[DEV] OTP for ${email}: ${otpCode}`);
                } else {
                    throw emailError;
                }
            }
        }

        // For phone, you would integrate with an SMS service like Twilio
        // if (phone) {
        //     await sendSMS(phone, `Your verification code is: ${otpCode}`);
        // }

        res.json({
            success: true,
            message: 'Verification code sent successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password with OTP verification
 * @access  Public
 */
router.post('/reset-password', [
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone(),
    body('otp').isLength({ min: 6, max: 6 }),
    body('newPassword').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { email, phone, otp, newPassword } = req.body;

        if (!email && !phone) {
            return res.status(400).json({
                success: false,
                error: 'Email or phone number is required'
            });
        }

        // Find OTP record
        const query = email ? { email } : { phone };
        const otpRecord = await OTP.findOne({ ...query, otp });

        if (!otpRecord) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired verification code'
            });
        }

        // Verify OTP
        try {
            await otpRecord.verify(otp);
        } catch (verifyError) {
            return res.status(400).json({
                success: false,
                error: verifyError.message
            });
        }

        // Find user and update password
        const user = await User.findOne(query).select('+password');

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        // Delete used OTP
        await OTP.deleteOne({ _id: otpRecord._id });

        res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
