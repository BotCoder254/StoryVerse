const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Story = require('../models/Story');
const User = require('../models/User');
const mongoose = require('mongoose');
const multer = require('multer');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max file size
    }
});

// Helper function to process a single story
const processStory = (story) => {
    const storyObj = story.toObject();
    
    // Add media URL if media exists
    if (storyObj.media && storyObj.media.data) {
        storyObj.mediaUrl = `/stories/${storyObj._id}/media`;
    }
    
    // Calculate time remaining
    const timeRemaining = storyObj.expiresAt ? Math.max(0, Math.floor((storyObj.expiresAt - new Date()) / 1000)) : 0;
    const hours = Math.floor(timeRemaining / 3600);
    const minutes = Math.floor((timeRemaining % 3600) / 60);
    storyObj.timeRemainingText = timeRemaining <= 0 ? 'Expired' : (hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`);
    
    return storyObj;
};

// Helper function to process multiple stories
const processStories = (stories) => {
    return stories.map(story => processStory(story));
};

// @desc    Show all stories
// @route   GET /stories
router.get('/', async (req, res) => {
    try {
        let stories = await Story.find({ status: 'public' })
            .populate('user')
            .sort({ createdAt: 'desc' });

        stories = processStories(stories);
        res.render('stories/index', { stories });
    } catch (err) {
        console.error(err);
        res.render('error/500');
    }
});

// @desc    Show add page
// @route   GET /stories/add
router.get('/add', ensureAuth, (req, res) => {
    res.render('stories/add', {
        user: req.user,
        title: 'Create Story'
    });
});

// @desc    Process add form
// @route   POST /stories
router.post('/', ensureAuth, upload.single('media'), async (req, res) => {
    try {
        // Set expiry date (24 hours from now)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Create story object
        const storyData = {
            title: req.body.title,
            body: req.body.body,
            status: req.body.status || 'public',
            user: req.user.id,
            expiresAt: expiresAt,
            mediaType: 'none'
        };

        // Add media data if present
        if (req.file) {
            storyData.media = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                caption: req.body.mediaCaption || ''
            };
            storyData.mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        }

        // Create and save the story
        const story = new Story(storyData);
        await story.save();

        // Add to user's stories
        await User.findByIdAndUpdate(req.user.id, {
            $push: { stories: story._id }
        });

        res.redirect('/dashboard');
    } catch (err) {
        console.error('Error creating story:', err);
        res.render('stories/add', {
            error_msg: 'Error creating story: ' + err.message,
            user: req.user,
            title: 'Create Story'
        });
    }
});

// @desc    Show feed
// @route   GET /feed
router.get('/feed', ensureAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const following = user.following;

        let stories = await Story.find({
            user: { $in: following },
            status: 'public',
            expiresAt: { $gt: new Date() }
        })
        .populate('user')
        .sort({ createdAt: 'desc' });

        stories = processStories(stories);

        res.render('feed', { 
            stories,
            currentUser: req.user
        });
    } catch (err) {
        console.error(err);
        res.render('error/500');
    }
});

// @desc    Show single story
// @route   GET /stories/:id
router.get('/:id', async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.render('error/404');
        }

        let story = await Story.findById(req.params.id)
            .populate('user', 'displayName profileImage')
            .populate({
                path: 'comments',
                populate: {
                    path: 'user',
                    select: 'displayName profileImage'
                }
            });

        if (!story) {
            return res.render('error/404');
        }

        story = processStory(story);

        res.render('stories/show', {
            story,
            user: req.user
        });
    } catch (err) {
        console.error(err);
        res.render('error/500');
    }
});

// @desc    Show edit page
// @route   GET /stories/edit/:id
router.get('/edit/:id', ensureAuth, async (req, res) => {
    try {
        // Validate if id is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.render('error/404');
        }

        const story = await Story.findOne({
            _id: req.params.id
        }).lean();

        if (!story) {
            return res.render('error/404');
        }

        if (story.user != req.user.id) {
            res.redirect('/stories');
        } else {
            res.render('stories/edit', {
                story,
            });
        }
    } catch (err) {
        console.error(err);
        return res.render('error/500');
    }
});

// @desc    Update story
// @route   PUT /stories/:id
router.put('/:id', ensureAuth, async (req, res) => {
    try {
        // Validate if id is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.render('error/404');
        }

        let story = await Story.findById(req.params.id).lean();

        if (!story) {
            return res.render('error/404');
        }

        if (story.user != req.user.id) {
            res.redirect('/stories');
        } else {
            story = await Story.findOneAndUpdate({ _id: req.params.id }, req.body, {
                new: true,
                runValidators: true,
            });

            res.redirect('/dashboard');
        }
    } catch (err) {
        console.error(err);
        return res.render('error/500');
    }
});

// @desc    Delete story
// @route   DELETE /stories/:id
router.delete('/:id', ensureAuth, async (req, res) => {
    try {
        // Validate if id is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.render('error/404');
        }

        let story = await Story.findById(req.params.id).lean();

        if (!story) {
            return res.render('error/404');
        }

        if (story.user != req.user.id) {
            res.redirect('/stories');
        } else {
            await Story.deleteOne({ _id: req.params.id });
            res.redirect('/dashboard');
        }
    } catch (err) {
        console.error(err);
        return res.render('error/500');
    }
});

// @desc    Like story
// @route   POST /stories/:id/like
router.post('/:id/like', ensureAuth, async (req, res) => {
    try {
        // Validate if id is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(404).json({ error: 'Story not found' });
        }

        const story = await Story.findById(req.params.id);
        
        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        const likeIndex = story.likes.indexOf(req.user.id);
        if (likeIndex > -1) {
            // User has already liked, remove like
            story.likes.splice(likeIndex, 1);
        } else {
            // Add like
            story.likes.push(req.user.id);
        }

        await story.save();
        res.json({ success: true, likes: story.likes.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add comment to story
router.post('/:id/comment', ensureAuth, async (req, res) => {
    try {
        const story = await Story.findById(req.params.id);
        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        const comment = {
            content: req.body.content,
            user: req.user._id,
            date: new Date()
        };

        story.comments.unshift(comment);
        await story.save();

        // Populate the user info for the new comment
        const populatedStory = await Story.findById(story._id)
            .populate('comments.user', 'displayName profileImage');

        const newComment = populatedStory.comments[0];
        
        res.json({
            _id: newComment._id,
            content: newComment.content,
            date: newComment.date,
            user: {
                _id: newComment.user._id,
                displayName: newComment.user.displayName,
                profileImage: newComment.user.profileImage
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// @desc    Serve media files
// @route   GET /stories/:id/media
router.get('/:id/media', async (req, res) => {
    try {
        const story = await Story.findById(req.params.id);
        if (!story || !story.media || !story.media.data) {
            return res.status(404).send('Media not found');
        }

        // Set proper content type and cache headers
        res.set({
            'Content-Type': story.media.contentType,
            'Cache-Control': 'public, max-age=31557600', // Cache for 1 year
            'Pragma': 'public'
        });

        res.send(story.media.data);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

// @desc    Show dashboard
// @route   GET /dashboard
router.get('/dashboard', ensureAuth, async (req, res) => {
    try {
        let allStories = await Story.find({ user: req.user.id })
            .populate('user')
            .sort({ createdAt: 'desc' });

        let stories = allStories.filter(story => !story.isExpiredNow());
        
        // Process all stories to add media URLs and time remaining
        allStories = processStories(allStories);
        stories = processStories(stories);

        // Calculate stats
        const totalViews = allStories.reduce((sum, story) => 
            sum + (story.viewerStats ? story.viewerStats.totalViews : 0), 0);
        const totalLikes = allStories.reduce((sum, story) => 
            sum + (story.likes ? story.likes.length : 0), 0);
        const totalComments = allStories.reduce((sum, story) => 
            sum + (story.comments ? story.comments.length : 0), 0);

        res.render('dashboard', {
            allStories,
            stories,
            totalViews,
            totalLikes,
            totalComments,
            user: req.user
        });
    } catch (err) {
        console.error(err);
        res.render('error/500');
    }
});

module.exports = router; 