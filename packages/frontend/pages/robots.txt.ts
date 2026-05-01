import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const robotsTxt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Disallow: /organizer/dashboard
Disallow: /shopper/checkout
Disallow: /shopper/orders
Disallow: /user/settings
Sitemap: https://finda.sale/sitemap.xml
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.write(robotsTxt);
  res.end();

  return {
    props: {},
  };
};

// Dummy component — not rendered (getServerSideProps handles response)
export default function RobotsTxt() {
  return null;
}
