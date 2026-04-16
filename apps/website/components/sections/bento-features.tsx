"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { Modal } from "@/components/ui/Modal";
import { CardMotionScene } from "@/components/ui/card-motion-scene";
import type { LandingContent } from "@/lib/landing-content";
import { cn } from "@/lib/cn";
import { MOTION } from "@/lib/motion";
import { track } from "@/lib/track";

function sizeClasses(size: "large" | "medium" | "small") {
  if (size === "large") return "col-span-12 md:col-span-6 md:row-span-2";
  if (size === "medium") return "col-span-12 md:col-span-6";
  return "col-span-12 sm:col-span-6 md:col-span-3";
}

function minHeight(size: "large" | "medium" | "small") {
  if (size === "large") return "min-h-[360px] sm:min-h-[400px] md:min-h-[440px]";
  if (size === "medium") return "min-h-[240px] sm:min-h-[260px]";
  return "min-h-[200px] sm:min-h-[220px]";
}

export function BentoFeatures({
  tiles,
}: {
  tiles: LandingContent["features"];
}) {
  const prefersReducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string | null>(null);

  const active = useMemo(
    () => tiles.tiles.find((t) => t.id === activeId) ?? null,
    [activeId, tiles.tiles],
  );

  return (
    <section id="features" className="scroll-mt-24 py-20 sm:py-24 md:py-28">
      <Container>
        <div className="grid gap-10">
          <Reveal>
            <div className="max-w-[70ch]">
              <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[32px]">
                {tiles.heading}
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[var(--text-secondary)]">
                {tiles.subhead}
              </p>
            </div>
          </Reveal>

          <div className="grid grid-cols-12 gap-4">
            {tiles.tiles.map((tile, idx) => (
              <Reveal
                key={tile.id}
                delay={prefersReducedMotion ? 0 : idx * 0.03}
                className={sizeClasses(tile.size)}
              >
                <motion.button
                  type="button"
                  className={cn(
                    "surface group relative flex h-full w-full flex-col overflow-hidden rounded-card text-left shadow-tile",
                    "transition-shadow transition-colors hover:border-[#D1D5DB] hover:shadow-tileHover",
                    minHeight(tile.size),
                  )}
                  style={{ transformStyle: "preserve-3d", perspective: 1200 }}
                  whileHover={
                    prefersReducedMotion
                      ? undefined
                      : {
                          y: -4,
                          rotateX: 4,
                          rotateY: tile.size === "large" ? -4 : 4,
                        }
                  }
                  transition={MOTION.hover}
                  onClick={() => {
                    setActiveId(tile.id);
                    track("feature_modal_open", {
                      id: tile.id,
                      title: tile.title,
                    });
                  }}
                  aria-haspopup="dialog"
                >
                  {/* Ambient SVG background */}
                  <div className="pointer-events-none absolute inset-0">
                    <CardMotionScene
                      src={tile.lottieSrc}
                      className="h-full w-full"
                    />
                  </div>

                  {/* Layered content on top */}
                  <div className="relative z-10 flex h-full w-full flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium tracking-wide text-[var(--text-muted)]">
                          {tile.tag}
                        </div>
                        <div className="mt-2 text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                          {tile.title}
                        </div>
                        <p className="mt-2 max-w-[32ch] text-sm leading-6 text-[var(--text-secondary)]">
                          {tile.description}
                        </p>
                      </div>
                      <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-white/70 text-[var(--text-muted)] backdrop-blur-sm sm:flex">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M9 18l6-6-6-6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>
                </motion.button>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>

      <Modal
        open={Boolean(active)}
        onClose={() => setActiveId(null)}
        title={active?.modal.title ?? "Details"}
      >
        {active ? (
          <div className="grid gap-5">
            <div className="grid gap-2 text-sm leading-6 text-[var(--text-secondary)]">
              {active.modal.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>

            {active.modal.codeHtml ? (
              <div className="rounded-card border border-[var(--border-default)] bg-[var(--bg-code)] p-4">
                <div
                  className="code-shiki text-sm"
                  dangerouslySetInnerHTML={{ __html: active.modal.codeHtml }}
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={active.modal.docsHref}
                className="focus-ring inline-flex h-10 items-center rounded-full border border-[var(--border-default)] bg-white px-4 text-sm text-[var(--text-primary)] shadow-tile transition-shadow hover:shadow-tileHover"
                onClick={() =>
                  track("feature_modal_docs", {
                    id: active.id,
                    href: active.modal.docsHref,
                  })
                }
              >
                Read docs
              </Link>
              <button
                type="button"
                className="focus-ring inline-flex h-10 items-center rounded-full px-3 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                onClick={() => setActiveId(null)}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
