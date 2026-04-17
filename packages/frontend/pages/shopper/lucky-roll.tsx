// Replaced by /shopper/early-access-cache (S449 — D-XP-002).
// Gacha mechanic removed. Deterministic XP spend (Early Access Cache) is the canonical feature.
// Original gacha implementation preserved in git history (commit b8aa04b).
import { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: '/shopper/early-access-cache',
      permanent: true,
    },
  };
};

export default function LuckyRollRedirect() { return null; }
