import { useRouter } from 'next/router';
import { useEffect } from 'react';

// Redirect /organizer/messages to /messages
const OrganizerMessagesPage = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace('/messages');
  }, [router]);

  return null;
};

export default OrganizerMessagesPage;
