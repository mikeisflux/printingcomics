import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
  usePayPalCardFields,
} from '@paypal/react-paypal-js';
import { api, ApiError, formatMoney } from '../api/client';
import { useCart } from '../store/cart';
import { useAuth } from '../store/auth';
import { formatCartItemOptions } from '../lib/cart-options';
import { AddressFields } from '../components/AddressFields';
import { RateRow, rememberedDestination, shipmentLine, type EstimateResult, type ShipRate } from '../components/ShippingEstimator';
import { emptyAddress, emailLooksValid, postalCodeLooksValid, validateAddress, type Address, type AddressField } from '../lib/address';
import { useSeo } from '../lib/seo';

/**
 * Checkout, on one page: contact, shipping address, shipping method, billing,
 * payment — with the order summary beside it (above it on a phone). Live
 * carrier rates appear as soon as the ZIP code is typed and are confirmed
 * against the full address; every field is named for browser autofill and
 * checked as it is left; what still blocks payment is listed in words.
 */

function useNarrow(maxPx = 900): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${maxPx}px)`).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [maxPx]);
  return narrow;
}

export function PaypalCheckout() {
  useSeo({ title: 'Checkout', noindex: true });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { cart, load, subtotal } = useCart();
  const narrow = useNarrow();

  const [paypalClientId, setPaypalClientId] = useState<string | null>(null);
  const [enableCard, setEnableCard] = useState(true);
  const [enableButton, setEnableButton] = useState(true);
  const [env, setEnv] = useState<'sandbox' | 'live'>('sandbox');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [ship, setShip] = useState<Address>(() => ({ ...emptyAddress, ...rememberedDestination() }));
  const [bill, setBill] = useState<Address>(emptyAddress);
  const [sameAsShip, setSameAsShip] = useState(true);
  const [shipTouched, setShipTouched] = useState<Set<AddressField>>(new Set());
  const [billTouched, setBillTouched] = useState<Set<AddressField>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Discount code (applied before payment; stacks on top of the site-wide
  // discount). A code can take its share off shipping too, so the applied
  // state remembers which shipping price it was checked against.
  interface AppliedCoupon { code: string; discountCents: number; shippingDiscountCents: number; description: string | null; forShippingCents: number }
  interface CouponCheck { ok: boolean; code: string; description: string | null; discountCents: number; shippingDiscountCents: number; reason: string | null }
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [placingFree, setPlacingFree] = useState(false);

  // Shipping: live rates for the boxes this order ships in.
  const [shipRates, setShipRates] = useState<ShipRate[]>([]);
  const [shipRateId, setShipRateId] = useState<string | null>(null);
  const [shipQuoting, setShipQuoting] = useState(false);
  const [shipInfo, setShipInfo] = useState<{ boxes?: number; shipmentWeightOz?: number } | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);
  const [shipNote, setShipNote] = useState<string | null>(null);
  const [shipConfirmed, setShipConfirmed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const quoteSeq = useRef(0);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user]);

  const shipErrors = validateAddress(ship);
  const shipOk = Object.keys(shipErrors).length === 0;
  const billErrors = sameAsShip ? {} : validateAddress(bill);
  const billOk = Object.keys(billErrors).length === 0;
  const emailOk = emailLooksValid(email);
  const zipOk = postalCodeLooksValid(ship.country, ship.postalCode);
  const itemCount = cart?.items.length ?? 0;
  const sub = subtotal();

  // Rates come from the ZIP code the moment it is complete (an estimate for
  // the boxes this order ships in), then from the full address once it is
  // valid — that second quote is what the order is charged on.
  useEffect(() => {
    if (!zipOk || itemCount === 0) { setShipRates([]); setShipInfo(null); setShipError(null); setShipQuoting(false); return; }
    const seq = ++quoteSeq.current;
    setShipQuoting(true);
    setShipError(null);
    const t = setTimeout(() => {
      const request = shipOk
        ? api.post<EstimateResult>('/checkout/quote', { shippingAddress: ship })
        : api.post<EstimateResult>('/checkout/estimate', { country: ship.country, postalCode: ship.postalCode.trim(), region: ship.region || undefined, city: ship.city || undefined, line1: ship.line1 || undefined });
      request
        .then((j) => {
          if (seq !== quoteSeq.current) return;
          const rates = j.shippingOptions ?? [];
          setShipRates(rates);
          setShipInfo({ boxes: j.boxes, shipmentWeightOz: j.shipmentWeightOz });
          setShipConfirmed(shipOk);
          setShipRateId((cur) => (cur && rates.some((r) => r.id === cur) ? cur : rates[0]?.id ?? null));
          setShipError(rates.length === 0 ? (j.liveError ?? 'No shipping options for this address yet. Check the postal code, or try again in a minute.') : null);
          setShipNote(rates.length > 0 && j.liveError ? j.liveError : null);
        })
        .catch((e: any) => {
          if (seq !== quoteSeq.current) return;
          setShipRates([]);
          setShipInfo(null);
          setShipError(e?.message ?? 'Could not get shipping rates. Please try again.');
        })
        .finally(() => { if (seq === quoteSeq.current) setShipQuoting(false); });
    }, 500); // debounce while the address is being typed
    return () => clearTimeout(t);
  }, [ship.country, ship.postalCode, ship.region, ship.city, ship.line1, shipOk, zipOk, itemCount, sub, retryTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch PayPal config from the API (reads from admin settings).
  useEffect(() => {
    void fetch('/api/config/paypal', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) { setConfigError(`API ${r.status}`); return null; }
        return r.json();
      })
      .then((j) => {
        setConfigLoaded(true);
        if (!j) return;
        setPaypalClientId(j.clientId || null);
        setEnableCard(j.enableCard);
        setEnableButton(j.enableButton);
        setEnv(j.environment);
      })
      .catch((e) => { setConfigError(String(e)); setConfigLoaded(true); });
  }, []);

  const selectedRate = shipRates.find((r) => r.id === shipRateId) ?? null;
  const shipCents = selectedRate?.rateCents ?? 0;

  const checkCoupon = (code: string, shippingCents: number) =>
    api.post<CouponCheck>('/checkout/validate-coupon', { code, shippingCents });

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const r = await checkCoupon(code, shipCents);
      if (r.ok) {
        setAppliedCoupon({ code: r.code, discountCents: r.discountCents, shippingDiscountCents: r.shippingDiscountCents, description: r.description, forShippingCents: shipCents });
        setCouponMsg(null);
      } else {
        setAppliedCoupon(null);
        setCouponMsg(r.reason ?? 'That code isn’t valid.');
      }
    } catch (e: any) {
      setAppliedCoupon(null);
      setCouponMsg(e?.message ?? 'Could not validate that code.');
    } finally {
      setCouponBusy(false);
    }
  };

  // The code's share of shipping depends on the rate picked: re-check it
  // whenever the shipping price changes (quote arrives, another method).
  const appliedCode = appliedCoupon?.code ?? null;
  const appliedFor = appliedCoupon?.forShippingCents ?? null;
  useEffect(() => {
    if (!appliedCode || appliedFor === shipCents) return;
    let cancelled = false;
    void checkCoupon(appliedCode, shipCents)
      .then((r) => {
        if (cancelled || !r.ok) return;
        setAppliedCoupon((cur) => cur && cur.code === r.code
          ? { ...cur, discountCents: r.discountCents, shippingDiscountCents: r.shippingDiscountCents, forShippingCents: shipCents }
          : cur);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [appliedCode, appliedFor, shipCents]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMsg(null);
  };

  const orderBody = () => ({
    email: email.trim(),
    shippingAddress: ship,
    billingAddress: sameAsShip ? ship : bill,
    shippingRateId: shipRateId,
    couponCode: appliedCoupon?.code,
  });

  const createOrder = async (): Promise<string> => {
    setError(null);
    try {
      const r = await api.post<{ paypalOrderId: string; orderNumber: string }>('/checkout/paypal/create', orderBody());
      return r.paypalOrderId;
    } catch (e: any) {
      // The SDK swallows this rejection into a generic onError; show the
      // server's actual reason first, then let the SDK abort the flow.
      setError(describeError(e));
      throw e;
    }
  };

  // Nothing to pay (a code covered goods and shipping): the order is placed
  // directly — PayPal refuses a $0 order and there is no card to charge.
  const placeFreeOrder = async () => {
    setError(null);
    setPlacingFree(true);
    try {
      const r = await api.post<{ orderNumber: string; viewToken?: string }>('/checkout/free', orderBody());
      void load(); // the server emptied the cart; the header badge follows
      navigate(orderPath(r));
    } catch (e: any) {
      setError(describeError(e));
    } finally {
      setPlacingFree(false);
    }
  };

  const onApprove = async (data: { orderID: string }, actions?: { restart?: () => unknown }) => {
    setError(null);
    try {
      const r = await api.post<{ orderNumber: string; viewToken?: string }>(`/checkout/paypal/capture/${data.orderID}`);
      void load(); // the server emptied the cart; the header badge follows
      navigate(orderPath(r));
    } catch (e: any) {
      setError(describeError(e));
      // PayPal's documented handling for a declined instrument: restart the
      // approval so the buyer can pick a different card or funding source,
      // instead of leaving them on a dead button.
      if (e instanceof ApiError && (e.details as any)?.issue === 'INSTRUMENT_DECLINED' && actions?.restart) {
        void actions.restart();
      }
    }
  };

  if (!configLoaded) {
    return (
      <div className="container checkout-page">
        <h1>Checkout</h1>
        <p className="muted">Loading payment options…</p>
      </div>
    );
  }

  const items = cart?.items ?? [];
  if (cart && items.length === 0) {
    return (
      <div className="container checkout-page">
        <h1>Checkout</h1>
        <p className="muted">Your cart is empty.</p>
        <Link to="/shop" className="btn">Continue shopping</Link>
      </div>
    );
  }

  // What is left after the code: on the goods, on shipping, and in all. Tax,
  // if any, is figured on the goods after the discount — so a $0 balance here
  // is a $0 order.
  const goodsDiscount = Math.min(sub, appliedCoupon?.discountCents ?? 0);
  const shipDiscount = Math.min(shipCents, appliedCoupon?.shippingDiscountCents ?? 0);
  const totalDue = (sub - goodsDiscount) + (shipCents - shipDiscount);

  // What still stands between the customer and paying, in words.
  const missing: string[] = [];
  if (!emailOk) missing.push('an email address for the order confirmation');
  if (!shipOk) missing.push('the shipping address');
  if (!sameAsShip && !billOk) missing.push('the billing address');
  if (!selectedRate) missing.push(shipQuoting ? 'the shipping rates (loading…)' : 'a shipping method');
  const canCheckout = missing.length === 0 && !shipQuoting && items.length > 0;
  const nothingToPay = canCheckout && totalDue === 0;

  const checkDetails = () => {
    setShowAll(true);
    setEmailTouched(true);
    const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus();
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const paypalMissing = !paypalClientId && (
    <>
      <div className="error">
        PayPal is not yet configured. Set the credentials in Admin → Settings → Payments.
      </div>
      <p className="muted" style={{ marginTop: '1rem', fontSize: '.85rem' }}>
        Diagnostic: {configError
          ? `config endpoint failed (${configError})`
          : `config endpoint returned environment=${env}, clientId=empty. Re-paste the Client ID in Admin → Settings → Payments and click outside the field to save (browser autofill can silently swallow it).`}
      </p>
    </>
  );

  const summary = (
    <div className="admin-card checkout-summary">
      <div className="summary-items">
        {items.map((i) => {
          const pairs = formatCartItemOptions(i);
          const img = i.product.images?.[0]?.url;
          return (
            <div key={i.id} className="summary-item">
              {img ? <img className="summary-thumb" src={img} alt="" width={56} height={56} loading="lazy" /> : <div className="summary-thumb" aria-hidden="true" />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.92rem', lineHeight: 1.3 }}>{i.product.name}</div>
                <div className="muted" style={{ fontSize: '.8rem' }}>
                  Qty {i.quantity}{i.variant ? ` · ${i.variant.label}` : ''}
                  {pairs.length > 0 && <> · {pairs.map((p) => `${p.label}: ${p.value}`).join(' · ')}</>}
                </div>
              </div>
              <span style={{ fontWeight: 600 }}>{formatMoney(i.unitPriceCents * i.quantity)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'right', margin: '.4rem 0 .2rem' }}><Link to="/cart" style={{ fontSize: '.85rem' }}>Edit cart</Link></div>

      {/* Discount code — applied here, before payment */}
      <div style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)' }}>
        <label htmlFor="coupon" style={{ margin: '0 0 .35rem', fontSize: '.9rem' }}>Discount code</label>
        {appliedCoupon ? (
          <div className="spread" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: '.9rem' }}>
              <strong>{appliedCoupon.code}</strong> applied
              {appliedCoupon.description ? ` — ${appliedCoupon.description}` : ''}
            </span>
            <button type="button" className="btn secondary sm" onClick={removeCoupon}>Remove</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <input
              id="coupon"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }}
              placeholder="Enter code"
              autoComplete="off"
              autoCapitalize="characters"
              style={{ flex: 1, textTransform: 'uppercase', margin: 0 }}
            />
            <button type="button" className="btn secondary" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
              {couponBusy ? '…' : 'Apply'}
            </button>
          </div>
        )}
        {couponMsg && <div className="field-error" role="alert">{couponMsg}</div>}
      </div>

      <div className="spread" style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)' }}>
        <span>Subtotal</span><span>{formatMoney(sub)}</span>
      </div>
      <div className="spread" style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)' }}>
        <span>Shipping{selectedRate ? <span className="muted" style={{ fontSize: '.8rem' }}> · {selectedRate.name}</span> : null}</span>
        <span>{shipQuoting ? <span className="muted">…</span> : selectedRate ? formatMoney(shipCents) : <span className="muted" style={{ fontSize: '.85rem' }}>{zipOk ? '—' : 'Enter ZIP'}</span>}</span>
      </div>
      {appliedCoupon && goodsDiscount > 0 && (
        <div className="spread" style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)', color: '#166534' }}>
          <span>Discount ({appliedCoupon.code})</span>
          <span>−{formatMoney(goodsDiscount)}</span>
        </div>
      )}
      {appliedCoupon && shipDiscount > 0 && (
        <div className="spread" style={{ padding: '.5rem 0', borderTop: '1px solid var(--border)', color: '#166534' }}>
          <span>Shipping discount ({appliedCoupon.code})</span>
          <span>−{formatMoney(shipDiscount)}</span>
        </div>
      )}
      <div className="spread" style={{ padding: '.75rem 0', fontWeight: 700, fontSize: '1.15rem', borderTop: '1px solid var(--border)' }}>
        <span>Total</span><span data-testid="checkout-total">{formatMoney(totalDue)}</span>
      </div>
      <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>
        {nothingToPay ? 'Nothing to pay — place the order below.' : 'Sales tax, where it applies, is added on PayPal’s review page before you confirm.'}
      </p>
    </div>
  );

  return (
    <div className="container checkout-page">
      <div className="spread" style={{ flexWrap: 'wrap', gap: '.5rem' }}>
        <h1 style={{ margin: 0 }}>Checkout</h1>
        <span className="muted" style={{ fontSize: '.85rem' }}>🔒 Secure checkout · PayPal or any card</span>
      </div>

      <div className="checkout-grid">
        <main className="checkout-main">
          <section className="checkout-section" aria-labelledby="s-contact">
            <h2 id="s-contact"><span className="step-num">1</span> Contact</h2>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                aria-invalid={(emailTouched || showAll) && !emailOk ? true : undefined}
                onBlur={() => setEmailTouched(true)}
                onChange={(e) => setEmail(e.target.value)}
              />
              {(emailTouched || showAll) && !emailOk
                ? <div className="field-error" role="alert">Enter a valid email address — the order confirmation and tracking go there.</div>
                : <div className="field-hint">Order confirmation, proofs and tracking are sent here.{!user && <> Have an account? <Link to="/login?next=/checkout">Sign in</Link> to fill this in.</>}</div>}
            </div>
          </section>

          <section className="checkout-section" aria-labelledby="s-ship">
            <h2 id="s-ship"><span className="step-num">2</span> Shipping address</h2>
            <AddressFields
              value={ship}
              onChange={setShip}
              errors={shipErrors}
              touched={showAll ? 'all' : shipTouched}
              onBlur={(f) => setShipTouched((s) => new Set(s).add(f))}
              idPrefix="ship"
              section="shipping"
            />
          </section>

          <section className="checkout-section" aria-labelledby="s-method">
            <h2 id="s-method"><span className="step-num">3</span> Shipping method</h2>
            {!zipOk ? (
              <div className="ship-status">Enter your {ship.country === 'US' ? 'ZIP code' : 'postal code'} above to see live carrier rates for this order.</div>
            ) : (
              <>
                {shipInfo && shipRates.length > 0 && (
                  <div className="muted" style={{ fontSize: '.85rem', marginBottom: '.4rem' }}>
                    {shipmentLine(shipInfo)} · rates to {ship.postalCode.trim()}{shipConfirmed ? '' : ' (confirmed once the address is complete)'}
                  </div>
                )}
                {shipQuoting && shipRates.length === 0 && <div className="ship-status" aria-live="polite">Getting live rates from UPS, USPS and FedEx…</div>}
                {shipError && (
                  <div className="ship-status error" role="alert">
                    {shipError}{' '}
                    <button type="button" className="btn secondary sm" style={{ marginLeft: '.5rem' }} onClick={() => setRetryTick((n) => n + 1)}>Try again</button>
                  </div>
                )}
                {shipNote && !shipError && <div className="ship-status" style={{ marginBottom: '.5rem' }}>{shipNote}</div>}
                {shipRates.length > 0 && (
                  <div className="rate-list" aria-busy={shipQuoting} style={shipQuoting ? { opacity: .6 } : undefined}>
                    {shipRates.map((r) => <RateRow key={r.id} rate={r} selected={shipRateId === r.id} onSelect={() => setShipRateId(r.id)} />)}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="checkout-section" aria-labelledby="s-bill">
            <h2 id="s-bill"><span className="step-num">4</span> Billing address</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontWeight: 500, margin: 0 }}>
              <input type="checkbox" checked={sameAsShip} onChange={(e) => setSameAsShip(e.target.checked)} style={{ width: 'auto', margin: 0 }} />
              Same as the shipping address
            </label>
            {!sameAsShip && (
              <AddressFields
                value={bill}
                onChange={setBill}
                errors={billErrors}
                touched={showAll ? 'all' : billTouched}
                onBlur={(f) => setBillTouched((s) => new Set(s).add(f))}
                idPrefix="bill"
                section="billing"
                showPhone={false}
              />
            )}
          </section>

          <section className="checkout-section" aria-labelledby="s-pay">
            <h2 id="s-pay"><span className="step-num">5</span> Payment</h2>
            {error && <div className="error" role="alert">{error}</div>}

            {!canCheckout ? (
              <div className="ship-status" data-testid="payment-blocked">
                <strong>Almost there.</strong> To pay, add:
                <ul className="checklist">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
                <button type="button" className="btn secondary sm" onClick={checkDetails}>Show me what’s missing</button>
              </div>
            ) : nothingToPay ? (
              <div className="admin-card" data-testid="nothing-to-pay">
                <h4 style={{ marginTop: 0 }}>Nothing to pay</h4>
                <p style={{ marginTop: 0 }}>
                  {appliedCoupon
                    ? <>Code <strong>{appliedCoupon.code}</strong> covers this order{shipCents > 0 ? ', shipping included' : ''}.</>
                    : 'This order has no charge.'}
                  {' '}No card or PayPal account is needed.
                </p>
                <button className="btn" style={{ width: '100%' }} disabled={placingFree} onClick={() => void placeFreeOrder()}>
                  {placingFree ? 'Placing order…' : 'Place order'}
                </button>
              </div>
            ) : paypalMissing ? (
              paypalMissing
            ) : (
              <>
                <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>
                  You’ll pay <strong>{formatMoney(totalDue)}</strong>{selectedRate ? <> including {formatMoney(shipCents - shipDiscount)} shipping by {selectedRate.name}</> : null}. Sales tax, where it applies, is added on PayPal’s review page.
                </p>
                <PayPalScriptProvider
                  options={{
                    clientId: paypalClientId!,
                    currency: 'USD',
                    intent: 'capture',
                    components: `buttons${enableCard ? ',card-fields' : ''}`,
                    environment: env === 'live' ? 'production' : 'sandbox',
                  }}
                >
                  {enableButton && (
                    <div style={{ marginBottom: '1rem' }}>
                      <PayPalButtons
                        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay' }}
                        createOrder={createOrder}
                        onApprove={onApprove}
                        onError={(err) => setError((prev) => prev ?? describeError(err))}
                      />
                    </div>
                  )}

                  {enableCard && (
                    <div className="admin-card">
                      <h4 style={{ marginTop: 0 }}>Pay with card</h4>
                      <PayPalCardFieldsProvider createOrder={createOrder} onApprove={onApprove} onError={(err) => setError((prev) => prev ?? describeError(err))}>
                        <PayPalCardFieldsForm />
                        <SubmitCardButton onError={(msg) => setError(msg)} />
                      </PayPalCardFieldsProvider>
                    </div>
                  )}
                </PayPalScriptProvider>
              </>
            )}
          </section>
        </main>

        <aside className="checkout-aside" aria-label="Order summary">
          {narrow ? (
            <>
              <button type="button" className="summary-toggle" aria-expanded={summaryOpen} onClick={() => setSummaryOpen((v) => !v)}>
                <span>{summaryOpen ? 'Hide' : 'Show'} order summary · {items.length} item{items.length === 1 ? '' : 's'}</span>
                <strong data-testid="summary-total-mobile">{formatMoney(totalDue)}</strong>
              </button>
              {summaryOpen && summary}
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Order summary</h3>
              {summary}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * Where a freshly placed order's confirmation lives. The view token lets a
 * guest (whose account is not signed in yet) open this one order.
 */
export function orderPath(r: { orderNumber: string; viewToken?: string }): string {
  return `/order/${r.orderNumber}${r.viewToken ? `?t=${encodeURIComponent(r.viewToken)}` : ''}`;
}

/** One line a buyer can act on, from whatever shape the SDK or our API threw. */
function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message || 'Payment failed. Please try again.';
  if (typeof err === 'string') return err;
  const m = (err as any)?.message;
  return typeof m === 'string' && m ? m : 'Payment failed. Please try again.';
}

function SubmitCardButton({ onError }: { onError: (message: string) => void }) {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    if (!cardFieldsForm) return;
    setSubmitting(true);
    try {
      const state = await cardFieldsForm.getState();
      if (!state.isFormValid) {
        onError('Please check the card number, expiry and security code.');
        return;
      }
      await cardFieldsForm.submit();
    } catch (e) {
      console.error('[card-fields] submit failed', e);
      onError(describeError(e));
    } finally { setSubmitting(false); }
  };
  return (
    <button className="btn" style={{ marginTop: '1rem', width: '100%' }} onClick={submit} disabled={submitting}>
      {submitting ? 'Processing…' : 'Pay with card'}
    </button>
  );
}
