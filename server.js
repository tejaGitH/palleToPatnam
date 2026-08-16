// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
// In server.js
const Dish = require('./models/dish'); // matching exact file case

const { processBillAndBurnStock } = require('./controllers/inventoryController');

const Inventory = require('./models/inventory');
const Expense = require('./models/expense');
const PurchaseOrder = require('./models/purchaseOrder');
const { convertToBaseUnit } = require('./utils/unitConverter');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Connect MongoDB Atlas
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://dbAdmin:dbAdmin@msmewebsitedb.a2hqi3q.mongodb.net/restaurant_db?retryWrites=true&w=majority&appName=msmeWebsiteDb";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected to Atlas'))
  .catch(err => console.error('❌ DB Error:', err.message));

// 2. Order Schema (Petpooja Live Sales)
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

// Helper for date filtering
function getDateRange(timeframe, startDate, endDate) {
  const now = new Date();
  let start, end;

  if (timeframe === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  } else if (timeframe === 'week') {
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    end = now;
  } else if (timeframe === 'month') {
    start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    end = now;
  } else if (timeframe === 'custom' && startDate && endDate) {
    start = new Date(startDate + "T00:00:00");
    end = new Date(endDate + "T23:59:59.999");
  } else {
    // Default today
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }
  return { start, end };
}

// --- DISH / RECIPE ROUTES ---
app.post('/api/dishes', async (req, res) => {
  try {
    const { item_code, dish_name, category, price, recipe } = req.body;
    const updatedDish = await Dish.findOneAndUpdate(
      { item_code: String(item_code) },
      { dish_name, category, price: Number(price), recipe },
      { upsert: true, new: true }
    );
    res.status(201).json({ status: "Success", message: "Recipe saved successfully!", dish: updatedDish });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dishes', async (req, res) => {
  try {
    const dishes = await Dish.find({});
    res.json(dishes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PETPOOJA LIVE WEBHOOK / STOCK BURN ---
app.post('/api/webhook/order', async (req, res) => {
  try {
    const payload = req.body;

    if (payload.event === "orderdetails" && payload.properties) {
      const props = payload.properties;
      const orderInfo = props.Order || {};
      const restInfo = props.Restaurant || {};
      const orderItems = props.OrderItem || [];

      const formattedItems = orderItems.map(item => ({
        item_code: String(item.itemcode || item.itemid),
        item_name: item.name,
        qty: Number(item.quantity) || 1
      }));

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

      if (formattedItems.length > 0) {
        await processBillAndBurnStock(formattedItems);
      }

      return res.status(200).json({ status: "Success", message: "Petpooja order processed & stock burned!" });
    } 
    else if (req.body.bill_number) {
      const formattedItems = (req.body.items || []).map(i => ({
        item_code: String(i.item_code),
        item_name: i.item_name,
        qty: Number(i.qty) || 1
      }));

      const mockOrder = new Order({
        customer_invoice_id: req.body.bill_number,
        total_amount: req.body.total_amount,
        discount_total: req.body.discount || 0,
        order_from: "Manual POS Test",
        items: formattedItems
      });
      await mockOrder.save();

      if (formattedItems.length > 0) {
        await processBillAndBurnStock(formattedItems);
      }
      return res.status(200).json({ status: "Success", message: "Manual order processed & stock burned!" });
    }

    res.status(400).json({ status: "Ignored", message: "Invalid payload format" });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ status: "Error", message: error.message });
  }
});

// --- PROCUREMENT & PURCHASE ORDERS ---

// 1. Create Purchase Indent (Shop Order)
app.post('/api/purchases', async (req, res) => {
  try {
    const { vendor_name, vendor_contact, items, notes } = req.body;
    const count = await PurchaseOrder.countDocuments();
    const po_number = `PO-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

    let grand_total = 0;
    const computedItems = items.map(item => {
      const total = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
      grand_total += total;
      return {
        ingredient_name: item.ingredient_name.trim(),
        quantity: Number(item.quantity),
        unit: item.unit || 'kg',
        unit_price: Number(item.unit_price) || 0,
        total_price: total
      };
    });

    const newPO = new PurchaseOrder({
      po_number,
      vendor_name,
      vendor_contact,
      items: computedItems,
      grand_total,
      notes,
      status: 'ORDERED'
    });

    await newPO.save();
    res.status(201).json({ status: "Success", message: "Purchase order created!", purchaseOrder: newPO });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Inward / Receive PO (Put to stock & log expense)
app.post('/api/purchases/:id/inward', async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: "PO not found" });
    if (po.status === 'RECEIVED') return res.status(400).json({ error: "Already inwarded into inventory" });

    // Inward each item
    for (const item of po.items) {
      const { baseQty, baseUnit } = convertToBaseUnit(item.quantity, item.unit);
      const costPerBaseUnit = baseQty > 0 ? (item.total_price / baseQty) : 0;

      await Inventory.findOneAndUpdate(
        { ingredient_name: new RegExp(`^${item.ingredient_name.trim()}$`, 'i') },
        { 
          $inc: { current_stock: baseQty },
          $set: { unit: baseUnit, cost_per_unit: costPerBaseUnit },
          $setOnInsert: { ingredient_name: item.ingredient_name.trim() }
        },
        { upsert: true, new: true }
      );
    }

    // Auto-log Expense for P&L
    const newExpense = new Expense({
      category: "Raw Materials",
      amount: po.grand_total,
      description: `Inwarded PO #${po.po_number} from ${po.vendor_name}`,
      paid_by: po.vendor_name,
      date: new Date()
    });
    await newExpense.save();

    po.status = 'RECEIVED';
    po.received_at = new Date();
    await po.save();

    res.json({ status: "Success", message: "Stock inwarded and expense logged!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Fetch POs with optional date filter
app.get('/api/purchases', async (req, res) => {
  try {
    const { timeframe, startDate, endDate } = req.query;
    let filter = {};

    if (timeframe && timeframe !== 'all') {
      const { start, end } = getDateRange(timeframe, startDate, endDate);
      filter.created_at = { $gte: start, $lte: end };
    }

    const orders = await PurchaseOrder.find(filter).sort({ created_at: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Financials & Analytics with timeframe filters
app.get('/api/financials', async (req, res) => {
  try {
    const { timeframe, startDate, endDate } = req.query;
    const { start, end } = getDateRange(timeframe, startDate, endDate);

    const orders = await Order.find({ created_at: { $gte: start, $lte: end } });
    const expenses = await Expense.find({ date: { $gte: start, $lte: end } });
    const pos = await PurchaseOrder.find({ created_at: { $gte: start, $lte: end } });

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalPurchases = pos.reduce((sum, p) => sum + (p.grand_total || 0), 0);

    res.json({
      timeframe: timeframe || 'today',
      startDate: start,
      endDate: end,
      totalRevenue,
      totalExpenses,
      totalPurchases,
      totalBills: orders.length,
      netProfit: totalRevenue - totalExpenses
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Inventory
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