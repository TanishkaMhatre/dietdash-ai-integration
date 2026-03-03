const User = require('../models/User');
const FoodItem = require('../models/FoodItem');
const DietLog = require('../models/DietLog');
const Order = require('../models/Order');
const { validationResult } = require('express-validator');
const moment = require('moment');

// ✅ node-fetch for CommonJS
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

// ✅ AI service URL (Flask)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:5001';

// ✅ Helper: Map your app profile -> AI payload
function buildAiPayload(user, top_n = 8) {
  const p = user?.profile || {};

  // Map goal
  // Your app stores: healthGoal like 'weight_loss', 'muscle_gain' etc
  // AI expects: "Weight Loss" (like your curl test)
  const goalMap = {
    weight_loss: 'Weight Loss',
    muscle_gain: 'Muscle Gain',
    weight_gain: 'Weight Gain',
    maintenance: 'Maintenance'
  };

  // Diet mapping from dietaryPreferences (example: ["veg"] etc)
  // If your dietaryPreferences contains "veg" then Veg, else Non-Veg fallback
  const tags = (p.dietaryPreferences || []).map(t => String(t).toLowerCase());
  let diet = 'Non-Veg';
  if (tags.includes('veg') || tags.includes('vegetarian')) diet = 'Veg';
  if (tags.includes('vegan')) diet = 'Vegan';

  const payload = {
    goal: goalMap[p.healthGoal] || 'Weight Loss',
    diet,
    age: Number(p.age) || 21,
    gender: (p.gender || 'female'),
    height_cm: Number(p.height) || 160,   // you store height in profile.height
    weight_kg: Number(p.weight) || 58,    // profile.weight
    activity: (p.activityLevel || 'light'), // profile.activityLevel
    top_n
  };

  return payload;
}

// ✅ Helper: Call Flask AI
async function getAiRecommendations(user) {
  try {
    if (!user || !user.profileCompleted) return null;

    const payload = buildAiPayload(user, 8);

    const resp = await fetch(`${AI_SERVICE_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 120000
    });

    const data = await resp.json();
    if (!data || data.status !== 'success') return null;
    return data;
  } catch (err) {
    console.error('AI recommend error:', err);
    return null;
  }
}

// Simple meal plan generator: picks foods matching user's dietary tags and builds a 3-meal plan
async function generateMealPlanForToday(user) {
  try {
    const dietaryTags = user.profile.dietaryPreferences || [];
    const goal = user.profile.healthGoal || 'maintenance';
    const dailyCalories = user.profile.dailyCalories || 2000;

    // Fetch candidate foods
    let candidates = await FoodItem.find({
      isActive: true,
      $or: [{ dietaryTags: { $in: dietaryTags } }, { dietaryTags: { $size: 0 } }]
    });
    if (!candidates || candidates.length === 0) return null;

    // Score candidates by goal
    candidates = candidates
      .map(f => {
        const cal = f.nutrition?.calories || 0;
        const prot = f.nutrition?.protein || 0;
        let score = prot * 2;
        if (goal === 'muscle_gain' || goal === 'weight_gain') score += cal * 0.01;
        if (goal === 'weight_loss') score -= cal * 0.02;
        return { item: f, score };
      })
      .sort((a, b) => b.score - a.score);

    const perMeal = Math.max(300, Math.round(dailyCalories / 3));

    const pickMeal = (count = 1, startIndex = 0) => {
      const meal = [];
      for (let i = 0; i < candidates.length && meal.length < count; i++) {
        const c = candidates[(startIndex + i) % candidates.length];
        if (!meal.find(m => m.item._id.equals(c.item._id))) {
          meal.push({
            foodItem: c.item._id,
            quantity: 1,
            calories: c.item.nutrition?.calories || 0,
            protein: c.item.nutrition?.protein || 0,
            carbs: c.item.nutrition?.carbs || 0,
            fats: c.item.nutrition?.fats || 0
          });
        }
      }
      return meal;
    };

    const breakfast = pickMeal(1, 0);
    const lunch = pickMeal(2, 2);
    const dinner = pickMeal(2, 6);

    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();
    let dietLog = await DietLog.findOne({
      userId: user._id,
      date: { $gte: todayStart, $lte: todayEnd }
    });
    if (!dietLog) {
      dietLog = new DietLog({
        userId: user._id,
        date: todayStart,
        meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }
      });
    }

    dietLog.meals.breakfast = breakfast;
    dietLog.meals.lunch = lunch;
    dietLog.meals.dinner = dinner;

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

    const calcOk = req.user.calculateNutrition();
    if (!calcOk) {
      return res.render('user/complete-profile', {
        title: 'Complete Your Profile - Diet Dash',
        user: req.user,
        error: 'Please provide height, weight, age, gender and activity level to calculate nutrition.',
        formData: req.body
      });
    }

    req.user.profile.macros = req.user.profile.macros || { protein: 0, carbs: 0, fats: 0 };
    req.user.profileCompleted = true;

    await req.user.save();

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

// ✅ Get user dashboard (NOW includes AI suggestions)
const getDashboard = async (req, res) => {
  try {
    const today = moment().startOf('day').toDate();
    const tomorrow = moment().endOf('day').toDate();

    let todayLog = await DietLog.findOne({
      userId: req.user._id,
      date: { $gte: today, $lte: tomorrow }
    }).populate('meals.breakfast.foodItem meals.lunch.foodItem meals.dinner.foodItem meals.snacks.foodItem');

    const recentOrders = await Order.find({ userId: req.user._id })
      .populate('items.foodItem')
      .sort({ createdAt: -1 })
      .limit(5);

    // -----------------------
    // ✅ AI Recommendations
    // -----------------------
    const aiData = await getAiRecommendations(req.user);

    // Convert AI rows -> UI cards (we will show them in breakfast/lunch/dinner/snacks by round-robin)
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snacks'];
    const aiRecommendedFoods = (aiData?.recommendations || []).map((r, idx) => ({
      _id: null, // no DB id (so we won't show Add button)
      name: r.description,
      category: mealTypes[idx % mealTypes.length],
      nutrition: {
        calories: Number(r.calories) || 0,
        protein: Number(r.protein) || 0,
        carbs: Number(r.carbs) || 0,
        fats: Number(r.fat) || 0
      },
      imageUrl: null,
      isAi: true
    }));

    // -----------------------
    // ✅ Fallback DB foods (if AI fails or empty)
    // -----------------------
    const dietaryTags = req.user.profile?.dietaryPreferences || [];
    const dbFoods = await FoodItem.find({
      isActive: true,
      $or: [{ dietaryTags: { $in: dietaryTags } }, { dietaryTags: { $size: 0 } }]
    }).limit(8);

    const recommendedFoods = (aiRecommendedFoods.length > 0) ? aiRecommendedFoods : dbFoods;

    // Progress
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
      moment,
      aiMeta: aiData ? { daily_calories: aiData.daily_calories, per_meal_target: aiData.per_meal_target, diet: aiData.diet, goal: aiData.goal } : null
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
      moment,
      aiMeta: null
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

    req.user.profile.macros = req.user.profile.macros || { protein: 0, carbs: 0, fats: 0 };

    await req.user.save();

    await generateMealPlanForToday(req.user);

    return res.redirect('/user/dashboard');
  } catch (error) {
    console.error('Profile update error:', error);
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
    const thirtyDaysAgo = moment().subtract(30, 'days').startOf('day').toDate();
    const today = moment().endOf('day').toDate();

    const dietLogs = await DietLog.find({
      userId: req.user._id,
      date: { $gte: thirtyDaysAgo, $lte: today }
    }).sort({ date: 1 });

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

    req.user.streakCount = currentStreak;
    await req.user.save();

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

// Cart: place order
const postPlaceOrderFromCart = async (req, res) => {
  try {
    const cart = req.user.cart || [];
    if (cart.length === 0) return res.status(400).json({ success: false, message: 'Cart is empty' });

    let totalAmount = 0;
    let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0;
    const orderItems = [];
    const restaurants = new Set();

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

    req.user.orders.push(order._id);

    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();
    let dietLog = await DietLog.findOne({ userId: req.user._id, date: { $gte: todayStart, $lte: todayEnd } });
    if (!dietLog) {
      dietLog = new DietLog({ userId: req.user._id, date: todayStart, meals: { breakfast: [], lunch: [], dinner: [], snacks: [] } });
    }

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

    req.user.cart = [];
    await req.user.save();

    res.json({ success: true, message: 'Order placed successfully', orderId: order._id, totalNutrition: dietLog.totalNutrition });
  } catch (err) {
    console.error('Place order from cart error:', err);
    const message = err && err.message ? err.message : 'Could not place order';
    res.status(500).json({ success: false, message });
  }
};

// Mark daily exercise done
const postMarkExerciseDone = async (req, res) => {
  try {
    const today = moment().startOf('day');
    const last = req.user.lastExerciseDate ? moment(req.user.lastExerciseDate).startOf('day') : null;

    if (last && last.isSame(today, 'day')) {
      return res.json({ success: false, message: 'Already marked exercise for today' });
    }

    if (last && last.add(1, 'day').isSame(today, 'day')) {
      req.user.currentStreak = (req.user.currentStreak || 0) + 1;
    } else {
      req.user.currentStreak = 1;
    }

    req.user.bestStreak = Math.max(req.user.bestStreak || 0, req.user.currentStreak);
    req.user.lastExerciseDate = today.toDate();
    await req.user.save();

    res.json({ success: true, currentStreak: req.user.currentStreak, bestStreak: req.user.bestStreak });
  } catch (err) {
    console.error('Mark exercise error:', err);
    res.status(500).json({ success: false, message: 'Could not mark exercise' });
  }
};

// Search users
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

// Get user details by id
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

    req.user.friendRequests = (req.user.friendRequests || []).filter(id => id.toString() !== fromUserId);
    req.user.friends = req.user.friends || [];
    if (!req.user.friends.some(id => id.toString() === fromUserId)) req.user.friends.push(other._id);

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

// Get friends leaderboard
const getFriendsLeaderboard = async (req, res) => {
  try {
    const friends = await User.find({ _id: { $in: req.user.friends || [] } })
      .select('username publicId avatar currentStreak bestStreak')
      .sort({ currentStreak: -1 });
    res.json({ success: true, data: friends });
  } catch (err) {
    console.error('Get friends leaderboard error:', err);
    res.status(500).json({ success: false, message: 'Could not fetch leaderboard' });
  }
};

// Submit daily exercise tasks
const postSubmitExerciseTasks = async (req, res) => {
  try {
    const { tasks = [], weight, fatPercentage } = req.body;
    const today = moment().startOf('day').toDate();

    const lastRecord = (req.user.exerciseHistory || []).slice(-1)[0];
    const weightDelta = (typeof weight === 'number' && lastRecord && typeof lastRecord.weight === 'number')
      ? (weight - lastRecord.weight)
      : (typeof weight === 'number' ? 0 : undefined);
    const fatDelta = (typeof fatPercentage === 'number' && lastRecord && typeof lastRecord.fatPercentage === 'number')
      ? (fatPercentage - lastRecord.fatPercentage)
      : (typeof fatPercentage === 'number' ? 0 : undefined);

    req.user.exerciseHistory = req.user.exerciseHistory || [];
    req.user.exerciseHistory.push({ date: today, tasks, weight, fatPercentage, weightDelta, fatDelta });

    const didExercise = tasks.some(t => t.done);
    const last = req.user.lastExerciseDate ? moment(req.user.lastExerciseDate).startOf('day') : null;
    if (didExercise) {
      if (last && last.add(1, 'day').isSame(moment(today), 'day')) {
        req.user.currentStreak = (req.user.currentStreak || 0) + 1;
      } else {
        req.user.currentStreak = 1;
      }
      req.user.bestStreak = Math.max(req.user.bestStreak || 0, req.user.currentStreak);
      req.user.lastExerciseDate = today;
    }

    await req.user.save();

    const sevenAgo = moment().subtract(6, 'days').startOf('day');
    const recent = (req.user.exerciseHistory || []).filter(h => moment(h.date).isSameOrAfter(sevenAgo));
    const totalWeightDelta = recent.reduce((s, r) => s + (typeof r.weightDelta === 'number' ? r.weightDelta : 0), 0);
    const totalFatDelta = recent.reduce((s, r) => s + (typeof r.fatDelta === 'number' ? r.fatDelta : 0), 0);

    res.json({
      success: true,
      currentStreak: req.user.currentStreak || 0,
      bestStreak: req.user.bestStreak || 0,
      sevenDay: { weightDelta: totalWeightDelta, fatDelta: totalFatDelta }
    });
  } catch (err) {
    console.error('Submit exercise tasks error:', err);
    res.status(500).json({ success: false, message: 'Could not submit exercise tasks' });
  }
};

// Export all controller functions
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