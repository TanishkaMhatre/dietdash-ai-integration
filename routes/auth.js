const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { signupValidation, loginValidation } = require('../middleware/validation');

// GET routes
router.get('/signup', authController.getSignup);
router.get('/login', authController.getLogin);

// POST routes
router.post('/signup', signupValidation, authController.postSignup);
router.post('/login', loginValidation, authController.postLogin);
router.post('/logout', authController.logout);

// API routes
router.post('/api/signup', signupValidation, authController.apiSignup);
router.post('/api/login', loginValidation, authController.apiLogin);

module.exports = router;