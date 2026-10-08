import React, { useState, useRef, useMemo } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Check,
  Package,
  Receipt,
  User,
  Phone,
  ArrowRight,
  TrendingDown,
  Wallet,
  FileText,
  Calendar,
  X,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  OwnerSettingsEntity,
  SaleReturnEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';
import {
  ProposedBillData,
  analyzeBillPhoto,
  fileToBase64,
  generateDemoBillImage,
  matchBillPhotoToSales,
  MatchedSaleCandidate,
} from '../services/billAnalysisService';

interface BillPhotoReturnViewProps {
  sales: SaleEntity[];
  products: ProductEntity[];
  customers: CustomerEntity[];
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
  onSuccess: (returnRecord: SaleReturnEntity) => void;
  onSwitchToManual: () => void;
}

type PhotoReturnStep = 'UPLOAD' | 'ANALYZING' | 'NO_MATCH' | 'MATCH_SELECTION' | 'SELECT_ITEMS' | 'REVIEW';

export const BillPhotoReturnView: React.FC<BillPhotoReturnViewProps> = ({
  sales,
  products,
  customers,
  settings,
  onConfirmReturn,
  onSuccess,
  onSwitchToManual,
}) => {
  const [step, setStep] = useState<PhotoReturnStep>('UPLOAD');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [extractedBill, setExtractedBill] = useState<ProposedBillData | null>(null);

  // Matching state
  const [candidates, setCandidates] = useState<MatchedSaleCandidate[]>([]);
  const [selectedSale, setSelectedSale] = useState<SaleEntity | null>(null);
  const [matchSummaryMessage, setMatchSummaryMessage] = useState<string>('');

  // Selected return quantities for the matched sale: saleItemId -> returnQuantity
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [settlementType, setSettlementType] = useState<'DUE_ADJUSTMENT' | 'REFUND' | 'STORE_CREDIT'>('DUE_ADJUSTMENT');
  const [returnNotes, setReturnNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // File input refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Customer linked with selected sale
  const selectedCustomer = useMemo(() => {
    if (!selectedSale) return null;
    return customers.find((c) => c.id === selectedSale.customerId) || null;
  }, [selectedSale, customers]);

  // Process image file
  const handleProcessImage = async (fileOrDataUrl: File | string, isDemo = false) => {
    setErrorMessage(null);
    try {
      let base64Data: string;
      let mimeType = 'image/jpeg';

      if (typeof fileOrDataUrl === 'string') {
        base64Data = fileOrDataUrl;
      } else {
        mimeType = fileOrDataUrl.type || 'image/jpeg';
        base64Data = await fileToBase64(fileOrDataUrl);
      }

      setSelectedImage(base64Data);
      setStep('ANALYZING');

      // 1. Extract details with AI
      const analysisResult = await analyzeBillPhoto(base64Data, mimeType, products, customers);
      setExtractedBill(analysisResult);

      // 2. Match against existing sales in DukanDesk
      const matchResult = matchBillPhotoToSales(analysisResult, sales, customers);
      setMatchSummaryMessage(matchResult.summaryMessage);

      if (matchResult.status === 'NO_MATCH') {
        setCandidates([]);
        setSelectedSale(null);
        setStep('NO_MATCH');
      } else if (matchResult.status === 'EXACT_MATCH' && matchResult.bestMatch) {
        setCandidates(matchResult.candidates);
        initSaleForReturn(matchResult.bestMatch.sale, analysisResult);
      } else {
        // Multiple candidates
        setCandidates(matchResult.candidates);
        setStep('MATCH_SELECTION');
      }
    } catch (err: any) {
      console.error('Bill Photo processing error:', err);
      setErrorMessage(err.message || 'Failed to analyze bill photo. Please try another photo or use Manual Entry.');
      setStep('UPLOAD');
    }
  };

  // Initialize selected sale and prepopulate item return quantities
  const initSaleForReturn = (sale: SaleEntity, billData?: ProposedBillData | null) => {
    setSelectedSale(sale);
    const initialQtys: Record<string, number> = {};

    const data = billData || extractedBill;

    // Check if extracted bill has line items that match sale items
    sale.items.forEach((saleItem) => {
      const alreadyReturned = saleItem.returnedQuantity || 0;
      const eligibleQty = Math.max(0, saleItem.quantity - alreadyReturned);

      if (eligibleQty <= 0) {
        initialQtys[saleItem.id] = 0;
        return;
      }

      // If AI extracted an item matching this product, attempt to prefill its detected quantity
      let matchedExtractedQty = 0;
      if (data && data.items) {
        const found = data.items.find(
          (it) =>
            (it.matchedProductId && it.matchedProductId === saleItem.productId) ||
            it.detectedName.toLowerCase().includes(saleItem.productName.toLowerCase()) ||
            saleItem.productName.toLowerCase().includes(it.detectedName.toLowerCase())
        );
        if (found && found.quantity > 0) {
          matchedExtractedQty = Math.min(found.quantity, eligibleQty);
        }
      }

      initialQtys[saleItem.id] = matchedExtractedQty;
    });

    setReturnQuantities(initialQtys);

    // Default return note
    if (data?.billNumber) {
      setReturnNotes(`Return against original Bill #${sale.billNumber} (Verified by bill photo)`);
    } else {
      setReturnNotes(`Return against original Bill #${sale.billNumber}`);
    }

    setStep('SELECT_ITEMS');
  };

  // Handle return quantity change
  const handleQuantityChange = (saleItemId: string, maxEligible: number, val: number) => {
    setErrorMessage(null);
    const clamped = Math.max(0, Math.min(val, maxEligible));
    setReturnQuantities((prev) => ({
      ...prev,
      [saleItemId]: clamped,
    }));
  };

  // Calculate items being returned
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

  const currentCustomerDue = selectedCustomer ? selectedCustomer.outstandingBalance : 0;
  const dueAdjustment = Math.min(currentCustomerDue, totalReturnValue);
  const excessAmount = Math.max(0, totalReturnValue - currentCustomerDue);
  const newDue = Math.max(0, currentCustomerDue - dueAdjustment);

  // Review step validator
  const handleProceedToReview = () => {
    setErrorMessage(null);
    if (!selectedSale) {
      setErrorMessage('Original sale not selected.');
      return;
    }
    if (itemsToReturn.length === 0) {
      setErrorMessage('Please specify a return quantity of at least 1 item.');
      return;
    }
    setStep('REVIEW');
  };

  // Final confirmation execution
  const handleExecuteConfirmedReturn = () => {
    if (!selectedSale || itemsToReturn.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const returnPayload = {
        saleId: selectedSale.id,
        items: itemsToReturn.map((i) => ({
          saleItemId: i.saleItem.id,
          productId: i.saleItem.productId,
          returnQuantity: i.returnQty,
        })),
        settlementType: excessAmount > 0 ? settlementType : 'DUE_ADJUSTMENT',
        notes: returnNotes.trim() || undefined,
      };

      const result = onConfirmReturn(returnPayload);
      setIsSubmitting(false);
      onSuccess(result);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'Failed to process sale return.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden file inputs for Camera and Gallery */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProcessImage(file);
        }}
        className="hidden"
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleProcessImage(file);
        }}
        className="hidden"
      />

      {errorMessage && (
        <div className="p-3 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* STEP: UPLOAD */}
      {step === 'UPLOAD' && (
        <div className="space-y-4">
          <div className="p-6 bg-slate-950/80 border border-slate-800 rounded-3xl text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-500/20 to-amber-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center mx-auto shadow-inner">
              <Camera className="w-8 h-8" />
            </div>

            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm font-bold text-white">Scan Original Customer Sale Bill</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Photograph the physical bill/invoice. AI extracts the bill number, customer, and items, matches your shop's database record, and lets you choose what is being returned.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 active:scale-95 transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Take Bill Photo</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 active:scale-95 transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-slate-400" />
                <span>Upload from Gallery</span>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleProcessImage(generateDemoBillImage(), true)}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-medium inline-flex items-center gap-1.5 underline underline-offset-4"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Test with Sample Invoice Bill (Instant Demo)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP: ANALYZING */}
      {step === 'ANALYZING' && (
        <div className="p-8 bg-slate-950/80 border border-slate-800 rounded-3xl text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
            <Sparkles className="w-6 h-6 text-rose-400" />
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-bold text-white">Analyzing Physical Bill Photograph</h4>
            <p className="text-xs text-slate-400">
              Extracting bill number, customer details, and reconciling with your database...
            </p>
          </div>
        </div>
      )}

      {/* STEP: NO MATCH */}
      {step === 'NO_MATCH' && (
        <div className="p-6 bg-slate-950/80 border border-slate-800 rounded-3xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h4 className="text-sm font-bold text-white">Original bill could not be matched.</h4>
            <p className="text-xs text-slate-400">
              {matchSummaryMessage || 'No matching sale found in DukanDesk with this bill number or customer.'}
            </p>
            {extractedBill && (
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-left text-slate-300 font-mono space-y-1 mt-3">
                <div>Extracted Bill No: <strong className="text-white">{extractedBill.billNumber || 'Not detected'}</strong></div>
                <div>Extracted Customer: <strong className="text-white">{extractedBill.detectedCustomerName || 'Not detected'}</strong></div>
                <div>Extracted Total: <strong className="text-white">{extractedBill.totalAmount ? `₹${extractedBill.totalAmount}` : 'Not detected'}</strong></div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep('UPLOAD')}
              className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
            >
              Try Another Photo
            </button>
            <button
              type="button"
              onClick={onSwitchToManual}
              className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-950/60"
            >
              Switch to Manual Entry
            </button>
          </div>
        </div>
      )}

      {/* STEP: MATCH_SELECTION (Multiple matching sales found) */}
      {step === 'MATCH_SELECTION' && (
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-white">Select Matched Original Bill</h4>
              <p className="text-[11px] text-slate-400">{matchSummaryMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setStep('UPLOAD')}
              className="text-xs text-slate-400 hover:text-white"
            >
              Scan Again
            </button>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {candidates.map((cand) => (
              <div
                key={cand.sale.id}
                onClick={() => initSaleForReturn(cand.sale, extractedBill)}
                className="p-3 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-rose-500/50 hover:bg-slate-900 transition-all cursor-pointer flex items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-xs">
                      #{cand.sale.billNumber}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {cand.sale.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-semibold">
                    {cand.sale.customerName}
                    {cand.sale.customerPhone && (
                      <span className="text-slate-400 font-normal font-mono ml-1">({cand.sale.customerPhone})</span>
                    )}
                  </div>
                  <div className="text-[10px] text-rose-400 flex items-center gap-1">
                    <span>{cand.matchReasons.join(' • ')}</span>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-white text-xs">
                    {formatCurrency(cand.sale.totalBill, settings.currencySymbol)}
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/20">
                    Select Bill ➔
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2 flex justify-between">
            <button
              type="button"
              onClick={() => setStep('UPLOAD')}
              className="py-2 px-3 text-xs text-slate-400 hover:text-white"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={onSwitchToManual}
              className="py-2 px-3 text-xs text-rose-400 hover:text-rose-300"
            >
              Switch to Manual Entry
            </button>
          </div>
        </div>
      )}

      {/* STEP: SELECT_ITEMS (Choose return quantities from matched sale) */}
      {step === 'SELECT_ITEMS' && selectedSale && (
        <div className="space-y-3.5">
          {/* Matched Original Bill Header Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-slate-950 to-slate-900 border border-rose-500/30 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[11px] font-bold text-rose-300 uppercase tracking-wider">
                  Matched Original Bill
                </span>
              </div>
              <div className="text-sm font-bold text-white font-mono">
                #{selectedSale.billNumber}
              </div>
              <div className="text-xs text-slate-300">
                {selectedSale.customerName} {selectedSale.customerPhone ? `(${selectedSale.customerPhone})` : ''} · Original Total: <strong className="font-mono text-white">{formatCurrency(selectedSale.totalBill, settings.currencySymbol)}</strong>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setStep('UPLOAD')}
              className="px-2.5 py-1 rounded-lg bg-slate-800 text-[11px] text-slate-300 hover:text-white border border-slate-700"
            >
              Change Photo
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-white flex items-center justify-between">
              <span>Select Returned Quantities</span>
              <span className="text-[10px] text-slate-400 font-normal">
                Adjust quantities being returned below
              </span>
            </label>
            <p className="text-[10px] text-slate-400 leading-tight">
              A bill photo does not mean a full return. Specify exactly how many units the customer is handing back.
            </p>
          </div>

          {/* Products List from Matched Bill */}
          <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
            {selectedSale.items.map((item) => {
              const alreadyReturned = item.returnedQuantity || 0;
              const eligibleQty = Math.max(0, item.quantity - alreadyReturned);
              const returnQty = returnQuantities[item.id] || 0;
              const isEligible = eligibleQty > 0;

              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all ${
                    returnQty > 0
                      ? 'bg-rose-950/20 border-rose-500/50'
                      : isEligible
                      ? 'bg-slate-950/70 border-slate-800'
                      : 'bg-slate-950/40 border-slate-900 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white text-xs truncate">
                        {item.productName}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 space-x-2">
                        <span>Original: <strong className="text-slate-300 font-mono">{item.quantity} {item.unit}</strong></span>
                        <span>• Already Ret: <strong className="text-slate-300 font-mono">{alreadyReturned}</strong></span>
                        <span>• Returnable: <strong className="text-emerald-400 font-mono">{eligibleQty} {item.unit}</strong></span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Rate: <strong className="font-mono text-slate-200">{formatCurrency(item.sellingPrice, settings.currencySymbol)}</strong> per {item.unit}
                      </div>
                    </div>

                    {/* Stepper Controls */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isEligible ? (
                        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(item.id, eligibleQty, returnQty - 1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xs"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={returnQty === 0 ? '0' : returnQty}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9]/g, '');
                              const num = cleaned === '' ? 0 : parseInt(cleaned, 10);
                              handleQuantityChange(item.id, eligibleQty, num);
                            }}
                            className="w-10 text-center bg-transparent text-white font-mono font-bold text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(item.id, eligibleQty, returnQty + 1)}
                            className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xs"
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono py-1 px-2 rounded bg-slate-900">
                          Fully Returned
                        </span>
                      )}

                      {returnQty > 0 && (
                        <span className="font-mono font-bold text-rose-400 text-xs">
                          +{formatCurrency(returnQty * item.sellingPrice, settings.currencySymbol)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Financial Calculation & Excess settlement */}
          {itemsToReturn.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-800">
                <span className="font-bold text-slate-300">Total Return Value:</span>
                <span className="font-mono font-black text-rose-400 text-sm">
                  {formatCurrency(totalReturnValue, settings.currencySymbol)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Customer Current Due:</span>
                  <span className="font-mono font-bold text-white">
                    {formatCurrency(currentCustomerDue, settings.currencySymbol)}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Due Reduction:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    -{formatCurrency(dueAdjustment, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              {excessAmount > 0 && (
                <div className="pt-1.5 border-t border-slate-800/80 space-y-2">
                  <div className="flex justify-between text-amber-300 font-bold text-[11px]">
                    <span>Return value exceeds due by:</span>
                    <span className="font-mono">{formatCurrency(excessAmount, settings.currencySymbol)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSettlementType('REFUND')}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        settlementType === 'REFUND'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      💵 Refund Cash/UPI
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementType('STORE_CREDIT')}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        settlementType === 'STORE_CREDIT'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 font-bold'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      🏷️ Store Credit
                    </button>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <input
                  type="text"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="Optional return memo / reason"
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-400"
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep('UPLOAD')}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Back
            </button>

            <button
              type="button"
              disabled={itemsToReturn.length === 0}
              onClick={handleProceedToReview}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-950/60 active:scale-95 transition-all"
            >
              <span>Review Return</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP: REVIEW (Strict Confirmation Screen before mutation) */}
      {step === 'REVIEW' && selectedSale && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-950/90 border border-rose-500/40 rounded-3xl space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  RETURN FROM BILL PHOTO
                </h4>
                <p className="text-[11px] text-slate-400">Review final return breakdown before executing</p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Matched Original Bill:</span>
                <strong className="font-mono text-white">#{selectedSale.billNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Customer:</span>
                <strong className="text-white">{selectedSale.customerName}</strong>
              </div>
            </div>

            {/* Items Being Returned */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">Items Being Returned:</div>
              <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                {itemsToReturn.map((item, idx) => (
                  <div key={idx} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-white">{item.saleItem.productName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {item.returnQty} {item.saleItem.unit} × {formatCurrency(item.saleItem.sellingPrice, settings.currencySymbol)}
                      </div>
                    </div>
                    <div className="font-mono font-bold text-rose-400 text-xs">
                      {formatCurrency(item.itemReturnValue, settings.currencySymbol)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial summary */}
            <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
              <div className="flex justify-between font-bold text-slate-200">
                <span>Total Return Value:</span>
                <span className="font-mono text-base font-black text-rose-400">
                  {formatCurrency(totalReturnValue, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between text-slate-400 text-[11px]">
                <span>Settlement:</span>
                <span className="font-semibold text-white">
                  {excessAmount > 0
                    ? settlementType === 'REFUND'
                      ? 'Due Reduction + Refund Balance'
                      : 'Due Reduction + Store Credit'
                    : 'Customer Due Adjustment'}
                </span>
              </div>
              {returnNotes && (
                <div className="text-[11px] text-slate-400 pt-1">
                  <span>Return Notes: </span>
                  <span className="italic text-slate-300">{returnNotes}</span>
                </div>
              )}
            </div>

            {/* Stock restock preview */}
            <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-[11px] space-y-0.5">
              <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                <span>Inventory Restocked (Stock +):</span>
              </div>
              {itemsToReturn.map((item, idx) => (
                <div key={idx} className="text-emerald-300 font-mono pl-5">
                  +{item.returnQty} {item.saleItem.unit} {item.saleItem.productName}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setStep('SELECT_ITEMS')}
              className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Back / Edit
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleExecuteConfirmedReturn}
              className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 active:scale-95 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing Return...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Return</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
