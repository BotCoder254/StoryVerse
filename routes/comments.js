const express = require('express');
const router = express.Router();
const { ensureAuth } = require('../middleware/auth');
const Comment = require('../models/Comment');
const Story = require('../models/Story');

// @desc    Add comment to story
// @route   POST /comments/:storyId
router.post('/:storyId', ensureAuth, async (req, res) => {
    try {
        const story = await Story.findById(req.params.storyId);
        if (!story) {
            return res.status(404).json({ error: 'Story not found' });
        }

        const comment = await Comment.create({
            content: req.body.content,
            story: req.params.storyId,
            user: req.user.id
        });

        const populatedComment = await Comment.findById(comment._id)
            .populate('user', 'displayName image');

        res.json(populatedComment);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Get comments for story
// @route   GET /comments/:storyId
router.get('/:storyId', async (req, res) => {
    try {
        const comments = await Comment.find({ story: req.params.storyId })
            .sort({ createdAt: -1 })
            .populate('user', 'displayName image');
        res.json(comments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

// @desc    Delete comment
// @route   DELETE /comments/:commentId
router.delete('/:commentId', ensureAuth, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.commentId);
        
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }

        if (!comment.belongsTo(req.user.id)) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await comment.remove();
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server Error' });
    }
});

module.exports = router; 