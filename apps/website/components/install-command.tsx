"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Copyable install command, styled like the hero's pill badge. */
export function InstallCommand({ command = "npm install -g agileflow@next", className }: { command?: string; className?: string }) {
	const [copied, setCopied] = React.useState(false);

	async function copy() {
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard unavailable (e.g. insecure context): the command stays selectable.
		}
	}

	return (
		<div
			className={cn(
				"group flex w-fit items-center gap-3 rounded-full border bg-card/60 py-1 pr-1 pl-4 font-mono text-sm shadow-xs backdrop-blur-sm",
				className
			)}
		>
			<span aria-hidden="true" className="select-none text-muted-foreground">
				$
			</span>
			<code className="select-all text-foreground">{command}</code>
			<Button
				aria-label={copied ? "Copied" : "Copy install command"}
				className="size-8 rounded-full"
				onClick={copy}
				size="icon"
				variant="ghost"
			>
				{copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
			</Button>
		</div>
	);
}
