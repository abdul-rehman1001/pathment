'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Video, VideoOff, Loader2, Check, Circle, Trophy } from 'lucide-react';
import { mentorApi } from '@/lib/services/mentor-api';
import { JitsiRoom, type JitsiParticipant } from '@/components/shared/JitsiRoom';

interface RosterRow { menteeId: string; name: string; attendance: string | null; autoPresent: boolean; talkSeconds: number; contributionPoints: number }
interface ScoreRow { menteeId: string; name: string; talkSeconds: number; proposed: boolean; alreadyAwarded: boolean }
interface Meeting { sessionId: string; domain: string; room: string; url: string; displayName: string | null; avatarUrl: string | null; externalUrl: string | null; startedAt: string | null; endedAt: string | null }

/**
 * Host (mentor) side of the live cohort review. Starts the Jitsi room, embeds
 * it, shows a live roster, tracks dominant-speaker time as a contribution
 * signal, and on "End & score" awards the contribution point to the confirmed
 * speakers. The mentor's page is the source of truth for attendance + talk time.
 */
export function ReviewMeetingPanel({ sessionId, isDraft, ensureSession }: {
  sessionId: string;
  isDraft?: boolean;
  /** Creates today's session on demand, so "Start meeting" works from a blank page. */
  ensureSession?: () => Promise<{ id: string } | null>;
}) {
  // The session id can arrive late (created by Start), so track it locally.
  const [liveSessionId, setLiveSessionId] = useState(sessionId);
  useEffect(() => { if (sessionId) setLiveSessionId(sessionId); }, [sessionId]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<ScoreRow[] | null>(null);
  // Once scored, the session is done — don't invite the mentor to reopen it.
  const [scored, setScored] = useState(false);

  // Talk-time tracking (host-observed). id → seconds, id → displayName.
  const talkById = useRef<Map<string, number>>(new Map());
  const nameById = useRef<Map<string, string>>(new Map());
  const speakingId = useRef<string | null>(null);
  const speakingSince = useRef<number>(0);

  const refresh = useCallback(async () => {
    try {
      const res = await mentorApi.getReviewMeeting(liveSessionId) as { data?: { meeting: Meeting; roster: RosterRow[]; live: boolean } };
      setMeeting(res?.data?.meeting ?? null);
      setRoster(res?.data?.roster ?? []);
      setLive(!!res?.data?.live);
    } catch { /* keep last */ }
    finally { setLoading(false); }
  }, [liveSessionId]);

  useEffect(() => { if (liveSessionId) refresh(); else setLoading(false); }, [refresh, liveSessionId]);
  // While live, refresh the roster so self-reported joins appear.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [live, refresh]);

  // Map a Jitsi participant name → a roster menteeId (best-effort, by name).
  const menteeIdForName = useCallback((name?: string) => {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return roster.find((r) => r.name.trim().toLowerCase() === n)?.menteeId ?? null;
  }, [roster]);

  const flushTalk = useCallback(async () => {
    // Close the current speaking span.
    if (speakingId.current) {
      const add = Math.round((Date.now() - speakingSince.current) / 1000);
      talkById.current.set(speakingId.current, (talkById.current.get(speakingId.current) || 0) + Math.max(0, add));
      speakingSince.current = Date.now();
    }
    const items: { menteeId: string; seconds: number }[] = [];
    for (const [id, secs] of talkById.current.entries()) {
      const menteeId = menteeIdForName(nameById.current.get(id));
      if (menteeId) items.push({ menteeId, seconds: secs });
    }
    if (items.length) { try { await mentorApi.recordReviewTalkTime(liveSessionId, items); } catch { /* retry next flush */ } }
  }, [liveSessionId, menteeIdForName]);

  // Periodically flush talk time while live.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(flushTalk, 20_000);
    return () => clearInterval(t);
  }, [live, flushTalk]);

  // Start works from a blank page: if today's session doesn't exist yet we
  // create it first, so the mentor never has to "mark someone" to unlock video.
  const start = async () => {
    setBusy(true);
    try {
      let id = liveSessionId;
      if (!id && ensureSession) {
        const created = await ensureSession();
        if (!created?.id) throw new Error('no session');
        id = created.id;
        setLiveSessionId(id);
      }
      if (!id) throw new Error('no session');
      await mentorApi.startReviewMeeting(id);
      setScored(false);
      await refresh();
      toast.success('Meeting started — mentees can join now');
    } catch { toast.error('Could not start the meeting'); }
    finally { setBusy(false); }
  };

  const endAndScore = async () => {
    setBusy(true);
    try {
      await flushTalk();
      await mentorApi.endReviewMeeting(liveSessionId);
      const res = await mentorApi.proposeReviewContribution(liveSessionId) as { data?: { proposed: ScoreRow[] } };
      setLive(false);
      setScoring(res?.data?.proposed ?? []);
      await refresh();
    } catch { toast.error('Could not end the meeting'); }
    finally { setBusy(false); }
  };

  const onDominant = (id: string) => {
    if (speakingId.current && speakingId.current !== id) {
      const add = Math.round((Date.now() - speakingSince.current) / 1000);
      talkById.current.set(speakingId.current, (talkById.current.get(speakingId.current) || 0) + Math.max(0, add));
    }
    speakingId.current = id;
    speakingSince.current = Date.now();
  };
  const onParticipant = (p: JitsiParticipant) => { if (p.displayName) nameById.current.set(p.id, p.displayName); };

  const togglePresent = async (r: RosterRow) => {
    const present = r.attendance !== 'present';
    setRoster((prev) => prev.map((x) => (x.menteeId === r.menteeId ? { ...x, attendance: present ? 'present' : 'absent' } : x)));
    try { await mentorApi.markReviewPresent(liveSessionId, r.menteeId, present); } catch { toast.error('Could not update attendance'); refresh(); }
  };

  if (loading) return <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand-600" /></div>;

  const presentCount = roster.filter((r) => r.attendance === 'present').length;

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-slate-900 flex items-center gap-1.5"><Video className="w-4 h-4 text-brand-600" /> Live review</h3>
        {!live ? (
          scored ? (
            // Scored = this review is done. Offer a quiet restart, not a primary
            // "Resume" that implies unfinished business.
            <button onClick={start} disabled={busy} className="text-xs font-medium text-slate-500 hover:text-brand-700 disabled:opacity-50">
              {busy ? 'Starting…' : 'Start a new call'}
            </button>
          ) : (
            <button onClick={start} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />} {meeting?.startedAt ? 'Resume meeting' : 'Start meeting'}
            </button>
          )
        ) : (
          <button onClick={endAndScore} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VideoOff className="w-3.5 h-3.5" />} End &amp; score
          </button>
        )}
      </div>

      {live && meeting && (
        <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
          <div className="h-[440px]">
            <JitsiRoom
              domain={meeting.domain} room={meeting.room} displayName={meeting.displayName} avatarUrl={meeting.avatarUrl}
              onParticipantJoined={onParticipant} onDominantSpeaker={onDominant}
              onError={(m) => toast.error(m)}
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 mb-2">{presentCount}/{roster.length} present</p>
            <div className="space-y-1 max-h-[420px] overflow-y-auto">
              {roster.map((r) => (
                <button key={r.menteeId} onClick={() => togglePresent(r)} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  {r.attendance === 'present'
                    ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    : <Circle className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
                  <span className="text-sm text-slate-700 truncate flex-1">{r.name}</span>
                  {r.talkSeconds > 0 && <span className="text-[11px] text-slate-400 tabular-nums">{Math.round(r.talkSeconds / 60) || 1}m</span>}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Auto-marks anyone who joins from Pathment. Click a name to mark a direct joiner present.</p>
          </div>
        </div>
      )}

      {!live && meeting?.startedAt && (
        <p className="text-xs text-slate-500">
          {scored
            ? `Review complete · ${presentCount}/${roster.length} attended · points awarded.`
            : `Meeting ended · ${presentCount}/${roster.length} attended. Reopen with “Resume” if needed.`}
        </p>
      )}
      {!live && !meeting?.startedAt && (
        <p className="text-xs text-slate-500">Start the call and your mentees get a “Join review” banner — anyone who joins is marked present automatically.</p>
      )}

      {scoring && <ContributionModal proposed={scoring} sessionId={liveSessionId} onClose={() => { setScoring(null); setScored(true); }} onDone={() => { setScoring(null); setScored(true); refresh(); }} />}
    </div>
  );
}

// ── contribution scoring modal ───────────────────────────────────────────────
function ContributionModal({ proposed, sessionId, onClose, onDone }: {
  proposed: ScoreRow[];
  sessionId: string; onClose: () => void; onDone: () => void;
}) {
  // Pre-check the speakers; the mentor can add anyone else who contributed.
  const [picked, setPicked] = useState<Set<string>>(new Set(proposed.filter((p) => p.proposed && !p.alreadyAwarded).map((p) => p.menteeId)));
  const [busy, setBusy] = useState(false);

  const award = async () => {
    setBusy(true);
    try {
      const res = await mentorApi.finalizeReviewContribution(sessionId, [...picked]) as { data?: { awarded: number } };
      toast.success(`Awarded a contribution point to ${res?.data?.awarded ?? 0} mentee(s)`);
      onDone();
    } catch { toast.error('Could not award points'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-slate-900 flex items-center gap-1.5"><Trophy className="w-5 h-5 text-amber-500" /> Contribution points</h3>
        <p className="mt-1 text-sm text-slate-500">Award a point to whoever contributed. Speakers are pre-checked — tick anyone who helped in chat too.</p>
        <div className="mt-3 space-y-1 max-h-64 overflow-y-auto">
          {proposed.length === 0 && <p className="text-sm text-slate-400">Nobody attended this session.</p>}
          {proposed.map((p) => (
            <label key={p.menteeId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${p.alreadyAwarded ? 'opacity-50' : 'hover:bg-slate-50 cursor-pointer'}`}>
              <input
                type="checkbox"
                disabled={p.alreadyAwarded}
                checked={p.alreadyAwarded || picked.has(p.menteeId)}
                onChange={(e) => setPicked((s) => { const n = new Set(s); e.target.checked ? n.add(p.menteeId) : n.delete(p.menteeId); return n; })}
              />
              <span className="text-sm text-slate-700 flex-1">{p.name}</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {p.alreadyAwarded ? 'already awarded' : p.talkSeconds > 0 ? `spoke ${Math.round(p.talkSeconds / 60) || 1}m` : 'no speaking time'}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700">Skip</button>
          <button onClick={award} disabled={busy || picked.size === 0} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} Award {picked.size}
          </button>
        </div>
      </div>
    </div>
  );
}
