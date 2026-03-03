const User = require('../models/User');
const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const { validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and GIF images are allowed.'));
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Get admin dashboard
const getDashboard = async (req, res) => {
    try {
        // Get statistics
        const totalUsers = await User.countDocuments({ role: 'user' });
        const totalFoodItems = await FoodItem.countDocuments();
        const totalOrders = await Order.countDocuments();
        const totalRevenue = await Order.aggregate([
            { $match: { status: 'delivered' } },
            { $group: { _id: null, total: { $sum: '$finalAmount' } } }
        ]);

        // Get recent orders
        const recentOrders = await Order.find()
            .populate('userId', 'username email')
            .populate('items.foodItem', 'name')
            .sort({ createdAt: -1 })
            .limit(10);

        // Get recent users
        const recentUsers = await User.find({ role: 'user' })
            .sort({ createdAt: -1 })
            .limit(5);

        // Get popular food items
        const popularFoodItems = await Order.aggregate([
            { $unwind: '$items' },
            { $group: { 
                _id: '$items.foodItem',
                orderCount: { $sum: 1 },
                totalQuantity: { $sum: '$items.quantity' }
            }},
            { $sort: { orderCount: -1 } },
            { $limit: 5 },
            { $lookup: {
                from: 'fooditems',
                localField: '_id',
                foreignField: '_id',
                as: 'foodItem'
            }},
            { $unwind: '$foodItem' }
        ]);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Diet Dash',
            user: req.user,
            stats: {
                totalUsers,
                totalFoodItems,
                totalOrders,
                totalRevenue: totalRevenue.length > 0 ? totalRevenue[0].total : 0
            },
            recentOrders,
            recentUsers,
            popularFoodItems
        });

    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.render('admin/dashboard', {
            title: 'Admin Dashboard - Diet Dash',
            user: req.user,
            stats: { totalUsers: 0, totalFoodItems: 0, totalOrders: 0, totalRevenue: 0 },
            recentOrders: [],
            recentUsers: [],
            popularFoodItems: []
        });
    }
};

// Get food items management page
const getFoodItems = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 12;
        const skip = (page - 1) * limit;
        
        // Search and filter options
        const search = req.query.search || '';
        const category = req.query.category || '';
        const cuisineType = req.query.cuisineType || '';
        
        let query = {};
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { 'restaurant.name': { $regex: search, $options: 'i' } }
            ];
        }
        
        if (category) query.category = category;
        if (cuisineType) query.cuisineType = cuisineType;
        
        const foodItems = await FoodItem.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalItems = await FoodItem.countDocuments(query);
        const totalPages = Math.ceil(totalItems / limit);

        res.render('admin/food-items', {
            title: 'Manage Food Items - Admin',
            user: req.user,
            foodItems,
            currentPage: page,
            totalPages,
            search,
            category,
            cuisineType
        });

    } catch (error) {
        console.error('Get food items error:', error);
        res.render('admin/food-items', {
            title: 'Manage Food Items - Admin',
            user: req.user,
            foodItems: [],
            currentPage: 1,
            totalPages: 1,
            search: '',
            category: '',
            cuisineType: ''
        });
    }
};

// Get add food item page
const getAddFoodItem = (req, res) => {
    res.render('admin/add-food-item', {
        title: 'Add Food Item - Admin',
        user: req.user,
        error: null,
        formData: {}
    });
};

// Handle add food item
const postAddFoodItem = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('admin/add-food-item', {
                title: 'Add Food Item - Admin',
                user: req.user,
                error: errors.array()[0].msg,
                formData: req.body
            });
        }

        console.log('DEBUG: req.body (add):', req.body);
        const {
            name, description, price, category, cuisineType,
            calories, protein, carbs, fats, fiber, sugar, sodium,
            restaurantName, restaurantAddress, restaurantPhone,
            preparationTime, servingSize, spiceLevel,
            dietaryTags, ingredients
        } = req.body;

        // Trim name before saving
        const trimmedName = name ? name.trim() : '';

        // Create food item
        const foodItem = new FoodItem({
            name: trimmedName,
            description,
            price: parseFloat(price),
            category,
            cuisineType,
            nutrition: {
                calories: parseFloat(calories),
                protein: parseFloat(protein),
                carbs: parseFloat(carbs),
                fats: parseFloat(fats),
                fiber: parseFloat(fiber) || 0,
                sugar: parseFloat(sugar) || 0,
                sodium: parseFloat(sodium) || 0
            },
            restaurant: {
                name: restaurantName,
                address: restaurantAddress || '',
                phone: restaurantPhone || ''
            },
            preparationTime: preparationTime || '15-20 mins',
            servingSize: servingSize || '1 serving',
            spiceLevel: spiceLevel || 'mild',
            dietaryTags: Array.isArray(dietaryTags) ? dietaryTags : [dietaryTags].filter(Boolean),
            ingredients: ingredients ? JSON.parse(ingredients) : []
        });

        // Handle file upload
        if (req.file) {
            foodItem.image = {
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                mimetype: req.file.mimetype,
                size: req.file.size
            };
        }

        await foodItem.save();

        res.redirect('/admin/food-items?success=Food item added successfully');

    } catch (error) {
        console.error('Add food item error:', error);
        
        // Delete uploaded file if there was an error
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        
        res.render('admin/add-food-item', {
            title: 'Add Food Item - Admin',
            user: req.user,
            error: 'An error occurred while adding the food item. Please try again.',
            formData: req.body
        });
    }
};

// Get edit food item page
const getEditFoodItem = async (req, res) => {
    try {
        const foodItem = await FoodItem.findById(req.params.id);
        
        if (!foodItem) {
            return res.redirect('/admin/food-items?error=Food item not found');
        }

        res.render('admin/edit-food-item', {
            title: 'Edit Food Item - Admin',
            user: req.user,
            foodItem,
            error: null,
            formData: {
                name: foodItem.name,
                description: foodItem.description,
                price: foodItem.price,
                category: foodItem.category,
                cuisineType: foodItem.cuisineType,
                calories: foodItem.nutrition.calories,
                protein: foodItem.nutrition.protein,
                carbs: foodItem.nutrition.carbs,
                fats: foodItem.nutrition.fats,
                fiber: foodItem.nutrition.fiber,
                sugar: foodItem.nutrition.sugar,
                sodium: foodItem.nutrition.sodium,
                restaurantName: foodItem.restaurant.name,
                restaurantAddress: foodItem.restaurant.address,
                restaurantPhone: foodItem.restaurant.phone,
                preparationTime: foodItem.preparationTime,
                servingSize: foodItem.servingSize,
                spiceLevel: foodItem.spiceLevel,
                dietaryTags: foodItem.dietaryTags
            }
        });

    } catch (error) {
        console.error('Get edit food item error:', error);
        res.redirect('/admin/food-items?error=Error loading food item');
    }
};

// Handle edit food item
const postEditFoodItem = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const foodItem = await FoodItem.findById(req.params.id);
            return res.render('admin/edit-food-item', {
                title: 'Edit Food Item - Admin',
                user: req.user,
                foodItem,
                error: errors.array()[0].msg,
                formData: req.body
            });
        }

        const foodItem = await FoodItem.findById(req.params.id);
        if (!foodItem) {
            return res.redirect('/admin/food-items?error=Food item not found');
        }

        console.log('DEBUG: req.body (edit):', req.body);
        const {
            name, description, price, category, cuisineType,
            calories, protein, carbs, fats, fiber, sugar, sodium,
            restaurantName, restaurantAddress, restaurantPhone,
            preparationTime, servingSize, spiceLevel,
            dietaryTags, ingredients
        } = req.body;

        // Update food item
        foodItem.name = name ? name.trim() : '';
        foodItem.description = description;
        foodItem.price = parseFloat(price);
        foodItem.category = category;
        foodItem.cuisineType = cuisineType;
        foodItem.nutrition = {
            calories: parseFloat(calories),
            protein: parseFloat(protein),
            carbs: parseFloat(carbs),
            fats: parseFloat(fats),
            fiber: parseFloat(fiber) || 0,
            sugar: parseFloat(sugar) || 0,
            sodium: parseFloat(sodium) || 0
        };
        foodItem.restaurant = {
            name: restaurantName,
            address: restaurantAddress || '',
            phone: restaurantPhone || ''
        };
        foodItem.preparationTime = preparationTime || '15-20 mins';
        foodItem.servingSize = servingSize || '1 serving';
        foodItem.spiceLevel = spiceLevel || 'mild';
        foodItem.dietaryTags = Array.isArray(dietaryTags) ? dietaryTags : [dietaryTags].filter(Boolean);
        foodItem.ingredients = ingredients ? JSON.parse(ingredients) : [];

        // Handle new file upload
        if (req.file) {
            // Delete old image if exists
            if (foodItem.image && foodItem.image.path) {
                fs.unlink(foodItem.image.path, (err) => {
                    if (err) console.error('Error deleting old image:', err);
                });
            }
            
            foodItem.image = {
                filename: req.file.filename,
                originalName: req.file.originalname,
                path: req.file.path,
                mimetype: req.file.mimetype,
                size: req.file.size
            };
        }

        await foodItem.save();

        res.redirect('/admin/food-items?success=Food item updated successfully');

    } catch (error) {
        console.error('Edit food item error:', error);
        
        // Delete uploaded file if there was an error
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }
        
        res.redirect('/admin/food-items?error=Error updating food item');
    }
};

// Handle delete food item
const deleteFoodItem = async (req, res) => {
    try {
        const foodItem = await FoodItem.findById(req.params.id);
        
        if (!foodItem) {
            return res.status(404).json({
                success: false,
                message: 'Food item not found'
            });
        }

        // Delete image file if exists
        if (foodItem.image && foodItem.image.path) {
            fs.unlink(foodItem.image.path, (err) => {
                if (err) console.error('Error deleting image:', err);
            });
        }

        await FoodItem.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Food item deleted successfully'
        });

    } catch (error) {
        console.error('Delete food item error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting food item'
        });
    }
};

// Get users management page
const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        
        const search = req.query.search || '';
        let query = { role: 'user' };
        
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);

        res.render('admin/users', {
            title: 'Manage Users - Admin',
            user: req.user,
            users,
            currentPage: page,
            totalPages,
            search
        });

    } catch (error) {
        console.error('Get users error:', error);
        res.render('admin/users', {
            title: 'Manage Users - Admin',
            user: req.user,
            users: [],
            currentPage: 1,
            totalPages: 1,
            search: ''
        });
    }
};

// Get orders management page
const getOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        
        const status = req.query.status || '';
        let query = {};
        
        if (status) query.status = status;
        
        const orders = await Order.find(query)
            .populate('userId', 'username email')
            .populate('items.foodItem', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
            
        const totalOrders = await Order.countDocuments(query);
        const totalPages = Math.ceil(totalOrders / limit);

        res.render('admin/orders', {
            title: 'Manage Orders - Admin',
            user: req.user,
            orders,
            currentPage: page,
            totalPages,
            status
        });

    } catch (error) {
        console.error('Get orders error:', error);
        res.render('admin/orders', {
            title: 'Manage Orders - Admin',
            user: req.user,
            orders: [],
            currentPage: 1,
            totalPages: 1,
            status: ''
        });
    }
};

module.exports = {
    getDashboard,
    getFoodItems,
    getAddFoodItem,
    postAddFoodItem,
    getEditFoodItem,
    postEditFoodItem,
    deleteFoodItem,
    getUsers,
    getOrders,
    upload
};