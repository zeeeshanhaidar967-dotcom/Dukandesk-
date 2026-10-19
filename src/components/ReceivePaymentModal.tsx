import React, { useState, useEffect, useMemo } from 'react';
import { Wallet, X, CheckCircle2, TrendingDown } from 'lucide-react';
import { CustomerEntity, PaymentEntity, OwnerSettingsEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

interface ReceivePaymentModalProps {
  customers: CustomerEntity[];
  initialCustomerId?: string;
  settings: OwnerSettingsEntity;
  isOpen: boolean;
  onClose: () => void;
  onConfirmPayment: (
    customerId: string,
    amount: number,
    paymentMethod: PaymentEntity['paymentMethod'],
    notes?: string
  ) => void;
}

export const ReceivePaymentModal: React.FC<ReceivePaymentModalProps> = ({
  customers,
  initialCustomerId,
  settings,
  isOpen,
  onClose,
  onConfirmPayment,
}) => {
  const customersWithDues = useMemo(() => {
    return customers.filter((c: CustomerEntity) => c.outstandingBalance > 0);
  }, [customers]);

  const selectableCustomers = customersWithDues.length > 0 ? customersWithDues : customers;

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    initialCustomerId || (selectableCustomers.length > 0 ? selectableCustomers[0].id : '')
  );
  const [amountInput, setAmountInput] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentEntity['paymentMethod']>('Cash');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialCustomerId) {
      setSelectedCustomerId(initialCustomerId);
    } else if (selectableCustomers.length > 0 && !selectableCustomers.some((c: CustomerEntity) => c.id === selectedCustomerId)) {
      setSelectedCustomerId(selectableCustomers[0].id);
    }
  }, [initialCustomerId, selectableCustomers, selectedCustomerId]);

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Auto-fill full outstanding balance when customer is selected
  useEffect(() => {
    const cust = customers.find((c) => c.id === selectedCustomerId);
    if (cust && cust.outstandingBalance > 0) {
      setAmountInput(String(cust.outstandingBalance));
    } else {
      setAmountInput('');
    }
  }, [selectedCustomerId]);

  if (!isOpen) return null;

  const currentDue = selectedCustomer ? selectedCustomer.outstandingBalance : 0;
  const payAmount = parseFloat(amountInput) || 0;
  const calculatedRemaining = Math.max(0, currentDue - payAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }

    if (payAmount <= 0) {
      setError('Payment amount must be greater than zero.');
      return;
    }

    onConfirmPayment(
      selectedCustomerId,
      payAmount,
      paymentMethod,
      notes.trim() || undefined
    );

    setAmountInput('');
    setNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-line rounded-3xl max-w-md w-full p-5 space-y-4 shadow-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-nav-active-pill text-primary flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Receive Due Payment</h3>
              <p className="text-[11px] text-muted">Credit ledger clearance</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted hover:text-ink"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-badge-red-bg border border-badge-red-text/35 text-xs text-badge-red-text">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Customer Selection */}
          <div>
            <label className="text-ink font-semibold block mb-1">
              Select Customer Account *
            </label>
            <select
              value={selectedCustomerId}
              style={{ direction: 'ltr', textAlign: 'left' }}
              onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                const cust = customers.find((c) => c.id === e.target.value);
                if (cust) {
                  setAmountInput(String(cust.outstandingBalance));
                }
              }}
              className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-medium text-xs focus:ring-1 focus:ring-primary focus:border-line"
            >
              {selectableCustomers.map((c: CustomerEntity) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''} · Due: {formatCurrency(c.outstandingBalance, settings.currencySymbol)}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input with Quick Preset Chips */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-ink font-semibold">
                Amount Received ({settings.currencySymbol}) *
              </label>
              {currentDue > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAmountInput(String(currentDue))}
                    className="px-2 py-0.5 rounded bg-nav-active-pill border border-badge-green-text/35 text-[10px] text-primary font-bold hover:bg-nav-active-pill"
                  >
                    Full Due ({formatCurrency(currentDue, settings.currencySymbol)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput(String(Math.round(currentDue / 2)))}
                    className="px-2 py-0.5 rounded bg-inner border border-line-strong text-[10px] text-muted hover:bg-inner"
                  >
                    50%
                  </button>
                </div>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-muted">
                {settings.currencySymbol}
              </span>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="Enter amount collected"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl pl-7 pr-3 py-2 text-ink font-mono font-bold text-sm text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Automatic Balance Calculation (Exact Section 6 & 7 requirements) */}
          <div className="p-3 rounded-2xl bg-inner border border-line-strong space-y-1.5 font-mono text-xs">
            <div className="flex justify-between text-muted">
              <span>Current Outstanding Due:</span>
              <span className="text-badge-red-text font-bold">
                {formatCurrency(currentDue, settings.currencySymbol)}
              </span>
            </div>
            <div className="flex justify-between text-badge-green-text font-medium">
              <span>Payment Receiving Now:</span>
              <span>-{formatCurrency(payAmount, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between border-t border-line-strong pt-1 text-ink font-bold">
              <span>New Remaining Due:</span>
              <span className={calculatedRemaining === 0 ? 'text-badge-green-text' : 'text-badge-yellow-text'}>
                {formatCurrency(calculatedRemaining, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-ink font-semibold block mb-1">
              Payment Method *
            </label>
            <div className="grid grid-cols-4 gap-1.5 text-xs">
              {(['Cash', 'UPI', 'Bank Transfer', 'Cheque'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-1.5 rounded-lg font-medium text-center transition-colors ${
                    paymentMethod === method
                      ? 'bg-primary text-white font-bold'
                      : 'bg-inner text-muted hover:bg-inner border border-line-strong'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label className="text-ink block mb-1">Reference / Note</label>
            <input
              type="text"
              dir="ltr"
              style={{ direction: 'ltr', textAlign: 'left' }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. UPI Ref #904821 or Cash receipt memo"
              className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover active:scale-95 text-white font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Record Payment</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
