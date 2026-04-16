"use client";

import type { LottieRefCurrentProps } from "lottie-react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

type LottieAssetProps = {
  src: string;
  className?: string;
  loop?: boolean;
  speed?: number;
  posterFrame?: number;
};

const animationCache = new Map<string, Record<string, unknown>>();
const inflightLoads = new Map<string, Promise<Record<string, unknown>>>();

async function loadAnimation(src: string) {
  const cached = animationCache.get(src);
  if (cached) return cached;

  const inflight = inflightLoads.get(src);
  if (inflight) return inflight;

  const promise = fetch(src)
    .then((res) => res.json() as Promise<Record<string, unknown>>)
    .then((json) => {
      animationCache.set(src, json);
      inflightLoads.delete(src);
      return json;
    })
    .catch((err) => {
      inflightLoads.delete(src);
      throw err;
    });

  inflightLoads.set(src, promise);
  return promise;
}

export function LottieAsset({
  src,
  className,
  loop = true,
  speed = 1,
  posterFrame = 0,
}: LottieAssetProps) {
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lottieRef = useRef<LottieRefCurrentProps | null>(null);
  const [inView, setInView] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [animationData, setAnimationData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const isIntersecting = Boolean(entry?.isIntersecting);
        setInView(isIntersecting);
        if (isIntersecting) setShouldLoad(true);
      },
      { rootMargin: "220px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldLoad || animationData) return;
    let cancelled = false;
    void loadAnimation(src)
      .then((json) => {
        if (!cancelled) setAnimationData(json);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [animationData, shouldLoad, src]);

  useEffect(() => {
    const api = lottieRef.current;
    if (!api) return;
    api.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    const api = lottieRef.current;
    if (!api) return;

    if (prefersReducedMotion) {
      api.goToAndStop(posterFrame, true);
      return;
    }

    if (inView) api.play();
    else api.pause();
  }, [inView, posterFrame, prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={cn("relative overflow-hidden", className)}
    >
      {animationData ? (
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop={loop}
          autoplay={!prefersReducedMotion && inView}
          rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
          style={{ width: "100%", height: "100%" }}
        />
      ) : loadFailed ? (
        <div className="flex h-full w-full items-center justify-center rounded-[10px] border border-[var(--border-subtle)] bg-white/40 text-xs text-[var(--text-muted)]">
          <span className="sr-only">Animation failed to load</span>
        </div>
      ) : (
        <div className="h-full w-full rounded-[10px] border border-[var(--border-subtle)] bg-white/40" />
      )}
    </div>
  );
}
