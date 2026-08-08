'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Megaphone, Send, Loader2 } from 'lucide-react';
import { useAnnouncements } from '@/lib/hooks/shared/useAnnouncements';
import { AnnouncementFeed } from '@/components/shared/AnnouncementFeed';
import { announcementsApi } from '@/lib/services/announcements-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface LedClan { id: string; name: string }

export default function MentorAnnouncements() {
  const { announcements, loading, error, refetch } = useAnnouncements();
  const [clans, setClans] = useState<LedClan[]>([]);
  const [clanId, setClanId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    announcementsApi.ledClans().then((r: any) => {
      const list: LedClan[] = r?.data?.clans ?? [];
      setClans(list);
      if (list.length) setClanId(list[0].id);
    }).catch(() => setClans([]));
  }, []);

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  const post = async () => {
    if (!title.trim() || !body.trim()) { toast.error('Add a title and message'); return; }
    if (!clanId) { toast.error('You lead no clan to announce to'); return; }
    try {
      setPosting(true);
      await announcementsApi.create({ title: title.trim(), body: body.trim(), audience: 'clan', audienceId: clanId });
      toast.success('Announcement posted to your clan');
      setTitle(''); setBody('');
      refetch();
    } catch (e: unknown) {
      toast.error(extractApiErrorMessage(e, 'Could not post announcement'));
    } finally { setPosting(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-slate-900 mb-2 flex items-center gap-2"><Megaphone className="w-5 h-5 text-brand-600" /> Announcements</h1>
        <p className="text-slate-600">Post updates to your clan&apos;s mentees, and see what admins have shared.</p>
      </div>

      {/* Composer - mentors announce to a clan they lead */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-3">
        <div className="flex items-center gap-2"><Send className="w-4 h-4 text-brand-500" /><h2 className="text-slate-900">New announcement</h2></div>
        {clans.length === 0 ? (
          <p className="text-sm text-slate-500">You don&apos;t lead a clan yet. Once you do, you can post announcements to its mentees here.</p>
        ) : (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={field} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What do your mentees need to know?" className={`${field} resize-none`} />
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-600">To clan</label>
              <select value={clanId} onChange={(e) => setClanId(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500">
                {clans.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={post} disabled={posting} className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}Post
              </button>
            </div>
          </>
        )}
      </div>

      <AnnouncementFeed
        announcements={announcements}
        loading={loading}
        error={error}
        onRefresh={refetch}
        emptyHint="No announcements yet."
      />
    </div>
  );
}
