import { QuoteIcon } from "lucide-react";

type Testimonial = {
	quote: string;
	name: string;
	role: string;
	company?: string;
};

// PLACEHOLDER testimonials: fictional people and companies, for layout only.
// Replace with real, permissioned quotes before publishing to production.
const testimonials: Testimonial[] = [
	{
		quote:
			"We run Claude Code and Codex side by side. AgileFlow means one set of skills instead of two copies that drift apart.",
		name: "Priya Raman",
		role: "Staff Engineer",
		company: "Halcyon Robotics",
	},
	{
		quote:
			"agileflow update with a lockfile is the first time our agent instructions have had real versioning. Our local edits never get clobbered.",
		name: "Marcus Ortega",
		role: "Engineering Manager",
		company: "Tessellate",
	},
	{
		quote:
			"The evals sold me. We rewrote a skill description and could actually measure whether it activated more often.",
		name: "Dana Whitfield",
		role: "Platform Lead",
		company: "Fernwood Health",
	},
]

export function TestimonialsSection() {
	return (
		<section className="relative w-full scroll-mt-14" id="testimonials">
			<div className="grid md:grid-cols-[2fr_1px_1fr]">
				<div className="divide-y">
					{testimonials.slice(0, 2).map((testimonial) => (
						<TestimonialCard key={testimonial.name} testimonial={testimonial} />
					))}
				</div>
				<div className="h-px bg-border md:h-auto" />
				<div className="flex items-center">
					<TestimonialCard testimonial={testimonials[2] as Testimonial} />
				</div>
			</div>
		</section>
	);
}

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
	const { quote, name, role, company } = testimonial;

	return (
		<figure className="p-6 md:p-8">
			<QuoteIcon aria-hidden="true" className="mb-4 size-12 stroke-1 text-muted-foreground" />

			<blockquote className="mb-6 font-normal text-base text-foreground md:text-lg">
				&quot;{quote}&quot;
			</blockquote>

			<figcaption className="flex flex-col gap-0.5">
				<cite className="font-medium text-foreground text-lg not-italic">
					{name}
				</cite>
				<p className="text-muted-foreground text-sm">
					{role}
					{company && `, ${company}`}
				</p>
			</figcaption>
		</figure>
	);
}
