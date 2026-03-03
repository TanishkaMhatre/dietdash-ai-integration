const mongoose = require('mongoose');
const FoodItem = require('../models/FoodItem');
const User = require('../models/User');

// Sample food items data
const sampleFoodItems = [
    // Breakfast Items
    {
        name: 'Protein Oats Bowl',
        description: 'Creamy oats with banana, almonds, and protein powder',
        price: 180,
        ingredients: [
            { name: 'Rolled Oats', quantity: '50g' },
            { name: 'Banana', quantity: '1 medium' },
            { name: 'Almonds', quantity: '20g' },
            { name: 'Protein Powder', quantity: '1 scoop' }
        ],
        nutrition: {
            calories: 420,
            protein: 25,
            carbs: 55,
            fats: 12,
            fiber: 8,
            sugar: 15,
            sodium: 150
        },
        category: 'breakfast',
        cuisineType: 'continental',
        dietaryTags: ['vegetarian', 'high_protein'],
        restaurant: {
            name: 'Healthy Breakfast Co.',
            address: 'CP, New Delhi',
            phone: '+91-9876543210'
        },
        preparationTime: '10-15 mins',
        servingSize: '1 bowl',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },
    {
        name: 'Avocado Toast',
        description: 'Multigrain bread with mashed avocado, cherry tomatoes',
        price: 220,
        ingredients: [
            { name: 'Multigrain Bread', quantity: '2 slices' },
            { name: 'Avocado', quantity: '1 whole' },
            { name: 'Cherry Tomatoes', quantity: '50g' },
            { name: 'Olive Oil', quantity: '1 tsp' }
        ],
        nutrition: {
            calories: 350,
            protein: 8,
            carbs: 35,
            fats: 22,
            fiber: 12,
            sugar: 8,
            sodium: 320
        },
        category: 'breakfast',
        cuisineType: 'continental',
        dietaryTags: ['vegetarian', 'gluten_free'],
        restaurant: {
            name: 'Green Cafe',
            address: 'Gurgaon, Haryana',
            phone: '+91-9876543211'
        },
        preparationTime: '8-10 mins',
        servingSize: '2 slices',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },
    {
        name: 'Masala Scrambled Eggs',
        description: 'Indian style scrambled eggs with onions and spices',
        price: 160,
        ingredients: [
            { name: 'Eggs', quantity: '2 large' },
            { name: 'Onions', quantity: '50g' },
            { name: 'Tomatoes', quantity: '30g' },
            { name: 'Green Chilies', quantity: '2 small' }
        ],
        nutrition: {
            calories: 280,
            protein: 18,
            carbs: 8,
            fats: 20,
            fiber: 2,
            sugar: 5,
            sodium: 420
        },
        category: 'breakfast',
        cuisineType: 'indian',
        dietaryTags: ['high_protein'],
        restaurant: {
            name: 'Desi Breakfast',
            address: 'Mumbai, Maharashtra',
            phone: '+91-9876543212'
        },
        preparationTime: '12-15 mins',
        servingSize: '1 plate',
        spiceLevel: 'medium',
        availability: true,
        isActive: true
    },

    // Lunch Items
    {
        name: 'Grilled Chicken Salad',
        description: 'Fresh mixed greens with grilled chicken breast',
        price: 320,
        ingredients: [
            { name: 'Chicken Breast', quantity: '150g' },
            { name: 'Mixed Greens', quantity: '100g' },
            { name: 'Cherry Tomatoes', quantity: '50g' },
            { name: 'Olive Oil Dressing', quantity: '2 tbsp' }
        ],
        nutrition: {
            calories: 380,
            protein: 35,
            carbs: 12,
            fats: 22,
            fiber: 4,
            sugar: 8,
            sodium: 520
        },
        category: 'lunch',
        cuisineType: 'continental',
        dietaryTags: ['high_protein', 'low_carb'],
        restaurant: {
            name: 'Fit Meals',
            address: 'Bangalore, Karnataka',
            phone: '+91-9876543213'
        },
        preparationTime: '15-20 mins',
        servingSize: '1 large bowl',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },
    {
        name: 'Paneer Tikka Bowl',
        description: 'Tandoori paneer with quinoa and mint chutney',
        price: 280,
        ingredients: [
            { name: 'Paneer', quantity: '120g' },
            { name: 'Quinoa', quantity: '80g' },
            { name: 'Bell Peppers', quantity: '60g' },
            { name: 'Mint Chutney', quantity: '30ml' }
        ],
        nutrition: {
            calories: 450,
            protein: 22,
            carbs: 38,
            fats: 24,
            fiber: 6,
            sugar: 8,
            sodium: 680
        },
        category: 'lunch',
        cuisineType: 'indian',
        dietaryTags: ['vegetarian', 'high_protein'],
        restaurant: {
            name: 'Tandoor Express',
            address: 'Pune, Maharashtra',
            phone: '+91-9876543214'
        },
        preparationTime: '20-25 mins',
        servingSize: '1 bowl',
        spiceLevel: 'medium',
        availability: true,
        isActive: true
    },
    {
        name: 'Buddha Bowl',
        description: 'Quinoa, chickpeas, avocado, and tahini dressing',
        price: 340,
        ingredients: [
            { name: 'Quinoa', quantity: '80g' },
            { name: 'Chickpeas', quantity: '100g' },
            { name: 'Avocado', quantity: '60g' },
            { name: 'Tahini Dressing', quantity: '30ml' }
        ],
        nutrition: {
            calories: 520,
            protein: 18,
            carbs: 48,
            fats: 28,
            fiber: 14,
            sugar: 6,
            sodium: 420
        },
        category: 'lunch',
        cuisineType: 'mediterranean',
        dietaryTags: ['vegetarian', 'vegan', 'gluten_free'],
        restaurant: {
            name: 'Buddha Bowls',
            address: 'Chennai, Tamil Nadu',
            phone: '+91-9876543215'
        },
        preparationTime: '15-18 mins',
        servingSize: '1 large bowl',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },

    // Dinner Items
    {
        name: 'Salmon with Steamed Broccoli',
        description: 'Grilled salmon fillet with garlic steamed vegetables',
        price: 450,
        ingredients: [
            { name: 'Salmon Fillet', quantity: '150g' },
            { name: 'Broccoli', quantity: '120g' },
            { name: 'Garlic', quantity: '5g' },
            { name: 'Olive Oil', quantity: '1 tbsp' }
        ],
        nutrition: {
            calories: 420,
            protein: 38,
            carbs: 8,
            fats: 26,
            fiber: 3,
            sugar: 3,
            sodium: 180
        },
        category: 'dinner',
        cuisineType: 'continental',
        dietaryTags: ['high_protein', 'low_carb', 'keto'],
        restaurant: {
            name: 'Ocean Grill',
            address: 'Goa',
            phone: '+91-9876543216'
        },
        preparationTime: '18-22 mins',
        servingSize: '1 fillet with vegetables',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },
    {
        name: 'Dal Tadka with Brown Rice',
        description: 'Yellow lentils with cumin tempering and brown rice',
        price: 180,
        ingredients: [
            { name: 'Yellow Lentils', quantity: '80g' },
            { name: 'Brown Rice', quantity: '100g' },
            { name: 'Cumin Seeds', quantity: '2g' },
            { name: 'Turmeric', quantity: '1g' }
        ],
        nutrition: {
            calories: 380,
            protein: 16,
            carbs: 68,
            fats: 6,
            fiber: 8,
            sugar: 4,
            sodium: 420
        },
        category: 'dinner',
        cuisineType: 'indian',
        dietaryTags: ['vegetarian', 'vegan', 'gluten_free'],
        restaurant: {
            name: 'Home Style Kitchen',
            address: 'Delhi',
            phone: '+91-9876543217'
        },
        preparationTime: '25-30 mins',
        servingSize: '1 bowl dal + rice',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },

    // Snacks
    {
        name: 'Greek Yogurt with Berries',
        description: 'Protein-rich Greek yogurt topped with mixed berries',
        price: 140,
        ingredients: [
            { name: 'Greek Yogurt', quantity: '150g' },
            { name: 'Mixed Berries', quantity: '60g' },
            { name: 'Honey', quantity: '1 tsp' },
            { name: 'Granola', quantity: '20g' }
        ],
        nutrition: {
            calories: 220,
            protein: 18,
            carbs: 28,
            fats: 6,
            fiber: 4,
            sugar: 22,
            sodium: 80
        },
        category: 'snacks',
        cuisineType: 'continental',
        dietaryTags: ['vegetarian', 'high_protein'],
        restaurant: {
            name: 'Yogurt Corner',
            address: 'Mumbai',
            phone: '+91-9876543218'
        },
        preparationTime: '5 mins',
        servingSize: '1 cup',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },
    {
        name: 'Hummus with Veggie Sticks',
        description: 'Chickpea hummus with fresh cucumber and carrot sticks',
        price: 160,
        ingredients: [
            { name: 'Chickpea Hummus', quantity: '80g' },
            { name: 'Cucumber', quantity: '60g' },
            { name: 'Carrots', quantity: '60g' },
            { name: 'Bell Peppers', quantity: '40g' }
        ],
        nutrition: {
            calories: 180,
            protein: 8,
            carbs: 20,
            fats: 8,
            fiber: 6,
            sugar: 8,
            sodium: 320
        },
        category: 'snacks',
        cuisineType: 'mediterranean',
        dietaryTags: ['vegetarian', 'vegan', 'gluten_free'],
        restaurant: {
            name: 'Mediterranean Bites',
            address: 'Bangalore',
            phone: '+91-9876543219'
        },
        preparationTime: '5 mins',
        servingSize: '1 portion',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },

    // Drinks
    {
        name: 'Green Smoothie',
        description: 'Spinach, banana, mango, and coconut water blend',
        price: 120,
        ingredients: [
            { name: 'Spinach', quantity: '50g' },
            { name: 'Banana', quantity: '1 medium' },
            { name: 'Mango', quantity: '60g' },
            { name: 'Coconut Water', quantity: '200ml' }
        ],
        nutrition: {
            calories: 150,
            protein: 4,
            carbs: 35,
            fats: 1,
            fiber: 6,
            sugar: 28,
            sodium: 60
        },
        category: 'drinks',
        cuisineType: 'continental',
        dietaryTags: ['vegetarian', 'vegan', 'gluten_free'],
        restaurant: {
            name: 'Smoothie Bar',
            address: 'Hyderabad',
            phone: '+91-9876543220'
        },
        preparationTime: '3-5 mins',
        servingSize: '300ml',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    },
    {
        name: 'Protein Shake - Chocolate',
        description: 'Whey protein with almond milk and cocoa powder',
        price: 180,
        ingredients: [
            { name: 'Whey Protein', quantity: '1 scoop' },
            { name: 'Almond Milk', quantity: '250ml' },
            { name: 'Cocoa Powder', quantity: '1 tbsp' },
            { name: 'Stevia', quantity: '1 packet' }
        ],
        nutrition: {
            calories: 200,
            protein: 25,
            carbs: 8,
            fats: 6,
            fiber: 3,
            sugar: 4,
            sodium: 150
        },
        category: 'drinks',
        cuisineType: 'continental',
        dietaryTags: ['vegetarian', 'high_protein', 'low_carb'],
        restaurant: {
            name: 'Protein Hub',
            address: 'Kolkata',
            phone: '+91-9876543221'
        },
        preparationTime: '2 mins',
        servingSize: '300ml',
        spiceLevel: 'mild',
        availability: true,
        isActive: true
    }
];

// Extra sample items with imageUrl for dashboard visuals
const extraItems = [
    {
        name: 'Berry Chia Pudding',
        description: 'Chia seeds soaked in almond milk topped with mixed berries',
        price: 150,
        nutrition: { calories: 220, protein: 6, carbs: 28, fats: 9, fiber: 8 },
        category: 'breakfast',
        cuisineType: 'continental',
        dietaryTags: ['vegetarian', 'gluten_free'],
        restaurant: { name: 'Healthy Start', address: 'Delhi', phone: '+91-9000000001' },
        preparationTime: '5 mins', servingSize: '1 cup', spiceLevel: 'mild', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Quinoa Fruit Salad',
        description: 'Quinoa mixed with seasonal fruits and mint',
        price: 200,
        nutrition: { calories: 260, protein: 7, carbs: 46, fats: 4, fiber: 6 },
        category: 'breakfast', cuisineType: 'mediterranean', dietaryTags: ['vegan','gluten_free'],
        restaurant: { name: 'Fresh Bowls', address: 'Bangalore', phone: '+91-9000000002' },
        preparationTime: '8 mins', servingSize: '1 bowl', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1514516870920-4f9b8f3c7b0f?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Egg White Omelette',
        description: 'Fluffy egg white omelette with spinach and tomatoes',
        price: 140,
        nutrition: { calories: 180, protein: 20, carbs: 4, fats: 8 },
        category: 'breakfast', cuisineType: 'continental', dietaryTags: ['high_protein'],
        restaurant: { name: 'Protein Corner', address: 'Mumbai', phone: '+91-9000000003' },
        preparationTime: '6 mins', servingSize: '1 plate', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Turkey Wrap',
        description: 'Whole wheat wrap with roasted turkey and salad',
        price: 260,
        nutrition: { calories: 340, protein: 28, carbs: 38, fats: 10 },
        category: 'lunch', cuisineType: 'american', dietaryTags: ['low_carb'],
        restaurant: { name: 'Wrap It Up', address: 'Chennai', phone: '+91-9000000004' },
        preparationTime: '10 mins', servingSize: '1 wrap', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1543353071-087092ec393f?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Tofu Stir Fry',
        description: 'Tofu with mixed vegetables in a light soy glaze',
        price: 300,
        nutrition: { calories: 360, protein: 20, carbs: 34, fats: 14 },
        category: 'lunch', cuisineType: 'asian', dietaryTags: ['vegan'],
        restaurant: { name: 'Stir Fresh', address: 'Kolkata', phone: '+91-9000000005' },
        preparationTime: '12 mins', servingSize: '1 plate', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Grilled Veg Sandwich',
        description: 'Grilled seasonal vegetables with pesto on multigrain',
        price: 190,
        nutrition: { calories: 320, protein: 10, carbs: 40, fats: 12 },
        category: 'snacks', cuisineType: 'continental', dietaryTags: ['vegetarian'],
        restaurant: { name: 'Sandwich Hub', address: 'Pune', phone: '+91-9000000006' },
        preparationTime: '7 mins', servingSize: '1 sandwich', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Mango Salsa Fish',
        description: 'Pan-seared fish topped with fresh mango salsa',
        price: 420,
        nutrition: { calories: 420, protein: 36, carbs: 14, fats: 18 },
        category: 'dinner', cuisineType: 'continental', dietaryTags: ['high_protein'],
        restaurant: { name: 'Sea Flavors', address: 'Goa', phone: '+91-9000000007' },
        preparationTime: '20 mins', servingSize: '1 fillet', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Lentil Soup',
        description: 'Comforting lentil soup with carrots and herbs',
        price: 130,
        nutrition: { calories: 200, protein: 12, carbs: 28, fats: 4 },
        category: 'dinner', cuisineType: 'indian', dietaryTags: ['vegan','gluten_free'],
        restaurant: { name: 'Soup & Co', address: 'Delhi', phone: '+91-9000000008' },
        preparationTime: '15 mins', servingSize: '1 bowl', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Chocolate Avocado Mousse',
        description: 'Creamy chocolate mousse made with avocado and cocoa',
        price: 160,
        nutrition: { calories: 240, protein: 4, carbs: 22, fats: 16 },
        category: 'desserts', cuisineType: 'continental', dietaryTags: ['vegetarian'],
        restaurant: { name: 'Sweet Tooth', address: 'Hyderabad', phone: '+91-9000000009' },
        preparationTime: '10 mins', servingSize: '1 cup', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1505250469679-203ad9ced0cb?w=800&auto=format&fit=crop&q=80'
    },
    {
        name: 'Iced Matcha Latte',
        description: 'Chilled matcha with almond milk and a hint of vanilla',
        price: 140,
        nutrition: { calories: 120, protein: 2, carbs: 18, fats: 4 },
        category: 'drinks', cuisineType: 'japanese', dietaryTags: ['vegetarian'],
        restaurant: { name: 'Tea & More', address: 'Bangalore', phone: '+91-9000000010' },
        preparationTime: '3 mins', servingSize: '350ml', availability: true, isActive: true,
        imageUrl: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800&auto=format&fit=crop&q=80'
    }
];

// append extra items to sampleFoodItems
sampleFoodItems.push(...extraItems);

// Function to seed the database
const seedDatabase = async () => {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/diet-dash', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('Connected to MongoDB');

        // Clear existing food items
        await FoodItem.deleteMany({});
        console.log('Cleared existing food items');

        // Insert sample food items
        const insertedItems = await FoodItem.insertMany(sampleFoodItems);
        console.log(`Inserted ${insertedItems.length} food items`);

        // Create sample admin user if not exists
        const adminExists = await User.findOne({ email: 'admin@dietdash.com' });
        if (!adminExists) {
            const adminUser = new User({
                username: 'admin',
                email: 'admin@dietdash.com',
                password: 'admin123', // This will be hashed by the pre-save middleware
                role: 'admin'
            });
            await adminUser.save();
            console.log('Created admin user: admin@dietdash.com / admin123');
        }

        // Create sample regular user if not exists
        const userExists = await User.findOne({ email: 'user@dietdash.com' });
        if (!userExists) {
            const regularUser = new User({
                username: 'testuser',
                email: 'user@dietdash.com',
                password: 'user123', // This will be hashed by the pre-save middleware
                role: 'user',
                profile: {
                    height: 175,
                    weight: 70,
                    age: 25,
                    gender: 'male',
                    activityLevel: 'moderate',
                    healthGoal: 'muscle_gain',
                    dietaryPreferences: ['vegetarian'],
                    allergies: []
                },
                profileCompleted: true
            });
            
            // Calculate nutrition for the sample user
            regularUser.calculateNutrition();
            
            await regularUser.save();
            console.log('Created test user: user@dietdash.com / user123');
        }

        console.log('Database seeding completed successfully!');
        process.exit(0);

    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

// Run the seeder
if (require.main === module) {
    require('dotenv').config();
    seedDatabase();
}

module.exports = { seedDatabase, sampleFoodItems };