import { BackgroundTexture } from '@/components/background-texture';
import { PageWrapper } from '@/components/page-wrapper';
import { ScrollDepthTracker } from '@/components/scroll-depth-tracker';
import { Hero } from '@/components/sections/hero';
import { StatsStrip } from '@/components/sections/stats-strip';
import { HowItWorks } from '@/components/sections/how-it-works';
import { BentoFeatures } from '@/components/sections/bento-features';
import { DocsPreview } from '@/components/sections/docs-preview';
import { IDEIntegrations } from '@/components/sections/ide-integrations';
import { CommandsShowcase } from '@/components/sections/commands-showcase';
import { AgentArchitecture } from '@/components/sections/agent-architecture';
import { Testimonials } from '@/components/sections/testimonials';
import { FAQ } from '@/components/sections/faq';
import { FinalCTA } from '@/components/sections/final-cta';
import { Footer } from '@/components/sections/footer';
import { buildLandingContent } from '@/lib/landing-content';

export default async function Page() {
  const content = await buildLandingContent();
  return (
    <div className="relative">
      <ScrollDepthTracker />
      <PageWrapper version={content.version}>
        <BackgroundTexture />
        <main id="content" className="pt-20">
          <Hero
            content={content.hero}
            version={content.version}
            stats={{
              commands: content.stats[0].value as number,
              agents: content.stats[1].value as number,
              skills: content.stats[2].value,
            }}
          />
          <StatsStrip stats={content.stats} />
          <HowItWorks steps={content.howItWorks} />
          <BentoFeatures tiles={content.features} />
          <DocsPreview content={content.docsPreview} />
          <IDEIntegrations data={content.ideIntegrations} />
          <CommandsShowcase content={content.commands} />
          <AgentArchitecture content={content.agents} />
          <Testimonials content={content.testimonials} />
          <FAQ items={content.faq} />
          <FinalCTA content={content.finalCta} />
          <Footer content={content.footer} />
        </main>
      </PageWrapper>
    </div>
  );
}
