const { body } = require('express-validator');

// Signup validation rules
const signupValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 20 })
        .withMessage('Username must be between 3 and 20 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address'),
    
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    
    body('role')
        .optional()
        .isIn(['user', 'admin'])
        .withMessage('Role must be either user or admin')
];

// Login validation rules
const loginValidation = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please enter a valid email address'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Profile validation rules
const profileValidation = [
    body('height')
        .isFloat({ min: 100, max: 250 })
        .withMessage('Height must be between 100 and 250 cm'),
    
    body('weight')
        .isFloat({ min: 30, max: 300 })
        .withMessage('Weight must be between 30 and 300 kg'),
    
    body('age')
        .isInt({ min: 13, max: 100 })
        .withMessage('Age must be between 13 and 100'),
    
    body('gender')
        .isIn(['male', 'female', 'other'])
        .withMessage('Gender must be male, female, or other'),
    
    body('activityLevel')
        .isIn(['sedentary', 'moderate', 'active', 'athlete'])
        .withMessage('Activity level must be sedentary, moderate, active, or athlete'),
    
    body('healthGoal')
        .isIn(['weight_loss', 'weight_gain', 'maintenance', 'muscle_gain'])
        .withMessage('Health goal must be weight_loss, weight_gain, maintenance, or muscle_gain'),
    
    body('dietaryPreferences')
        .optional()
        .custom((value) => {
            const validPreferences = ['vegetarian', 'vegan', 'jain', 'gluten_free', 'keto', 'diabetic_friendly', 'low_sodium', 'high_protein'];
            if (Array.isArray(value)) {
                for (let pref of value) {
                    if (!validPreferences.includes(pref)) {
                        throw new Error(`Invalid dietary preference: ${pref}`);
                    }
                }
            } else if (value && !validPreferences.includes(value)) {
                throw new Error(`Invalid dietary preference: ${value}`);
            }
            return true;
        }),
    
    body('allergies')
        .optional()
        .isArray()
        .withMessage('Allergies must be an array')
];

// Food item validation rules
const foodItemValidation = [
    body('name')
        .custom((value, { req }) => {
            console.log('DEBUG: Food name value:', value);
            if (!value || value.trim().length < 1 || value.trim().length > 100) {
                throw new Error('Food name must be between 1 and 100 characters');
            }
            return true;
        }),
    
    body('description')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Description cannot exceed 500 characters'),
    
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),
    
    body('price')
        .isFloat({ min: 0 })
        .withMessage('Price must be a positive number'),

    body('calories')
        .isFloat({ min: 0 })
        .withMessage('Calories must be a positive number'),
    body('protein')
        .isFloat({ min: 0 })
        .withMessage('Protein must be a positive number'),
    body('carbs')
        .isFloat({ min: 0 })
        .withMessage('Carbs must be a positive number'),
    body('fats')
        .isFloat({ min: 0 })
        .withMessage('Fats must be a positive number'),
    body('fiber')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Fiber must be a positive number'),
    body('cuisineType')
        .isIn(['indian', 'italian', 'chinese', 'mexican', 'american', 'thai', 'continental', 'japanese', 'korean', 'mediterranean'])
        .withMessage('Cuisine type must be a valid cuisine'),
    
    body('restaurantName')
        .trim()
        .notEmpty()
        .withMessage('Restaurant name is required'),
    
    body('dietaryTags')
        .optional()
        .custom((value) => {
            const validTags = ['vegetarian', 'vegan', 'jain', 'gluten_free', 'keto', 'diabetic_friendly', 'low_sodium', 'high_protein', 'low_carb', 'dairy_free'];
            if (Array.isArray(value)) {
                for (let tag of value) {
                    if (!validTags.includes(tag)) {
                        throw new Error(`Invalid dietary tag: ${tag}`);
                    }
                }
            }
            return true;
        })
];

// Order validation rules
const orderValidation = [
    body('deliveryAddress.street')
        .trim()
        .notEmpty()
        .withMessage('Street address is required'),
    
    body('deliveryAddress.city')
        .trim()
        .notEmpty()
        .withMessage('City is required'),
    
    body('deliveryAddress.state')
        .trim()
        .notEmpty()
        .withMessage('State is required'),
    
    body('deliveryAddress.zipCode')
        .trim()
        .matches(/^\d{6}$/)
        .withMessage('Please enter a valid 6-digit zip code'),
    
    body('deliveryAddress.phoneNumber')
        .matches(/^\+?[\d\s-()]{10,}$/)
        .withMessage('Please enter a valid phone number'),
    
    body('paymentMethod')
        .isIn(['cash_on_delivery', 'online', 'wallet'])
        .withMessage('Payment method must be cash_on_delivery, online, or wallet'),
    
    body('specialInstructions')
        .optional()
        .isLength({ max: 200 })
        .withMessage('Special instructions cannot exceed 200 characters')
];

module.exports = {
    signupValidation,
    loginValidation,
    profileValidation,
    foodItemValidation,
    orderValidation
};