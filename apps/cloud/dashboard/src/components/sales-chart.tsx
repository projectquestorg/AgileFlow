"use client";

import { useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";
import { formatDate } from "@/components/formater";
import {
	Card,
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta";

type PeriodDays = 7 | 30;

/** One row per day: ISO `date`, `retail` / `online` = sales counts (units sold). */
type SalesChartRow = {
	date: string;
	retail: number;
	online: number;
};

/**
 * Demo Data.
 */
const chartData: SalesChartRow[] = [
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

function parseChartDay(isoDate: string) {
	return new Date(`${isoDate}T12:00:00`);
}

/** Last day in `chartData`; used as the end of the “last N days” window. */
const lastChartRow = chartData.at(-1);
if (lastChartRow === undefined) {
	throw new Error("SalesChart: chartData must include at least one row");
}
const salesChartReferenceDate = parseChartDay(lastChartRow.date);

function rowTotal(row: SalesChartRow) {
	return row.retail + row.online;
}

const chartConfig = {
	retail: {
		label: "Retail",
		color: "var(--chart-2)",
	},
	online: {
		label: "Online",
		color: "var(--chart-3)",
	},
} satisfies ChartConfig;

const animationConfig = {
	glowWidth: 520,
};

function highlightXFromChartMouseEvent(e: unknown): number | null {
	const ex = e as {
		activeCoordinate?: { x?: number; y?: number };
		chartX?: number;
	};
	const fromActive = ex.activeCoordinate?.x;
	if (typeof fromActive === "number" && Number.isFinite(fromActive)) {
		return fromActive;
	}
	const legacy = ex.chartX;
	if (typeof legacy === "number" && Number.isFinite(legacy)) {
		return legacy;
	}
	return null;
}

export function SalesChart() {
	const chartUid = useId().replace(/:/g, "");
	const idMaskGrad = `sales-chart-mask-grad-${chartUid}`;
	const idMask = `sales-chart-highlight-mask-${chartUid}`;

	const [periodDays, setPeriodDays] = useState<PeriodDays>(7);
	const [xAxis, setXAxis] = useState<number | null>(null);

	const chartRows = useMemo(() => {
		const startDate = new Date(salesChartReferenceDate);
		startDate.setDate(startDate.getDate() - periodDays);
		return chartData.filter((item) => parseChartDay(item.date) >= startDate);
	}, [periodDays]);

	const growthPctNum = useMemo(() => {
		const first = chartRows[0];
		if (!first) {
			return 0;
		}
		const last = chartRows.at(-1);
		if (!last) {
			return 0;
		}
		const a = rowTotal(first);
		const b = rowTotal(last);
		if (!a) {
			return 0;
		}
		return ((b - a) / a) * 100;
	}, [chartRows]);

	const xAxisMinTickGap: number | undefined = periodDays > 7 ? 32 : undefined;

	const idGradOnline = `sales-chart-grad-online-${chartUid}`;
	const idGradRetail = `sales-chart-grad-retail-${chartUid}`;

	return (
		<Card className="rounded-none border-0 bg-background py-4 shadow-none ring-0 lg:col-span-3">
			<CardHeader>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="min-w-0 space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<CardTitle className="text-base">Sales</CardTitle>
							<Delta value={growthPctNum} variant="badge">
								<DeltaIcon variant="trend" />
								<DeltaValue />
							</Delta>
						</div>
						<CardDescription>
							Daily sales count by channel, last {periodDays} days.
						</CardDescription>
					</div>
					<Select
						onValueChange={(v) => {
							const n = Number(v);
							if (n === 7 || n === 30) {
								setPeriodDays(n);
							}
						}}
						value={String(periodDays)}
					>
						<SelectTrigger
							aria-label="Sales chart time range"
							className="w-full min-w-36 sm:w-fit"
							size="sm"
						>
							<SelectValue placeholder="Range" />
						</SelectTrigger>
						<SelectContent align="end">
							<SelectItem value="7">Last 7 days</SelectItem>
							<SelectItem value="30">Last 30 days</SelectItem>
						</SelectContent>
					</Select>
				</div>
			</CardHeader>
			<CardContent>
				<ChartContainer
					className="aspect-21/9 min-h-48 w-full p-0"
					config={chartConfig}
				>
					<AreaChart
						// accessibilityLayer
						data={chartRows}
						margin={{
							left: 4,
							right: 12,
							top: 8,
						}}
						onMouseLeave={() => setXAxis(null)}
						onMouseMove={(e) => setXAxis(highlightXFromChartMouseEvent(e))}
					>
						<CartesianGrid
							className="stroke-border"
							strokeDasharray="3 3"
							vertical={false}
						/>
						<XAxis
							axisLine={false}
							dataKey="date"
							interval={periodDays <= 7 ? 0 : "preserveStartEnd"}
							minTickGap={xAxisMinTickGap}
							tickFormatter={(value) => formatDate(String(value), "day-month")}
							tickLine={false}
							tickMargin={8}
						/>
						<ChartTooltip content={<ChartTooltipContent />} cursor={false} />

						<defs>
							<linearGradient id={idMaskGrad} x1="0" x2="1" y1="0" y2="0">
								<stop offset="0%" stopColor="transparent" />
								<stop offset="28%" stopColor="white" stopOpacity={0.55} />
								<stop offset="50%" stopColor="white" />
								<stop offset="72%" stopColor="white" stopOpacity={0.55} />
								<stop offset="100%" stopColor="transparent" />
							</linearGradient>
							<linearGradient id={idGradOnline} x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-online)"
									stopOpacity={0.4}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-online)"
									stopOpacity={0}
								/>
							</linearGradient>
							<linearGradient id={idGradRetail} x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="5%"
									stopColor="var(--color-retail)"
									stopOpacity={0.4}
								/>
								<stop
									offset="95%"
									stopColor="var(--color-retail)"
									stopOpacity={0}
								/>
							</linearGradient>
							{typeof xAxis === "number" && Number.isFinite(xAxis) ? (
								<mask id={idMask}>
									<rect
										fill={`url(#${idMaskGrad})`}
										height="100%"
										width={animationConfig.glowWidth}
										x={xAxis - animationConfig.glowWidth / 2}
										y={0}
									/>
								</mask>
							) : null}
						</defs>
						<Area
							dataKey="online"
							fill={`url(#${idGradOnline})`}
							fillOpacity={0.4}
							mask={`url(#${idMask})`}
							stackId="a"
							stroke="var(--color-online)"
							strokeWidth={0.8}
							type="linear"
						/>
						<Area
							dataKey="retail"
							fill={`url(#${idGradRetail})`}
							fillOpacity={0.4}
							mask={`url(#${idMask})`}
							stackId="a"
							stroke="var(--color-retail)"
							strokeWidth={0.8}
							type="linear"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
