const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    story: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Delete comments when story is deleted
CommentSchema.index({ story: 1, createdAt: -1 });

// Method to check if comment belongs to user
CommentSchema.methods.belongsTo = function(userId) {
    return this.user.toString() === userId.toString();
};

module.exports = mongoose.model('Comment', CommentSchema); 