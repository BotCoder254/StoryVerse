const mongoose = require('mongoose');

// Viewer Schema
const ViewerSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    viewedAt: {
        type: Date,
        default: Date.now
    },
    duration: {
        type: Number,
        default: 0
    },
    completedViewing: {
        type: Boolean,
        default: false
    },
    device: {
        type: String,
        trim: true
    },
    location: {
        country: String,
        city: String
    }
});

const StorySchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    body: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'public',
        enum: ['public', 'private', 'archived']
    },
    thumbnail: {
        type: String,
        default: '/img/default-thumbnail.jpg'
    },
    media: {
        data: Buffer,
        contentType: String,
        caption: String
    },
    mediaType: {
        type: String,
        enum: ['none', 'image', 'video'],
        default: 'none'
    },
    mediaUrl: {
        type: String
    },
    mediaDuration: {
        type: Number,
        max: 15
    },
    mediaCaption: {
        type: String,
        trim: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    viewers: [ViewerSchema],
    viewerStats: {
        totalViews: { type: Number, default: 0 },
        uniqueViewers: { type: Number, default: 0 },
        completionRate: { type: Number, default: 0 },
        averageViewDuration: { type: Number, default: 0 },
        peakViewingTime: { type: Date },
        viewsByHour: [{
            hour: Number,
            count: Number
        }]
    },
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        text: {
            type: String,
            required: true
        },
        displayName: {
            type: String,
            required: true
        },
        profileImage: {
            type: String,
            default: '/img/default-profile.jpg'
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    tags: [{
        type: String,
        trim: true
    }],
    readTime: {
        type: Number,
        default: 0
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    isExpired: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true }
});

// Indexes
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StorySchema.index({ user: 1, createdAt: -1 });
StorySchema.index({ status: 1, createdAt: -1 });
StorySchema.index({ tags: 1 });
StorySchema.index({ 'viewers.user': 1 });

// Virtual for time remaining
StorySchema.virtual('timeRemaining').get(function() {
    if (this.expiresAt) {
        const now = new Date();
        const diff = this.expiresAt - now;
        return Math.max(0, Math.floor(diff / 1000));
    }
    return 0;
});

// Virtual for progress percentage
StorySchema.virtual('progressPercentage').get(function() {
    if (this.expiresAt) {
        const totalDuration = 24 * 60 * 60 * 1000;
        const now = new Date();
        const elapsed = now - this.createdAt;
        return Math.min(100, Math.floor((elapsed / totalDuration) * 100));
    }
    return 100;
});

// Pre-save middleware
StorySchema.pre('save', function(next) {
    // Calculate read time
    const wordsPerMinute = 200;
    const wordCount = this.body.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / wordsPerMinute);

    // Set expiry date if not set
    if (!this.expiresAt) {
        this.expiresAt = new Date(+new Date() + 24*60*60*1000);
    }

    // Update viewer stats
    if (this.viewers && this.viewers.length > 0) {
        const uniqueViewers = new Set(this.viewers.map(v => v.user.toString())).size;
        const completedViews = this.viewers.filter(v => v.completedViewing).length;
        const totalDuration = this.viewers.reduce((sum, v) => sum + v.duration, 0);

        this.viewerStats = {
            ...this.viewerStats,
            totalViews: this.viewers.length,
            uniqueViewers,
            completionRate: Math.round((completedViews / this.viewers.length) * 100),
            averageViewDuration: Math.round(totalDuration / this.viewers.length)
        };

        // Calculate peak viewing time
        const viewsByHour = {};
        this.viewers.forEach(viewer => {
            const hour = new Date(viewer.viewedAt).getHours();
            viewsByHour[hour] = (viewsByHour[hour] || 0) + 1;
        });

        const peakHour = Object.entries(viewsByHour)
            .sort(([,a], [,b]) => b - a)[0][0];

        this.viewerStats.viewsByHour = Object.entries(viewsByHour)
            .map(([hour, count]) => ({ hour: parseInt(hour), count }))
            .sort((a, b) => a.hour - b.hour);

        const peakDate = new Date();
        peakDate.setHours(peakHour, 0, 0, 0);
        this.viewerStats.peakViewingTime = peakDate;
    }

    next();
});

// Instance methods
StorySchema.methods = {
    isExpiredNow() {
        return new Date() >= this.expiresAt;
    },

    getTimeRemainingText() {
        const seconds = this.timeRemaining;
        if (seconds <= 0) return 'Expired';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    },

    async addView(userId, deviceInfo = {}, location = {}) {
        const existingView = this.viewers.find(
            v => v.user.toString() === userId.toString()
        );

        if (existingView) {
            existingView.viewedAt = new Date();
            existingView.duration += 1;
        } else {
            this.viewers.push({
                user: userId,
                device: deviceInfo.userAgent,
                location: {
                    country: location.country,
                    city: location.city
                }
            });
        }

        await this.save();
        return this.viewerStats;
    },

    async completeView(userId) {
        const viewer = this.viewers.find(
            v => v.user.toString() === userId.toString()
        );

        if (viewer) {
            viewer.completedViewing = true;
            await this.save();
        }

        return this.viewerStats;
    },

    getViewerStats() {
        return {
            ...this.viewerStats,
            recentViewers: this.viewers
                .sort((a, b) => b.viewedAt - a.viewedAt)
                .slice(0, 5)
        };
    },

    async archive() {
        this.status = 'archived';
        await this.save();
    }
};

// Static methods
StorySchema.statics = {
    async getActiveStoriesForUser(userId) {
        return this.find({
            user: userId,
            expiresAt: { $gt: new Date() },
            status: { $ne: 'archived' }
        })
        .sort('-createdAt')
        .populate('viewers.user', 'displayName profileImage');
    },

    async getExpiredStories() {
        return this.find({
            expiresAt: { $lte: new Date() },
            isExpired: false
        });
    },

    async getViewerAnalytics(storyId) {
        const story = await this.findById(storyId)
            .populate('viewers.user', 'displayName profileImage');

        if (!story) return null;

        return {
            ...story.viewerStats,
            recentViewers: story.viewers
                .sort((a, b) => b.viewedAt - a.viewedAt)
                .slice(0, 5),
            viewerDemographics: {
                devices: story.viewers.reduce((acc, viewer) => {
                    acc[viewer.device] = (acc[viewer.device] || 0) + 1;
                    return acc;
                }, {}),
                locations: story.viewers.reduce((acc, viewer) => {
                    const location = `${viewer.location.city}, ${viewer.location.country}`;
                    acc[location] = (acc[location] || 0) + 1;
                    return acc;
                }, {})
            }
        };
    }
};

module.exports = mongoose.model('Story', StorySchema); 