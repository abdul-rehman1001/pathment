'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { getInitials } from '@/lib/utils/formatting';

/** Workspace logo tile (rounded square). Same fallback pattern as ClanAvatar. */

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-14 w-14 text-base',
} as const;

type WorkspaceLogoSize = keyof typeof SIZES;

export function WorkspaceLogo({
  name,
  src,
  size = 'md',
  className = '',
}: {
  name: string;
  src?: string | null;
  size?: WorkspaceLogoSize;
  className?: string;
}) {
  const dim = SIZES[size];
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return (
      <span title={name} className={`${dim} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-card ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} onError={() => setFailed(true)} className="h-full w-full object-cover object-center" />
      </span>
    );
  }

  if (name.trim()) {
    return (
      <span title={name} className={`${dim} shrink-0 grid place-items-center rounded-lg border border-slate-200 bg-card font-bold uppercase text-brand-700 ${className}`}>
        {getInitials(name)}
      </span>
    );
  }

  return (
    <span title={name} className={`${dim} shrink-0 grid place-items-center rounded-lg bg-brand-50 text-brand-700 ${className}`}>
      <Building2 className="h-4 w-4" aria-hidden />
    </span>
  );
}