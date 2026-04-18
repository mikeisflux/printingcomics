import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { RichTextEditor } from '../../components/RichTextEditor';

export function AdminEmailTemplateEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', subject: '', html: '', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew && id) {
      void api.get<{ template: any }>(`/admin/email/templates/${id}`).then((r) => {
        setForm({
          name: r.template.name,
          subject: r.template.subject,
          html: r.template.html,
          text: r.template.text ?? '',
        });
      });
    }
  }, [id, isNew]);

  const save = async () => {
    setSaving(true);
    try {
      if (isNew) {
        const r = await api.post<{ template: { id: string } }>('/admin/email/templates', form);
        navigate(`/admin/email/templates/${r.template.id}`);
      } else {
        await api.put(`/admin/email/templates/${id}`, form);
        alert('Saved.');
      }
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!id || !confirm('Archive template?')) return;
    await api.del(`/admin/email/templates/${id}`);
    navigate('/admin/email');
  };

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>{isNew ? 'New template' : 'Edit template'}</h1>
        <div className="row">
          {!isNew && <button className="btn secondary" onClick={remove}>Archive</button>}
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <div className="admin-card">
        <label>Name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Subject</label>
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <label>HTML body</label>
        <RichTextEditor value={form.html} onChange={(html) => setForm({ ...form, html })} />
        <label style={{ marginTop: '1rem' }}>Plain text fallback (optional)</label>
        <textarea rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
        <p className="muted" style={{ fontSize: '.85rem', marginTop: '.5rem' }}>
          Use <code>{'{{first_name}}'}</code>, <code>{'{{email}}'}</code>, etc. — substitution happens at campaign render time.
        </p>
      </div>
    </div>
  );
}
