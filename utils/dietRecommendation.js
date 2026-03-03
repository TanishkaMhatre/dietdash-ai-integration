const FoodItem = require('../models/FoodItem');

// Generate daily meal plan based on user profile
const generateMealPlan = async (user) => {
    try {
        if (!user.profile || !user.profile.dailyCalories) {
            throw new Error('User profile not complete');
        }

        const {
            dailyCalories,
            macros,
            dietaryPreferences = [],
            allergies = []
        } = user.profile;

        // Calculate target calories for each meal type
        const mealDistribution = {
            breakfast: Math.round(dailyCalories * 0.25), // 25%
            lunch: Math.round(dailyCalories * 0.35),     // 35%
            dinner: Math.round(dailyCalories * 0.30),    // 30%
            snacks: Math.round(dailyCalories * 0.10)     // 10%
        };

        const mealPlan = {};

        // Get suitable foods for each meal type
        for (const [mealType, targetCalories] of Object.entries(mealDistribution)) {
            const category = mealType === 'snacks' ? 'snacks' : mealType;
            
            // Build query based on dietary preferences
            let query = {
                category: category,
                isActive: true,
                availability: true
            };

            // Filter by dietary preferences
            if (dietaryPreferences.length > 0) {
                query.dietaryTags = { $in: dietaryPreferences };
            }

            // Exclude foods with allergens
            if (allergies.length > 0) {
                query.ingredients = {
                    $not: {
                        $elemMatch: {
                            name: { $in: allergies.map(a => new RegExp(a, 'i')) }
                        }
                    }
                };
            }

            // Get foods within calorie range (±200 calories)
            const minCalories = Math.max(0, targetCalories - 200);
            const maxCalories = targetCalories + 200;
            
            query['nutrition.calories'] = {
                $gte: minCalories,
                $lte: maxCalories
            };

            const foods = await FoodItem.find(query).limit(20);

            if (foods.length === 0) {
                // Fallback: get any food in the category without strict calorie limits
                const fallbackQuery = {
                    category: category,
                    isActive: true,
                    availability: true
                };
                
                if (dietaryPreferences.length > 0) {
                    fallbackQuery.dietaryTags = { $in: dietaryPreferences };
                }
                
                const fallbackFoods = await FoodItem.find(fallbackQuery).limit(10);
                mealPlan[mealType] = selectBestFoods(fallbackFoods, targetCalories, macros, mealType);
            } else {
                mealPlan[mealType] = selectBestFoods(foods, targetCalories, macros, mealType);
            }
        }

        return mealPlan;

    } catch (error) {
        console.error('Error generating meal plan:', error);
        throw error;
    }
};

// Select best foods based on nutritional goals
const selectBestFoods = (foods, targetCalories, macros, mealType) => {
    if (foods.length === 0) return [];

    // Sort foods based on how well they match nutritional goals
    const scoredFoods = foods.map(food => {
        let score = 0;

        // Calorie score (prefer foods closer to target)
        const calorieScore = 100 - Math.abs(food.nutrition.calories - targetCalories);
        score += calorieScore * 0.4; // 40% weight

        // Protein score (especially important for muscle_gain goal)
        const proteinRatio = food.nutrition.protein / food.nutrition.calories;
        score += proteinRatio * 1000 * 0.3; // 30% weight

        // Meal-specific scoring
        if (mealType === 'breakfast') {
            // Prefer foods with good carbs for energy
            const carbRatio = food.nutrition.carbs / food.nutrition.calories;
            score += carbRatio * 500 * 0.2; // 20% weight
        } else if (mealType === 'dinner') {
            // Prefer foods with balanced nutrients
            const fiberScore = food.nutrition.fiber || 0;
            score += fiberScore * 5; // 10% weight
        } else if (mealType === 'snacks') {
            // Prefer lower calorie, higher protein snacks
            if (food.nutrition.calories < 200) score += 50;
            if (food.nutrition.protein > 10) score += 30;
        }

        // Dietary tag bonus
        if (food.dietaryTags.includes('high_protein')) score += 20;
        if (food.dietaryTags.includes('low_carb')) score += 15;
        if (food.dietaryTags.includes('diabetic_friendly')) score += 10;

        return { food, score };
    });

    // Sort by score and return top 3 options
    scoredFoods.sort((a, b) => b.score - a.score);
    return scoredFoods.slice(0, 3).map(item => item.food);
};

// Get food recommendations based on specific criteria
const getFoodRecommendations = async (criteria) => {
    try {
        const {
            category,
            maxCalories,
            minProtein,
            dietaryPreferences = [],
            excludeIngredients = [],
            maxPrice,
            cuisineType
        } = criteria;

        let query = {
            isActive: true,
            availability: true
        };

        // Apply filters
        if (category) query.category = category;
        if (maxCalories) query['nutrition.calories'] = { $lte: maxCalories };
        if (minProtein) query['nutrition.protein'] = { $gte: minProtein };
        if (dietaryPreferences.length > 0) query.dietaryTags = { $in: dietaryPreferences };
        if (maxPrice) query.price = { $lte: maxPrice };
        if (cuisineType) query.cuisineType = cuisineType;

        // Exclude foods with unwanted ingredients
        if (excludeIngredients.length > 0) {
            query.ingredients = {
                $not: {
                    $elemMatch: {
                        name: { $in: excludeIngredients.map(i => new RegExp(i, 'i')) }
                    }
                }
            };
        }

        const foods = await FoodItem.find(query)
            .sort({ averageRating: -1, totalReviews: -1 })
            .limit(20);

        return foods;

    } catch (error) {
        console.error('Error getting food recommendations:', error);
        throw error;
    }
};

// Get personalized food suggestions based on user's recent orders and preferences
const getPersonalizedSuggestions = async (user) => {
    try {
        const { dietaryPreferences = [], allergies = [] } = user.profile || {};

        // Base query for user's dietary preferences
        let query = {
            isActive: true,
            availability: true
        };

        if (dietaryPreferences.length > 0) {
            query.dietaryTags = { $in: dietaryPreferences };
        }

        if (allergies.length > 0) {
            query.ingredients = {
                $not: {
                    $elemMatch: {
                        name: { $in: allergies.map(a => new RegExp(a, 'i')) }
                    }
                }
            };
        }

        // Get highly rated foods that match user preferences
        const suggestions = await FoodItem.find(query)
            .sort({ averageRating: -1, totalReviews: -1 })
            .limit(12);

        // If not enough suggestions, get popular foods
        if (suggestions.length < 6) {
            const popularFoods = await FoodItem.find({
                isActive: true,
                availability: true
            })
            .sort({ totalReviews: -1, averageRating: -1 })
            .limit(12 - suggestions.length);

            suggestions.push(...popularFoods);
        }

        return suggestions;

    } catch (error) {
        console.error('Error getting personalized suggestions:', error);
        throw error;
    }
};

// Parse natural language query for food search
const parseQuery = (query) => {
    const lowercaseQuery = query.toLowerCase();
    const result = {
        category: null,
        maxCalories: null,
        minProtein: null,
        dietaryPreferences: [],
        cuisineType: null,
        maxPrice: null
    };

    // Extract category
    const categoryMap = {
        'breakfast': ['breakfast', 'morning'],
        'lunch': ['lunch', 'afternoon'],
        'dinner': ['dinner', 'evening', 'night'],
        'snacks': ['snack', 'snacks'],
        'drinks': ['drink', 'drinks', 'beverage']
    };

    for (const [cat, keywords] of Object.entries(categoryMap)) {
        if (keywords.some(keyword => lowercaseQuery.includes(keyword))) {
            result.category = cat;
            break;
        }
    }

    // Extract calorie limits
    const calorieMatch = lowercaseQuery.match(/under (\d+) cal|less than (\d+) cal|below (\d+) cal/);
    if (calorieMatch) {
        result.maxCalories = parseInt(calorieMatch[1] || calorieMatch[2] || calorieMatch[3]);
    }

    // Extract protein requirements
    const proteinMatch = lowercaseQuery.match(/high protein|protein/);
    if (proteinMatch) {
        result.minProtein = 20; // Minimum 20g protein
        result.dietaryPreferences.push('high_protein');
    }

    // Extract dietary preferences
    const dietaryMap = {
        'vegetarian': ['vegetarian', 'veg'],
        'vegan': ['vegan'],
        'keto': ['keto', 'ketogenic'],
        'gluten_free': ['gluten free', 'gluten-free'],
        'low_carb': ['low carb', 'low-carb']
    };

    for (const [pref, keywords] of Object.entries(dietaryMap)) {
        if (keywords.some(keyword => lowercaseQuery.includes(keyword))) {
            result.dietaryPreferences.push(pref);
        }
    }

    // Extract cuisine type
    const cuisineMap = {
        'indian': ['indian'],
        'italian': ['italian'],
        'chinese': ['chinese'],
        'mexican': ['mexican'],
        'american': ['american']
    };

    for (const [cuisine, keywords] of Object.entries(cuisineMap)) {
        if (keywords.some(keyword => lowercaseQuery.includes(keyword))) {
            result.cuisineType = cuisine;
            break;
        }
    }

    // Extract price limits
    const priceMatch = lowercaseQuery.match(/under (?:rs\.?|₹)\s?(\d+)/);
    if (priceMatch) {
        result.maxPrice = parseInt(priceMatch[1]);
    }

    return result;
};

module.exports = {
    generateMealPlan,
    getFoodRecommendations,
    getPersonalizedSuggestions,
    parseQuery
};