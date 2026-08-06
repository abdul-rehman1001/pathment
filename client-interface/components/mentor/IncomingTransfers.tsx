'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowRightLeft, Check, Loader2, Send, X, Clock } from 'lucide-react';

import { Drawer } from '@/components/shared/Drawer';
import { Avatar } from '@/components/shared/Avatar';
import { mentorApi, type TransferRequest } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * IncomingTransfers — the receiving side of a mentee move, on Clan Team.
 *
 * Another mentor has asked one of your clans to take a mentee. Deciding needs
 * three things and no more: WHO the mentee is, WHO is asking, and WHY. Accept
 * moves them for real (same code path as an admin reassignment); declining
 * requires a reason, because the mentor on the other side is waiting on an
 * answer they can act on.
 *
 * The "Review request" notification deep-links here with `?transfer=<id>`, which
 * opens that request's drawer directly.
 */
export function IncomingTransfers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<TransferRequest | null>(null);
  const deepLinkId = searchParams.get('transfer');

  const load = useCallback(async () => {
    try {
      const r = await mentorApi.transfers.incoming();
      setRows(r.data?.requests ?? []);
    } catch { /* transient — keep whatever we last showed */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Deep link from the notification: open that request, then strip the param so
  // a refresh doesn't reopen a drawer the mentor already dealt with.
  useEffect(() => {
    if (!deepLinkId || !rows.length) return;
    const match = rows.find((r) => r.id === deepLinkId);
    if (match) setActive(match);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete('transfer');
    router.replace(`/mentor/clan-team${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }, [deepLinkId, rows, router, searchParams]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-brand-200 bg-brand-50/50 dark:bg-brand-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ArrowRightLeft className="w-4 h-4 text-brand-600" />
        <h2 className="text-sm font-semibold text-slate-900">
          Mentees waiting to join your clan
          <span className="ml-2 rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">{rows.length}</span>
        </h2>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-card px-3.5 py-3">
            <Avatar name={r.mentee?.name} src={r.mentee?.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900 truncate">{r.mentee?.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {r.requester?.name} wants to move them from {r.fromClan?.name || 'their clan'} to {r.toClan?.name}
              </p>
              {r.reason && <p className="mt-1 text-xs text-slate-600 line-clamp-2">“{r.reason}”</p>}
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
              <Clock className="w-3 h-3" /> {when(r.createdAt)}
            </span>
            <button
              onClick={() => setActive(r)}
              className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Review
            </button>
          </div>
        ))}
      </div>

      {active && (
        <RespondDrawer
          request={active}
          onClose={() => setActive(null)}
          onDone={() => { setActive(null); load(); }}
        />
      )}
    </div>
  );
}

function RespondDrawer({ request, onClose, onDone }: {
  request: TransferRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  // Declining without a reason leaves the other mentor guessing, so the server
  // requires one; the UI says so up front rather than failing on submit.
  const canDecline = note.trim().length > 0;

  const respond = async (accept: boolean) => {
    setBusy(accept ? 'accept' : 'decline');
    try {
      await mentorApi.transfers.respond(request.id, accept, note.trim() || undefined);
      toast.success(accept
        ? `${request.mentee?.name} is now in ${request.toClan?.name}`
        : 'Request declined — the other mentor has been told why');
      onDone();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not save your decision'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title="Take this mentee?"
      subtitle={`Into ${request.toClan?.name || 'your clan'}`}
      footer={
        <div className="flex gap-2 w-full justify-end">
          <button
            onClick={() => respond(false)}
            disabled={!!busy || !canDecline}
            title={canDecline ? undefined : 'Add a reason so the other mentor knows why'}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy === 'decline' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Decline
          </button>
          <button
            onClick={() => respond(true)}
            disabled={!!busy}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {busy === 'accept' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Accept &amp; move
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
          <Avatar name={request.mentee?.name} src={request.mentee?.avatarUrl} size="lg" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{request.mentee?.name}</p>
            {request.mentee?.email && <p className="text-xs text-slate-500 truncate">{request.mentee.email}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {request.fromClan?.name || 'Their clan'} <span className="text-slate-300">→</span>{' '}
              <span className="font-medium text-brand-700">{request.toClan?.name}</span>
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Avatar name={request.requester?.name} src={request.requester?.avatarUrl} size="sm" />
            <p className="text-sm text-slate-700"><span className="font-medium">{request.requester?.name}</span> asked</p>
            <span className="ml-auto text-[11px] text-slate-400">{when(request.createdAt)}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {request.reason ? `“${request.reason}”` : <span className="text-slate-400">No reason given.</span>}
          </p>
        </div>

        <div>
          <label htmlFor="transfer-note" className="block text-sm font-medium text-slate-700 mb-1.5">
            Your reply <span className="font-normal text-slate-400">Required to decline</span>
          </label>
          <textarea
            id="transfer-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. Happy to take them — send over any context on their current roadmap."
            className="w-full rounded-xl border border-slate-200 bg-card px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>

        <p className="text-xs text-slate-500">
          Accepting moves {request.mentee?.name?.split(' ')[0] || 'them'} into your clan right away and tells them
          and {request.requester?.name?.split(' ')[0] || 'the other mentor'}. Their progress comes with them
          — unless the two clans run different programs, in which case they start that program fresh.
        </p>
      </div>
    </Drawer>
  );
}

/**
 * OutgoingTransfers — the asking side: what you've sent and where it stands.
 * Only renders while something is in flight or was recently decided, so a mentor
 * who never uses transfers never sees it.
 */
export function OutgoingTransfers() {
  const [rows, setRows] = useState<TransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await mentorApi.transfers.outgoing();
      // Pending always; decided ones only for a week, then they're just history.
      const weekAgo = Date.now() - 7 * 86_400_000;
      setRows((r.data?.requests ?? []).filter((x) =>
        x.status === 'pending' || (x.resolvedAt ? new Date(x.resolvedAt).getTime() > weekAgo : false)));
    } catch { /* transient */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancel = async (id: string) => {
    setBusy(id);
    try {
      await mentorApi.transfers.cancel(id);
      toast.success('Request withdrawn');
      load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not withdraw the request'));
    } finally { setBusy(null); }
  };

  if (loading || rows.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Send className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Move requests you sent</h2>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5">
            <Avatar name={r.mentee?.name} src={r.mentee?.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800 truncate">
                <span className="font-medium">{r.mentee?.name}</span> → {r.toClan?.name}
              </p>
              {r.status !== 'pending' && r.resolutionNote && (
                <p className="text-xs text-slate-500 truncate">
                  {r.resolver?.name || 'They'} said: “{r.resolutionNote}”
                </p>
              )}
            </div>
            <StatusPill status={r.status} />
            {r.status === 'pending' && (
              <button
                onClick={() => cancel(r.id)}
                disabled={busy === r.id}
                className="shrink-0 text-xs font-medium text-slate-500 hover:text-red-600 disabled:opacity-50"
              >
                Withdraw
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TransferRequest['status'] }) {
  const map: Record<TransferRequest['status'], { label: string; cls: string }> = {
    pending: { label: 'Waiting', cls: 'bg-amber-50 text-amber-700' },
    approved: { label: 'Accepted', cls: 'bg-emerald-50 text-emerald-700' },
    denied: { label: 'Declined', cls: 'bg-red-50 text-red-700' },
    cancelled: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-500' },
  };
  const s = map[status];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
}
