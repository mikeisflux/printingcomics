import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

type Tab = 'dashboard' | 'products' | 'keywords' | 'ai';

interface DashboardData {
  totals: { products: number; analyzed: number; missingMeta: number };
  averageScore: number | null;
  recent: {
    id: string;
    score: number | null;
    status: string;
    updatedAt: string;
    product: { id: string; slug: string; name: string } | null;
  }[];
}

interface AnalysisListItem {
  id: string;
  score: number | null;
  status: string;
  suggestedTitle: string | null;
  product: { id: string; slug: string; name: string } | null;
  keywords: { keyword: string; relevance: number | null }[];
}

export function AdminSeo() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>SEO Management</h1>
        <span className="muted">Powered by Claude</span>
      </div>

      <div className="admin-card" style={{ padding: 0, marginBottom: '1rem' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 .5rem' }}>
          {(['dashboard', 'products', 'keywords', 'ai'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '.85rem 1rem',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '3px solid var(--brand)' : '3px solid transparent',
                color: tab === t ? 'var(--brand)' : 'var(--ink)',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'ai' ? 'AI Suggestions' : t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'keywords' && <KeywordsTab />}
      {tab === 'ai' && <AiTab />}
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => { void api.get<DashboardData>('/admin/seo').then(setData); }, []);
  if (!data) return <div>Loading…</div>;

  return (
    <>
      <div className="stat-grid">
        <div className="stat">
          <div className="label">Products</div>
          <div className="value">{data.totals.products}</div>
        </div>
        <div className="stat">
          <div className="label">Analyzed</div>
          <div className="value">{data.totals.analyzed}</div>
        </div>
        <div className="stat">
          <div className="label">Missing meta</div>
          <div className="value" style={{ color: data.totals.missingMeta > 0 ? '#b91c1c' : 'var(--brand)' }}>
            {data.totals.missingMeta}
          </div>
        </div>
        <div className="stat">
          <div className="label">Avg score</div>
          <div className="value">{data.averageScore ? Math.round(data.averageScore) : '—'}</div>
        </div>
      </div>

      <div className="admin-card">
        <h3>Recent analyses</h3>
        {data.recent.length === 0 ? (
          <p className="muted">No analyses yet. Go to Products and click "Analyze" to start.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Product</th><th>Score</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>
              {data.recent.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.product ? (
                      <Link to={`/admin/seo/${a.product.id}`}>{a.product.name}</Link>
                    ) : <span className="muted">Deleted product</span>}
                  </td>
                  <td>{a.score ?? '—'}</td>
                  <td><span className="badge">{a.status}</span></td>
                  <td>{new Date(a.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState<any[]>([]);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const load = () => api.get<{ products: any[] }>('/admin/products').then((r) => setProducts(r.products));
  useEffect(() => { void load(); }, []);

  const analyze = async (id: string) => {
    setAnalyzingId(id);
    try {
      await api.post(`/admin/seo/analyze-product/${id}`);
      alert('Analysis complete. See SEO detail.');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAnalyzingId(null);
    }
  };

  const bulkMissing = async () => {
    setBulkRunning(true);
    try {
      const r = await api.post<{ processed: any[] }>('/admin/seo/analyze-missing');
      alert(`Processed ${r.processed.length} products.`);
    } catch (e: any) { alert(e.message); }
    finally { setBulkRunning(false); void load(); }
  };

  return (
    <>
      <div className="admin-card">
        <div className="spread">
          <h3 style={{ margin: 0 }}>Products</h3>
          <button className="btn" onClick={bulkMissing} disabled={bulkRunning}>
            {bulkRunning ? 'Running…' : 'Fill missing meta (bulk)'}
          </button>
        </div>
      </div>
      <div className="admin-card">
        <table className="admin-table">
          <thead><tr><th>Name</th><th>SEO title</th><th>SEO meta</th><th /></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td><Link to={`/admin/seo/${p.id}`}>{p.name}</Link></td>
                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.seoTitle ?? <span className="muted">—</span>}</td>
                <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.seoDescription ?? <span className="muted">—</span>}</td>
                <td>
                  <button className="btn" onClick={() => analyze(p.id)} disabled={analyzingId === p.id}>
                    {analyzingId === p.id ? 'Analyzing…' : 'Analyze'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function KeywordsTab() {
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  useEffect(() => {
    void api.get<{ analyses: AnalysisListItem[] }>('/admin/seo/analyses').then((r) => setAnalyses(r.analyses));
  }, []);

  const all = analyses.flatMap((a) =>
    a.keywords.map((k) => ({ ...k, productName: a.product?.name, productId: a.product?.id })),
  );
  all.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));

  return (
    <div className="admin-card">
      <h3>All keywords across analyzed products</h3>
      {all.length === 0 ? (
        <p className="muted">No keywords yet. Run a product analysis first.</p>
      ) : (
        <table className="admin-table">
          <thead><tr><th>Keyword</th><th>Relevance</th><th>Product</th></tr></thead>
          <tbody>
            {all.map((k, i) => (
              <tr key={i}>
                <td>{k.keyword}</td>
                <td>{k.relevance ?? '—'}</td>
                <td>
                  {k.productId ? <Link to={`/admin/seo/${k.productId}`}>{k.productName}</Link> : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function AiTab() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    setLoading(true);
    try {
      const r = await api.post('/admin/seo/analyze-missing');
      setResult(r);
    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="admin-card">
      <h3>AI suggestions</h3>
      <p className="muted">
        One click: Claude reads every product missing SEO title or description and fills in both.
        Uses <code>claude-opus-4-7</code> with the meta-only prompt (cheap, fast).
      </p>
      <button className="btn" onClick={run} disabled={loading}>
        {loading ? 'Working…' : 'Fill all missing SEO meta'}
      </button>
      {result && <pre style={{ background: 'var(--bg-alt)', padding: '.75rem', marginTop: '1rem' }}>{JSON.stringify(result, null, 2)}</pre>}
    </div>
  );
}
