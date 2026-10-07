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
      setSellingPrice(String(productToEdit.sellingPrice));
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
  }, [productToEdit, isOpen, existingCategories, existingSuppliers]);

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
    const sPrice = parseFloat(sellingPrice);

    if (isNaN(pPrice) || pPrice < 0) {
      setError('Please provide a valid purchase price.');
      return;
    }

    if (isNaN(sPrice) || sPrice < 0) {
      setError('Please provide a valid selling price.');
      return;
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {productToEdit ? 'Edit Product Details' : 'Create New Product'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Saved to local SQLite database permanently
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs overflow-y-auto pr-1 flex-1">
          {/* Photo Upload Area (Visual Reference Only - strictly NO scanner) */}
          <div className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
            <div className="w-20 h-20 rounded-xl bg-slate-900 border border-slate-800 overflow-hidden flex items-center justify-center relative shrink-0">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt="Product preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-slate-600" />
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-300 block">
                Product Photo (Visual Reference Only)
              </span>
              <p className="text-[10px] text-slate-400">
                Take photo with Android camera or select image file.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <label className="cursor-pointer px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1.5 border border-slate-700">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
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
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Product Name */}
          <div>
            <label className="text-slate-300 font-semibold block mb-1">
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
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium text-left"
            />
          </div>

          {/* Category & Brand */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Category *</label>
              <select
                value={category}
                style={{ direction: 'ltr', textAlign: 'left' }}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-white text-left"
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
                  className="w-full mt-1.5 bg-slate-950 border border-emerald-500/50 rounded-xl px-2.5 py-1.5 text-white text-left"
                />
              )}
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Brand *</label>
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
              />
            </div>
          </div>

          {/* Producer / Manufacturer & Supplier */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">Producer / Manufacturer</label>
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">Supplier</label>
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-left"
              />
            </div>
          </div>

          {/* Unit of Measurement (Exact Section 2 options) */}
          <div className="space-y-1">
            <label className="text-slate-300 font-semibold block">
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
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
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
                className="w-full mt-1.5 bg-slate-950 border border-emerald-500/50 rounded-xl px-2.5 py-1.5 text-white text-left"
              />
            )}
          </div>

          {/* Purchase Price & Selling Price */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-left"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
                Selling Price ({settings.currencySymbol}) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                style={{ direction: 'ltr', textAlign: 'left' }}
                autoComplete="off"
                required
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                placeholder="e.g. 850"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold text-left"
              />
            </div>
          </div>

          {/* Current Stock & Minimum Stock Level */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-slate-300 font-semibold block mb-1">
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-left"
              />
            </div>

            <div>
              <label className="text-slate-300 font-semibold block mb-1">
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
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-left"
              />
            </div>
          </div>

          {/* Action buttons */}
          {confirmingDelete ? (
            <div className="pt-3 p-3 bg-rose-950/30 border border-rose-500/30 rounded-2xl space-y-2">
              <p className="text-xs text-rose-300 font-semibold">
                Delete "{name}" permanently?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-medium text-xs"
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
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Confirm Delete</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-3 flex items-center gap-2 border-t border-slate-800">
              {productToEdit && onDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all"
                  title="Delete this product"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20"
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
