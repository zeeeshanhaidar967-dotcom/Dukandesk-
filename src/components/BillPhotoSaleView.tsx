import React, { useState, useRef, useMemo } from 'react';
import {
  Camera,
  Upload,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  RefreshCw,
  FileText,
  DollarSign,
  User,
  ArrowRight,
  HelpCircle,
  Eye,
  Check,
  ChevronDown,
  X,
} from 'lucide-react';
import {
  ProductEntity,
  CustomerEntity,
  SaleEntity,
  OwnerSettingsEntity,
} from '../types/database';
import { formatCurrency } from '../services/calculations';
import {
  ProposedBillData,
  ProposedBillItem,
  analyzeBillPhoto,
  fileToBase64,
  generateDemoBillImage,
  matchItemWithProducts,
  matchCustomerByName,
} from '../services/billAnalysisService';

interface BillPhotoSaleViewProps {
  products: ProductEntity[];
  customers: CustomerEntity[];
  settings: OwnerSettingsEntity;
  onConfirmSale: (saleInput: {
    customerId: string;
    items: Array<{ productId: string; quantity: number }>;
    amountPaid: number;
    paymentMethod: SaleEntity['paymentMethod'];
    notes?: string;
  }) => SaleEntity;
  onQuickAddCustomer: (data: { name: string; phone: string; address: string }) => CustomerEntity;
  onSwitchToManual: () => void;
}

export const BillPhotoSaleView: React.FC<BillPhotoSaleViewProps> = ({
  products,
  customers,
  settings,
  onConfirmSale,
  onQuickAddCustomer,
  onSwitchToManual,
}) => {
  // Step state: 'UPLOAD' | 'ANALYZING' | 'REVIEW'
  const [step, setStep] = useState<'UPLOAD' | 'ANALYZING' | 'REVIEW'>('UPLOAD');

  // Selected bill image (data URL)
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');

  // Proposed bill draft
  const [draft, setDraft] = useState<ProposedBillData | null>(null);

  // Review screen editable fields
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<SaleEntity['paymentMethod']>('Cash');
  const [amountPaidInput, setAmountPaidInput] = useState<string>('');
  const [isManualPaidEdited, setIsManualPaidEdited] = useState<boolean>(false);
  const [saleNotes, setSaleNotes] = useState<string>('');

  // UI state for image preview modal
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);

  // Quick Customer Creation modal
  const [showQuickCustomerModal, setShowQuickCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  // Error / Warning
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File input refs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Calculate live total bill of draft items
  const totalBill = useMemo(() => {
    if (!draft || !draft.items) return 0;
    return draft.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  }, [draft]);

  // Effective amount paid
  const effectivePaid = useMemo(() => {
    if (!isManualPaidEdited) {
      return totalBill;
    }
    const val = parseFloat(amountPaidInput);
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [totalBill, isManualPaidEdited, amountPaidInput]);

  const remainingBalance = Math.max(0, totalBill - effectivePaid);

  // Handle image file selection
  const handleProcessImageFile = async (file: File) => {
    setErrorMessage(null);
    try {
      setImageFileName(file.name);
      const base64Data = await fileToBase64(file);
      setSelectedImage(base64Data);
      setStep('ANALYZING');

      const analysisResult = await analyzeBillPhoto(
        base64Data,
        file.type || 'image/jpeg',
        products,
        customers
      );

      setDraft(analysisResult);

      // Attempt to auto-match customer
      const matchedCust = matchCustomerByName(
        analysisResult.detectedCustomerName,
        analysisResult.detectedCustomerPhone,
        customers
      );
      if (matchedCust) {
        setSelectedCustomerId(matchedCust.id);
      } else if (customers.length > 0) {
        setSelectedCustomerId(customers[0].id);
      }

      // Default payment method
      if (analysisResult.paymentModeHint) {
        setPaymentMethod(analysisResult.paymentModeHint);
      }

      setSaleNotes(
        analysisResult.notes
          ? `${analysisResult.notes} (Bill #${analysisResult.billNumber || 'Photo'})`
          : analysisResult.billNumber
          ? `Bill #${analysisResult.billNumber}`
          : 'Added from bill photograph'
      );

      setStep('REVIEW');
    } catch (err: any) {
      console.error('Error reading bill file:', err);
      setErrorMessage(
        err?.message || 'The bill could not be read clearly. Please retake the photo or choose another image.'
      );
      setStep('UPLOAD');
    }
  };

  // Handle demo/sample bill test
  const handleLoadSampleBill = async () => {
    setErrorMessage(null);
    setImageFileName('Sample_Marble_Tile_Invoice.png');
    const demoImage = generateDemoBillImage();
    setSelectedImage(demoImage);
    setStep('ANALYZING');

    // Brief realistic delay to simulate OCR pipeline
    setTimeout(async () => {
      try {
        const analysisResult = await analyzeBillPhoto(
          demoImage,
          'image/png',
          products,
          customers
        );
        setDraft(analysisResult);

        // Auto-match Vivek if in database
        const matchedCust = matchCustomerByName('Vivek', '9876543210', customers);
        if (matchedCust) {
          setSelectedCustomerId(matchedCust.id);
        } else if (customers.length > 0) {
          setSelectedCustomerId(customers[0].id);
        }

        setSaleNotes('Bill #BILL-202610-892 (Demo Tile Invoice)');
        setStep('REVIEW');
      } catch {
        setErrorMessage('Failed to load sample bill.');
        setStep('UPLOAD');
      }
    }, 1200);
  };

  // Update item in draft
  const handleUpdateItem = (itemId: string, updates: Partial<ProposedBillItem>) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) => {
        if (item.id !== itemId) return item;
        const updated = { ...item, ...updates, isUserModified: true };

        // If product changed, update matchedProduct and selling price
        if (updates.matchedProductId !== undefined) {
          const newProd = products.find((p) => p.id === updates.matchedProductId) || null;
          updated.matchedProduct = newProd;
          updated.matchedProductId = newProd ? newProd.id : null;
          updated.matchConfidence = newProd ? 'EXACT' : 'NONE';
          updated.matchReason = newProd ? 'Manually selected by user' : 'No product selected';
          if (newProd && (!item.unitPrice || item.unitPrice <= 0)) {
            updated.unitPrice = newProd.sellingPrice;
          }
        }

        updated.totalPrice = updated.quantity * updated.unitPrice;
        return updated;
      }),
    });
  };

  // Remove item from draft
  const handleRemoveItem = (itemId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      items: draft.items.filter((it) => it.id !== itemId),
    });
  };

  // Add missing item manually
  const handleAddMissingItem = () => {
    if (!draft) return;
    const defaultProduct = products.length > 0 ? products[0] : null;
    const newItem: ProposedBillItem = {
      id: `PROPOSED-MANUAL-${Date.now()}`,
      rawText: 'Manual Added Item',
      detectedName: defaultProduct ? defaultProduct.name : 'New Item',
      quantity: 1,
      unitPrice: defaultProduct ? defaultProduct.sellingPrice : 100,
      totalPrice: defaultProduct ? defaultProduct.sellingPrice : 100,
      matchedProductId: defaultProduct ? defaultProduct.id : null,
      matchedProduct: defaultProduct,
      matchConfidence: defaultProduct ? 'CONFIDENT' : 'NONE',
      matchReason: 'Manually added by user to match paper bill.',
      isUserModified: true,
    };
    setDraft({
      ...draft,
      items: [...draft.items, newItem],
    });
  };

  // Quick customer creation submit
  const handleQuickCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) return;

    const created = onQuickAddCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
    });

    setSelectedCustomerId(created.id);
    setShowQuickCustomerModal(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustAddress('');
  };

  // Final Confirmation of Sale
  const handleConfirmSaleSubmit = () => {
    setErrorMessage(null);

    if (!draft || draft.items.length === 0) {
      setErrorMessage('Please ensure at least one product is present on the bill.');
      return;
    }

    if (!selectedCustomerId) {
      setErrorMessage('Please select or create a customer for this bill.');
      return;
    }

    // Validate that every item has a matched product
    const unmatched = draft.items.find((it) => !it.matchedProductId);
    if (unmatched) {
      setErrorMessage(
        `Please select a catalogue product for "${unmatched.detectedName}". Every bill line must correspond to an inventory product.`
      );
      return;
    }

    // Validate stock availability
    for (const item of draft.items) {
      if (!item.matchedProduct) continue;
      if (item.quantity > item.matchedProduct.currentStock) {
        setErrorMessage(
          `Warning: Quantity for "${item.matchedProduct.name}" (${item.quantity} ${item.matchedProduct.unit}) exceeds current inventory stock (${item.matchedProduct.currentStock} ${item.matchedProduct.unit}). Please adjust quantity.`
        );
        return;
      }
    }

    try {
      onConfirmSale({
        customerId: selectedCustomerId,
        items: draft.items.map((it) => ({
          productId: it.matchedProductId!,
          quantity: it.quantity,
        })),
        amountPaid: effectivePaid,
        paymentMethod,
        notes: saleNotes,
      });

      // Reset
      setStep('UPLOAD');
      setSelectedImage(null);
      setDraft(null);
      setIsManualPaidEdited(false);
      setAmountPaidInput('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to confirm sale.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleProcessImageFile(e.target.files[0]);
          }
        }}
      />
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleProcessImageFile(e.target.files[0]);
          }
        }}
      />

      {/* Error notification banner */}
      {errorMessage && (
        <div className="p-3.5 bg-rose-950/80 border border-rose-500/40 rounded-2xl text-rose-300 text-xs flex items-start gap-2.5 shadow-lg animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <div className="flex-1">{errorMessage}</div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- STEP 1: UPLOAD / CAMERA STATE --- */}
      {step === 'UPLOAD' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 shadow-xl text-center relative overflow-hidden">
            {/* Subtle glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="inline-flex p-3.5 bg-gradient-to-tr from-emerald-600 to-teal-500 text-white rounded-2xl shadow-lg shadow-emerald-500/20 mb-3">
              <Camera className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-white tracking-tight">
              AI Bill Photo Sale Entry
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
              Capture or upload an offline paper receipt or shop bill. DukanDesk will extract line items, quantities, and rates, and prepare a draft for your review.
            </p>

            {/* Action Buttons: Camera & Gallery */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6 max-w-md mx-auto">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white rounded-2xl font-bold text-xs shadow-lg shadow-emerald-950 transition-all cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Take Photo with Camera</span>
              </button>

              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex items-center justify-center gap-2.5 py-3.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-[0.98] text-white border border-slate-700 rounded-2xl font-bold text-xs transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Upload from Gallery</span>
              </button>
            </div>

            {/* Drag & drop helper / sample bill */}
            <div className="mt-5 pt-5 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>No paper bill handy right now?</span>
              </span>

              <button
                type="button"
                onClick={handleLoadSampleBill}
                className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-xl font-semibold text-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Test with Sample Marble & Tile Bill</span>
              </button>
            </div>
          </div>

          {/* Quick Safety Explainer Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1.5">
              <div className="text-emerald-400 font-bold text-xs flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zero Hallucination</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Only readable text on the bill is extracted. Unclear lines are flagged for your review.
              </p>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1.5">
              <div className="text-cyan-400 font-bold text-xs flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>Full Review Before Saving</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Nothing is modified in your inventory until you inspect and tap "Confirm Sale".
              </p>
            </div>

            <div className="p-4 bg-slate-900/60 border border-slate-800/80 rounded-2xl space-y-1.5">
              <div className="text-amber-400 font-bold text-xs flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Catalogue Matching</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Items are matched against your existing DukanDesk products without creating duplicates.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* --- STEP 2: ANALYZING STATE --- */}
      {step === 'ANALYZING' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-xl text-center space-y-5">
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <div className="absolute -inset-1 rounded-2xl border-2 border-emerald-400/40 animate-ping pointer-events-none" />
          </div>

          <div>
            <h3 className="text-base font-bold text-white">Analyzing Bill Photograph</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Scanning lines, reading quantities, and cross-referencing your DukanDesk inventory...
            </p>
          </div>

          <div className="max-w-xs mx-auto space-y-2 text-left">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Scanning high-resolution image</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Detecting line items and prices</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-cyan-400 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Matching with inventory catalogue...</span>
            </div>
          </div>
        </div>
      )}

      {/* --- STEP 3: REVIEW & CORRECTION SCREEN (MANDATORY) --- */}
      {step === 'REVIEW' && draft && (
        <div className="space-y-4">
          {/* Review Header Banner */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Draft For Review
                </span>
                {draft.billNumber && (
                  <span className="text-xs font-mono text-slate-300 font-semibold">
                    {draft.billNumber}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white mt-1">
                Review Extracted Bill Items Before Applying
              </h3>
              <p className="text-xs text-slate-400">
                AI does not touch real inventory until you click "Confirm Sale". You can correct any quantity or product below.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selectedImage && (
                <button
                  type="button"
                  onClick={() => setShowPhotoPreview(!showPhotoPreview)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{showPhotoPreview ? 'Hide Photo' : 'View Bill Photo'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep('UPLOAD');
                  setSelectedImage(null);
                  setDraft(null);
                }}
                className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 text-rose-400 hover:text-rose-300 rounded-xl text-xs font-semibold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retake</span>
              </button>
            </div>
          </div>

          {/* Optional Bill Photo Drawer/Preview */}
          {showPhotoPreview && selectedImage && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl animate-fadeIn">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Captured Bill Photograph</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPhotoPreview(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-2 flex justify-center">
                <img
                  src={selectedImage}
                  alt="Bill Photograph"
                  className="max-h-64 object-contain rounded-lg shadow-md"
                />
              </div>
            </div>
          )}

          {/* Warning banner if OCR detected uncertain items */}
          {draft.warningNotice && (
            <div className="p-3 bg-amber-950/60 border border-amber-500/30 rounded-2xl text-amber-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{draft.warningNotice}</span>
            </div>
          )}

          {/* Customer Selection & Meta Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Customer / Account for this Bill</span>
              </label>

              <button
                type="button"
                onClick={() => {
                  setNewCustName(draft.detectedCustomerName || '');
                  setNewCustPhone(draft.detectedCustomerPhone || '');
                  setShowQuickCustomerModal(true);
                }}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>New Client</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <select
                  value={selectedCustomerId}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2.5 text-xs font-medium focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                >
                  <option value="" disabled>
                    -- Select Customer --
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone || 'No phone'}) — Due: {formatCurrency(c.outstandingBalance, settings.currencySymbol)}
                    </option>
                  ))}
                </select>
                {draft.detectedCustomerName && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    Detected on bill: <strong>{draft.detectedCustomerName}</strong>
                    {draft.detectedCustomerPhone ? ` (${draft.detectedCustomerPhone})` : ''}
                  </p>
                )}
              </div>

              <div>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  placeholder="Bill reference / notes"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3.5 py-2.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none text-left"
                />
              </div>
            </div>
          </div>

          {/* Line Items Review Table / Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Bill Line Items ({draft.items.length})
                </h4>
                <p className="text-[11px] text-slate-400">
                  Verify matched product, quantity, and rate for each item.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddMissingItem}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl text-xs font-bold border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              {draft.items.map((item, idx) => {
                const matched = item.matchedProduct;
                const isUncertain = item.matchConfidence === 'UNCERTAIN';
                const isNoMatch = item.matchConfidence === 'NONE' || !item.matchedProductId;
                const availableStock = matched ? matched.currentStock : 0;
                const stockAfterSale = matched ? availableStock - item.quantity : 0;
                const isOverStock = matched ? item.quantity > availableStock : false;

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isNoMatch
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : isUncertain
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Item Top: Detected Raw Text + Match Status Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-slate-200">
                          {item.rawText}
                        </span>
                      </div>

                      {/* Confidence Badge */}
                      {isNoMatch ? (
                        <span className="px-2 py-0.5 rounded-md bg-rose-950/80 border border-rose-500/40 text-rose-400 text-[10px] font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>No Match — Please Select Product</span>
                        </span>
                      ) : isUncertain ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-950/80 border border-amber-500/40 text-amber-400 text-[10px] font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>⚠️ Product Match Uncertain</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>✓ Verified Match</span>
                        </span>
                      )}
                    </div>

                    {/* Matched Product Selector */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                      <div className="lg:col-span-6">
                        <label className="text-[10px] text-slate-400 font-semibold mb-1 block">
                          Assigned DukanDesk Inventory Product:
                        </label>
                        <select
                          value={item.matchedProductId || ''}
                          style={{ direction: 'ltr', textAlign: 'left' }}
                          onChange={(e) => handleUpdateItem(item.id, { matchedProductId: e.target.value })}
                          className={`w-full bg-slate-900 border rounded-xl px-3 py-2 text-xs font-semibold outline-none cursor-pointer ${
                            isNoMatch
                              ? 'border-rose-500/60 text-rose-300'
                              : isUncertain
                              ? 'border-amber-500/60 text-amber-200'
                              : 'border-slate-700 text-white'
                          }`}
                        >
                          <option value="">-- Choose Catalogue Product --</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.brand}) — Stock: {p.currentStock} {p.unit} @ ₹{p.sellingPrice}
                            </option>
                          ))}
                        </select>

                        {/* Stock & delta info */}
                        {matched && (
                          <div className="flex items-center gap-2 mt-1 text-[10px]">
                            <span className="text-slate-400">
                              Current Stock: <strong>{availableStock} {matched.unit}</strong>
                            </span>
                            <span className="text-slate-500">→</span>
                            <span className={`font-semibold ${isOverStock ? 'text-rose-400' : 'text-emerald-400'}`}>
                              After Sale: {stockAfterSale} {matched.unit} (-{item.quantity})
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Quantity input with +/- buttons */}
                      <div className="lg:col-span-3">
                        <label className="text-[10px] text-slate-400 font-semibold mb-1 block">
                          Quantity:
                        </label>
                        <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                            className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            dir="ltr"
                            style={{ direction: 'ltr', textAlign: 'center' }}
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              handleUpdateItem(item.id, {
                                quantity: isNaN(val) ? 0 : Math.max(0, val),
                              });
                            }}
                            onBlur={() => {
                              if (!item.quantity || item.quantity < 1) {
                                handleUpdateItem(item.id, { quantity: 1 });
                              }
                            }}
                            className="w-full text-center bg-transparent text-white text-xs font-bold py-1.5 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(item.id, { quantity: item.quantity + 1 })}
                            className="px-2.5 py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Unit Price & Subtotal */}
                      <div className="lg:col-span-2">
                        <label className="text-[10px] text-slate-400 font-semibold mb-1 block">
                          Unit Rate (₹):
                        </label>
                        <input
                          type="number"
                          min="0"
                          dir="ltr"
                          style={{ direction: 'ltr', textAlign: 'left' }}
                          value={item.unitPrice === 0 ? '' : item.unitPrice}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            handleUpdateItem(item.id, {
                              unitPrice: isNaN(val) ? 0 : Math.max(0, val),
                            });
                          }}
                          className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none text-left"
                        />
                      </div>

                      {/* Delete action */}
                      <div className="lg:col-span-1 flex items-center justify-end pt-4 lg:pt-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 rounded-xl transition-all cursor-pointer"
                          title="Remove Item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Payment Terms & Confirmation Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Total Bill Amount
              </span>
              <span className="text-xl font-black text-emerald-400">
                {formatCurrency(totalBill, settings.currencySymbol)}
              </span>
            </div>

            {/* Payment Method & Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">
                  Payment Method:
                </label>
                <select
                  value={paymentMethod}
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs font-semibold outline-none cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / Digital</option>
                  <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Credit">Credit / Pay Later</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-semibold block mb-1">
                  Amount Received / Paid Now:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'left' }}
                    placeholder={String(totalBill)}
                    value={isManualPaidEdited ? amountPaidInput : totalBill === 0 ? '' : String(totalBill)}
                    onFocus={() => {
                      if (!isManualPaidEdited) {
                        setIsManualPaidEdited(true);
                        setAmountPaidInput(totalBill > 0 ? String(totalBill) : '');
                      }
                    }}
                    onChange={(e) => {
                      setIsManualPaidEdited(true);
                      setAmountPaidInput(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2 text-xs font-bold outline-none text-left"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsManualPaidEdited(true);
                      setAmountPaidInput('0');
                      setPaymentMethod('Credit');
                    }}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold whitespace-nowrap cursor-pointer"
                  >
                    Credit (₹0)
                  </button>
                </div>
              </div>
            </div>

            {/* Remaining balance notice if partial/credit */}
            {remainingBalance > 0 && (
              <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between">
                <span>Remaining Ledger Balance (Due):</span>
                <span className="font-bold">
                  {formatCurrency(remainingBalance, settings.currencySymbol)}
                </span>
              </div>
            )}

            {/* Final Confirmation Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={handleConfirmSaleSubmit}
                className="w-full sm:flex-1 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-950 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Confirm Sale &amp; Decrement Stock</span>
              </button>

              <button
                type="button"
                onClick={onSwitchToManual}
                className="w-full sm:w-auto py-3.5 px-5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-2xl font-semibold text-xs transition-all cursor-pointer"
              >
                Switch to Manual Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Quick Add Customer Modal --- */}
      {showQuickCustomerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm space-y-4 shadow-2xl animate-scaleUp">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-400" />
                <span>Quick Add Client</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowQuickCustomerModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickCustomerSubmit} className="space-y-3">
              <div>
                <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 text-left"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  placeholder="e.g. 9876543210"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 text-left"
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                  Address / Site
                </label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  placeholder="e.g. College Road, Biraul"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500 text-left"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickCustomerModal(false)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                >
                  Save &amp; Select
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
