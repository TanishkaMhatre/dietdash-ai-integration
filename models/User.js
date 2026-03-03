const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [20, 'Username cannot exceed 20 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    profile: {
        // Ensure profile defaults to an object so nested fields exist
        type: Object,
        default: {},
        // NOTE: The nested fields below are for schema validation and will still be enforced
        // when values are provided. We keep explicit macros subdocument with defaults.
        // (Mongoose will merge provided values into this structure.)
        // Using `type: Object` at the top allows safer assignment of profile as a whole.
        // Individual nested validations remain declared below as separate paths.
        height: {
            type: Number,
            min: [100, 'Height must be at least 100 cm'],
            max: [250, 'Height cannot exceed 250 cm']
        },
        weight: {
            type: Number,
            min: [30, 'Weight must be at least 30 kg'],
            max: [300, 'Weight cannot exceed 300 kg']
        },
        age: {
            type: Number,
            min: [13, 'Age must be at least 13'],
            max: [100, 'Age cannot exceed 100']
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other']
        },
        activityLevel: {
            type: String,
            enum: ['sedentary', 'moderate', 'active', 'athlete']
        },
        healthGoal: {
            type: String,
            enum: ['weight_loss', 'weight_gain', 'maintenance', 'muscle_gain']
        },
        dietaryPreferences: [{
            type: String,
            enum: ['vegetarian', 'vegan', 'jain', 'gluten_free', 'keto', 'diabetic_friendly', 'low_sodium', 'high_protein']
        }],
        allergies: [String],
        bmr: Number,
        dailyCalories: {
            type: Number,
            default: 0
        },
        macros: {
            protein: { type: Number, default: 0 },
            carbs: { type: Number, default: 0 },
            fats: { type: Number, default: 0 }
        }
    },
    orders: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
    }],
    // Avatar image path (relative to /uploads)
    avatar: {
        type: String,
        default: ''
    },
    // Simple watchlist of FoodItem references
    watchlist: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodItem'
    }],
    // Simple cart stored on user session: array of { foodItem, quantity }
    cart: [{
        foodItem: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' },
        quantity: { type: Number, default: 1, min: 1 }
    }],
    streakCount: {
        type: Number,
        default: 0
    },
    badges: [{
        name: String,
        earnedAt: {
            type: Date,
            default: Date.now
        },
        description: String
    }],
    lastLogin: Date,
    profileCompleted: {
        type: Boolean,
        default: false
    }
    ,
    // Social / gamification fields
    publicId: {
        type: String,
        unique: true,
        sparse: true
    },
    lastExerciseDate: Date,
    currentStreak: {
        type: Number,
        default: 0
    },
    bestStreak: {
        type: Number,
        default: 0
    },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sentRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    ,
    // Exercise and progress history
    exerciseHistory: [{
        date: { type: Date, required: true },
        tasks: [{ name: String, done: Boolean }],
        weight: Number, // recorded weight (kg)
        fatPercentage: Number, // recorded body fat percentage
        weightDelta: Number, // difference vs previous record
        fatDelta: Number
    }]
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Calculate BMR and daily calories
userSchema.methods.calculateNutrition = function() {
    if (!this.profile.height || !this.profile.weight || !this.profile.age || !this.profile.gender || !this.profile.activityLevel) {
        return false;
    }

    const { height, weight, age, gender, activityLevel, healthGoal } = this.profile;
    
    // Calculate BMR using Mifflin-St Jeor Equation
    let bmr;
    if (gender === 'male') {
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    // Activity multiplier
    const activityMultipliers = {
        sedentary: 1.2,
        moderate: 1.55,
        active: 1.725,
        athlete: 1.9
    };

    let dailyCalories = bmr * activityMultipliers[activityLevel];

    // Adjust for health goals
    switch (healthGoal) {
        case 'weight_loss':
            dailyCalories -= 500; // 500 calorie deficit
            break;
        case 'weight_gain':
            dailyCalories += 500; // 500 calorie surplus
            break;
        case 'muscle_gain':
            dailyCalories += 300; // 300 calorie surplus
            break;
        // maintenance stays the same
    }

    // Calculate macros (protein: 25%, carbs: 45%, fats: 30%)
    const protein = Math.round((dailyCalories * 0.25) / 4); // 4 calories per gram
    const carbs = Math.round((dailyCalories * 0.45) / 4); // 4 calories per gram
    const fats = Math.round((dailyCalories * 0.30) / 9); // 9 calories per gram

    this.profile.bmr = Math.round(bmr);
    this.profile.dailyCalories = Math.round(dailyCalories);
    this.profile.macros = { protein, carbs, fats };

    return true;
};

module.exports = mongoose.model('User', userSchema);