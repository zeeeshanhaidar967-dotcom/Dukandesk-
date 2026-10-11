// Polyfill localStorage for node environment
const storage: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => storage[k] || null,
  setItem: (k: string, v: string) => { storage[k] = v; },
  removeItem: (k: string) => { delete storage[k]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

import { roomDb } from './src/db/roomDatabase';

console.log('--- STARTING VERIFICATION TESTS ---');

// 1. Setup a test customer (Vivek)
const vivek = roomDb.insertCustomer({
  name: 'Vivek Sharma',
  phone: '9876543210',
  address: 'Biraul Chowk, Darbhanga',
});

console.log('Customer created:', vivek.id, vivek.name);

// 2. Setup a test product
const testProduct = roomDb.insertProduct({
  name: 'Premium Marble Slab 2x2',
  category: 'Marble',
  brand: 'Kajaria',
  producer: 'Kajaria Ltd',
  supplier: 'Local Depot',
  unit: 'Piece',
  purchasePrice: 200,
  sellingPrice: 500, // ₹500 per piece
  currentStock: 100,
  minStockLevel: 10,
});

// 3. Vivek purchases 10 pieces @ ₹500 = ₹5,000 on credit
const sale = roomDb.completeSale({
  customerId: vivek.id,
  items: [{ productId: testProduct.id, quantity: 10 }],
  amountPaid: 0,
  paymentMethod: 'Credit',
  notes: 'Purchased on credit',
});

console.log('Sale completed: Bill #', sale.billNumber, 'Total:', sale.totalBill, 'Balance Due:', sale.balanceDue);

const vivekAfterSale = roomDb.getCustomerById(vivek.id)!;
console.log('Vivek outstanding due after sale:', vivekAfterSale.outstandingBalance);
if (vivekAfterSale.outstandingBalance !== 5000) {
  throw new Error(`Expected due 5000, got ${vivekAfterSale.outstandingBalance}`);
}

// 4. Vivek returns 5 pieces (worth ₹2,500) with DUE_ADJUSTMENT
const saleItem = sale.items[0];
const returnRecord = roomDb.processSaleReturn({
  saleId: sale.id,
  items: [{
    saleItemId: saleItem.id,
    productId: testProduct.id,
    returnQuantity: 5,
  }],
  settlementType: 'DUE_ADJUSTMENT',
  notes: 'Excess tiles returned in sound condition',
});

console.log('Return completed: Return Bill #', returnRecord.returnBillNumber, 'Original Bill #', returnRecord.billNumber);
console.log('Total Return Value:', returnRecord.totalReturnValue, 'Due Adjustment:', returnRecord.dueAdjustment);

const vivekAfterReturn = roomDb.getCustomerById(vivek.id)!;
console.log('Vivek outstanding due after return:', vivekAfterReturn.outstandingBalance);
if (vivekAfterReturn.outstandingBalance !== 2500) {
  throw new Error(`Expected due 2500, got ${vivekAfterReturn.outstandingBalance}`);
}

// 5. Verify Original Sale Bill is preserved and reflects returned amount
const preservedSale = roomDb.getSaleById(sale.id)!;
console.log('Preserved sale: totalBill =', preservedSale.totalBill, 'returnedAmount =', preservedSale.returnedAmount, 'balanceDue =', preservedSale.balanceDue);
if (preservedSale.totalBill !== 5000) {
  throw new Error('Original sale totalBill should remain 5000');
}
if (preservedSale.returnedAmount !== 2500) {
  throw new Error(`Expected returnedAmount 2500, got ${preservedSale.returnedAmount}`);
}
if (preservedSale.balanceDue !== 2500) {
  throw new Error(`Expected balanceDue 2500, got ${preservedSale.balanceDue}`);
}

// 6. Verify Return Bill is associated with Vivek's customer ID and linked to original sale
const customerReturns = roomDb.getReturns().filter(
  (r) => r.customerId === vivek.id || r.saleId === sale.id
);
console.log('Customer returns count for Vivek:', customerReturns.length);
if (customerReturns.length < 1) {
  throw new Error('Return should be associated with customer');
}
const matchingReturn = customerReturns.find((r) => r.id === returnRecord.id)!;
if (matchingReturn.returnBillNumber !== returnRecord.returnBillNumber) {
  throw new Error('Return Bill Number mismatch');
}
if (matchingReturn.billNumber !== sale.billNumber) {
  throw new Error('Return Bill original billNumber reference mismatch');
}

// 7. Verify partial return eligibility clamping: cannot return more than remaining 5
let errorCaught = false;
try {
  roomDb.processSaleReturn({
    saleId: sale.id,
    items: [{
      saleItemId: saleItem.id,
      productId: testProduct.id,
      returnQuantity: 6,
    }],
    settlementType: 'DUE_ADJUSTMENT',
  });
} catch (err: any) {
  errorCaught = true;
  console.log('Clamping protection verified, caught expected error:', err.message);
}
if (!errorCaught) {
  throw new Error('Should have rejected returning more than remaining eligible quantity');
}

// 8. Verify Cash Refund scenario: customer with due ₹2,500 returns 2 pieces worth ₹1,000 with REFUND
// Since cash was refunded, customer due should remain ₹2,500
const refundReturn = roomDb.processSaleReturn({
  saleId: sale.id,
  items: [{
    saleItemId: saleItem.id,
    productId: testProduct.id,
    returnQuantity: 2,
  }],
  settlementType: 'REFUND',
  notes: 'Refund paid in cash to customer',
});

console.log('Cash Refund Return completed: Return Bill #', refundReturn.returnBillNumber, 'Refund Amount:', refundReturn.refundAmount);
const vivekAfterRefund = roomDb.getCustomerById(vivek.id)!;
console.log('Vivek outstanding due after cash refund return:', vivekAfterRefund.outstandingBalance);
if (vivekAfterRefund.outstandingBalance !== 2500) {
  throw new Error(`Expected due 2500 to remain unaffected by cash refund, got ${vivekAfterRefund.outstandingBalance}`);
}

// 9. Total customer documents: 1 Sale Bill + 2 Return Bills
const allVivekSales = roomDb.getSales().filter((s) => s.customerId === vivek.id);
const allVivekReturns = roomDb.getReturns().filter((r) => r.customerId === vivek.id);
console.log(`Vivek total documents: ${allVivekSales.length} Sale Bills, ${allVivekReturns.length} Return Bills`);
if (allVivekSales.length !== 1 || allVivekReturns.length !== 2) {
  throw new Error('Expected 1 Sale Bill and 2 Return Bills');
}

console.log('--- ALL VERIFICATION TESTS PASSED SUCCESSFULLY ---');
