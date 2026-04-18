import { useState } from 'react';
import { api } from '../api/client';
import { MediaPicker } from './MediaPicker';

const OPTION_TYPES = ['TILES', 'RADIO', 'SELECT', 'TOGGLE', 'TEXT', 'NUMBER', 'UPLOAD', 'CONFIRM'] as const;
type OptionType = typeof OPTION_TYPES[number];

export interface OptionValue {
  id: string;
  label: string;
  subLabel?: string | null;
  imageUrl?: string | null;
  priceModifierCents: number;
  sortOrder: number;
}

export interface Option {
  id: string;
  name: string;
  internalKey?: string | null;
  section?: string | null;
  type: OptionType;
  required: boolean;
  helpText?: string | null;
  longDescription?: string | null;
  sortOrder: number;
  dependsOnOptionId?: string | null;
  dependsOnValue?: string | null;
  values: OptionValue[];
}

export function ConfiguratorEditor({
  productId,
  options,
  onChange,
}: {
  productId: string;
  options: Option[];
  onChange: (next: Option[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState<{ optionId: string; valueId: string } | null>(null);

  const sections = Array.from(new Set(options.map((o) => o.section ?? '(none)')));

  const addOption = async () => {
    const r = await api.post<{ option: Option }>(`/admin/products/${productId}/options`, {
      name: 'New Option',
      type: 'TILES',
      section: 'Your Cover',
      required: false,
      sortOrder: options.length,
    });
    onChange([...options, { ...r.option, values: r.option.values ?? [] }]);
    setExpanded({ ...expanded, [r.option.id]: true });
  };

  const updateOption = async (opt: Option, patch: Partial<Option>) => {
    const merged = { ...opt, ...patch };
    await api.put(`/admin/products/${productId}/options/${opt.id}`, patch);
    onChange(options.map((o) => (o.id === opt.id ? merged : o)));
  };

  const deleteOption = async (opt: Option) => {
    if (!confirm(`Delete option "${opt.name}" and all its values?`)) return;
    await api.del(`/admin/products/${productId}/options/${opt.id}`);
    onChange(options.filter((o) => o.id !== opt.id));
  };

  const addValue = async (opt: Option) => {
    const r = await api.post<{ value: OptionValue }>(
      `/admin/products/${productId}/options/${opt.id}/values`,
      { label: 'New value', priceModifierCents: 0, sortOrder: opt.values.length },
    );
    onChange(options.map((o) => (o.id === opt.id ? { ...o, values: [...o.values, r.value] } : o)));
  };

  const updateValue = async (opt: Option, val: OptionValue, patch: Partial<OptionValue>) => {
    const merged = { ...val, ...patch };
    await api.put(`/admin/products/${productId}/options/${opt.id}/values/${val.id}`, patch);
    onChange(
      options.map((o) =>
        o.id === opt.id ? { ...o, values: o.values.map((v) => (v.id === val.id ? merged : v)) } : o,
      ),
    );
  };

  const deleteValue = async (opt: Option, val: OptionValue) => {
    if (!confirm(`Delete value "${val.label}"?`)) return;
    await api.del(`/admin/products/${productId}/options/${opt.id}/values/${val.id}`);
    onChange(
      options.map((o) =>
        o.id === opt.id ? { ...o, values: o.values.filter((v) => v.id !== val.id) } : o,
      ),
    );
  };

  return (
    <div>
      <p className="muted" style={{ marginTop: 0 }}>
        Configurator options drive the product page. Group them into sections, set conditional visibility,
        and define selectable values with optional price modifiers.
      </p>

      {sections.length > 0 && (
        <div style={{ marginBottom: '1rem', color: 'var(--muted)', fontSize: '.85rem' }}>
          Sections in use: {sections.join(', ')}
        </div>
      )}

      {options.map((opt) => {
        const isOpen = expanded[opt.id] ?? false;
        const dependencyCandidates = options.filter((o) => o.id !== opt.id);
        return (
          <div key={opt.id} className="admin-card" style={{ padding: '.75rem 1rem', marginBottom: '.75rem' }}>
            <div className="spread">
              <button
                onClick={() => setExpanded({ ...expanded, [opt.id]: !isOpen })}
                style={{ background: 'transparent', border: 'none', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
              >
                {isOpen ? '▾' : '▸'} {opt.name}{' '}
                <span className="muted" style={{ fontWeight: 400, fontSize: '.85rem' }}>
                  ({opt.type}{opt.section ? ` · ${opt.section}` : ''} · {opt.values.length} values)
                </span>
              </button>
              <button className="btn secondary" style={{ color: '#b91c1c' }} onClick={() => deleteOption(opt)}>
                Delete
              </button>
            </div>

            {isOpen && (
              <div style={{ marginTop: '1rem' }}>
                <div className="grid-2">
                  <div>
                    <label>Name (shown to customer)</label>
                    <input value={opt.name} onChange={(e) => updateOption(opt, { name: e.target.value })} />
                  </div>
                  <div>
                    <label>Internal key (cart/order JSON)</label>
                    <input
                      value={opt.internalKey ?? ''}
                      onChange={(e) => updateOption(opt, { internalKey: e.target.value || null })}
                    />
                  </div>
                </div>
                <div className="grid-2">
                  <div>
                    <label>Section</label>
                    <input
                      value={opt.section ?? ''}
                      placeholder='e.g. "Your Cover"'
                      onChange={(e) => updateOption(opt, { section: e.target.value || null })}
                    />
                  </div>
                  <div>
                    <label>Type</label>
                    <select value={opt.type} onChange={(e) => updateOption(opt, { type: e.target.value as OptionType })}>
                      {OPTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <label>Help text (short, shown under the prompt)</label>
                <input
                  value={opt.helpText ?? ''}
                  onChange={(e) => updateOption(opt, { helpText: e.target.value || null })}
                />

                <label>Long description (full paragraph, e.g. confirmation body)</label>
                <textarea
                  rows={3}
                  value={opt.longDescription ?? ''}
                  onChange={(e) => updateOption(opt, { longDescription: e.target.value || null })}
                />

                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <label style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={opt.required}
                      onChange={(e) => updateOption(opt, { required: e.target.checked })}
                      style={{ width: 'auto', marginRight: '.35rem' }}
                    />
                    Required
                  </label>
                  <div style={{ marginLeft: '1rem' }}>
                    <label style={{ margin: 0 }}>Sort order</label>
                    <input
                      type="number"
                      value={opt.sortOrder}
                      onChange={(e) => updateOption(opt, { sortOrder: Number(e.target.value) })}
                      style={{ width: 80 }}
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ marginTop: '.5rem' }}>
                  <div>
                    <label>Depends on option</label>
                    <select
                      value={opt.dependsOnOptionId ?? ''}
                      onChange={(e) =>
                        updateOption(opt, { dependsOnOptionId: e.target.value || null, dependsOnValue: null })
                      }
                    >
                      <option value="">(none — always visible)</option>
                      {dependencyCandidates.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Depends on value (label)</label>
                    <input
                      value={opt.dependsOnValue ?? ''}
                      onChange={(e) => updateOption(opt, { dependsOnValue: e.target.value || null })}
                      placeholder='e.g. "Foil"'
                    />
                  </div>
                </div>

                {opt.type !== 'TEXT' && opt.type !== 'NUMBER' && opt.type !== 'UPLOAD' && opt.type !== 'CONFIRM' && (
                  <div style={{ marginTop: '1rem' }}>
                    <div className="spread" style={{ marginBottom: '.5rem' }}>
                      <strong>Values</strong>
                      <button className="btn secondary" onClick={() => addValue(opt)}>Add value</button>
                    </div>
                    {opt.values.length === 0 && <p className="muted">No values yet.</p>}
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Label</th>
                          <th>Sub label</th>
                          <th>Image</th>
                          <th>Modifier ($)</th>
                          <th>Order</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {[...opt.values].sort((a, b) => a.sortOrder - b.sortOrder).map((v) => (
                          <tr key={v.id}>
                            <td>
                              <input value={v.label} onChange={(e) => updateValue(opt, v, { label: e.target.value })} />
                            </td>
                            <td>
                              <input
                                value={v.subLabel ?? ''}
                                onChange={(e) => updateValue(opt, v, { subLabel: e.target.value || null })}
                              />
                            </td>
                            <td>
                              {v.imageUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                                  <img src={v.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', border: '1px solid var(--border)', borderRadius: 4 }} />
                                  <button
                                    className="btn secondary"
                                    style={{ padding: '.2rem .4rem', fontSize: '.75rem' }}
                                    onClick={() => updateValue(opt, v, { imageUrl: null })}
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <button
                                  className="btn secondary"
                                  style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
                                  onClick={() => setPicker({ optionId: opt.id, valueId: v.id })}
                                >
                                  Pick
                                </button>
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                value={(v.priceModifierCents / 100).toFixed(2)}
                                onChange={(e) => updateValue(opt, v, { priceModifierCents: Math.round(Number(e.target.value) * 100) })}
                                style={{ width: 100 }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                value={v.sortOrder}
                                onChange={(e) => updateValue(opt, v, { sortOrder: Number(e.target.value) })}
                                style={{ width: 70 }}
                              />
                            </td>
                            <td>
                              <button
                                className="btn secondary"
                                style={{ color: '#b91c1c' }}
                                onClick={() => deleteValue(opt, v)}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <button className="btn" onClick={addOption}>Add option</button>

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        kind="image"
        onPick={(picked) => {
          if (!picker || picked.length === 0) return;
          const opt = options.find((o) => o.id === picker.optionId);
          const val = opt?.values.find((v) => v.id === picker.valueId);
          if (opt && val) void updateValue(opt, val, { imageUrl: picked[0]!.url });
        }}
      />
    </div>
  );
}
