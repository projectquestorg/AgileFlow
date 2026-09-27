import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "lucide-react";
import { LINKS } from "@/lib/links";

// @efferd/cta-1, fitted to the page frame (the page draws the surrounding lines).
export function CallToAction() {
	return (
		<div className="relative flex w-full flex-col justify-between md:flex-row md:items-center">
			<div className="space-y-1 border-b p-6 md:border-b-0 md:px-8">
				<h2 className="text-center font-medium text-xl tracking-tight md:text-left md:text-2xl">
					Start using AgileFlow today.
				</h2>
				<p className="text-center text-muted-foreground text-sm md:text-left">Free and open source. MIT licensed.</p>
			</div>
			<div className="flex items-center justify-center gap-2 self-stretch p-6 md:border-l md:px-8">
				<Button asChild variant="secondary">
					<a href={LINKS.docs}>Read the docs</a>
				</Button>
				<Button asChild>
					<a href={`${LINKS.docs}/quick-start`}>
						Get started
						<ArrowRightIcon data-icon="inline-end" />
					</a>
				</Button>
			</div>
		</div>
	);
}
