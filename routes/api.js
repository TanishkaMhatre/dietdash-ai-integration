const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { authenticateToken, requireUser, requireCompleteProfile } = require('../middleware/auth');
const { orderValidation } = require('../middleware/validation');

// Public routes (no authentication required)
router.get('/foods', apiController.getFoodItems);
router.get('/foods/:id', apiController.getFoodItem);
// Submit review for a food item
router.post('/foods/:id/review', apiController.submitFoodReview);

// Protected routes (authentication required)
router.use(authenticateToken);

// User-only routes
router.use(requireUser);

// Meal planning routes
router.get('/meal-plan', requireCompleteProfile, apiController.getMealPlan);
router.get('/suggestions', requireCompleteProfile, apiController.getSuggestions);

// Order management routes
router.post('/orders', requireCompleteProfile, orderValidation, apiController.createOrder);
router.get('/orders', apiController.getOrders);
router.get('/orders/:id', apiController.getOrder);

// Diet tracking routes
router.post('/log-food', requireCompleteProfile, apiController.logFood);

// Chatbot routes
router.post('/chatbot', requireCompleteProfile, apiController.chatbotQuery);

// Achievements routes
router.get('/achievements', requireCompleteProfile, apiController.getAchievements);

module.exports = router;
