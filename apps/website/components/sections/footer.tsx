import Link from 'next/link';
import Image from 'next/image';
import { Container } from '@/components/ui/container';
import type { LandingContent } from '@/lib/landing-content';

export function Footer({ content }: { content: LandingContent['footer'] }) {
  return (
    <footer className="border-t border-[var(--border-default)] py-14">
      <Container>
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <Image
              src="/banner.png"
              alt="AgileFlow"
              width={120}
              height={28}
              className="h-7 w-auto"
            />
            <p className="mt-3 max-w-[44ch] text-sm leading-6 text-[var(--text-secondary)]">
              {content.tagline}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 md:col-span-8">
            {content.columns.map((col) => (
              <div key={col.title} className="grid gap-3">
                <div className="text-xs font-medium tracking-wide text-[var(--text-muted)]">{col.title}</div>
                <div className="grid gap-2">
                  {col.links.map((link) =>
                    link.href.startsWith('#') ? (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="focus-ring inline-flex rounded-md text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        key={link.href}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring inline-flex rounded-md text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        {link.label}
                      </a>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-8 text-xs font-medium tracking-wide text-[var(--text-muted)] md:flex-row md:items-center md:justify-between">
          <div>{content.bottom}</div>
          <div className="font-mono">agileflow</div>
        </div>
      </Container>
    </footer>
  );
}

