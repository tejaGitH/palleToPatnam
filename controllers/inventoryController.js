// controllers/inventoryController.js
const Dish = require('../models/dish');
const Inventory = require('../models/inventory');
const { convertToBaseUnit } = require('../utils/unitConverter');

async function processBillAndBurnStock(items) {
  try {
    for (const item of (items || [])) {
      const itemCodeStr = String(item.item_code || item.itemcode || '').trim();
      if (!itemCodeStr) continue;

      const dish = await Dish.findOne({
        $or: [
          { item_code: itemCodeStr },
          { item_code: Number(itemCodeStr) || -99999 }
        ]
      });

      if (!dish || !Array.isArray(dish.recipe) || dish.recipe.length === 0) {
        continue;
      }

      const orderQty = Number(item.qty || item.quantity) || 1;

      for (const ingredient of dish.recipe) {
        const ingNameClean = String(ingredient.ingredient_name || '').trim();
        // Guard against undefined or empty ingredient names
        if (!ingNameClean || ingNameClean.toLowerCase() === 'undefined' || ingNameClean.toLowerCase() === 'null') {
          continue;
        }

        const nominalQty = (Number(ingredient.quantity) || 0) * orderQty;
        const yieldFactor = (Number(ingredient.yield_percentage) || 100) / 100;
        const actualRawNeeded = nominalQty / (yieldFactor > 0 ? yieldFactor : 1);

        const { baseQty, baseUnit } = convertToBaseUnit(actualRawNeeded, ingredient.unit || 'grams');

        if (baseQty > 0) {
          await Inventory.findOneAndUpdate(
            { ingredient_name: new RegExp(`^${ingNameClean}$`, 'i') },
            { 
              $inc: { current_stock: -baseQty },
              $setOnInsert: { unit: baseUnit, cost_per_unit: 0, ingredient_name: ingNameClean }
            },
            { new: true, upsert: true }
          );
        }
      }
    }
  } catch (error) {
    console.error("Error in processBillAndBurnStock:", error);
    throw error;
  }
}

module.exports = { processBillAndBurnStock };