// models/Wastage.js
const mongoose = require('mongoose');

const wastageSchema = new mongoose.Schema({
  type: { type: String, enum: ['DISH', 'RAW_INGREDIENT'], default: 'DISH' },
  item_code: String,
  item_name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'portions' },
  total_loss_cost: { type: Number, default: 0 },
  reason: { 
    type: String, 
    enum: ['Unsold / Expired', 'Burnt / Kitchen Error', 'Tasting / Staff Meal', 'Spoilage'], 
    default: 'Unsold / Expired' 
  },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Wastage', wastageSchema);