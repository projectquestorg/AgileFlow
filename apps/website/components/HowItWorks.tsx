import { Terminal, FolderTree, GitPullRequest } from "lucide-react";
import { motion } from "framer-motion";
import { Section } from "@/components/ui/Section";
import { Reveal } from "@/components/ui/reveal";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { MicroDemo } from "@/components/ui/MicroDemo";
import { Pill } from "@/components/ui/Pill";

export async function HowItWorks() {
  return (
    <Section id="how" alternate>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-4">
          <Reveal>
            <Pill>How it works</Pill>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="mt-5 text-2xl font-semibold tracking-tightish text-ink sm:text-3xl">
              Install, scaffold, run.
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-4 text-base leading-relaxed text-secondary">
              AgileFlow turns conventions into versioned files: templates,
              agents, ADRs, and commands that stay readable in git.
            </p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-6 text-sm text-muted">
              Everything is versioned. Nothing is hidden.
            </div>
          </Reveal>
        </div>

        <div className="lg:col-span-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            <motion.div
              whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2, z: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ transformStyle: "preserve-3d", perspective: 1000 }}
              className="group relative overflow-hidden rounded-card border border-border bg-white p-4 shadow-hairline transition duration-300 hover:shadow-tileHover sm:p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tightish">
                  <Terminal className="h-4 w-4 text-muted" />
                  Install
                </div>
                <span className="text-xs font-medium tracking-caps text-muted">
                  step 01
                </span>
              </div>

              <div className="mt-4">
                <div className="rounded-tile border border-border bg-panel p-2">
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <input
                      defaultChecked
                      type="radio"
                      name="installTab"
                      id="install-npm"
                      className="peer/npm sr-only"
                    />
                    <input
                      type="radio"
                      name="installTab"
                      id="install-npx"
                      className="peer/npx sr-only"
                    />
                    <label
                      htmlFor="install-npm"
                      className="cursor-pointer rounded-full border border-transparent bg-white px-3 py-2 text-center font-medium text-secondary transition peer-checked/npm:border-border peer-checked/npm:text-ink"
                    >
                      npm
                    </label>
                    <label
                      htmlFor="install-npx"
                      className="cursor-pointer rounded-full border border-transparent bg-white px-3 py-2 text-center font-medium text-secondary transition peer-checked/npx:border-border peer-checked/npx:text-ink"
                    >
                      npx
                    </label>

                    <div className="col-span-2 mt-2 hidden peer-checked/npm:block">
                      <CodeBlock
                        label="Install"
                        lang="bash"
                        code="npm install -D agileflow"
                      />
                    </div>
                    <div className="col-span-2 mt-2 hidden peer-checked/npx:block">
                      <CodeBlock
                        label="Setup"
                        lang="bash"
                        code="npx agileflow setup"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 h-16 sm:h-20">
                <MicroDemo name="terminalTyping" className="h-full w-full" />
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2, z: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ transformStyle: "preserve-3d", perspective: 1000 }}
              className="group relative overflow-hidden rounded-card border border-border bg-white p-4 shadow-hairline transition duration-300 hover:shadow-tileHover sm:p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tightish">
                  <FolderTree className="h-4 w-4 text-muted" />
                  Scaffold
                </div>
                <span className="text-xs font-medium tracking-caps text-muted">
                  step 02
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                A docs-as-code tree snaps into place—templates, process, and
                agents.
              </p>

              <div className="mt-4 rounded-tile border border-border bg-white px-4 py-4 shadow-hairline overflow-x-auto">
                <div className="space-y-0.5 font-mono text-[11px] leading-relaxed text-secondary whitespace-nowrap">
                  <div>
                    00-meta/{" "}
                    <span className="text-muted"># Templates, glossary</span>
                  </div>
                  <div>
                    01-brainstorming/{" "}
                    <span className="text-muted"># Ideas and sketches</span>
                  </div>
                  <div>
                    02-practices/{" "}
                    <span className="text-muted"># Testing, git, CI</span>
                  </div>
                  <div>
                    03-decisions/ <span className="text-muted"># ADRs</span>
                  </div>
                  <div>
                    04-architecture/{" "}
                    <span className="text-muted"># Architecture docs</span>
                  </div>
                  <div>
                    05-epics/{" "}
                    <span className="text-muted"># Epic definitions</span>
                  </div>
                  <div>
                    06-stories/{" "}
                    <span className="text-muted"># User stories</span>
                  </div>
                  <div>
                    07-testing/ <span className="text-muted"># Test cases</span>
                  </div>
                  <div>
                    08-project/{" "}
                    <span className="text-muted"># Roadmap, backlog</span>
                  </div>
                  <div>
                    09-agents/{" "}
                    <span className="text-muted"># Agent message bus</span>
                  </div>
                  <div>
                    10-research/{" "}
                    <span className="text-muted"># Research notes</span>
                  </div>
                  <div>
                    context.md{" "}
                    <span className="text-muted"># Context brief</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 h-16 sm:h-20">
                <MicroDemo name="docsTreeGrowth" className="h-full w-full" />
              </div>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, rotateX: 2, rotateY: -2, z: 20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              style={{ transformStyle: "preserve-3d", perspective: 1000 }}
              className="group relative overflow-hidden rounded-card border border-border bg-white p-4 shadow-hairline transition duration-300 hover:shadow-tileHover sm:p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold tracking-tightish">
                  <GitPullRequest className="h-4 w-4 text-muted" />
                  Run the workflow
                </div>
                <span className="text-xs font-medium tracking-caps text-muted">
                  step 03
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                Commands generate files, keep status traceable, and prep
                PR-ready output.
              </p>

              <div className="mt-4">
                <CodeBlock
                  label="Example"
                  lang="bash"
                  code={[
                    'agileflow story create --epic "Repo-native delivery"',
                    'agileflow adr record --title "Verification harness"',
                    "agileflow status",
                  ].join("\n")}
                />
              </div>

              <div className="mt-5 h-16 sm:h-20">
                <MicroDemo name="commandFlow" className="h-full w-full" />
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </Section>
  );
}
