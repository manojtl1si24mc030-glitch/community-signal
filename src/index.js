const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const issueRoutes = require('./routes/issues');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

// Create Express app
const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? 'https://your-domain.com'
        : 'http://localhost:3000',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/issues', issueRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/webhook', webhookRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// Database connection - Cloud MongoDB Only
const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║       🔄 MongoDB Connection Initializing       ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');

    // Check if URI is configured
    if (!mongoUri) {
        console.error('❌ ERROR: No MongoDB URI configured!');
        console.error('');
        console.error('   Please set MONGO_URI in your .env file:');
        console.error('   MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname');
        console.error('');
        process.exit(1);
    }

    // Log connection attempt (hide password)
    const safeUri = mongoUri.replace(/:([^:@]+)@/, ':****@');
    console.log('📍 Target:', safeUri);
    console.log('⏳ Attempting connection...');
    console.log('');

    try {
        // Connection options
        const options = {
            serverSelectionTimeoutMS: 10000, // 10 second timeout
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
        };

        console.log('� Options: timeout=10s, poolSize=10');

        await mongoose.connect(mongoUri, options);

        // Connection successful
        console.log('');
        console.log('╔════════════════════════════════════════════════╗');
        console.log('║   ✅ MongoDB Atlas Connected Successfully!     ║');
        console.log('╠════════════════════════════════════════════════╣');
        console.log('║   📊 Database: ' + (mongoose.connection.name || 'connected').padEnd(31) + '║');
        console.log('║   🌐 Host: ' + (mongoose.connection.host || 'cloud').substring(0, 35).padEnd(35) + '║');
        console.log('║   � Storage: Cloud (Persistent)               ║');
        console.log('╚════════════════════════════════════════════════╝');
        console.log('');

        // Connection event listeners for debugging
        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('✅ MongoDB reconnected successfully!');
        });

    } catch (error) {
        console.error('');
        console.error('╔════════════════════════════════════════════════╗');
        console.error('║   ❌ MongoDB Connection FAILED                 ║');
        console.error('╚════════════════════════════════════════════════╝');
        console.error('');
        console.error('🔍 Error Details:');
        console.error('   Name:', error.name);
        console.error('   Message:', error.message);
        console.error('');
        console.error('🛠️  Troubleshooting:');
        console.error('   1. Check your MONGO_URI in .env file');
        console.error('   2. Verify username/password are correct');
        console.error('   3. Ensure IP is whitelisted in MongoDB Atlas');
        console.error('   4. Check your internet connection');
        console.error('   5. Verify cluster is running in Atlas dashboard');
        console.error('');
        process.exit(1);
    }
};

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`
    🚀 Community Signal API Server
    ================================
    Environment: ${process.env.NODE_ENV || 'development'}
    Port: ${PORT}
    Health: http://localhost:${PORT}/health
    API: http://localhost:${PORT}/api/v1
    ================================
    `);
    });
};

startServer();

module.exports = app;
