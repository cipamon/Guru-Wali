import React, { useEffect, useMemo, useState } from 'react';
import { getImageCandidateUrls, isGoogleDriveUrl } from '../lib/imageUtils';

interface SmartPhotoProps {
  src?: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  showDriveHint?: boolean;
}

export const SmartPhoto: React.FC<SmartPhotoProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  fallback,
  showDriveHint = false,
}) => {
  const candidates = useMemo(() => getImageCandidateUrls(src), [src]);
  const [attemptIdx, setAttemptIdx] = useState(0);

  useEffect(() => {
    setAttemptIdx(0);
  }, [src]);

  const currentUrl = candidates[attemptIdx];
  const allFailed = candidates.length === 0 || attemptIdx >= candidates.length;

  if (allFailed || !currentUrl) {
    if (showDriveHint && isGoogleDriveUrl(src)) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-1.5 text-center bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
          <span className="text-[10px] font-bold leading-tight">Foto Drive Terbatas</span>
          <span className="text-[9px] leading-tight mt-0.5 opacity-80">
            Ubah akses ke &quot;Siapa saja yang memiliki link&quot;
          </span>
        </div>
      );
    }
    return <>{fallback ?? null}</>;
  }

  return (
    <img
      src={currentUrl}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        setAttemptIdx((prev) => prev + 1);
      }}
    />
  );
};
