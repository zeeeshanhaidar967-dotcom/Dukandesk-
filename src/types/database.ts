/**
 * Android Room Database Entities & Schema Definitions
 * Standard Relational Schema for Private Single-Owner Shop Management
 */

export type UnitOfMeasurement = 
  | 'Piece'
  | 'Box'
  | 'Sq.ft'
  | 'Meter'
  | 'Kg'
  | 'Set'
  | 'Other';

export interface ProductEntity {
  id: string; // Primary key, e.g. "PROD-1001"
  name: string;
  photoUrl?: string; // Stored as base64 or local asset URI for visual reference
  category: string;
  brand: string;
  producer: string; // Manufacturer
  supplier: string;
  unit: UnitOfMeasurement;
  customUnit?: string;
  purchasePrice: number; // Cost price in currency (e.g. ₹500)
  sellingPrice: number;  // Retail price in currency (e.g. ₹750)
  currentStock: number;
  minStockLevel: number;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CustomerEntity {
  id: string; // Primary key, e.g. "CUST-001"
  name: string;
  phone: string;
  address: string;
  totalPurchases: number; // Sum of all bills
  totalPaid: number;      // Sum of all payments received
  outstandingBalance: number; // totalPurchases - totalPaid
  createdAt: string;
  updatedAt: string;
}

export interface SaleItemEntity {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: number;
  returnedQuantity?: number; // Quantity returned so far
  purchasePrice: number; // Locked at time of sale
  sellingPrice: number;  // Locked at time of sale
  subtotal: number;      // sellingPrice * quantity
  itemCost: number;      // purchasePrice * quantity
  grossProfit: number;   // subtotal - itemCost
}

export interface SaleEntity {
  id: string; // e.g. "SALE-202609-001"
  billNumber: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: SaleItemEntity[];
  totalBill: number;     // Sum of items subtotal
  totalCost: number;     // Sum of items purchase cost
  grossProfit: number;   // totalBill - totalCost
  amountPaid: number;    // Amount paid in this transaction
  balanceDue: number;    // totalBill - amountPaid
  returnedAmount?: number; // Total value of items returned from this sale
  paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Credit' | 'Other';
  notes?: string;
  createdAt: string; // ISO 8601
}

export interface SaleReturnItem {
  saleItemId: string;
  productId: string;
  productName: string;
  unit: string;
  originalQuantity: number;
  returnedQuantity: number;
  remainingEligibleQty: number;
  sellingPrice: number;
  returnValue: number;
}

export interface SaleReturnEntity {
  id: string; // e.g. "RET-001"
  saleId: string;
  billNumber: string; // Original Sale Bill Number e.g. "BILL-261008-428"
  returnBillNumber?: string; // Dedicated Return Bill Number e.g. "RET-261008-001"
  customerId: string;
  customerName: string;
  customerPhone?: string;
  items: SaleReturnItem[];
  totalReturnValue: number;
  dueAdjustment: number;
  refundAmount: number;
  creditAmount: number;
  settlementType: 'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT';
  notes?: string;
  createdAt: string; // ISO 8601
}

export interface PaymentEntity {
  id: string; // e.g. "PAY-001"
  customerId: string;
  customerName: string;
  saleId?: string; // Optional reference to specific bill
  billNumber?: string;
  amount: number;
  paymentMethod: 'Cash' | 'UPI' | 'Bank Transfer' | 'Cheque' | 'Other';
  notes?: string;
  paymentDate: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601
}

export type MovementType = 'STOCK_IN' | 'SALE' | 'ADJUSTMENT' | 'RETURN';

export interface StockMovementEntity {
  id: string; // e.g. "STK-001"
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number; // positive for addition, negative for deduction
  previousStock: number;
  newStock: number;
  unitPrice?: number;
  reference: string; // e.g. "PO-2026-09" or "Bill #BILL-001"
  notes?: string;
  createdAt: string; // ISO 8601
}

export interface OwnerSettingsEntity {
  pin: string; // 4-6 digit owner security PIN
  isPinSet: boolean;
  shopName: string;
  ownerName: string;
  phone: string;
  address: string;
  currencySymbol: string;
  receiptFooter: string;
  enableStockWarning: boolean;
  lastBackupDate?: string;
  lastBackupFileId?: string;
  lastBackupFileSize?: string;
  lastBackupAccount?: string;
  automaticBackupEnabled?: boolean;
  lastAutoBackupAttempt?: string;
  lastAutoBackupStatus?: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  isProductionMode?: boolean; // When true, enables strict safeguards (PIN, typed phrase, cloud backup)
}

export type AppUserRole = 'admin' | 'viewer' | 'staff' | 'manager' | 'stock_viewer';
export type AppUserStatus = 'active' | 'inactive';

export interface AppUserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: AppUserRole;
  signUpDate: string;
  lastLogin: string;
  userId?: string;
  name?: string;
  status?: AppUserStatus;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackupSummaryInfo {
  totalProducts: number;
  totalCustomers: number;
  totalSales: number;
  totalPayments: number;
  totalStockMovements: number;
  totalReturns: number;
  totalOutstandingDue: number;
  totalStockValue: number;
}

export interface BackupManifest {
  app: string;
  appVersion: string;
  schemaVersion: number;
  shopIdentifier: string;
  exportedAt: string;
  shopInfo: {
    shopName: string;
    ownerName: string;
    phone: string;
    address: string;
    currencySymbol: string;
  };
  summary: BackupSummaryInfo;
  checksum: string;
  data: ShopDatabaseState;
}

export interface ShopDatabaseState {
  version: number;
  products: ProductEntity[];
  customers: CustomerEntity[];
  sales: SaleEntity[];
  payments: PaymentEntity[];
  returns?: SaleReturnEntity[];
  stockMovements: StockMovementEntity[];
  settings: OwnerSettingsEntity;
}
