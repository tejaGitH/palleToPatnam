// utils/unitConverter.js
function convertToBaseUnit(quantity, unit) {
  const q = Number(quantity) || 0;
  const u = String(unit || 'grams').toLowerCase().trim();

  // Weight Units -> Base: grams
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) {
    return { baseQty: q * 1000, baseUnit: 'grams' };
  }
  if (['gms', 'gm', 'g', 'gram', 'grams'].includes(u)) {
    return { baseQty: q, baseUnit: 'grams' };
  }

  // Volume Units -> Base: ml
  if (['ltr', 'liter', 'liters', 'l'].includes(u)) {
    return { baseQty: q * 1000, baseUnit: 'ml' };
  }
  if (['ml', 'milliliter', 'milliliters'].includes(u)) {
    return { baseQty: q, baseUnit: 'ml' };
  }

  // Count Units -> Base: units
  if (['units', 'unit', 'nos', 'piece', 'pieces', 'pcs', 'plate', 'plates'].includes(u)) {
    return { baseQty: q, baseUnit: 'units' };
  }

  return { baseQty: q, baseUnit: u || 'grams' };
}

module.exports = { convertToBaseUnit };