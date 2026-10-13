"use client";

import type * as React from "react";
import { Bar, BarChart, XAxis } from "recharts";
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

/** Demo: last 7 days. */
const salesDaily7 = [
	{ day: "Mon", sales: 3200 },
	{ day: "Tue", sales: 3001 },
	{ day: "Wed", sales: 3780 },
	{ day: "Thu", sales: 4100 },
	{ day: "Fri", sales: 4520 },
	{ day: "Sat", sales: 4004 },
	{ day: "Sun", sales: 5340 },
] as const;

const chartRows = salesDaily7.map((row) => ({ ...row }));

const firstDay = salesDaily7[0].sales;
const lastDay = salesDaily7.at(-1)?.sales ?? firstDay;
const growthPct = (((lastDay - firstDay) / firstDay) * 100).toFixed(1);

const chartConfig = {
	sales: {
		label: "Sales",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

function CustomGradientBar(
	props: React.SVGProps<SVGRectElement> & {
		index?: number;
		dataKey?: string | number;
	}
) {
	const {
		fill,
		x = 0,
		y = 0,
		width = 0,
		height = 0,
		dataKey = "sales",
		index = 0,
	} = props;
	const gid = `gradient-bar-${String(dataKey)}-${index}`;

	return (
		<>
			<rect
				fill={`url(#${gid})`}
				height={height}
				stroke="none"
				width={width}
				x={x}
				y={y}
			/>
			<rect fill={fill} height={2} stroke="none" width={width} x={x} y={y} />
			<defs>
				<linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={fill} stopOpacity={0.5} />
					<stop offset="100%" stopColor={fill} stopOpacity={0} />
				</linearGradient>
			</defs>
		</>
	);
}

export function NetRevenueChart() {
	return (
		<DashboardCard className="gap-0 md:col-span-2">
			<CardHeader className="gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<CardTitle >Net revenue</CardTitle>
					<Delta value={Number(growthPct)} variant="badge">
						<DeltaIcon variant="trend" />
						<DeltaValue />
					</Delta>
				</div>
				<CardDescription>Daily net sales, last 7 days.</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer
					className="aspect-auto h-60 w-full md:h-80"
					config={chartConfig}
				>
					<BarChart accessibilityLayer data={chartRows}>
						<XAxis
							axisLine={false}
							dataKey="day"
							interval={0}
							tickFormatter={(value) => String(value)}
							tickLine={false}
							tickMargin={10}
						/>
						<ChartTooltip
							content={<ChartTooltipContent hideLabel />}
							cursor={false}
						/>
						<Bar
							dataKey="sales"
							fill="var(--color-sales)"
							shape={<CustomGradientBar />}
						/>
					</BarChart>
				</ChartContainer>
			</CardContent>
		</DashboardCard>
	);
}
