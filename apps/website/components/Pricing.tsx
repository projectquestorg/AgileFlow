"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { Section } from "@/components/ui/Section";
import { Pill } from "@/components/ui/Pill";
import { Reveal } from "@/components/ui/reveal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { trackEvent } from "@/lib/analytics";
import { LINKS } from "@/lib/links";

type Tier = {
  id: string;
  name: string;
  price: string;
  note: string;
  features: string[];
  emphasis?: boolean;
  cta: {
    label: string;
    action: "copy" | "link" | "lead";
    value?: string;
    href?: string;
  };
};

export function Pricing() {
  const tiers = useMemo<Tier[]>(
    () => [
      {
        id: "oss",
        name: "Open Source",
        price: "$0",
        note: "Repo-native setup",
        features: [
          "Scaffold workflow files",
          "Core commands + templates",
          "Works with modern IDEs",
        ],
        cta: {
          label: "Install",
          action: "copy",
          value: "npm install -D agileflow",
        },
      },
      {
        id: "pro",
        name: "Pro",
        price: "$12",
        note: "Per developer / month",
        emphasis: true,
        features: [
          "Advanced generators + skills",
          "Workflow presets",
          "Priority updates",
        ],
        cta: { label: "View docs", action: "link", href: LINKS.docs },
      },
      {
        id: "teams",
        name: "Teams",
        price: "Waitlist",
        note: "Policy controls + collaboration",
        features: [
          "Shared conventions + policy checks",
          "Org templates + agents",
          "Audit-friendly verification",
        ],
        cta: { label: "Join waitlist", action: "lead" },
      },
    ],
    [],
  );

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [copied, setCopied] = useState(false);

  async function submitLead() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    void trackEvent("lead_submit", { email_domain: email.split("@")[1] ?? "" });
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source: "pricing" }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Section id="pricing">
      <div className="grid gap-10">
        <div className="max-w-2xl">
          <Reveal>
            <Pill>Pricing</Pill>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mt-5 text-2xl font-semibold tracking-tightish text-ink sm:text-3xl">
              Simple tiers, monochrome.
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-4 text-base leading-relaxed text-secondary">
              Start with the open-source scaffold. Upgrade when you want more
              automation and shared policy.
            </p>
          </Reveal>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {tiers.map((tier, idx) => (
            <Reveal key={tier.id} delay={0.04 * idx}>
              <motion.div
                whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2, z: 20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{ transformStyle: "preserve-3d", perspective: 1000 }}
                className={cn(
                  "relative overflow-hidden rounded-card border bg-white p-6 shadow-hairline transition duration-300 hover:shadow-tileHover",
                  tier.emphasis ? "border-black/20" : "border-border",
                )}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.35] texture-grid"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.08] texture-noise"
                />

                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold tracking-tightish text-ink">
                      {tier.name}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <div className="text-3xl font-semibold tracking-tightish text-ink">
                        {tier.price}
                      </div>
                      <div className="text-xs text-muted">{tier.note}</div>
                    </div>
                  </div>
                  {tier.emphasis ? (
                    <span className="rounded-full border border-black/15 bg-white px-2 py-1 text-[11px] font-medium tracking-caps text-muted">
                      Most popular
                    </span>
                  ) : null}
                </div>

                <ul className="relative mt-6 space-y-2 text-sm text-secondary">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-muted" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="relative mt-6">
                  {tier.cta.action === "copy" ? (
                    <Button
                      variant="primary"
                      eventName="pricing_cta_click"
                      eventProps={{ tier: tier.id, action: "copy" }}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            tier.cta.value ?? "",
                          );
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1400);
                        } catch {
                          // ignore
                        }
                      }}
                      className="w-full"
                    >
                      {copied ? "Copied" : tier.cta.label}
                    </Button>
                  ) : tier.cta.action === "link" ? (
                    <Button
                      href={tier.cta.href}
                      variant={tier.emphasis ? "primary" : "secondary"}
                      target="_blank"
                      rel="noreferrer"
                      eventName="pricing_cta_click"
                      eventProps={{ tier: tier.id, action: "link" }}
                      className="w-full"
                    >
                      {tier.cta.label}
                    </Button>
                  ) : (
                    <div className="grid gap-2">
                      <label
                        className="text-xs font-medium tracking-caps text-muted"
                        htmlFor="waitlist-email"
                      >
                        email
                      </label>
                      <input
                        id="waitlist-email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="h-11 w-full rounded-full border border-border bg-white px-4 text-sm text-ink shadow-hairline placeholder:text-muted focus-ring"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                      />
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={submitLead}
                        eventName="pricing_cta_click"
                        eventProps={{ tier: tier.id, action: "lead" }}
                      >
                        {status === "sent"
                          ? "Added"
                          : status === "sending"
                            ? "Sending…"
                            : tier.cta.label}
                      </Button>
                      {status === "error" && (
                        <div className="text-xs text-red-600">
                          Please enter a valid email address.
                        </div>
                      )}
                      {status !== "error" && (
                        <div className="text-xs text-muted">
                          No spam. Just release notes.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <details className="rounded-card border border-border bg-white p-6 shadow-hairline">
          <summary
            className="cursor-pointer list-none text-sm font-semibold tracking-tightish text-ink focus-ring [&::-webkit-details-marker]:hidden"
            onClick={() => trackEvent("pricing_compare_toggle")}
          >
            Compare plans
          </summary>
          <div className="mt-4 grid gap-4 text-sm text-secondary sm:grid-cols-3">
            <div>
              <div className="text-xs font-medium tracking-caps text-muted">
                Open Source
              </div>
              <ul className="mt-2 space-y-1">
                <li>Scaffold + core workflow</li>
                <li>Versioned templates</li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium tracking-caps text-muted">
                Pro
              </div>
              <ul className="mt-2 space-y-1">
                <li>More skills + presets</li>
                <li>Personal automation</li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-medium tracking-caps text-muted">
                Teams
              </div>
              <ul className="mt-2 space-y-1">
                <li>Shared policy + controls</li>
                <li>Org-level templates</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </Section>
  );
}
