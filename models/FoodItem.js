const mongoose = require('mongoose');

const foodItemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Food name is required'],
        trim: true,
        maxlength: [100, 'Food name cannot exceed 100 characters']
    },
    description: {
        type: String,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative']
    },
    ingredients: [{
        name: {
            type: String,
            required: true
        },
        quantity: String,
        nutrition: {
            calories: Number,
            protein: Number,
            carbs: Number,
            fats: Number,
            fiber: Number
        }
    }],
    nutrition: {
        calories: {
            type: Number,
            required: [true, 'Calories are required'],
            min: [0, 'Calories cannot be negative']
        },
        protein: {
            type: Number,
            required: [true, 'Protein content is required'],
            min: [0, 'Protein cannot be negative']
        },
        carbs: {
            type: Number,
            required: [true, 'Carbs content is required'],
            min: [0, 'Carbs cannot be negative']
        },
        fats: {
            type: Number,
            required: [true, 'Fats content is required'],
            min: [0, 'Fats cannot be negative']
        },
        fiber: {
            type: Number,
            min: [0, 'Fiber cannot be negative'],
            default: 0
        },
        sugar: {
            type: Number,
            min: [0, 'Sugar cannot be negative'],
            default: 0
        },
        sodium: {
            type: Number,
            min: [0, 'Sodium cannot be negative'],
            default: 0
        }
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks', 'desserts'],
        lowercase: true
    },
    cuisineType: {
        type: String,
        required: [true, 'Cuisine type is required'],
        enum: ['indian', 'italian', 'chinese', 'mexican', 'american', 'thai', 'continental', 'japanese', 'korean', 'mediterranean'],
        lowercase: true
    },
    dietaryTags: [{
        type: String,
        enum: ['vegetarian', 'vegan', 'jain', 'gluten_free', 'keto', 'diabetic_friendly', 'low_sodium', 'high_protein', 'low_carb', 'dairy_free'],
        lowercase: true
    }],
    restaurant: {
        name: {
            type: String,
            required: [true, 'Restaurant name is required'],
            trim: true
        },
        address: String,
        phone: String,
        rating: {
            type: Number,
            min: [0, 'Rating cannot be negative'],
            max: [5, 'Rating cannot exceed 5'],
            default: 0
        },
        deliveryTime: {
            type: String,
            default: '30-45 mins'
        }
    },
    image: {
        filename: String,
        originalName: String,
        path: String,
        mimetype: String,
        size: Number
    },
    // External image URL (optional) for seed/external images
    imageUrl: {
        type: String
    },
    availability: {
        type: Boolean,
        default: true
    },
    preparationTime: {
        type: String,
        default: '15-20 mins'
    },
    servingSize: {
        type: String,
        default: '1 serving'
    },
    spiceLevel: {
        type: String,
        enum: ['mild', 'medium', 'spicy', 'extra_spicy'],
        default: 'mild'
    },
    reviews: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: String,
        date: {
            type: Date,
            default: Date.now
        }
    }],
    averageRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    totalReviews: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Calculate average rating when reviews are updated
foodItemSchema.methods.calculateAverageRating = function() {
    if (this.reviews.length === 0) {
        this.averageRating = 0;
        this.totalReviews = 0;
        return;
    }

    const totalRating = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.averageRating = (totalRating / this.reviews.length).toFixed(1);
    this.totalReviews = this.reviews.length;
};

// Index for search functionality
foodItemSchema.index({
    name: 'text',
    description: 'text',
    'restaurant.name': 'text'
});

// Index for filtering
foodItemSchema.index({ category: 1, cuisineType: 1, dietaryTags: 1 });
foodItemSchema.index({ 'nutrition.calories': 1 });
foodItemSchema.index({ price: 1 });

module.exports = mongoose.model('FoodItem', foodItemSchema);