import { cn } from "@/lib/utils";

export function DashboardSkeleton() {
	return (
		<div className="flex flex-1 flex-col gap-4">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading font-semibold text-xl leading-tight">
					Welcome back, Shaban!
				</h1>
				<p className="text-base text-muted-foreground">
					let’s get things done.
				</p>
			</div>
			<div
				className={cn(
					"grid grid-cols-2 gap-px bg-border p-px lg:grid-cols-3",
					"*:min-h-36 *:w-full *:bg-background"
				)}
			>
				<div />
				<div />
				<div />
				<div className="col-span-1 min-h-80! md:col-span-2" />
				<div className="col-span-2 min-h-80! md:col-span-1" />
				<div className="col-span-2 min-h-80! md:col-span-3" />
			</div>
		</div>
	);
}
