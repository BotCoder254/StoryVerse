const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const multer = require('multer');
const path = require('path');
const { ensureAuthenticated, forwardAuthenticated } = require('../config/auth');
const User = require('../models/User');
const mongoose = require('mongoose');

// Multer configuration for profile image uploads
const storage = multer.diskStorage({
  destination: './public/img/profiles',
  filename: function(req, file, cb) {
    cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 }, // 1MB limit
  fileFilter: function(req, file, cb) {
    checkFileType(file, cb);
  }
});

// Check file type
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Images Only!');
  }
}

// Login Page
router.get('/login', forwardAuthenticated, (req, res) => {
  res.render('users/login', {
    title: 'Login'
  });
});

// Register Page
router.get('/register', forwardAuthenticated, (req, res) => {
  res.render('users/register', {
    title: 'Register'
  });
});

// Register Handle
router.post('/register', async (req, res) => {
  const { email, password, password2, displayName } = req.body;
  let errors = [];

  // Check required fields
  if (!email || !password || !password2 || !displayName) {
    errors.push({ msg: 'Please fill in all fields' });
  }

  // Check passwords match
  if (password !== password2) {
    errors.push({ msg: 'Passwords do not match' });
  }

  // Check password length
  if (password.length < 6) {
    errors.push({ msg: 'Password should be at least 6 characters' });
  }

  if (errors.length > 0) {
    res.render('users/register', {
      errors,
      email,
      displayName,
      title: 'Register'
    });
  } else {
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (user) {
        errors.push({ msg: 'Email already registered' });
        res.render('users/register', {
          errors,
          email,
          displayName,
          title: 'Register'
        });
      } else {
        const newUser = new User({
          email: email.toLowerCase(),
          password,
          displayName
        });

        // Hash password
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(password, salt);
        await newUser.save();
        
        req.flash('success_msg', 'You are now registered and can log in');
        res.redirect('/users/login');
      }
    } catch (err) {
      console.error(err);
      res.render('error/500');
    }
  }
});

// Login Handle
router.post('/login', (req, res, next) => {
  passport.authenticate('local', {
    successRedirect: '/dashboard',
    failureRedirect: '/users/login',
    failureFlash: true
  })(req, res, next);
});

// Logout Handle
router.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) {
      return next(err);
    }
    req.flash('success_msg', 'You are logged out');
    res.redirect('/users/login');
  });
});

// Profile Page
router.get('/profile', ensureAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('stories')
      .populate('followers')
      .populate('following');

    res.render('users/profile', {
      title: 'Profile',
      user: user,
      currentUser: req.user
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// Profile Page by ID
router.get('/profile/:id', ensureAuthenticated, async (req, res) => {
  try {
    // Check if the ID is valid before querying
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      req.flash('error_msg', 'Invalid user ID');
      return res.redirect('/dashboard');
    }

    const user = await User.findById(req.params.id)
      .populate('stories')
      .populate('followers')
      .populate('following');
    
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/dashboard');
    }

    res.render('users/profile', {
      title: `${user.displayName}'s Profile`,
      user: user,
      currentUser: req.user
    });
  } catch (err) {
    console.error(err);
    res.render('error/500');
  }
});

// Update Profile
router.put('/profile', ensureAuthenticated, upload.single('profileImage'), async (req, res) => {
  try {
    const { bio } = req.body;
    const updateData = { bio };
    
    if (req.file) {
      updateData.profileImage = `/img/profiles/${req.file.filename}`;
    }

    await User.findByIdAndUpdate(req.user.id, updateData);
    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/users/profile');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/users/profile');
  }
});

// Follow User
router.post('/:id/follow', ensureAuthenticated, async (req, res) => {
    try {
        const userToFollow = await User.findById(req.params.id);
        if (!userToFollow) {
            return res.status(404).json({ error: 'User not found' });
        }

        await req.user.follow(userToFollow._id);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unfollow User
router.post('/:id/unfollow', ensureAuthenticated, async (req, res) => {
    try {
        const userToUnfollow = await User.findById(req.params.id);
        if (!userToUnfollow) {
            return res.status(404).json({ error: 'User not found' });
        }

        await req.user.unfollow(userToUnfollow._id);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router; 