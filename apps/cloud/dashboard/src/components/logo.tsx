import type React from "react";
import { cn } from "@/lib/utils";

/** AgileFlow mark (silver on transparent). */
export const LogoIcon = ({ className, ...props }: React.ComponentProps<"img">) => (
	<img alt="" src="/agileflow-mark.png" className={cn("size-5 shrink-0 object-contain", className)} {...props} />
);

/** AgileFlow mark plus wordmark. */
export const Logo = ({ className }: { className?: string }) => (
	<span className={cn("inline-flex items-center gap-2", className)}>
		<LogoIcon />
		<span className="font-heading font-semibold tracking-tight text-primary">AgileFlow</span>
	</span>
);
