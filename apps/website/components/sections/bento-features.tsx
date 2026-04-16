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

function lottieHeight(size: "large" | "medium" | "small") {
  if (size === "large") return "h-[200px] sm:h-[220px] md:h-[240px]";
  if (size === "medium") return "h-[140px] sm:h-[160px]";
  return "h-[110px] sm:h-[120px]";
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
                    "surface group relative flex h-full w-full flex-col rounded-card p-4 text-left shadow-tile sm:p-5",
                    "transition-shadow transition-colors hover:border-[#D1D5DB] hover:shadow-tileHover",
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
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs font-medium tracking-wide text-[var(--text-muted)]">
                        {tile.tag}
                      </div>
                      <div className="mt-2 text-[18px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                        {tile.title}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                        {tile.description}
                      </p>
                    </div>
                    <div className="hidden h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-white/60 text-[var(--text-muted)] sm:flex">
                      <svg
                        width="16"
                        height="16"
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

                  <div
                    className="mt-5 rounded-card border border-[var(--border-subtle)] bg-white/60 p-2 sm:p-3 [transform:translateZ(18px)]"
                  >
                    <CardMotionScene
                      src={tile.lottieSrc}
                      className={cn("w-full", lottieHeight(tile.size))}
                    />
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
