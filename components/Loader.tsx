import React from 'react';
import { LoaderCircle } from 'lucide-react';

type LoaderProps = {
  small?: boolean;
  fullScreen?: boolean;
  className?: string;
};

export default function Loader({ small = false, fullScreen = false, className = '' }: LoaderProps) {
  if (small) {
    return (
      <span role="status" aria-label="Loading" className={`inline-flex items-center justify-center ${className}`}>
        <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
        <span className="sr-only">Loading</span>
      </span>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${fullScreen ? 'fixed inset-0 z-50 bg-slate-50/90 backdrop-blur-xl dark:bg-slate-950/90' : 'min-h-32 w-full'} flex flex-col items-center justify-center px-6 py-8 ${className}`}
    >
      <LoaderCircle aria-hidden="true" strokeWidth={1.5} className="h-10 w-10 text-indigo-600 motion-safe:animate-spin dark:text-indigo-400" />
      <span className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">Loading…</span>
    </div>
  );
}
