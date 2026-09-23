"use client";

import { motion } from "framer-motion";
import { CardMotionScene } from "@/components/ui/card-motion-scene";

const steps = [
  {
    tag: "01",
    title: "Init",
    description: "agileflow init",
    src: "/lottie/terminal-typing.json",
  },
  {
    tag: "02",
    title: "Add",
    description: "agileflow add diagnosing-bugs",
    src: "/lottie/folder-scaffold.json",
  },
  {
    tag: "03",
    title: "Work",
    description: "Open your coding agent as usual",
    src: "/lottie/command-flow.json",
  },
];

const features = [
  {
    tag: "Portability",
    title: "Install once, use everywhere",
    description:
      "One canonical .agents/skills folder. Every supported provider reads the same skill.",
    src: "/lottie/command-flow.json",
    size: "large",
  },
  {
    tag: "Customization",
    title: "Fork without fear",
    description: "Edit any skill. Updates never overwrite local changes.",
    src: "/lottie/adr-decision.json",
    size: "large",
  },
  {
    tag: "Versioning",
    title: "Deterministic updates",
    description: "agileflow.yaml records intent. agileflow.lock records resolution.",
    src: "/lottie/docs-tree-growth.json",
    size: "small",
  },
  {
    tag: "Ownership",
    title: "Zero lock-in",
    description: "Uninstall the CLI and your skills keep working.",
    src: "/lottie/message-bus-pulse.json",
    size: "small",
  },
  {
    tag: "Footprint",
    title: "No repository takeover",
    description: "No docs scaffolding, no hooks, no runtime directory.",
    src: "/lottie/ide-config-check.json",
    size: "small",
  },
  {
    tag: "Quality",
    title: "Evals, not vibes",
    description: "Official skills ship with activation and behavior evals.",
    src: "/lottie/test-badge-flip.json",
    size: "small",
  },
];

function shellClasses(size: "large" | "small") {
  return size === "large" ? "md:col-span-6" : "md:col-span-3";
}

function animHeight(size: "large" | "small") {
  return size === "large" ? "h-[240px]" : "h-[140px]";
}

export function CardMotionPreview() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(232,104,58,0.12),_transparent_30%),linear-gradient(180deg,#faf7f4_0%,#f7f3ef_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          Card Motion Preview
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
          This route renders the actual Lottie files used by the website cards
          with exaggerated depth and float so you can verify the motion
          directly.
        </p>

        <h2 className="mt-12 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          How It Works
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-3">
          {steps.map((step, idx) => (
            <motion.div
              key={step.title}
              className="rounded-[28px] border border-slate-200 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)]"
              style={{ transformStyle: "preserve-3d", perspective: 1000 }}
              whileHover={{
                y: -8,
                rotateX: 6,
                rotateY: idx % 2 === 0 ? -6 : 6,
              }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className="p-6">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {step.tag}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
                  {step.title}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {step.description}
                </p>
                <motion.div
                  className="mt-5 rounded-[24px] border border-slate-200 bg-white/80 p-3"
                  style={{ transform: "translateZ(24px)" }}
                  animate={{ y: [0, -10, 0], scale: [1, 1.03, 1] }}
                  transition={{
                    duration: 3.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: idx * 0.2,
                  }}
                >
                  <CardMotionScene
                    src={step.src}
                    className="h-[220px] w-full"
                  />
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        <h2 className="mt-14 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          Systematic By Default
        </h2>
        <div className="mt-4 grid gap-5 md:grid-cols-12">
          {features.map((feature, idx) => (
            <motion.div
              key={feature.title}
              className={`rounded-[28px] border border-slate-200 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] ${shellClasses(feature.size as "large" | "small")}`}
              style={{ transformStyle: "preserve-3d", perspective: 1200 }}
              whileHover={{
                y: -8,
                rotateX: 6,
                rotateY: idx % 2 === 0 ? -6 : 6,
              }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className="p-6">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                  {feature.tag}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.02em]">
                  {feature.title}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {feature.description}
                </p>
                <motion.div
                  className="mt-5 rounded-[24px] border border-slate-200 bg-white/80 p-3"
                  style={{ transform: "translateZ(24px)" }}
                  animate={{ y: [0, -12, 0], scale: [1, 1.03, 1] }}
                  transition={{
                    duration: feature.size === "large" ? 3.8 : 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: idx * 0.12,
                  }}
                >
                  <CardMotionScene
                    src={feature.src}
                    className={`w-full ${animHeight(feature.size as "large" | "small")}`}
                  />
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </main>
  );
}
