// controllers/inventoryController.js
const Dish = require('../models/dish');
const Inventory = require('../models/inventory');
const { convertToBaseUnit } = require('../utils/unitConverter');

async function processBillAndBurnStock(items) {
  for (const item of items) {
    const dish = await Dish.findOne({ item_code: String(item.item_code) });
    if (!dish || !dish.recipe || dish.recipe.length === 0) continue;

    const orderQty = Number(item.qty) || 1;

    for (const ingredient of dish.recipe) {
      const nominalQty = ingredient.quantity * orderQty;
      // Compensate for yield loss (e.g. 200g meat / 0.8 yield = 250g uncleaned raw deducted)
      const yieldFactor = (ingredient.yield_percentage || 100) / 100;
      const actualRawRequired = nominalQty / (yieldFactor > 0 ? yieldFactor : 1);

      const { baseQty } = convertToBaseUnit(actualRawRequired, ingredient.unit);

      await Inventory.findOneAndUpdate(
        { ingredient_name: new RegExp(`^${ingredient.ingredient_name.trim()}$`, 'i') },
        { $inc: { current_stock: -baseQty } },
        { new: true }
      );
    }
  }
}

module.exports = { processBillAndBurnStock };