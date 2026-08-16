// utils/unitConverter.js
function convertToBaseUnit(qty, unit) {
  const cleanUnit = (unit || '').toLowerCase().trim();
  const numQty = Number(qty) || 0;

  switch (cleanUnit) {
    case 'kg':
    case 'kgs':
    case 'kilogram':
      return { baseQty: numQty * 1000, baseUnit: 'grams' };
    case 'ltr':
    case 'liter':
    case 'litre':
      return { baseQty: numQty * 1000, baseUnit: 'ml' };
    case 'gm':
    case 'gms':
    case 'grams':
    case 'g':
      return { baseQty: numQty, baseUnit: 'grams' };
    case 'ml':
      return { baseQty: numQty, baseUnit: 'ml' };
    case 'units':
    case 'pcs':
    case 'pieces':
    case 'unit':
    default:
      return { baseQty: numQty, baseUnit: 'units' };
  }
}

module.exports = { convertToBaseUnit };