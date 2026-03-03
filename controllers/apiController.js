const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const DietLog = require('../models/DietLog');
const { generateMealPlan, getFoodRecommendations, getPersonalizedSuggestions, parseQuery } = require('../utils/dietRecommendation');
const { checkAndAwardBadges, getUserAchievements } = require('../utils/badges');
const { validationResult } = require('express-validator');
const moment = require('moment');

// Get food items with filtering
const getFoodItems = async (req, res) => {
    try {
        const {
            category,
            cuisineType,
            search,
            minPrice,
            maxPrice,
            minCalories,
            maxCalories,
            dietaryTags,
            page = 1,
            limit = 12
        } = req.query;

        let query = { isActive: true, availability: true };

        // Apply filters
        if (category) query.category = category;
        if (cuisineType) query.cuisineType = cuisineType;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { 'restaurant.name': { $regex: search, $options: 'i' } }
            ];
        }
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = parseFloat(minPrice);
            if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }
        if (minCalories || maxCalories) {
            query['nutrition.calories'] = {};
            if (minCalories) query['nutrition.calories'].$gte = parseInt(minCalories);
            if (maxCalories) query['nutrition.calories'].$lte = parseInt(maxCalories);
        }
        if (dietaryTags) {
            const tags = Array.isArray(dietaryTags) ? dietaryTags : [dietaryTags];
            query.dietaryTags = { $in: tags };
        }

        const skip = (page - 1) * limit;
        const foodItems = await FoodItem.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await FoodItem.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            data: {
                foodItems,
                pagination: {
                    current: parseInt(page),
                    total: totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                total
            }
        });

    } catch (error) {
        console.error('Get food items API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching food items'
        });
    }
};

// Get single food item
const getFoodItem = async (req, res) => {
    try {
        const foodItem = await FoodItem.findById(req.params.id)
            .populate('reviews.userId', 'username');

        if (!foodItem) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        res.json({
            success: true,
            data: foodItem
        });

    } catch (error) {
        console.error('Get food item API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching food item'
        });
    }
};

// Get meal plan recommendations
const getMealPlan = async (req, res) => {
    try {
        if (!req.user.profileCompleted) {
            return res.status(400).json({
                success: false,
                message: 'Please complete your profile to get meal recommendations'
            });
        }

        const mealPlan = await generateMealPlan(req.user);

        res.json({
            success: true,
            data: {
                mealPlan,
                userProfile: {
                    dailyCalories: req.user.profile.dailyCalories,
                    macros: req.user.profile.macros,
                    dietaryPreferences: req.user.profile.dietaryPreferences
                }
            }
        });

    } catch (error) {
        console.error('Get meal plan API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating meal plan'
        });
    }
};

// Get personalized food suggestions
const getSuggestions = async (req, res) => {
    try {
        const suggestions = await getPersonalizedSuggestions(req.user);

        res.json({
            success: true,
            data: suggestions
        });

    } catch (error) {
        console.error('Get suggestions API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting suggestions'
        });
    }
};

// Create order
const createOrder = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg,
                errors: errors.array()
            });
        }

        const { items, deliveryAddress, paymentMethod, specialInstructions } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Order must contain at least one item'
            });
        }

        // Validate and calculate order details
        let totalAmount = 0;
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFats = 0;
        const orderItems = [];
        const restaurants = new Set();

        for (const item of items) {
            const foodItem = await FoodItem.findById(item.foodItemId);
            
            if (!foodItem) {
                return res.status(400).json({
                    success: false,
                    message: `Food item not found: ${item.foodItemId}`
                });
            }

            if (!foodItem.availability) {
                return res.status(400).json({
                    success: false,
                    message: `Food item is currently unavailable: ${foodItem.name}`
                });
            }

            const quantity = parseInt(item.quantity);
            const itemTotal = foodItem.price * quantity;
            const itemCalories = foodItem.nutrition.calories * quantity;
            const itemProtein = foodItem.nutrition.protein * quantity;
            const itemCarbs = foodItem.nutrition.carbs * quantity;
            const itemFats = foodItem.nutrition.fats * quantity;

            orderItems.push({
                foodItem: foodItem._id,
                quantity: quantity,
                price: foodItem.price,
                totalCalories: itemCalories,
                totalProtein: itemProtein,
                totalCarbs: itemCarbs,
                totalFats: itemFats
            });

            totalAmount += itemTotal;
            totalCalories += itemCalories;
            totalProtein += itemProtein;
            totalCarbs += itemCarbs;
            totalFats += itemFats;

            restaurants.add(JSON.stringify({
                name: foodItem.restaurant.name,
                phone: foodItem.restaurant.phone || ''
            }));
        }

        // Calculate delivery fee and tax
        const deliveryFee = totalAmount > 500 ? 0 : 40; // Free delivery over ₹500
        const tax = Math.round(totalAmount * 0.05); // 5% tax
        const finalAmount = totalAmount + deliveryFee + tax;

        // Create order
        const order = new Order({
            userId: req.user._id,
            items: orderItems,
            totalAmount,
            deliveryFee,
            tax,
            finalAmount,
            deliveryAddress,
            paymentMethod: paymentMethod || 'cash_on_delivery',
            specialInstructions: specialInstructions || '',
            totalNutrition: {
                calories: Math.round(totalCalories),
                protein: Math.round(totalProtein),
                carbs: Math.round(totalCarbs),
                fats: Math.round(totalFats)
            },
            restaurants: Array.from(restaurants).map(r => JSON.parse(r)),
            estimatedDeliveryTime: new Date(Date.now() + 45 * 60 * 1000) // 45 minutes from now
        });

        await order.save();

        // Add order to user's order history
        req.user.orders.push(order._id);
        await req.user.save();

        // Check for new badges
        const newBadges = await checkAndAwardBadges(req.user._id, 'order_placed', { order });

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                orderId: order._id,
                orderNumber: order.orderNumber,
                totalAmount: finalAmount,
                estimatedDeliveryTime: order.estimatedDeliveryTime,
                newBadges: newBadges || []
            }
        });

    } catch (error) {
        console.error('Create order API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating order'
        });
    }
};

// Get user orders
const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const orders = await Order.find({ userId: req.user._id })
            .populate('items.foodItem', 'name image')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Order.countDocuments({ userId: req.user._id });
        const totalPages = Math.ceil(total / limit);

        res.json({
            success: true,
            data: {
                orders,
                pagination: {
                    current: page,
                    total: totalPages,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get orders API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching orders'
        });
    }
};

// Get single order
const getOrder = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.id,
            userId: req.user._id
        }).populate('items.foodItem');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.json({
            success: true,
            data: order
        });

    } catch (error) {
        console.error('Get order API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching order'
        });
    }
};

// Log food to diet tracker
const logFood = async (req, res) => {
    try {
        const { foodItemId, quantity, mealType, date } = req.body;

        if (!['breakfast', 'lunch', 'dinner', 'snacks'].includes(mealType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid meal type'
            });
        }

        const foodItem = await FoodItem.findById(foodItemId);
        if (!foodItem) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        const logDate = date ? new Date(date) : new Date();
        const startOfDay = moment(logDate).startOf('day').toDate();
        const endOfDay = moment(logDate).endOf('day').toDate();

        // Find or create diet log for the day
        let dietLog = await DietLog.findOne({
            userId: req.user._id,
            date: { $gte: startOfDay, $lte: endOfDay }
        });

        if (!dietLog) {
            dietLog = new DietLog({
                userId: req.user._id,
                date: startOfDay,
                meals: {
                    breakfast: [],
                    lunch: [],
                    dinner: [],
                    snacks: []
                }
            });
        }

        // Calculate nutrition for the quantity
        const qty = parseFloat(quantity);
        const calories = Math.round(foodItem.nutrition.calories * qty);
        const protein = Math.round(foodItem.nutrition.protein * qty);
        const carbs = Math.round(foodItem.nutrition.carbs * qty);
        const fats = Math.round(foodItem.nutrition.fats * qty);

        // Add food to the meal
        dietLog.meals[mealType].push({
            foodItem: foodItem._id,
            quantity: qty,
            calories,
            protein,
            carbs,
            fats
        });

        // Recalculate total nutrition
        dietLog.calculateTotalNutrition();
        dietLog.checkGoalsMet(req.user.profile);

        await dietLog.save();

        // Check for new badges
        const newBadges = await checkAndAwardBadges(req.user._id, 'food_log');

        res.json({
            success: true,
            message: 'Food logged successfully',
            data: {
                totalNutrition: dietLog.totalNutrition,
                goalsMet: dietLog.goalsMet,
                newBadges: newBadges || []
            }
        });

    } catch (error) {
        console.error('Log food API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging food'
        });
    }
};

// Chatbot query handler
const chatbotQuery = async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Query is required'
            });
        }

        // Parse the query
        const criteria = parseQuery(query);

        // Add user's dietary preferences if not specified in query
        if (req.user.profile && req.user.profile.dietaryPreferences.length > 0 && criteria.dietaryPreferences.length === 0) {
            criteria.dietaryPreferences = req.user.profile.dietaryPreferences;
        }

        // Get recommendations
        const recommendations = await getFoodRecommendations(criteria);

        let responseMessage = '';
        if (recommendations.length > 0) {
            responseMessage = `I found ${recommendations.length} food options that match your requirements:`;
        } else {
            responseMessage = 'Sorry, I couldn\'t find any food items that match your criteria. Try adjusting your requirements.';
        }

        res.json({
            success: true,
            data: {
                message: responseMessage,
                recommendations,
                parsedCriteria: criteria
            }
        });

    } catch (error) {
        console.error('Chatbot query API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing your query'
        });
    }
};

// Get user achievements and badges
const getAchievements = async (req, res) => {
    try {
        const achievements = await getUserAchievements(req.user._id);

        res.json({
            success: true,
            data: achievements
        });

    } catch (error) {
        console.error('Get achievements API error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching achievements'
        });
    }
};

// Submit a review for a food item
const submitFoodReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const food = await FoodItem.findById(req.params.id);
        if (!food) return res.status(404).json({ success: false, message: 'Food not found' });

        const r = Math.max(1, Math.min(5, parseInt(rating || 0)));
        food.reviews = food.reviews || [];
        food.reviews.push({ userId: req.user._id, rating: r, comment: comment || '' });
        // Recalculate average
        if (typeof food.calculateAverageRating === 'function') {
            await food.calculateAverageRating();
        } else {
            // simple average fallback
            const total = food.reviews.reduce((s, it) => s + (it.rating || 0), 0);
            food.averageRating = (total / food.reviews.length).toFixed(1);
            food.totalReviews = food.reviews.length;
        }
        await food.save();

        res.json({ success: true, data: { averageRating: food.averageRating, totalReviews: food.totalReviews } });
    } catch (err) {
        console.error('Submit review error:', err);
        res.status(500).json({ success: false, message: 'Could not submit review' });
    }
};

module.exports = {
    getFoodItems,
    getFoodItem,
    getMealPlan,
    getSuggestions,
    createOrder,
    getOrders,
    getOrder,
    logFood,
    chatbotQuery,
    getAchievements
    , submitFoodReview
};
