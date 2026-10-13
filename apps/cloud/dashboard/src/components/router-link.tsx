import { forwardRef, type ComponentProps } from "react";
import { Link } from "react-router-dom";

/** An anchor that navigates through the hash router (accepts "#/path" or "/path"). */
export const RouterLink = forwardRef<HTMLAnchorElement, Omit<ComponentProps<"a">, "href"> & { href?: string }>(function RouterLink({ href = "/", ...props }, ref) {
	return <Link ref={ref} to={href.replace(/^#/, "") || "/"} {...props} />;
});
