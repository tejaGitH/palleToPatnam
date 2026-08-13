// controllers/inventoryController.js
const Dish = require('../models/Dish');
const Inventory = require('../models/Inventory');

exports.processBillAndBurnStock = async (orderedItems) => {
  try {
    for (let item of orderedItems) {
      // Find the dish recipe by item_code
      const dish = await Dish.findOne({ item_code: item.item_code });

      if (dish && dish.recipe && dish.recipe.length > 0) {
        for (let ingredient of dish.recipe) {
          const totalBurnQuantity = ingredient.quantity * item.qty;

          // Upsert: Deducts stock if ingredient exists, or creates it if missing
          await Inventory.updateOne(
            { ingredient_name: ingredient.ingredient_name },
            { 
              $inc: { current_stock: -totalBurnQuantity },
              $setOnInsert: { unit: ingredient.unit }
            },
            { upsert: true }
          );

          console.log(`🔥 [STOCK BURN] Deducted ${totalBurnQuantity}${ingredient.unit} of ${ingredient.ingredient_name}`);
        }
      } else {
        console.log(`⚠️ No recipe found for item_code: ${item.item_code}`);
      }
    }
  } catch (error) {
    console.error('Error burning stock:', error);
  }
};