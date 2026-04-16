"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { usePrefersReducedMotion } from "@/lib/reducedMotion";
import { LottieAsset } from "@/components/lottie-asset";

export type MicroDemoName =
  | "heroSystemBoot"
  | "terminalTyping"
  | "docsTreeGrowth"
  | "commandFlow"
  | "kanbanToMarkdown"
  | "adrDecision"
  | "messageBusPulse"
  | "velocityPlanning"
  | "verification"
  | "configCheck";

const nameToLottieSrc: Record<MicroDemoName, string> = {
  heroSystemBoot: "/lottie/hero-system-boot.json",
  terminalTyping: "/lottie/terminal-typing.json",
  docsTreeGrowth: "/lottie/docs-tree-growth.json",
  commandFlow: "/lottie/command-flow.json",
  kanbanToMarkdown: "/lottie/kanban-markdown.json",
  adrDecision: "/lottie/adr-decision.json",
  messageBusPulse: "/lottie/message-bus-pulse.json",
  velocityPlanning: "/lottie/velocity-chart.json",
  verification: "/lottie/test-badge-flip.json",
  configCheck: "/lottie/ide-config-check.json",
};

export function MicroDemo({
  name,
  className,
  speed = 1,
}: {
  name: MicroDemoName;
  className?: string;
  speed?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const src = nameToLottieSrc[name];

  return (
    <div className={cn("h-full w-full", className)}>
      {src ? (
        <LottieAsset
          src={src}
          className="w-full h-full"
          speed={reduced ? 0 : speed}
        />
      ) : null}
    </div>
  );
}
