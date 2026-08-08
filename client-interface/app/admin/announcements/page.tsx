'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Loader2, Send } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/shared/useAnnouncements';
import { AnnouncementFeed } from '@/components/shared/AnnouncementFeed';
import { announcementsApi, type AnnouncementAudience } from '@/lib/services/announcements-api';
import { programsApi } from '@/lib/services/program-api';
import { clanApi } from '@/lib/services/clan-api';

interface Opt { id: string; name: string }

export default function AdminAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  const [programs, setPrograms] = useState<Opt[]>([]);
  const [clans, setClans] = useState<Opt[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [targetId, setTargetId] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    programsApi.getAll().then((r: any) => setPrograms((Array.isArray(r?.data) ? r.data : (r?.data?.programs ?? [])).map((p: any) => ({ id: p.id, name: p.name })))).catch(() => {});
    clanApi.list().then((r: any) => setClans((r?.data?.clans ?? r?.clans ?? []).map((c: any) => ({ id: c.id, name: c.name })))).catch(() => {});
  }, []);

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  const needsTarget = audience === 'program' || audience === 'clan';
  const targets = audience === 'program' ? programs : clans;

  const post = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Add a title and message'); return; }
    if (needsTarget && !targetId) { toast.error(`Select a ${audience}`); return; }
    try {
      setPosting(true);
      await announcementsApi.create({ title: title.trim(), body: body.trim(), audience, audienceId: needsTarget ? targetId : undefined });
      toast.success('Announcement posted');
      setTitle(''); setBody(''); setAudience('all'); setTargetId('');
      refetch();
    } catch { toast.error('Could not post'); }
    finally { setPosting(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2 flex items-center gap-2"><Megaphone className="w-5 h-5 text-brand-600" /> Announcements</h1>
        <p className="text-slate-600">Broadcast to everyone, a role, a program, or a clan.</p>
      </div>

      {/* Composer */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center gap-2"><Send className="w-4 h-4 text-brand-500" /><h2 className="text-slate-900">New announcement</h2></div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={field} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What do people need to know?" className={`${field} resize-none`} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">To</label>
          <select value={audience} onChange={(e) => { setAudience(e.target.value as AnnouncementAudience); setTargetId(''); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="all">Everyone</option>
            <option value="mentors">All mentors</option>
            <option value="mentees">All mentees</option>
            <option value="program">A program…</option>
            <option value="clan">A clan…</option>
          </select>
          {needsTarget && (
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">{`Select a ${audience}…`}</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button onClick={post} disabled={posting} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Post
          </button>
        </div>
      </div>

      <AnnouncementFeed announcements={announcements} loading={loading} error={error} onRefresh={refetch} canManage emptyHint="No announcements yet." />
    </div>
  );
}
