'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId, useMemo, useState } from 'react';
import { Container } from '@/components/ui/container';
import type { ShowcaseContent } from '@/lib/landing-content';
import { cn } from '@/lib/cn';
import { MOTION } from '@/lib/motion';
import { track } from '@/lib/track';

type Command = ShowcaseContent['categories'][number]['commands'][number];

export function CommandsShowcase({ content }: { content: ShowcaseContent }) {
  const prefersReducedMotion = useReducedMotion();
  const baseId = useId();

  const firstCategory = content.categories[0];
  const firstCommand = firstCategory?.commands[0];

  const [openId, setOpenId] = useState<string>(firstCategory?.id ?? '');
  const [selected, setSelected] = useState<{ categoryId: string; command: Command } | null>(
    firstCategory && firstCommand ? { categoryId: firstCategory.id, command: firstCommand } : null,
  );

  const selectedMeta = useMemo(() => {
    if (!selected) return null;
    return {
      label: `${content.prefix}${selected.command.name}`,
      description: selected.command.description,
      exampleHtml: selected.command.exampleHtml,
    };
  }, [selected, content.prefix]);

  return (
    <section id={content.id} className="scroll-mt-24 py-20 sm:py-24 md:py-28">
      <Container>
        <div className="grid gap-10">
          <div className="max-w-[70ch]">
            <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[32px]">
              {content.heading}
            </h2>
            <p className="mt-3 text-[15px] leading-7 text-[var(--text-secondary)]">{content.subhead}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="surface rounded-card shadow-tile">
                <div className="border-b border-[var(--border-subtle)] px-5 py-4">
                  <div className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">{content.listLabel}</div>
                </div>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {content.categories.map((category) => {
                    const isOpen = openId === category.id;
                    const panelId = `${baseId}-${category.id}`;
                    return (
                      <div key={category.id} className="px-5 py-4">
                        <button
                          type="button"
                          className="focus-ring flex w-full items-center justify-between rounded-md text-left"
                          aria-expanded={isOpen}
                          aria-controls={panelId}
                          onClick={() => {
                            setOpenId((current) => (current === category.id ? '' : category.id));
                            track('commands_category_toggle', { section: content.id, id: category.id, open: !isOpen });
                          }}
                        >
                          <span className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                            {category.name}
                          </span>
                          <motion.span
                            aria-hidden="true"
                            animate={prefersReducedMotion ? undefined : { rotate: isOpen ? 180 : 0 }}
                            transition={MOTION.panel}
                            className="text-[var(--text-muted)]"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M6 9l6 6 6-6"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </motion.span>
                        </button>

                        <AnimatePresence initial={false}>
                          {isOpen ? (
                            <motion.div
                              id={panelId}
                              initial={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                              animate={prefersReducedMotion ? undefined : { height: 'auto', opacity: 1 }}
                              exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
                              transition={MOTION.panel}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 flex flex-wrap gap-2">
                                {category.commands.map((cmd) => {
                                  const isSelected = selected?.command.name === cmd.name;
                                  return (
                                    <button
                                      key={cmd.name}
                                      type="button"
                                      className={cn(
                                        'focus-ring inline-flex h-10 items-center rounded-full border px-4 font-mono text-[13px]',
                                        isSelected
                                          ? 'border-[var(--border-default)] bg-white text-[var(--text-primary)]'
                                          : 'border-[var(--border-subtle)] bg-white/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                                      )}
                                      onClick={() => {
                                        setSelected({ categoryId: category.id, command: cmd });
                                        track('command_select', { section: content.id, categoryId: category.id, command: cmd.name });
                                      }}
                                    >
                                      {`${content.prefix}${cmd.name}`}
                                    </button>
                                  );
                                })}
                              </div>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="surface rounded-card shadow-tile">
                <div className="border-b border-[var(--border-subtle)] px-5 py-4">
                  <div className="text-xs font-medium tracking-wide text-[var(--text-secondary)]">{content.detailLabel}</div>
                </div>
                <div className="p-5">
                  {selectedMeta ? (
                    <div className="grid gap-4">
                      <div>
                        <div className="font-mono text-sm text-[var(--text-primary)]">{selectedMeta.label}</div>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{selectedMeta.description}</p>
                      </div>
                      {selectedMeta.exampleHtml && (
                        <div className="rounded-card border border-[var(--border-default)] bg-[var(--bg-code)] p-4">
                          <div className="code-shiki text-sm" dangerouslySetInnerHTML={{ __html: selectedMeta.exampleHtml }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">Select an item to view details.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
