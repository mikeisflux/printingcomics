import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatMoney } from '../../api/client';
import { formatCartItemOptions } from '../../lib/cart-options';
import { StatusBadge } from '../Account';

interface OrderEvent {
  id: string;
  kind: string;
  message?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorName?: string | null;
  createdAt: string;
}

interface OrderFull {
  id: string; number: string; email: string;
  status: string; paymentStatus: string;
  subtotalCents: number; shippingCents: number; taxCents: number;
  discountCents: number; totalCents: number;
  trackingNumber?: string | null;
  shippingMethod?: string | null;
  notes?: string | null;
  shippingAddress: any;
  billingAddress: any;
  items: {
    id: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    options?: any;
    product: {
      slug: string;
      images: { url: string }[];
      options: { id: string; name: string; internalKey?: string | null; type: string; values: { label: string; subLabel?: string | null }[] }[];
    };
    files?: {
      id: string;
      purpose: string | null;
      notes: string | null;
      media: {
        id: string;
        originalName: string;
        mimeType: string;
        size: number;
        url: string;
        contentHash: string | null;
        createdAt: string;
      };
    }[];
  }[];
  payments: { id: string; provider: string; providerRef?: string | null; amountCents: number; status: string; createdAt: string }[];
  events: OrderEvent[];
  user?: { id: string; email: string; firstName?: string | null; lastName?: string | null } | null;
  apiKey?: { id: string; name: string; prefix: string } | null;
  partner?: { id: string; slug: string; name: string; color?: string | null; status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED' } | null;
  project?: {
    id: string;
    externalProjectId: string;
    title: string;
    creatorName: string | null;
    creatorEmail: string | null;
    status: string;
  } | null;
  source?: string | null;
  externalRef?: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUSES = ['PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];
const PAY_STATUSES = ['PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED'];

export function AdminOrderDetail() {
  const { id } = useParams();
  const [order, setOrder] = useState<OrderFull | null>(null);
  const [tracking, setTracking] = useState('');
  const [shippingMethod, setShippingMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!id) return;
    void api.get<{ order: OrderFull }>(`/admin/orders/${id}`).then((r) => {
      setOrder(r.order);
      setTracking(r.order.trackingNumber ?? '');
      setShippingMethod(r.order.shippingMethod ?? '');
      setNotes(r.order.notes ?? '');
    });
  };

  useEffect(() => { load(); }, [id]);

  const update = async (patch: any) => {
    setSaving(true);
    try {
      await api.patch(`/admin/orders/${id}`, patch);
      load();
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!noteDraft.trim() || !id) return;
    await api.post(`/admin/orders/${id}/events`, { message: noteDraft.trim(), kind: 'note' });
    setNoteDraft('');
    load();
  };

  const refund = async () => {
    if (!order) return;
    const fullAmount = order.totalCents;
    const input = prompt(
      `Refund amount (in dollars). Leave blank for full refund of ${formatMoney(fullAmount)}.`,
      '',
    );
    if (input === null) return;
    const note = prompt('Note to customer (optional)') ?? undefined;
    const amountCents = input ? Math.round(Number(input) * 100) : undefined;
    if (!confirm(amountCents ? `Refund ${formatMoney(amountCents)}?` : `Refund full amount ${formatMoney(fullAmount)}?`)) return;
    try {
      await api.post(`/admin/orders/${id}/refund`, { amountCents, note });
      alert('Refund issued.');
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (!order) return <div>Loading…</div>;

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Order {order.number}</h1>
          <div className="muted" style={{ fontSize: '.85rem' }}>
            Placed {new Date(order.createdAt).toLocaleString()}
            {order.partner && (
              <>
                {' · '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: order.partner.color ?? '#94a3b8',
                    }}
                  />
                  via{' '}
                  <Link to={`/admin/partners/${order.partner.id}`}>{order.partner.name}</Link>
                  {order.apiKey && (
                    <span style={{ marginLeft: 4 }}>
                      (<code>{order.apiKey.prefix}</code>)
                    </span>
                  )}
                </span>
              </>
            )}
            {!order.partner && order.apiKey && (
              <>
                {' · '}via API key <code>{order.apiKey.prefix}</code>
              </>
            )}
            {order.externalRef && (
              <>
                {' · '}externalRef <code>{order.externalRef}</code>
              </>
            )}
            {order.project && (
              <>
                {' · '}project{' '}
                {order.partner ? (
                  <Link to={`/admin/partners/${order.partner.id}`}>{order.project.title}</Link>
                ) : (
                  <span>{order.project.title}</span>
                )}{' '}
                <code style={{ fontSize: '.75rem' }}>{order.project.externalProjectId}</code>
                {order.project.creatorName && (
                  <span> · creator {order.project.creatorName}</span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
          {order.paymentStatus === 'CAPTURED' && (
            <button className="btn secondary" style={{ color: '#b91c1c', borderColor: '#b91c1c' }} onClick={refund}>
              Refund via PayPal
            </button>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>Fulfilment</h3>
        <div className="grid-2">
          <div>
            <label>Order status</label>
            <select value={order.status} onChange={(e) => update({ status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <p className="muted" style={{ fontSize: '.75rem' }}>
              Marking SHIPPED will email the customer their tracking number.
            </p>
          </div>
          <div>
            <label>Payment status</label>
            <select value={order.paymentStatus} onChange={(e) => update({ paymentStatus: e.target.value })}>
              {PAY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="grid-2">
          <div>
            <label>Tracking number</label>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              onBlur={() => {
                if (tracking !== (order.trackingNumber ?? '')) update({ trackingNumber: tracking });
              }}
              placeholder="USPS / UPS / FedEx tracking"
            />
          </div>
          <div>
            <label>Shipping method</label>
            <input
              value={shippingMethod}
              onChange={(e) => setShippingMethod(e.target.value)}
              onBlur={() => {
                if (shippingMethod !== (order.shippingMethod ?? '')) update({ shippingMethod });
              }}
              placeholder='e.g. "UPS Ground"'
            />
          </div>
        </div>
        <label>Internal notes (not emailed)</label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (order.notes ?? '')) update({ notes });
          }}
        />
      </div>

      <ShipmentsSection orderId={order.id} />

      <div className="admin-card">
        <h3>Items</h3>
        <table className="admin-table">
          <thead><tr><th /><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead>
          <tbody>
            {order.items.map((i) => {
              const img = i.product?.images?.[0]?.url;
              const pairs = formatCartItemOptions(i);
              return (
                <tr key={i.id}>
                  <td style={{ width: 60 }}>
                    {img ? (
                      <img src={img} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 48, height: 48, background: 'var(--bg-alt)', borderRadius: 4 }} />
                    )}
                  </td>
                  <td>
                    <Link to={`/product/${i.product.slug}`}>{i.name}</Link>
                    {pairs.length > 0 && (
                      <ul className="muted" style={{ fontSize: '.8rem', margin: '.25rem 0 0', paddingLeft: '1rem' }}>
                        {pairs.map((p, j) => <li key={j}>{p.label}: {p.value}</li>)}
                      </ul>
                    )}
                    {i.files && i.files.length > 0 && (
                      <div style={{ marginTop: '.4rem', display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                        {i.files.map((f) => (
                          <a
                            key={f.id}
                            href={f.media.url}
                            target="_blank"
                            rel="noreferrer"
                            title={f.notes ?? undefined}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '.3rem .55rem',
                              borderRadius: 4,
                              background: 'var(--bg-alt)',
                              border: '1px solid var(--border)',
                              fontSize: '.8rem',
                              textDecoration: 'none',
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {f.purpose ? f.purpose.toUpperCase() : 'FILE'}
                            </span>
                            <span style={{ color: 'var(--ink)' }}>{f.media.originalName}</span>
                            <span className="muted">({formatBytes(f.media.size)})</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>{i.quantity}</td>
                  <td>{formatMoney(i.unitPriceCents)}</td>
                  <td>{formatMoney(i.totalCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="spread"><span>Subtotal</span><span>{formatMoney(order.subtotalCents)}</span></div>
        {order.discountCents > 0 && <div className="spread"><span>Discount</span><span>−{formatMoney(order.discountCents)}</span></div>}
        <div className="spread"><span>Shipping</span><span>{formatMoney(order.shippingCents)}</span></div>
        <div className="spread"><span>Tax</span><span>{formatMoney(order.taxCents)}</span></div>
        <div className="spread" style={{ fontWeight: 700 }}><span>Total</span><span>{formatMoney(order.totalCents)}</span></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Customer</h3>
          <div>{order.email}</div>
          {order.user && (
            <div className="muted">
              <Link to={`/admin/customers/${order.user.id}`}>
                {order.user.firstName} {order.user.lastName}
              </Link>
            </div>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Shipping address</h3>
          <AddressDisplay a={order.shippingAddress} />
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Billing address</h3>
          <AddressDisplay a={order.billingAddress} />
        </div>
      </div>

      {order.payments.length > 0 && (
        <div className="admin-card">
          <h3>Payments</h3>
          <table className="admin-table">
            <thead><tr><th>Provider</th><th>Reference</th><th>Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {order.payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.provider}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{p.providerRef ?? '—'}</td>
                  <td>{formatMoney(p.amountCents)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-card">
        <h3>Activity timeline</h3>
        <div className="row" style={{ marginBottom: '.75rem' }}>
          <input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a timeline note (visible on the customer order page)"
            onKeyDown={(e) => { if (e.key === 'Enter') void addNote(); }}
          />
          <button className="btn" onClick={() => void addNote()} disabled={!noteDraft.trim()}>Add</button>
        </div>
        {order.events.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {order.events.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: '.75rem', padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)', fontSize: '.85rem', minWidth: 160 }}>
                  {new Date(e.createdAt).toLocaleString()}
                </span>
                <span style={{ minWidth: 80, textTransform: 'uppercase', fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)' }}>
                  {e.kind}
                </span>
                <span style={{ flex: 1, fontSize: '.9rem' }}>
                  {e.message}
                  {e.actorName && <span className="muted" style={{ fontSize: '.8rem' }}> — {e.actorName}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {saving && <p className="muted">Saving…</p>}
    </div>
  );
}

interface RemainingItem {
  orderItemId: string;
  name: string;
  unitPriceCents: number;
  totalQuantity: number;
  remaining: number;
  weightGramsEach: number;
}

interface ShipmentRow {
  id: string;
  status: string;
  carrier?: string | null;
  service?: string | null;
  trackingCode?: string | null;
  labelUrl?: string | null;
  rateAmountCents?: number | null;
  insuredValueCents?: number | null;
  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  package?: { id: string; name: string } | null;
  items: { orderItemId: string; quantity: number }[];
  createdAt: string;
}

interface EpRate {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days: number | null;
}

function ShipmentsSection({ orderId }: { orderId: string }) {
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [remaining, setRemaining] = useState<RemainingItem[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string }[]>([]);
  const [building, setBuilding] = useState(false);
  const [autoPacking, setAutoPacking] = useState(false);
  const [autoPackSummary, setAutoPackSummary] = useState<{ boxCount: number; estimatedShippingCents: number; unpacked: number } | null>(null);

  const load = async () => {
    const r = await api.get<{ shipments: ShipmentRow[]; remaining: RemainingItem[] }>(`/admin/fulfillment/orders/${orderId}/shipments`);
    setShipments(r.shipments);
    setRemaining(r.remaining);
  };
  useEffect(() => {
    void load();
    void api.get<{ items: { id: string; name: string }[] }>('/admin/fulfillment/packages').then((r) => setPackages(r.items));
  }, [orderId]);

  const remainingCount = remaining.reduce((sum, r) => sum + r.remaining, 0);

  // Cheapest-rate total across ALL shipments on this order (both the
  // already-created CREATED ones, and after auto-pack). Lets the admin see
  // what shipping will cost before buying anything.
  const cheapestTotalCents = shipments.reduce((sum, s) => {
    if (s.rateAmountCents != null) return sum + s.rateAmountCents;
    // CREATED but not yet bought — we don't have rates on the shipment row
    // itself (they're only on the one-shot create response). Skip in rollup.
    return sum;
  }, 0);

  async function autoPack() {
    if (!confirm('Auto-pack the remaining items into boxes and fetch rates from EasyPost? This creates shipments but does not buy labels yet.')) return;
    setAutoPacking(true);
    setAutoPackSummary(null);
    try {
      const r = await api.post<{ boxCount: number; estimatedShippingCents: number; unpacked: { orderItemId: string }[] }>(
        `/admin/fulfillment/orders/${orderId}/auto-pack`,
        {},
      );
      setAutoPackSummary({
        boxCount: r.boxCount,
        estimatedShippingCents: r.estimatedShippingCents,
        unpacked: r.unpacked?.length ?? 0,
      });
      await load();
    } catch (e: any) {
      alert(e.message ?? 'Auto-pack failed');
    } finally { setAutoPacking(false); }
  }

  return (
    <div className="admin-card">
      <div className="spread" style={{ marginBottom: '.75rem' }}>
        <h3 style={{ margin: 0 }}>Shipments ({shipments.length})</h3>
        <div className="row" style={{ gap: '.5rem' }}>
          {!building && remainingCount > 0 && (
            <>
              <button className="btn secondary" disabled={autoPacking} onClick={() => void autoPack()}>
                {autoPacking ? 'Auto-packing…' : `Auto-pack ${remainingCount} item${remainingCount === 1 ? '' : 's'}`}
              </button>
              <button className="btn" onClick={() => setBuilding(true)}>Add shipment</button>
            </>
          )}
          {!building && remainingCount === 0 && shipments.length > 0 && (
            <span className="muted" style={{ fontSize: '.85rem' }}>All items allocated.</span>
          )}
        </div>
      </div>

      {autoPackSummary && (
        <div style={{ padding: '.6rem .75rem', background: 'var(--bg-alt, #f3f4f6)', borderRadius: 6, fontSize: '.85rem', marginBottom: '.75rem' }}>
          Auto-pack: <strong>{autoPackSummary.boxCount}</strong> box{autoPackSummary.boxCount === 1 ? '' : 'es'} created,
          estimated shipping <strong>{formatMoney(autoPackSummary.estimatedShippingCents)}</strong> (cheapest rates + 1% insurance)
          {autoPackSummary.unpacked > 0 && (
            <span style={{ color: '#b91c1c' }}> — {autoPackSummary.unpacked} item(s) too heavy for any active package</span>
          )}
        </div>
      )}

      {shipments.length === 0 && !building && (
        <p className="muted">No shipments yet. Click <em>Auto-pack</em> to let the system size boxes automatically, or <em>Add shipment</em> to build one manually.</p>
      )}

      {shipments.length > 0 && cheapestTotalCents > 0 && (
        <div style={{ fontSize: '.85rem', marginBottom: '.5rem', color: 'var(--muted)' }}>
          Total postage purchased so far: <strong>{formatMoney(cheapestTotalCents)}</strong>
        </div>
      )}

      {shipments.length > 0 && (
        <table className="admin-table">
          <thead><tr>
            <th>Box</th><th>Carrier / Service</th><th>Tracking</th><th>Insured</th><th>Postage</th><th>Status</th><th>Label</th><th />
          </tr></thead>
          <tbody>
            {shipments.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <strong>#{i + 1}</strong>
                  {s.package && <div className="muted" style={{ fontSize: '.75rem' }}>{s.package.name}</div>}
                  <div className="muted" style={{ fontSize: '.75rem' }}>
                    {s.lengthIn}×{s.widthIn}×{s.heightIn}″, {s.weightOz}oz
                  </div>
                </td>
                <td>{s.carrier && s.service ? `${s.carrier} ${s.service}` : <span className="muted">—</span>}</td>
                <td>{s.trackingCode ?? <span className="muted">—</span>}</td>
                <td>{s.insuredValueCents != null ? formatMoney(s.insuredValueCents) : <span className="muted">—</span>}</td>
                <td>{s.rateAmountCents != null ? formatMoney(s.rateAmountCents) : <span className="muted">—</span>}</td>
                <td><StatusBadge status={s.status} /></td>
                <td>
                  {s.labelUrl
                    ? <a href={s.labelUrl} target="_blank" rel="noreferrer">PDF</a>
                    : <span className="muted">—</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {s.status === 'PURCHASED' && (
                    <button
                      className="btn secondary"
                      style={{ color: '#b91c1c' }}
                      onClick={async () => {
                        if (!confirm('Request a refund for this label from EasyPost?')) return;
                        try {
                          await api.post(`/admin/fulfillment/shipments/${s.id}/refund`);
                          await load();
                        } catch (e: any) { alert(e.message ?? 'Refund failed'); }
                      }}
                    >Refund label</button>
                  )}
                  {s.status === 'CREATED' && (
                    <button
                      className="btn secondary"
                      style={{ color: '#b91c1c' }}
                      onClick={async () => {
                        if (!confirm('Delete this unpurchased shipment?')) return;
                        try {
                          await api.del(`/admin/fulfillment/shipments/${s.id}`);
                          await load();
                        } catch (e: any) { alert(e.message ?? 'Delete failed'); }
                      }}
                    >Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {building && (
        <ShipmentBuilder
          orderId={orderId}
          remaining={remaining}
          packages={packages}
          onCancel={() => setBuilding(false)}
          onDone={async () => { setBuilding(false); await load(); }}
        />
      )}
    </div>
  );
}

function ShipmentBuilder({
  orderId, remaining, packages, onCancel, onDone,
}: {
  orderId: string;
  remaining: RemainingItem[];
  packages: { id: string; name: string }[];
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [packageId, setPackageId] = useState<string>(packages[0]?.id ?? '');
  const [qtys, setQtys] = useState<Record<string, number>>(
    () => Object.fromEntries(remaining.map((r) => [r.orderItemId, 0])),
  );
  const [rates, setRates] = useState<EpRate[] | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [insuredValueCents, setInsuredValueCents] = useState(0);
  const [busy, setBusy] = useState(false);

  const allocatedValueCents = remaining.reduce((sum, r) => sum + (qtys[r.orderItemId] ?? 0) * r.unitPriceCents, 0);
  const allocatedCount = remaining.reduce((sum, r) => sum + (qtys[r.orderItemId] ?? 0), 0);

  async function getRates() {
    setBusy(true);
    try {
      const allocations = remaining
        .filter((r) => (qtys[r.orderItemId] ?? 0) > 0)
        .map((r) => ({ orderItemId: r.orderItemId, quantity: qtys[r.orderItemId] }));
      if (allocations.length === 0) { alert('Allocate at least one item to this box.'); return; }
      if (!packageId) { alert('Pick a package.'); return; }
      const r = await api.post<{ shipment: { id: string }; rates: EpRate[]; insuredValueCents: number }>(
        `/admin/fulfillment/orders/${orderId}/shipments`,
        { packageId, allocations },
      );
      setShipmentId(r.shipment.id);
      setRates([...r.rates].sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate)));
      setInsuredValueCents(r.insuredValueCents);
    } catch (e: any) { alert(e.message ?? 'Failed to fetch rates'); }
    finally { setBusy(false); }
  }

  async function buy(rate: EpRate) {
    if (!shipmentId) return;
    if (!confirm(
      `Buy ${rate.carrier} ${rate.service} label at $${rate.rate} and insure for ${formatMoney(insuredValueCents)}?\n\n` +
      `EasyPost charges postage + 1% of declared value ($1 min) to your account.`
    )) return;
    setBusy(true);
    try {
      await api.post(`/admin/fulfillment/shipments/${shipmentId}/buy`, { rateId: rate.id });
      await onDone();
    } catch (e: any) { alert(e.message ?? 'Buy failed'); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ border: '1px dashed var(--border)', padding: '1rem', borderRadius: 8, marginTop: '1rem' }}>
      <h4 style={{ marginTop: 0 }}>New shipment</h4>

      {!rates && (
        <>
          <label>Package</label>
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)}>
            <option value="" disabled>Select a package…</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <label style={{ marginTop: '.75rem', display: 'block', fontWeight: 600 }}>Allocate items to this box</label>
          <table className="admin-table">
            <thead><tr><th>Item</th><th>Unit</th><th>Remaining</th><th>This box</th><th>Subtotal</th></tr></thead>
            <tbody>
              {remaining.map((r) => (
                <tr key={r.orderItemId} style={{ opacity: r.remaining === 0 ? 0.4 : 1 }}>
                  <td>{r.name}</td>
                  <td>{formatMoney(r.unitPriceCents)}</td>
                  <td>{r.remaining} / {r.totalQuantity}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={r.remaining}
                      value={qtys[r.orderItemId] ?? 0}
                      disabled={r.remaining === 0}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(r.remaining, Number(e.target.value) || 0));
                        setQtys({ ...qtys, [r.orderItemId]: v });
                      }}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>{formatMoney((qtys[r.orderItemId] ?? 0) * r.unitPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="spread" style={{ marginTop: '.75rem', fontSize: '.9rem' }}>
            <span>
              {allocatedCount} item{allocatedCount === 1 ? '' : 's'} allocated — insured value{' '}
              <strong>{formatMoney(allocatedValueCents)}</strong>
            </span>
            <div className="row" style={{ gap: '.5rem' }}>
              <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn" disabled={busy || allocatedCount === 0 || !packageId} onClick={getRates}>
                {busy ? 'Fetching rates…' : 'Get rates'}
              </button>
            </div>
          </div>
        </>
      )}

      {rates && (
        <>
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Insured value: <strong>{formatMoney(insuredValueCents)}</strong> —{' '}
            {rates.length} rate{rates.length === 1 ? '' : 's'} from EasyPost.
          </p>
          <table className="admin-table">
            <thead><tr><th>Carrier</th><th>Service</th><th>Postage</th><th>Transit</th><th /></tr></thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td>{r.carrier}</td>
                  <td>{r.service}</td>
                  <td>${r.rate} {r.currency}</td>
                  <td>{r.delivery_days ? `${r.delivery_days}d` : '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" disabled={busy} onClick={() => buy(r)}>Buy label</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: '.75rem', justifyContent: 'flex-end' }}>
            <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}

function AddressDisplay({ a }: { a: any }) {
  if (!a) return <p className="muted">None</p>;
  return (
    <div style={{ lineHeight: 1.5 }}>
      <div>{a.firstName} {a.lastName}</div>
      {a.company && <div>{a.company}</div>}
      <div>{a.line1}{a.line2 ? `, ${a.line2}` : ''}</div>
      <div>{a.city}, {a.region} {a.postalCode}</div>
      <div>{a.country}</div>
      {a.phone && <div className="muted">{a.phone}</div>}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
