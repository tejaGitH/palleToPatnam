// testOrder.js
const mongoose = require('mongoose');
const { processBillAndBurnStock } = require('./controllers/inventoryController');

// 1. Connect to your Database (Replace with your actual DB URI if needed)
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/restaurant_db');
    console.log('MongoDB Connected for Testing...');
  } catch (err) {
    console.error('DB Connection Error:', err);
  }
};

// 2. Mock Order Payload
const mockIncomingBill = {
  bill_number: "INV-1838",
  total_amount: 540.00,
  items: [
    { item_code: "101", item_name: "Chicken Biriyani Single", qty: 2 },
    { item_code: "9", item_name: "Mysore Bonda (4)", qty: 1 }
  ]
};

// 3. Run Test
const runTest = async () => {
  await connectDB();
  console.log('Simulating incoming bill...');
  
  await processBillAndBurnStock(mockIncomingBill.items);
  
  console.log('Test Complete!');
  process.exit();
};

runTest();