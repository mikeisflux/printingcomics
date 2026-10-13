import { useEffect, useRef, type ReactNode } from 'react';
import {
  COUNTRIES, type Address, type AddressField, regionsFor, regionLabelFor, postalFieldFor, usStateForZip,
} from '../lib/address';

/**
 * One address, the way browsers and carriers expect it: country first (it
 * decides the other fields), each input named for autofill, the ZIP typed on
 * a number pad with the state filled in from it, a state list for the US and
 * Canada, and a plain error under any field that needs attention.
 */
export function AddressFields({
  value, onChange, errors, touched, onBlur, idPrefix, section, showPhone = true,
}: {
  value: Address;
  onChange: (v: Address) => void;
  /** From validateAddress — shown for fields that were touched (or all, when `touched` is 'all'). */
  errors: Partial<Record<AddressField, string>>;
  touched: Set<AddressField> | 'all';
  onBlur: (field: AddressField) => void;
  idPrefix: string;
  /** Browser autofill section: "shipping" or "billing". */
  section: 'shipping' | 'billing';
  showPhone?: boolean;
}) {
  const set = (patch: Partial<Address>) => onChange({ ...value, ...patch });
  const regions = regionsFor(value.country);
  const postal = postalFieldFor(value.country);
  // The state is filled in from the ZIP unless the customer typed one; a
  // state the customer picked by hand is left alone.
  const regionAuto = useRef<string | null>(null);
  useEffect(() => {
    if (value.country !== 'US') return;
    const state = usStateForZip(value.postalCode);
    if (!state) return;
    if (!value.region || value.region === regionAuto.current) {
      regionAuto.current = state;
      if (value.region !== state) onChange({ ...value, region: state });
    }
  }, [value.postalCode, value.country]); // eslint-disable-line react-hooks/exhaustive-deps

  const show = (f: AddressField) => (touched === 'all' || touched.has(f)) && errors[f];
  const field = (f: AddressField, label: string, input: ReactNode, hint?: string) => (
    <div className="field">
      <label htmlFor={`${idPrefix}-${f}`}>{label}</label>
      {input}
      {show(f) ? <div className="field-error" role="alert">{errors[f]}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
  const props = (f: AddressField, autoComplete: string) => ({
    id: `${idPrefix}-${f}`,
    name: `${section}-${f}`,
    autoComplete: `${section} ${autoComplete}`,
    'aria-invalid': show(f) ? true : undefined,
    onBlur: () => onBlur(f),
  });

  return (
    <div className="address-fields">
      {field('country', 'Country', (
        <select {...props('country', 'country')} value={value.country} onChange={(e) => { regionAuto.current = null; set({ country: e.target.value, region: '' }); }}>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      ))}
      <div className="grid-2">
        {field('firstName', 'First name', <input {...props('firstName', 'given-name')} value={value.firstName} onChange={(e) => set({ firstName: e.target.value })} />)}
        {field('lastName', 'Last name', <input {...props('lastName', 'family-name')} value={value.lastName} onChange={(e) => set({ lastName: e.target.value })} />)}
      </div>
      {field('line1', 'Street address', <input {...props('line1', 'address-line1')} value={value.line1} placeholder="House number and street" onChange={(e) => set({ line1: e.target.value })} />)}
      {field('line2', 'Apartment, suite, unit (optional)', <input {...props('line2', 'address-line2')} value={value.line2 ?? ''} onChange={(e) => set({ line2: e.target.value })} />)}
      <div className="grid-2">
        {field('postalCode', postal.label, (
          <input
            {...props('postalCode', 'postal-code')}
            value={value.postalCode}
            placeholder={postal.placeholder}
            inputMode={postal.numeric ? 'numeric' : 'text'}
            maxLength={12}
            onChange={(e) => set({ postalCode: e.target.value })}
          />
        ), value.country === 'US' ? 'Shipping rates are quoted from the ZIP code.' : undefined)}
        {field('city', 'City', <input {...props('city', 'address-level2')} value={value.city} onChange={(e) => set({ city: e.target.value })} />)}
      </div>
      <div className="grid-2">
        {field('region', regionLabelFor(value.country), regions ? (
          <select {...props('region', 'address-level1')} value={value.region.toUpperCase()} onChange={(e) => { regionAuto.current = null; set({ region: e.target.value }); }}>
            <option value="">Select…</option>
            {regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </select>
        ) : (
          <input {...props('region', 'address-level1')} value={value.region} onChange={(e) => set({ region: e.target.value })} />
        ))}
        {showPhone && field('phone', 'Phone (optional)', (
          <input {...props('phone', 'tel')} type="tel" inputMode="tel" value={value.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} />
        ), 'The carrier uses it if there is a delivery problem.')}
      </div>
    </div>
  );
}
