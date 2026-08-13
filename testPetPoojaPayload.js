// testPetPoojaPayload.js

// Official Sample Payload from Petpooja API Doc
const petpoojaSamplePayload = {
  "token": "static_token_123",
  "event": "orderdetails",
  "properties": {
    "Restaurant": {
      "res_name": "Palle To Patnam",
      "restID": "cp81ghin"
    },
    "Order": {
      "orderID": 1101,
      "customer_invoice_id": "1839",
      "order_type": "Dine In",
      "payment_type": "Cash",
      "discount_total": 0,
      "total": 360,
      "order_from": "POS"
    },
    "OrderItem": [
      {
        "name": "Chicken Biriyani Single",
        "itemcode": "101",
        "price": 150,
        "quantity": 2
      },
      {
        "name": "Mysore Bonda (4)",
        "itemcode": "9",
        "price": 60,
        "quantity": 1
      }
    ]
  }
};

async function testWebhook() {
  console.log("Sending official Petpooja sample payload to webhook...");
  
  try {
    const response = await fetch('http://localhost:5000/api/webhook/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(petpoojaSamplePayload)
    });

    const result = await response.json();
    console.log("Server Response:", result);
  } catch (error) {
    console.error("Fetch Error:", error.message);
  }
}

testWebhook();