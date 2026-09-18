'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { Award, BadgeCheck, Loader2, SearchX } from 'lucide-react';
import { certificatesApi } from '@/lib/services/certificates-api';

interface VerifiedCertificate {
  valid: boolean;
  certificateNumber?: string;
  recipientName?: string | null;
  tierName?: string;
  programName?: string | null;
  templateName?: string | null;
  issuedAt?: string;
}

/**
 * Public credential verification.
 *
 * The reason a number is printed on a certificate is so that somebody who was
 * handed it — a recruiter, an admissions officer — can check the claim without
 * an account and without asking anyone. So this page needs no login, and shows
 * only what confirms the claim: who, what, which programme, when.
 *
 * "Not found" is a legitimate answer to a legitimate question, not an error, so
 * it gets a real state rather than an error page.
 */
export default function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = use(params);
  const [result, setResult] = useState<VerifiedCertificate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    certificatesApi.verifyCertificateNumber(number)
      .then((res) => { if (alive) setResult(res.data); })
      // A failed lookup and an unknown code look the same to the reader, and
      // both are "we cannot confirm this" — there is nothing useful to say
      // about which it was.
      .catch(() => { if (alive) setResult({ valid: false }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [number]);

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-20">
            <Loader2 className="w-7 h-7 animate-spin text-brand-500" />
            <p className="text-sm text-muted-foreground">Checking this certificate…</p>
          </div>
        ) : result?.valid ? (
          <VerifiedCard result={result} />
        ) : (
          <NotFoundCard number={number} />
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Credential verification by{' '}
          <Link href="/" className="font-semibold text-brand-600 hover:underline">Pathment</Link>
        </p>
      </div>
    </main>
  );
}

function VerifiedCard({ result }: { result: VerifiedCertificate }) {
  const issued = result.issuedAt
    ? new Date(result.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <div className="rounded-3xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-3">
        <BadgeCheck className="w-5 h-5 text-emerald-600" />
        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Verified credential</span>
      </div>

      <div className="px-6 py-6 space-y-5">
        <Field label="Awarded to" value={result.recipientName || 'Not recorded'} emphasis />
        {result.tierName && (
          <Field
            label="Credential"
            value={
              <span className="inline-flex items-center gap-1.5">
                <Award className="w-4 h-4 text-brand-500" />
                {result.tierName}
              </span>
            }
            emphasis
          />
        )}
        {result.programName && <Field label="Programme" value={result.programName} />}
        {issued && <Field label="Issued" value={issued} />}

        <div className="border-t border-border pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Certificate number</p>
          <p className="mt-1 font-mono text-base font-bold tracking-widest text-foreground break-all">
            {result.certificateNumber}
          </p>
        </div>
      </div>
    </div>
  );
}

function NotFoundCard({ number }: { number: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card shadow-xs px-6 py-10 text-center">
      <SearchX className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
      <h1 className="text-base font-bold text-foreground">No certificate found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We could not find a credential with the number below. Check it for typos — it is twelve
        characters and contains no O, I or L.
      </p>
      <p className="mt-4 font-mono text-sm font-bold tracking-widest text-muted-foreground break-all">
        {number}
      </p>
    </div>
  );
}

function Field({
  label, value, emphasis,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={emphasis ? 'mt-0.5 text-lg font-bold text-foreground' : 'mt-0.5 text-sm text-foreground'}>
        {value}
      </p>
    </div>
  );
}
