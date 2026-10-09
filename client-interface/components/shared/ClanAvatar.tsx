'use client';

import { useEffect, useState } from 'react';
import { getInitials } from '@/lib/utils/formatting';

/**
 * Clan photo only — circular frame with cover crop. Upload already goes through
 * a square cropper, so we display the stored URL as-is. Does not change the
 * shared Avatar used for people.
 */

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-2xl',
} as const;

type ClanAvatarSize = keyof typeof SIZES;

export function ClanAvatar({
  name,
  src,
  size = 'md',
  className = '',
  title,
}: {
  name: string;
  src?: string | null;
  size?: ClanAvatarSize;
  className?: string;
  title?: string;
}) {
  const dim = SIZES[size];
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (src && !failed) {
    return (
      <span
        title={title || name}
        className={`${dim} shrink-0 overflow-hidden rounded-full bg-brand-100 ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover object-center"
        />
      </span>
    );
  }

  return (
    <span
      title={title || name}
      className={`${dim} shrink-0 rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center select-none ${className}`}
    >
      {getInitials(name)}
    </span>
  );
}
