import { useNavigate } from "react-router-dom";
import { useOrganization, useOrganizationList, useUser } from "@clerk/clerk-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useApp, useAuthValue } from "@/lib/app-context";
import { CheckIcon, ChevronsUpDownIcon, FolderKanbanIcon, LogOutIcon, PlugIcon, PlusIcon } from "lucide-react";

type Account = { name: string; detail: string; avatar?: string };

/** Account menu in the sidebar footer; no third-party UI. */
function AccountMenu({ account, orgs }: { account: Account; orgs?: React.ReactNode }) {
	const auth = useAuthValue();
	const navigate = useNavigate();
	const { isMobile } = useSidebar();
	return (
		<SidebarMenu className="border-t p-2">
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger aria-label="Account menu" render={<SidebarMenuButton className="text-muted-foreground" />}>
						<Avatar className="size-5">
							{account.avatar ? <AvatarImage alt="" src={account.avatar} /> : null}
							<AvatarFallback>{account.name.charAt(0).toUpperCase()}</AvatarFallback>
						</Avatar>
						<span className="truncate font-medium text-sm">{account.name.split(" ")[0]}</span>
						<ChevronsUpDownIcon className="ml-auto size-3!" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-56" side={isMobile ? "bottom" : "right"} sideOffset={4}>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="pointer-events-none">
								<span className="block truncate font-medium text-foreground">{account.name}</span>
								<span className="block truncate text-muted-foreground text-xs">{account.detail}</span>
							</DropdownMenuLabel>
						</DropdownMenuGroup>
						{orgs}
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
						<DropdownMenuItem variant="destructive" onClick={auth.signOut}>
							<LogOutIcon />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}

function ClerkNavUser() {
	const { user } = useUser();
	const { organization } = useOrganization();
	const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
	const navigate = useNavigate();
	const name = user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "Account";
	const switchTo = async (orgId: string) => {
		await setActive?.({ organization: orgId });
		navigate("/");
	};
	const orgs = (
		<>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				<DropdownMenuLabel className="text-muted-foreground text-xs">Organizations</DropdownMenuLabel>
				{(userMemberships.data ?? []).map((m) => (
					<DropdownMenuItem key={m.id} onClick={() => void switchTo(m.organization.id)}>
						<Avatar className="size-4 rounded-sm"><AvatarFallback className="rounded-sm text-[9px]">{m.organization.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
						<span className="truncate">{m.organization.name}</span>
						{organization?.id === m.organization.id ? <CheckIcon className="ml-auto" /> : null}
					</DropdownMenuItem>
				))}
				<DropdownMenuItem onClick={() => navigate("/organizations")}>
					<PlusIcon />
					Create organization
				</DropdownMenuItem>
			</DropdownMenuGroup>
		</>
	);
	return <AccountMenu account={{ name, detail: user?.primaryEmailAddress?.emailAddress ?? "", avatar: user?.hasImage ? user.imageUrl : undefined }} orgs={orgs} />;
}

function DevNavUser() {
	const auth = useAuthValue();
	const { me } = useApp();
	const ident = auth.devIdentity;
	const name = ident?.name || ident?.userId || me.user.id;
	const detail = `${me.workspace ? me.workspace.name : "No organization"} - development sign-in`;
	return <AccountMenu account={{ name, detail }} />;
}

export function NavUser() {
	return useAuthValue().mode === "clerk" ? <ClerkNavUser /> : <DevNavUser />;
}
