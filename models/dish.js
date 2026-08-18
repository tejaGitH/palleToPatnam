// models/Dish.js
const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
  item_code: { type: String, required: true, unique: true },
  dish_name: { type: String, required: true },
  category: String,
  price: Number,
  recipe: [
    {
      ingredient_name: { type: String, required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, default: 'grams' },
      yield_percentage: { type: Number, default: 100 } // e.g., 80 for chicken with bone/prep loss
    }
  ]
});

module.exports = mongoose.model('Dish', dishSchema);