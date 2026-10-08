import React, { useState, useMemo, useRef } from 'react';
import {
  RotateCcw,
  Camera,
  Upload,
  Sparkles,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  User,
  Package,
  Layers,
  Phone,
  ArrowRight,
  TrendingDown,
  Wallet,
  ShieldCheck,
  FileText,
  Check,
  Loader2,
  Image as ImageIcon,
  ChevronDown,
} from 'lucide-react';
import {
  CustomerEntity,
  SaleEntity,
  ProductEntity,
  OwnerSettingsEntity,
  SaleReturnEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';
import {
  ProposedBillData,
  ProposedBillItem,
  analyzeBillPhoto,
  fileToBase64,
  generateDemoBillImage,
  matchItemWithProducts,
} from '../services/billAnalysisService';

export type ReturnEntryMode = 'MANUAL' | 'PHOTO';

interface ReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerEntity[];
  sales: SaleEntity[];
  products: ProductEntity[];
  settings: OwnerSettingsEntity;
  onConfirmReturn: (input: {
    saleId: string;
    items: {
      saleItemId: string;
      productId: string;
      returnQuantity: number;
    }[];
    settlementType: 'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT';
    notes?: string;
  }) => SaleReturnEntity;
}

export const ReturnModal: React.FC<ReturnModalProps> = ({
  isOpen,
  onClose,
  customers,
  sales,
  products,
  settings,
  onConfirmReturn,
}) => {
  // Mode selection: MANUAL vs PHOTO
  const [entryMode, setEntryMode] = useState<ReturnEntryMode>('MANUAL');

  // Manual & Shared Selection State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');

  // Return item quantities (mapping: saleItemId -> returnQuantity)
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [settlementType, setSettlementType] = useState<'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT'>('REFUND');
  const [returnNotes, setReturnNotes] = useState('');

  // Bill Photo Mode specific state
  const [photoFile, setPhotoFile] = useState<string | null>(null);
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<ProposedBillData | null>(null);

  // File input refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Confirmation modal & completion state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [completedReturn, setCompletedReturn] = useState<SaleReturnEntity | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Reset state when closing
  const handleClose = () => {
    setEntryMode('MANUAL');
    setSelectedCustomerId('');
    setCustomerSearchQuery('');
    setSelectedSaleId('');
    setReturnQuantities({});
    setReturnNotes('');
    setPhotoFile(null);
    setPhotoFileName('');
    setIsAnalyzingPhoto(false);
    setPhotoDraft(null);
    setShowConfirmDialog(false);
    setCompletedReturn(null);
    setErrorMessage('');
    onClose();
  };

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customers;
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q)
    );
  }, [customers, customerSearchQuery]);

  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Sales belonging to the selected customer
  const customerSales = useMemo(() => {
    if (!selectedCustomerId) return [];
    return sales.filter((s) => s.customerId === selectedCustomerId);
  }, [sales, selectedCustomerId]);

  const selectedSale = useMemo(() => {
    if (!selectedSaleId) return null;
    return sales.find((s) => s.id === selectedSaleId) || null;
  }, [sales, selectedSaleId]);

  // Handle manual customer selection
  const handleSelectCustomer = (custId: string) => {
    setSelectedCustomerId(custId);
    setSelectedSaleId('');
    setReturnQuantities({});
    setErrorMessage('');

    // If customer has only 1 sale, pre-select it for convenience
    const matchingSales = sales.filter((s) => s.customerId === custId);
    if (matchingSales.length === 1) {
      setSelectedSaleId(matchingSales[0].id);
    }
  };

  // Handle return quantity change for a specific sale item
  const handleQuantityChange = (saleItemId: string, maxEligible: number, val: number) => {
    setErrorMessage('');
    const clamped = Math.max(0, Math.min(val, maxEligible));
    setReturnQuantities((prev) => ({
      ...prev,
      [saleItemId]: clamped,
    }));
  };

  // Calculate return items summary
  const itemsToReturn = useMemo(() => {
    if (!selectedSale) return [];
    return selectedSale.items
      .map((item) => {
        const alreadyReturned = item.returnedQuantity || 0;
        const eligibleQty = Math.max(0, item.quantity - alreadyReturned);
        const returnQty = returnQuantities[item.id] || 0;
        const itemReturnValue = returnQty * item.sellingPrice;
        return {
          saleItem: item,
          alreadyReturned,
          eligibleQty,
          returnQty,
          itemReturnValue,
        };
      })
      .filter((i) => i.returnQty > 0);
  }, [selectedSale, returnQuantities]);

  const totalReturnValue = useMemo(() => {
    return itemsToReturn.reduce((sum, i) => sum + i.itemReturnValue, 0);
  }, [itemsToReturn]);

  // Financial impact calculation
  const currentCustomerDue = selectedCustomer ? selectedCustomer.outstandingBalance : 0;
  const dueAdjustment = Math.min(currentCustomerDue, totalReturnValue);
  const excessAmount = Math.max(0, totalReturnValue - currentCustomerDue);
  const newDue = Math.max(0, currentCustomerDue - dueAdjustment);

  // ==========================================
  // BILL PHOTO MATCHING ENGINE
  // ==========================================
  interface CandidateMatch {
    sale: SaleEntity;
    score: number;
    matchReasons: string[];
    isExactBillMatch: boolean;
  }

  const candidateSaleMatches = useMemo((): CandidateMatch[] => {
    if (!photoDraft || sales.length === 0) return [];

    const extractedBill = (photoDraft.billNumber || '').toLowerCase().trim();
    const extractedCustName = (photoDraft.detectedCustomerName || '').toLowerCase().trim();
    const extractedCustPhone = (photoDraft.detectedCustomerPhone || '').replace(/\D/g, '');

    const candidates: CandidateMatch[] = [];

    for (const sale of sales) {
      let score = 0;
      const reasons: string[] = [];
      let isExact = false;

      // 1. Exact or partial Bill / Invoice Number match
      const saleBill = (sale.billNumber || '').toLowerCase().trim();
      const saleId = sale.id.toLowerCase();

      if (extractedBill) {
        if (saleBill === extractedBill || saleId === extractedBill) {
          score += 100;
          isExact = true;
          reasons.push(`Exact Bill Number match (#${sale.billNumber})`);
        } else if (
          saleBill.includes(extractedBill) ||
          extractedBill.includes(saleBill) ||
          saleId.includes(extractedBill)
        ) {
          score += 75;
          reasons.push(`Close Bill Number match (#${sale.billNumber})`);
        }
      }

      // 2. Customer Name / Phone match
      const saleCustName = (sale.customerName || '').toLowerCase().trim();
      if (extractedCustName && saleCustName) {
        if (saleCustName === extractedCustName) {
          score += 50;
          reasons.push(`Customer match (${sale.customerName})`);
        } else if (
          saleCustName.includes(extractedCustName) ||
          extractedCustName.includes(saleCustName)
        ) {
          score += 35;
          reasons.push(`Customer name similar (${sale.customerName})`);
        }
      }

      if (extractedCustPhone && extractedCustPhone.length >= 6) {
        const custObj = customers.find((c) => c.id === sale.customerId);
        const custPhone = custObj?.phone?.replace(/\D/g, '') || '';
        if (custPhone && custPhone.includes(extractedCustPhone)) {
          score += 40;
          reasons.push(`Customer phone match (${custPhone})`);
        }
      }

      // 3. Product match overlap
      if (photoDraft.items && photoDraft.items.length > 0) {
        let matchingProductCount = 0;
        for (const extractedItem of photoDraft.items) {
          const hasMatchingSaleItem = sale.items.some((si) => {
            if (extractedItem.matchedProductId && si.productId === extractedItem.matchedProductId) {
              return true;
            }
            const sName = si.productName.toLowerCase();
            const dName = extractedItem.detectedName.toLowerCase();
            return sName.includes(dName) || dName.includes(sName);
          });
          if (hasMatchingSaleItem) {
            matchingProductCount++;
          }
        }
        if (matchingProductCount > 0) {
          score += matchingProductCount * 20;
          reasons.push(`${matchingProductCount} bill item(s) matched`);
        }
      }

      // 4. Total amount similarity
      if (photoDraft.totalAmount > 0 && Math.abs(sale.totalBill - photoDraft.totalAmount) < 2) {
        score += 25;
        reasons.push(`Bill total matches (${formatCurrency(sale.totalBill, settings.currencySymbol)})`);
      }

      if (score >= 25) {
        candidates.push({
          sale,
          score,
          matchReasons: reasons,
          isExactBillMatch: isExact,
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  }, [photoDraft, sales, customers, settings]);

  // Handle Photo Analysis
  const handleProcessBillImage = async (base64Data: string, fileName: string, mimeType: string = 'image/jpeg') => {
    setErrorMessage('');
    setPhotoFile(base64Data);
    setPhotoFileName(fileName);
    setIsAnalyzingPhoto(true);

    try {
      const result = await analyzeBillPhoto(base64Data, mimeType, products, customers);
      setPhotoDraft(result);
      setIsAnalyzingPhoto(false);

      // Auto-match sale
      const extractedBill = (result.billNumber || '').toLowerCase().trim();
      const extractedCust = (result.detectedCustomerName || '').toLowerCase().trim();

      // Find top matching sale
      let bestSale: SaleEntity | null = null;

      // Check exact bill number first
      if (extractedBill) {
        const exact = sales.find(
          (s) =>
            s.billNumber?.toLowerCase().trim() === extractedBill ||
            s.id.toLowerCase() === extractedBill
        );
        if (exact) bestSale = exact;
      }

      // Next check candidate scores
      if (!bestSale && sales.length > 0) {
        // Look in customer sales if customer matches
        if (extractedCust) {
          const cust = customers.find(
            (c) =>
              c.name.toLowerCase().includes(extractedCust) ||
              extractedCust.includes(c.name.toLowerCase())
          );
          if (cust) {
            const custSales = sales.filter((s) => s.customerId === cust.id);
            if (custSales.length > 0) {
              bestSale = custSales[0];
            }
          }
        }
      }

      if (bestSale) {
        setSelectedCustomerId(bestSale.customerId);
        setSelectedSaleId(bestSale.id);

        // Pre-populate return quantities from photo draft
        applyPhotoExtractedQuantitiesToSale(bestSale, result.items);
      } else if (sales.length > 0) {
        // Fallback: don't force, let user pick
        setSelectedSaleId('');
      }
    } catch (err: any) {
      console.warn('Bill photo analysis warning:', err);
      setIsAnalyzingPhoto(false);
      setErrorMessage(err.message || 'Could not analyze bill photo. Please verify details manually.');
    }
  };

  // Pre-fill quantities from extracted photo items onto the matched sale items
  const applyPhotoExtractedQuantitiesToSale = (sale: SaleEntity, extractedItems: ProposedBillItem[]) => {
    const newQtyMap: Record<string, number> = {};

    for (const saleItem of sale.items) {
      const alreadyReturned = saleItem.returnedQuantity || 0;
      const eligibleQty = Math.max(0, saleItem.quantity - alreadyReturned);

      if (eligibleQty <= 0) continue;

      // Find if this item was in the photo
      const matchingExtracted = extractedItems.find((ei) => {
        if (ei.matchedProductId && ei.matchedProductId === saleItem.productId) return true;
        const eName = ei.detectedName.toLowerCase();
        const sName = saleItem.productName.toLowerCase();
        return sName.includes(eName) || eName.includes(sName);
      });

      if (matchingExtracted) {
        const detectedQty = Math.max(1, Number(matchingExtracted.quantity) || 1);
        // Clamp to eligible quantity remaining on this sale
        newQtyMap[saleItem.id] = Math.min(detectedQty, eligibleQty);
      }
    }

    setReturnQuantities(newQtyMap);
  };

  const handleSelectMatchedSale = (sale: SaleEntity) => {
    setSelectedCustomerId(sale.customerId);
    setSelectedSaleId(sale.id);
    setErrorMessage('');
    if (photoDraft) {
      applyPhotoExtractedQuantitiesToSale(sale, photoDraft.items);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      await handleProcessBillImage(base64, file.name, file.type || 'image/jpeg');
    }
    e.target.value = '';
  };

  const handleUseDemoBill = async () => {
    const demoBase64 = generateDemoBillImage();
    await handleProcessBillImage(demoBase64, 'sample_bill_receipt.png', 'image/svg+xml');
  };

  // Validate and open confirmation dialog
  const handleReviewReturn = () => {
    setErrorMessage('');
    if (!selectedSale) {
      setErrorMessage('Please select the original sale/bill first.');
      return;
    }
    if (itemsToReturn.length === 0) {
      setErrorMessage('Please enter a return quantity greater than 0 for at least one item.');
      return;
    }
    for (const item of itemsToReturn) {
      if (item.returnQty > item.eligibleQty) {
        setErrorMessage(
          `Return quantity for ${item.saleItem.productName} cannot exceed ${item.eligibleQty} ${item.saleItem.unit}.`
        );
        return;
      }
    }
    setShowConfirmDialog(true);
  };

  // Confirm and execute the return
  const handleExecuteReturn = () => {
    if (!selectedSale || itemsToReturn.length === 0) return;
    try {
      const notePrefix = entryMode === 'PHOTO' && photoDraft?.billNumber ? `[Bill Photo #${photoDraft.billNumber}] ` : '';
      const finalNotes = (notePrefix + (returnNotes || '')).trim() || undefined;

      const returnPayload = {
        saleId: selectedSale.id,
        items: itemsToReturn.map((i) => ({
          saleItemId: i.saleItem.id,
          productId: i.saleItem.productId,
          returnQuantity: i.returnQty,
        })),
        settlementType: excessAmount > 0 ? settlementType : 'DUE_ADJUSTMENT',
        notes: finalNotes,
      };

      const result = onConfirmReturn(returnPayload);
      setCompletedReturn(result);
      setShowConfirmDialog(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process return.');
      setShowConfirmDialog(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Customer Sale Return</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                  Bill Linked
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Return sold products, restock inventory & adjust customer dues automatically
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File Inputs for Bill Photo */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* TWO-MODE ENTRY SELECTOR (Manual Entry vs Add from Bill Photo) */}
        {!completedReturn && (
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEntryMode('MANUAL');
                setErrorMessage('');
              }}
              className={`py-2.5 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                entryMode === 'MANUAL'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <RotateCcw className="w-4 h-4 text-rose-200" />
              <span>Manual Entry</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEntryMode('PHOTO');
                setErrorMessage('');
              }}
              className={`py-2.5 px-3 sm:px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                entryMode === 'PHOTO'
                  ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg shadow-rose-950/60'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Camera className="w-4 h-4 text-amber-300" />
              <span>Add from Bill Photo</span>
            </button>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="space-y-4 overflow-y-auto pr-1 flex-1">
          {completedReturn ? (
            /* SUCCESS CONFIRMATION STATE */
            <div className="text-center py-6 px-4 space-y-4 bg-slate-950/70 border border-emerald-500/30 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-white">Return Processed Successfully</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Return reference ID: <strong className="font-mono text-emerald-400">{completedReturn.id}</strong> (Original Bill #{completedReturn.billNumber})
                </p>
              </div>

              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-left p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <span className="text-slate-400 text-[10px] block">Customer</span>
                  <span className="font-bold text-white truncate block">{completedReturn.customerName}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Return Value</span>
                  <span className="font-mono font-bold text-rose-400">
                    {formatCurrency(completedReturn.totalReturnValue, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Due Adjusted</span>
                  <span className="font-mono font-bold text-emerald-400">
                    -{formatCurrency(completedReturn.dueAdjustment, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Refund/Credit</span>
                  <span className="font-mono font-bold text-amber-400">
                    {completedReturn.refundAmount > 0
                      ? `Refund ${formatCurrency(completedReturn.refundAmount, settings.currencySymbol)}`
                      : completedReturn.creditAmount > 0
                      ? `Credit ${formatCurrency(completedReturn.creditAmount, settings.currencySymbol)}`
                      : 'None (Full Due)'}
                  </span>
                </div>
              </div>

              {/* Items Restocked List */}
              <div className="text-left text-xs bg-slate-900 p-3 rounded-xl border border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-300 text-[11px] flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Items Restocked into Inventory:</span>
                </div>
                {completedReturn.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-slate-300 py-1 border-t border-slate-800/60 text-[11px]">
                    <span>
                      {it.productName} ({it.returnedQuantity} {it.unit} @ {formatCurrency(it.sellingPrice, settings.currencySymbol)})
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      +{it.returnedQuantity} {it.unit} added to stock
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  Done & Close
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ========================================================== */}
              {/* MODE 2: BILL PHOTO UPLOAD & SMART BILL MATCHING UI       */}
              {/* ========================================================== */}
              {entryMode === 'PHOTO' && (
                <div className="space-y-3">
                  {!photoFile ? (
                    /* Initial Upload / Camera Prompt */
                    <div className="p-4 rounded-2xl bg-slate-950/90 border border-amber-500/30 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Scan Original Sale Bill Photo</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto mt-0.5">
                          Take a photo or upload an existing bill receipt. DukanDesk AI will read the bill number, items and quantities, and match the original sale.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-950/60 cursor-pointer active:scale-95 transition-all"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Take Photo (Camera)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => galleryInputRef.current?.click()}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 border border-slate-700 cursor-pointer active:scale-95 transition-all"
                        >
                          <Upload className="w-4 h-4 text-emerald-400" />
                          <span>Upload from Gallery</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleUseDemoBill}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-amber-300 font-semibold text-xs flex items-center gap-1.5 border border-amber-500/30 cursor-pointer active:scale-95 transition-all"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          <span>Try Sample Bill</span>
                        </button>
                      </div>
                    </div>
                  ) : isAnalyzingPhoto ? (
                    /* Analyzing State */
                    <div className="p-6 rounded-2xl bg-slate-950 border border-amber-500/40 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto animate-pulse">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">Analyzing Original Bill Photo...</h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Reading bill number, customer details, product lines, and return quantities.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Photo Analyzed & Match Review */
                    <div className="space-y-3">
                      {/* Photo Header Summary */}
                      <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {photoFile && (
                            <img
                              src={photoFile}
                              alt="Original Bill"
                              className="w-10 h-10 object-cover rounded-lg border border-slate-700 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-white truncate flex items-center gap-1.5">
                              <span>Photo: {photoFileName || 'Bill Receipt'}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-mono">
                                Extracted
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              Detected Bill: <strong className="text-slate-200 font-mono">{photoDraft?.billNumber || 'Unspecified'}</strong> · Cust: <strong className="text-slate-200">{photoDraft?.detectedCustomerName || 'Unspecified'}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => galleryInputRef.current?.click()}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium"
                          >
                            Retake Photo
                          </button>
                        </div>
                      </div>

                      {/* MATCHED SALE NOTIFICATION / SELECTION */}
                      <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Matched Original Sale in DukanDesk</span>
                          </label>
                          {candidateSaleMatches.length > 1 && (
                            <span className="text-[10px] text-amber-400 font-medium">
                              {candidateSaleMatches.length} candidate bills found
                            </span>
                          )}
                        </div>

                        {selectedSale ? (
                          /* Highlighted Matched Sale Card */
                          <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/40 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-emerald-400 text-xs">
                                  BILL #{selectedSale.billNumber}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300">
                                  Matched
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(selectedSale.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                              <div>
                                <span className="text-slate-400 text-[10px] block">Customer</span>
                                <strong className="text-white truncate block">{selectedSale.customerName}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[10px] block">Original Total</span>
                                <strong className="font-mono text-white">
                                  {formatCurrency(selectedSale.totalBill, settings.currencySymbol)}
                                </strong>
                              </div>
                              <div>
                                <span className="text-slate-400 text-[10px] block">Balance Due</span>
                                <strong className={selectedSale.balanceDue > 0 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono'}>
                                  {formatCurrency(selectedSale.balanceDue, settings.currencySymbol)}
                                </strong>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* No confident match - show candidates or manual selector */
                          <div className="space-y-2">
                            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-300">
                              Please select which original bill corresponds to this return:
                            </div>

                            {candidateSaleMatches.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {candidateSaleMatches.slice(0, 4).map(({ sale, matchReasons }) => (
                                  <div
                                    key={sale.id}
                                    onClick={() => handleSelectMatchedSale(sale)}
                                    className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 cursor-pointer text-xs space-y-1 transition-all"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono font-bold text-white">BILL #{sale.billNumber}</span>
                                      <span className="font-mono font-bold text-emerald-400">
                                        {formatCurrency(sale.totalBill, settings.currencySymbol)}
                                      </span>
                                    </div>
                                    <div className="text-[11px] text-slate-300">{sale.customerName}</div>
                                    <div className="text-[10px] text-slate-400">{matchReasons.join(' · ')}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <select
                                value={selectedSaleId}
                                style={{ direction: 'ltr', textAlign: 'left' }}
                                onChange={(e) => {
                                  const s = sales.find((x) => x.id === e.target.value);
                                  if (s) handleSelectMatchedSale(s);
                                }}
                                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium"
                              >
                                <option value="">-- Choose Original Bill ({sales.length} available) --</option>
                                {sales.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    BILL #{s.billNumber} - {s.customerName} ({formatCurrency(s.totalBill, settings.currencySymbol)})
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ========================================================== */}
              {/* MODE 1: MANUAL ENTRY - CUSTOMER & SALE SELECTORS           */}
              {/* ========================================================== */}
              {entryMode === 'MANUAL' && (
                <>
                  {/* STEP 1: SELECT CUSTOMER */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-emerald-400" />
                        <span>1. Select Customer</span>
                      </label>
                      {selectedCustomer && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          Current Due:{' '}
                          <strong
                            className={
                              selectedCustomer.outstandingBalance > 0
                                ? 'text-rose-400 font-bold'
                                : 'text-emerald-400'
                            }
                          >
                            {formatCurrency(selectedCustomer.outstandingBalance, settings.currencySymbol)}
                          </strong>
                        </span>
                      )}
                    </div>

                    {/* Customer search & select */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          dir="ltr"
                          style={{ direction: 'ltr', textAlign: 'left' }}
                          value={customerSearchQuery}
                          onChange={(e) => setCustomerSearchQuery(e.target.value)}
                          placeholder="Type name e.g. Vivek..."
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-left"
                        />
                      </div>

                      <select
                        value={selectedCustomerId}
                        style={{ direction: 'ltr', textAlign: 'left' }}
                        onChange={(e) => handleSelectCustomer(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      >
                        <option value="">-- Choose Customer ({filteredCustomers.length}) --</option>
                        {filteredCustomers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ''} · Due:{' '}
                            {formatCurrency(c.outstandingBalance, settings.currencySymbol)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* STEP 2: SELECT ORIGINAL SALE / BILL */}
                  {selectedCustomerId && (
                    <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                      <label className="text-xs font-bold text-white flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Receipt className="w-3.5 h-3.5 text-blue-400" />
                          <span>2. Select Original Sale / Bill</span>
                        </span>
                        <span className="text-[11px] text-slate-400 font-normal">
                          {customerSales.length} bill(s) found
                        </span>
                      </label>

                      {customerSales.length === 0 ? (
                        <div className="p-3 rounded-xl bg-slate-900 text-center text-xs text-slate-400">
                          No previous sales recorded for {selectedCustomer?.name}.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {customerSales.map((sale) => {
                            const isSelected = selectedSaleId === sale.id;
                            const dateFormatted = new Date(sale.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            });

                            return (
                              <div
                                key={sale.id}
                                onClick={() => {
                                  setSelectedSaleId(sale.id);
                                  setReturnQuantities({});
                                }}
                                className={`p-2.5 rounded-xl border cursor-pointer transition-all text-xs space-y-1 ${
                                  isSelected
                                    ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-white text-[11px]">
                                    BILL #{sale.billNumber}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {dateFormatted}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-400">Total Bill:</span>
                                  <span className="font-mono font-bold text-white">
                                    {formatCurrency(sale.totalBill, settings.currencySymbol)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span>
                                    Paid: <strong className="text-emerald-400 font-mono">{formatCurrency(sale.amountPaid, settings.currencySymbol)}</strong>
                                  </span>
                                  <span>
                                    Due: <strong className="text-rose-400 font-mono">{formatCurrency(sale.balanceDue, settings.currencySymbol)}</strong>
                                  </span>
                                </div>

                                <div className="text-[10px] text-slate-500 truncate pt-0.5">
                                  {sale.items.map((i) => `${i.productName} (${i.quantity} ${i.unit})`).join(', ')}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ========================================================== */}
              {/* STEP 3: SHOW PRODUCTS & ENTER RETURN QUANTITIES           */}
              {/* ========================================================== */}
              {selectedSale && (
                <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {entryMode === 'PHOTO' ? '3. Verify Return Quantities' : '3. Products in Bill #' + selectedSale.billNumber}
                      </span>
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {entryMode === 'PHOTO' ? 'Pre-filled from bill photo' : 'Enter quantity to return'}
                    </span>
                  </div>

                  {/* Products Table/Cards */}
                  <div className="space-y-2.5">
                    {selectedSale.items.map((item) => {
                      const alreadyReturned = item.returnedQuantity || 0;
                      const eligibleQty = Math.max(0, item.quantity - alreadyReturned);
                      const returnQty = returnQuantities[item.id] || 0;
                      const itemCalcTotal = returnQty * item.sellingPrice;

                      // Check if detected in photo draft
                      const photoMatchedItem = photoDraft?.items.find((pi) => {
                        if (pi.matchedProductId && pi.matchedProductId === item.productId) return true;
                        const pName = pi.detectedName.toLowerCase();
                        const sName = item.productName.toLowerCase();
                        return sName.includes(pName) || pName.includes(sName);
                      });

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border text-xs space-y-2 transition-colors ${
                            returnQty > 0
                              ? 'bg-rose-950/20 border-rose-500/40'
                              : 'bg-slate-900/90 border-slate-800'
                          }`}
                        >
                          {/* Header row */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-white text-xs flex items-center gap-1.5 flex-wrap">
                                <span>{item.productName}</span>
                                {photoMatchedItem && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Detected in Photo ({photoMatchedItem.quantity} {item.unit})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                                <span>Selling Rate: <strong className="font-mono text-white">{formatCurrency(item.sellingPrice, settings.currencySymbol)} / {item.unit}</strong></span>
                                <span>·</span>
                                <span>Sold: <strong className="font-mono text-slate-200">{item.quantity} {item.unit}</strong></span>
                              </div>
                            </div>

                            {/* Eligibility badge */}
                            <div className="text-right shrink-0">
                              {eligibleQty === 0 ? (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-bold">
                                  Fully Returned
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                                  Eligible: {eligibleQty} {item.unit}
                                </span>
                              )}
                              {alreadyReturned > 0 && (
                                <span className="block text-[9px] text-slate-500 mt-0.5">
                                  Prev returned: {alreadyReturned} {item.unit}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Stepper & return quantity row */}
                          {eligibleQty > 0 && (
                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-300 font-semibold">
                                  Return Qty ({item.unit}):
                                </span>
                                <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.id,
                                        eligibleQty,
                                        Math.max(0, returnQty - 1)
                                      )
                                    }
                                    className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    dir="ltr"
                                    style={{ direction: 'ltr', textAlign: 'center' }}
                                    min="0"
                                    max={eligibleQty}
                                    value={returnQty === 0 ? '' : returnQty}
                                    placeholder="0"
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      handleQuantityChange(item.id, eligibleQty, val);
                                    }}
                                    className="w-12 text-center bg-transparent text-white font-mono font-bold text-xs focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleQuantityChange(
                                        item.id,
                                        eligibleQty,
                                        Math.min(eligibleQty, returnQty + 1)
                                      )
                                    }
                                    className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 block">Item Return Value:</span>
                                <strong className="font-mono text-rose-400 text-xs font-bold">
                                  {formatCurrency(itemCalcTotal, settings.currencySymbol)}
                                </strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ========================================================== */}
              {/* STEP 4: FINANCIAL SUMMARY & EXCESS DUE SETTLEMENT          */}
              {/* ========================================================== */}
              {itemsToReturn.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-slate-950 via-slate-900 to-rose-950/20 border border-rose-500/30 space-y-3">
                  <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <TrendingDown className="w-4 h-4 text-rose-400" />
                      <span>Financial Adjustment Summary</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {itemsToReturn.length} item(s) selected
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Total Return Value:</div>
                      <div className="font-mono font-bold text-base text-rose-400">
                        {formatCurrency(totalReturnValue, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        ({itemsToReturn.map((i) => `${i.returnQty} ${i.saleItem.unit}`).join(' + ')})
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Customer Current Due:</div>
                      <div className="font-mono font-bold text-base text-white">
                        {formatCurrency(currentCustomerDue, settings.currencySymbol)}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-semibold">
                        Due reduction: -{formatCurrency(dueAdjustment, settings.currencySymbol)}
                      </div>
                    </div>
                  </div>

                  {/* Resulting balance line */}
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">Resulting Customer Due:</span>
                    <strong
                      className={`font-mono text-sm font-bold ${
                        newDue > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(newDue, settings.currencySymbol)}{' '}
                      {newDue === 0 ? '(Due Cleared)' : ''}
                    </strong>
                  </div>

                  {/* Handling excess amount */}
                  {excessAmount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs space-y-2">
                      <div className="flex items-center justify-between text-amber-300 font-bold text-[11px]">
                        <span>Return Value Exceeds Due by:</span>
                        <span className="font-mono text-sm">
                          {formatCurrency(excessAmount, settings.currencySymbol)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        The entire due of {formatCurrency(currentCustomerDue, settings.currencySymbol)} is cleared. How should the remaining {formatCurrency(excessAmount, settings.currencySymbol)} be settled with the customer?
                      </p>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <label
                          className={`p-2 rounded-xl border cursor-pointer text-center font-semibold text-xs transition-all ${
                            settlementType === 'REFUND'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="settlementType"
                            checked={settlementType === 'REFUND'}
                            onChange={() => setSettlementType('REFUND')}
                            className="hidden"
                          />
                          <span>💵 Refund Cash/UPI</span>
                          <span className="block text-[10px] font-normal opacity-80 mt-0.5">Pay customer back</span>
                        </label>

                        <label
                          className={`p-2 rounded-xl border cursor-pointer text-center font-semibold text-xs transition-all ${
                            settlementType === 'STORE_CREDIT'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/50'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                          }`}
                        >
                          <input
                            type="radio"
                            name="settlementType"
                            checked={settlementType === 'STORE_CREDIT'}
                            onChange={() => setSettlementType('STORE_CREDIT')}
                            className="hidden"
                          />
                          <span>🏷️ Store Credit</span>
                          <span className="block text-[10px] font-normal opacity-80 mt-0.5">Credit for next bill</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Return Notes */}
                  <div>
                    <input
                      type="text"
                      dir="ltr"
                      style={{ direction: 'ltr', textAlign: 'left' }}
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      placeholder="Optional return reason (e.g. Excess tiles after renovation)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-400 text-left"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {!completedReturn && (
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={itemsToReturn.length === 0}
              onClick={handleReviewReturn}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-500/20 active:scale-95 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Review & Confirm Return</span>
            </button>
          </div>
        )}
      </div>

      {/* CONFIRMATION SUMMARY DIALOG */}
      {showConfirmDialog && selectedCustomer && selectedSale && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Confirm Product Return</h4>
                <p className="text-[11px] text-slate-400">Review final return breakdown</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <strong className="text-white">{selectedCustomer.name}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Original Bill:</span>
                <strong className="text-white font-mono">BILL #{selectedSale.billNumber}</strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Product:</span>
                <strong className="text-white truncate max-w-[180px]">
                  {itemsToReturn.map((i) => i.saleItem.productName).join(', ')}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Return Quantity:</span>
                <strong className="text-rose-400 font-mono">
                  {itemsToReturn.map((i) => `${i.returnQty} ${i.saleItem.unit}`).join(', ')}
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Return Value:</span>
                <strong className="font-mono text-rose-400 font-bold">
                  {formatCurrency(totalReturnValue, settings.currencySymbol)}
                </strong>
              </div>

              <div className="border-t border-slate-800/80 pt-1.5 flex justify-between">
                <span className="text-slate-400">Stock Update:</span>
                <strong className="font-mono text-emerald-400 font-bold">
                  +{itemsToReturn.map((i) => `${i.returnQty} ${i.saleItem.unit}`).join(', ')} (Restocked)
                </strong>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Due Adjustment:</span>
                <strong className="font-mono text-emerald-400 font-bold">
                  -{formatCurrency(dueAdjustment, settings.currencySymbol)}
                </strong>
              </div>

              <div className="border-t border-slate-800/80 pt-1.5 flex justify-between font-bold text-slate-200">
                <span>New Customer Due:</span>
                <strong className="font-mono text-emerald-400 text-sm">
                  {formatCurrency(newDue, settings.currencySymbol)}
                </strong>
              </div>

              {excessAmount > 0 && (
                <div className="flex justify-between text-amber-300 font-bold pt-1 border-t border-slate-800/80">
                  <span>{settlementType === 'REFUND' ? 'Cash/UPI Refund:' : 'Store Credit:'}</span>
                  <span className="font-mono">{formatCurrency(excessAmount, settings.currencySymbol)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleExecuteReturn}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Return</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
