import { cn } from "@/lib/utils";
import type React from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";

type Stat = {
	label: string;
	value: string;
	delta: number;
};

const stats = [
	{
		label: "Active users",
		value: "847",
		delta: 3.1,
	},
	{
		label: "Revenue",
		value: "$18,290",
		delta: 12.4,
	},

	{
		label: "Conversion Rate",
		value: "3.28%",
		delta: -0.4,
	},
] as const;

export function DashboardStats() {
	return (
		<>
			{stats.map((s) => (
				<StatCard key={s.label} stat={s} />
			))}
		</>
	);
}

function StatCard({
	stat,
	className,
	...props
}: React.ComponentProps<typeof Card> & { stat: Stat }) {
	const { label, value, delta } = stat;
	return (
		<Card
			className={cn("rounded-none bg-background shadow-none ring-0", className)}
			{...props}
		>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="font-normal text-muted-foreground text-xs tracking-wide">
					{label}
				</CardTitle>
				<CardDescription className="flex items-center gap-1 text-xs tabular-nums">
					<Delta value={delta}>
						<DeltaIcon />
						<DeltaValue />
					</Delta>
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-row items-center gap-2">
				<p className="font-medium text-xl tabular-nums">{value}</p>
			</CardContent>
		</Card>
	);
}
