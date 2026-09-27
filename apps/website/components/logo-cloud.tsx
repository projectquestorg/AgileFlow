import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { cn } from "@/lib/utils";

/**
 * Coding agents and hosts AgileFlow skills work with. Logos from svglogos.dev
 * (T3 Code: official mark), self-hosted in public/logos/agents. Each gets the treatment that keeps it
 * legible on the near-black, achromatic site.
 */
const agents = [
	{ name: "Claude Code", src: "/logos/agents/claude-code.svg", className: "brightness-0 invert" },
	{ name: "Codex", src: "/logos/agents/codex.svg", className: "" },
	{ name: "Cursor", src: "/logos/agents/cursor.svg", className: "brightness-0 invert" },
	{ name: "OpenCode", src: "/logos/agents/opencode.svg", className: "invert" },
	{ name: "Gemini CLI", src: "/logos/agents/gemini.svg", className: "brightness-0 invert" },
	{ name: "T3 Code", src: "/logos/agents/t3-code.svg", className: "" },
];

export function LogoCloud() {
	return (
		<div className="[mask-image:linear-gradient(to_right,transparent,black,transparent)] overflow-hidden py-4">
			<InfiniteSlider gap={56} reverse speed={60} speedOnHover={25}>
				{agents.map((agent) => (
					<div className="flex select-none items-center gap-2.5" key={agent.name}>
						<img
							alt=""
							aria-hidden="true"
							className={cn("pointer-events-none size-6 object-contain md:size-7", agent.className)}
							height={28}
							loading="lazy"
							src={agent.src}
							width={28}
						/>
						<span className="whitespace-nowrap font-medium text-foreground/80 text-sm md:text-base">{agent.name}</span>
					</div>
				))}
			</InfiniteSlider>
		</div>
	);
}
