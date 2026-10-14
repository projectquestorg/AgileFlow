import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { DashboardCard } from "@/components/dashboard-card";
import { CreditCardIcon, UserPlusIcon, FileTextIcon, RocketIcon } from "lucide-react";

const items = [
	{
		title: "Invoice #1045 marked paid",
		time: "About 2 hours ago",
		icon: (
			<CreditCardIcon
			/>
		),
	},
	{
		title: "Jordan joined the team",
		time: "This morning",
		icon: (
			<UserPlusIcon
			/>
		),
	},
	{
		title: "Weekly summary exported",
		time: "Yesterday",
		icon: (
			<FileTextIcon
			/>
		),
	},
	{
		title: "Dashboard v2 shipped to prod",
		time: "2 days ago",
		icon: (
			<RocketIcon
			/>
		),
	},
] as const;

export function DashboardActivity() {
	return (
		<DashboardCard className="gap-0">
			<CardHeader className="border-b">
				<CardTitle >Activity</CardTitle>
				<CardDescription>Latest updates in your workspace.</CardDescription>
			</CardHeader>
			<CardContent className="px-0">
				<ul className="flex flex-col divide-y divide-border">
					{items.map((item) => (
						<li className="flex h-16 items-center gap-3 px-6" key={item.title}>
							<span
								aria-hidden="true"
								className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4"
							>
								{item.icon}
							</span>
							<div className="min-w-0 flex-1 space-y-1">
								<p className="line-clamp-1 text-pretty text-foreground text-sm leading-snug">
									{item.title}
								</p>
								<p className="text-muted-foreground text-xs">{item.time}</p>
							</div>
						</li>
					))}
				</ul>
			</CardContent>
		</DashboardCard>
	);
}
