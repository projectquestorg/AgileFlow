import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LINKS } from "@/lib/links";

type LogoType = {
	src: string;
	alt: string;
	/** Filter that keeps this logo legible on the dark background. */
	className?: string;
};

type TileData = {
	row: number;
	col: number;
	logo?: LogoType;
};

export function Integrations() {
	return (
		<section className="relative grid scroll-mt-24 grid-cols-1 gap-12 py-16 md:grid-cols-2 md:items-center md:py-20" id="providers">

			{/* Left Content */}
			<div className="px-4 md:px-8">
				<div className="space-y-4">
					<h2 className="font-medium text-3xl tracking-tight text-balance md:text-5xl text-foreground">
						Works with the agent you already use
					</h2>
					<p className="text-muted-foreground text-sm md:text-base">
						Codex, Cursor, OpenCode, and Gemini CLI read .agents/skills
						natively. Claude Code gets per-skill links. T3 Code runs them all.
					</p>
					<Button asChild size="sm">
						<a href={`${LINKS.docs}/concepts/providers`}>Provider support</a>
					</Button>
				</div>
			</div>

			{/* Right Content - Visual */}
			<div className="place-items-end">
				<div className="relative size-80">
					{/* Grid Background */}
					<div
						className={cn(
							"absolute inset-0 size-full",
							"bg-[linear-gradient(to_right,#27272A_1px,transparent_1px),linear-gradient(to_bottom,#27272A_1px,transparent_1px)]",
							"[background-size:64px_64px]",
							"[mask-image:radial-gradient(ellipse_at_center,black,black,transparent)]"
						)}
					/>

					{tiles.map((tile) => (
						<IntegrationCard key={`${tile.row}_${tile.col}`} {...tile} />
					))}
				</div>
			</div>

		</section>
	);
}

function IntegrationCard({ row, col, logo }: TileData) {
	return (
		<div
			className={cn(
				"absolute flex size-16 items-center justify-center",
				logo ? "bg-secondary/40" : "" // Styling for empty tiles
			)}
			style={{
				left: col * 64, // 64px cell
				top: row * 64,
			}}
		>
			{logo && (
				<img
					alt={logo.alt}
					className={cn(
						"pointer-events-none size-8 select-none object-contain p-1", logo.className
					)}
					height={40}
					src={logo.src}
					width={40}
				/>
			)}
		</div>
	);
}

// Coordinate mapping for the scattered look. Grid 5x5 of 64px cells.
const agent = (file: string, alt: string, className: string): LogoType => ({ src: `/logos/agents/${file}.svg`, alt, className });

const tiles: TileData[] = [
	{ row: 0, col: 1, logo: agent("claude-code", "Claude Code", "brightness-0 invert") },
	{ row: 0, col: 3, logo: agent("codex", "Codex", "") },
	{ row: 1, col: 0 },
	{ row: 1, col: 2, logo: agent("cursor", "Cursor", "brightness-0 invert") },
	{ row: 1, col: 4 },
	{ row: 2, col: 1, logo: agent("opencode", "OpenCode", "invert") },
	{ row: 2, col: 3 },
	{ row: 3, col: 0 },
	{ row: 3, col: 2, logo: agent("gemini", "Gemini CLI", "brightness-0 invert") },
	{ row: 3, col: 4 },
	{ row: 4, col: 1 },
	{ row: 4, col: 3, logo: agent("t3-code", "T3 Code", "") },
];
