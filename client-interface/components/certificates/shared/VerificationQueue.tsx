'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Award, Check, CheckCircle2, Clock, Loader2, Send, Undo2 } from 'lucide-react';
import { certificatesApi, type CertificateVerification, type ReviewerClanState } from '@/lib/services/certificates-api';
import { Avatar } from '@/components/shared/Avatar';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';

interface VerificationQueueProps {
  templateId: string;
  /** Narrow to one clan. Mentors are already clan-scoped server-side. */
  clanId?: string;
  onChanged?: () => void;
}

type TierOption = { id: string; name: string };

/**
 * The mentor's sign-off on AI-assigned certificate grades.
 *
 * The AI grades from the record — points, completion, on-time rate, blockers,
 * attendance. It cannot know that somebody carried the clan through a bad month
 * or that a strong score came from work the mentor had already questioned. So
 * the person who actually knows the mentee confirms the grade, or changes it,
 * before anything is issued.
 *
 * The screen is built around the fact that most grades are right: confirming is
 * one click for the whole clan, and changing one is the deliberate action that
 * asks for a reason. Optimising for the exception would make the common case
 * tedious and the whole round get rubber-stamped.
 */
export function VerificationQueue({ templateId, clanId, onChanged }: VerificationQueueProps) {
  const [rows, setRows] = useState<CertificateVerification[]>([]);
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [deadline, setDeadline] = useState<string | null>(null);
  const [clans, setClans] = useState<ReviewerClanState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyMenteeId, setBusyMenteeId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  /** Drafts for grades the mentor is changing but has not submitted yet. */
  const [drafts, setDrafts] = useState<Record<string, { tier: string; reason: string }>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await certificatesApi.listVerifications(templateId, clanId);
      if (res.success && res.data) {
        setRows(res.data.rows || []);
        setDeadline(res.data.template?.verificationDeadline ?? null);
        setClans(res.data.clans || []);
        setTiers((res.data.template?.criteria || []).map((c) => ({ id: c.id, name: c.name })));
      }
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not load the grades to review'));
    } finally {
      setLoading(false);
    }
  }, [templateId, clanId]);

  useEffect(() => { load(); }, [load]);

  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows]);
  const verified = useMemo(() => rows.filter((r) => r.status === 'verified'), [rows]);
  const tierName = useCallback(
    (id: string | null) => tiers.find((t) => t.id === id)?.name || id || '—',
    [tiers]
  );

  const daysLeft = useMemo(() => {
    if (!deadline) return null;
    return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  }, [deadline]);

  /** Submit one decision. `tier`/`reason` omitted means "the AI had it right". */
  const submit = async (menteeId: string, tier?: string, reason?: string) => {
    try {
      setBusyMenteeId(menteeId);
      await certificatesApi.verifyOne(templateId, menteeId, { finalTier: tier, reason });
      setDrafts((d) => { const next = { ...d }; delete next[menteeId]; return next; });
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not save that decision'));
    } finally {
      setBusyMenteeId(null);
    }
  };

  /** Accept every outstanding AI grade at once — the common case. */
  const confirmAllRemaining = async () => {
    // Anything the mentor has started changing is left alone: a half-written
    // override must not be swept away by a bulk confirm.
    const untouched = pending.filter((r) => !drafts[r.menteeId]);
    if (!untouched.length) {
      toast.info('Every remaining grade has a change in progress.');
      return;
    }
    try {
      setConfirmingAll(true);
      await certificatesApi.verifyMany(templateId, untouched.map((r) => ({ menteeId: r.menteeId })));
      toast.success(`Confirmed ${untouched.length} grade${untouched.length === 1 ? '' : 's'}`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not confirm those grades'));
    } finally {
      setConfirmingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <Award className="w-10 h-10 text-brand-300 mx-auto mb-3" />
        <p className="text-sm font-bold text-foreground">Nothing to review</p>
        <p className="text-xs text-muted-foreground mt-1">
          Grades appear here once an admin has run the AI evaluation for this certificate.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Where each clan stands, and whether sending is unlocked ──────── */}
      {clans.map((clan) => (
        <ClanStateNotice key={clan.clanId} clan={clan} templateId={templateId} onSent={load} />
      ))}

      {/* ── What is outstanding, and by when ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="font-bold text-foreground">
            {pending.length} to review
          </span>
          <span className="text-muted-foreground">{verified.length} done</span>
          {daysLeft !== null && (
            <span className={`inline-flex items-center gap-1.5 font-semibold ${
              daysLeft < 0 ? 'text-red-600' : daysLeft <= 2 ? 'text-amber-600' : 'text-muted-foreground'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              {daysLeft < 0
                ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`
                : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
            </span>
          )}
        </div>

        {pending.length > 0 && (
          <button
            type="button"
            onClick={confirmAllRemaining}
            disabled={confirmingAll}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {confirmingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Confirm all remaining
          </button>
        )}
      </div>

      {/* ── Still to decide ──────────────────────────────────────────────── */}
      {pending.map((row) => (
        <PendingRow
          key={row.menteeId}
          row={row}
          tiers={tiers}
          tierName={tierName}
          busy={busyMenteeId === row.menteeId}
          draft={drafts[row.menteeId]}
          onDraft={(draft) => setDrafts((d) => ({ ...d, [row.menteeId]: draft }))}
          onClearDraft={() => setDrafts((d) => { const next = { ...d }; delete next[row.menteeId]; return next; })}
          onConfirm={() => submit(row.menteeId)}
          onOverride={(tier, reason) => submit(row.menteeId, tier, reason)}
        />
      ))}

      {/* ── Already decided ──────────────────────────────────────────────── */}
      {verified.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Signed off</p>
          {verified.map((row) => (
            <VerifiedRow key={row.menteeId} row={row} tierName={tierName} />
          ))}
        </div>
      )}
    </div>
  );
}


/**
 * Where a clan stands, in the mentor's own terms.
 *
 * A mentor who has finished reviewing and sees no send button will assume
 * something is broken. It is not — the admin releases each clan once the grades
 * are checked, and the mentor sends after that. Saying so is the whole job of
 * this strip.
 */
function ClanStateNotice({
  clan, templateId, onSent,
}: {
  clan: ReviewerClanState;
  templateId: string;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);

  const sendToClan = async () => {
    try {
      setSending(true);
      // Re-read the queue rather than trusting what is on screen: the roster
      // may be minutes old, and the server skips anyone already sent anyway, so
      // pressing this twice is harmless.
      const queue = await certificatesApi.listVerifications(templateId, clan.clanId);
      const recipients = (queue.data?.rows || [])
        .filter((row) => row.status === 'verified' && row.finalTier)
        .map((row) => ({ menteeId: row.menteeId, tier: row.finalTier as string }));

      if (!recipients.length) {
        toast.info('No verified grades to send yet.');
        return;
      }
      const issued = await certificatesApi.issueCertificates({ templateId, recipients });
      toast.success(issued.message || `Sent ${recipients.length} certificate(s)`);
      onSent();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not send those certificates'));
    } finally {
      setSending(false);
    }
  };

  if (!clan.approved) {
    const done = clan.pending === 0;
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 ${
        done ? 'border-brand-500/30 bg-brand-500/5' : 'border-border bg-card'
      }`}>
        <Clock className={`h-4 w-4 shrink-0 ${done ? 'text-brand-500' : 'text-muted-foreground'}`} />
        <span className="text-xs font-bold text-foreground">
          {clan.clanName || 'Your clan'}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {done
            ? 'All grades signed off — waiting for an admin to approve release. You can send once they do.'
            : `${clan.pending} grade${clan.pending === 1 ? '' : 's'} still to review. Sending unlocks after an admin approves.`}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        <span className="text-xs font-bold text-foreground">{clan.clanName || 'Your clan'} is approved</span>
        <span className="text-[11px] text-muted-foreground">You can send these certificates now.</span>
      </span>
      <button
        type="button"
        onClick={sendToClan}
        disabled={sending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        Send certificates
      </button>
    </div>
  );
}

// ── One mentee still awaiting a decision ─────────────────────────────────────

function PendingRow({
  row, tiers, tierName, busy, draft, onDraft, onClearDraft, onConfirm, onOverride,
}: {
  row: CertificateVerification;
  tiers: TierOption[];
  tierName: (id: string | null) => string;
  busy: boolean;
  draft?: { tier: string; reason: string };
  onDraft: (draft: { tier: string; reason: string }) => void;
  onClearDraft: () => void;
  onConfirm: () => void;
  onOverride: (tier: string, reason: string) => void;
}) {
  const name = row.mentee
    ? `${row.mentee.firstName || ''} ${row.mentee.lastName || ''}`.trim() || row.mentee.email
    : 'Unknown mentee';
  const isChanging = Boolean(draft);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar src={row.mentee?.profilePictureUrl} name={name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground truncate">{name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{row.mentee?.email}</p>
        </div>

        {/* What the AI proposed, and how confident it was. */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/20 bg-brand-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
            <Award className="w-3.5 h-3.5" /> {tierName(row.aiTier)}
          </span>
          {row.aiMatchScore != null && (
            <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
              {Math.round(row.aiMatchScore)}% match
            </span>
          )}
        </div>
      </div>

      {isChanging ? (
        <OverrideForm
          tiers={tiers}
          aiTier={row.aiTier}
          draft={draft!}
          busy={busy}
          onDraft={onDraft}
          onCancel={onClearDraft}
          onSubmit={() => onOverride(draft!.tier, draft!.reason)}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Looks right
          </button>
          <button
            type="button"
            onClick={() => onDraft({ tier: row.aiTier || tiers[0]?.id || '', reason: '' })}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:border-brand-500/40 disabled:opacity-50"
          >
            <Undo2 className="w-3.5 h-3.5" /> Change grade
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Changing a grade. The reason is required because an admin looking at this in
 * a month — and the mentor themselves — need to know why the evidence was
 * overruled. The server enforces it too; this just asks for it well.
 */
function OverrideForm({
  tiers, aiTier, draft, busy, onDraft, onCancel, onSubmit,
}: {
  tiers: TierOption[];
  aiTier: string | null;
  draft: { tier: string; reason: string };
  busy: boolean;
  onDraft: (draft: { tier: string; reason: string }) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const changed = draft.tier !== aiTier;
  const canSubmit = !busy && (!changed || draft.reason.trim().length > 0);

  return (
    <div className="space-y-2.5 rounded-xl border border-brand-500/30 bg-brand-500/5 p-3">
      <div className="flex flex-wrap gap-1.5">
        {tiers.map((tier) => (
          <button
            key={tier.id}
            type="button"
            onClick={() => onDraft({ ...draft, tier: tier.id })}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${
              draft.tier === tier.id
                ? 'border-brand-500 bg-brand-500/15 text-brand-700 dark:text-brand-400'
                : 'border-border bg-background text-muted-foreground hover:text-foreground'
            }`}
          >
            {tier.name}
          </button>
        ))}
      </div>

      {changed && (
        <textarea
          rows={2}
          autoFocus
          value={draft.reason}
          onChange={(e) => onDraft({ ...draft, reason: e.target.value })}
          placeholder="Why does this grade need changing? e.g. mentored two juniors all season"
          className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {changed ? 'Save change' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        {changed && !draft.reason.trim() && (
          <span className="text-[10px] font-semibold text-amber-600">A reason is needed to change a grade.</span>
        )}
      </div>
    </div>
  );
}

// ── One mentee already signed off ────────────────────────────────────────────

function VerifiedRow({
  row, tierName,
}: {
  row: CertificateVerification;
  tierName: (id: string | null) => string;
}) {
  const name = row.mentee
    ? `${row.mentee.firstName || ''} ${row.mentee.lastName || ''}`.trim() || row.mentee.email
    : 'Unknown mentee';

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      <span className="text-xs font-bold text-foreground min-w-0 flex-1 truncate">{name}</span>

      {/* An override shows the journey, not just the destination — what the AI
          said, what it became, and why. That is the record an admin reviews. */}
      {row.overridden ? (
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="text-muted-foreground line-through">{tierName(row.aiTier)}</span>
          <ArrowRight className="w-3 h-3 text-amber-500" />
          <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 uppercase tracking-wider text-amber-600">
            {tierName(row.finalTier)}
          </span>
          {row.overrideReason && (
            <span className="font-normal normal-case text-muted-foreground max-w-[22rem] truncate" title={row.overrideReason}>
              — {row.overrideReason}
            </span>
          )}
        </span>
      ) : (
        <span className="rounded-full border border-brand-500/20 bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600">
          {tierName(row.finalTier)}
        </span>
      )}

      {row.verifiedBy && (
        <span className="text-[10px] text-muted-foreground shrink-0">by {row.verifiedBy}</span>
      )}
    </div>
  );
}

/**
 * The admin's view of the round: who has signed off, who has not, what changed.
 *
 * Deliberately never blocks issuing. The admin is told the state and decides —
 * a gate here would strand a cohort behind one mentor who is on leave, which is
 * a worse failure than issuing a grade nobody contested.
 */
export function VerificationBanner({
  templateId, refreshKey, onIssueAnyway,
}: {
  templateId: string;
  refreshKey?: number;
  onIssueAnyway?: () => void;
}) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof certificatesApi.getVerificationSummary>>['data'] | null>(null);
  const [reminding, setReminding] = useState(false);
  const [approvingClanId, setApprovingClanId] = useState<string | null>(null);
  const confirm = useConfirm();

  const reload = useCallback(async () => {
    const res = await certificatesApi.getVerificationSummary(templateId);
    if (res.success) setSummary(res.data);
  }, [templateId]);

  /**
   * Release a clan. `verified` is false when the admin is approving before the
   * mentors have finished — permitted, but worth confirming so it is a choice
   * rather than a misread of the row.
   */
  const approve = async (clanId: string, verified: boolean) => {
    if (!verified) {
      const ok = await confirm({
        title: 'Approve before the review is finished?',
        description: 'This clan\'s mentors have not signed off every grade yet. Approving now lets them send the certificates as they stand.',
        confirmLabel: 'Approve anyway',
      });
      if (!ok) return;
    }
    try {
      setApprovingClanId(clanId);
      const res = await certificatesApi.approveClan(templateId, clanId);
      toast.success(res.message || 'Clan approved');
      await reload();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not approve that clan'));
    } finally {
      setApprovingClanId(null);
    }
  };

  useEffect(() => {
    let alive = true;
    certificatesApi.getVerificationSummary(templateId)
      .then((res) => { if (alive && res.success) setSummary(res.data); })
      .catch(() => { /* the banner is advisory; its absence must not break the page */ });
    return () => { alive = false; };
  }, [templateId, refreshKey]);

  if (!summary || summary.total === 0) return null;

  const remind = async () => {
    try {
      setReminding(true);
      const res = await certificatesApi.remindReviewers(templateId);
      toast.success(res.message || 'Mentors reminded');
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not send the reminder'));
    } finally {
      setReminding(false);
    }
  };

  const outstanding = summary.clans.filter((c) => !c.complete);
  // Everything checked AND everything released is the only truly finished
  // state. "All verified" on its own still needs the admin to act, so it must
  // not look like a green light — that is what hid the approve buttons at
  // exactly the moment they were wanted.
  const settled = summary.allVerified && summary.awaitingApproval === 0;

  return (
    <div className={`space-y-2 rounded-2xl border px-4 py-3 ${
      settled ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
    }`}>
      <div className="flex flex-wrap items-center gap-2">
        {settled
          ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
          : <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />}
        <span className="text-xs font-bold text-foreground">
          {settled
            ? `All ${summary.total} grades verified and approved`
            : summary.awaitingApproval > 0 && outstanding.length === 0
              ? `${summary.awaitingApproval} clan${summary.awaitingApproval === 1 ? '' : 's'} verified — approve to let mentors send`
              : `${outstanding.length} of ${summary.clans.length} clan${summary.clans.length === 1 ? '' : 's'} have not verified yet`}
        </span>
        <span className="text-[11px] text-muted-foreground">
          · {summary.verified} of {summary.total} grades signed off
          {summary.overridden > 0 && ` · ${summary.overridden} changed`}
        </span>
        {summary.overdue && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
            Overdue
          </span>
        )}
      </div>

      <ul className="space-y-1 pl-6">
        {summary.clans.map((clan) => (
          <li key={clan.clanId || clan.clanName} className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold text-foreground">{clan.clanName}</span>
            <span className="text-muted-foreground">
              {clan.complete
                ? `all ${clan.total} signed off`
                : `${clan.pending} of ${clan.total} outstanding`}
              {clan.overridden > 0 && ` · ${clan.overridden} changed`}
            </span>

            {/* Approving is what lets that clan's mentors send. Offered the
                moment a clan is signed off, and still offered — labelled
                differently — while it is not, because an admin is never
                blocked, only informed. */}
            {clan.clanId && !clan.approved && (
              <button
                type="button"
                onClick={() => approve(clan.clanId!, clan.complete)}
                disabled={approvingClanId === clan.clanId}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                  clan.readyToApprove
                    ? 'border-brand-500/40 bg-brand-500/10 text-brand-700 hover:bg-brand-500/20'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                {approvingClanId === clan.clanId
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <CheckCircle2 className="h-2.5 w-2.5" />}
                {clan.readyToApprove ? 'Approve & unlock sending' : 'Approve early'}
              </button>
            )}
            {clan.approved && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                <CheckCircle2 className="h-2.5 w-2.5" /> Approved
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 pl-6">
        <button
          type="button"
          onClick={remind}
          disabled={reminding}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-foreground hover:border-brand-500/40 disabled:opacity-50"
        >
          {reminding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
          Remind mentors
        </button>
        {onIssueAnyway && (
          <button
            type="button"
            onClick={onIssueAnyway}
            className="rounded-xl border border-border bg-card px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
          >
            Issue anyway
          </button>
        )}
      </div>
    </div>
  );
}
