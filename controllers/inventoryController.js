// controllers/inventoryController.js
// In controllers/inventoryController.js
const Dish = require('../models/dish'); // matching exact file case
const Inventory = require('../models/inventory');
const { convertToBaseUnit } = require('../utils/unitConverter');

exports.processBillAndBurnStock = async (orderedItems) => {
  try {
    for (let item of orderedItems) {
      // Find the dish recipe by item_code or dish_name
      const dish = await Dish.findOne({
        $or: [
          { item_code: String(item.item_code) },
          { dish_name: new RegExp(`^${item.item_name}$`, 'i') }
        ]
      });

      if (dish && dish.recipe && dish.recipe.length > 0) {
        for (let ingredient of dish.recipe) {
          const totalBurnQuantity = (ingredient.quantity * Number(item.qty)) || 0;
          const { baseQty, baseUnit } = convertToBaseUnit(totalBurnQuantity, ingredient.unit);

          // Deducts stock from Atlas Inventory
          await Inventory.updateOne(
            { ingredient_name: new RegExp(`^${ingredient.ingredient_name.trim()}$`, 'i') },
            { 
              $inc: { current_stock: -baseQty },
              $setOnInsert: { 
                ingredient_name: ingredient.ingredient_name.trim(),
                unit: baseUnit 
              }
            },
            { upsert: true }
          );

          console.log(`🔥 [STOCK BURN] Deducted ${baseQty}${baseUnit} of ${ingredient.ingredient_name} for order: ${dish.dish_name} (Qty: ${item.qty})`);
        }
      } else {
        console.log(`⚠️ No recipe found for: ${item.item_name || item.item_code}`);
      }
    }
  } catch (error) {
    console.error('Error burning stock:', error);
  }
};