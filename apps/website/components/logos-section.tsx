import { LogoCloud } from "@/components/logo-cloud"; // @efferd/logo-cloud-3

export function LogosSection() {
	return (
		<section className="relative space-y-4 py-10">
			<h2 className="text-center font-medium text-lg text-muted-foreground tracking-tight md:text-xl">
				Works with the <span className="text-foreground">coding agents you already use</span>
			</h2>
			<div className="relative z-10 mx-auto max-w-4xl">
				<LogoCloud />
			</div>
		</section>
	);
}
