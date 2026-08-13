// models/Inventory.js
const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  ingredient_name: { type: String, required: true, unique: true },
  current_stock: { type: Number, required: true, default: 0 },
  unit: { type: String, required: true, default: 'grams' },
  cost_per_unit: { type: Number, default: 0 } // e.g., 0.22 means ₹0.22 per gram (₹220/kg)
});

module.exports = mongoose.model('Inventory', inventorySchema);