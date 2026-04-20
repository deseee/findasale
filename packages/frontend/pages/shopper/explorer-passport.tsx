import { useEffect } from 'react';
import { useRouter } from 'next/router';

const ExplorerPassportRedirect = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/shopper/explorer-profile');
  }, [router]);
  return null;
};

export default ExplorerPassportRedirect;
