import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* Theme color — warm amber accent */}
        <meta name="theme-color" content="#D97706" />

        {/* iOS PWA support */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FindA.Sale" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* Favicons */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16x16.png" />
        <link rel="shortcut icon" href="/icons/favicon-32x32.png" />

        {/* Tile for Windows */}
        <meta name="msapplication-TileColor" content="#D97706" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        <meta name="msapplication-config" content="none" />

        {/* Default SEO meta — pages should override these with next/head */}
        <meta
          name="description"
          content="FindA.Sale — discover estate sales and auctions near you. Browse items, favorite sales, and buy online."
        />
        <meta name="keywords" content="estate sales, auctions, antiques, thrift, Grand Rapids" />
        <meta name="author" content="FindA.Sale" />

        {/* Open Graph defaults */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="FindA.Sale" />
        <meta property="og:title" content="FindA.Sale — Estate Sales Near You" />
        <meta
          property="og:description"
          content="Discover estate sales and auctions. Browse items, save favorites, and buy online."
        />
        <meta property="og:image" content="/icons/icon-512x512.png" />

        {/* Twitter card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="FindA.Sale — Estate Sales Near You" />
        <meta
          name="twitter:description"
          content="Discover estate sales and auctions. Browse items, save favorites, and buy online."
        />
        <meta name="twitter:image" content="/icons/icon-512x512.png" />

        {/* Viewport is set by Next.js automatically in _app; kept here for completeness */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Google Fonts — Montserrat (headings) + Inter (body) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Montserrat:wght@600;700&display=swap"
          rel="stylesheet"
        />

        {/* Preconnect to critical external origins */}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://tile.openstreetmap.org" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
