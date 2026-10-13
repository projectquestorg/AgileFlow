import { RouterLink } from "@/components/router-link";
import { Fragment, type ReactNode } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Current page segment shown in the header — pass a nav item or `{ title, icon? }`. */
export type AppBreadcrumbPage = {
	title: string;
	icon?: ReactNode;
};

export type AppBreadcrumbTrail = Array<{ title: string; href?: string }>;

export function AppBreadcrumbs({ page, trail = [] }: { page?: AppBreadcrumbPage | null; trail?: AppBreadcrumbTrail }) {
	if (!page?.title && !trail.length) {
		return null;
	}

	return (
		<Breadcrumb>
			<BreadcrumbList>
				{trail.map((t, i) => (
					<Fragment key={`${t.title}-${i}`}>
						<BreadcrumbItem className="hidden max-w-48 truncate md:inline-flex">
							{t.href ? <BreadcrumbLink render={<RouterLink href={t.href} />}>{t.title}</BreadcrumbLink> : <span>{t.title}</span>}
						</BreadcrumbItem>
						<BreadcrumbSeparator className="hidden md:block" />
					</Fragment>
				))}
				{page?.title ? (
					<BreadcrumbItem>
						<BreadcrumbPage className="flex items-center gap-2 [&>svg]:size-3.5">
							{page.icon}
							{page.title}
						</BreadcrumbPage>
					</BreadcrumbItem>
				) : null}
			</BreadcrumbList>
		</Breadcrumb>
	);
}
