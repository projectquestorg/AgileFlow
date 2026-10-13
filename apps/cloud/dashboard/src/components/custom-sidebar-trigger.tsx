import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function CustomSidebarTrigger() {
	return (
		<Tooltip>
			<TooltipTrigger delay={1000} render={<SidebarTrigger />} />
			<TooltipContent className="px-2 py-1" side="right">
				Toggle Sidebar{" "}
				<KbdGroup>
					<Kbd>⌘</Kbd>
					<Kbd>b</Kbd>
				</KbdGroup>
			</TooltipContent>
		</Tooltip>
	);
}
