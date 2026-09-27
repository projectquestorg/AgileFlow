import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { GithubIcon } from "@/components/icons/github-icon";
import { LINKS } from "@/lib/links";
import { InstallCommand } from "@/components/install-command";

export function HeroSection() {
	return (
		<section className="w-full">
			{/* Top Shades */}
			<div
				aria-hidden="true"
				className="absolute inset-0 isolate hidden overflow-hidden [contain:strict] lg:block"
			>
				<div className="absolute inset-0 -top-14 isolate -z-10 bg-[radial-gradient(35%_80%_at_49%_0%,rgba(255,255,255,0.08),transparent)] [contain:strict]" />
			</div>

			{/* main content */}

			<div className="relative flex flex-col items-center justify-center gap-5 pt-32 pb-[7.5rem]">
				{/* X Content Faded Borders */}
				<div
					aria-hidden="true"
					className="absolute inset-0 -z-[1] size-full overflow-hidden"
				>
					<div className="absolute inset-y-0 left-4 w-px bg-gradient-to-b from-transparent via-border to-border md:left-8" />
					<div className="absolute inset-y-0 right-4 w-px bg-gradient-to-b from-transparent via-border to-border md:right-8" />
					<div className="absolute inset-y-0 left-8 w-px bg-gradient-to-b from-transparent via-border/50 to-border/50 md:left-12" />
					<div className="absolute inset-y-0 right-8 w-px bg-gradient-to-b from-transparent via-border/50 to-border/50 md:right-12" />
				</div>

				<a
					className={cn(
						"group mx-auto flex w-fit items-center gap-3 rounded-full border bg-card px-3 py-1 shadow",
						"fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards transition-all delay-500 duration-500 ease-out"
					)}
					href={LINKS.docs}
				>
					<SparklesIcon className="size-3 text-muted-foreground" />
					<span className="text-xs">AgileFlow v5: skills, versions, and Agile Work</span>
					<span className="block h-5 border-l" />

					<ArrowRightIcon className="size-3 duration-150 ease-out group-hover:translate-x-1" />
				</a>

				<h1
					className={cn(
						"fade-in slide-in-from-bottom-10 animate-in text-balance fill-mode-backwards text-center font-medium text-4xl tracking-tight delay-100 duration-500 ease-out md:text-5xl lg:text-6xl",
						"[text-shadow:0_0_50px_rgba(255,255,255,0.2)]"
					)}
				>
					Portable workflows <br /> for coding agents
				</h1>

				<p className="fade-in slide-in-from-bottom-10 mx-auto max-w-lg animate-in fill-mode-backwards text-center text-base text-foreground/80 delay-200 duration-500 ease-out sm:text-lg md:text-xl">
					Install a skill once. Use it with Claude Code, Codex, Cursor,
					OpenCode, and Gemini CLI.
				</p>

				<div className="fade-in slide-in-from-bottom-10 flex animate-in flex-row flex-wrap items-center justify-center gap-3 fill-mode-backwards pt-2 delay-300 duration-500 ease-out">
					<Button asChild className="rounded-full" size="lg" variant="secondary">
						<a href={LINKS.github} rel="noreferrer" target="_blank">
							<GithubIcon className="size-4" data-icon="inline-start" />
							GitHub
						</a>
					</Button>
					<Button asChild className="rounded-full" size="lg">
						<a href={`${LINKS.docs}/quick-start`}>
							Get started
							<ArrowRightIcon data-icon="inline-end" />
						</a>
					</Button>
				</div>

				<InstallCommand className="fade-in slide-in-from-bottom-10 animate-in fill-mode-backwards delay-500 duration-500 ease-out" />
			</div>
		</section>
	);
}
