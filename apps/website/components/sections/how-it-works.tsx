"use client";

import { motion } from "framer-motion";
import { Container } from "@/components/ui/container";
import { Reveal } from "@/components/ui/reveal";
import { CardMotionScene } from "@/components/ui/card-motion-scene";
import type { LandingContent } from "@/lib/landing-content";

export function HowItWorks({ steps }: { steps: LandingContent["howItWorks"] }) {
  return (
    <section id="how-it-works" className="scroll-mt-24 py-20 sm:py-24 md:py-28">
      <Container>
        <div className="grid gap-10">
          <Reveal>
            <div className="max-w-[66ch]">
              <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[32px]">
                {steps.heading}
              </h2>
              <p className="mt-3 text-[15px] leading-7 text-[var(--text-secondary)]">
                {steps.subhead}
              </p>
              <p className="mt-4 text-xs font-medium tracking-wide text-[var(--text-muted)]">
                {steps.reassurance}
              </p>
            </div>
          </Reveal>

          <div className="grid gap-4 md:grid-cols-3">
            {steps.steps.map((step, idx) => (
              <Reveal key={step.title} delay={idx * 0.08}>
                <motion.div
                  className="surface rounded-card shadow-tile transition-shadow hover:shadow-tileHover"
                  style={{ transformStyle: "preserve-3d", perspective: 1000 }}
                  whileHover={{
                    y: -4,
                    rotateX: 4,
                    rotateY: idx % 2 === 0 ? -4 : 4,
                  }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                >
                  <div className="border-b border-[var(--border-subtle)] p-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--text-primary)]">
                        {step.title}
                      </div>
                      <div className="font-mono text-xs text-[var(--text-muted)]">
                        0{step.step}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {step.description}
                    </p>
                  </div>
                  <div className="p-5">
                    <div className="rounded-card border border-[var(--border-subtle)] bg-white/60 p-3 [transform:translateZ(18px)]">
                      <CardMotionScene
                        src={step.lottieSrc}
                        className="h-[200px] w-full"
                      />
                    </div>
                  </div>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
