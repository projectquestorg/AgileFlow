import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { DecorIcon } from "@/components/decor-icon";
import { LINKS } from "@/lib/links";

export function FaqsSection() {
	return (
		<section className="grid w-full scroll-mt-14 grid-cols-1 md:grid-cols-2" id="faq">
			<div className="px-4 py-16 md:px-8 md:py-20">
				<div className="space-y-5">
					<h2 className="font-medium text-3xl tracking-tight text-balance md:text-5xl">
						Frequently Asked Questions
					</h2>
					<p className="text-muted-foreground">
						What AgileFlow is, what it changes in your repository, and what it
						leaves alone.
					</p>
					<p className="text-muted-foreground">
						{"Can't find what you're looking for? "}
						<a className="text-primary hover:underline" href={`${LINKS.github}/discussions`}>
							Ask in GitHub Discussions
						</a>
					</p>
				</div>
			</div>
			<div className="relative place-content-center">
				{/* vertical guide line */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-3 h-full w-px bg-border"
				/>

				<Accordion
					className="rounded-none border-x-0 border-y"
					collapsible
					type="single"
				>
					{faqs.map((item) => (
						<AccordionItem
							className="group relative pl-5"
							key={item.id}
							value={item.id}
						>
							<DecorIcon
								className="left-[13px] size-3 group-last:hidden"
								position="bottom-left"
							/>

							<AccordionTrigger className="px-4 py-4 hover:no-underline focus-visible:underline focus-visible:ring-0">
								{item.title}
							</AccordionTrigger>

							<AccordionContent className="px-4 pb-4 text-muted-foreground">
								{item.content}
							</AccordionContent>
						</AccordionItem>
					))}
				</Accordion>
			</div>
		</section>
	);
}

const faqs = [
	{
		id: "item-1",
		title: "Is AgileFlow an agent framework?",
		content:
			"No. Your coding agent does the reasoning, planning, delegation, and tool use. AgileFlow installs, versions, and evaluates small skills that the agent loads when useful.",
	},
	{
		id: "item-2",
		title: "Which tools does it work with?",
		content:
			"Codex, Cursor, OpenCode, and Gemini CLI read .agents/skills natively. Claude Code is supported through per-skill links in .claude/skills. T3 Code works through whichever provider it runs.",
	},
	{
		id: "item-3",
		title: "What happens if I uninstall AgileFlow?",
		content:
			"Your skills keep working. They are standard SKILL.md files in provider-native locations, with no runtime dependency on AgileFlow.",
	},
	{
		id: "item-4",
		title: "Can I edit the official skills?",
		content:
			"Yes. Edit them in place, or run agileflow fork to own a skill outright. Updates never overwrite local changes; you choose fork, reset, or skip.",
	},
	{
		id: "item-5",
		title: "Does it change my repo or provider settings?",
		content:
			"It adds agileflow.yaml, agileflow.lock, the skills you chose, and Claude links if Claude is in use. No hooks, and no provider settings changes unless you explicitly ask.",
	},
	{
		id: "item-6",
		title: "Does AgileFlow still do epics and stories?",
		content:
			"Yes, opt-in: agileflow work init creates one docs/agile directory with product, roadmap, epics, stories, and decisions as Markdown. The CLI lists, shows, and moves work and computes the board from frontmatter. No sprints, points, or state files.",
	},
	{
		id: "item-7",
		title: "Is there a paid version?",
		content:
			"No. AgileFlow is free and open source under the MIT license.",
	},
];
