import React, { useState } from 'react';
import { Printer, X, CheckCircle2, Share2, Check, Copy } from 'lucide-react';
import { SaleEntity, OwnerSettingsEntity, CustomerEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

interface SaleReceiptModalProps {
  sale: SaleEntity | null;
  settings: OwnerSettingsEntity;
  customer?: CustomerEntity;
  onClose: () => void;
}

export const SaleReceiptModal: React.FC<SaleReceiptModalProps> = ({
  sale,
  settings,
  customer,
  onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  // Safe fallback to requested shop details
  const shopName = settings.shopName || 'MAHARAJA MARBLE';
  const shopAddress = settings.address || 'College Road, Supaul, Biraul, Darbhanga – 847203';
  const shopPhone = settings.phone || '9931683424';
  const proprietor = settings.ownerName || 'HAIDAR ALI';

  // Customer metadata
  const customerPhone = sale.customerPhone || customer?.phone;
  const customerAddress = sale.customerAddress || customer?.address;

  // Date and Time formatting
  const saleDate = sale.createdAt ? new Date(sale.createdAt) : new Date();
  const formattedDate = saleDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = saleDate.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const totalQuantity = sale.items.reduce((sum, item) => sum + item.quantity, 0);

  // Generate shareable text summary for web share sheet or clipboard
  const generateShareText = () => {
    const itemsList = sale.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.productName} - ${it.quantity} ${it.unit} @ ${formatCurrency(it.sellingPrice, settings.currencySymbol)} = ${formatCurrency(it.subtotal, settings.currencySymbol)}`
      )
      .join('\n');

    return `*${shopName.toUpperCase()} - SALES BILL*\n` +
      `Bill No: #${sale.billNumber}\n` +
      `Date: ${formattedDate} ${formattedTime}\n` +
      `Customer: ${sale.customerName}${customerPhone ? ` (${customerPhone})` : ''}\n` +
      `--------------------------------\n` +
      `*ITEMS:*\n${itemsList}\n` +
      `--------------------------------\n` +
      `Total Bill: ${formatCurrency(sale.totalBill, settings.currencySymbol)}\n` +
      `Paid: ${formatCurrency(sale.amountPaid, settings.currencySymbol)}\n` +
      `Balance Due: ${formatCurrency(sale.balanceDue, settings.currencySymbol)}\n` +
      `Payment Mode: ${sale.paymentMethod}\n` +
      `--------------------------------\n` +
      `Thank you for your business!\n${shopAddress}\nPh: ${shopPhone}`;
  };

  const handleShare = async () => {
    const shareText = generateShareText();
    const title = `${shopName} - Bill #${sale.billNumber}`;

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

    // Fallback to clipboard
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
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs sm:text-sm">
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
            <span>Customer Sales Bill</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer-Facing Printable Bill Container */}
        <div className="p-4 sm:p-7 overflow-y-auto printable-area bg-white text-slate-900 select-text flex-1">
          {/* 1. SHOP HEADER & LOGO */}
          <div className="border-b-2 border-slate-900 pb-3 mb-3 text-center">
            {/* Shop Logo & Name */}
            <div className="flex items-center justify-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-lg bg-slate-950 text-amber-400 flex items-center justify-center font-serif font-black text-lg border border-slate-800 shadow-sm shrink-0">
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

            <div className="mt-2.5 inline-block px-4 py-0.5 bg-slate-900 text-white rounded text-[11px] font-bold tracking-widest uppercase">
              RETAIL SALES BILL / INVOICE
            </div>
          </div>

          {/* 2. BILL & CUSTOMER INFORMATION GRID */}
          <div className="grid grid-cols-2 gap-2 text-xs border border-slate-300 rounded-lg p-2.5 mb-3.5 bg-slate-50/50">
            {/* Left: Invoice Metadata */}
            <div className="space-y-1">
              <div>
                <span className="text-slate-500 text-[10px] block">INVOICE / BILL NO:</span>
                <span className="font-mono font-bold text-slate-950 text-xs">
                  {sale.billNumber}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">DATE &amp; TIME:</span>
                <span className="font-mono font-semibold text-slate-900">
                  {formattedDate} · {formattedTime}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] block">PAYMENT MODE:</span>
                <span className="font-semibold text-slate-900">
                  {sale.paymentMethod}
                </span>
              </div>
            </div>

            {/* Right: Customer Metadata */}
            <div className="space-y-1 text-right">
              <div>
                <span className="text-slate-500 text-[10px] block">CUSTOMER NAME:</span>
                <span className="font-bold text-slate-950 text-xs">
                  {sale.customerName}
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

          {/* 3. SOLD PRODUCTS TABLE */}
          <div className="overflow-x-auto mb-3.5">
            <table className="w-full text-xs border border-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-900 font-bold border-b border-slate-300 text-left">
                  <th className="py-2 px-2 text-center border-r border-slate-300 w-10">S.N.</th>
                  <th className="py-2 px-3 border-r border-slate-300">Product Name / Description</th>
                  <th className="py-2 px-2 text-center border-r border-slate-300 w-16">Unit</th>
                  <th className="py-2 px-2 text-right border-r border-slate-300 w-16">Qty</th>
                  <th className="py-2 px-3 text-right border-r border-slate-300 w-24">Rate/Price</th>
                  <th className="py-2 px-3 text-right w-24">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sale.items.map((item, idx) => (
                  <tr key={item.id || idx} className={idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                    <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200 font-mono">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3 text-slate-900 font-semibold border-r border-slate-200">
                      {item.productName}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600 border-r border-slate-200">
                      {item.unit}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-slate-900 border-r border-slate-200">
                      {item.quantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-900 border-r border-slate-200">
                      {formatCurrency(item.sellingPrice, settings.currencySymbol)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-950">
                      {formatCurrency(item.subtotal, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. TOTAL & PAYMENT SUMMARY SECTION */}
          <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/50 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Left Column: Quantities & Remarks */}
              <div className="space-y-1 text-xs self-center">
                <div className="text-slate-600 text-[11px]">
                  Total Unique Items: <strong className="text-slate-900 font-mono">{sale.items.length}</strong>
                </div>
                <div className="text-slate-600 text-[11px]">
                  Total Quantity Sold: <strong className="text-slate-900 font-mono">{totalQuantity}</strong>
                </div>
                {sale.notes && (
                  <div className="text-slate-600 text-[11px] pt-1">
                    <span className="font-medium text-slate-700">Remarks / Memo: </span>
                    <span className="italic">{sale.notes}</span>
                  </div>
                )}
              </div>

              {/* Right Column: Financial Totals */}
              <div className="space-y-1 text-xs">
                <div className="flex justify-between py-0.5 text-slate-700">
                  <span className="font-medium">Subtotal:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {formatCurrency(sale.totalBill, settings.currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-t border-b border-slate-300 text-sm font-bold text-slate-950">
                  <span>Grand Total:</span>
                  <span className="font-mono text-base font-black text-slate-950">
                    {formatCurrency(sale.totalBill, settings.currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between py-0.5 text-slate-700">
                  <span className="font-medium">Amount Paid:</span>
                  <span className="font-mono font-bold text-emerald-800">
                    {formatCurrency(sale.amountPaid, settings.currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-t border-slate-200">
                  <span className="font-bold text-slate-800">Balance / Due Amount:</span>
                  <span
                    className={`font-mono font-bold ${
                      sale.balanceDue > 0
                        ? 'text-rose-700 text-sm font-bold'
                        : 'text-emerald-700'
                    }`}
                  >
                    {sale.balanceDue > 0
                      ? formatCurrency(sale.balanceDue, settings.currencySymbol)
                      : '₹0.00 (Paid in Full)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 5. FOOTER & SIGNATURE SECTION */}
          <div className="border-t border-slate-300 pt-3 space-y-4">
            {/* Thank you message & return terms */}
            <div className="text-center space-y-1">
              <p className="text-xs font-bold text-slate-900 tracking-wide uppercase">
                Thank You For Your Business! Please Visit Again.
              </p>
              {settings.receiptFooter && (
                <p className="text-[10px] text-slate-600 max-w-lg mx-auto leading-relaxed">
                  {settings.receiptFooter}
                </p>
              )}
            </div>

            {/* Signature Lines */}
            <div className="flex items-end justify-between pt-6 text-[11px] text-slate-700">
              <div className="text-center">
                <div className="w-36 border-b border-slate-400 mb-1" />
                <span className="text-[10px] text-slate-600">Customer's Signature</span>
              </div>

              <div className="text-center">
                <div className="w-44 border-b border-slate-400 mb-1" />
                <span className="font-bold text-slate-950 block">For {shopName}</span>
                <span className="text-[10px] text-slate-500">(Authorized Signatory)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Controls (screen-only, omitted on print) */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 bg-slate-950 border-t border-slate-800 no-print gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-3 sm:px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold text-center transition-colors"
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
            className="flex-1 py-2.5 px-3 sm:px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print Bill / PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
