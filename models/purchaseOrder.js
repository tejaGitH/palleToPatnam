// models/PurchaseOrder.js
const mongoose = require('mongoose');

const purchaseOrderItemSchema = new mongoose.Schema({
  ingredient_name: { type: String, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: 'kg' }, // kg, ltr, units, grams, ml
  unit_price: { type: Number, default: 0 },
  total_price: { type: Number, default: 0 }
});

const purchaseOrderSchema = new mongoose.Schema({
  po_number: { type: String, unique: true },
  vendor_name: { type: String, required: true },
  vendor_contact: { type: String, default: '' },
  items: [purchaseOrderItemSchema],
  grand_total: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['ORDERED', 'RECEIVED'], 
    default: 'ORDERED' 
  },
  notes: { type: String, default: '' },
  created_at: { type: Date, default: Date.now },
  received_at: { type: Date }
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);