const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
  item_code: { type: String, required: true, unique: true },
  dish_name: { type: String, required: true },
  category: { type: String, default: 'General' },
  price: { type: Number, default: 0 },
  recipe: [
    {
      ingredient_name: { type: String, required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, default: 'grams' },
      yield_percentage: { type: Number, default: 100 }
    }
  ]
}, { timestamps: true, strict: false });

module.exports = mongoose.models.Dish || mongoose.model('Dish', dishSchema);