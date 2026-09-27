import { cn } from "@/lib/utils";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { LINKS } from "@/lib/links";

export function Footer() {
	return (
		<footer
			className={cn(
				"relative",
				"bg-[radial-gradient(60%_100%_at_15%_0%,rgba(255,255,255,0.05),transparent_75%)]"
			)}
		>
			<div className="grid max-w-5xl grid-cols-6 gap-6 p-4">
				<div className="col-span-6 flex flex-col gap-4 pt-5 md:col-span-4">
					<a className="w-max" href="#top">
						<img alt="AgileFlow" className="h-8 w-auto" height={32} src="/brand/agileflow-lockup-dark.png" width={124} />
					</a>
					<p className="max-w-sm text-balance text-muted-foreground text-sm">
						Portable workflows for coding agents. Small, versioned skills. No agent runtime.
					</p>
					<div className="flex gap-2">
						{socialLinks.map((item, index) => (
							<Button
								asChild
								key={`social-${item.link}-${index}`}
								size="icon"
								variant="outline"
							>
								<a aria-label={item.label} href={item.link} rel="noreferrer" target="_blank">
									{item.icon}
								</a>
							</Button>
						))}
					</div>
				</div>
				<div className="col-span-3 w-full md:col-span-1">
					<span className="text-muted-foreground text-xs">Resources</span>
					<div className="mt-2 flex flex-col gap-2">
						{resources.map(({ href, title }) => (
							<a
								className="w-max text-sm hover:underline"
								href={href}
								key={title}
							>
								{title}
							</a>
						))}
					</div>
				</div>
				<div className="col-span-3 w-full md:col-span-1">
					<span className="text-muted-foreground text-xs">Community</span>
					<div className="mt-2 flex flex-col gap-2">
						{company.map(({ href, title }) => (
							<a
								className="w-max text-sm hover:underline"
								href={href}
								key={title}
							>
								{title}
							</a>
						))}
					</div>
				</div>
			</div>
			<FullWidthDivider />
			<div className="flex items-center justify-center gap-2 py-4">
				<p className="text-center font-light text-muted-foreground text-sm">
					&copy; {new Date().getFullYear()} AgileFlow. MIT License.
				</p>
			</div>
		</footer>
	);
}

const company = [
	{ title: "GitHub", href: LINKS.github },
	{ title: "Discussions", href: `${LINKS.github}/discussions` },
	{ title: "Issues", href: `${LINKS.github}/issues` },
	{ title: "Contributing", href: `${LINKS.github}/blob/main/README.md` },
];

const resources = [
	{ title: "Docs", href: LINKS.docs },
	{ title: "Quick start", href: `${LINKS.docs}/quick-start` },
	{ title: "Changelog", href: `${LINKS.github}/blob/main/apps/cli/CHANGELOG.md` },
	{ title: "npm", href: "https://www.npmjs.com/package/agileflow" },
];

const socialLinks = [{ icon: <GithubIcon />, label: "AgileFlow on GitHub", link: LINKS.github }];
