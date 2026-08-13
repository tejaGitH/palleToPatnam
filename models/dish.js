const mongoose = require('mongoose');

const dishSchema = new mongoose.Schema({
  item_code: { type: String, required: true, unique: true },
  dish_name: { type: String, required: true },
  category: { type: String, required: true },
  price: { type: Number, required: true },
  
  // Bill of Materials (BOM)
  recipe: [
    {
      ingredient_name: { type: String, required: true }, // e.g. "Chicken"
      quantity: { type: Number, required: true },        // e.g. 100
      unit: { type: String, default: 'grams' }           // e.g. "grams" or "ml"
    }
  ]
});

module.exports = mongoose.model('Dish', dishSchema);