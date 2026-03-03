const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, requireUser, requireCompleteProfile } = require('../middleware/auth');
const { profileValidation } = require('../middleware/validation');
const multer = require('multer');
const path = require('path');

// Multer setup for avatar uploads
const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, path.join(__dirname, '..', 'uploads', 'avatars'));
	},
	filename: function (req, file, cb) {
		const ext = path.extname(file.originalname);
		const name = Date.now() + '-' + Math.random().toString(36).substring(2,8) + ext;
		cb(null, name);
	}
});
const upload = multer({ storage });

// Apply authentication middleware to all user routes
router.use(authenticateToken);
router.use(requireUser);

// Profile completion routes (don't require completed profile)
router.get('/profile/complete', userController.getCompleteProfile);
router.post('/profile/complete', profileValidation, userController.postCompleteProfile);

// Routes that require completed profile
router.use(requireCompleteProfile);

// Dashboard
router.get('/dashboard', userController.getDashboard);

// Profile management
router.get('/profile', userController.getProfile);
router.post('/profile', profileValidation, userController.postProfile);

// Avatar upload
router.post('/avatar/upload', upload.single('avatar'), userController.postUploadAvatar);

// Watchlist
router.post('/watchlist/add', userController.postAddToWatchlist);
router.get('/watchlist', userController.getWatchlist);
router.post('/watchlist/remove', userController.postRemoveFromWatchlist);

// Cart routes
router.post('/cart/add', userController.postAddToCart);
router.get('/cart', userController.getCart);
router.post('/cart/remove', userController.postRemoveFromCart);
router.post('/cart/place', userController.postPlaceOrderFromCart);

// Progress tracking
router.get('/progress', userController.getProgress);

// Exercise: mark daily exercise done
router.post('/exercise/done', userController.postMarkExerciseDone);
// Submit daily exercise tasks (with optional weight/fat readings)
router.post('/exercise/submit', userController.postSubmitExerciseTasks);

// Social: search users, friend requests, leaderboard
router.get('/users/search', userController.searchUsers);
router.get('/users/:id', userController.getUserById);
router.post('/friends/request', userController.sendFriendRequest);
router.post('/friends/accept', userController.acceptFriendRequest);
router.get('/leaderboard', userController.getFriendsLeaderboard);

module.exports = router;