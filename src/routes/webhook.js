const express = require('express');
const router = express.Router();
const Issue = require('../models/Issue');

/**
 * @route   POST /api/webhook/whatsapp
 * @desc    Handle incoming WhatsApp messages via Twilio
 * @access  Public (Twilio webhook)
 */
router.post('/whatsapp', async (req, res) => {
    try {
        const { Body, From, MediaUrl0, Latitude, Longitude } = req.body;

        // Parse message
        const message = Body?.toLowerCase().trim() || '';
        const phone = From?.replace('whatsapp:', '');

        // Simple command parsing
        if (message.startsWith('report') || message.startsWith('issue')) {
            // Extract category from message
            const categories = ['pothole', 'waste', 'streetlight', 'water', 'safety'];
            const detectedCategory = categories.find(cat => message.includes(cat)) || 'other';

            // Create issue from WhatsApp
            const issue = await Issue.create({
                reporterId: phone,
                isAnonymous: true,
                category: detectedCategory,
                description: Body,
                location: {
                    type: 'Point',
                    coordinates: Longitude && Latitude ? [parseFloat(Longitude), parseFloat(Latitude)] : [77.2090, 28.6139],
                    address: 'Location shared via WhatsApp'
                },
                mediaUrls: MediaUrl0 ? [{ url: MediaUrl0, type: 'image', uploadedAt: new Date() }] : [],
                aiScore: {
                    urgency: 60,
                    validity: 75,
                    analyzedAt: new Date()
                }
            });

            // Send TwiML response
            res.set('Content-Type', 'text/xml');
            res.send(`
        <Response>
          <Message>✅ Issue reported successfully!\n\nTracking ID: ${issue._id}\nCategory: ${detectedCategory}\n\nWe'll notify you when there's an update. Thank you for helping improve your community!</Message>
        </Response>
      `);
        } else if (message.startsWith('status')) {
            // Check status of an issue
            const issueId = message.replace('status', '').trim();

            try {
                const issue = await Issue.findById(issueId);

                if (issue) {
                    res.set('Content-Type', 'text/xml');
                    res.send(`
            <Response>
              <Message>📋 Issue Status\n\nID: ${issue._id}\nCategory: ${issue.category}\nStatus: ${issue.status}\nUrgency: ${issue.aiScore?.urgency || 'N/A'}%\nVotes: 👍${issue.votes.up} 👎${issue.votes.down}</Message>
            </Response>
          `);
                } else {
                    res.set('Content-Type', 'text/xml');
                    res.send(`
            <Response>
              <Message>❌ Issue not found. Please check the tracking ID and try again.</Message>
            </Response>
          `);
                }
            } catch (e) {
                res.set('Content-Type', 'text/xml');
                res.send(`
          <Response>
            <Message>❌ Invalid tracking ID format.</Message>
          </Response>
        `);
            }
        } else {
            // Help message
            res.set('Content-Type', 'text/xml');
            res.send(`
        <Response>
          <Message>👋 Welcome to Community Signal!\n\nCommands:\n• report [category] [description] - Report an issue\n• status [tracking_id] - Check issue status\n\nCategories: pothole, waste, streetlight, water, safety\n\nExample: report pothole Large pothole on main road near park</Message>
        </Response>
      `);
        }
    } catch (error) {
        console.error('WhatsApp webhook error:', error);
        res.set('Content-Type', 'text/xml');
        res.send(`
      <Response>
        <Message>Sorry, something went wrong. Please try again later.</Message>
      </Response>
    `);
    }
});

module.exports = router;
