export default function Custom404() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-6 py-24 text-center">
      <div className="max-w-md">
        <p className="text-sm font-medium tracking-wide text-[var(--text-muted)]">
          404
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Page not found
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          The page you requested does not exist or may have moved.
        </p>
      </div>
    </main>
  );
}
