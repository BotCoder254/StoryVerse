const express = require('express');
const router = express.Router();
const { ensureAuth, ensureGuest } = require('../middleware/auth');
const Story = require('../models/Story');
const User = require('../models/User');

// @desc    Landing page
// @route   GET /
router.get('/', ensureGuest, (req, res) => {
    res.render('index');
});

// @desc    Feed page
// @route   GET /feed
router.get('/feed', ensureAuth, async (req, res) => {
    try {
        // Get current user with populated following
        const user = await User.findById(req.user.id).populate('following');
        
        // Get stories from followed users
        const followingIds = user.following.map(f => f._id);
        followingIds.push(req.user.id); // Include user's own stories
        
        const stories = await Story.find({
            user: { $in: followingIds },
            status: 'public',
            expiresAt: { $gt: new Date() }
        })
        .populate('user', 'displayName profileImage')
        .sort('-createdAt');

        // Get suggested users to follow (not currently following)
        const suggestedUsers = await User.find({
            _id: { 
                $nin: [...followingIds, req.user.id]
            }
        })
        .limit(5)
        .select('displayName profileImage');

        res.render('feed', {
            stories,
            suggestedUsers,
            currentUser: req.user
        });
    } catch (err) {
        console.error(err);
        res.render('error/500');
    }
});

// @desc    Dashboard
// @route   GET /dashboard
router.get('/dashboard', ensureAuth, async (req, res) => {
    try {
        const stories = await Story.find({ user: req.user.id });
        
        // Calculate analytics
        const totalViews = stories.reduce((sum, story) => sum + (story.viewerStats ? story.viewerStats.totalViews : 0), 0);
        const totalLikes = stories.reduce((sum, story) => sum + (story.likes ? story.likes.length : 0), 0);
        const totalComments = stories.reduce((sum, story) => sum + (story.comments ? story.comments.length : 0), 0);

        // Get active stories for story circle display
        const activeStories = stories.filter(story => !story.isExpiredNow());

        res.render('dashboard', {
            stories: activeStories,
            allStories: stories,
            totalViews,
            totalLikes,
            totalComments
        });
    } catch (err) {
        console.error(err);
        res.render('error/500');
    }
});

// About Page
router.get('/about', (req, res) => {
    res.render('about', {
        title: 'About StoryVerse'
    });
});

// Contact Page
router.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Contact Us'
    });
});

module.exports = router; 