import React, { useState } from 'react';
import { Printer, X, CheckCircle2, RotateCcw, Package, Share2, Check } from 'lucide-react';
import { SaleReturnEntity, OwnerSettingsEntity, CustomerEntity, SaleEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

interface ReturnReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRecord: SaleReturnEntity | null;
  settings: OwnerSettingsEntity;
  customer?: CustomerEntity;
  sale?: SaleEntity;
}

export const ReturnReceiptModal: React.FC<ReturnReceiptModalProps> = ({
  isOpen,
  onClose,
  returnRecord,
  settings,
  customer,
  sale,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen || !returnRecord) return null;

  const handlePrint = () => {
    window.print();
  };

  const shopName = settings.shopName || 'MAHARAJA MARBLE';
  const shopAddress = settings.address || 'College Road, Supaul, Biraul, Darbhanga – 847203';
  const shopPhone = settings.phone || '9931683424';
  const proprietor = settings.ownerName || 'HAIDAR ALI';

  const customerPhone = returnRecord.customerPhone || customer?.phone || sale?.customerPhone;
  const customerAddress = customer?.address || sale?.customerAddress;

  const returnDate = returnRecord.createdAt ? new Date(returnRecord.createdAt) : new Date();
  const formattedDate = returnDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = returnDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const totalQuantityReturned = returnRecord.items.reduce((sum, item) => sum + item.returnedQuantity, 0);

  const getSettlementLabel = (type: SaleReturnEntity['settlementType']) => {
    switch (type) {
      case 'DUE_ADJUSTMENT':
        return 'Customer Due Adjustment';
      case 'REFUND':
        return 'Cash / UPI Refund';
      case 'STORE_CREDIT':
        return 'Store Credit';
      default:
        return type;
    }
  };

  const generateShareText = () => {
    const itemsList = returnRecord.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.productName} - ${it.returnedQuantity} ${it.unit} @ ${formatCurrency(it.sellingPrice, settings.currencySymbol)} = ${formatCurrency(it.returnValue, settings.currencySymbol)}`
      )
      .join('\n');

    return `*${shopName.toUpperCase()} - RETURN BILL*\n` +
      `Return Bill No: #${returnRecord.returnBillNumber || returnRecord.id}\n` +
      `Original Bill No: #${returnRecord.billNumber}\n` +
      `Date: ${formattedDate} ${formattedTime}\n` +
      `Customer: ${returnRecord.customerName}${customerPhone ? ` (${customerPhone})` : ''}\n` +
      `--------------------------------\n` +
      `*RETURNED ITEMS (RESTOCKED):*\n${itemsList}\n` +
      `--------------------------------\n` +
      `Total Return Value: ${formatCurrency(returnRecord.totalReturnValue, settings.currencySymbol)}\n` +
      (returnRecord.dueAdjustment > 0
        ? `Due Adjustment: -${formatCurrency(returnRecord.dueAdjustment, settings.currencySymbol)}\n`
        : '') +
      (returnRecord.refundAmount > 0
        ? `Refund Paid: ${formatCurrency(returnRecord.refundAmount, settings.currencySymbol)}\n`
        : '') +
      (returnRecord.creditAmount > 0
        ? `Store Credit Issued: ${formatCurrency(returnRecord.creditAmount, settings.currencySymbol)}\n`
        : '') +
      `Settlement Method: ${getSettlementLabel(returnRecord.settlementType)}\n` +
      (customer
        ? `Remaining Due: ${formatCurrency(customer.outstandingBalance, settings.currencySymbol)}\n`
        : '') +
      (returnRecord.notes ? `Notes: ${returnRecord.notes}\n` : '') +
      `--------------------------------\n` +
      `Goods re-admitted to inventory.\n${shopAddress}\nPh: ${shopPhone}`;
  };

  const handleShare = async () => {
    const shareText = generateShareText();
    const title = `${shopName} - Return Bill #${returnRecord.returnBillNumber || returnRecord.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: shareText,
        });
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareText);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Top Bar (screen-only, omitted on print) */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800 no-print shrink-0">
          <div className="flex items-center gap-2 text-rose-400 font-bold text-xs sm:text-sm">
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>Customer Return Receipt / Return Bill</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer-Facing Printable Return Bill Container */}
        <div className="p-4 sm:p-7 overflow-y-auto printable-area bg-white text-slate-900 select-text flex-1">
          {/* 1. SHOP HEADER & LOGO */}
          <div className="border-b-2 border-slate-900 pb-3 mb-3 text-center">
            <div className="flex items-center justify-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-lg bg-rose-950 text-rose-300 flex items-center justify-center font-serif font-black text-lg border border-rose-800 shadow-sm shrink-0">
                MM
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 font-serif">
                {shopName}
              </h1>
            </div>

            <p className="text-xs font-semibold text-slate-800">
              Dealer of Premium Quality Marble, Granite, Floor &amp; Wall Tiles, Sanitaryware
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {shopAddress}
            </p>
            <p className="text-[11px] text-slate-700 font-medium">
              Contact / Mobile: <span className="font-mono font-bold text-slate-900">{shopPhone}</span> | Proprietor: <span className="font-semibold text-slate-900">{proprietor}</span>
            </p>

            <div className="mt-2.5 inline-block px-4 py-0.5 bg-rose-900 text-white rounded text-[11px] font-bold tracking-widest uppercase">
              RETURN BILL / GOODS RETURN RECEIPT
            </div>
          </div>

          {/* 2. RETURN BILL & CUSTOMER INFORMATION GRID */}
          <div className="grid grid-cols-2 gap-2 text-xs border border-slate-300 rounded-lg p-2.5 mb-3.5 bg-slate-50/50">
            {/* Left: Return Metadata */}
            <div className="space-y-1">
              <div>
                <span className="text-slate-500 text-[10px] block">RETURN BILL NO:</span>
                <span className="font-mono font-bold text-rose-700 text-xs">
                  {returnRecord.returnBillNumber || returnRecord.id}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">DATE &amp; TIME:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formattedDate} · {formattedTime}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">ORIGINAL BILL NO:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {returnRecord.billNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">SETTLEMENT TYPE:</span>
                <span className="font-semibold text-slate-900">
                  {getSettlementLabel(returnRecord.settlementType)}
                </span>
              </div>
            </div>

            {/* Right: Customer Metadata */}
            <div className="space-y-1 text-right">
              <div>
                <span className="text-slate-500 text-[10px] block">CUSTOMER NAME:</span>
                <span className="font-bold text-slate-950 text-xs">
                  {returnRecord.customerName}
                </span>
              </div>
              {customerPhone && (
                <div>
                  <span className="text-slate-500 text-[10px] block">PHONE NUMBER:</span>
                  <span className="font-mono text-slate-900">
                    {customerPhone}
                  </span>
                </div>
              )}
              {customerAddress && (
                <div>
                  <span className="text-slate-500 text-[10px] block">ADDRESS / SITE:</span>
                  <span className="text-slate-800 text-[11px] leading-tight block">
                    {customerAddress}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3. RETURNED PRODUCTS TABLE */}
          <div className="overflow-x-auto mb-3.5">
            <table className="w-full text-xs border border-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-300 text-left">
                  <th className="py-2 px-2 text-center border-r border-slate-300 w-10">S.N.</th>
                  <th className="py-2 px-3 border-r border-slate-300">Product Name / Description</th>
                  <th className="py-2 px-2 text-center border-r border-slate-300 w-16">Unit</th>
                  <th className="py-2 px-2 text-right border-r border-slate-300 w-20">Return Qty</th>
                  <th className="py-2 px-3 text-right border-r border-slate-300 w-24">Rate/Price</th>
                  <th className="py-2 px-3 text-right w-24">Return Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {returnRecord.items.map((item, idx) => (
                  <tr key={item.saleItemId || idx} className={idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                    <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 text-slate-900 font-semibold border-r border-slate-200">
                      {item.productName}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200">
                      {item.unit}
                    </td>
                    <td className="py-2 px-2 text-right font-mono font-bold text-rose-700 border-r border-slate-200">
                      {item.returnedQuantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900 border-r border-slate-200">
                      {formatCurrency(item.sellingPrice, settings.currencySymbol)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(item.returnValue, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. TOTAL & SETTLEMENT SUMMARY SECTION */}
          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/50 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Left Column: Restock details & Remarks */}
              <div className="space-y-1.5 text-xs self-center">
                <div className="text-slate-700 text-[11px] font-semibold flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Inventory Restocked into Stock:</span>
                </div>
                <div className="space-y-0.5 pl-5">
                  {returnRecord.items.map((it, idx) => (
                    <div key={idx} className="text-emerald-700 font-mono text-[11px]">
                      +{it.returnedQuantity} {it.unit} {it.productName}
                    </div>
                  ))}
                </div>
                <div className="text-slate-600 text-[11px] pt-1">
                  Total Items Returned: <strong className="text-slate-900 font-mono">{totalQuantityReturned}</strong>
                </div>
                {returnRecord.notes && (
                  <div className="text-slate-600 text-[11px]">
                    <span className="font-medium text-slate-700">Return Reason / Notes: </span>
                    <span className="italic">{returnRecord.notes}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Financial Settlement Totals */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-300 text-sm font-bold text-slate-950">
                  <span>Total Return Value:</span>
                  <span className="font-mono text-base font-black text-rose-700">
                    {formatCurrency(returnRecord.totalReturnValue, settings.currencySymbol)}
                  </span>
                </div>

                {returnRecord.dueAdjustment > 0 && (
                  <div className="flex justify-between py-0.5 text-slate-700">
                    <span className="font-medium">Due Adjustment Applied:</span>
                    <span className="font-mono font-semibold text-emerald-700">
                      -{formatCurrency(returnRecord.dueAdjustment, settings.currencySymbol)}
                    </span>
                  </div>
                )}

                {returnRecord.refundAmount > 0 && (
                  <div className="flex justify-between py-0.5 text-slate-700">
                    <span className="font-medium">Refund Paid to Customer:</span>
                    <span className="font-mono font-semibold text-rose-700">
                      {formatCurrency(returnRecord.refundAmount, settings.currencySymbol)}
                    </span>
                  </div>
                )}

                {returnRecord.creditAmount > 0 && (
                  <div className="flex justify-between py-0.5 text-slate-700">
                    <span className="font-medium">Store Credit Issued:</span>
                    <span className="font-mono font-semibold text-blue-700">
                      {formatCurrency(returnRecord.creditAmount, settings.currencySymbol)}
                    </span>
                  </div>
                )}

                {customer && (
                  <div className="flex justify-between py-1 border-t border-slate-300 text-xs font-semibold text-slate-900">
                    <span>Remaining Customer Due:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(customer.outstandingBalance, settings.currencySymbol)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 5. FOOTER & AUTHORIZED SIGNATURE */}
          <div className="pt-2 text-[10px] text-slate-500 border-t border-slate-200 flex justify-between items-end">
            <div className="space-y-0.5">
              <p>• Goods returned in sound condition have been re-admitted to inventory.</p>
              <p>• This is a computer-generated Return Bill from DukanDesk.</p>
            </div>
            <div className="text-center min-w-[130px]">
              <div className="h-9 border-b border-dashed border-slate-400 mb-1" />
              <p className="font-semibold text-slate-800">Authorized Signature</p>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Controls (no-print) */}
        <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-2 sm:gap-3 no-print shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 sm:px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-xs transition-colors"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="py-2.5 px-3 sm:px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4 text-emerald-400" />}
            <span>{copiedLink ? 'Copied!' : 'Share Bill'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-3 sm:px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/60 transition-all active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Print Return Bill</span>
          </button>
        </div>
      </div>
    </div>
  );
};
