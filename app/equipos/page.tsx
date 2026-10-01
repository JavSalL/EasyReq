'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/equipos-global/');
  }, [router]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-brand-text border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-ink-subtle">Redirigiendo a Equipos...</span>
      </div>
    </div>
  );
}
