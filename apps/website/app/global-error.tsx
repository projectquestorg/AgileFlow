"use client";

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main className="flex min-h-dvh items-center justify-center bg-white px-6 py-24 text-center">
          <div className="max-w-md">
            <p className="text-sm font-medium tracking-wide text-[var(--text-muted)]">
              500
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
              Something went wrong
            </h1>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
              An unexpected error occurred while rendering this page.
            </p>
            <a
              href="/"
              className="mt-8 inline-flex h-10 items-center rounded-full bg-[var(--accent)] px-5 text-sm font-medium text-white"
            >
              Back to home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
