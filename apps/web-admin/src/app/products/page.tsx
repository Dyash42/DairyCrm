'use client';

import { useState } from 'react';
import { Plus, Edit3, X } from 'lucide-react';
import { Topbar } from '@/components/shell/Topbar';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  type ProductRow,
} from '@/lib/api';
import { useApiWithFallback } from '@/hooks/useApiWithFallback';
import { formatINR } from '@jharanai/shared';

const FALLBACK_PRODUCTS: ProductRow[] = [
  { id: 'p1', code: 'COW_MILK', name: 'Cow milk', description: null, category: 'MILK', ratePerUnit: 64, unit: 'L', active: true, imageUrl: null, sortOrder: 1 },
  { id: 'p2', code: 'BUFFALO_MILK', name: 'Buffalo milk', description: null, category: 'MILK', ratePerUnit: 78, unit: 'L', active: true, imageUrl: null, sortOrder: 2 },
];

const CATEGORIES = ['MILK', 'CURD', 'GHEE', 'BUTTER', 'PANEER', 'OTHER'] as const;
const UNITS = ['L', 'ml', 'kg', 'g', 'pcs'];

interface FormState {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: ProductRow['category'];
  ratePerUnit: string;
  unit: string;
  active: boolean;
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  category: 'MILK',
  ratePerUnit: '0',
  unit: 'L',
  active: true,
  sortOrder: '0',
};

export default function ProductsPage() {
  const { data: products, reload } = useApiWithFallback(
    fetchProducts,
    (raw) => raw.products,
    FALLBACK_PRODUCTS,
  );

  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; form: FormState }>({
    open: false,
    mode: 'add',
    form: EMPTY_FORM,
  });
  const [submitting, setSubmitting] = useState(false);

  function openAdd() {
    setModal({ open: true, mode: 'add', form: EMPTY_FORM });
  }
  function openEdit(p: ProductRow) {
    setModal({
      open: true,
      mode: 'edit',
      form: {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description ?? '',
        category: p.category,
        ratePerUnit: String(p.ratePerUnit),
        unit: p.unit,
        active: p.active,
        sortOrder: String(p.sortOrder),
      },
    });
  }
  function close() {
    setModal((m) => ({ ...m, open: false }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const f = modal.form;
    const payload = {
      code: f.code.toUpperCase().replace(/\s+/g, '_'),
      name: f.name,
      description: f.description || undefined,
      category: f.category,
      ratePerUnit: Number(f.ratePerUnit),
      unit: f.unit,
      active: f.active,
      sortOrder: Number(f.sortOrder),
    };
    try {
      if (modal.mode === 'add') {
        await createProduct(payload);
      } else if (modal.form.id) {
        await updateProduct(modal.form.id, payload);
      }
      close();
      reload();
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(p: ProductRow) {
    if (!window.confirm(`Hide "${p.name}" from new subscriptions? Existing subs keep working.`)) return;
    try {
      await deleteProduct(p.id);
      reload();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <>
      <Topbar
        title="Products / SKUs"
        subtitle="What customers can subscribe to"
      />

      <div className="px-8 py-6 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">
              {products.length}
            </span>{' '}
            product{products.length === 1 ? '' : 's'} ·{' '}
            {products.filter((p) => p.active).length} active
          </div>
          <button onClick={openAdd} className="btn-primary">
            <Plus size={16} />
            Add product
          </button>
        </div>

        <Card className="overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Rate</th>
                <th>Unit</th>
                <th>Status</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="font-semibold text-text-primary">{p.name}</div>
                    <div className="text-xs text-text-muted">{p.code}</div>
                  </td>
                  <td>
                    <span className="capitalize text-text-secondary">
                      {p.category.toLowerCase()}
                    </span>
                  </td>
                  <td>
                    <span className="tabular font-semibold text-text-primary">
                      {formatINR(Number(p.ratePerUnit))}
                    </span>
                  </td>
                  <td>
                    <span className="text-text-secondary">/ {p.unit}</span>
                  </td>
                  <td>
                    <StatusPill tone={p.active ? 'success' : 'muted'}>
                      {p.active ? 'Active' : 'Hidden'}
                    </StatusPill>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-text-secondary hover:text-brand p-1.5 rounded hover:bg-surface-muted"
                        aria-label="Edit"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(p)}
                        className="text-text-secondary hover:text-danger p-1.5 rounded hover:bg-surface-muted"
                        aria-label="Hide"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    No products yet — click <span className="font-medium">Add product</span> to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <form
            onSubmit={onSubmit}
            className="bg-surface rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">
                {modal.mode === 'add' ? 'Add product' : 'Edit product'}
              </h2>
              <button
                type="button"
                onClick={close}
                className="text-text-muted hover:text-text-primary"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Code (UPPER_SNAKE)" required>
                <input
                  required
                  disabled={modal.mode === 'edit'}
                  value={modal.form.code}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, form: { ...m.form, code: e.target.value.toUpperCase() } }))
                  }
                  className="input w-full"
                  placeholder="GHEE_500"
                />
              </FormField>
              <FormField label="Display name" required>
                <input
                  required
                  value={modal.form.name}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, form: { ...m.form, name: e.target.value } }))
                  }
                  className="input w-full"
                  placeholder="Ghee 500ml"
                />
              </FormField>
              <FormField label="Category">
                <select
                  value={modal.form.category}
                  onChange={(e) =>
                    setModal((m) => ({
                      ...m,
                      form: { ...m.form, category: e.target.value as ProductRow['category'] },
                    }))
                  }
                  className="input w-full"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Unit">
                <select
                  value={modal.form.unit}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, form: { ...m.form, unit: e.target.value } }))
                  }
                  className="input w-full"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Rate (₹ per unit)" required>
                <input
                  required
                  type="number"
                  step="0.01"
                  value={modal.form.ratePerUnit}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, form: { ...m.form, ratePerUnit: e.target.value } }))
                  }
                  className="input w-full tabular"
                />
              </FormField>
              <FormField label="Sort order">
                <input
                  type="number"
                  value={modal.form.sortOrder}
                  onChange={(e) =>
                    setModal((m) => ({ ...m, form: { ...m.form, sortOrder: e.target.value } }))
                  }
                  className="input w-full"
                />
              </FormField>
            </div>

            <FormField label="Description (optional)">
              <textarea
                value={modal.form.description}
                onChange={(e) =>
                  setModal((m) => ({ ...m, form: { ...m.form, description: e.target.value } }))
                }
                rows={2}
                className="input w-full p-2 resize-none"
              />
            </FormField>

            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={modal.form.active}
                onChange={(e) =>
                  setModal((m) => ({ ...m, form: { ...m.form, active: e.target.checked } }))
                }
              />
              Active — show in subscription picker
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={close} className="btn-secondary">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
        {label}
        {required && <span className="text-danger">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
