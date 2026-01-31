const nodemailer = require('nodemailer');

// Create transporter with configuration from environment variables
// Supports any SMTP provider (Gmail, SendGrid, custom SMTP, etc.)
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
};

/**
 * Send OTP email for password reset
 * @param {string} to - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<boolean>}
 */
const sendOTPEmail = async (to, otp) => {
    try {
        const transporter = createTransporter();

        const mailOptions = {
            from: process.env.SMTP_FROM || '"Community Signal" <noreply@communitysignal.app>',
            to: to,
            subject: 'Password Reset - Your Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #667eea; margin: 0;">Community Signal</h1>
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 12px; padding: 30px; text-align: center;">
                        <h2 style="color: #1e293b; margin-top: 0;">Password Reset Request</h2>
                        <p style="color: #64748b; font-size: 16px;">
                            You requested to reset your password. Use the verification code below:
                        </p>
                        
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: white;">
                                ${otp}
                            </span>
                        </div>
                        
                        <p style="color: #94a3b8; font-size: 14px;">
                            This code expires in <strong>10 minutes</strong>
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; color: #94a3b8; font-size: 12px;">
                        <p>If you didn't request this, please ignore this email.</p>
                        <p>&copy; 2026 Community Signal. All rights reserved.</p>
                    </div>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`OTP email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('Email sending failed:', error);
        // In development, log the OTP for testing
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] OTP for ${to}: ${otp}`);
        }
        throw error;
    }
};

/**
 * Send generic email
 * @param {Object} options - Email options
 */
const sendEmail = async (options) => {
    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.SMTP_FROM || '"Community Signal" <noreply@communitysignal.app>',
        ...options
    };

    return transporter.sendMail(mailOptions);
};

module.exports = {
    sendOTPEmail,
    sendEmail
};
