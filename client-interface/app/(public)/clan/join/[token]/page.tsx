'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, Loader2, Lock, LogIn, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/lib/context/AuthContext';
import { publicApi, type PublicClanJoinInfo } from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export default function ClanJoinPage() {
  const params = useParams();
  const token = String(params?.token || '');
  const { user, isLoading: authLoading } = useAuth();

  const [info, setInfo] = useState<PublicClanJoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const joinPath = `/clan/join/${encodeURIComponent(token)}`;
  const loginHref = `/login?next=${encodeURIComponent(joinPath)}`;
  const registerHref = `/register?clanJoin=${encodeURIComponent(token)}`;

  const reload = async () => {
    if (!token) return;
    setLoading(true);
    setUnavailable(false);
    try {
      const data = await publicApi.getClanJoin(token);
      setInfo(data);
      if (data.viewerStatus === 'pending') setSubmitted(true);
    } catch {
      setInfo(null);
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || authLoading) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authLoading, user?.id]);

  const submitRequest = async () => {
    if (!token) return;
    setSubmitting(true);
    try {
      await publicApi.submitClanJoinRequest(token);
      setSubmitted(true);
      toast.success('Your join request was sent to the Clan Lead Mentor.');
      await reload();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit join request'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (unavailable || !info) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="rounded-2xl border border-slate-200 bg-card p-8 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <Lock className="w-5 h-5 text-slate-500" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Joining unavailable</h1>
          <p className="text-sm text-slate-600">
            This clan joining link is invalid or no longer available.
          </p>
          <Link href="/programs" className="inline-flex text-sm font-medium text-brand-700 hover:text-brand-800">
            Browse programs
          </Link>
        </div>
      </div>
    );
  }

  const status = info.viewerStatus;

  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="rounded-2xl border border-slate-200 bg-card p-8 space-y-6 shadow-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Join a clan</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">{info.clan.name}</h1>
          {info.program?.name ? (
            <p className="text-sm text-slate-500 mt-1">{info.program.name}</p>
          ) : null}
          {info.clan.description ? (
            <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{info.clan.description}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50/70 dark:bg-brand-500/10 px-4 py-3 text-sm text-brand-900">
          {info.joining.message}
        </div>

        {typeof info.clan.seatsRemaining === 'number' ? (
          <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {info.clan.seatsRemaining} seat{info.clan.seatsRemaining === 1 ? '' : 's'} remaining
          </p>
        ) : null}

        {status === 'already_member' || status === 'mentor_of_clan' ? (
          <StatusBlock
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            title="You are already a member of this clan."
            body={status === 'mentor_of_clan'
              ? 'You already have a mentor role here, so a mentee join request is not needed.'
              : 'No further action is required.'}
          />
        ) : null}

        {status === 'pending' || submitted ? (
          <StatusBlock
            icon={<CheckCircle2 className="w-5 h-5 text-brand-600" />}
            title="Your request to join this clan is already pending."
            body="The Clan Lead Mentor will review it. You will be notified when they decide."
          />
        ) : null}

        {status === 'member_elsewhere' ? (
          <StatusBlock
            icon={<Lock className="w-5 h-5 text-amber-600" />}
            title="You already belong to another clan."
            body="A person can be a mentee of only one clan at a time. Ask an administrator or your current mentor about a transfer."
          />
        ) : null}

        {status === 'anonymous' ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Log in or create an account to request to join this clan.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                <LogIn className="w-4 h-4" /> Log in
              </Link>
              <Link
                href={registerHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <UserPlus className="w-4 h-4" /> Create account
              </Link>
            </div>
          </div>
        ) : null}

        {status === 'eligible' && !submitted ? (
          <button
            type="button"
            disabled={submitting}
            onClick={submitRequest}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Request to join
          </button>
        ) : null}
      </div>
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
