const User = require('../models/User');
const DietLog = require('../models/DietLog');
const Order = require('../models/Order');
const moment = require('moment');

// Badge definitions
const BADGES = {
    // Streak badges
    FIRST_LOG: {
        name: 'Getting Started',
        description: 'Logged your first meal',
        icon: '🌱',
        type: 'streak'
    },
    WEEK_STREAK: {
        name: 'Week Warrior',
        description: '7-day logging streak',
        icon: '🔥',
        type: 'streak'
    },
    MONTH_STREAK: {
        name: 'Monthly Master',
        description: '30-day logging streak',
        icon: '💪',
        type: 'streak'
    },
    HUNDRED_DAYS: {
        name: 'Centurion',
        description: '100-day logging streak',
        icon: '👑',
        type: 'streak'
    },

    // Nutrition badges
    PROTEIN_CHAMPION: {
        name: 'Protein Champion',
        description: 'Met protein goals for 7 days',
        icon: '🥩',
        type: 'nutrition'
    },
    BALANCED_EATER: {
        name: 'Balanced Eater',
        description: 'Met all macro goals for 5 days',
        icon: '⚖️',
        type: 'nutrition'
    },
    HYDRATION_HERO: {
        name: 'Hydration Hero',
        description: 'Logged water intake for 10 days',
        icon: '💧',
        type: 'nutrition'
    },
    CALORIE_COUNTER: {
        name: 'Calorie Counter',
        description: 'Met calorie goals for 10 days',
        icon: '🎯',
        type: 'nutrition'
    },

    // Order badges
    FIRST_ORDER: {
        name: 'First Taste',
        description: 'Placed your first order',
        icon: '🍽️',
        type: 'order'
    },
    FREQUENT_ORDERER: {
        name: 'Regular Customer',
        description: 'Placed 10 orders',
        icon: '🛒',
        type: 'order'
    },
    HEALTHY_CHOOSER: {
        name: 'Healthy Chooser',
        description: 'Ordered 20 healthy meals',
        icon: '🥗',
        type: 'order'
    },

    // Goal badges
    WEIGHT_LOSS_WARRIOR: {
        name: 'Weight Loss Warrior',
        description: 'Achieved weight loss goal',
        icon: '📉',
        type: 'goal'
    },
    MUSCLE_BUILDER: {
        name: 'Muscle Builder',
        description: 'Achieved muscle gain goal',
        icon: '💪',
        type: 'goal'
    },
    MAINTENANCE_MASTER: {
        name: 'Maintenance Master',
        description: 'Maintained weight for 30 days',
        icon: '⚖️',
        type: 'goal'
    },

    // Social badges
    REVIEWER: {
        name: 'Food Critic',
        description: 'Left 10 food reviews',
        icon: '⭐',
        type: 'social'
    },
    HELPFUL_REVIEWER: {
        name: 'Helpful Reviewer',
        description: 'Reviews helpful to others',
        icon: '👍',
        type: 'social'
    }
};

// Check and award badges to user
const checkAndAwardBadges = async (userId, actionType = null, data = {}) => {
    try {
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        const newBadges = [];
        const existingBadgeNames = user.badges.map(b => b.name);

        // Get user's diet logs and orders for badge checks
        const dietLogs = await DietLog.find({ userId }).sort({ date: -1 });
        const orders = await Order.find({ userId }).sort({ createdAt: -1 });

        // Check streak badges
        const streakBadges = await checkStreakBadges(user, dietLogs, existingBadgeNames);
        newBadges.push(...streakBadges);

        // Check nutrition badges
        const nutritionBadges = await checkNutritionBadges(user, dietLogs, existingBadgeNames);
        newBadges.push(...nutritionBadges);

        // Check order badges
        const orderBadges = await checkOrderBadges(user, orders, existingBadgeNames);
        newBadges.push(...orderBadges);

        // Check goal badges
        const goalBadges = await checkGoalBadges(user, dietLogs, existingBadgeNames);
        newBadges.push(...goalBadges);

        // Award new badges
        if (newBadges.length > 0) {
            user.badges.push(...newBadges);
            await user.save();
        }

        return newBadges;

    } catch (error) {
        console.error('Error checking badges:', error);
        return [];
    }
};

// Check streak-related badges
const checkStreakBadges = async (user, dietLogs, existingBadges) => {
    const badges = [];

    // First log badge
    if (!existingBadges.includes(BADGES.FIRST_LOG.name) && dietLogs.length > 0) {
        badges.push({
            name: BADGES.FIRST_LOG.name,
            description: BADGES.FIRST_LOG.description,
            icon: BADGES.FIRST_LOG.icon,
            earnedAt: new Date()
        });
    }

    // Calculate current streak
    let currentStreak = 0;
    const today = moment().startOf('day');
    
    for (let i = 0; i < dietLogs.length; i++) {
        const logDate = moment(dietLogs[i].date).startOf('day');
        const expectedDate = today.clone().subtract(i, 'days');
        
        if (logDate.isSame(expectedDate) && dietLogs[i].totalNutrition.calories > 0) {
            currentStreak++;
        } else {
            break;
        }
    }

    // Week streak badge
    if (!existingBadges.includes(BADGES.WEEK_STREAK.name) && currentStreak >= 7) {
        badges.push({
            name: BADGES.WEEK_STREAK.name,
            description: BADGES.WEEK_STREAK.description,
            icon: BADGES.WEEK_STREAK.icon,
            earnedAt: new Date()
        });
    }

    // Month streak badge
    if (!existingBadges.includes(BADGES.MONTH_STREAK.name) && currentStreak >= 30) {
        badges.push({
            name: BADGES.MONTH_STREAK.name,
            description: BADGES.MONTH_STREAK.description,
            icon: BADGES.MONTH_STREAK.icon,
            earnedAt: new Date()
        });
    }

    // 100-day streak badge
    if (!existingBadges.includes(BADGES.HUNDRED_DAYS.name) && currentStreak >= 100) {
        badges.push({
            name: BADGES.HUNDRED_DAYS.name,
            description: BADGES.HUNDRED_DAYS.description,
            icon: BADGES.HUNDRED_DAYS.icon,
            earnedAt: new Date()
        });
    }

    return badges;
};

// Check nutrition-related badges
const checkNutritionBadges = async (user, dietLogs, existingBadges) => {
    const badges = [];

    // Protein champion badge - met protein goals for 7 days
    if (!existingBadges.includes(BADGES.PROTEIN_CHAMPION.name)) {
        const proteinGoalDays = dietLogs.filter(log => log.goalsMet && log.goalsMet.protein).length;
        if (proteinGoalDays >= 7) {
            badges.push({
                name: BADGES.PROTEIN_CHAMPION.name,
                description: BADGES.PROTEIN_CHAMPION.description,
                icon: BADGES.PROTEIN_CHAMPION.icon,
                earnedAt: new Date()
            });
        }
    }

    // Balanced eater badge - met all macro goals for 5 days
    if (!existingBadges.includes(BADGES.BALANCED_EATER.name)) {
        const balancedDays = dietLogs.filter(log => 
            log.goalsMet && 
            log.goalsMet.protein && 
            log.goalsMet.carbs && 
            log.goalsMet.fats
        ).length;
        
        if (balancedDays >= 5) {
            badges.push({
                name: BADGES.BALANCED_EATER.name,
                description: BADGES.BALANCED_EATER.description,
                icon: BADGES.BALANCED_EATER.icon,
                earnedAt: new Date()
            });
        }
    }

    // Hydration hero badge - logged water for 10 days
    if (!existingBadges.includes(BADGES.HYDRATION_HERO.name)) {
        const hydrationDays = dietLogs.filter(log => log.waterIntake > 0).length;
        if (hydrationDays >= 10) {
            badges.push({
                name: BADGES.HYDRATION_HERO.name,
                description: BADGES.HYDRATION_HERO.description,
                icon: BADGES.HYDRATION_HERO.icon,
                earnedAt: new Date()
            });
        }
    }

    // Calorie counter badge - met calorie goals for 10 days
    if (!existingBadges.includes(BADGES.CALORIE_COUNTER.name)) {
        const calorieGoalDays = dietLogs.filter(log => log.goalsMet && log.goalsMet.calories).length;
        if (calorieGoalDays >= 10) {
            badges.push({
                name: BADGES.CALORIE_COUNTER.name,
                description: BADGES.CALORIE_COUNTER.description,
                icon: BADGES.CALORIE_COUNTER.icon,
                earnedAt: new Date()
            });
        }
    }

    return badges;
};

// Check order-related badges
const checkOrderBadges = async (user, orders, existingBadges) => {
    const badges = [];

    // First order badge
    if (!existingBadges.includes(BADGES.FIRST_ORDER.name) && orders.length > 0) {
        badges.push({
            name: BADGES.FIRST_ORDER.name,
            description: BADGES.FIRST_ORDER.description,
            icon: BADGES.FIRST_ORDER.icon,
            earnedAt: new Date()
        });
    }

    // Frequent orderer badge - 10 orders
    if (!existingBadges.includes(BADGES.FREQUENT_ORDERER.name) && orders.length >= 10) {
        badges.push({
            name: BADGES.FREQUENT_ORDERER.name,
            description: BADGES.FREQUENT_ORDERER.description,
            icon: BADGES.FREQUENT_ORDERER.icon,
            earnedAt: new Date()
        });
    }

    // Healthy chooser badge - ordered healthy foods
    if (!existingBadges.includes(BADGES.HEALTHY_CHOOSER.name)) {
        let healthyOrderCount = 0;
        for (const order of orders) {
            for (const item of order.items) {
                if (item.foodItem && item.foodItem.dietaryTags) {
                    const healthyTags = ['vegetarian', 'vegan', 'high_protein', 'low_carb', 'diabetic_friendly'];
                    if (healthyTags.some(tag => item.foodItem.dietaryTags.includes(tag))) {
                        healthyOrderCount++;
                        break; // Count order once if it has any healthy item
                    }
                }
            }
        }
        
        if (healthyOrderCount >= 20) {
            badges.push({
                name: BADGES.HEALTHY_CHOOSER.name,
                description: BADGES.HEALTHY_CHOOSER.description,
                icon: BADGES.HEALTHY_CHOOSER.icon,
                earnedAt: new Date()
            });
        }
    }

    return badges;
};

// Check goal-related badges
const checkGoalBadges = async (user, dietLogs, existingBadges) => {
    const badges = [];

    if (!user.profile || !user.profile.healthGoal) return badges;

    const { healthGoal } = user.profile;
    const recentLogs = dietLogs.slice(0, 30); // Last 30 days

    // Weight loss warrior badge
    if (!existingBadges.includes(BADGES.WEIGHT_LOSS_WARRIOR.name) && healthGoal === 'weight_loss') {
        // Check if user has been consistently under calorie goal
        const consistentDeficit = recentLogs.filter(log => {
            if (!log.goalsMet) return false;
            return log.totalNutrition.calories < (user.profile.dailyCalories * 0.9); // 10% under goal
        }).length;

        if (consistentDeficit >= 21) { // 21 out of 30 days
            badges.push({
                name: BADGES.WEIGHT_LOSS_WARRIOR.name,
                description: BADGES.WEIGHT_LOSS_WARRIOR.description,
                icon: BADGES.WEIGHT_LOSS_WARRIOR.icon,
                earnedAt: new Date()
            });
        }
    }

    // Muscle builder badge
    if (!existingBadges.includes(BADGES.MUSCLE_BUILDER.name) && healthGoal === 'muscle_gain') {
        const highProteinDays = recentLogs.filter(log => 
            log.goalsMet && log.goalsMet.protein
        ).length;

        if (highProteinDays >= 21) {
            badges.push({
                name: BADGES.MUSCLE_BUILDER.name,
                description: BADGES.MUSCLE_BUILDER.description,
                icon: BADGES.MUSCLE_BUILDER.icon,
                earnedAt: new Date()
            });
        }
    }

    // Maintenance master badge
    if (!existingBadges.includes(BADGES.MAINTENANCE_MASTER.name) && healthGoal === 'maintenance') {
        const maintainedDays = recentLogs.filter(log => log.goalsMet && log.goalsMet.calories).length;

        if (maintainedDays >= 25) { // 25 out of 30 days
            badges.push({
                name: BADGES.MAINTENANCE_MASTER.name,
                description: BADGES.MAINTENANCE_MASTER.description,
                icon: BADGES.MAINTENANCE_MASTER.icon,
                earnedAt: new Date()
            });
        }
    }

    return badges;
};

// Get user's achievement stats
const getUserAchievements = async (userId) => {
    try {
        const user = await User.findById(userId);
        const dietLogs = await DietLog.find({ userId }).sort({ date: -1 });
        const orders = await Order.find({ userId });

        // Calculate streak
        let currentStreak = 0;
        const today = moment().startOf('day');
        
        for (let i = 0; i < dietLogs.length; i++) {
            const logDate = moment(dietLogs[i].date).startOf('day');
            const expectedDate = today.clone().subtract(i, 'days');
            
            if (logDate.isSame(expectedDate) && dietLogs[i].totalNutrition.calories > 0) {
                currentStreak++;
            } else {
                break;
            }
        }

        // Calculate best streak
        let bestStreak = 0;
        let tempStreak = 0;
        const sortedLogs = [...dietLogs].sort((a, b) => b.date - a.date);
        
        for (let i = 0; i < sortedLogs.length; i++) {
            const logDate = moment(sortedLogs[i].date);
            const prevLogDate = i > 0 ? moment(sortedLogs[i-1].date) : moment().add(1, 'day');
            
            if (prevLogDate.diff(logDate, 'days') === 1 && sortedLogs[i].totalNutrition.calories > 0) {
                tempStreak++;
            } else {
                bestStreak = Math.max(bestStreak, tempStreak);
                tempStreak = sortedLogs[i].totalNutrition.calories > 0 ? 1 : 0;
            }
        }
        bestStreak = Math.max(bestStreak, tempStreak);

        return {
            badges: user.badges,
            stats: {
                currentStreak,
                bestStreak,
                totalLoggedDays: dietLogs.filter(log => log.totalNutrition.calories > 0).length,
                totalOrders: orders.length,
                goalsMetDays: dietLogs.filter(log => 
                    log.goalsMet && Object.values(log.goalsMet).some(met => met)
                ).length
            }
        };

    } catch (error) {
        console.error('Error getting user achievements:', error);
        return {
            badges: [],
            stats: {
                currentStreak: 0,
                bestStreak: 0,
                totalLoggedDays: 0,
                totalOrders: 0,
                goalsMetDays: 0
            }
        };
    }
};

module.exports = {
    BADGES,
    checkAndAwardBadges,
    getUserAchievements
};