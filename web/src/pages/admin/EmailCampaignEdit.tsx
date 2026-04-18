import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { RichTextEditor } from '../../components/RichTextEditor';

export function AdminEmailCampaignEdit() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '', subject: '', html: '', text: '',
    fromName: '', fromEmail: '', replyTo: '',
    templateId: '', listId: '', extraRecipients: [] as string[],
    scheduledAt: '',
  });
  const [lists, setLists] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [extraRaw, setExtraRaw] = useState('');

  const load = async () => {
    const [ls, ts] = await Promise.all([
      api.get<{ lists: any[] }>('/admin/email/lists'),
      api.get<{ templates: any[] }>('/admin/email/templates'),
    ]);
    setLists(ls.lists);
    setTemplates(ts.templates);
    if (!isNew && id) {
      const r = await api.get<{ campaign: any }>(`/admin/email/campaigns/${id}`);
      setForm({
        name: r.campaign.name,
        subject: r.campaign.subject,
        html: r.campaign.html,
        text: r.campaign.text ?? '',
        fromName: r.campaign.fromName ?? '',
        fromEmail: r.campaign.fromEmail ?? '',
        replyTo: r.campaign.replyTo ?? '',
        templateId: r.campaign.templateId ?? '',
        listId: r.campaign.listId ?? '',
        extraRecipients: r.campaign.extraRecipients ?? [],
        scheduledAt: r.campaign.scheduledAt ?? '',
      });
      setExtraRaw((r.campaign.extraRecipients ?? []).join(', '));
      setAttachments(r.campaign.attachments ?? []);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const loadTemplate = async (tid: string) => {
    if (!tid) return;
    const r = await api.get<{ template: any }>(`/admin/email/templates/${tid}`);
    setForm({ ...form, templateId: tid, subject: r.template.subject, html: r.template.html, text: r.template.text ?? '' });
  };

  const save = async (): Promise<string | null> => {
    setSaving(true);
    try {
      const body = {
        ...form,
        templateId: form.templateId || undefined,
        listId: form.listId || undefined,
        fromEmail: form.fromEmail || undefined,
        replyTo: form.replyTo || undefined,
        extraRecipients: extraRaw.split(',').map((s) => s.trim()).filter(Boolean),
        scheduledAt: form.scheduledAt || undefined,
      };
      if (isNew) {
        const r = await api.post<{ campaign: { id: string } }>('/admin/email/campaigns', body);
        navigate(`/admin/email/campaigns/${r.campaign.id}`);
        return r.campaign.id;
      } else {
        await api.put(`/admin/email/campaigns/${id}`, body);
        return id!;
      }
    } catch (e: any) { alert(e.message); return null; }
    finally { setSaving(false); }
  };

  const uploadAttachments = async (files: FileList | null) => {
    if (!files || files.length === 0 || !id || isNew) {
      if (isNew) alert('Save the campaign first, then upload attachments.');
      return;
    }
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    const res = await fetch(`/api/admin/email/campaigns/${id}/attachments`, { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) alert('Upload failed');
    else {
      const r = await res.json();
      setAttachments([...attachments, ...r.attachments]);
    }
  };

  const sendNow = async () => {
    if (!id || isNew) { alert('Save first.'); return; }
    if (!confirm('Send this campaign now?')) return;
    setSending(true);
    try {
      const r = await api.post<{ sent: number; failed: number; total: number }>(`/admin/email/campaigns/${id}/send`);
      alert(`Sent ${r.sent}/${r.total} (failed: ${r.failed})`);
    } catch (e: any) { alert(e.message); }
    finally { setSending(false); }
  };

  return (
    <div>
      <div className="spread" style={{ marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>{isNew ? 'New campaign' : 'Edit campaign'}</h1>
        <div className="row">
          <button className="btn secondary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {!isNew && <button className="btn" onClick={sendNow} disabled={sending}>{sending ? 'Sending…' : 'Send now'}</button>}
        </div>
      </div>

      <div className="admin-card">
        <h3>Content</h3>
        <label>Name (internal)</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label>Load from template</label>
        <select value={form.templateId} onChange={(e) => loadTemplate(e.target.value)}>
          <option value="">— None —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label>Subject</label>
        <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        <label>HTML body</label>
        <RichTextEditor value={form.html} onChange={(html) => setForm({ ...form, html })} />
        <label style={{ marginTop: '1rem' }}>Plain text fallback (optional)</label>
        <textarea rows={4} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} />
      </div>

      <div className="admin-card">
        <h3>Sender</h3>
        <div className="grid-2">
          <div>
            <label>From name (override)</label>
            <input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
          </div>
          <div>
            <label>From email (override)</label>
            <input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
          </div>
        </div>
        <label>Reply-to (optional)</label>
        <input value={form.replyTo} onChange={(e) => setForm({ ...form, replyTo: e.target.value })} />
      </div>

      <div className="admin-card">
        <h3>Recipients</h3>
        <label>List</label>
        <select value={form.listId} onChange={(e) => setForm({ ...form, listId: e.target.value })}>
          <option value="">— None —</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l._count.members})</option>)}
        </select>
        <label>Extra recipients (comma-separated emails)</label>
        <input value={extraRaw} onChange={(e) => setExtraRaw(e.target.value)} />
      </div>

      <div className="admin-card">
        <h3>Attachments</h3>
        <input type="file" multiple onChange={(e) => uploadAttachments(e.target.files)} />
        <ul>
          {attachments.map((a) => (
            <li key={a.id}>{a.filename} ({Math.round(a.sizeBytes / 1024)} KB)</li>
          ))}
        </ul>
      </div>

      <div className="admin-card">
        <h3>Schedule (optional)</h3>
        <label>Send at</label>
        <input type="datetime-local" value={form.scheduledAt ? form.scheduledAt.slice(0, 16) : ''} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : '' })} />
        <p className="muted" style={{ fontSize: '.85rem' }}>
          Scheduled send requires a cron/worker to dispatch — not included in the initial build. For now, use "Send now."
        </p>
      </div>
    </div>
  );
}
