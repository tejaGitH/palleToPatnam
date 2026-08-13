// models/Expense.js
const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  category: { 
    type: String, 
    required: true, 
    enum: ['Raw Materials', 'Gas & Utilities', 'Staff Wages/Advance', 'Maintenance', 'Packaging', 'Other'] 
  },
  amount: { type: Number, required: true },
  description: { type: String, default: '' },
  paid_by: { type: String, default: 'Cash' }, // Cash, UPI, Bank Transfer
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Expense', expenseSchema);