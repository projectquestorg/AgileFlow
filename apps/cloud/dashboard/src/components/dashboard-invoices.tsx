"use client";

import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

const invoices = [
	{
		id: "1045",
		customer: "Northwind Labs",
		amount: "$2,400.00",
		status: "Paid",
		variant: "secondary" as const,
	},
	{
		id: "1044",
		customer: "Blue River Co.",
		amount: "$890.00",
		status: "Pending",
		variant: "outline" as const,
	},
	{
		id: "1043",
		customer: "Oak Street Studio",
		amount: "$5,120.00",
		status: "Paid",
		variant: "secondary" as const,
	},
	{
		id: "1042",
		customer: "Harbor Freight LLC",
		amount: "$310.50",
		status: "Overdue",
		variant: "destructive" as const,
	},
] as const;

export function DashboardInvoices() {
	return (
		<Card className="rounded-none bg-background shadow-none ring-0 lg:col-span-3">
			<CardHeader>
				<CardTitle >Recent invoices</CardTitle>
				<CardDescription>Open amounts and payment status.</CardDescription>
			</CardHeader>
			<CardContent className="px-0 pb-2">
				<Table className="border-t">
					<TableCaption className="sr-only">
						Recent invoices with customer, amount, and status.
					</TableCaption>
					<TableHeader>
						<TableRow>
							<TableHead className="pl-6">Customer</TableHead>
							<TableHead>Invoice</TableHead>
							<TableHead className="text-right tabular-nums">Amount</TableHead>
							<TableHead className="pr-6 text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{invoices.map((inv) => (
							<TableRow className="h-14" key={inv.id}>
								<TableCell className="max-w-40 truncate pl-6 font-medium">
									{inv.customer}
								</TableCell>
								<TableCell className="text-muted-foreground tabular-nums">
									#{inv.id}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{inv.amount}
								</TableCell>
								<TableCell className="pr-6 text-right">
									<Badge variant={inv.variant}>{inv.status}</Badge>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
