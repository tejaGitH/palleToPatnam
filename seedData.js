// seedData.js
const mongoose = require('mongoose');
const Dish = require('./models/Dish');

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://dbAdmin:dbAdmin@msmewebsitedb.a2hqi3q.mongodb.net/restaurant_db?retryWrites=true&w=majority&appName=msmeWebsiteDb";

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB Connected to Atlas for Seeding...');
  } catch (err) {
    console.error('❌ DB Connection Error:', err.message);
    process.exit(1);
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
  try {
    await Dish.deleteMany({});
    await Dish.insertMany(initialDishes);
    console.log('✅ Successfully Seeded Menu & Recipes into Atlas DB!');
  } catch (err) {
    console.error('❌ Seeding Error:', err.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

seedDB();