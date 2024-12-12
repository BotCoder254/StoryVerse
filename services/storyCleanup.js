const Story = require('../models/Story');
const cloudinary = require('cloudinary').v2;
const schedule = require('node-schedule');

class StoryCleanupService {
    constructor() {
        // Schedule cleanup job to run every hour
        this.job = schedule.scheduleJob('0 * * * *', this.cleanup.bind(this));
        
        // Schedule media cleanup job to run daily at midnight
        this.mediaCleanupJob = schedule.scheduleJob('0 0 * * *', this.cleanupMedia.bind(this));
    }

    async cleanup() {
        try {
            console.log('Running story cleanup job...');
            
            // Get expired stories
            const expiredStories = await Story.getExpiredStories();
            
            // Process each expired story
            for (const story of expiredStories) {
                try {
                    // Archive the story
                    await story.archive();
                    
                    // Log success
                    console.log(`Archived story: ${story._id}`);
                } catch (err) {
                    console.error(`Error archiving story ${story._id}:`, err);
                }
            }

            console.log(`Cleanup complete. Processed ${expiredStories.length} stories.`);
        } catch (err) {
            console.error('Error in cleanup job:', err);
        }
    }

    async cleanupMedia() {
        try {
            console.log('Running media cleanup job...');
            
            // Get all archived stories with media
            const archivedStories = await Story.find({
                status: 'archived',
                mediaUrl: { $exists: true, $ne: null }
            });

            // Process each story's media
            for (const story of archivedStories) {
                try {
                    if (story.mediaUrl && story.mediaUrl.includes('cloudinary')) {
                        // Extract public ID from Cloudinary URL
                        const publicId = story.mediaUrl.split('/').slice(-1)[0].split('.')[0];
                        
                        // Delete from Cloudinary
                        await cloudinary.uploader.destroy(publicId);
                        
                        // Clear media URL
                        story.mediaUrl = null;
                        story.mediaType = 'none';
                        await story.save();
                        
                        console.log(`Cleaned up media for story: ${story._id}`);
                    }
                } catch (err) {
                    console.error(`Error cleaning up media for story ${story._id}:`, err);
                }
            }

            console.log(`Media cleanup complete. Processed ${archivedStories.length} stories.`);
        } catch (err) {
            console.error('Error in media cleanup job:', err);
        }
    }

    // Method to force immediate cleanup (useful for testing)
    async forceCleanup() {
        await this.cleanup();
        await this.cleanupMedia();
    }

    // Method to stop the scheduled jobs
    stop() {
        if (this.job) {
            this.job.cancel();
        }
        if (this.mediaCleanupJob) {
            this.mediaCleanupJob.cancel();
        }
    }
}

module.exports = new StoryCleanupService(); 