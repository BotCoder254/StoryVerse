const Story = require('../models/Story');

module.exports = {
    ensureAuth: function(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        req.flash('error_msg', 'Please log in to access this resource');
        res.redirect('/users/login');
    },
    ensureGuest: function(req, res, next) {
        if (req.isAuthenticated()) {
            res.redirect('/dashboard');
        } else {
            return next();
        }
    },
    ensureStoryOwner: async function(req, res, next) {
        try {
            const story = await Story.findById(req.params.id);
            if (!story) {
                return res.status(404).json({ error: 'Story not found' });
            }
            if (story.user.toString() !== req.user.id) {
                return res.status(403).json({ error: 'Not authorized' });
            }
            next();
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    }
}; 