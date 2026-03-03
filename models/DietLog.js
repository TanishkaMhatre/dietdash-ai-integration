const mongoose = require('mongoose');

const dietLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    meals: {
        breakfast: [{
            foodItem: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodItem'
            },
            quantity: {
                type: Number,
                min: [0.1, 'Quantity must be at least 0.1']
            },
            calories: Number,
            protein: Number,
            carbs: Number,
            fats: Number,
            loggedAt: {
                type: Date,
                default: Date.now
            }
        }],
        lunch: [{
            foodItem: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodItem'
            },
            quantity: {
                type: Number,
                min: [0.1, 'Quantity must be at least 0.1']
            },
            calories: Number,
            protein: Number,
            carbs: Number,
            fats: Number,
            loggedAt: {
                type: Date,
                default: Date.now
            }
        }],
        dinner: [{
            foodItem: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodItem'
            },
            quantity: {
                type: Number,
                min: [0.1, 'Quantity must be at least 0.1']
            },
            calories: Number,
            protein: Number,
            carbs: Number,
            fats: Number,
            loggedAt: {
                type: Date,
                default: Date.now
            }
        }],
        snacks: [{
            foodItem: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'FoodItem'
            },
            quantity: {
                type: Number,
                min: [0.1, 'Quantity must be at least 0.1']
            },
            calories: Number,
            protein: Number,
            carbs: Number,
            fats: Number,
            loggedAt: {
                type: Date,
                default: Date.now
            }
        }]
    },
    totalNutrition: {
        calories: {
            type: Number,
            default: 0
        },
        protein: {
            type: Number,
            default: 0
        },
        carbs: {
            type: Number,
            default: 0
        },
        fats: {
            type: Number,
            default: 0
        }
    },
    waterIntake: {
        type: Number,
        default: 0,
        min: [0, 'Water intake cannot be negative']
    },
    weight: {
        type: Number,
        min: [30, 'Weight must be at least 30 kg'],
        max: [300, 'Weight cannot exceed 300 kg']
    },
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    goalsMet: {
        calories: {
            type: Boolean,
            default: false
        },
        protein: {
            type: Boolean,
            default: false
        },
        carbs: {
            type: Boolean,
            default: false
        },
        fats: {
            type: Boolean,
            default: false
        }
    }
}, {
    timestamps: true
});

// Calculate total nutrition from all meals
dietLogSchema.methods.calculateTotalNutrition = function() {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;

    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(mealType => {
        this.meals[mealType].forEach(item => {
            totalCalories += item.calories || 0;
            totalProtein += item.protein || 0;
            totalCarbs += item.carbs || 0;
            totalFats += item.fats || 0;
        });
    });

    this.totalNutrition = {
        calories: Math.round(totalCalories),
        protein: Math.round(totalProtein),
        carbs: Math.round(totalCarbs),
        fats: Math.round(totalFats)
    };

    return this.totalNutrition;
};

// Check if goals are met based on user's target macros
dietLogSchema.methods.checkGoalsMet = function(userMacros) {
    if (!userMacros) return;

    const tolerance = 0.1; // 10% tolerance

    this.goalsMet = {
        calories: Math.abs(this.totalNutrition.calories - userMacros.dailyCalories) <= (userMacros.dailyCalories * tolerance),
        protein: Math.abs(this.totalNutrition.protein - userMacros.protein) <= (userMacros.protein * tolerance),
        carbs: Math.abs(this.totalNutrition.carbs - userMacros.carbs) <= (userMacros.carbs * tolerance),
        fats: Math.abs(this.totalNutrition.fats - userMacros.fats) <= (userMacros.fats * tolerance)
    };
};

// Ensure one diet log per user per day
dietLogSchema.index({ userId: 1, date: 1 }, { unique: true });

// Index for efficient queries
dietLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('DietLog', dietLogSchema);