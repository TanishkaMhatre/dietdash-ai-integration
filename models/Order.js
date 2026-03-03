const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    orderNumber: {
        type: String,
        unique: true
    },
    items: [{
        foodItem: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodItem',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: [1, 'Quantity must be at least 1']
        },
        price: {
            type: Number,
            required: true
        },
        totalCalories: Number,
        totalProtein: Number,
        totalCarbs: Number,
        totalFats: Number
    }],
    totalAmount: {
        type: Number,
        required: [true, 'Total amount is required'],
        min: [0, 'Total amount cannot be negative']
    },
    deliveryFee: {
        type: Number,
        default: 0
    },
    tax: {
        type: Number,
        default: 0
    },
    finalAmount: {
        type: Number,
        required: true
    },
    deliveryAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        phoneNumber: String
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cash_on_delivery', 'online', 'wallet'],
        default: 'cash_on_delivery'
    },
    estimatedDeliveryTime: Date,
    actualDeliveryTime: Date,
    specialInstructions: {
        type: String,
        maxlength: [200, 'Special instructions cannot exceed 200 characters']
    },
    totalNutrition: {
        calories: Number,
        protein: Number,
        carbs: Number,
        fats: Number
    },
    restaurants: [{
        name: String,
        phone: String
    }],
    isLoggedInDiet: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Generate order number
orderSchema.pre('save', function(next) {
    if (!this.orderNumber) {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        this.orderNumber = `DD-${timestamp.toUpperCase()}-${random.toUpperCase()}`;
    }
    next();
});

// Calculate total nutrition
orderSchema.methods.calculateTotalNutrition = function() {
    let totalCalories = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFats = 0;

    this.items.forEach(item => {
        totalCalories += item.totalCalories || 0;
        totalProtein += item.totalProtein || 0;
        totalCarbs += item.totalCarbs || 0;
        totalFats += item.totalFats || 0;
    });

    this.totalNutrition = {
        calories: totalCalories,
        protein: totalProtein,
        carbs: totalCarbs,
        fats: totalFats
    };
};

// Index for efficient queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderNumber: 1 });

module.exports = mongoose.model('Order', orderSchema);