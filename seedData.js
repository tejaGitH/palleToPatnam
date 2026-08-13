// seedData.js
const mongoose = require('mongoose');
const Dish = require('./models/Dish');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/restaurant_db');
    console.log('MongoDB Connected for Seeding...');
  } catch (err) {
    console.error('DB Connection Error:', err);
  }
};

const initialDishes = [
  {
    item_code: "101",
    dish_name: "Chicken Biriyani Single",
    category: "Biriyani's and Pulav's",
    price: 150,
    recipe: [
      { ingredient_name: "Raw Chicken", quantity: 100, unit: "grams" },
      { ingredient_name: "Biryani Rice", quantity: 150, unit: "grams" }
    ]
  },
  {
    item_code: "9",
    dish_name: "Mysore Bonda (4)",
    category: "Idly and Vada",
    price: 60,
    recipe: [
      { ingredient_name: "Besan", quantity: 125, unit: "grams" },
      { ingredient_name: "Curd", quantity: 20.5, unit: "ml" },
      { ingredient_name: "Milk", quantity: 8, unit: "ml" }
    ]
  }
];

const seedDB = async () => {
  await connectDB();
  
  // Clear old test data and insert new dishes
  await Dish.deleteMany({});
  await Dish.insertMany(initialDishes);
  
  console.log('Successfully Seeded Menu & Recipes into MongoDB!');
  process.exit();
};

seedDB();



