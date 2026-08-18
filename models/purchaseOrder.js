// models/PurchaseOrder.js
const mongoose = require('mongoose');

const purchaseOrderSchema = new mongoose.Schema({
  po_number: { type: String, required: true },
  vendor_name: { type: String, required: true },
  vendor_contact: String,
  items: [
    {
      ingredient_name: { type: String, required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, default: 'kg' },
      unit_price: { type: Number, required: true },
      total_price: { type: Number, required: true }
    }
  ],
  grand_total: { type: Number, required: true },
  status: { type: String, enum: ['ORDERED', 'RECEIVED', 'CANCELLED'], default: 'ORDERED' },
  notes: String,
  received_at: Date,
  created_at: { type: Date, default: Date.now }
}, { strict: false });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);