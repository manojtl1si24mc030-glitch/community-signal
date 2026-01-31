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

// Database connection
const connectDB = async () => {
    try {
        // Try to connect to configured MongoDB first
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/community-signal', {
            serverSelectionTimeoutMS: 5000 // 5 second timeout
        });
        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.log('⚠️ Local MongoDB not available, starting in-memory MongoDB...');
        try {
            // Use mongodb-memory-server for development
            const { MongoMemoryServer } = require('mongodb-memory-server');
            const mongoServer = await MongoMemoryServer.create();
            const mongoUri = mongoServer.getUri();
            await mongoose.connect(mongoUri);
            console.log('✅ In-memory MongoDB connected successfully');
            console.log('📝 Note: Data will be lost when server restarts');
        } catch (memError) {
            console.error('❌ MongoDB connection error:', memError.message);
            process.exit(1);
        }
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
