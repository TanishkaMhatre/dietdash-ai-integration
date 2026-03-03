const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { upload } = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { foodItemValidation } = require('../middleware/validation');

// Apply authentication middleware to all admin routes
router.use(authenticateToken);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Food Items Management
router.get('/food-items', adminController.getFoodItems);
router.get('/food-items/add', adminController.getAddFoodItem);
 router.post('/food-items/add', upload.single('image'), foodItemValidation, adminController.postAddFoodItem);
router.get('/food-items/edit/:id', adminController.getEditFoodItem);
 router.post('/food-items/edit/:id', upload.single('image'), foodItemValidation, adminController.postEditFoodItem);
router.delete('/food-items/:id', adminController.deleteFoodItem);

// User Management
router.get('/users', adminController.getUsers);

// Order Management
router.get('/orders', adminController.getOrders);

module.exports = router;