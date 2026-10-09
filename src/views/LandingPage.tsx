import Navbar from '@/components/marketing/Navbar';
import HeroSection from '@/components/marketing/HeroSection';
import Manifesto from '@/components/marketing/Manifesto';
import HowItWorks from '@/components/marketing/HowItWorks';
import Dimensions from '@/components/marketing/Dimensions';
import BetaSignup from '@/components/marketing/BetaSignup';
import Footer from '@/components/marketing/Footer';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <Manifesto />
        <div id="how" className="scroll-mt-16">
          <HowItWorks />
        </div>
        <div id="dimensions" className="scroll-mt-16">
          <Dimensions />
        </div>
        <div id="beta" className="scroll-mt-16">
          <BetaSignup />
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
