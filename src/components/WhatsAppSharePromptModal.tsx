import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, X, Phone, CheckCircle2, User, Receipt, AlertCircle } from 'lucide-react';
import { SaleEntity, OwnerSettingsEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';
import {
  openWhatsAppShare,
  cleanWhatsAppPhoneNumber,
  formatWhatsAppBillMessage,
} from '../services/whatsappService';

interface WhatsAppSharePromptModalProps {
  isOpen: boolean;
  sale: SaleEntity | null;
  settings: OwnerSettingsEntity;
  onClose: () => void;
  onSent?: () => void;
}

export const WhatsAppSharePromptModal: React.FC<WhatsAppSharePromptModalProps> = ({
  isOpen,
  sale,
  settings,
  onClose,
  onSent,
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    if (sale) {
      setPhoneNumber(sale.customerPhone || '');
      setPhoneError('');
    }
  }, [sale]);

  if (!isOpen || !sale) return null;

  const currencySymbol = settings.currencySymbol || '₹';
  const cleanPhone = cleanWhatsAppPhoneNumber(phoneNumber);
  const previewText = formatWhatsAppBillMessage(
    { ...sale, customerPhone: phoneNumber || sale.customerPhone },
    settings
  );

  const handleSend = () => {
    // If phone number was entered or exists, validate basic length
    if (phoneNumber.trim() && cleanPhone.length < 10) {
      setPhoneError('Please enter a valid phone number (at least 10 digits).');
      return;
    }

    openWhatsAppShare(sale, settings, phoneNumber.trim() || undefined);
    onSent?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-card border border-line rounded-3xl max-w-lg w-full overflow-hidden shadow-card flex flex-col my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-primary text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-card/15 text-white border border-white/20 flex items-center justify-center shadow-card">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Send Bill on WhatsApp</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-nav-active-pill text-primary border border-badge-green-text/35 font-semibold">
                  Instant Share
                </span>
              </h3>
              <p className="text-xs text-white/85">
                Do you want to send this bill on WhatsApp to the customer now?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-card/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Bill Summary Card */}
          <div className="bg-inner p-4 rounded-2xl border border-line-strong space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                <span className="font-bold text-ink font-mono">Invoice #{sale.billNumber}</span>
              </div>
              <span className="text-[11px] font-mono text-muted">
                {new Date(sale.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-line-strong">
              <div className="flex items-center gap-1.5 text-muted">
                <User className="w-3.5 h-3.5 text-muted" />
                <span className="font-semibold text-ink">{sale.customerName}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted block">Total Amount</span>
                <span className="font-bold text-sm text-primary font-mono">
                  {formatCurrency(sale.totalBill, currencySymbol)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line-strong text-[11px]">
              <div className="p-2 rounded-xl bg-card border border-line-strong">
                <span className="text-muted block text-[10px]">Paid:</span>
                <span className="font-semibold text-ink font-mono">
                  {formatCurrency(sale.amountPaid, currencySymbol)} ({sale.paymentMethod})
                </span>
              </div>
              <div className="p-2 rounded-xl bg-card border border-line-strong">
                <span className="text-muted block text-[10px]">Balance Due:</span>
                <span
                  className={`font-semibold font-mono ${
                    sale.balanceDue > 0 ? 'text-badge-red-text' : 'text-badge-green-text'
                  }`}
                >
                  {formatCurrency(sale.balanceDue, currencySymbol)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Phone Input (Required or Editable) */}
          <div className="space-y-1.5">
            <label className="text-ink font-semibold flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-primary" />
                <span>Customer WhatsApp Number</span>
              </span>
              <span className="text-[11px] text-muted font-normal">
                {sale.customerPhone ? 'Auto-filled from contact' : 'Enter mobile number'}
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted font-mono font-medium">
                +91
              </div>
              <input
                type="tel"
                dir="ltr"
                style={{ direction: 'ltr' }}
                value={phoneNumber}
                onChange={(e) => {
                  setPhoneNumber(e.target.value);
                  setPhoneError('');
                }}
                placeholder="e.g. 9876543210"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl pl-12 pr-4 py-2.5 text-ink font-mono text-sm placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {phoneError ? (
              <p className="text-[11px] text-badge-red-text flex items-center gap-1 pt-0.5">
                <AlertCircle className="w-3 h-3" />
                <span>{phoneError}</span>
              </p>
            ) : (
              <p className="text-[10px] text-muted">
                Standard 10-digit mobile number. Country code (+91) will be formatted automatically.
              </p>
            )}
          </div>

          {/* Collapsible Message Preview */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted">Message Preview:</span>
            <div className="p-3 bg-inner rounded-xl border border-line-strong text-[11px] font-mono text-ink max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
              {previewText}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between p-4 bg-inner border-t border-line-strong gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong text-xs font-semibold text-center transition-colors cursor-pointer"
          >
            No, Skip
          </button>

          <button
            type="button"
            onClick={handleSend}
            className="flex-[2] py-2.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Yes, Send on WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};
