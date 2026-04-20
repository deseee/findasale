import { useEffect } from 'react';
import { useRouter } from 'next/router';

const OrganizerCouponsRedirect = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/coupons');
  }, [router]);
  return null;
};

export default OrganizerCouponsRedirect;
