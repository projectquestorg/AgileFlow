import { cn } from "@/lib/utils";

/** AgileFlow lockup (mark + wordmark) for dark backgrounds. */
export function Logo({ className, ...props }: React.ComponentProps<"img">) {
	return (
		<img
			alt="AgileFlow"
			className={cn("h-5 w-auto", className)}
			height={24}
			src="/brand/agileflow-lockup-dark.png"
			width={120}
			{...props}
		/>
	);
}

/** AgileFlow mark only. */
export function LogoIcon({ className, ...props }: React.ComponentProps<"img">) {
	return <img alt="AgileFlow" className={cn("size-6", className)} height={24} src="/brand/agileflow-mark.png" width={24} {...props} />;
}
