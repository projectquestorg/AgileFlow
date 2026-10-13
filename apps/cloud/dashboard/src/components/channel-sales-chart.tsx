"use client";

import { useId } from "react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";
import { formatDate } from "@/components/formater";
import {
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";
import { DashboardCard } from "@/components/dashboard-card";

const VISIBLE_DAYS = 7;

/** One row per day: ISO `date`, `retail` / `online` = sales counts (units sold). */
type ChannelSalesChartRow = {
	date: string;
	retail: number;
	online: number;
};

/**
 * Demo Data.
 */
const chartData: ChannelSalesChartRow[] = [
	{ date: "2026-03-15", retail: 198, online: 96 },
	{ date: "2026-03-16", retail: 176, online: 82 },
	{ date: "2026-03-17", retail: 184, online: 88 },
	{ date: "2026-03-18", retail: 170, online: 80 },
	{ date: "2026-03-19", retail: 188, online: 90 },
	{ date: "2026-03-20", retail: 180, online: 85 },
	{ date: "2026-03-21", retail: 192, online: 92 },
	{ date: "2026-03-22", retail: 172, online: 78 },
	{ date: "2026-03-23", retail: 166, online: 74 },
	{ date: "2026-03-24", retail: 174, online: 79 },
	{ date: "2026-03-25", retail: 158, online: 72 },
	{ date: "2026-03-26", retail: 168, online: 76 },
	{ date: "2026-03-27", retail: 152, online: 70 },
	{ date: "2026-03-28", retail: 160, online: 74 },
	{ date: "2026-03-29", retail: 146, online: 68 },
	{ date: "2026-03-30", retail: 154, online: 71 },
	{ date: "2026-03-31", retail: 142, online: 65 },
	{ date: "2026-04-01", retail: 140, online: 63 },
	{ date: "2026-04-02", retail: 132, online: 59 },
	{ date: "2026-04-03", retail: 124, online: 56 },
	{ date: "2026-04-04", retail: 128, online: 58 },
	{ date: "2026-04-05", retail: 116, online: 52 },
	{ date: "2026-04-06", retail: 84, online: 40 },
	{ date: "2026-04-07", retail: 82, online: 38 },
	{ date: "2026-04-08", retail: 96, online: 46 },
	{ date: "2026-04-09", retail: 92, online: 69 },
	{ date: "2026-04-10", retail: 96, online: 62 },
	{ date: "2026-04-11", retail: 112, online: 75 },
	{ date: "2026-04-12", retail: 101, online: 77 },
	{ date: "2026-04-13", retail: 112, online: 78 },
];

/** Most recent daily rows shown in the chart. */
const chartRows = chartData.slice(-VISIBLE_DAYS);

function rowTotal(row: ChannelSalesChartRow) {
	return row.retail + row.online;
}

function growthPctForWindow(rows: readonly ChannelSalesChartRow[]) {
	const first = rows[0];
	if (!first) {
		return 0;
	}
	const last = rows.at(-1);
	if (!last) {
		return 0;
	}
	const a = rowTotal(first);
	const b = rowTotal(last);
	if (!a) {
		return 0;
	}
	return ((b - a) / a) * 100;
}

const growthPctNum = growthPctForWindow(chartRows);

const chartConfig = {
	retail: {
		label: "Retail",
		color: "var(--chart-2)",
	},
	online: {
		label: "Online",
		color: "var(--chart-1)",
	},
} satisfies ChartConfig;

export function ChannelSalesChart() {
	const chartUid = useId().replace(/:/g, "");
	const idLineGlow = `channel-sales-line-glow-${chartUid}`;

	return (
		<DashboardCard className="gap-0 md:col-span-2">
			<CardHeader>
				<div className="min-w-0 space-y-2">
					<div className="flex flex-wrap items-center gap-2">
						<CardTitle >Channel sales</CardTitle>
						<Delta value={growthPctNum} variant="badge">
							<DeltaIcon variant="trend" />
							<DeltaValue />
						</Delta>
					</div>
					<CardDescription>
						Daily sales count by channel, last {VISIBLE_DAYS} days.
					</CardDescription>
				</div>
			</CardHeader>
			<CardContent>
				<ChartContainer
					className="aspect-auto h-60 w-full p-0 md:h-80"
					config={chartConfig}
				>
					<LineChart
						accessibilityLayer
						data={chartRows}
						margin={{
							left: 12,
							right: 12,
							top: 8,
						}}
					>
						<CartesianGrid className="stroke-border" vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="date"
							interval={0}
							tickFormatter={(value) => formatDate(String(value), "day-month")}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							content={<ChartTooltipContent hideLabel />}
							cursor={false}
						/>
						<defs>
							<filter
								height="140%"
								id={idLineGlow}
								width="140%"
								x="-20%"
								y="-20%"
							>
								<feGaussianBlur result="blur" stdDeviation="10" />
								<feComposite in="SourceGraphic" in2="blur" operator="over" />
							</filter>
						</defs>
						<Line
							dataKey="online"
							dot={false}
							filter={`url(#${idLineGlow})`}
							stroke="var(--color-online)"
							strokeWidth={2}
							type="step"
						/>
						<Line
							dataKey="retail"
							dot={false}
							filter={`url(#${idLineGlow})`}
							stroke="var(--color-retail)"
							strokeWidth={2}
							type="step"
						/>
					</LineChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	);
}
