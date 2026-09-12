'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, Lock, LogIn, UserPlus, Users } from 'lucide-react';

import { usePublicClanJoinPage } from '@/lib/hooks/mentee';
import { formatDateTime } from '@/lib/utils/datetime';

/** Local date + time without a timezone suffix (viewer is already in this zone). */
function formatWhen(value?: string | null) {
  if (!value) return null;
  return formatDateTime(value, { timeZoneName: undefined });
}

export default function ClanJoinPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const {
    info,
    loading,
    unavailable,
    submitting,
    submitted,
    message,
    setMessage,
    loginHref,
    registerHref,
    continueHref,
    submitRequest,
  } = usePublicClanJoinPage(token);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (unavailable || !info) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
          <Lock className="h-8 w-8 text-slate-500" strokeWidth={1.75} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-slate-900">Joining unavailable</h1>
        <p className="mt-2 text-sm text-slate-500">
          This clan joining link is invalid or no longer available.
        </p>
        <Link href="/programs" className="mt-6 inline-flex text-sm font-medium text-brand-700 hover:text-brand-800">
          Browse programs
        </Link>
      </div>
    );
  }

  const status = info.viewerStatus;
  const linkOpen = info.joining.open !== false;
  const windowStatus = info.joining.windowStatus;
  const opens = formatWhen(info.joining.startsAt);
  const closes = formatWhen(info.joining.endsAt);
  const seats =
    typeof info.clan.seatsRemaining === 'number' ? info.clan.seatsRemaining : null;

  const viewerResolved =
    status === 'approved'
    || status === 'already_member'
    || status === 'mentor_of_clan'
    || status === 'pending'
    || submitted
    || status === 'member_elsewhere';

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-card p-8 shadow-sm space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Join a clan</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">{info.clan.name}</h1>
          {info.program?.name ? (
            <p className="text-sm text-slate-500 mt-1">{info.program.name}</p>
          ) : null}
        </div>

        {status === 'approved' ? (
          <div className="space-y-4">
            <StatusBlock
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              title="Request accepted"
              body="Your join request was approved. You’re now a mentee of this clan."
            />
            <Link
              href={continueHref}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              <LogIn className="w-4 h-4" />
              {continueHref.startsWith('/login') ? 'Log in to continue' : 'Go to dashboard'}
            </Link>
          </div>
        ) : null}

        {status === 'already_member' || status === 'mentor_of_clan' ? (
          <div className="space-y-4">
            <StatusBlock
              icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              title="You’re already in this clan"
              body={status === 'mentor_of_clan'
                ? 'You already have a mentor role here.'
                : 'No further action is needed.'}
            />
            {status === 'already_member' ? (
              <Link
                href={continueHref}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                <LogIn className="w-4 h-4" />
                {continueHref.startsWith('/login') ? 'Log in to continue' : 'Go to dashboard'}
              </Link>
            ) : null}
          </div>
        ) : null}

        {status === 'pending' || (submitted && status !== 'approved' && status !== 'already_member') ? (
          <StatusBlock
            icon={<CheckCircle2 className="w-5 h-5 text-brand-600" />}
            title="Request pending"
            body="The Clan Lead Mentor will review it and notify you."
          />
        ) : null}

        {status === 'member_elsewhere' ? (
          <StatusBlock
            icon={<Lock className="w-5 h-5 text-amber-600" />}
            title="You’re already in another clan"
            body="Ask an administrator about a transfer if you need to switch."
          />
        ) : null}

        {!viewerResolved && !linkOpen ? (
          <ClosedState
            windowStatus={windowStatus}
            opens={opens}
            closes={closes}
            seats={seats}
          />
        ) : null}

        {!viewerResolved && linkOpen ? (
          <>
            <div className="space-y-1">
              <p className="text-sm text-slate-600">
                Request to join. The Clan Lead Mentor must approve before you’re added.
              </p>
              {closes ? (
                <p className="text-xs text-slate-500">Closes {closes}</p>
              ) : null}
            </div>

            {seats != null ? (
              <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {seats} seat{seats === 1 ? '' : 's'} remaining
              </p>
            ) : null}

            {status === 'anonymous' ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  href={loginHref}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  <LogIn className="w-4 h-4" /> Log in
                </Link>
                <Link
                  href={registerHref}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <UserPlus className="w-4 h-4" /> Create account
                </Link>
              </div>
            ) : null}

            {status === 'eligible' && !submitted ? (
              <div className="space-y-3">
                <div>
                  <label htmlFor="clan-join-message" className="block text-xs font-medium text-slate-500 mb-1.5">
                    Message to the Clan Lead <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    id="clan-join-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
                    rows={3}
                    maxLength={2000}
                    placeholder="Briefly say why you’d like to join this clan…"
                    className="w-full rounded-xl border border-slate-200 bg-card px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitRequest}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Request to join
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function ClosedState({
  windowStatus,
  opens,
  closes,
  seats,
}: {
  windowStatus?: 'active' | 'upcoming' | 'expired' | null;
  opens: string | null;
  closes: string | null;
  seats: number | null;
}) {
  const upcoming = windowStatus === 'upcoming';
  const expired = windowStatus === 'expired';

  return (
    <div className="text-center space-y-4 pt-1">
      <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${
        upcoming ? 'bg-brand-50' : 'bg-slate-100'
      }`}>
        {upcoming
          ? <Clock className="h-7 w-7 text-brand-600" strokeWidth={1.75} />
          : <Lock className="h-7 w-7 text-slate-500" strokeWidth={1.75} />}
      </div>

      <div>
        <p className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
          upcoming ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'
        }`}>
          {upcoming ? 'Opening soon' : expired ? 'Closed' : 'Unavailable'}
        </p>
        <h2 className="mt-3 text-lg font-semibold text-slate-900">
          {upcoming ? 'Joining opens later' : expired ? 'Joining has closed' : 'Joining unavailable'}
        </h2>
        {upcoming && opens ? (
          <p className="mt-2 text-sm text-slate-600">
            Opens <span className="font-medium text-slate-900">{opens}</span>
          </p>
        ) : null}
        {expired && closes ? (
          <p className="mt-2 text-sm text-slate-600">
            Closed <span className="font-medium text-slate-900">{closes}</span>
          </p>
        ) : null}
        {upcoming && closes ? (
          <p className="mt-1 text-xs text-slate-500">Closes {closes}</p>
        ) : null}
        {!upcoming && !expired ? (
          <p className="mt-2 text-sm text-slate-500">This link is not available right now.</p>
        ) : null}
      </div>

      {seats != null && upcoming ? (
        <p className="text-xs text-slate-500 inline-flex items-center gap-1.5 justify-center">
          <Users className="w-3.5 h-3.5" />
          {seats} seat{seats === 1 ? '' : 's'} remaining
        </p>
      ) : null}
    </div>
  );
}

function StatusBlock({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-start gap-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div>
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-600 mt-1">{body}</p>
      </div>
    </div>
  );
}
