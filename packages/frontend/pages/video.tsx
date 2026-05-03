export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/organizer-video-ad-fas.html',
      permanent: false,
    },
  };
}

export default function VideoPage() {
  return null;
}
