const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    required: true
  },
  profileImage: {
    type: String,
    default: '/img/profiles/default-profile.png'
  },
  bio: {
    type: String,
    default: ''
  },
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  stories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  }]
});

// Method to follow a user
UserSchema.methods.follow = async function(userId) {
  if (!this.following.includes(userId)) {
    this.following.push(userId);
    const user = await this.model('User').findById(userId);
    if (user) {
      user.followers.push(this._id);
      await user.save();
    }
    await this.save();
  }
};

// Method to unfollow a user
UserSchema.methods.unfollow = async function(userId) {
  this.following = this.following.filter(id => id.toString() !== userId.toString());
  const user = await this.model('User').findById(userId);
  if (user) {
    user.followers = user.followers.filter(id => id.toString() !== this._id.toString());
    await user.save();
  }
  await this.save();
};

// Method to check if following a user
UserSchema.methods.isFollowing = function(userId) {
  return this.following.some(id => id.toString() === userId.toString());
};

module.exports = mongoose.model('User', UserSchema); 