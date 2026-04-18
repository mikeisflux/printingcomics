import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../api/client';

interface Analysis {
  id: string;
  status: string;
  score: number | null;
  suggestedTitle: string | null;
  suggestedDescription: string | null;
  headline: string | null;
  summary: string | null;
  rewrittenBody: string | null;
  issues: any;
  tokensUsed: number;
  modelUsed: string | null;
  keywords: { id: string; keyword: string; intent: string | null; difficulty: number | null; relevance: number | null }[];
  product: any;
  errorMessage: string | null;
}

export function AdminSeoDetail() {
  const { productId } = useParams();
  const [product, setProduct] = useState<any>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    const prod = await api.get<{ product: any }>(`/admin/products/${productId}`);
    setProduct(prod.product);
    const list = await api.get<{ analyses: Analysis[] }>('/admin/seo/analyses');
    const existing = list.analyses.find((a) => a.product?.id === productId);
    setAnalysis(existing ?? null);
  };

  useEffect(() => { void load(); }, [productId]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const r = await api.post<{ analysis: Analysis }>(`/admin/seo/analyze-product/${productId}`);
      setAnalysis(r.analysis);
    } catch (e: any) { alert(e.message); }
    finally { setAnalyzing(false); }
  };

  const apply = async (fields: { seoTitle?: string; seoDescription?: string; description?: string }) => {
    setApplying(true);
    try {
      await api.post(`/admin/seo/apply/${productId}`, fields);
      alert('Applied to product.');
      void load();
    } catch (e: any) { alert(e.message); }
    finally { setApplying(false); }
  };

  if (!product) return <div>Loading…</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <Link to="/admin/seo">← Back to SEO</Link>
      </div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>{product.name}</h1>
        <button className="btn" onClick={analyze} disabled={analyzing}>
          {analyzing ? 'Analyzing with Claude…' : analysis ? 'Re-analyze' : 'Analyze with Claude'}
        </button>
      </div>

      <div className="admin-card">
        <h3>Current product SEO</h3>
        <div><strong>Title:</strong> {product.seoTitle ?? <span className="muted">(not set)</span>}</div>
        <div><strong>Meta:</strong> {product.seoDescription ?? <span className="muted">(not set)</span>}</div>
      </div>

      {!analysis && <p className="muted">No analysis yet. Click "Analyze with Claude" to generate SEO recommendations.</p>}

      {analysis && analysis.status === 'FAILED' && (
        <div className="error">Analysis failed: {analysis.errorMessage}</div>
      )}

      {analysis && analysis.status === 'COMPLETE' && (
        <>
          <div className="admin-card">
            <div className="spread">
              <h3 style={{ margin: 0 }}>Overall score</h3>
              <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--brand)' }}>{analysis.score ?? '—'}/100</div>
            </div>
            <p className="muted">{analysis.summary}</p>
            <div style={{ fontSize: '.85rem', color: 'var(--ink-muted)' }}>
              Model: {analysis.modelUsed} · Tokens: {analysis.tokensUsed}
            </div>
          </div>

          <div className="admin-card">
            <h3>Suggested meta</h3>
            <label>Suggested title</label>
            <textarea readOnly rows={2} value={analysis.suggestedTitle ?? ''} />
            <label>Suggested meta description</label>
            <textarea readOnly rows={3} value={analysis.suggestedDescription ?? ''} />
            <button
              className="btn"
              disabled={applying}
              onClick={() => apply({
                seoTitle: analysis.suggestedTitle ?? undefined,
                seoDescription: analysis.suggestedDescription ?? undefined,
              })}
            >
              Apply title + meta to product
            </button>
          </div>

          <div className="admin-card">
            <h3>Rewritten body copy</h3>
            <textarea readOnly rows={12} value={analysis.rewrittenBody ?? ''} />
            <button
              className="btn secondary"
              disabled={applying}
              onClick={() => apply({ description: analysis.rewrittenBody ?? undefined })}
            >
              Apply rewritten body to product
            </button>
          </div>

          <div className="admin-card">
            <h3>Keywords</h3>
            <table className="admin-table">
              <thead><tr><th>Keyword</th><th>Intent</th><th>Difficulty</th><th>Relevance</th></tr></thead>
              <tbody>
                {analysis.keywords.map((k) => (
                  <tr key={k.id}>
                    <td>{k.keyword}</td>
                    <td>{k.intent}</td>
                    <td>{k.difficulty ?? '—'}</td>
                    <td>{k.relevance ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-card">
            <h3>Issues</h3>
            {Array.isArray(analysis.issues) && analysis.issues.length > 0 ? (
              <ul>
                {(analysis.issues as any[]).map((i, idx) => (
                  <li key={idx}>
                    <span className="badge" style={{
                      background: i.severity === 'high' ? '#f8d7da' : i.severity === 'medium' ? '#fff3cd' : '#e0ecff',
                      color: '#333',
                    }}>{i.severity}</span>
                    {' '}
                    <strong>{i.field}:</strong> {i.message}
                  </li>
                ))}
              </ul>
            ) : <p className="muted">No issues found.</p>}
          </div>
        </>
      )}
    </div>
  );
}
