import React, { useState, useEffect } from 'react';
import { X, Upload, Camera, Image as ImageIcon, Save, Trash2, Layers } from 'lucide-react';
import { ProductEntity, UnitOfMeasurement, OwnerSettingsEntity } from '../types/database';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: Omit<ProductEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  onDelete?: (productId: string) => void;
  productToEdit?: ProductEntity | null;
  existingCategories: string[];
  existingSuppliers: string[];
  settings: OwnerSettingsEntity;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  productToEdit,
  existingCategories,
  existingSuppliers,
  settings,
}) => {
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [producer, setProducer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [unit, setUnit] = useState<UnitOfMeasurement>('Box');
  const [customUnit, setCustomUnit] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [currentStock, setCurrentStock] = useState('0');
  const [minStockLevel, setMinStockLevel] = useState('10');
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (productToEdit) {
      setName(productToEdit.name);
      setPhotoUrl(productToEdit.photoUrl || '');
      setCategory(productToEdit.category);
      setBrand(productToEdit.brand);
      setProducer(productToEdit.producer);
      setSupplier(productToEdit.supplier);
      setUnit(productToEdit.unit);
      setCustomUnit(productToEdit.customUnit || '');
      setPurchasePrice(String(productToEdit.purchasePrice));
      setSellingPrice(productToEdit.sellingPrice != null ? String(productToEdit.sellingPrice) : '');
      setCurrentStock(String(productToEdit.currentStock));
      setMinStockLevel(String(productToEdit.minStockLevel));
    } else {
      setName('');
      setPhotoUrl('');
      setCategory(existingCategories[0] || 'Floor Tiles');
      setCustomCategory('');
      setBrand('');
      setProducer('');
      setSupplier(existingSuppliers[0] || 'Direct Distributor');
      setUnit('Box');
      setCustomUnit('');
      setPurchasePrice('');
      setSellingPrice('');
      setCurrentStock('0');
      setMinStockLevel('10');
    }
    setError('');
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  // Handle Photo selection (manual file picker / camera on mobile)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (keep under 2MB for local storage)
      if (file.size > 2 * 1024 * 1024) {
        setError('Photo size should be under 2MB for optimal local storage.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Product name is required.');
      return;
    }

    const finalCategory = category === '__NEW__' ? customCategory.trim() : category.trim();
    if (!finalCategory) {
      setError('Please provide a category.');
      return;
    }

    const pPrice = parseFloat(purchasePrice);
    if (isNaN(pPrice) || pPrice < 0) {
      setError('Please provide a valid purchase price.');
      return;
    }

    let sPrice: number | null = null;
    if (sellingPrice.trim() !== '') {
      const parsed = parseFloat(sellingPrice);
      if (isNaN(parsed) || parsed < 0) {
        setError('Please provide a valid non-negative selling price, or leave it blank.');
        return;
      }
      sPrice = parsed;
    }

    const stock = parseFloat(currentStock) || 0;
    const minStock = parseFloat(minStockLevel) || 0;

    onSave({
      id: productToEdit?.id,
      name: name.trim(),
      photoUrl: photoUrl || undefined,
      category: finalCategory,
      brand: brand.trim() || 'Standard',
      producer: producer.trim() || 'Manufacturer',
      supplier: supplier.trim() || 'Local Supplier',
      unit,
      customUnit: unit === 'Other' ? customUnit.trim() : undefined,
      purchasePrice: pPrice,
      sellingPrice: sPrice,
      currentStock: stock,
      minStockLevel: minStock,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-card border border-line rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-card max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-strong pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-nav-active-pill text-primary flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">
                {productToEdit ? 'Edit Product Details' : 'Create New Product'}
              </h3>
              <p className="text-[11px] text-muted">
                Saved to local SQLite database permanently
              </p>
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs overflow-y-auto pr-1 flex-1">
          {/* Photo Upload Area (Visual Reference Only - strictly NO scanner) */}
          <div className="flex items-center gap-3 p-3 bg-inner border border-line-strong rounded-2xl">
            <div className="w-20 h-20 rounded-xl bg-card border border-line-strong overflow-hidden flex items-center justify-center relative shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Product preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted" />
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <span className="text-[11px] font-semibold text-ink block">
                Product Photo (Visual Reference Only)
              </span>
              <p className="text-[10px] text-muted">
                Take photo with Android camera or select image file.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <label className="cursor-pointer px-2.5 py-1.5 rounded-lg bg-card hover:bg-inner text-ink text-[11px] font-medium flex items-center gap-1.5 border border-line-strong transition-colors">
                  <Upload className="w-3.5 h-3.5 text-primary" />
                  <span>Choose Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="text-xs text-badge-red-text hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="text-ink font-semibold block mb-1">
              Product Name *
            </label>
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
              placeholder="e.g. Kajaria 600x600mm Glazed Vitrified Tiles"
              className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink font-medium text-left focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-ink font-semibold block mb-1">Category *</label>
              <select
                value={category}
                style={{ direction: 'ltr', textAlign: 'left' }}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-2.5 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {existingCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__NEW__">+ New Category</option>
              </select>
              {category === '__NEW__' && (
                <input
                  type="text"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Enter new category"
                  className="w-full mt-1.5 bg-card border border-line rounded-xl px-2.5 py-1.5 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>

            <div>
              <label className="text-ink font-semibold block mb-1">Brand *</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                required
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Kajaria, Jaquar"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Producer / Manufacturer & Supplier */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-ink font-semibold block mb-1">Producer / Manufacturer</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={producer}
                onChange={(e) => setProducer(e.target.value)}
                placeholder="e.g. Kajaria Ceramics Ltd"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-ink font-semibold block mb-1">Supplier</label>
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Metro Tiles Depot"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Unit of Measurement (Exact Section 2 options) */}
          <div className="space-y-1">
            <label className="text-ink font-semibold block">
              Unit of Measurement *
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['Piece', 'Box', 'Sq.ft', 'Meter', 'Kg', 'Set', 'Other'] as UnitOfMeasurement[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`py-1.5 rounded-lg font-medium text-center transition-all ${
                    unit === u
                      ? 'bg-primary text-white font-bold'
                      : 'bg-inner text-muted hover:bg-inner border border-line-strong'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            {unit === 'Other' && (
              <input
                type="text"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                placeholder="Specify custom unit (e.g. Bundle, Roll)"
                className="w-full mt-1.5 bg-card border border-line rounded-xl px-2.5 py-1.5 text-ink text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </div>

          {/* Purchase Price & Selling Price */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-ink font-semibold block mb-1">
                Purchase Price ({settings.currencySymbol}) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                required
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="e.g. 650"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink font-mono font-bold text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-ink font-semibold block">
                  Selling Price ({settings.currencySymbol})
                </label>
                <span className="text-[10px] text-badge-yellow-text font-semibold bg-badge-yellow-bg px-1.5 py-0.5 rounded border border-accent/30">
                  Optional
                </span>
              </div>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="Optional (Price not set)"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink font-mono font-bold text-left placeholder:font-normal placeholder:text-muted placeholder:text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted mt-0.5">
                Leave empty if retail price is not yet decided
              </p>
            </div>
          </div>

          {/* Current Stock & Minimum Stock Level */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-ink font-semibold block mb-1">
                Current Stock ({unit}) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                required
                value={currentStock}
                onChange={(e) => setCurrentStock(e.target.value)}
                placeholder="e.g. 100"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink font-mono text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-ink font-semibold block mb-1">
                Minimum Stock Alert Level *
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                required
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                placeholder="e.g. 15"
                className="w-full bg-card border border-line-strong focus:border-line rounded-xl px-3 py-2 text-ink font-mono text-left focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Action buttons */}
          {confirmingDelete ? (
            <div className="pt-3 p-3 bg-badge-red-bg border border-badge-red-text/35 rounded-2xl space-y-2">
              <p className="text-xs text-badge-red-text font-semibold">
                Delete "{name}" permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 py-2 rounded-xl bg-card text-ink border border-line-strong font-medium text-xs hover:bg-inner"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (productToEdit && onDelete) {
                      onDelete(productToEdit.id);
                      onClose();
                    }
                  }}
                  className="flex-1 py-2 rounded-xl bg-badge-red-text hover:bg-badge-red-text/90 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm Delete</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-3 flex items-center gap-2 border-t border-line-strong">
              {productToEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="py-2.5 px-3 rounded-xl bg-badge-red-bg hover:bg-badge-red-bg/80 text-badge-red-text border border-badge-red-text/35 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
                  title="Delete this product"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
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
                <Save className="w-4 h-4" />
                <span>{productToEdit ? 'Save Changes' : 'Create Product'}</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
