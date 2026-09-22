import Navbar from './Navbar';
import Footer from './Footer';

/** Marketing chrome for public pages that are not the landing page itself. */
export default function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-canvas">
      <Navbar />
      <main className="mx-auto w-full max-w-5xl px-6 pb-20 pt-28">{children}</main>
      <Footer />
    </div>
  );
}
