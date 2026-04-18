import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

/**
 * Landing page for PayPal's `return_url`. PayPal appends `?token=<orderId>`
 * (and sometimes `?PayerID=...`) when the buyer approves. We capture the
 * order server-side, then redirect to the order confirmation page.
 */
export function PaypalReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const paypalOrderId = params.get('token') ?? params.get('orderID');
    if (!paypalOrderId) {
      setError('Missing PayPal order token in return URL.');
      return;
    }
    (async () => {
      try {
        const r = await api.post<{ orderNumber: string; status: string }>(
          `/checkout/paypal/capture/${paypalOrderId}`,
        );
        navigate(`/order/${r.orderNumber}`, { replace: true });
      } catch (e: any) {
        setError(e.message ?? 'Payment capture failed.');
      }
    })();
  }, [params, navigate]);

  return (
    <div className="container" style={{ padding: '4rem 0', textAlign: 'center', maxWidth: 640 }}>
      {error ? (
        <>
          <h1>Payment issue</h1>
          <div className="error">{error}</div>
          <p className="muted">Your cart is still available. Please return to checkout and try again.</p>
        </>
      ) : (
        <>
          <h1>Finalizing your order…</h1>
          <p className="muted">Hold tight — we're confirming your payment with PayPal.</p>
        </>
      )}
    </div>
  );
}
