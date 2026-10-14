import { DashboardInvoices } from "@/components/dashboard-invoices";
import { SalesChart } from "@/components/sales-chart";
import { DashboardStats } from "@/components/stats";

export function Dashboard() {
	return (
		<div className="flex flex-1 flex-col gap-6 py-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading font-semibold text-xl leading-tight">
					Welcome back, Shaban!
				</h1>
				<p className="text-base text-muted-foreground">
					let's get things done.
				</p>
			</div>
			<div className="rounded-lg overflow-hidden border">
				<div className="grid grid-cols-1 gap-px bg-border lg:grid-cols-3">
					<DashboardStats />
					<SalesChart />
					<DashboardInvoices />
				</div>
			</div>
		</div>
	);
}
