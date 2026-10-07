/**
 * Android Room Database with SQLite Engine Simulation
 * Offline-first, persistent local storage with relational integrity and ACID transactions.
 */

import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  SaleItemEntity,
  PaymentEntity,
  StockMovementEntity,
  OwnerSettingsEntity,
  ShopDatabaseState,
  SaleReturnEntity,
  SaleReturnItem,
  BackupManifest,
  BackupSummaryInfo,
} from '../types/database';

const DB_STORAGE_KEY = 'dukanmaster_sqlite_room_db_v1';
const SAFETY_ROLLBACK_KEY = 'dukanmaster_sqlite_room_db_safety_rollback_v1';

export const DEFAULT_SETTINGS: OwnerSettingsEntity = {
  pin: '847203',
  isPinSet: true,
  shopName: 'MAHARAJA MARBLE',
  ownerName: 'HAIDAR ALI',
  phone: '9931683424',
  address: 'College Road, Supaul, Biraul, Darbhanga – 847203',
  currencySymbol: '₹',
  receiptFooter: 'Thank you for choosing MAHARAJA MARBLE! Premium quality marble, granite, and tiles. Proprietor: HAIDAR ALI (Contact: 9931683424).',
  enableStockWarning: true,
  lastBackupDate: undefined,
  automaticBackupEnabled: true,
  isProductionMode: false,
};

// Seed sample data reflecting authentic shop operations (MAHARAJA MARBLE)
export const INITIAL_PRODUCTS: ProductEntity[] = [
  {
    id: 'PROD-101',
    name: 'Kajaria 600x600mm Glazed Vitrified Tiles (White Marble finish)',
    category: 'Floor Tiles',
    brand: 'Kajaria',
    producer: 'Kajaria Ceramics Ltd',
    supplier: 'Metro Tiles & Stone Distributor',
    unit: 'Box',
    purchasePrice: 650,
    sellingPrice: 850,
    currentStock: 140,
    minStockLevel: 25,
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
  },
  {
    id: 'PROD-102',
    name: 'Makrana Pure White Marble Tiles (300x300mm Mirror Polished)',
    category: 'Natural Marble',
    brand: 'Maharaja Select',
    producer: 'Makrana Marble Quarries Ltd',
    supplier: 'Rajasthan Marble Consortium',
    unit: 'Sq.ft',
    purchasePrice: 180,
    sellingPrice: 260,
    currentStock: 0, // Depleted Tier (0 units) - Subtle Rose Indicator
    minStockLevel: 50,
    createdAt: '2026-09-02T09:30:00.000Z',
    updatedAt: '2026-09-02T09:30:00.000Z',
  },
  {
    id: 'PROD-103',
    name: 'Italian Statuario Polished Glazed Slabs (1200x600mm)',
    category: 'Slab Tiles',
    brand: 'Somany Luxe',
    producer: 'Somany Ceramics',
    supplier: 'Morbi Import Hub',
    unit: 'Box',
    purchasePrice: 1100,
    sellingPrice: 1550,
    currentStock: 4, // Critical Tier (4/20 = 20%) - Subtle Amber Indicator
    minStockLevel: 20,
    createdAt: '2026-09-03T10:15:00.000Z',
    updatedAt: '2026-09-03T10:15:00.000Z',
  },
  {
    id: 'PROD-104',
    name: 'Roff Cera Clean Rapid Tile Floor Cleaner & Grout Remover',
    category: 'Chemicals & Cleaners',
    brand: 'Pidilite Roff',
    producer: 'Pidilite Industries',
    supplier: 'Shree Krishna Hardware Mart',
    unit: 'Piece',
    purchasePrice: 110,
    sellingPrice: 160,
    currentStock: 9, // Low Stock Tier (9/15 = 60%) - Subtle Yellow/Gold Indicator
    minStockLevel: 15,
    createdAt: '2026-09-05T12:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
  },
  {
    id: 'PROD-105',
    name: 'Jaquar Continental Brass Single Lever Basin Mixer Tap',
    category: 'Faucets & Taps',
    brand: 'Jaquar',
    producer: 'Jaquar Group',
    supplier: 'Royal Sanitary Suppliers',
    unit: 'Piece',
    purchasePrice: 2100,
    sellingPrice: 2850,
    currentStock: 18,
    minStockLevel: 5,
    createdAt: '2026-09-03T10:15:00.000Z',
    updatedAt: '2026-09-03T10:15:00.000Z',
  },
  {
    id: 'PROD-106',
    name: 'Hindware Wall Hung Ceramic Commode with Soft-Close Seat',
    category: 'Sanitaryware',
    brand: 'Hindware',
    producer: 'Hindware Home Innovation Ltd',
    supplier: 'Royal Sanitary Suppliers',
    unit: 'Set',
    purchasePrice: 4200,
    sellingPrice: 5800,
    currentStock: 8,
    minStockLevel: 4,
    createdAt: '2026-09-04T11:00:00.000Z',
    updatedAt: '2026-09-04T11:00:00.000Z',
  },
  {
    id: 'PROD-107',
    name: 'Black Galaxy Granite Countertop Slabs (Pre-moulded edges)',
    category: 'Granite & Natural Stone',
    brand: 'Maharaja Granite',
    producer: 'Onyx Mineral Industries',
    supplier: 'South India Granite Depo',
    unit: 'Sq.ft',
    purchasePrice: 220,
    sellingPrice: 320,
    currentStock: 350,
    minStockLevel: 100,
    createdAt: '2026-09-06T14:20:00.000Z',
    updatedAt: '2026-09-06T14:20:00.000Z',
  },
  {
    id: 'PROD-108',
    name: 'Kajaria Tile — Model XYZ',
    category: 'Floor Tiles',
    brand: 'Kajaria',
    producer: 'Kajaria Ceramics Ltd',
    supplier: 'Metro Tiles & Stone Distributor',
    unit: 'Piece',
    purchasePrice: 380,
    sellingPrice: 500,
    currentStock: 25,
    minStockLevel: 10,
    createdAt: '2026-09-07T10:00:00.000Z',
    updatedAt: '2026-09-07T10:00:00.000Z',
  },
];

export const INITIAL_CUSTOMERS: CustomerEntity[] = [
  {
    id: 'CUST-001',
    name: 'Ramesh Kumar (Contractor)',
    phone: '+91 98234 11223',
    address: 'Sector 18, Block B, House 42',
    totalPurchases: 100000,
    totalPaid: 50000,
    outstandingBalance: 50000,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-26T12:00:00.000Z',
  },
  {
    id: 'CUST-002',
    name: 'Priya Sharma (Villa 102 Interior)',
    phone: '+91 97112 33445',
    address: 'Green Meadows Residency, Villa 102',
    totalPurchases: 64500,
    totalPaid: 64500,
    outstandingBalance: 0,
    createdAt: '2026-09-22T14:00:00.000Z',
    updatedAt: '2026-09-25T16:30:00.000Z',
  },
  {
    id: 'CUST-003',
    name: 'Balwant Singh & Sons Builders',
    phone: '+91 99887 66554',
    address: 'Commercial Complex Project, Site Office 2',
    totalPurchases: 142000,
    totalPaid: 110000,
    outstandingBalance: 32000,
    createdAt: '2026-09-15T09:00:00.000Z',
    updatedAt: '2026-09-27T11:00:00.000Z',
  },
  {
    id: 'CUST-004',
    name: 'Cash / Walk-in Customer',
    phone: 'Walk-in',
    address: 'Counter Sale',
    totalPurchases: 18500,
    totalPaid: 18500,
    outstandingBalance: 0,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
  },
  {
    id: 'CUST-005',
    name: 'Vivek',
    phone: '+91 98765 43210',
    address: 'College Road, Supaul, Biraul',
    totalPurchases: 5000,
    totalPaid: 4000,
    outstandingBalance: 1000,
    createdAt: '2026-09-28T09:00:00.000Z',
    updatedAt: '2026-09-28T09:00:00.000Z',
  },
];

export const INITIAL_SALES: SaleEntity[] = [
  {
    id: 'SALE-202609-001',
    billNumber: 'BILL-0926-01',
    customerId: 'CUST-001',
    customerName: 'Ramesh Kumar (Contractor)',
    customerPhone: '+91 98234 11223',
    items: [
      {
        id: 'ITEM-01',
        saleId: 'SALE-202609-001',
        productId: 'PROD-101',
        productName: 'Kajaria 600x600mm Glazed Vitrified Tiles (White Marble finish)',
        unit: 'Box',
        quantity: 100,
        purchasePrice: 650,
        sellingPrice: 850,
        subtotal: 85000,
        itemCost: 65000,
        grossProfit: 20000,
      },
      {
        id: 'ITEM-02',
        saleId: 'SALE-202609-001',
        productId: 'PROD-106',
        productName: 'Supreme 110mm Heavy Duty PVC Drainage Pipe (3 Meter)',
        unit: 'Meter',
        quantity: 100,
        purchasePrice: 100,
        sellingPrice: 150,
        subtotal: 15000,
        itemCost: 10000,
        grossProfit: 5000,
      },
    ],
    totalBill: 100000,
    totalCost: 75000,
    grossProfit: 25000,
    amountPaid: 50000,
    balanceDue: 50000,
    paymentMethod: 'UPI',
    notes: 'Partial payment on delivery. Balance to be cleared next week.',
    createdAt: '2026-09-26T11:30:00.000Z',
  },
  {
    id: 'SALE-202609-002',
    billNumber: 'BILL-0925-02',
    customerId: 'CUST-002',
    customerName: 'Priya Sharma (Villa 102 Interior)',
    customerPhone: '+91 97112 33445',
    items: [
      {
        id: 'ITEM-03',
        saleId: 'SALE-202609-002',
        productId: 'PROD-103',
        productName: 'Jaquar Continental Brass Single Lever Basin Mixer Tap',
        unit: 'Piece',
        quantity: 5,
        purchasePrice: 2100,
        sellingPrice: 2850,
        subtotal: 14250,
        itemCost: 10500,
        grossProfit: 3750,
      },
      {
        id: 'ITEM-04',
        saleId: 'SALE-202609-002',
        productId: 'PROD-104',
        productName: 'Hindware Wall Hung Ceramic Commode with Soft-Close Seat',
        unit: 'Set',
        quantity: 3,
        purchasePrice: 4200,
        sellingPrice: 5800,
        subtotal: 17400,
        itemCost: 12600,
        grossProfit: 4800,
      },
      {
        id: 'ITEM-05',
        saleId: 'SALE-202609-002',
        productId: 'PROD-102',
        productName: 'Somany 300x450mm Ceramic Wall Tiles (Glossy Aqua)',
        unit: 'Box',
        quantity: 63,
        purchasePrice: 380,
        sellingPrice: 521.43,
        subtotal: 32850,
        itemCost: 23940,
        grossProfit: 8910,
      },
    ],
    totalBill: 64500,
    totalCost: 47040,
    grossProfit: 17460,
    amountPaid: 64500,
    balanceDue: 0,
    paymentMethod: 'Bank Transfer',
    notes: 'Full payment received via NEFT.',
    createdAt: '2026-09-25T15:45:00.000Z',
  },
  {
    id: 'SALE-202609-003',
    billNumber: 'BILL-0928-03',
    customerId: 'CUST-004',
    customerName: 'Cash / Walk-in Customer',
    items: [
      {
        id: 'ITEM-06',
        saleId: 'SALE-202609-003',
        productId: 'PROD-105',
        productName: 'Roff Cera Clean Rapid Tile Floor Cleaner & Grout Remover',
        unit: 'Piece',
        quantity: 4,
        purchasePrice: 110,
        sellingPrice: 160,
        subtotal: 640,
        itemCost: 440,
        grossProfit: 200,
      },
      {
        id: 'ITEM-07',
        saleId: 'SALE-202609-003',
        productId: 'PROD-103',
        productName: 'Jaquar Continental Brass Single Lever Basin Mixer Tap',
        unit: 'Piece',
        quantity: 1,
        purchasePrice: 2100,
        sellingPrice: 2850,
        subtotal: 2850,
        itemCost: 2100,
        grossProfit: 750,
      },
    ],
    totalBill: 3490,
    totalCost: 2540,
    grossProfit: 950,
    amountPaid: 3490,
    balanceDue: 0,
    paymentMethod: 'Cash',
    notes: 'Counter sale cash.',
    createdAt: '2026-09-28T09:15:00.000Z',
  },
  {
    id: 'SALE-202609-005',
    billNumber: 'BILL-0929-05',
    customerId: 'CUST-005',
    customerName: 'Vivek',
    customerPhone: '+91 98765 43210',
    customerAddress: 'College Road, Supaul, Biraul',
    items: [
      {
        id: 'ITEM-08',
        saleId: 'SALE-202609-005',
        productId: 'PROD-108',
        productName: 'Kajaria Tile — Model XYZ',
        unit: 'Piece',
        quantity: 10,
        returnedQuantity: 0,
        purchasePrice: 380,
        sellingPrice: 500,
        subtotal: 5000,
        itemCost: 3800,
        grossProfit: 1200,
      },
    ],
    totalBill: 5000,
    totalCost: 3800,
    grossProfit: 1200,
    amountPaid: 4000,
    balanceDue: 1000,
    paymentMethod: 'Cash',
    notes: 'Kajaria tile purchase for renovation.',
    createdAt: '2026-09-29T07:30:00.000Z',
  },
];

export const INITIAL_PAYMENTS: PaymentEntity[] = [
  {
    id: 'PAY-1001',
    customerId: 'CUST-001',
    customerName: 'Ramesh Kumar (Contractor)',
    saleId: 'SALE-202609-001',
    billNumber: 'BILL-0926-01',
    amount: 50000,
    paymentMethod: 'UPI',
    notes: 'Advance paid at time of loading.',
    paymentDate: '2026-09-26',
    createdAt: '2026-09-26T11:30:00.000Z',
  },
  {
    id: 'PAY-1002',
    customerId: 'CUST-002',
    customerName: 'Priya Sharma (Villa 102 Interior)',
    saleId: 'SALE-202609-002',
    billNumber: 'BILL-0925-02',
    amount: 64500,
    paymentMethod: 'Bank Transfer',
    notes: 'Paid via IMPS Bank Transfer.',
    paymentDate: '2026-09-25',
    createdAt: '2026-09-25T15:45:00.000Z',
  },
  {
    id: 'PAY-1003',
    customerId: 'CUST-004',
    customerName: 'Cash / Walk-in Customer',
    saleId: 'SALE-202609-003',
    billNumber: 'BILL-0928-03',
    amount: 3490,
    paymentMethod: 'Cash',
    notes: 'Cash received at counter.',
    paymentDate: '2026-09-28',
    createdAt: '2026-09-28T09:15:00.000Z',
  },
  {
    id: 'PAY-1004',
    customerId: 'CUST-003',
    customerName: 'Balwant Singh & Sons Builders',
    amount: 50000,
    paymentMethod: 'Cheque',
    notes: 'Cheque clearance Chq# 440212 HDFC Bank.',
    paymentDate: '2026-09-27',
    createdAt: '2026-09-27T11:00:00.000Z',
  },
  {
    id: 'PAY-1005',
    customerId: 'CUST-005',
    customerName: 'Vivek',
    saleId: 'SALE-202609-005',
    billNumber: 'BILL-0929-05',
    amount: 4000,
    paymentMethod: 'Cash',
    notes: 'Advance partial payment for Kajaria XYZ tiles.',
    paymentDate: '2026-09-29',
    createdAt: '2026-09-29T07:30:00.000Z',
  },
];

export const INITIAL_STOCK_MOVEMENTS: StockMovementEntity[] = [
  {
    id: 'STK-001',
    productId: 'PROD-101',
    productName: 'Kajaria 600x600mm Glazed Vitrified Tiles (White Marble finish)',
    type: 'STOCK_IN',
    quantity: 150,
    previousStock: 0,
    newStock: 150,
    unitPrice: 650,
    reference: 'Invoice #KAJ-2026-440',
    notes: 'Factory container received from Morbi depot.',
    createdAt: '2026-09-18T10:00:00.000Z',
  },
  {
    id: 'STK-002',
    productId: 'PROD-101',
    productName: 'Kajaria 600x600mm Glazed Vitrified Tiles (White Marble finish)',
    type: 'STOCK_IN',
    quantity: 90,
    previousStock: 150,
    newStock: 240,
    unitPrice: 650,
    reference: 'PO-SEPT-09',
    notes: 'Additional stock ordered.',
    createdAt: '2026-09-22T08:30:00.000Z',
  },
  {
    id: 'STK-003',
    productId: 'PROD-101',
    productName: 'Kajaria 600x600mm Glazed Vitrified Tiles (White Marble finish)',
    type: 'SALE',
    quantity: -100,
    previousStock: 240,
    newStock: 140,
    reference: 'Bill #BILL-0926-01',
    notes: 'Sold to Ramesh Kumar',
    createdAt: '2026-09-26T11:30:00.000Z',
  },
  {
    id: 'STK-004',
    productId: 'PROD-105',
    productName: 'Roff Cera Clean Rapid Tile Floor Cleaner & Grout Remover',
    type: 'SALE',
    quantity: -4,
    previousStock: 10,
    newStock: 6,
    reference: 'Bill #BILL-0928-03',
    notes: 'Counter sale',
    createdAt: '2026-09-28T09:15:00.000Z',
  },
];

class RoomDatabaseManager {
  private state: ShopDatabaseState;

  constructor() {
    this.state = this.loadDatabase();
  }

  private loadDatabase(): ShopDatabaseState {
    try {
      const stored = localStorage.getItem(DB_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ShopDatabaseState;
        if (parsed && Array.isArray(parsed.products)) {
          if (!parsed.returns) {
            parsed.returns = [];
          }
          if (parsed.settings) {
            parsed.settings.shopName = 'MAHARAJA MARBLE';
            parsed.settings.ownerName = 'HAIDAR ALI';
            parsed.settings.phone = '9931683424';
            parsed.settings.address = 'College Road, Supaul, Biraul, Darbhanga – 847203';
            parsed.settings.pin = '847203';
            parsed.settings.isPinSet = true;
          }
          // Ensure sample customer Vivek exists for testing the exact return scenario
          if (!parsed.customers.some((c) => c.name.toLowerCase() === 'vivek')) {
            parsed.customers.push({
              id: 'CUST-005',
              name: 'Vivek',
              phone: '+91 98765 43210',
              address: 'College Road, Supaul, Biraul',
              totalPurchases: 5000,
              totalPaid: 4000,
              outstandingBalance: 1000,
              createdAt: '2026-09-28T09:00:00.000Z',
              updatedAt: '2026-09-28T09:00:00.000Z',
            });
          }
          if (!parsed.products.some((p) => p.name.includes('Kajaria XYZ') || p.id === 'PROD-108')) {
            parsed.products.push({
              id: 'PROD-108',
              name: 'Kajaria Tile — Model XYZ',
              category: 'Floor Tiles',
              brand: 'Kajaria',
              producer: 'Kajaria Ceramics Ltd',
              supplier: 'Metro Tiles & Stone Distributor',
              unit: 'Piece',
              purchasePrice: 380,
              sellingPrice: 500,
              currentStock: 25,
              minStockLevel: 10,
              createdAt: '2026-09-07T10:00:00.000Z',
              updatedAt: '2026-09-07T10:00:00.000Z',
            });
          }
          if (!parsed.sales.some((s) => s.id === 'SALE-202609-005' || s.billNumber === 'BILL-0929-05')) {
            parsed.sales.unshift({
              id: 'SALE-202609-005',
              billNumber: 'BILL-0929-05',
              customerId: 'CUST-005',
              customerName: 'Vivek',
              customerPhone: '+91 98765 43210',
              customerAddress: 'College Road, Supaul, Biraul',
              items: [
                {
                  id: 'ITEM-08',
                  saleId: 'SALE-202609-005',
                  productId: 'PROD-108',
                  productName: 'Kajaria Tile — Model XYZ',
                  unit: 'Piece',
                  quantity: 10,
                  returnedQuantity: 0,
                  purchasePrice: 380,
                  sellingPrice: 500,
                  subtotal: 5000,
                  itemCost: 3800,
                  grossProfit: 1200,
                },
              ],
              totalBill: 5000,
              totalCost: 3800,
              grossProfit: 1200,
              amountPaid: 4000,
              balanceDue: 1000,
              paymentMethod: 'Cash',
              notes: 'Kajaria tile purchase for renovation.',
              createdAt: '2026-09-29T07:30:00.000Z',
            });
          }
          if (parsed.products.some((p) => p.id === 'PROD-102' && p.name.includes('Somany 300x450mm'))) {
            parsed.products = INITIAL_PRODUCTS;
          }
          this.persist(parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load database from localStorage, initializing fresh state:', e);
    }

    const defaultState: ShopDatabaseState = {
      version: 1,
      products: INITIAL_PRODUCTS,
      customers: INITIAL_CUSTOMERS,
      sales: INITIAL_SALES,
      payments: INITIAL_PAYMENTS,
      returns: [],
      stockMovements: INITIAL_STOCK_MOVEMENTS,
      settings: DEFAULT_SETTINGS,
    };
    this.persist(defaultState);
    return defaultState;
  }

  private persist(state: ShopDatabaseState): void {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to persist database state:', e);
    }
  }

  public getState(): ShopDatabaseState {
    return { ...this.state };
  }

  public setProductsFromCloud(products: ProductEntity[]): void {
    this.state.products = [...products];
    this.persist(this.state);
  }

  public setCustomersFromCloud(customers: CustomerEntity[]): void {
    this.state.customers = [...customers];
    this.persist(this.state);
  }

  public setSalesFromCloud(sales: SaleEntity[]): void {
    this.state.sales = [...sales];
    this.persist(this.state);
  }

  public setPaymentsFromCloud(payments: PaymentEntity[]): void {
    this.state.payments = [...payments];
    this.persist(this.state);
  }

  public setReturnsFromCloud(returns: SaleReturnEntity[]): void {
    this.state.returns = [...returns];
    this.persist(this.state);
  }

  public setStockMovementsFromCloud(movements: StockMovementEntity[]): void {
    this.state.stockMovements = [...movements];
    this.persist(this.state);
  }

  public setSettingsFromCloud(settings: OwnerSettingsEntity): void {
    this.state.settings = { ...settings };
    this.persist(this.state);
  }

  public replaceState(newState: ShopDatabaseState): void {
    this.state = { ...newState };
    this.persist(this.state);
  }

  public getSettings(): OwnerSettingsEntity {
    return { ...this.state.settings };
  }

  public updateSettings(settings: Partial<OwnerSettingsEntity>): OwnerSettingsEntity {
    this.state.settings = { ...this.state.settings, ...settings };
    this.persist(this.state);
    return { ...this.state.settings };
  }

  // --- Products DAO ---
  public getProducts(): ProductEntity[] {
    return [...this.state.products];
  }

  public getProductById(id: string): ProductEntity | undefined {
    return this.state.products.find((p) => p.id === id);
  }

  public insertProduct(data: Omit<ProductEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ProductEntity {
    const now = new Date().toISOString();
    const id = data.id || `PROD-${Math.floor(1000 + Math.random() * 9000)}`;
    const newProduct: ProductEntity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // If initial stock > 0, log an initial stock movement
    if (newProduct.currentStock > 0) {
      const movement: StockMovementEntity = {
        id: `STK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        productId: newProduct.id,
        productName: newProduct.name,
        type: 'STOCK_IN',
        quantity: newProduct.currentStock,
        previousStock: 0,
        newStock: newProduct.currentStock,
        unitPrice: newProduct.purchasePrice,
        reference: 'Initial Stock Creation',
        notes: `Initial inventory balance entered upon product creation.`,
        createdAt: now,
      };
      this.state.stockMovements.unshift(movement);
    }

    this.state.products.unshift(newProduct);
    this.persist(this.state);
    return newProduct;
  }

  public updateProduct(id: string, updates: Partial<ProductEntity>): ProductEntity {
    const index = this.state.products.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Product ${id} not found.`);
    const existing = this.state.products[index];
    const updated: ProductEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.state.products[index] = updated;
    this.persist(this.state);
    return updated;
  }

  public deleteProduct(id: string): boolean {
    const initialLen = this.state.products.length;
    this.state.products = this.state.products.filter((p) => p.id !== id);
    const deleted = this.state.products.length < initialLen;
    if (deleted) this.persist(this.state);
    return deleted;
  }

  // --- Stock In System DAO ---
  public addStock(
    productId: string,
    quantityReceived: number,
    newPurchasePrice?: number,
    reference = 'Stock Arrival',
    notes = ''
  ): { product: ProductEntity; movement: StockMovementEntity } {
    if (quantityReceived <= 0) throw new Error('Quantity received must be greater than zero.');
    const product = this.getProductById(productId);
    if (!product) throw new Error('Product not found.');

    const previousStock = product.currentStock;
    const newStock = previousStock + quantityReceived;
    const now = new Date().toISOString();

    const priceToSet = newPurchasePrice !== undefined && newPurchasePrice > 0 
      ? newPurchasePrice 
      : product.purchasePrice;

    // Update Product Stock & Price
    const updatedProduct = this.updateProduct(productId, {
      currentStock: newStock,
      purchasePrice: priceToSet,
      updatedAt: now,
    });

    // Record Stock In Transaction
    const movement: StockMovementEntity = {
      id: `STK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      productId: product.id,
      productName: product.name,
      type: 'STOCK_IN',
      quantity: quantityReceived,
      previousStock,
      newStock,
      unitPrice: priceToSet,
      reference,
      notes,
      createdAt: now,
    };

    this.state.stockMovements.unshift(movement);
    this.persist(this.state);

    return { product: updatedProduct, movement };
  }

  // --- Customers DAO ---
  public getCustomers(): CustomerEntity[] {
    return [...this.state.customers];
  }

  public getCustomerById(id: string): CustomerEntity | undefined {
    return this.state.customers.find((c) => c.id === id);
  }

  public insertCustomer(data: { name: string; phone: string; address: string; openingBalance?: number }): CustomerEntity {
    const now = new Date().toISOString();
    const id = `CUST-${String(this.state.customers.length + 1).padStart(3, '0')}`;
    const initialDue = Math.max(0, data.openingBalance || 0);
    const newCustomer: CustomerEntity = {
      id,
      name: data.name.trim(),
      phone: data.phone.trim(),
      address: data.address.trim(),
      totalPurchases: initialDue,
      totalPaid: 0,
      outstandingBalance: initialDue,
      createdAt: now,
      updatedAt: now,
    };

    this.state.customers.unshift(newCustomer);
    this.persist(this.state);
    return newCustomer;
  }

  public updateCustomer(id: string, updates: Partial<CustomerEntity>): CustomerEntity {
    const index = this.state.customers.findIndex((c) => c.id === id);
    if (index === -1) throw new Error(`Customer ${id} not found.`);
    const existing = this.state.customers[index];
    const updated: CustomerEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    // Recalculate balance if purchases or paid changed
    updated.outstandingBalance = Math.max(0, updated.totalPurchases - updated.totalPaid);
    this.state.customers[index] = updated;
    this.persist(this.state);
    return updated;
  }

  // --- Sales & Transactions System ---
  public getSales(): SaleEntity[] {
    return [...this.state.sales];
  }

  public getSaleById(id: string): SaleEntity | undefined {
    return this.state.sales.find((s) => s.id === id);
  }

  public completeSale(saleInput: {
    customerId: string;
    items: Array<{
      productId: string;
      quantity: number;
    }>;
    amountPaid: number;
    paymentMethod: SaleEntity['paymentMethod'];
    notes?: string;
  }): SaleEntity {
    if (saleInput.items.length === 0) {
      throw new Error('Sale must contain at least one product.');
    }

    const customer = this.getCustomerById(saleInput.customerId);
    if (!customer) throw new Error('Customer record not found.');

    const now = new Date().toISOString();
    const saleId = `SALE-${Date.now().toString(36).toUpperCase()}`;
    const billNumber = `BILL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

    let totalBill = 0;
    let totalCost = 0;
    const saleItems: SaleItemEntity[] = [];
    const stockMovementsToLog: StockMovementEntity[] = [];

    // Verify and process each product
    for (const item of saleInput.items) {
      if (item.quantity <= 0) throw new Error('Item quantity must be greater than zero.');
      const product = this.getProductById(item.productId);
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const subtotal = product.sellingPrice * item.quantity;
      const itemCost = product.purchasePrice * item.quantity;
      const grossProfit = subtotal - itemCost;

      totalBill += subtotal;
      totalCost += itemCost;

      const saleItem: SaleItemEntity = {
        id: `ITEM-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        saleId,
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: item.quantity,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        subtotal,
        itemCost,
        grossProfit,
      };
      saleItems.push(saleItem);

      // Decrease stock
      const previousStock = product.currentStock;
      const newStock = previousStock - item.quantity;
      this.updateProduct(product.id, { currentStock: newStock });

      // Prepare stock movement
      stockMovementsToLog.push({
        id: `STK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        productId: product.id,
        productName: product.name,
        type: 'SALE',
        quantity: -item.quantity,
        previousStock,
        newStock,
        reference: `Bill #${billNumber}`,
        notes: `Sold to ${customer.name}`,
        createdAt: now,
      });
    }

    const grossProfit = totalBill - totalCost;
    const amountPaid = Math.max(0, Math.min(saleInput.amountPaid, totalBill));
    const balanceDue = totalBill - amountPaid;

    const saleRecord: SaleEntity = {
      id: saleId,
      billNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      items: saleItems,
      totalBill,
      totalCost,
      grossProfit,
      amountPaid,
      balanceDue,
      paymentMethod: saleInput.paymentMethod,
      notes: saleInput.notes,
      createdAt: now,
    };

    // 1. Record Sale
    this.state.sales.unshift(saleRecord);

    // 2. Record Stock Movements
    for (const sm of stockMovementsToLog) {
      this.state.stockMovements.unshift(sm);
    }

    // 3. Update Customer Ledger
    const updatedTotalPurchases = customer.totalPurchases + totalBill;
    const updatedTotalPaid = customer.totalPaid + amountPaid;
    const updatedOutstanding = updatedTotalPurchases - updatedTotalPaid;

    this.updateCustomer(customer.id, {
      totalPurchases: updatedTotalPurchases,
      totalPaid: updatedTotalPaid,
      outstandingBalance: updatedOutstanding,
      updatedAt: now,
    });

    // 4. Record Payment if amount paid > 0
    if (amountPaid > 0) {
      const paymentRecord: PaymentEntity = {
        id: `PAY-${Date.now().toString(36).toUpperCase()}`,
        customerId: customer.id,
        customerName: customer.name,
        saleId: saleRecord.id,
        billNumber: saleRecord.billNumber,
        amount: amountPaid,
        paymentMethod: saleInput.paymentMethod === 'Credit' ? 'Cash' : (saleInput.paymentMethod as PaymentEntity['paymentMethod']),
        notes: `Payment for Bill #${billNumber}`,
        paymentDate: now.slice(0, 10),
        createdAt: now,
      };
      this.state.payments.unshift(paymentRecord);
    }

    this.persist(this.state);
    return saleRecord;
  }

  // --- Payments & Partial Ledger Payments DAO ---
  public getPayments(): PaymentEntity[] {
    return [...this.state.payments];
  }

  public recordCustomerPayment(
    customerId: string,
    amount: number,
    paymentMethod: PaymentEntity['paymentMethod'],
    notes?: string,
    saleId?: string
  ): PaymentEntity {
    if (amount <= 0) throw new Error('Payment amount must be greater than zero.');
    const customer = this.getCustomerById(customerId);
    if (!customer) throw new Error('Customer not found.');

    const now = new Date().toISOString();
    let billNumber: string | undefined;
    if (saleId) {
      const sale = this.getSaleById(saleId);
      if (sale) {
        billNumber = sale.billNumber;
        // Also update that specific sale's paid / balance if applicable
        const newPaid = Math.min(sale.totalBill, sale.amountPaid + amount);
        sale.amountPaid = newPaid;
        sale.balanceDue = Math.max(0, sale.totalBill - newPaid);
      }
    }

    const payment: PaymentEntity = {
      id: `PAY-${Date.now().toString(36).toUpperCase()}`,
      customerId: customer.id,
      customerName: customer.name,
      saleId,
      billNumber,
      amount,
      paymentMethod,
      notes: notes || `Credit payment received from ${customer.name}`,
      paymentDate: now.slice(0, 10),
      createdAt: now,
    };

    this.state.payments.unshift(payment);

    // Update customer balances: increase totalPaid, reduce outstanding
    const newTotalPaid = customer.totalPaid + amount;
    const newBalance = Math.max(0, customer.totalPurchases - newTotalPaid);
    this.updateCustomer(customer.id, {
      totalPaid: newTotalPaid,
      outstandingBalance: newBalance,
      updatedAt: now,
    });

    this.persist(this.state);
    return payment;
  }

  // --- Returns & Credit Adjustments DAO ---
  public getReturns(): SaleReturnEntity[] {
    return this.state.returns ? [...this.state.returns] : [];
  }

  public getReturnsByCustomer(customerId: string): SaleReturnEntity[] {
    return (this.state.returns || []).filter((r) => r.customerId === customerId);
  }

  public getReturnsBySale(saleId: string): SaleReturnEntity[] {
    return (this.state.returns || []).filter((r) => r.saleId === saleId);
  }

  public processSaleReturn(input: {
    saleId: string;
    items: {
      saleItemId: string;
      productId: string;
      returnQuantity: number;
    }[];
    settlementType: 'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT';
    notes?: string;
  }): SaleReturnEntity {
    const sale = this.state.sales.find((s) => s.id === input.saleId);
    if (!sale) throw new Error('Original sale not found.');

    const customer = this.state.customers.find((c) => c.id === sale.customerId);
    if (!customer) throw new Error('Customer associated with sale not found.');

    const now = new Date().toISOString();
    const returnId = `RET-${Date.now().toString(36).toUpperCase()}`;
    let totalReturnValue = 0;
    const returnItemsSummary: SaleReturnItem[] = [];
    const stockMovementsToLog: StockMovementEntity[] = [];

    // 1. Validate requested return quantities
    for (const req of input.items) {
      if (req.returnQuantity <= 0) continue;
      const saleItem = sale.items.find(
        (i) => i.id === req.saleItemId || i.productId === req.productId
      );
      if (!saleItem) {
        throw new Error(`Item not found in bill #${sale.billNumber}.`);
      }
      const alreadyReturned = saleItem.returnedQuantity || 0;
      const eligibleQty = saleItem.quantity - alreadyReturned;
      if (req.returnQuantity > eligibleQty) {
        throw new Error(
          `Cannot return ${req.returnQuantity} of ${saleItem.productName}. Maximum eligible for return is ${eligibleQty}.`
        );
      }
    }

    // 2. Perform updates atomically
    for (const req of input.items) {
      if (req.returnQuantity <= 0) continue;
      const saleItem = sale.items.find(
        (i) => i.id === req.saleItemId || i.productId === req.productId
      )!;
      const itemReturnValue = req.returnQuantity * saleItem.sellingPrice;
      totalReturnValue += itemReturnValue;

      // Update returned quantity on item
      saleItem.returnedQuantity = (saleItem.returnedQuantity || 0) + req.returnQuantity;
      const remainingEligible = saleItem.quantity - saleItem.returnedQuantity;

      returnItemsSummary.push({
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        productName: saleItem.productName,
        unit: saleItem.unit,
        originalQuantity: saleItem.quantity,
        returnedQuantity: req.returnQuantity,
        remainingEligibleQty: remainingEligible,
        sellingPrice: saleItem.sellingPrice,
        returnValue: itemReturnValue,
      });

      // Increase existing inventory of this exact product
      const product = this.state.products.find((p) => p.id === saleItem.productId);
      if (product) {
        const previousStock = product.currentStock;
        const newStock = previousStock + req.returnQuantity;
        product.currentStock = newStock;
        product.updatedAt = now;

        stockMovementsToLog.push({
          id: `STK-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          productId: product.id,
          productName: product.name,
          type: 'RETURN',
          quantity: req.returnQuantity,
          previousStock,
          newStock,
          reference: `Bill #${sale.billNumber}`,
          notes: `Return: ${req.returnQuantity} ${saleItem.unit} returned by ${customer.name}`,
          createdAt: now,
        });
      }
    }

    if (returnItemsSummary.length === 0) {
      throw new Error('Please enter at least one valid item return quantity.');
    }

    // Log stock movements
    for (const sm of stockMovementsToLog) {
      this.state.stockMovements.unshift(sm);
    }

    // Update sale's return summary (keeps original totalBill and payment history intact)
    sale.returnedAmount = (sale.returnedAmount || 0) + totalReturnValue;
    const adjustedBillTotal = Math.max(0, sale.totalBill - sale.returnedAmount);
    sale.balanceDue = Math.max(0, adjustedBillTotal - sale.amountPaid);

    // 3. Customer Ledger Balance Adjustment
    const currentCustomerDue = customer.outstandingBalance;
    let dueAdjustment = 0;
    let refundAmount = 0;
    let creditAmount = 0;

    if (currentCustomerDue >= totalReturnValue) {
      // Return value is less than or equal to current due: adjust entire return value against due
      dueAdjustment = totalReturnValue;
      customer.totalPurchases = Math.max(0, customer.totalPurchases - totalReturnValue);
      customer.outstandingBalance = Math.max(0, customer.totalPurchases - customer.totalPaid);
    } else {
      // Return value is greater than current due
      dueAdjustment = currentCustomerDue;
      const excess = totalReturnValue - currentCustomerDue;

      if (input.settlementType === 'STORE_CREDIT') {
        creditAmount = excess;
        customer.totalPurchases = Math.max(0, customer.totalPurchases - totalReturnValue);
        customer.outstandingBalance = Math.max(0, customer.totalPurchases - customer.totalPaid);
      } else {
        // Default to REFUND (Cash/UPI returned to customer)
        refundAmount = excess;
        customer.totalPurchases = Math.max(0, customer.totalPurchases - totalReturnValue);
        customer.totalPaid = Math.max(0, customer.totalPaid - refundAmount);
        customer.outstandingBalance = Math.max(0, customer.totalPurchases - customer.totalPaid);
      }
    }
    customer.updatedAt = now;

    // 4. Record return entity
    if (!this.state.returns) this.state.returns = [];
    const returnRecord: SaleReturnEntity = {
      id: returnId,
      saleId: sale.id,
      billNumber: sale.billNumber,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      items: returnItemsSummary,
      totalReturnValue,
      dueAdjustment,
      refundAmount,
      creditAmount,
      settlementType: input.settlementType,
      notes: input.notes,
      createdAt: now,
    };

    this.state.returns.unshift(returnRecord);
    this.persist(this.state);
    return returnRecord;
  }

  // --- Stock Movements DAO ---
  public getStockMovements(): StockMovementEntity[] {
    return [...this.state.stockMovements];
  }

  // --- Database Export / Backup & Restore ---

  public getDatabaseSummary(): BackupSummaryInfo {
    const s = this.state;
    const totalOutstandingDue = s.customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const totalStockValue = s.products.reduce((sum, p) => sum + (p.currentStock * p.purchasePrice || 0), 0);

    return {
      totalProducts: s.products.length,
      totalCustomers: s.customers.length,
      totalSales: s.sales.length,
      totalPayments: s.payments.length,
      totalStockMovements: s.stockMovements.length,
      totalReturns: (s.returns || []).length,
      totalOutstandingDue,
      totalStockValue,
    };
  }

  public createSafetyRollback(): string {
    try {
      const rollbackPayload = JSON.stringify({
        savedAt: new Date().toISOString(),
        state: this.state,
      });
      localStorage.setItem(SAFETY_ROLLBACK_KEY, rollbackPayload);
      return rollbackPayload;
    } catch (e) {
      console.warn('Failed to store safety rollback snapshot:', e);
      return '';
    }
  }

  public rollbackToSafetyBackup(): boolean {
    try {
      const raw = localStorage.getItem(SAFETY_ROLLBACK_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.state && Array.isArray(parsed.state.products)) {
        this.state = parsed.state;
        this.persist(this.state);
        return true;
      }
      return false;
    } catch (e) {
      console.error('Failed to restore safety rollback:', e);
      return false;
    }
  }

  public async exportStructuredBackupJSON(): Promise<string> {
    const summary = this.getDatabaseSummary();
    const exportedAt = new Date().toISOString();

    const manifestCore = {
      app: 'MAHARAJA MARBLE Shop Management',
      appVersion: '1.0.0',
      schemaVersion: 2,
      shopIdentifier: 'MAHARAJA MARBLE',
      exportedAt,
      shopInfo: {
        shopName: this.state.settings.shopName || 'MAHARAJA MARBLE',
        ownerName: this.state.settings.ownerName || 'HAIDAR ALI',
        phone: this.state.settings.phone || '9931683424',
        address: this.state.settings.address || 'College Road, Supaul, Biraul, Darbhanga – 847203',
        currencySymbol: this.state.settings.currencySymbol || '₹',
      },
      summary,
      data: {
        version: this.state.version || 2,
        products: this.state.products,
        customers: this.state.customers,
        sales: this.state.sales,
        payments: this.state.payments,
        returns: this.state.returns || [],
        stockMovements: this.state.stockMovements,
        settings: this.state.settings,
      },
    };

    // Calculate SHA-256 checksum over data payload
    let checksum = 'auto-gen-hash';
    try {
      if (typeof window !== 'undefined' && window.crypto?.subtle) {
        const text = JSON.stringify(manifestCore.data);
        const buffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        checksum = Array.from(new Uint8Array(buffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      }
    } catch (err) {
      console.warn('Checksum calculation error:', err);
    }

    const fullManifest: BackupManifest = {
      ...manifestCore,
      checksum,
    };

    return JSON.stringify(fullManifest, null, 2);
  }

  public exportJSONBackup(): string {
    const summary = this.getDatabaseSummary();
    const exportState = {
      app: 'MAHARAJA MARBLE Shop Management',
      appVersion: '1.0.0',
      schemaVersion: 2,
      shopIdentifier: 'MAHARAJA MARBLE',
      exportedAt: new Date().toISOString(),
      shopInfo: {
        shopName: this.state.settings.shopName,
        ownerName: this.state.settings.ownerName,
        phone: this.state.settings.phone,
        address: this.state.settings.address,
        currencySymbol: this.state.settings.currencySymbol,
      },
      summary,
      ...this.state,
      data: {
        ...this.state,
      },
    };
    return JSON.stringify(exportState, null, 2);
  }

  public validateBackupPayload(jsonString: string): {
    isValid: boolean;
    summary?: BackupSummaryInfo;
    exportedAt?: string;
    schemaVersion?: number;
    shopName?: string;
    error?: string;
    extractedData?: ShopDatabaseState;
  } {
    try {
      if (!jsonString || typeof jsonString !== 'string') {
        return { isValid: false, error: 'Empty or invalid file content.' };
      }

      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        return { isValid: false, error: 'File is not a valid JSON object.' };
      }

      // Check whether payload is formatted as structured BackupManifest or raw database state
      let dbData: any = null;
      let exportedAt = parsed.exportedAt || new Date().toISOString();
      let schemaVersion = parsed.schemaVersion || 1;
      let shopName = parsed.shopInfo?.shopName || parsed.shopIdentifier || parsed.settings?.shopName || 'MAHARAJA MARBLE';

      if (parsed.data && Array.isArray(parsed.data.products) && Array.isArray(parsed.data.customers)) {
        dbData = parsed.data;
      } else if (Array.isArray(parsed.products) && Array.isArray(parsed.customers)) {
        dbData = parsed;
      } else {
        return {
          isValid: false,
          error: 'Required database collections (products, customers) not found in backup file.',
        };
      }

      // Validate arrays integrity
      if (!Array.isArray(dbData.products)) {
        return { isValid: false, error: 'Products table is corrupted or missing.' };
      }
      if (!Array.isArray(dbData.customers)) {
        return { isValid: false, error: 'Customers table is corrupted or missing.' };
      }

      const totalOutstandingDue = dbData.customers.reduce((sum: number, c: any) => sum + (Number(c.outstandingBalance) || 0), 0);
      const totalStockValue = dbData.products.reduce((sum: number, p: any) => sum + (Number(p.currentStock) * Number(p.purchasePrice) || 0), 0);

      const summary: BackupSummaryInfo = {
        totalProducts: dbData.products.length,
        totalCustomers: dbData.customers.length,
        totalSales: Array.isArray(dbData.sales) ? dbData.sales.length : 0,
        totalPayments: Array.isArray(dbData.payments) ? dbData.payments.length : 0,
        totalStockMovements: Array.isArray(dbData.stockMovements) ? dbData.stockMovements.length : 0,
        totalReturns: Array.isArray(dbData.returns) ? dbData.returns.length : 0,
        totalOutstandingDue,
        totalStockValue,
      };

      const cleanState: ShopDatabaseState = {
        version: dbData.version || 2,
        products: dbData.products,
        customers: dbData.customers,
        sales: Array.isArray(dbData.sales) ? dbData.sales : [],
        payments: Array.isArray(dbData.payments) ? dbData.payments : [],
        returns: Array.isArray(dbData.returns) ? dbData.returns : [],
        stockMovements: Array.isArray(dbData.stockMovements) ? dbData.stockMovements : [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...(dbData.settings || {}),
        },
      };

      return {
        isValid: true,
        summary,
        exportedAt,
        schemaVersion,
        shopName,
        extractedData: cleanState,
      };
    } catch (err: any) {
      return {
        isValid: false,
        error: `JSON parsing failed: ${err.message || 'Malformed backup file'}`,
      };
    }
  }

  public restoreDatabase(jsonString: string): {
    success: boolean;
    restoredCounts: BackupSummaryInfo;
  } {
    // 1. Create a local safety rollback snapshot before altering state
    this.createSafetyRollback();

    try {
      const validation = this.validateBackupPayload(jsonString);
      if (!validation.isValid || !validation.extractedData) {
        throw new Error(validation.error || 'Failed to validate backup structure.');
      }

      const restored = validation.extractedData;

      // 2. Perform relational recalculation & integrity check
      for (const customer of restored.customers) {
        const custSales = restored.sales.filter((s) => s.customerId === customer.id);
        const custPayments = restored.payments.filter((p) => p.customerId === customer.id);
        const custReturns = (restored.returns || []).filter((r) => r.customerId === customer.id);

        const totalBilled = custSales.reduce((sum, s) => sum + (s.totalBill || 0), 0);
        const totalPaid = custPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalReturned = custReturns.reduce((sum, r) => sum + (r.dueAdjustment || 0), 0);

        // Keep values consistent
        if (customer.totalPurchases === undefined || customer.totalPurchases === 0) {
          customer.totalPurchases = totalBilled;
        }
        if (customer.totalPaid === undefined) {
          customer.totalPaid = totalPaid;
        }
        customer.outstandingBalance = Math.max(0, customer.totalPurchases - customer.totalPaid - totalReturned);
      }

      // 3. Atomically assign and persist new state
      this.state = {
        version: restored.version || 2,
        products: restored.products,
        customers: restored.customers,
        sales: restored.sales,
        payments: restored.payments,
        returns: restored.returns || [],
        stockMovements: restored.stockMovements,
        settings: {
          ...DEFAULT_SETTINGS,
          ...restored.settings,
        },
      };

      this.persist(this.state);

      return {
        success: true,
        restoredCounts: validation.summary || this.getDatabaseSummary(),
      };
    } catch (err: any) {
      console.error('Database restore error, rolling back to safety snapshot:', err);
      this.rollbackToSafetyBackup();
      throw err;
    }
  }

  public importJSONBackup(jsonString: string): boolean {
    const res = this.restoreDatabase(jsonString);
    return res.success;
  }

  public exportSQLiteDump(): string {
    const s = this.state;
    const lines: string[] = [
      `-- =====================================================================`,
      `-- DukanDesk: Android Room Database SQLite Dump`,
      `-- Database Name: shop_management.db`,
      `-- Export Timestamp: ${new Date().toISOString()}`,
      `-- Platform: Android Room (Architecture Components / SQLite 3)`,
      `-- =====================================================================`,
      `PRAGMA foreign_keys = ON;`,
      ``,
      `-- Room Master Table`,
      `CREATE TABLE IF NOT EXISTS room_master_table (id INTEGER PRIMARY KEY, identity_hash TEXT);`,
      `INSERT OR REPLACE INTO room_master_table (id, identity_hash) VALUES(42, '4c9d4b2e88a0ff1123456789abcdef01');`,
      ``,
      `-- Table: products (@Entity(tableName = "products"))`,
      `CREATE TABLE IF NOT EXISTS products (`,
      `    id TEXT PRIMARY KEY NOT NULL,`,
      `    name TEXT NOT NULL,`,
      `    photoUrl TEXT,`,
      `    category TEXT NOT NULL,`,
      `    brand TEXT NOT NULL,`,
      `    producer TEXT NOT NULL,`,
      `    supplier TEXT NOT NULL,`,
      `    unit TEXT NOT NULL,`,
      `    purchasePrice REAL NOT NULL,`,
      `    sellingPrice REAL NOT NULL,`,
      `    currentStock REAL NOT NULL,`,
      `    minStockLevel REAL NOT NULL,`,
      `    createdAt TEXT NOT NULL,`,
      `    updatedAt TEXT NOT NULL`,
      `);`,
      ``,
      `-- Table: customers (@Entity(tableName = "customers"))`,
      `CREATE TABLE IF NOT EXISTS customers (`,
      `    id TEXT PRIMARY KEY NOT NULL,`,
      `    name TEXT NOT NULL,`,
      `    phone TEXT NOT NULL,`,
      `    address TEXT NOT NULL,`,
      `    totalPurchases REAL NOT NULL,`,
      `    totalPaid REAL NOT NULL,`,
      `    outstandingBalance REAL NOT NULL,`,
      `    createdAt TEXT NOT NULL,`,
      `    updatedAt TEXT NOT NULL`,
      `);`,
      ``,
      `-- Table: sales (@Entity(tableName = "sales"))`,
      `CREATE TABLE IF NOT EXISTS sales (`,
      `    id TEXT PRIMARY KEY NOT NULL,`,
      `    billNumber TEXT NOT NULL UNIQUE,`,
      `    customerId TEXT NOT NULL,`,
      `    customerName TEXT NOT NULL,`,
      `    customerPhone TEXT,`,
      `    totalBill REAL NOT NULL,`,
      `    totalCost REAL NOT NULL,`,
      `    grossProfit REAL NOT NULL,`,
      `    amountPaid REAL NOT NULL,`,
      `    balanceDue REAL NOT NULL,`,
      `    paymentMethod TEXT NOT NULL,`,
      `    notes TEXT,`,
      `    createdAt TEXT NOT NULL,`,
      `    FOREIGN KEY(customerId) REFERENCES customers(id) ON DELETE RESTRICT`,
      `);`,
      ``,
      `-- Table: sale_items (@Entity(tableName = "sale_items"))`,
      `CREATE TABLE IF NOT EXISTS sale_items (`,
      `    id TEXT PRIMARY KEY NOT NULL,`,
      `    saleId TEXT NOT NULL,`,
      `    productId TEXT NOT NULL,`,
      `    productName TEXT NOT NULL,`,
      `    unit TEXT NOT NULL,`,
      `    quantity REAL NOT NULL,`,
      `    purchasePrice REAL NOT NULL,`,
      `    sellingPrice REAL NOT NULL,`,
      `    subtotal REAL NOT NULL,`,
      `    itemCost REAL NOT NULL,`,
      `    grossProfit REAL NOT NULL,`,
      `    FOREIGN KEY(saleId) REFERENCES sales(id) ON DELETE CASCADE,`,
      `    FOREIGN KEY(productId) REFERENCES products(id) ON DELETE RESTRICT`,
      `);`,
      ``,
      `-- Table: payments (@Entity(tableName = "payments"))`,
      `CREATE TABLE IF NOT EXISTS payments (`,
      `    id TEXT PRIMARY KEY NOT NULL,`,
      `    customerId TEXT NOT NULL,`,
      `    customerName TEXT NOT NULL,`,
      `    saleId TEXT,`,
      `    billNumber TEXT,`,
      `    amount REAL NOT NULL,`,
      `    paymentMethod TEXT NOT NULL,`,
      `    notes TEXT,`,
      `    paymentDate TEXT NOT NULL,`,
      `    createdAt TEXT NOT NULL,`,
      `    FOREIGN KEY(customerId) REFERENCES customers(id) ON DELETE RESTRICT`,
      `);`,
      ``,
      `-- Table: stock_movements (@Entity(tableName = "stock_movements"))`,
      `CREATE TABLE IF NOT EXISTS stock_movements (`,
      `    id TEXT PRIMARY KEY NOT NULL,`,
      `    productId TEXT NOT NULL,`,
      `    productName TEXT NOT NULL,`,
      `    type TEXT NOT NULL,`,
      `    quantity REAL NOT NULL,`,
      `    previousStock REAL NOT NULL,`,
      `    newStock REAL NOT NULL,`,
      `    unitPrice REAL,`,
      `    reference TEXT NOT NULL,`,
      `    notes TEXT,`,
      `    createdAt TEXT NOT NULL,`,
      `    FOREIGN KEY(productId) REFERENCES products(id) ON DELETE CASCADE`,
      `);`,
      ``,
      `-- Table: settings`,
      `CREATE TABLE IF NOT EXISTS settings (`,
      `    key TEXT PRIMARY KEY NOT NULL,`,
      `    value TEXT NOT NULL`,
      `);`,
      ``,
      `-- DML: Insert Settings`,
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('shopName', '${s.settings.shopName.replace(/'/g, "''")}');`,
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('ownerName', '${s.settings.ownerName.replace(/'/g, "''")}');`,
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('currencySymbol', '${s.settings.currencySymbol}');`,
      ``,
      `-- DML: Insert Products (${s.products.length} records)`,
    ];

    for (const p of s.products) {
      lines.push(
        `INSERT OR REPLACE INTO products (id, name, category, brand, producer, supplier, unit, purchasePrice, sellingPrice, currentStock, minStockLevel, createdAt, updatedAt) VALUES (` +
        `'${p.id}', '${p.name.replace(/'/g, "''")}', '${p.category.replace(/'/g, "''")}', '${p.brand.replace(/'/g, "''")}', '${p.producer.replace(/'/g, "''")}', '${p.supplier.replace(/'/g, "''")}', '${p.unit}', ${p.purchasePrice}, ${p.sellingPrice}, ${p.currentStock}, ${p.minStockLevel}, '${p.createdAt}', '${p.updatedAt}');`
      );
    }

    lines.push(``, `-- DML: Insert Customers (${s.customers.length} records)`);
    for (const c of s.customers) {
      lines.push(
        `INSERT OR REPLACE INTO customers (id, name, phone, address, totalPurchases, totalPaid, outstandingBalance, createdAt, updatedAt) VALUES (` +
        `'${c.id}', '${c.name.replace(/'/g, "''")}', '${c.phone.replace(/'/g, "''")}', '${c.address.replace(/'/g, "''")}', ${c.totalPurchases}, ${c.totalPaid}, ${c.outstandingBalance}, '${c.createdAt}', '${c.updatedAt}');`
      );
    }

    lines.push(``, `-- DML: Insert Sales (${s.sales.length} records)`);
    for (const sale of s.sales) {
      lines.push(
        `INSERT OR REPLACE INTO sales (id, billNumber, customerId, customerName, totalBill, totalCost, grossProfit, amountPaid, balanceDue, paymentMethod, notes, createdAt) VALUES (` +
        `'${sale.id}', '${sale.billNumber}', '${sale.customerId}', '${sale.customerName.replace(/'/g, "''")}', ${sale.totalBill}, ${sale.totalCost}, ${sale.grossProfit}, ${sale.amountPaid}, ${sale.balanceDue}, '${sale.paymentMethod}', '${(sale.notes || '').replace(/'/g, "''")}', '${sale.createdAt}');`
      );
      for (const item of sale.items) {
        lines.push(
          `INSERT OR REPLACE INTO sale_items (id, saleId, productId, productName, unit, quantity, purchasePrice, sellingPrice, subtotal, itemCost, grossProfit) VALUES (` +
          `'${item.id}', '${item.saleId}', '${item.productId}', '${item.productName.replace(/'/g, "''")}', '${item.unit}', ${item.quantity}, ${item.purchasePrice}, ${item.sellingPrice}, ${item.subtotal}, ${item.itemCost}, ${item.grossProfit});`
        );
      }
    }

    lines.push(``, `-- DML: Insert Payments (${s.payments.length} records)`);
    for (const pay of s.payments) {
      lines.push(
        `INSERT OR REPLACE INTO payments (id, customerId, customerName, saleId, billNumber, amount, paymentMethod, notes, paymentDate, createdAt) VALUES (` +
        `'${pay.id}', '${pay.customerId}', '${pay.customerName.replace(/'/g, "''")}', ${pay.saleId ? `'${pay.saleId}'` : 'NULL'}, ${pay.billNumber ? `'${pay.billNumber}'` : 'NULL'}, ${pay.amount}, '${pay.paymentMethod}', '${(pay.notes || '').replace(/'/g, "''")}', '${pay.paymentDate}', '${pay.createdAt}');`
      );
    }

    lines.push(``, `-- DML: Insert Stock Movements (${s.stockMovements.length} records)`);
    for (const sm of s.stockMovements) {
      lines.push(
        `INSERT OR REPLACE INTO stock_movements (id, productId, productName, type, quantity, previousStock, newStock, unitPrice, reference, notes, createdAt) VALUES (` +
        `'${sm.id}', '${sm.productId}', '${sm.productName.replace(/'/g, "''")}', '${sm.type}', ${sm.quantity}, ${sm.previousStock}, ${sm.newStock}, ${sm.unitPrice ?? 'NULL'}, '${sm.reference.replace(/'/g, "''")}', '${(sm.notes || '').replace(/'/g, "''")}', '${sm.createdAt}');`
      );
    }

    lines.push(``, `-- Indices for high performance queries`,
      `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);`,
      `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customerId);`,
      `CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customerId);`,
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON stock_movements(productId);`,
      `COMMIT;`
    );

    return lines.join('\n');
  }

  public resetToSampleData(): void {
    const defaultState: ShopDatabaseState = {
      version: 1,
      products: INITIAL_PRODUCTS,
      customers: INITIAL_CUSTOMERS,
      sales: INITIAL_SALES,
      payments: INITIAL_PAYMENTS,
      stockMovements: INITIAL_STOCK_MOVEMENTS,
      settings: DEFAULT_SETTINGS,
    };
    this.state = defaultState;
    this.persist(defaultState);
  }

  public clearAllData(freshPin?: string): void {
    const currentSettings = this.state.settings || DEFAULT_SETTINGS;
    const cleanState: ShopDatabaseState = {
      version: 2,
      products: [],
      customers: [],
      sales: [],
      payments: [],
      returns: [],
      stockMovements: [],
      settings: {
        ...currentSettings,
        ...(freshPin ? { pin: freshPin, isPinSet: true } : {}),
      },
    };
    this.state = cleanState;
    this.persist(cleanState);
  }
}

export const roomDb = new RoomDatabaseManager();
