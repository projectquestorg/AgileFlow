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
          <Hero content={content.hero} />
          <StatsStrip stats={content.stats} />
          <HowItWorks steps={content.howItWorks} />
          <DocsPreview content={content.docsPreview} />
          <BentoFeatures tiles={content.features} />
          <IDEIntegrations data={content.ideIntegrations} />
          <CommandsShowcase content={content.commands} />
          <CommandsShowcase content={content.skills} />
          <FAQ items={content.faq} />
          <FinalCTA content={content.finalCta} />
          <Footer content={content.footer} />
        </main>
      </PageWrapper>
    </div>
  );
}
