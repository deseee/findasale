import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from './AuthContext';
import BottomTabNav from './BottomTabNav';

const Layout = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [router.pathname]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const staticNavLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
  ];

  const authLinks = isClient ? (
    user ? (
      <>
        <span className="block px-3 py-2 text-sm text-warm-500 truncate">
          Hi, {user.name || user.email}
        </span>
        {user.role === 'ORGANIZER' && (
          <Link href="/organizer/dashboard" className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
            Dashboard
          </Link>
        )}
        {(user.role === 'USER' || user.role === 'ADMIN') && (
          <>
            <Link href="/shopper/dashboard" className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
              My Profile
            </Link>
            <Link href="/referral-dashboard" className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
              Referrals
            </Link>
          </>
        )}
        <button
          onClick={handleLogout}
          className="block w-full text-left px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md"
        >
          Logout
        </button>
      </>
    ) : (
      <>
        <Link href="/login" className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
          Login
        </Link>
        <Link href="/register" className="block px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-medium text-center">
          Register
        </Link>
      </>
    )
  ) : (
    <>
      <Link href="/login" className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
        Login
      </Link>
      <Link href="/register" className="block px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-md font-medium text-center">
        Register
      </Link>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Skip to main content — keyboard/screen reader accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-600 focus:text-white focus:rounded-md focus:font-medium"
      >
        Skip to main content
      </a>

      {/* Header */}
      <header className="bg-white shadow-header">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-amber-600 font-heading flex-shrink-0">
              FindA.Sale
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center space-x-4" aria-label="Main navigation">
              {staticNavLinks.map(({ href, label }) => (
                <Link key={href} href={href} className="text-warm-900 hover:text-amber-600">{label}</Link>
              ))}

              {!isClient ? (
                <>
                  <Link href="/login" className="text-warm-900 hover:text-amber-600">Login</Link>
                  <Link href="/register" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md">Register</Link>
                </>
              ) : user ? (
                <div className="flex items-center space-x-4">
                  <span className="text-warm-900 text-sm">Hi, {user.name || user.email}</span>
                  {user.role === 'ORGANIZER' && (
                    <Link href="/organizer/dashboard" className="text-warm-900 hover:text-amber-600">Dashboard</Link>
                  )}
                  {(user.role === 'USER' || user.role === 'ADMIN') && (
                    <>
                      <Link href="/shopper/dashboard" className="text-warm-900 hover:text-amber-600">My Profile</Link>
                      <Link href="/referral-dashboard" className="text-warm-900 hover:text-amber-600">Referrals</Link>
                    </>
                  )}
                  <button onClick={handleLogout} className="text-warm-900 hover:text-amber-600">Logout</button>
                </div>
              ) : (
                <>
                  <Link href="/login" className="text-warm-900 hover:text-amber-600">Login</Link>
                  <Link href="/register" className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md">Register</Link>
                </>
              )}
            </nav>

            {/* Mobile hamburger button */}
            <button
              className="md:hidden p-2 rounded-md text-warm-500 hover:text-amber-600 hover:bg-warm-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? (
                // X icon
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // Hamburger icon
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div id="mobile-menu" className="md:hidden border-t border-warm-300 bg-white px-4 py-3 space-y-1">
            {staticNavLinks.map(({ href, label }) => (
              <Link key={href} href={href} className="block px-3 py-2 text-warm-900 hover:text-amber-600 hover:bg-warm-100 rounded-md">
                {label}
              </Link>
            ))}
            <div className="border-t border-warm-200 pt-3 mt-1 space-y-1">
              {authLinks}
            </div>
          </div>
        )}
      </header>

      {/* Main Content — pb-15 on mobile for bottom nav clearance */}
      <main id="main-content" className="flex-grow pb-15 md:pb-0" tabIndex={-1}>
        {children}
      </main>

      {/* Bottom tab navigation — mobile only */}
      <BottomTabNav />

      {/* Footer */}
      <footer className="bg-warm-800 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-lg font-bold mb-4">FindA.Sale</h3>
              <p className="text-warm-400">
                Helping you find the best estate sales and auctions in Grand Rapids and beyond.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Links</h3>
              <ul className="space-y-2">
                <li><Link href="/" className="text-warm-400 hover:text-white">Home</Link></li>
                <li><Link href="/about" className="text-warm-400 hover:text-white">About</Link></li>
                <li><Link href="/contact" className="text-warm-400 hover:text-white">Contact</Link></li>
                <li><Link href="/faq" className="text-warm-400 hover:text-white">FAQ</Link></li>
                {isClient && user?.role === 'ORGANIZER' && (
                  <>
                    <li><Link href="/organizer/dashboard" className="text-warm-400 hover:text-white">Dashboard</Link></li>
                    <li><Link href="/organizer/create-sale" className="text-warm-400 hover:text-white">Create Sale</Link></li>
                    <li><Link href="/guide" className="text-warm-400 hover:text-white">Organizer Guide</Link></li>
                  </>
                )}
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-4">Legal</h3>
              <ul className="space-y-2">
                <li><Link href="/terms" className="text-warm-400 hover:text-white">Terms of Service</Link></li>
                <li><Link href="/privacy" className="text-warm-400 hover:text-white">Privacy Policy</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-warm-700 mt-8 pt-6 text-center text-warm-400">
            <p>&copy; {new Date().getFullYear()} FindA.Sale. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
