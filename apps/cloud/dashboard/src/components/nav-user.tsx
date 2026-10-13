import { useNavigate } from "react-router-dom";
import { OrganizationSwitcher, UserButton } from "@clerk/clerk-react";
import {
	Avatar,
	AvatarFallback,
} from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp, useAuthValue } from "@/lib/app-context";
import { FolderKanbanIcon, PlugIcon, LogOutIcon } from "lucide-react";

export function NavUser() {
	const auth = useAuthValue();
	const { me } = useApp();
	const navigate = useNavigate();

	if (auth.mode === "clerk") {
		return (
			<div className="flex items-center gap-3">
				<div className="hidden md:block">
					<OrganizationSwitcher hidePersonal={false} afterSelectOrganizationUrl="/#/" afterCreateOrganizationUrl="/#/" />
				</div>
				<UserButton />
			</div>
		);
	}

	const ident = auth.devIdentity;
	const name = ident?.name || ident?.userId || me.user.id;
	const role = me.user.role;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger aria-label="Account menu" className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><Avatar className="size-8 cursor-pointer"><AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar></DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel className="pointer-events-none flex items-center gap-2">
						<Avatar className="isolate size-8">
							<AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<span className="font-medium text-foreground">{name}</span>{" "}
							<br />
							<div className="truncate text-muted-foreground text-xs">
								{me.user.id}{role ? ` - ${role}` : ""}
							</div>
							<div className="truncate text-muted-foreground text-xs">
								{me.workspace ? me.workspace.name : "No organization"} - development sign-in
							</div>
						</div>
					</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={() => navigate("/")}>
						<FolderKanbanIcon />
						Projects
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => navigate("/connect")}>
						<PlugIcon />
						Connection diagnostics
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={auth.signOut}>
						<LogOutIcon />
						Sign out
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
