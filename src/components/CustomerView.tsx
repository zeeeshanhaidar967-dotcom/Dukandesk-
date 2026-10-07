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
} from 'lucide-react';
import { CustomerEntity, OwnerSettingsEntity } from '../types/database';
import { formatCurrency } from '../services/calculations';

interface CustomerViewProps {
  customers: CustomerEntity[];
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
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <span>Customer Ledger (Udhaar Khata)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Customers with pending dues and account balances
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <UserPlus className="w-4 h-4" />
          <span>New Customer</span>
        </button>
      </div>

      {/* Aggregate Credit Outstanding Banner */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl">
          <span className="text-slate-400 block text-[11px]">Total Outstanding Dues</span>
          <strong className="text-base sm:text-lg font-bold font-mono text-rose-400">
            {formatCurrency(totalOutstandingAll, settings.currencySymbol)}
          </strong>
        </div>

        <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <span className="text-slate-400 block text-[11px]">Customers with Dues</span>
          <div className="flex items-center justify-between">
            <strong className="text-base sm:text-lg font-bold font-mono text-amber-400">
              {customersWithDues.length}
            </strong>
            <span className="text-[11px] text-slate-400">
              ({settledCustomers.length} fully paid)
            </span>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs (Dues by default vs All history) */}
      <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('dues')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'dues'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          <span>Pending Dues ({customersWithDues.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-all ${
            activeTab === 'all'
              ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span>All Accounts ({customers.length})</span>
        </button>
      </div>

      {/* Search by Name or Mobile */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400 text-left"
          />
        </div>
      </div>

      {/* Customer Cards List */}
      <div className="space-y-2.5">
        {filteredCustomers.length === 0 ? (
          activeTab === 'dues' ? (
            <div className="text-center py-10 bg-slate-900/60 rounded-3xl border border-slate-800 p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-white">No Customers with Pending Dues</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                All customer bills and accounts have been paid in full! If you record a new sale with remaining balance, that customer will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-900/60 rounded-2xl border border-slate-800 text-xs text-slate-500">
              No customers found matching your search.
            </div>
          )
        ) : (
          filteredCustomers.map((cust) => {
            const hasDue = cust.outstandingBalance > 0;

            return (
              <div
                key={cust.id}
                className={`p-3.5 bg-slate-900/90 border rounded-2xl space-y-2.5 text-xs transition-colors ${
                  hasDue
                    ? 'border-rose-500/30 hover:border-rose-500/50'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between">
                  <div
                    onClick={() => onSelectCustomer(cust)}
                    className="min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-white text-xs truncate">{cust.name}</h4>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                        {cust.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1">
                      {cust.phone && (
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-500" />
                          {cust.phone}
                        </span>
                      )}
                      {cust.address && (
                        <span className="flex items-center gap-1 truncate max-w-[180px]">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {cust.address}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-500 block">Balance Due:</span>
                    <strong
                      className={`text-sm font-bold font-mono ${
                        hasDue ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatCurrency(cust.outstandingBalance, settings.currencySymbol)}
                    </strong>
                    {!hasDue && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium block mt-0.5">
                        Paid Full
                      </span>
                    )}
                  </div>
                </div>

                {/* Ledger metrics summary row */}
                <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500 text-[10px] block">Total Purchases:</span>
                    <span className="font-mono text-slate-200 font-semibold">
                      {formatCurrency(cust.totalPurchases, settings.currencySymbol)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-slate-500 text-[10px] block">Total Amount Paid:</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      {formatCurrency(cust.totalPaid, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <button
                    type="button"
                    onClick={() => onSelectCustomer(cust)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <span>View Complete Dashboard</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>

                  {hasDue && (
                    <button
                      type="button"
                      onClick={() => onOpenReceivePayment(cust.id)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all"
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
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Create Customer Account</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-2 rounded bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Customer / Contractor Name *</label>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Mobile Number</label>
                <input
                  type="tel"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 99887 66554"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-left"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">Billing Address / Site Location</label>
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">
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
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-left"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  If set &gt; 0, this customer will immediately show in your pending dues list.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-emerald-500 font-bold text-slate-950 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
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
