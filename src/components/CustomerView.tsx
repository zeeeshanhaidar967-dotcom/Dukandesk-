import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Phone,
  MapPin,
  Wallet,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Receipt,
  RotateCcw,
} from 'lucide-react';
import { CustomerEntity, OwnerSettingsEntity, SaleEntity, SaleReturnEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

interface CustomerViewProps {
  customers: CustomerEntity[];
  sales?: SaleEntity[];
  returns?: SaleReturnEntity[];
  settings: OwnerSettingsEntity;
  onSelectCustomer: (customer: CustomerEntity) => void;
  onOpenReceivePayment: (customerId: string) => void;
  onAddCustomer: (data: {
    name: string;
    phone: string;
    address: string;
    openingBalance?: number;
  }) => void;
}

export const CustomerView: React.FC<CustomerViewProps> = ({
  customers,
  sales = [],
  returns = [],
  settings,
  onSelectCustomer,
  onOpenReceivePayment,
  onAddCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  // Default to 'dues' so only customers who have pending dues are seen
  const [activeTab, setActiveTab] = useState<'dues' | 'all'>('dues');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [formError, setFormError] = useState('');

  // Group customers by dues status
  const customersWithDues = useMemo(() => {
    return customers.filter((c) => c.outstandingBalance > 0);
  }, [customers]);

  const settledCustomers = useMemo(() => {
    return customers.filter((c) => c.outstandingBalance <= 0);
  }, [customers]);

  // Total outstanding due across all customers
  const totalOutstandingAll = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.outstandingBalance, 0);
  }, [customers]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Filtered customers based on activeTab and search query (uses deferred query to eliminate typing lag)
  const filteredCustomers = useMemo(() => {
    // When in 'dues' tab, strictly show only customers with outstanding balance > 0
    const baseList = activeTab === 'dues' ? customersWithDues : customers;
    const q = deferredSearchQuery.toLowerCase().trim();
    if (!q) return baseList;

    return baseList.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    });
  }, [activeTab, customersWithDues, customers, deferredSearchQuery]);

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Customer name is required.');
      return;
    }

    const initialDue = parseFloat(openingBalance);

    onAddCustomer({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      openingBalance: !isNaN(initialDue) && initialDue > 0 ? initialDue : undefined,
    });

    setName('');
    setPhone('');
    setAddress('');
    setOpeningBalance('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-ink flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <span>Customer Ledger (Udhaar Khata)</span>
          </h2>
          <p className="text-xs text-muted">
            Customers with pending dues and account balances
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Aggregate Credit Outstanding Banner */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 bg-card border border-line rounded-2xl shadow-card">
          <span className="text-muted block text-[11px]">Total Outstanding Dues</span>
          <strong className="text-base sm:text-lg font-bold font-mono text-badge-red-text">
            {formatCurrency(totalOutstandingAll, settings.currencySymbol)}
          </strong>
        </div>

        <div className="p-3.5 bg-card border border-line rounded-2xl shadow-card flex flex-col justify-between">
          <span className="text-muted block text-[11px]">Customers with Dues</span>
          <div className="flex items-center justify-between">
            <strong className="text-base sm:text-lg font-bold font-mono text-badge-yellow-text">
              {customersWithDues.length}
            </strong>
            <span className="text-[11px] text-muted">
              ({settledCustomers.length} fully paid)
            </span>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs (Dues by default vs All history) */}
      <div className="grid grid-cols-2 p-1 bg-inner border border-line-strong rounded-2xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('dues')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'dues'
              ? 'bg-badge-red-bg text-badge-red-text border border-badge-red-text/35 shadow-sm'
              : 'text-muted hover:text-ink'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-badge-red-text" />
          <span>Pending Dues ({customersWithDues.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'all'
              ? 'bg-card text-ink border border-line shadow-card'
              : 'text-muted hover:text-ink'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-muted" />
          <span>All Accounts ({customers.length})</span>
        </button>
      </div>

      {/* Search by Name or Mobile */}
      <div className="bg-card border border-line rounded-2xl p-3 space-y-2 shadow-card">
        <div className="relative">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            dir="ltr"
            style={{ direction: 'ltr', textAlign: 'left' }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'dues'
                ? 'Search customers with pending dues...'
                : 'Search all customer accounts...'
            }
            className="w-full bg-card border border-line-strong rounded-xl pl-9 pr-3 py-2 text-xs text-ink placeholder-placeholder focus:outline-none focus:ring-1 focus:ring-primary text-left"
          />
        </div>
      </div>

      {/* Customer Cards List */}
      <div className="space-y-2.5">
        {filteredCustomers.length === 0 ? (
          activeTab === 'dues' ? (
            <div className="text-center py-10 bg-card rounded-3xl border border-line p-6 space-y-3 shadow-card">
              <div className="w-12 h-12 rounded-2xl bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-ink">No Customers with Pending Dues</h4>
              <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
                All customer bills and accounts have been paid in full! If you record a new sale with remaining balance, that customer will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="text-center py-10 bg-card rounded-2xl border border-line text-xs text-muted shadow-card">
              No customers found matching your search.
            </div>
          )
        ) : (
          filteredCustomers.map((cust) => {
            const hasDue = cust.outstandingBalance > 0;
            const custSalesCount = sales.filter((s) => s.customerId === cust.id).length;
            const custReturnsCount = returns.filter(
              (r) => r.customerId === cust.id || (r.saleId && sales.some((s) => s.id === r.saleId && s.customerId === cust.id))
            ).length;

            return (
              <div
                key={cust.id}
                className={`p-3.5 bg-card border rounded-2xl space-y-2.5 text-xs transition-colors shadow-card ${
                  hasDue
                    ? 'border-badge-red-text/35 hover:border-badge-red-text/50'
                    : 'border-line hover:border-line-strong'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div
                    onClick={() => onSelectCustomer(cust)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-ink text-xs truncate">{cust.name}</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-inner text-muted border border-line-strong shrink-0">
                        {cust.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-muted mt-1">
                      {cust.phone && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-muted" />
                          {cust.phone}
                        </span>
                      )}
                      {cust.address && (
                        <span className="flex items-center gap-1 truncate max-w-[180px]">
                          <MapPin className="w-3 h-3 text-muted" />
                          {cust.address}
                        </span>
                      )}
                    </div>

                    {/* Bill & Return Count Badges */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-inner text-ink border border-line-strong text-[10px] font-mono font-medium">
                        {custSalesCount} {custSalesCount === 1 ? 'Sale Bill' : 'Sale Bills'}
                      </span>
                      {custReturnsCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-badge-red-bg text-badge-red-text border border-badge-red-text/35 text-[10px] font-mono font-medium flex items-center gap-1">
                          <RotateCcw className="w-2.5 h-2.5 text-badge-red-text" />
                          <span>{custReturnsCount} {custReturnsCount === 1 ? 'Return Bill' : 'Return Bills'}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-muted block">Balance Due:</span>
                    <strong
                      className={`text-sm font-bold font-mono ${
                        hasDue ? 'text-badge-red-text' : 'text-badge-green-text'
                      }`}
                    >
                      {formatCurrency(cust.outstandingBalance, settings.currencySymbol)}
                    </strong>
                    {!hasDue && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-badge-green-bg text-badge-green-text border border-badge-green-text/35 font-medium block mt-0.5">
                        Paid Full
                      </span>
                    )}
                  </div>
                </div>

                {/* Ledger metrics summary row */}
                <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-inner border border-line-strong text-[11px]">
                  <div>
                    <span className="text-muted text-[10px] block">Total Purchases:</span>
                    <span className="font-mono text-ink font-semibold">
                      {formatCurrency(cust.totalPurchases, settings.currencySymbol)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-muted text-[10px] block">Total Amount Paid:</span>
                    <span className="font-mono text-badge-green-text font-semibold">
                      {formatCurrency(cust.totalPaid, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-line">
                  <button
                    type="button"
                    onClick={() => onSelectCustomer(cust)}
                    className="text-[11px] text-primary hover:text-primary-hover font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Receipt className="w-3.5 h-3.5 text-primary" />
                    <span>View Bill History & Profile</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  {hasDue && (
                    <button
                      type="button"
                      onClick={() => onOpenReceivePayment(cust.id)}
                      className="px-2.5 py-1 rounded-lg bg-badge-green-bg hover:bg-badge-green-bg/80 text-badge-green-text border border-badge-green-text/35 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
                    >
                      <Wallet className="w-3 h-3" />
                      <span>Receive Payment</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                <span>Create Customer Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-muted hover:text-ink text-xs"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2 rounded bg-badge-red-bg border border-badge-red-text/35 text-xs text-badge-red-text">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-ink font-medium block mb-1">Customer / Contractor Name *</label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Balwant Singh Builders"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-ink font-medium block mb-1">Mobile Number</label>
                <input
                  type="tel"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 99887 66554"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-mono text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-ink font-medium block mb-1">Billing Address / Site Location</label>
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Sector 14, Commercial Tower Site"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-ink font-medium block mb-1">
                  Previous Due Balance ({settings.currencySymbol}) (Optional)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoComplete="off"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  placeholder="0 (leave empty if no prior debt)"
                  className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-mono text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted mt-1">
                  If set &gt; 0, this customer will immediately show in your pending dues list.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-xl bg-inner text-muted hover:bg-inner font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-primary hover:bg-primary-hover font-bold text-white shadow-sm active:scale-95 transition-all"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
