'use client';

export default function AppError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="px-6 md:px-12 py-16">
      <div className="glass rounded-[32px] p-8 max-w-xl">
        <p className="text-xs uppercase tracking-[0.3em] text-ink-300">Something went wrong</p>
        <h1 className="font-serif text-2xl mt-3">We hit an unexpected error.</h1>
        <p className="text-sm text-ink-200 mt-3">
          Please try again or refresh the page. If the issue persists, contact an admin.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-ocean-500 px-4 py-2 text-xs font-semibold text-white hover:bg-ocean-400 transition"
          >
            Try again
          </button>
        </div>
        {process.env.NODE_ENV === 'development' ? (
          <p className="mt-4 text-xs text-ink-400">{error.message}</p>
        ) : null}
      </div>
    </div>
  );
}
