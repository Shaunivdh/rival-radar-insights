import Link from 'next/link';
import { Logo } from '@/components/Logo';

const Footer = () => {
  return (
    <footer className="border-t border-border py-12">
      <div className="container flex flex-col items-center justify-between gap-6 text-sm text-muted-foreground md:flex-row">
        <Logo />

        <div className="flex flex-wrap items-center justify-center gap-6">
          <Link href="/#how" className="transition-colors hover:text-foreground">
            How it works
          </Link>
          <Link href="/what-we-track" className="transition-colors hover:text-foreground">
            What we track
          </Link>
          <Link href="/#beta" className="transition-colors hover:text-foreground">
            Beta
          </Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">
            Contact us
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms
          </Link>
        </div>

        <p>© {new Date().getFullYear()} Scoutly. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
