import type React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** One bordered surface split into cells by hairlines (the dashboard block layout). */
export function PanelGrid({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<div className="shrink-0 overflow-hidden rounded-lg border">
			<div className={cn("grid grid-cols-1 gap-px bg-border", className)}>{children}</div>
		</div>
	);
}

/** A cell in a PanelGrid. */
export function Panel({
	title,
	description,
	action,
	className,
	contentClassName,
	children,
}: {
	title?: React.ReactNode;
	description?: React.ReactNode;
	action?: React.ReactNode;
	className?: string;
	contentClassName?: string;
	children?: React.ReactNode;
}) {
	return (
		<Card className={cn("rounded-none border-0 bg-background py-4 shadow-none ring-0", className)}>
			{title || description || action ? (
				<CardHeader>
					{title ? <CardTitle className="text-base">{title}</CardTitle> : null}
					{description ? <CardDescription>{description}</CardDescription> : null}
					{action ? <CardAction>{action}</CardAction> : null}
				</CardHeader>
			) : null}
			{children ? <CardContent className={contentClassName}>{children}</CardContent> : null}
		</Card>
	);
}

/** A number cell; links to its detail page when `to` is set. */
export function StatPanel({ label, value, hint, to, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; to?: string; className?: string }) {
	const body = (
		<Card className={cn("h-full rounded-none border-0 bg-background shadow-none ring-0", to && "transition-colors hover:bg-muted/40", className)}>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="font-normal text-muted-foreground text-xs tracking-wide">{label}</CardTitle>
				{hint ? <CardDescription className="text-xs tabular-nums">{hint}</CardDescription> : null}
			</CardHeader>
			<CardContent>
				<p className="font-medium text-xl tabular-nums">{value}</p>
			</CardContent>
		</Card>
	);
	return to ? (
		<Link to={to} className="outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
			{body}
		</Link>
	) : (
		body
	);
}
