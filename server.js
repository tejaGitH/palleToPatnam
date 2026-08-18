// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const { processBillAndBurnStock } = require('./controllers/inventoryController');
const Dish = require('./models/dish');
const Inventory = require('./models/inventory');
const Expense = require('./models/expense');
const PurchaseOrder = require('./models/purchaseOrder');
const Wastage = require('./models/wastage');
const { convertToBaseUnit } = require('./utils/unitConverter');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://dbAdmin:dbAdmin@msmewebsitedb.a2hqi3q.mongodb.net/restaurant_db?retryWrites=true&w=majority&appName=msmeWebsiteDb";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected to Atlas'))
  .catch(err => console.error('❌ DB Error:', err.message));

// Order Schema with flexible timestamps
const orderSchema = new mongoose.Schema({
  order_id: String,
  customer_invoice_id: String,
  rest_id: String,
  res_name: String,
  order_type: String,
  order_from: String,
  payment_type: String,
  total_amount: { type: Number, default: 0 },
  discount_total: { type: Number, default: 0 },
  items: Array,
  cogs_cost: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now }
}, { strict: false });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// Precise IST Timezone Range Calculator
function getDateRange(timeframe, startDate, endDate) {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  
  const y = istNow.getUTCFullYear();
  const m = istNow.getUTCMonth();
  const d = istNow.getUTCDate();

  let start, end;

  if (timeframe === 'today') {
    start = new Date(Date.UTC(y, m, d, 0, 0, 0) - istOffset);
    end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - istOffset);
  } else if (timeframe === 'yesterday') {
    start = new Date(Date.UTC(y, m, d - 1, 0, 0, 0) - istOffset);
    end = new Date(Date.UTC(y, m, d - 1, 23, 59, 59, 999) - istOffset);
  } else if (timeframe === 'week') {
    start = new Date(Date.UTC(y, m, d - 6, 0, 0, 0) - istOffset);
    end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - istOffset);
  } else if (timeframe === 'month') {
    start = new Date(Date.UTC(y, m, d - 29, 0, 0, 0) - istOffset);
    end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - istOffset);
  } else if (timeframe === 'custom' && startDate && endDate) {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    start = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0) - istOffset);
    end = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999) - istOffset);
  } else {
    start = new Date(0);
    end = new Date(Date.UTC(y + 1, m, d) - istOffset);
  }
  return { start, end };
}

// ---------------- DISHES & RECIPES ----------------
app.post('/api/dishes', async (req, res) => {
  try {
    const { item_code, dish_name, category, price, recipe } = req.body;
    
    if (!item_code || !dish_name) {
      return res.status(400).json({ error: "Item Code and Dish Name are required." });
    }

    const cleanRecipe = (recipe || []).map(r => ({
      ingredient_name: String(r.ingredient_name || '').trim(),
      quantity: Number(r.quantity) || 0,
      unit: r.unit || 'grams',
      yield_percentage: Number(r.yield_percentage) || 100
    }));

    const updatedDish = await Dish.findOneAndUpdate(
      { item_code: String(item_code).trim() },
      { 
        dish_name: String(dish_name).trim(), 
        category: category || 'General', 
        price: Number(price) || 0, 
        recipe: cleanRecipe 
      },
      { upsert: true, new: true, runValidators: false }
    );
    res.status(201).json({ status: "Success", dish: updatedDish });
  } catch (error) {
    console.error("Dish Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dishes', async (req, res) => {
  try {
    const dishes = await Dish.find({}).sort({ dish_name: 1 });
    res.json(dishes);
  } catch (error) {
    console.error("Dish Fetch Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- ORDERS & BILL SIMULATOR (BULLETPROOF COGS) ----------------
app.post('/api/webhook/order', async (req, res) => {
  try {
    const payload = req.body;
    let formattedItems = [];
    let orderInfo = {};
    let orderDate = new Date();

    if (payload.event === "orderdetails" && payload.properties) {
      const props = payload.properties;
      orderInfo = props.Order || {};
      const orderItems = props.OrderItem || [];
      formattedItems = orderItems.map(item => ({
        item_code: String(item.itemcode || item.itemid || ''),
        item_name: item.name || 'Dish',
        qty: Number(item.quantity) || 1
      }));
    } else if (req.body.bill_number) {
      formattedItems = (req.body.items || []).map(i => ({
        item_code: String(i.item_code || ''),
        item_name: i.item_name || 'Dish',
        qty: Number(i.qty) || 1
      }));
      orderInfo = {
        customer_invoice_id: req.body.bill_number,
        total: Number(req.body.total_amount) || 0,
        discount_total: Number(req.body.discount) || 0,
        order_from: "Manual POS Test"
      };
      if (req.body.order_date) {
        orderDate = new Date(req.body.order_date);
      }
    }

    // Safe COGS calculation with fallback
    let orderCOGS = 0;
    try {
      const dishes = await Dish.find({});
      const inventories = await Inventory.find({});
      const invMap = {};
      inventories.forEach(i => {
        if (i && i.ingredient_name) {
          invMap[i.ingredient_name.trim().toLowerCase()] = Number(i.cost_per_unit) || 0;
        }
      });

      for (const item of formattedItems) {
        const dish = dishes.find(d => String(d.item_code).trim() === String(item.item_code).trim());
        if (dish && Array.isArray(dish.recipe)) {
          dish.recipe.forEach(rec => {
            if (rec && rec.ingredient_name) {
              const ingKey = rec.ingredient_name.trim().toLowerCase();
              const nominal = (Number(rec.quantity) || 0) * (Number(item.qty) || 1);
              const yieldFactor = (Number(rec.yield_percentage) || 100) / 100;
              const actual = nominal / (yieldFactor > 0 ? yieldFactor : 1);
              const { baseQty } = convertToBaseUnit(actual, rec.unit || 'grams');
              const unitCost = invMap[ingKey] || 0;
              orderCOGS += (baseQty * unitCost);
            }
          });
        }
      }
    } catch (cogsErr) {
      console.warn("COGS calculation warning:", cogsErr.message);
    }

    const newOrder = new Order({
      customer_invoice_id: orderInfo.customer_invoice_id || `BILL-${Date.now()}`,
      total_amount: Number(orderInfo.total) || 0,
      discount_total: Number(orderInfo.discount_total) || 0,
      order_from: orderInfo.order_from || "Petpooja",
      items: formattedItems,
      cogs_cost: Number(orderCOGS.toFixed(2)) || 0,
      created_at: orderDate
    });
    await newOrder.save();

    if (formattedItems.length > 0) {
      await processBillAndBurnStock(formattedItems);
    }

    return res.status(200).json({ status: "Success", message: "Order processed, stock burned & COGS recorded!" });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ status: "Error", message: error.message });
  }
});

// ---------------- PURCHASES & INWARDS (Exact Moving WAC) ----------------
app.post('/api/purchases', async (req, res) => {
  try {
    const { vendor_name, vendor_contact, items, notes, purchase_date } = req.body;
    const count = await PurchaseOrder.countDocuments();
    const po_number = `PO-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;

    let grand_total = 0;
    const computedItems = (items || []).map(item => {
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

    let targetDate = new Date();
    if (purchase_date) {
      const [py, pm, pd] = purchase_date.split('-').map(Number);
      targetDate = new Date(Date.UTC(py, pm - 1, pd, 12, 0, 0));
    }

    const newPO = new PurchaseOrder({
      po_number,
      vendor_name,
      vendor_contact,
      items: computedItems,
      grand_total,
      notes,
      status: 'ORDERED',
      created_at: targetDate
    });

    await newPO.save();
    res.status(201).json({ status: "Success", purchaseOrder: newPO });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/purchases/:id/inward', async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: "PO not found" });
    if (po.status === 'RECEIVED') return res.status(400).json({ error: "Already inwarded" });

    const inwardDate = po.created_at || new Date();

    for (const item of po.items) {
      const { baseQty, baseUnit } = convertToBaseUnit(item.quantity, item.unit);
      const newCostPerBaseUnit = baseQty > 0 ? (item.total_price / baseQty) : 0;

      const existing = await Inventory.findOne({ 
        ingredient_name: new RegExp(`^${item.ingredient_name.trim()}$`, 'i') 
      });

      let finalCostPerBase = newCostPerBaseUnit;
      let lastPurchasedPrice = Number(item.unit_price);

      // (Physical Remaining Stock * Old Cost + New Purchased Qty * New Cost) / (Remaining Stock + New Qty)
      if (existing && existing.current_stock > 0) {
        const oldTotalVal = existing.current_stock * (existing.cost_per_unit || 0);
        const newTotalVal = baseQty * newCostPerBaseUnit;
        finalCostPerBase = (oldTotalVal + newTotalVal) / (existing.current_stock + baseQty);
      }

      await Inventory.findOneAndUpdate(
        { ingredient_name: new RegExp(`^${item.ingredient_name.trim()}$`, 'i') },
        { 
          $inc: { current_stock: baseQty },
          $set: { 
            unit: baseUnit, 
            cost_per_unit: Number(finalCostPerBase.toFixed(6)),
            last_purchased_rate: lastPurchasedPrice,
            last_purchased_unit: item.unit,
            last_purchased_date: inwardDate
          },
          $setOnInsert: { ingredient_name: item.ingredient_name.trim() }
        },
        { upsert: true, new: true }
      );
    }

    const newExpense = new Expense({
      category: "Raw Materials",
      amount: po.grand_total,
      description: `Inwarded PO #${po.po_number} from ${po.vendor_name}`,
      paid_by: po.vendor_name,
      date: inwardDate
    });
    await newExpense.save();

    po.status = 'RECEIVED';
    po.received_at = inwardDate;
    await po.save();

    res.json({ status: "Success", message: "Stock inwarded with Moving Weighted Average Cost!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/purchases', async (req, res) => {
  try {
    const { timeframe, startDate, endDate } = req.query;
    let filter = {};
    if (timeframe && timeframe !== 'all') {
      const { start, end } = getDateRange(timeframe, startDate, endDate);
      filter.$or = [
        { created_at: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      ];
    }
    const orders = await PurchaseOrder.find(filter).sort({ created_at: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------- WASTAGE ----------------
app.post('/api/wastage', async (req, res) => {
  try {
    const { item_code, quantity, reason, waste_date } = req.body;
    const dish = await Dish.findOne({ item_code: String(item_code) });
    if (!dish) return res.status(404).json({ error: "Dish not found" });

    let totalLoss = 0;
    const qty = Number(quantity) || 1;

    for (const ing of (dish.recipe || [])) {
      const nominalQty = ing.quantity * qty;
      const yieldFactor = (ing.yield_percentage || 100) / 100;
      const actualRawRequired = nominalQty / (yieldFactor > 0 ? yieldFactor : 1);

      const { baseQty } = convertToBaseUnit(actualRawRequired, ing.unit);
      
      const inv = await Inventory.findOneAndUpdate(
        { ingredient_name: new RegExp(`^${ing.ingredient_name.trim()}$`, 'i') },
        { $inc: { current_stock: -baseQty } },
        { new: true }
      );

      if (inv && inv.cost_per_unit) {
        totalLoss += baseQty * inv.cost_per_unit;
      }
    }

    const lostSellingRevenue = (dish.price || 0) * qty;
    const effectiveDate = waste_date ? new Date(waste_date) : new Date();

    const wastageEntry = new Wastage({
      type: 'DISH',
      item_code: dish.item_code,
      item_name: dish.dish_name,
      quantity: qty,
      total_loss_cost: Number(totalLoss.toFixed(2)),
      potential_revenue_lost: lostSellingRevenue,
      reason: reason || 'Unsold / Expired',
      date: effectiveDate
    });
    await wastageEntry.save();

    res.status(201).json({ 
      status: "Success", 
      message: `Logged ${qty}x ${dish.dish_name} as waste. Stock adjusted!`, 
      totalLoss: Number(totalLoss.toFixed(2)),
      lostSellingRevenue
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wastage', async (req, res) => {
  try {
    const { timeframe, startDate, endDate } = req.query;
    let filter = {};
    if (timeframe && timeframe !== 'all') {
      const { start, end } = getDateRange(timeframe, startDate, endDate);
      filter.date = { $gte: start, $lte: end };
    }
    const wastes = await Wastage.find(filter).sort({ date: -1 });
    res.json(wastes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------- FINANCIALS (ROBUST DATE MATCHING) ----------------
app.get('/api/financials', async (req, res) => {
  try {
    const { timeframe, startDate, endDate } = req.query;
    const { start, end } = getDateRange(timeframe, startDate, endDate);

    // Dual-field query ensures orders are always found
    const orders = await Order.find({
      $or: [
        { created_at: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      ]
    });

    const pos = await PurchaseOrder.find({
      $or: [
        { created_at: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      ],
      status: 'RECEIVED'
    });

    const wastes = await Wastage.find({ date: { $gte: start, $lte: end } });
    const stock = await Inventory.find({});
    const dishes = await Dish.find({});

    const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const totalPurchases = pos.reduce((sum, p) => sum + (Number(p.grand_total) || 0), 0);
    const totalWastageCost = wastes.reduce((sum, w) => sum + (Number(w.total_loss_cost) || 0), 0);

    // Compute COGS: Use stored cogs_cost or dynamically calculate
    const invMap = {};
    stock.forEach(i => invMap[i.ingredient_name.trim().toLowerCase()] = i.cost_per_unit || 0);

    let totalCOGS = 0;
    orders.forEach(o => {
      if (o.cogs_cost && o.cogs_cost > 0) {
        totalCOGS += o.cogs_cost;
      } else if (Array.isArray(o.items)) {
        o.items.forEach(item => {
          const dish = dishes.find(d => String(d.item_code).trim() === String(item.item_code).trim());
          if (dish && Array.isArray(dish.recipe)) {
            dish.recipe.forEach(rec => {
              const ingKey = String(rec.ingredient_name || '').trim().toLowerCase();
              const nominal = (Number(rec.quantity) || 0) * (Number(item.qty) || 1);
              const yieldFactor = (Number(rec.yield_percentage) || 100) / 100;
              const actual = nominal / (yieldFactor > 0 ? yieldFactor : 1);
              const { baseQty } = convertToBaseUnit(actual, rec.unit || 'grams');
              const unitCost = invMap[ingKey] || 0;
              totalCOGS += (baseQty * unitCost);
            });
          }
        });
      }
    });

    // Inventory asset valuation (current physical stock * moving average cost)
    const inventoryAssetValue = stock.reduce((sum, item) => {
      const val = (item.current_stock > 0 ? item.current_stock : 0) * (item.cost_per_unit || 0);
      return sum + val;
    }, 0);

    const potentialWastageSales = wastes.reduce((sum, w) => {
      return sum + (w.potential_revenue_lost || (w.total_loss_cost * 2.5));
    }, 0);

    const potentialMaxRevenue = totalRevenue + potentialWastageSales;
    const realBusinessProfit = totalRevenue - totalCOGS - totalWastageCost;
    const netCashFlowProfit = totalRevenue - totalPurchases;

    res.json({
      timeframe: timeframe || 'today',
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalPurchases: Number(totalPurchases.toFixed(2)),
      totalCOGS: Number(totalCOGS.toFixed(2)),
      totalWastageCost: Number(totalWastageCost.toFixed(2)),
      inventoryAssetValue: Number(inventoryAssetValue.toFixed(2)),
      potentialWastageSales: Number(potentialWastageSales.toFixed(2)),
      potentialMaxRevenue: Number(potentialMaxRevenue.toFixed(2)),
      realBusinessProfit: Number(realBusinessProfit.toFixed(2)),
      netCashFlowProfit: Number(netCashFlowProfit.toFixed(2)),
      totalBills: orders.length,
      totalWasteEvents: wastes.length
    });
  } catch (error) {
    console.error("Financials Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ---------------- STOCK LEDGER ----------------
app.get('/api/inventory/ledger', async (req, res) => {
  try {
    const { timeframe, startDate, endDate } = req.query;
    const { start, end } = getDateRange(timeframe, startDate, endDate);

    const inventoryItems = await Inventory.find({});
    
    const posInRange = await PurchaseOrder.find({
      $or: [
        { created_at: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } },
        { received_at: { $gte: start, $lte: end } }
      ],
      status: 'RECEIVED'
    });

    const ordersInRange = await Order.find({
      $or: [
        { created_at: { $gte: start, $lte: end } },
        { createdAt: { $gte: start, $lte: end } }
      ]
    });

    const wastesInRange = await Wastage.find({ date: { $gte: start, $lte: end } });
    const dishes = await Dish.find({});

    const dishMap = {};
    dishes.forEach(d => dishMap[d.item_code] = d);

    const ingredientNames = new Set(inventoryItems.map(i => i.ingredient_name));
    posInRange.forEach(po => po.items.forEach(pi => ingredientNames.add(pi.ingredient_name)));

    const ledger = Array.from(ingredientNames).map(name => {
      const ingNameLower = name.trim().toLowerCase();
      const invMatch = inventoryItems.find(i => i.ingredient_name.trim().toLowerCase() === ingNameLower);

      let inwardedBase = 0;
      posInRange.forEach(po => {
        po.items.forEach(item => {
          if (item.ingredient_name.trim().toLowerCase() === ingNameLower) {
            const { baseQty } = convertToBaseUnit(item.quantity, item.unit);
            inwardedBase += baseQty;
          }
        });
      });

      let soldBase = 0;
      ordersInRange.forEach(ord => {
        (ord.items || []).forEach(ordItem => {
          const dish = dishMap[ordItem.item_code];
          if (dish && Array.isArray(dish.recipe)) {
            dish.recipe.forEach(rec => {
              if (rec.ingredient_name.trim().toLowerCase() === ingNameLower) {
                const nominal = (Number(rec.quantity) || 0) * (Number(ordItem.qty) || 1);
                const yieldFactor = (Number(rec.yield_percentage) || 100) / 100;
                const actual = nominal / (yieldFactor > 0 ? yieldFactor : 1);
                const { baseQty } = convertToBaseUnit(actual, rec.unit || 'grams');
                soldBase += baseQty;
              }
            });
          }
        });
      });

      let wastedBase = 0;
      wastesInRange.forEach(w => {
        const dish = dishMap[w.item_code];
        if (dish && Array.isArray(dish.recipe)) {
          dish.recipe.forEach(rec => {
            if (rec.ingredient_name.trim().toLowerCase() === ingNameLower) {
              const nominal = (Number(rec.quantity) || 0) * (Number(w.quantity) || 1);
              const yieldFactor = (Number(rec.yield_percentage) || 100) / 100;
              const actual = nominal / (yieldFactor > 0 ? yieldFactor : 1);
              const { baseQty } = convertToBaseUnit(actual, rec.unit || 'grams');
              wastedBase += baseQty;
            }
          });
        }
      });

      return {
        ingredient_name: name,
        base_unit: invMatch ? invMatch.unit : 'grams',
        inwarded_in_period: inwardedBase,
        sold_in_period: soldBase,
        wasted_in_period: wastedBase,
        current_physical_stock: invMatch ? invMatch.current_stock : inwardedBase,
        cost_per_unit: invMatch ? invMatch.cost_per_unit : 0
      };
    });

    res.json(ledger);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------- PRICE TRENDS ----------------
app.get('/api/inventory/price-trends', async (req, res) => {
  try {
    const stock = await Inventory.find({});
    const allPOs = await PurchaseOrder.find({ status: 'RECEIVED' }).sort({ created_at: -1, createdAt: -1 });

    const ingredientNames = new Set(stock.map(i => i.ingredient_name));
    allPOs.forEach(po => po.items.forEach(pi => ingredientNames.add(pi.ingredient_name)));

    const trends = Array.from(ingredientNames).map(name => {
      const ingNameLower = name.trim().toLowerCase();
      const invMatch = stock.find(i => i.ingredient_name.trim().toLowerCase() === ingNameLower);
      const baseUnit = invMatch ? invMatch.unit : 'grams';
      let humanUnit = 'kg';
      let multiplier = 1000;

      if (baseUnit === 'ml') {
        humanUnit = 'L';
        multiplier = 1000;
      } else if (baseUnit === 'units') {
        humanUnit = 'unit';
        multiplier = 1;
      }

      const itemPurchases = [];
      allPOs.forEach(po => {
        po.items.forEach(pi => {
          if (pi.ingredient_name.trim().toLowerCase() === ingNameLower) {
            itemPurchases.push({
              rate: pi.unit_price,
              unit: pi.unit,
              date: po.created_at || po.createdAt,
              po_number: po.po_number
            });
          }
        });
      });

      const latestPurchase = itemPurchases[0] || null;
      const previousPurchase = itemPurchases[1] || null;

      const movingAvgRate = invMatch ? Number(((invMatch.cost_per_unit || 0) * multiplier).toFixed(2)) : 0;
      const latestRate = latestPurchase ? Number(latestPurchase.rate) : movingAvgRate;
      const prevRate = previousPurchase ? Number(previousPurchase.rate) : latestRate;

      return {
        ingredient_name: name,
        human_unit: humanUnit,
        moving_avg_rate: movingAvgRate,
        latest_purchase_rate: latestRate,
        latest_purchase_date: latestPurchase ? latestPurchase.date : null,
        previous_purchase_rate: prevRate,
        previous_purchase_date: previousPurchase ? previousPurchase.date : null,
        rate_difference: Number((latestRate - prevRate).toFixed(2))
      };
    });

    res.json(trends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const stock = await Inventory.find({});
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---------------- BACKUP & HARD RESET ----------------
app.get('/api/admin/backup', async (req, res) => {
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      restaurant: "Palle To Patnam",
      dishes: await Dish.find({}),
      inventory: await Inventory.find({}),
      orders: await Order.find({}),
      purchaseOrders: await PurchaseOrder.find({}),
      expenses: await Expense.find({}),
      wastage: await Wastage.find({})
    };

    res.setHeader('Content-disposition', `attachment; filename=PalleToPatnam_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.setHeader('Content-type', 'application/json');
    res.write(JSON.stringify(backupData, null, 2));
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/reset', async (req, res) => {
  try {
    const { includeDishes } = req.body;
    await Inventory.deleteMany({});
    await Order.deleteMany({});
    await PurchaseOrder.deleteMany({});
    await Expense.deleteMany({});
    await Wastage.deleteMany({});

    if (includeDishes === true) {
      await Dish.deleteMany({});
    }

    res.json({
      status: "Success",
      message: `Hard Reset complete. Operational data cleared.${includeDishes ? ' Recipes deleted.' : ' Recipes preserved.'}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));