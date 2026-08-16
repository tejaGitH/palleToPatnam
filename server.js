// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { processBillAndBurnStock } = require('./controllers/inventoryController');
const Inventory = require('./models/Inventory');

const Expense = require('./models/Expense');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Connect MongoDB
// 1. Connect MongoDB
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://dbAdmin:dbAdmin@msmewebsitedb.a2hqi3q.mongodb.net/?appName=msmeWebsiteDb";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected to Atlas'))
  .catch(err => console.error('❌ DB Error:', err.message));

// 2. Define Order Schema matching Petpooja's payload
const orderSchema = new mongoose.Schema({
  order_id: String,
  customer_invoice_id: String,
  rest_id: String,
  res_name: String,
  order_type: String,
  order_from: String,
  payment_type: String,
  total_amount: Number,
  discount_total: Number,
  items: Array,
  created_at: { type: Date, default: Date.now }
});
const Order = mongoose.model('Order', orderSchema);

// 3. Official Petpooja Global API Webhook Receiver
app.post('/api/webhook/order', async (req, res) => {
  try {
    const payload = req.body;

    // Check if payload matches Petpooja Global API structure
    if (payload.event === "orderdetails" && payload.properties) {
      const props = payload.properties;
      const orderInfo = props.Order || {};
      const restInfo = props.Restaurant || {};
      const orderItems = props.OrderItem || [];

      console.log(`\n🧾 [LIVE PETPOOJA BILL] Invoice #${orderInfo.customer_invoice_id} | Total: ₹${orderInfo.total} | Source: ${orderInfo.order_from}`);

      // Map Petpooja items to our stock burn format
      const formattedItems = orderItems.map(item => ({
        item_code: item.itemcode || item.itemid,
        item_name: item.name,
        qty: item.quantity
      }));

      // Save Order to Database for Analytics
      const newOrder = new Order({
        order_id: orderInfo.orderID,
        customer_invoice_id: orderInfo.customer_invoice_id,
        rest_id: restInfo.restID,
        res_name: restInfo.res_name,
        order_type: orderInfo.order_type,
        order_from: orderInfo.order_from,
        payment_type: orderInfo.payment_type,
        total_amount: orderInfo.total,
        discount_total: orderInfo.discount_total || 0,
        items: formattedItems
      });
      await newOrder.save();

      // Trigger Recipe Stock Burn
      if (formattedItems.length > 0) {
        await processBillAndBurnStock(formattedItems);
      }

      return res.status(200).json({ status: "Success", message: "Petpooja order processed & stock burned!" });
    } 
    
    // Fallback for custom dashboard manual test bills
    else if (req.body.bill_number) {
      const mockOrder = new Order({
        customer_invoice_id: req.body.bill_number,
        total_amount: req.body.total_amount,
        discount_total: req.body.discount || 0,
        order_from: "POS",
        items: req.body.items || []
      });
      await mockOrder.save();

      if (req.body.items) {
        await processBillAndBurnStock(req.body.items);
      }
      return res.status(200).json({ status: "Success", message: "Test order processed & stock burned!" });
    }

    res.status(400).json({ status: "Ignored", message: "Invalid payload format" });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ status: "Error", message: error.message });
  }
});

// 4. API Endpoint for Live Owner Analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const orders = await Order.find({});
    
    const totalSales = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalBills = orders.length;
    const totalDiscounts = orders.reduce((sum, o) => sum + (o.discount_total || 0), 0);
    const avgOrderValue = totalBills > 0 ? (totalSales / totalBills).toFixed(2) : 0;

    res.json({
      totalSales,
      totalBills,
      totalDiscounts,
      avgOrderValue
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// 1. Add Daily Expense Route
app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, description, paid_by } = req.body;
    const newExpense = new Expense({ category, amount, description, paid_by });
    await newExpense.save();
    res.status(200).json({ status: "Success", message: "Expense logged successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Full P&L Analytics Route
app.get('/api/financials', async (req, res) => {
  try {
    const orders = await Order.find({});
    const expenses = await Expense.find({});

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = totalRevenue - totalExpenses;

    res.json({
      totalRevenue,
      totalExpenses,
      netProfit,
      expenseBreakdown: expenses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Inventory API Endpoint
app.get('/api/inventory', async (req, res) => {
  try {
    const stock = await Inventory.find({});
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));