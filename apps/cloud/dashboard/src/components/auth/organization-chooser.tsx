import { useState } from "react";
import { useOrganizationList } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Notice } from "@/components/common";
import { clerkMessage } from "@/components/auth/clerk-error";
import { continueExternal } from "@/lib/auth-keys";
import { ChevronRightIcon, PlusIcon } from "lucide-react";

/** After choosing, continue a pending OAuth request (CLI sign-in) or open the app. */
function done() {
	if (!continueExternal()) location.hash = "#/";
}

/** Choose one of the user's organizations, or create one. */
export function OrganizationChooser() {
	const { isLoaded, userMemberships, setActive, createOrganization } = useOrganizationList({ userMemberships: { infinite: true } });
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const choose = async (orgId: string) => {
		setBusy(orgId);
		setError(null);
		try {
			await setActive!({ organization: orgId });
			done();
		} catch (err) {
			setError(clerkMessage(err));
		} finally {
			setBusy(null);
		}
	};

	const create = async (e: React.FormEvent) => {
		e.preventDefault();
		setBusy("create");
		setError(null);
		try {
			const org = await createOrganization!({ name: name.trim() });
			await setActive!({ organization: org.id });
			done();
		} catch (err) {
			setError(clerkMessage(err));
		} finally {
			setBusy(null);
		}
	};

	const items = userMemberships.data ?? [];
	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>{creating ? "Create an organization" : "Choose an organization"}</CardTitle>
				<CardDescription>AgileFlow projects live in an organization workspace shared with your team.</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!isLoaded || userMemberships.isLoading ? (
					<div className="flex justify-center py-4"><Spinner /></div>
				) : creating ? (
					<form onSubmit={create} className="flex flex-col gap-4">
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor="org-name">Organization name</FieldLabel>
								<Input id="org-name" required maxLength={100} placeholder="Acme" value={name} onChange={(e) => setName(e.target.value)} />
							</Field>
						</FieldGroup>
						<Button type="submit" disabled={!!busy}>
							{busy === "create" ? <Spinner data-icon="inline-start" /> : null}
							Create organization
						</Button>
						{items.length ? <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Back to your organizations</Button> : null}
					</form>
				) : (
					<>
						{items.length ? (
							<ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
								{items.map((m) => (
									<li key={m.id}>
										<button
											type="button"
											onClick={() => void choose(m.organization.id)}
											disabled={!!busy}
											className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
										>
											<Avatar className="size-7 rounded-md"><AvatarFallback className="rounded-md">{m.organization.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
											<span className="min-w-0 flex-1">
												<span className="block truncate font-medium">{m.organization.name}</span>
												<span className="block text-xs text-muted-foreground">{m.role.replace(/^org:/, "")}</span>
											</span>
											{busy === m.organization.id ? <Spinner /> : <ChevronRightIcon className="size-4 text-muted-foreground" />}
										</button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">You are not in an organization yet. Create one, or ask a teammate to invite you.</p>
						)}
						{userMemberships.hasNextPage ? <Button variant="ghost" onClick={() => userMemberships.fetchNext?.()}>Show more</Button> : null}
						<Button variant="outline" onClick={() => setCreating(true)}>
							<PlusIcon data-icon="inline-start" />
							Create organization
						</Button>
					</>
				)}
				{error ? <Notice role="alert" title="Could not switch organization">{error}</Notice> : null}
			</CardContent>
		</Card>
	);
}
