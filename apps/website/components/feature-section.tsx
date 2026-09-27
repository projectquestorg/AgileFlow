import { cn } from "@/lib/utils";
import type React from "react";
import { DecorIcon } from "@/components/decor-icon";
import { FileTextIcon, FlaskConicalIcon, GitForkIcon, LockIcon } from "lucide-react";

type FeatureType = {
	title: string;
	icon: React.ReactNode;
	description: string;
};

export function FeatureSection() {
	return (
		<section className="flex w-full scroll-mt-24 flex-col justify-center gap-12 px-4 py-16 md:px-8 md:py-20" id="features">
			<div className="mx-auto max-w-2xl space-y-2 text-center">
				<h2 className="font-medium text-3xl tracking-tight text-balance md:text-5xl">
					A skill manager, not a framework
				</h2>
				<p className="text-muted-foreground text-sm leading-relaxed md:text-base">
					AgileFlow installs, updates, and evaluates standard Agent Skills.
					Your coding agent keeps doing the work.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
				{features.map((feature) => (
					<FeatureCard feature={feature} key={feature.title} />
				))}
			</div>
		</section>
	);
}

function FeatureCard({
	feature,
	className,
	...props
}: React.ComponentProps<"div"> & {
	feature: FeatureType;
}) {
	return (
		<div
			className={cn(
				"relative flex flex-col justify-between gap-6 px-6 pt-8 pb-6",
				// Soft glow that fades out into the page background
				"bg-[radial-gradient(90%_70%_at_20%_0%,rgba(255,255,255,0.06),transparent_70%)]",
				className
			)}
			{...props}
		>
			{/* Extended borders: longer than the card, fading out at both ends */}
			<div className="absolute -inset-y-12 -left-px w-px bg-border [mask-image:linear-gradient(to_bottom,transparent,black_3rem,black_calc(100%-3rem),transparent)]" />
			<div className="absolute -inset-y-12 -right-px w-px bg-border [mask-image:linear-gradient(to_bottom,transparent,black_3rem,black_calc(100%-3rem),transparent)]" />
			<div className="absolute -inset-x-12 -top-px h-px bg-border [mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)]" />
			<div className="absolute -inset-x-12 -bottom-px h-px bg-border [mask-image:linear-gradient(to_right,transparent,black_3rem,black_calc(100%-3rem),transparent)]" />

			{/* Corner Decor */}
			<DecorIcon className="size-3.5" position="top-left" />

			<div
				className={cn(
					"relative z-10 flex w-fit items-center justify-center rounded-lg border bg-muted/20 p-3",
					"[&_svg]:size-5 [&_svg]:stroke-[1.5] [&_svg]:text-foreground"
				)}
			>
				{feature.icon}
			</div>

			<div className="relative z-10 space-y-2 md:min-h-28">
				<h3 className="font-medium text-base text-foreground">
					{feature.title}
				</h3>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{feature.description}
				</p>
			</div>
		</div>
	);
}

const features: FeatureType[] = [
	{
		title: "Standard skills",
		icon: <FileTextIcon />,
		description: "Plain SKILL.md files in .agents/skills. Every provider reads the same copy.",
	},
	{
		title: "Versioned and locked",
		icon: <LockIcon />,
		description: "agileflow.yaml says what you want; agileflow.lock pins exact versions and hashes.",
	},
	{
		title: "Fork without fear",
		icon: <GitForkIcon />,
		description: "Edit or fork any skill. Updates never overwrite your changes.",
	},
	{
		title: "Evals, not vibes",
		icon: <FlaskConicalIcon />,
		description: "Every skill ships with evals, including prompts that must not trigger it.",
	},
];
