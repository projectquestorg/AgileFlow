import { Header } from '@/components/header';
import { HeroSection } from '@/components/hero';
import { LogosSection } from '@/components/logos-section';
import { FeatureSection } from '@/components/feature-section';
import { Integrations } from '@/components/integrations';
import { TestimonialsSection } from '@/components/testimonials-section';
import { FaqsSection } from '@/components/faqs-page';
import { CallToAction } from '@/components/cta';
import { Footer } from '@/components/footer';
import { FullWidthDivider } from '@/components/full-width-divider';

/**
 * Testimonials are placeholders (fictional people) until real, permissioned
 * quotes exist. Keep this false in production builds.
 */
const SHOW_TESTIMONIALS = false;

/** One band of the page: a full-bleed line on top, content inside the shared frame. */
function Band({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      <FullWidthDivider position="top" />
      {children}
    </div>
  );
}

/**
 * Landing page, built only from Efferd blocks. Every section sits in one
 * frame (max-w-5xl with side lines) and is separated by full-bleed lines,
 * so the lines run continuously from the hero to the footer.
 */
export default function Page() {
  return (
    <div className="relative overflow-x-clip" id="top">
      <Header />
      <div className="relative mx-auto w-full max-w-5xl lg:border-x">
        <main>
          <HeroSection />
          <Band>
            <LogosSection />
          </Band>
          <Band>
            <FeatureSection />
          </Band>
          <Band>
            <Integrations />
          </Band>
          {SHOW_TESTIMONIALS && (
            <Band>
              <TestimonialsSection />
            </Band>
          )}
          <Band>
            <FaqsSection />
          </Band>
          <Band>
            <CallToAction />
          </Band>
        </main>
        <Band>
          <Footer />
        </Band>
      </div>
    </div>
  );
}
