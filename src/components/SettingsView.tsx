import React, { useState } from 'react';
import {
  Settings,
  Database,
  Download,
  Upload,
  Lock,
  Store,
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Trash2,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  Cloud,
  HardDrive,
  Info,
  ArrowRight,
  Check,
  MessageSquare,
} from 'lucide-react';
import { OwnerSettingsEntity } from '../types/database';
import { roomDb } from '../db/roomDatabase';
import { uploadShopBackupToDrive } from '../services/googleDriveService';
import { getAccessToken, getCurrentlyAuthenticatedUser } from '../services/googleAuthService';

interface SettingsViewProps {
  settings: OwnerSettingsEntity;
  onUpdateSettings: (newSettings: Partial<OwnerSettingsEntity>) => void;
  onExportSQLite: () => void;
  onExportJSON: () => void;
  onImportJSON: (jsonString: string) => void;
  onResetToSample: () => void;
  onClearAll: (pin: string) => Promise<void> | void;
  onOpenGoogleDrive?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onExportSQLite,
  onExportJSON,
  onImportJSON,
  onResetToSample,
  onClearAll,
  onOpenGoogleDrive,
}) => {
  // Shop details form
  const [shopName, setShopName] = useState(settings.shopName);
  const [ownerName, setOwnerName] = useState(settings.ownerName);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Change PIN state
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  // Schema viewer toggle
  const [showSchema, setShowSchema] = useState(false);

  // In-app Modals for Reset / Wipe (No window.confirm/prompt)
  const [showResetModal, setShowResetModal] = useState(false);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipePinInput, setWipePinInput] = useState('');
  const [wipePhraseInput, setWipePhraseInput] = useState('');
  const [wipeError, setWipeError] = useState('');
  const [isExecutingWipe, setIsExecutingWipe] = useState(false);
  const [wipeStatusText, setWipeStatusText] = useState('');
  const [showToggleProdModal, setShowToggleProdModal] = useState(false);
  const [toggleProdPin, setToggleProdPin] = useState('');
  const [toggleProdError, setToggleProdError] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  const isProduction = !!settings.isProductionMode;

  const handleToggleProductionMode = (enable: boolean) => {
    // If turning ON Production Mode, ensure an Owner PIN is set first
    if (enable && (!settings.isPinSet || !settings.pin)) {
      setActionSuccessMsg('Set an Owner PIN in Settings first');
      setTimeout(() => setActionSuccessMsg(''), 5000);
      return;
    }

    if (!enable && isProduction) {
      // Require owner PIN to downgrade from production mode
      setToggleProdPin('');
      setToggleProdError('');
      if (!settings.isPinSet || !settings.pin) {
        setToggleProdError('Set an Owner PIN in Settings first');
      }
      setShowToggleProdModal(true);
    } else {
      onUpdateSettings({ isProductionMode: enable });
      setActionSuccessMsg(
        enable
          ? '✓ Production Mode ACTIVATED: Live business safeguards active. Wipe Clean is locked behind Owner PIN, typed phrase "DELETE ALL DATA", and a mandatory verified Google Drive safety backup.'
          : '⚡ Testing Mode ACTIVATED: Safeguards relaxed for testing demo data.'
      );
      setTimeout(() => setActionSuccessMsg(''), 6000);
    }
  };

  const handleConfirmDisableProduction = () => {
    if (!settings.isPinSet || !settings.pin) {
      setToggleProdError('Set an Owner PIN in Settings first');
      return;
    }

    if (toggleProdPin && toggleProdPin === settings.pin) {
      onUpdateSettings({ isProductionMode: false });
      setShowToggleProdModal(false);
      setActionSuccessMsg('⚡ Testing Mode ACTIVATED: Safeguards relaxed for demo testing.');
      setTimeout(() => setActionSuccessMsg(''), 5000);
    } else {
      setToggleProdError('Incorrect Owner PIN. Production Mode remains active.');
    }
  };

  const handleExecuteWipeClean = async () => {
    setWipeError('');

    // If Production Mode is OFF: fast test wipe
    if (!isProduction) {
      setIsExecutingWipe(true);
      setWipeStatusText('Clearing local stock, IndexedDB, and database tables...');
      try {
        await onClearAll(settings.pin);
        setShowWipeModal(false);
        setActionSuccessMsg('Database wiped clean. Stock and tables are now completely empty.');
        setTimeout(() => setActionSuccessMsg(''), 5000);
      } catch (err: any) {
        setWipeError(`Wipe error: ${err.message || 'Failed to wipe database'}`);
      } finally {
        setIsExecutingWipe(false);
        setWipeStatusText('');
      }
      return;
    }

    // If Production Mode is ON: execute strict multi-factor safeguards
    if (!settings.isPinSet || !settings.pin) {
      setWipeError('Set an Owner PIN in Settings first');
      return;
    }

    if (!wipePinInput || wipePinInput !== settings.pin) {
      setWipeError('Incorrect Owner PIN. Deletion cancelled.');
      return;
    }

    if (wipePhraseInput.trim() !== 'DELETE ALL DATA') {
      setWipeError('Confirmation phrase must match exactly "DELETE ALL DATA" (case-sensitive).');
      return;
    }

    setIsExecutingWipe(true);
    setWipeStatusText('Checking network and Google Drive authorization...');

    try {
      // 1. Verify Network Status
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Device is offline. A verified Google Drive safety backup is required before wiping in Production Mode. Local data has been kept untouched.');
      }

      // 2. Verify Google Drive Authentication
      const token = await getAccessToken();
      const authUser = getCurrentlyAuthenticatedUser();
      if (!token || !authUser) {
        throw new Error(
          'Google Drive is not connected. In Production Mode, a verified Google Drive safety backup is required before wiping live business data. Please connect Google Drive first. All local data remains safe.'
        );
      }

      // 3. Export complete structured database snapshot
      setWipeStatusText('Creating complete business database backup snapshot...');
      const backupJson = await roomDb.exportStructuredBackupJSON();

      // 4. Upload and verify backup in visible Google Drive folder
      setWipeStatusText('Uploading and verifying safety backup in Google Drive (MAHARAJA MARBLE — App Backups)...');
      const uploadResult = await uploadShopBackupToDrive(backupJson, {
        shopName: settings.shopName || 'MAHARAJA MARBLE',
        accountEmail: authUser.email || undefined,
      });

      if (!uploadResult || !uploadResult.file?.id) {
        throw new Error('Google Drive upload verification returned empty file ID. Safety backup could not be confirmed.');
      }

      // 5. Update settings metadata with backup confirmation
      const nowIso = new Date().toISOString();
      const sizeStr = `${(uploadResult.sizeBytes / 1024).toFixed(1)} KB`;
      onUpdateSettings({
        lastBackupDate: nowIso,
        lastBackupFileId: uploadResult.file.id,
        lastBackupFileSize: sizeStr,
        lastBackupAccount: authUser.email || undefined,
      });

      // 6. Safe wipe of local tables (Google Drive backups are never deleted)
      setWipeStatusText('Pre-wipe backup verified! Wiping local records, IndexedDB, and database tables...');
      await onClearAll(settings.pin);

      setShowWipeModal(false);
      setActionSuccessMsg(
        `✓ Emergency Wipe Completed: Pre-wipe safety backup "${uploadResult.file.name}" was successfully verified in Google Drive. Local database is clean. You can restore this backup anytime from Google Drive Cloud Restore.`
      );
      setTimeout(() => setActionSuccessMsg(''), 8000);
    } catch (err: any) {
      console.warn('Production wipe cancelled due to safety backup error:', err);
      setWipeError(
        `⚠️ EMERGENCY WIPE CANCELLED: ${err.message || 'Safety backup failed'}. ALL LOCAL DATA HAS BEEN KEPT UNTOUCHED.`
      );
    } finally {
      setIsExecutingWipe(false);
      setWipeStatusText('');
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      shopName: shopName.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      currencySymbol: currencySymbol.trim() || '₹',
      receiptFooter: receiptFooter.trim(),
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleChangePin = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess(false);

    if (settings.isPinSet && currentPin !== settings.pin) {
      setPinError('Current PIN is incorrect.');
      return;
    }

    if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
      setPinError('New PIN must be 4 to 6 digits.');
      return;
    }

    if (newPin !== confirmNewPin) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }

    onUpdateSettings({ pin: newPin, isPinSet: true });
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setPinSuccess(true);
    setTimeout(() => setPinSuccess(false), 3000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        onImportJSON(content);
        setActionSuccessMsg('Database successfully restored from backup file!');
        setTimeout(() => setActionSuccessMsg(''), 4000);
      } catch (err: any) {
        setActionSuccessMsg(`Failed to restore database: ${err.message || 'Invalid file format'}`);
        setTimeout(() => setActionSuccessMsg(''), 5000);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5 pb-24 text-xs">
      {/* Top Header */}
      <div>
        <h2 className="text-base font-bold text-ink flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" />
          <span>Shop & Database Settings</span>
        </h2>
        <p className="text-muted mt-0.5">
          Local SQLite engine, backup/restore, and owner security
        </p>
      </div>

      {actionSuccessMsg && (
        <div className="p-3 rounded-2xl bg-badge-green-bg border border-badge-green-text/35 text-badge-green-text font-semibold text-xs flex items-center justify-between shadow-sm animate-in fade-in">
          <span>✓ {actionSuccessMsg}</span>
          <button type="button" onClick={() => setActionSuccessMsg('')} className="text-muted hover:text-ink px-1">✕</button>
        </div>
      )}

      {/* 1. Shop Profile Configuration */}
      <div className="bg-card border border-line rounded-3xl p-5 space-y-4 shadow-card">
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-ink text-sm">Shop Profile & Bill Settings</h3>
          </div>
          {saveSuccess && (
            <span className="text-[11px] text-badge-green-text font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Saved!</span>
            </span>
          )}
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div>
            <label className="text-ink font-medium block mb-1">Shop / Business Name</label>
            <input
              type="text"
              dir="ltr"
              style={{ direction: 'ltr', textAlign: 'left' }}
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-medium text-left focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-ink font-medium block mb-1">Owner / Proprietor</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                required
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-ink font-medium block mb-1">Contact Phone</label>
              <input
                type="tel"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-mono text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-ink font-medium block mb-1">Shop Address</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-ink font-medium block mb-1">Currency Symbol</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'center' }}
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="text-ink font-medium block mb-1">Receipt Footer Note</label>
            <input
              type="text"
              dir="ltr"
              style={{ direction: 'ltr', textAlign: 'left' }}
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary-hover font-bold text-white transition-all shadow-md active:scale-95"
          >
            Save Shop Profile
          </button>
        </form>
      </div>

      {/* 2. Point of Sale & WhatsApp Billing Settings */}
      <div className="bg-card border border-line rounded-3xl p-5 space-y-4 shadow-card">
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-ink text-sm">Billing & WhatsApp Sharing Settings</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-green-bg text-badge-green-text border border-line-strong">
            BILLING SYSTEM
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-inner border border-line-strong flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink text-xs">
                Auto-prompt WhatsApp share on new bill
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  settings.autoPromptWhatsAppBilling !== false
                    ? 'bg-badge-green-bg text-badge-green-text'
                    : 'bg-card text-muted border border-line-strong'
                }`}
              >
                {settings.autoPromptWhatsAppBilling !== false ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              When enabled, a prompt will immediately pop up after creating every sale asking to send the bill directly to the customer on WhatsApp. If disabled, sales save instantly and you can share manually from the receipt view at any time.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              const currentVal = settings.autoPromptWhatsAppBilling !== false;
              onUpdateSettings({ autoPromptWhatsAppBilling: !currentVal });
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
              settings.autoPromptWhatsAppBilling !== false
                ? 'bg-primary hover:bg-primary-hover text-white shadow-card'
                : 'bg-card hover:bg-inner text-ink border border-line-strong'
            }`}
          >
            {settings.autoPromptWhatsAppBilling !== false ? 'Enabled (ON)' : 'Disabled (OFF)'}
          </button>
        </div>
      </div>

      {/* 3. Security & Owner PIN */}
      <div className="bg-card border border-line rounded-3xl p-5 space-y-4 shadow-card">
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-ink text-sm">Security & Owner PIN Lock</h3>
          </div>
          {pinSuccess && (
            <span className="text-[11px] text-badge-green-text font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PIN Changed!</span>
            </span>
          )}
        </div>

        {pinError && (
          <div className="p-2.5 rounded-xl bg-badge-red-bg border border-badge-red-text/35 text-badge-red-text">
            {pinError}
          </div>
        )}

        <form onSubmit={handleChangePin} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-muted block mb-1">
                {settings.isPinSet ? 'Current PIN' : 'Current PIN (Optional)'}
              </label>
              <input
                type="password"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'center' }}
                maxLength={6}
                required={!!settings.isPinSet}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder={settings.isPinSet ? '******' : 'None set'}
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-center text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-muted block mb-1">New PIN (4-6 Digits)</label>
              <input
                type="password"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'center' }}
                maxLength={6}
                required
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="******"
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-center text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-muted block mb-1">Confirm PIN</label>
              <input
                type="password"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'center' }}
                maxLength={6}
                required
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value)}
                placeholder="******"
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-center text-ink font-mono focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold transition-all shadow"
          >
            Update Owner Security PIN
          </button>
        </form>
      </div>

      {/* 3. Android Room SQLite Database Backup & Restore */}
      <div className="bg-card border border-line rounded-3xl p-5 space-y-4 shadow-card">
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            <h3 className="font-bold text-ink text-sm">Android Room SQLite Database Backup</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-green-bg text-badge-green-text border border-line-strong">
            OFFLINE PERSISTENT
          </span>
        </div>

        <p className="text-muted">
          Your shop data is stored locally in SQLite database architecture. You can export complete snapshots to safeguard your business records or transfer to another device.
        </p>

        {/* Google Drive Cloud Sync & Backup Banner */}
        {onOpenGoogleDrive && (
          <div className="p-4 rounded-2xl bg-inner border border-line-strong flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-badge-blue-bg border border-line-strong text-badge-blue-text flex items-center justify-center shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-ink text-xs flex items-center gap-2">
                  <span>Google Drive Cloud Backup & Restore</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-badge-green-bg text-badge-green-text">
                    Visible My Drive
                  </span>
                </div>
                <p className="text-[11px] text-muted mt-0.5">
                  Backups saved to normal folder: <strong className="text-ink">MAHARAJA MARBLE — App Backups</strong>
                </p>
                {settings.lastBackupDate && (
                  <p className="text-[10px] text-badge-green-text mt-0.5">
                    Last backup: {new Date(settings.lastBackupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} ({settings.lastBackupFileSize || ''})
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenGoogleDrive}
              className="px-3.5 py-2 rounded-xl bg-badge-blue-text hover:bg-badge-blue-text/90 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all shrink-0"
            >
              <HardDrive className="w-4 h-4" />
              <span>Cloud Backup & Restore</span>
            </button>
          </div>
        )}

        {/* Export Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onExportSQLite}
            className="p-3 rounded-2xl bg-inner hover:bg-card border border-line-strong text-left transition-all group"
          >
            <div className="flex items-center gap-2 font-bold text-ink mb-1">
              <FileCode className="w-4 h-4 text-badge-blue-text" />
              <span>Export SQLite Dump</span>
            </div>
            <p className="text-[11px] text-muted">
              Download standard .sql DDL & DML script compatible with SQLite 3 / Android Room
            </p>
          </button>

          <button
            type="button"
            onClick={onExportJSON}
            className="p-3 rounded-2xl bg-inner hover:bg-card border border-line-strong text-left transition-all group"
          >
            <div className="flex items-center gap-2 font-bold text-ink mb-1">
              <FileJson className="w-4 h-4 text-badge-green-text" />
              <span>Export JSON Backup</span>
            </div>
            <p className="text-[11px] text-muted">
              Download full structured database backup file for easy restore
            </p>
          </button>
        </div>

        {/* Restore From File */}
        <div className="p-3.5 bg-inner rounded-2xl border border-line-strong flex items-center justify-between">
          <div>
            <div className="font-bold text-ink flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5 text-badge-green-text" />
              <span>Restore Database from Backup</span>
            </div>
            <span className="text-[11px] text-muted block mt-0.5">
              Select a previously exported .json file
            </span>
          </div>

          <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-card hover:bg-inner text-ink font-semibold text-xs border border-line-strong active:scale-95 transition-all">
            <span>Choose File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Schema Inspector */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowSchema((prev) => !prev)}
            className="text-[11px] text-badge-blue-text hover:underline font-semibold"
          >
            {showSchema ? '▼ Hide SQLite Room Schema' : '► View Android Room Database SQLite Schema'}
          </button>

          {showSchema && (
            <div className="mt-2 p-3 bg-inner rounded-2xl border border-line-strong font-mono text-[10px] text-ink overflow-x-auto max-h-52">
              <pre className="text-badge-green-text font-bold mb-1">// Android Room Database Entities & Tables</pre>
              <pre>
{`@Entity(tableName = "products")
- id: TEXT PRIMARY KEY
- name: TEXT, photoUrl: TEXT, category: TEXT, brand: TEXT, producer: TEXT, supplier: TEXT
- unit: TEXT, purchasePrice: REAL, sellingPrice: REAL, currentStock: REAL, minStockLevel: REAL

@Entity(tableName = "customers")
- id: TEXT PRIMARY KEY
- name: TEXT, phone: TEXT, address: TEXT, totalPurchases: REAL, totalPaid: REAL, outstandingBalance: REAL

@Entity(tableName = "sales")
- id: TEXT PRIMARY KEY, billNumber: TEXT UNIQUE, customerId: TEXT (FK)
- totalBill: REAL, totalCost: REAL, grossProfit: REAL, amountPaid: REAL, balanceDue: REAL, paymentMethod: TEXT

@Entity(tableName = "sale_items")
- id: TEXT PRIMARY KEY, saleId: TEXT (FK), productId: TEXT (FK)
- quantity: REAL, purchasePrice: REAL, sellingPrice: REAL, subtotal: REAL, grossProfit: REAL

@Entity(tableName = "payments")
- id: TEXT PRIMARY KEY, customerId: TEXT (FK), amount: REAL, paymentMethod: TEXT, paymentDate: TEXT

@Entity(tableName = "stock_movements")
- id: TEXT PRIMARY KEY, productId: TEXT (FK), type: TEXT, quantity: REAL, previousStock: REAL, newStock: REAL`}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* 4. Data Reset & Safeguard Controls */}
      <div className="bg-card border border-line rounded-3xl p-5 space-y-4 shadow-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line-strong pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-badge-yellow-text" />
              <h3 className="font-bold text-ink text-sm">Data Reset & Protection Options</h3>
            </div>
            <p className="text-[11px] text-muted mt-0.5">
              Safeguard business records, switch between demo testing and production, or perform protected wipe
            </p>
          </div>
          {isProduction ? (
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-badge-green-bg text-badge-green-text border border-line-strong flex items-center gap-1.5 self-start sm:self-auto">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>PRODUCTION MODE: ON</span>
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-badge-yellow-bg text-badge-yellow-text border border-line-strong flex items-center gap-1.5 self-start sm:self-auto">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>TESTING MODE (DEMO)</span>
            </span>
          )}
        </div>

        {/* 1. Production Mode Setting Card */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isProduction
              ? 'bg-badge-green-bg/50 border-line-strong shadow-sm'
              : 'bg-badge-yellow-bg/50 border-line-strong'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {isProduction ? (
                  <ShieldCheck className="w-4 h-4 text-badge-green-text" />
                ) : (
                  <Shield className="w-4 h-4 text-badge-yellow-text" />
                )}
                <span className="font-bold text-ink text-xs">Production Mode Protection</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isProduction ? 'bg-badge-green-bg text-badge-green-text' : 'bg-badge-yellow-bg text-badge-yellow-text'
                  }`}
                >
                  {isProduction ? 'ACTIVE (Protected)' : 'OFF (Testing Only)'}
                </span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                {isProduction
                  ? 'Strong protection is ON for live business data. Accidental deletion is prevented: "Wipe Clean" requires Owner PIN, typing "DELETE ALL DATA", and a mandatory verified Google Drive safety backup before deletion.'
                  : 'Testing mode is active. "Wipe Clean" can be used for testing fake/demo data with a simple confirmation.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleProductionMode(!isProduction)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-card flex items-center gap-2 active:scale-95 ${
                  isProduction
                    ? 'bg-badge-green-text hover:bg-primary-hover text-white'
                    : 'bg-card hover:bg-inner text-ink border border-line-strong'
                }`}
              >
                {isProduction ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Production Mode: ON</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-3.5 h-3.5 text-badge-yellow-text" />
                    <span>Turn ON Production Mode</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 5 Distinct Cards (Requirement 9) */}
        <div className="space-y-2.5 pt-1">
          {/* Card 1: Demo/Test Reset */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-inner rounded-2xl border border-line-strong gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink text-xs">Demo/Test Reset</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-blue-bg text-badge-blue-text border border-line-strong">
                  Sample Data
                </span>
              </div>
              <p className="text-[11px] text-muted mt-0.5">
                Re-seeds authentic marble, granite, sanitaryware, sample customers, and initial bills for demonstration and feature testing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-card hover:bg-inner text-ink font-semibold text-xs border border-line-strong active:scale-95 transition-all shrink-0 self-start sm:self-auto"
            >
              Reset to Sample
            </button>
          </div>

          {/* Card 2: Protected Emergency Wipe */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-badge-red-bg/30 rounded-2xl border border-badge-red-text/35 gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-badge-red-text text-xs">
                  Clear All Records (Clean Shop) → Protected Emergency Wipe
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-red-bg text-badge-red-text border border-line-strong">
                  {isProduction ? 'PIN + Cloud Backup Guarded' : 'Quick Test Wipe'}
                </span>
              </div>
              <p className="text-[11px] text-muted mt-0.5 leading-relaxed">
                {isProduction
                  ? 'Wipes local products, inventory, bills, payments, and customers from this device. In Production Mode, requires Owner PIN, typing "DELETE ALL DATA", and a mandatory verified Google Drive safety backup before deleting.'
                  : 'Wipes all local inventory, customers, and transactions to start with a fresh blank database. Quick confirmation for testing.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (isProduction && (!settings.isPinSet || !settings.pin)) {
                  setActionSuccessMsg('Set an Owner PIN in Settings first');
                  setTimeout(() => setActionSuccessMsg(''), 5000);
                  return;
                }
                setWipePinInput('');
                setWipePhraseInput('');
                setWipeError('');
                setShowWipeModal(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-badge-red-text hover:bg-badge-red-text/90 text-white font-bold text-xs active:scale-95 transition-all shrink-0 self-start sm:self-auto flex items-center gap-1.5 shadow"
            >
              <Trash2 className="w-3.5 h-3.5 text-white" />
              <span>Wipe Clean</span>
            </button>
          </div>

          {/* Card 3: Google Drive Backup */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-inner rounded-2xl border border-line-strong gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink text-xs">Google Drive Backup</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-green-bg text-badge-green-text border border-line-strong">
                  External Cloud Storage
                </span>
              </div>
              <p className="text-[11px] text-muted mt-0.5">
                Creates an independent database backup in your visible Google Drive folder (
                <strong className="text-ink">MAHARAJA MARBLE — App Backups</strong>). Backups in Google Drive are NEVER deleted by local wipes.
              </p>
            </div>
            {onOpenGoogleDrive && (
              <button
                type="button"
                onClick={onOpenGoogleDrive}
                className="px-3.5 py-1.5 rounded-xl bg-badge-blue-text hover:bg-badge-blue-text/90 text-white font-bold text-xs active:scale-95 transition-all shrink-0 self-start sm:self-auto flex items-center gap-1.5 shadow"
              >
                <Cloud className="w-3.5 h-3.5 text-white" />
                <span>Cloud Backup</span>
              </button>
            )}
          </div>

          {/* Card 4: Google Drive Restore */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-inner rounded-2xl border border-line-strong gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink text-xs">Google Drive Restore</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-badge-blue-bg text-badge-blue-text border border-line-strong">
                  Disaster Recovery
                </span>
              </div>
              <p className="text-[11px] text-muted mt-0.5">
                Recovers all shop products, customers, bills, stock movements, and settings from Google Drive cloud backups even after local wipes, app reinstallation, phone loss, or device factory resets.
              </p>
            </div>
            {onOpenGoogleDrive && (
              <button
                type="button"
                onClick={onOpenGoogleDrive}
                className="px-3.5 py-1.5 rounded-xl bg-card hover:bg-inner text-badge-blue-text border border-line-strong font-bold text-xs active:scale-95 transition-all shrink-0 self-start sm:self-auto flex items-center gap-1.5"
              >
                <HardDrive className="w-3.5 h-3.5 text-badge-blue-text" />
                <span>Cloud Restore</span>
              </button>
            )}
          </div>
        </div>

        {/* Feature Comparison & Policy Legend (Requirement 9) */}
        <div className="p-3.5 rounded-2xl bg-inner border border-line-strong space-y-2 text-[11px] text-muted">
          <div className="flex items-center gap-2 font-bold text-ink text-xs">
            <Info className="w-4 h-4 text-badge-blue-text" />
            <span>Understanding Data Reset & Safety Distinctions</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
            <div className="p-2 rounded-xl bg-card border border-line-strong space-y-0.5">
              <strong className="text-ink block">Demo/Test Reset vs. Production</strong>
              <p className="text-muted">
                Demo Reset reloads pre-set sample products for testing. Production Mode protects real daily business sales from accidental erasure.
              </p>
            </div>
            <div className="p-2 rounded-xl bg-card border border-line-strong space-y-0.5">
              <strong className="text-ink block">Protected Wipe vs. Cloud Backups</strong>
              <p className="text-muted">
                Local wiping only clears phone storage. Google Drive cloud backups remain 100% intact and can be restored anytime.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Reset to Sample In-App Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-card">
            <h3 className="text-sm font-bold text-ink">Reset to Sample Shop Data?</h3>
            <p className="text-xs text-muted">
              Current products and records will be replaced with fresh sample marble & tiles data.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  onResetToSample();
                  setActionSuccessMsg('Reset to sample marble shop data completed.');
                  setTimeout(() => setActionSuccessMsg(''), 4000);
                }}
                className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white font-bold text-xs shadow-md"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Production Mode PIN Modal */}
      {showToggleProdModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-line rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-card">
            <div className="flex items-center gap-2 text-badge-yellow-text font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Disable Production Mode?</span>
            </div>
            <p className="text-xs text-muted">
              Disabling Production Mode relaxes safeguards for testing with demo data. Please enter your Owner PIN to confirm.
            </p>

            {toggleProdError && (
              <div className="p-2.5 rounded-xl bg-badge-red-bg border border-badge-red-text/35 text-xs text-badge-red-text">
                {toggleProdError}
              </div>
            )}

            <div>
              <label className="text-[11px] text-muted block mb-1">Owner PIN</label>
              <input
                type="password"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'center' }}
                maxLength={6}
                value={toggleProdPin}
                onChange={(e) => setToggleProdPin(e.target.value)}
                placeholder="******"
                className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-center text-ink font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowToggleProdModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong font-medium text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisableProduction}
                className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-accent-text font-bold text-xs shadow-md"
              >
                Disable Protection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe Clean In-App Modal (Dual-Mode: Testing vs Production) */}
      {showWipeModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-line rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-card animate-in fade-in">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-line-strong pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isProduction ? 'bg-badge-red-bg text-badge-red-text' : 'bg-badge-yellow-bg text-badge-yellow-text'
                  }`}
                >
                  {isProduction ? <ShieldAlert className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    {isProduction ? 'Protected Emergency Wipe' : 'Clear All Records (Test Mode)'}
                  </h3>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                      isProduction
                        ? 'bg-badge-red-bg text-badge-red-text border border-line-strong'
                        : 'bg-badge-yellow-bg text-badge-yellow-text border border-line-strong'
                    }`}
                  >
                    {isProduction ? 'PRODUCTION SAFEGUARDS ENFORCED' : 'DEMO TESTING MODE'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isExecutingWipe) setShowWipeModal(false);
                }}
                disabled={isExecutingWipe}
                className="text-muted hover:text-ink p-1"
              >
                ✕
              </button>
            </div>

            {/* Error Message */}
            {wipeError && (
              <div className="p-3 rounded-xl bg-badge-red-bg border border-badge-red-text/35 text-xs text-badge-red-text leading-relaxed">
                {wipeError}
              </div>
            )}

            {/* Status Message during execution */}
            {isExecutingWipe && (
              <div className="p-3 rounded-xl bg-badge-blue-bg border border-badge-blue-text/35 text-xs text-badge-blue-text flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-badge-blue-text shrink-0" />
                <span>{wipeStatusText || 'Processing safety protocols...'}</span>
              </div>
            )}

            {/* Mode-specific content */}
            {!isProduction ? (
              // 1. Production Mode OFF: Simple Testing Wipe
              <div className="space-y-3">
                <p className="text-xs text-muted leading-relaxed">
                  You are currently in <strong className="text-badge-yellow-text">Testing Mode</strong>. Wiping the database will clear all demo products, stock, customers, sales, and payments so you can start with a clean shop.
                </p>
                <div className="p-3 rounded-xl bg-inner border border-line-strong text-[11px] text-muted space-y-1">
                  <div className="text-ink font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-badge-green-text" />
                    <span>Google Drive backups are never deleted</span>
                  </div>
                  <p>
                    Any existing Google Drive cloud backups remain completely safe and can be restored anytime.
                  </p>
                </div>
              </div>
            ) : (
              // 2. Production Mode ON: Multi-Factor Protected Wipe
              <div className="space-y-4">
                {/* Critical Warning */}
                <div className="p-3 rounded-2xl bg-badge-red-bg border border-badge-red-text/35 text-xs text-badge-red-text space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-badge-red-text">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>PERMANENT LOCAL DELETION WARNING</span>
                  </div>
                  <p className="text-[11px] text-badge-red-text/90 leading-relaxed">
                    This operation will delete <strong>ALL local products, stock, customers, sales, bills, payments, returns, and shop records</strong> from this device.
                  </p>
                  <p className="text-[11px] text-badge-green-text font-semibold pt-1 border-t border-badge-red-text/35">
                    ✓ Google Drive backups will NOT be deleted. An automatic cloud safety backup will be verified BEFORE wiping. If the backup fails, deletion is cancelled immediately.
                  </p>
                </div>

                {/* Step 1: Owner PIN */}
                <div>
                  <label className="text-[11px] text-ink font-semibold block mb-1">
                    Step 1: Enter Owner PIN
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'center' }}
                    maxLength={6}
                    disabled={isExecutingWipe}
                    value={wipePinInput}
                    onChange={(e) => setWipePinInput(e.target.value)}
                    placeholder="Enter Owner PIN"
                    className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-center text-ink font-mono text-sm tracking-widest focus:border-badge-red-text focus:outline-none"
                  />
                </div>

                {/* Step 2: Exact phrase typing */}
                <div>
                  <label className="text-[11px] text-ink font-semibold block mb-1">
                    Step 2: Type exactly <span className="font-mono text-badge-red-text select-all font-bold">DELETE ALL DATA</span>
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    style={{ direction: 'ltr', textAlign: 'center' }}
                    disabled={isExecutingWipe}
                    value={wipePhraseInput}
                    onChange={(e) => setWipePhraseInput(e.target.value)}
                    placeholder="DELETE ALL DATA"
                    className="w-full bg-card border border-line-strong rounded-xl px-3 py-2 text-center text-ink font-mono text-xs uppercase tracking-wider focus:border-badge-red-text focus:outline-none"
                  />
                  {wipePhraseInput && wipePhraseInput.trim() !== 'DELETE ALL DATA' && (
                    <span className="text-[10px] text-badge-yellow-text block mt-1 text-center font-mono">
                      Must match exactly: DELETE ALL DATA
                    </span>
                  )}
                  {wipePhraseInput.trim() === 'DELETE ALL DATA' && (
                    <span className="text-[10px] text-badge-green-text block mt-1 text-center font-mono font-semibold">
                      ✓ Phrase confirmed
                    </span>
                  )}
                </div>

                {/* Mandatory Pre-Wipe Backup Indicator */}
                <div className="p-2.5 rounded-xl bg-inner border border-line-strong text-[11px] text-ink flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-badge-blue-text shrink-0" />
                  <span>
                    <strong>Automatic Pre-Wipe Cloud Backup:</strong> Will upload snapshot to Google Drive folder <em>MAHARAJA MARBLE — App Backups</em>.
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-2 border-t border-line-strong">
              <button
                type="button"
                disabled={isExecutingWipe}
                onClick={() => setShowWipeModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-card hover:bg-inner text-ink border border-line-strong font-semibold text-xs active:scale-95 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isExecutingWipe ||
                  (isProduction &&
                    (!wipePinInput || wipePhraseInput.trim() !== 'DELETE ALL DATA'))
                }
                onClick={handleExecuteWipeClean}
                className="flex-1 py-2.5 rounded-xl font-bold text-xs shadow active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-badge-red-text hover:bg-badge-red-text/90 text-white"
              >
                {isExecutingWipe ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Backing up & Verifying...</span>
                  </>
                ) : isProduction ? (
                  <>
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Backup & Wipe Clean</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Wipe Clean</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
