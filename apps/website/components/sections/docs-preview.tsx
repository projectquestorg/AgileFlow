import { Container } from '@/components/ui/container';
import { Reveal } from '@/components/ui/reveal';
import { DocsTreeSceneSvg } from '@/components/ui/animated-svg-scenes';
import { LINKS } from '@/lib/links';
import type { LandingContent } from '@/lib/landing-content';

export function DocsPreview({ content }: { content: LandingContent['docsPreview'] }) {
  return (
    <section id="docs" className="scroll-mt-24 py-20 sm:py-24 md:py-28">
      <Container>
        <div className="grid items-start gap-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <Reveal>
              <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[32px]">
                {content.heading}
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[var(--text-secondary)]">{content.subhead}</p>
            </Reveal>

            <Reveal className="mt-6">
              <div className="rounded-card border border-[var(--border-default)] bg-[var(--bg-code)] p-5 shadow-tile">
                <div className="code-shiki text-sm" dangerouslySetInnerHTML={{ __html: content.treeHtml }} />
              </div>
            </Reveal>

            <Reveal className="mt-6">
              <div className="rounded-card border border-[var(--border-default)] bg-white/70 p-5 shadow-tile">
                <div className="text-xs font-medium tracking-wide text-[var(--text-muted)]">{content.callout.title}</div>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{content.callout.body}</p>
              </div>
            </Reveal>

            <Reveal className="mt-6">
              <a
                href={LINKS.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white shadow-tile transition-shadow hover:shadow-tileHover"
              >
                View Full Documentation
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </Reveal>
          </div>

          <div className="lg:col-span-6">
            <Reveal>
              <div className="surface rounded-card shadow-tile">
                <div className="border-b border-[var(--border-subtle)] px-5 py-4">
                  <div className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">
                    Folder tree build
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="rounded-card border border-[var(--border-subtle)] bg-white/60 p-4">
                    <div className="h-[320px] w-full">
                      <DocsTreeSceneSvg />
                    </div>
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">
                    docs/09-agents/ is designed to stay auditable.
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

