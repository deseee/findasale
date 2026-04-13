/**
 * VerifiedBadge
 *
 * Displays a blue checkmark badge for verified organizers
 * Only renders if status === 'VERIFIED'
 */

interface VerifiedBadgeProps {
  status?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const VerifiedBadge = ({ status, size = 'md' }: VerifiedBadgeProps) => {
  if (status !== 'VERIFIED') {
    return null;
  }

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div
      className={`${sizeClasses[size]} bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0`}
      title="Verified Organizer"
    >
      <svg
        className="w-full h-full"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
};

export default VerifiedBadge;
