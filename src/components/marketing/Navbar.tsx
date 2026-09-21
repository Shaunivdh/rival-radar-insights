import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';

const NAV_LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/what-we-track', label: 'What we track' },
  { href: '/#pricing', label: 'Pricing' },
];

const Navbar = () => {
  return (
    <nav className="glass fixed left-0 right-0 top-0 z-50">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" aria-label="Scoutly home" className="flex items-center">
          <Logo />
        </Link>

        <div className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Log in
          </Link>
          <Button variant="hero" size="sm" className="rounded-full px-4" asChild>
            <Link href="/signup">Get started</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
