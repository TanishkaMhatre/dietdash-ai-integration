const User = require('../models/User');
const FoodItem = require('../models/FoodItem');
const DietLog = require('../models/DietLog');
const Order = require('../models/Order');
const { validationResult } = require('express-validator');
const moment = require('moment');

// Simple meal plan generator: picks foods matching user's dietary tags and builds a 3-meal plan
async function generateMealPlanForToday(user) {
    try {
        const dietaryTags = user.profile.dietaryPreferences || [];
        const goal = user.profile.healthGoal || 'maintenance';
        const dailyCalories = user.profile.dailyCalories || 2000;

        // Fetch candidate foods
        let candidates = await FoodItem.find({ isActive: true, $or: [ { dietaryTags: { $in: dietaryTags } }, { dietaryTags: { $size: 0 } } ] });
        if (!candidates || candidates.length === 0) return null;

        // Score candidates by goal: muscle_gain/weight_gain prefer higher calories+protein, weight_loss prefer lower calories but high protein
        candidates = candidates.map(f => {
            const cal = f.nutrition?.calories || 0;
            const prot = f.nutrition?.protein || 0;
            let score = prot * 2; // base weight to protein
            if (goal === 'muscle_gain' || goal === 'weight_gain') score += cal * 0.01;
            if (goal === 'weight_loss') score -= cal * 0.02;
            return { item: f, score };
        }).sort((a,b) => b.score - a.score);

        // target per meal calories approx
        const perMeal = Math.max(300, Math.round(dailyCalories / 3));

        const pickMeal = (count = 1, startIndex = 0) => {
            const meal = [];
            // pick top `count` items not yet used
            for (let i = 0; i < candidates.length && meal.length < count; i++) {
                const c = candidates[(startIndex + i) % candidates.length];
                if (!meal.find(m => m.item._id.equals(c.item._id))) {
                    meal.push({ foodItem: c.item._id, quantity: 1, calories: c.item.nutrition?.calories || 0, protein: c.item.nutrition?.protein || 0, carbs: c.item.nutrition?.carbs || 0, fats: c.item.nutrition?.fats || 0 });
                }
            }
            return meal;
        };

        // Build breakfast, lunch, dinner using staggered picks
        const breakfast = pickMeal(1, 0);
        const lunch = pickMeal(2, 2);
        const dinner = pickMeal(2, 6);

        // Save into today's DietLog (create or update)
        const todayStart = moment().startOf('day').toDate();
        const todayEnd = moment().endOf('day').toDate();
        let dietLog = await DietLog.findOne({ userId: user._id, date: { $gte: todayStart, $lte: todayEnd } });
        if (!dietLog) {
            dietLog = new DietLog({ userId: user._id, date: todayStart, meals: { breakfast: [], lunch: [], dinner: [], snacks: [] } });
        }

        dietLog.meals.breakfast = breakfast;
        dietLog.meals.lunch = lunch;
        dietLog.meals.dinner = dinner;

        // Recalculate totals
        dietLog.calculateTotalNutrition();
        await dietLog.save();

        return dietLog;
    } catch (err) {
        console.error('generateMealPlanForToday error:', err);
        return null;
    }
}

// Get complete profile page
const getCompleteProfile = (req, res) => {
    if (req.user.profileCompleted) {
        return res.redirect('/user/dashboard');
    }

    res.render('user/complete-profile', {
        title: 'Complete Your Profile - Diet Dash',
        user: req.user,
        error: null,
        formData: req.user.profile || {}
    });
};

// Handle profile completion
const postCompleteProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('user/complete-profile', {
                title: 'Complete Your Profile - Diet Dash',
                user: req.user,
                error: errors.array()[0].msg,
                formData: req.body
            });
        }

        const { height, weight, age, gender, activityLevel, healthGoal, dietaryPreferences, allergies } = req.body;

        // Update user profile
        req.user.profile = {
            height: parseFloat(height),
            weight: parseFloat(weight),
            age: parseInt(age),
            gender,
            activityLevel,
            healthGoal,
            dietaryPreferences: Array.isArray(dietaryPreferences) ? dietaryPreferences : [dietaryPreferences].filter(Boolean),
            allergies: allergies ? (Array.isArray(allergies) ? allergies : [allergies]) : []
        };

        // Calculate nutrition requirements; if calculation fails, render error
        const calcOk = req.user.calculateNutrition();
        if (!calcOk) {
            return res.render('user/complete-profile', {
                title: 'Complete Your Profile - Diet Dash',
                user: req.user,
                error: 'Please provide height, weight, age, gender and activity level to calculate nutrition.',
                formData: req.body
            });
        }

        // Ensure macros object exists (defensive)
        req.user.profile.macros = req.user.profile.macros || { protein: 0, carbs: 0, fats: 0 };
        req.user.profileCompleted = true;

        await req.user.save();

        // Generate today's meal plan based on new profile
        await generateMealPlanForToday(req.user);

        res.redirect('/user/dashboard');

    } catch (error) {
        console.error('Profile completion error:', error);
        res.render('user/complete-profile', {
            title: 'Complete Your Profile - Diet Dash',
            user: req.user,
            error: 'An error occurred while saving your profile. Please try again.',
            formData: req.body
        });
    }
};

// Get user dashboard
const getDashboard = async (req, res) => {
    try {
        // Get today's diet log
        const today = moment().startOf('day').toDate();
        const tomorrow = moment().endOf('day').toDate();
        
        let todayLog = await DietLog.findOne({
            userId: req.user._id,
            date: { $gte: today, $lte: tomorrow }
        }).populate('meals.breakfast.foodItem meals.lunch.foodItem meals.dinner.foodItem meals.snacks.foodItem');

        // Get recent orders
        const recentOrders = await Order.find({ userId: req.user._id })
            .populate('items.foodItem')
            .sort({ createdAt: -1 })
            .limit(5);

        // Get recommended foods based on dietary preferences
        const dietaryTags = req.user.profile.dietaryPreferences || [];
        const recommendedFoods = await FoodItem.find({
            isActive: true,
            $or: [
                { dietaryTags: { $in: dietaryTags } },
                { dietaryTags: { $size: 0 } }
            ]
        }).limit(8);

        // Calculate progress percentages
        const targetCalories = req.user.profile.dailyCalories || 2000;
        const targetProtein = req.user.profile.macros?.protein || 150;
        const targetCarbs = req.user.profile.macros?.carbs || 250;
        const targetFats = req.user.profile.macros?.fats || 65;

        let progress = {
            calories: { consumed: 0, target: targetCalories, percentage: 0 },
            protein: { consumed: 0, target: targetProtein, percentage: 0 },
            carbs: { consumed: 0, target: targetCarbs, percentage: 0 },
            fats: { consumed: 0, target: targetFats, percentage: 0 }
        };

        if (todayLog) {
            progress.calories.consumed = todayLog.totalNutrition.calories;
            progress.protein.consumed = todayLog.totalNutrition.protein;
            progress.carbs.consumed = todayLog.totalNutrition.carbs;
            progress.fats.consumed = todayLog.totalNutrition.fats;

            progress.calories.percentage = Math.round((progress.calories.consumed / progress.calories.target) * 100);
            progress.protein.percentage = Math.round((progress.protein.consumed / progress.protein.target) * 100);
            progress.carbs.percentage = Math.round((progress.carbs.consumed / progress.carbs.target) * 100);
            progress.fats.percentage = Math.round((progress.fats.consumed / progress.fats.target) * 100);
        }

        res.render('user/dashboard', {
            title: 'Dashboard - Diet Dash',
            user: req.user,
            todayLog,
            recentOrders,
            recommendedFoods,
            progress,
            moment
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('user/dashboard', {
            title: 'Dashboard - Diet Dash',
            user: req.user,
            todayLog: null,
            recentOrders: [],
            recommendedFoods: [],
            progress: {
                calories: { consumed: 0, target: 2000, percentage: 0 },
                protein: { consumed: 0, target: 150, percentage: 0 },
                carbs: { consumed: 0, target: 250, percentage: 0 },
                fats: { consumed: 0, target: 65, percentage: 0 }
            },
            moment
        });
    }
};

// Get profile edit page
const getProfile = (req, res) => {
    res.render('user/profile', {
        title: 'Your Profile - Diet Dash',
        user: req.user,
        error: null,
        success: null,
        formData: req.user.profile || {}
    });
};

// Handle profile update
const postProfile = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('user/profile', {
                title: 'Your Profile - Diet Dash',
                user: req.user,
                error: errors.array()[0].msg,
                success: null,
                formData: req.body
            });
        }

        const { height, weight, age, gender, activityLevel, healthGoal, dietaryPreferences, allergies } = req.body;

        // Update user profile
        req.user.profile = {
            ...req.user.profile,
            height: parseFloat(height),
            weight: parseFloat(weight),
            age: parseInt(age),
            gender,
            activityLevel,
            healthGoal,
            dietaryPreferences: Array.isArray(dietaryPreferences) ? dietaryPreferences : [dietaryPreferences].filter(Boolean),
            allergies: allergies ? (Array.isArray(allergies) ? allergies : [allergies]) : []
        };

        // Recalculate nutrition requirements
        const ok = req.user.calculateNutrition();
        if (!ok) {
            return res.render('user/profile', {
                title: 'Your Profile - Diet Dash',
                user: req.user,
                error: 'Please provide height, weight, age, gender and activity level to calculate nutrition.',
                success: null,
                formData: req.body
            });
        }

        // Defensive: ensure macros is always an object to prevent mongoose cast errors
        req.user.profile.macros = req.user.profile.macros || { protein: 0, carbs: 0, fats: 0 };

        await req.user.save();

        // Generate today's meal plan so the dashboard shows recommendations based on the updated profile
        await generateMealPlanForToday(req.user);

        // Redirect to dashboard so today's meal plan updates based on new profile
        return res.redirect('/user/dashboard');

    } catch (error) {
        console.error('Profile update error:', error);
        // Extract a friendly message from mongoose validation if available
        let friendly = 'An error occurred while updating your profile. Please try again.';
        if (error && error.name === 'ValidationError') {
            const key = Object.keys(error.errors || {})[0];
            if (key) friendly = error.errors[key].message;
        } else if (error && error.message) {
            friendly = error.message;
        }

        res.render('user/profile', {
            title: 'Your Profile - Diet Dash',
            user: req.user,
            error: friendly,
            success: null,
            formData: req.body
        });
    }
};

// Get progress page
const getProgress = async (req, res) => {
    try {
        // Get diet logs for the past 30 days
        const thirtyDaysAgo = moment().subtract(30, 'days').startOf('day').toDate();
        const today = moment().endOf('day').toDate();

        const dietLogs = await DietLog.find({
            userId: req.user._id,
            date: { $gte: thirtyDaysAgo, $lte: today }
        }).sort({ date: 1 });

        // Calculate streak
        let currentStreak = 0;
        let bestStreak = 0;
        let tempStreak = 0;
        
        const sortedLogs = dietLogs.sort((a, b) => b.date - a.date);
        
        for (let i = 0; i < sortedLogs.length; i++) {
            const logDate = moment(sortedLogs[i].date);
            const expectedDate = moment().subtract(i, 'days');
            
            if (logDate.isSame(expectedDate, 'day') && sortedLogs[i].totalNutrition.calories > 0) {
                currentStreak++;
                tempStreak++;
            } else {
                bestStreak = Math.max(bestStreak, tempStreak);
                tempStreak = 0;
                if (i === 0) currentStreak = 0;
            }
        }
        bestStreak = Math.max(bestStreak, tempStreak);

        // Update user's streak count
        req.user.streakCount = currentStreak;
        await req.user.save();

        // Precompute arrays for chart to avoid inline arrow functions in EJS
        const chartLabels = (dietLogs || []).map(l => new Date(l.date).toLocaleDateString());
        const chartData = (dietLogs || []).map(l => (l.totalNutrition && l.totalNutrition.calories) ? l.totalNutrition.calories : 0);

        const payload = { labels: chartLabels, data: chartData };
        const chartPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64');

        res.render('user/progress', {
            title: 'Your Progress - Diet Dash',
            user: req.user,
            dietLogs,
            currentStreak,
            bestStreak,
            moment,
            chartPayloadB64
        });

    } catch (error) {
        console.error('Progress page error:', error);
        const emptyPayload = Buffer.from(JSON.stringify({ labels: [], data: [] })).toString('base64');
        res.render('user/progress', {
            title: 'Your Progress - Diet Dash',
            user: req.user,
            dietLogs: [],
            currentStreak: 0,
            bestStreak: 0,
            moment,
            chartPayloadB64: emptyPayload
        });
    }
};

// (exports moved to end of file)

// Handle avatar upload
const postUploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Save relative path
        req.user.avatar = '/uploads/avatars/' + req.file.filename;
        await req.user.save();

        res.json({ success: true, avatar: req.user.avatar });
    } catch (err) {
        console.error('Avatar upload error:', err);
        res.status(500).json({ success: false, message: 'Could not upload avatar' });
    }
};

// Watchlist: add
const postAddToWatchlist = async (req, res) => {
    try {
        const { foodId } = req.body;
        if (!foodId) return res.status(400).json({ success: false, message: 'foodId required' });

        if (!req.user.watchlist) req.user.watchlist = [];
        if (!req.user.watchlist.find(id => id.toString() === foodId)) {
            req.user.watchlist.push(foodId);
            await req.user.save();
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Add to watchlist error:', err);
        res.status(500).json({ success: false, message: 'Could not add to watchlist' });
    }
};

// Watchlist: view
const getWatchlist = async (req, res) => {
    try {
        await req.user.populate('watchlist');
        res.render('user/watchlist', { title: 'Your Watchlist', user: req.user, items: req.user.watchlist || [] });
    } catch (err) {
        console.error('Get watchlist error:', err);
        res.render('user/watchlist', { title: 'Your Watchlist', user: req.user, items: [] });
    }
};

// Watchlist: remove
const postRemoveFromWatchlist = async (req, res) => {
    try {
        const { foodId } = req.body;
        if (!foodId) return res.status(400).json({ success: false, message: 'foodId required' });

        req.user.watchlist = (req.user.watchlist || []).filter(id => id.toString() !== foodId);
        await req.user.save();
        res.json({ success: true });
    } catch (err) {
        console.error('Remove from watchlist error:', err);
        res.status(500).json({ success: false, message: 'Could not remove from watchlist' });
    }
};

// exports moved to bottom so all functions (including cart) are defined before export

// Cart: add item
const postAddToCart = async (req, res) => {
    try {
        console.log('postAddToCart called by user:', req.user?._id, 'body:', req.body);
        const { foodId, quantity = 1 } = req.body;
        if (!foodId) return res.status(400).json({ success: false, message: 'foodId required' });

        const food = await FoodItem.findById(foodId);
        if (!food) return res.status(404).json({ success: false, message: 'Food not found' });

        req.user.cart = req.user.cart || [];
        const existing = req.user.cart.find(c => c.foodItem.toString() === foodId);
        if (existing) {
            existing.quantity = Math.max(1, existing.quantity + parseInt(quantity));
        } else {
            req.user.cart.push({ foodItem: food._id, quantity: parseInt(quantity) });
        }
        await req.user.save();
        res.json({ success: true, cart: req.user.cart });
    } catch (err) {
        console.error('Add to cart error:', err);
        res.status(500).json({ success: false, message: 'Could not add to cart' });
    }
};

// Cart: view
const getCart = async (req, res) => {
    try {
        await req.user.populate('cart.foodItem');
        res.render('user/cart', { title: 'Your Cart', user: req.user, items: req.user.cart || [] });
    } catch (err) {
        console.error('Get cart error:', err);
        res.render('user/cart', { title: 'Your Cart', user: req.user, items: [] });
    }
};

// Cart: remove item
const postRemoveFromCart = async (req, res) => {
    try {
        const { foodId } = req.body;
        if (!foodId) return res.status(400).json({ success: false, message: 'foodId required' });

        req.user.cart = (req.user.cart || []).filter(c => c.foodItem.toString() !== foodId);
        await req.user.save();
        res.json({ success: true });
    } catch (err) {
        console.error('Remove from cart error:', err);
        res.status(500).json({ success: false, message: 'Could not remove from cart' });
    }
};

// Cart: place order (creates Order, updates DietLog and user's orders, clears cart)
const postPlaceOrderFromCart = async (req, res) => {
    try {
        // Ensure cart has items
        const cart = req.user.cart || [];
        if (cart.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty' });

        let totalAmount = 0;
        let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
        const orderItems = [];
        const restaurants = new Set();

        // Populate food items
        await req.user.populate('cart.foodItem');

        for (const c of req.user.cart) {
            const food = c.foodItem;
            if (!food) continue;
            const qty = c.quantity || 1;
            const itemTotal = food.price * qty;
            const itemCalories = (food.nutrition?.calories || 0) * qty;
            const itemProtein = (food.nutrition?.protein || 0) * qty;
            const itemCarbs = (food.nutrition?.carbs || 0) * qty;
            const itemFats = (food.nutrition?.fats || 0) * qty;

            orderItems.push({
                foodItem: food._id,
                quantity: qty,
                price: food.price,
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

            restaurants.add(JSON.stringify({ name: food.restaurant?.name || '', phone: food.restaurant?.phone || '' }));
        }

        const deliveryFee = totalAmount > 500 ? 0 : 40;
        const tax = Math.round(totalAmount * 0.05);
        const finalAmount = totalAmount + deliveryFee + tax;

        const deliveryAddr = (req.body.deliveryAddress && Object.keys(req.body.deliveryAddress).length) ? req.body.deliveryAddress : undefined;

        const order = new Order({
            userId: req.user._id,
            items: orderItems,
            totalAmount,
            deliveryFee,
            tax,
            finalAmount,
            ...(deliveryAddr ? { deliveryAddress: deliveryAddr } : {}),
            paymentMethod: req.body.paymentMethod || 'cash_on_delivery',
            specialInstructions: req.body.specialInstructions || '',
            totalNutrition: {
                calories: Math.round(totalCalories),
                protein: Math.round(totalProtein),
                carbs: Math.round(totalCarbs),
                fats: Math.round(totalFats)
            },
            restaurants: Array.from(restaurants).map(r => JSON.parse(r)),
            estimatedDeliveryTime: new Date(Date.now() + 45 * 60 * 1000)
        });

        await order.save();

        // Add order reference to user
        req.user.orders.push(order._id);

        // Update DietLog: add the totals to today's log under 'snacks' as a generic entry
        const todayStart = moment().startOf('day').toDate();
        const todayEnd = moment().endOf('day').toDate();
        let dietLog = await DietLog.findOne({ userId: req.user._id, date: { $gte: todayStart, $lte: todayEnd } });
        if (!dietLog) {
            dietLog = new DietLog({ userId: req.user._id, date: todayStart, meals: { breakfast: [], lunch: [], dinner: [], snacks: [] } });
        }

        // push an aggregated snack entry representing the order
        dietLog.meals.snacks.push({
            foodItem: null,
            quantity: 1,
            calories: Math.round(totalCalories),
            protein: Math.round(totalProtein),
            carbs: Math.round(totalCarbs),
            fats: Math.round(totalFats)
        });

        dietLog.calculateTotalNutrition();
        dietLog.checkGoalsMet(req.user.profile);
        await dietLog.save();

        // Clear cart
        req.user.cart = [];
        await req.user.save();

        res.json({ success: true, message: 'Order placed successfully', orderId: order._id, totalNutrition: dietLog.totalNutrition });
    } catch (err) {
        console.error('Place order from cart error:', err);
        // If Mongoose validation error, return the message to client for clarity
        const message = err && err.message ? err.message : 'Could not place order';
        res.status(500).json({ success: false, message });
    }
};

// Mark daily exercise done: updates streaks
const postMarkExerciseDone = async (req, res) => {
    try {
        const today = moment().startOf('day');
        const last = req.user.lastExerciseDate ? moment(req.user.lastExerciseDate).startOf('day') : null;

        if (last && last.isSame(today, 'day')) {
            return res.json({ success: false, message: 'Already marked exercise for today' });
        }

        // If last was yesterday, increment streak, else reset to 1
        if (last && last.add(1, 'day').isSame(today, 'day')) {
            req.user.currentStreak = (req.user.currentStreak || 0) + 1;
        } else {
            req.user.currentStreak = 1;
        }

        // Update best streak
        req.user.bestStreak = Math.max(req.user.bestStreak || 0, req.user.currentStreak);
        req.user.lastExerciseDate = today.toDate();
        await req.user.save();

        res.json({ success: true, currentStreak: req.user.currentStreak, bestStreak: req.user.bestStreak });
    } catch (err) {
        console.error('Mark exercise error:', err);
        res.status(500).json({ success: false, message: 'Could not mark exercise' });
    }
};

// Search users by username or publicId
const searchUsers = async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ success: true, data: [] });

        const users = await User.find({
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { publicId: { $regex: q, $options: 'i' } }
            ]
        }).limit(20).select('username publicId avatar currentStreak bestStreak');

        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Search users error:', err);
        res.status(500).json({ success: false, message: 'Search failed' });
    }
};

// Get user details by id (for incoming request display)
const getUserById = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ success: false, message: 'id required' });
        const user = await User.findById(id).select('username publicId avatar currentStreak bestStreak');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Get user by id error:', err);
        res.status(500).json({ success: false, message: 'Could not fetch user' });
    }
};

// Send friend request
const sendFriendRequest = async (req, res) => {
    try {
        const { toUserId } = req.body;
        if (!toUserId) return res.status(400).json({ success: false, message: 'toUserId required' });
        if (toUserId === req.user._id.toString()) return res.status(400).json({ success: false, message: 'Cannot friend yourself' });

        const other = await User.findById(toUserId);
        if (!other) return res.status(404).json({ success: false, message: 'User not found' });

        // Idempotent: do not duplicate
        if ((other.friendRequests || []).some(id => id.toString() === req.user._id.toString()) || (req.user.sentRequests || []).some(id => id.toString() === toUserId)) {
            return res.json({ success: true, message: 'Request already sent' });
        }

        other.friendRequests = other.friendRequests || [];
        other.friendRequests.push(req.user._id);
        await other.save();

        req.user.sentRequests = req.user.sentRequests || [];
        req.user.sentRequests.push(other._id);
        await req.user.save();

        res.json({ success: true });
    } catch (err) {
        console.error('Send friend request error:', err);
        res.status(500).json({ success: false, message: 'Could not send request' });
    }
};

// Accept friend request
const acceptFriendRequest = async (req, res) => {
    try {
        const { fromUserId } = req.body;
        if (!fromUserId) return res.status(400).json({ success: false, message: 'fromUserId required' });

        const other = await User.findById(fromUserId);
        if (!other) return res.status(404).json({ success: false, message: 'User not found' });

        // Remove from requests
        req.user.friendRequests = (req.user.friendRequests || []).filter(id => id.toString() !== fromUserId);
        req.user.friends = req.user.friends || [];
        if (!req.user.friends.some(id => id.toString() === fromUserId)) req.user.friends.push(other._id);

        // Update other user
        other.sentRequests = (other.sentRequests || []).filter(id => id.toString() !== req.user._id.toString());
        other.friends = other.friends || [];
        if (!other.friends.some(id => id.toString() === req.user._id.toString())) other.friends.push(req.user._id);

        await other.save();
        await req.user.save();

        res.json({ success: true });
    } catch (err) {
        console.error('Accept friend request error:', err);
        res.status(500).json({ success: false, message: 'Could not accept request' });
    }
};

// Get friends-only leaderboard sorted by currentStreak
const getFriendsLeaderboard = async (req, res) => {
    try {
        const friends = await User.find({ _id: { $in: req.user.friends || [] } }).select('username publicId avatar currentStreak bestStreak').sort({ currentStreak: -1 });
        res.json({ success: true, data: friends });
    } catch (err) {
        console.error('Get friends leaderboard error:', err);
        res.status(500).json({ success: false, message: 'Could not fetch leaderboard' });
    }
};

// (module exports moved to end of file)

// Submit daily exercise tasks with optional weight/fat readings
const postSubmitExerciseTasks = async (req, res) => {
    try {
        const { tasks = [], weight, fatPercentage } = req.body; // tasks: [{ name, done }]
        const today = moment().startOf('day').toDate();

        // Determine previous record for deltas
        const lastRecord = (req.user.exerciseHistory || []).slice(-1)[0];
        const weightDelta = (typeof weight === 'number' && lastRecord && typeof lastRecord.weight === 'number') ? (weight - lastRecord.weight) : (typeof weight === 'number' ? 0 : undefined);
        const fatDelta = (typeof fatPercentage === 'number' && lastRecord && typeof lastRecord.fatPercentage === 'number') ? (fatPercentage - lastRecord.fatPercentage) : (typeof fatPercentage === 'number' ? 0 : undefined);

        req.user.exerciseHistory = req.user.exerciseHistory || [];
        req.user.exerciseHistory.push({ date: today, tasks, weight, fatPercentage, weightDelta, fatDelta });

        // Update streaks: if any task marked done counts as exercise for the day
        const didExercise = tasks.some(t => t.done);
        const last = req.user.lastExerciseDate ? moment(req.user.lastExerciseDate).startOf('day') : null;
        if (didExercise) {
            if (last && last.isSame(moment(today), 'day')) {
                // already recorded; do nothing to streak (we update below the same way)
            }
            // If last was yesterday, increment streak, else reset to 1
            if (last && last.add(1, 'day').isSame(moment(today), 'day')) {
                req.user.currentStreak = (req.user.currentStreak || 0) + 1;
            } else {
                req.user.currentStreak = 1;
            }
            req.user.bestStreak = Math.max(req.user.bestStreak || 0, req.user.currentStreak);
            req.user.lastExerciseDate = today;
        }

        await req.user.save();

        // Compute 7-day progress: sum weightDelta/fatDelta where available over last 7 records
        const sevenAgo = moment().subtract(6, 'days').startOf('day');
        const recent = (req.user.exerciseHistory || []).filter(h => moment(h.date).isSameOrAfter(sevenAgo));
        const totalWeightDelta = recent.reduce((s, r) => s + (typeof r.weightDelta === 'number' ? r.weightDelta : 0), 0);
        const totalFatDelta = recent.reduce((s, r) => s + (typeof r.fatDelta === 'number' ? r.fatDelta : 0), 0);

        res.json({ success: true, currentStreak: req.user.currentStreak || 0, bestStreak: req.user.bestStreak || 0, sevenDay: { weightDelta: totalWeightDelta, fatDelta: totalFatDelta } });
    } catch (err) {
        console.error('Submit exercise tasks error:', err);
        res.status(500).json({ success: false, message: 'Could not submit exercise tasks' });
    }
};

        // Export all controller functions (placed after all declarations)
        module.exports = {
            getCompleteProfile,
            postCompleteProfile,
            getDashboard,
            getProfile,
            postProfile,
            getProgress,
            postUploadAvatar,
            postAddToWatchlist,
            getWatchlist,
            postRemoveFromWatchlist,
            postAddToCart,
            getCart,
            postRemoveFromCart,
            postPlaceOrderFromCart,
            postMarkExerciseDone,
            getUserById,
            postSubmitExerciseTasks,
            searchUsers,
            sendFriendRequest,
            acceptFriendRequest,
            getFriendsLeaderboard
        };