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
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" href="/favicon.ico" />

        {/* Tile for Windows */}
        <meta name="msapplication-TileColor" content="#D97706" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        <meta name="msapplication-config" content="none" />

        {/* Default SEO meta — pages should override these with next/head */}
        <meta
          name="description"
          content="FindA.Sale — discover estate sales and auctions near you. Browse items, favorite sales, and buy online."
        />
        <meta name="keywords" content="estate sales, auctions, antiques, thrift, local sales" />
        <meta name="author" content="FindA.Sale" />

        {/* Open Graph structural defaults — page-level <Head> provides og:title, og:description, og:image */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="FindA.Sale" />
        <meta property="fb:app_id" content="4380032288935833" />

        {/* Twitter card type default — page-level <Head> provides twitter:title, twitter:description, twitter:image */}
        <meta name="twitter:card" content="summary_large_image" />

        {/* Viewport is set by Next.js automatically in _app; kept here for completeness */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* Google Fonts — CD1: Fraunces (serif headings) + Inter (body) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,600&family=Inter:wght@400;500;600&display=swap"
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
