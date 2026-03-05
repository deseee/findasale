import React, { useState } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface FollowButtonProps {
  organizerId: string;
  initialFollowing: boolean;
  initialCount: number;
}

const FollowButton: React.FC<FollowButtonProps> = ({
  organizerId,
  initialFollowing,
  initialCount,
}) => {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(initialFollowing);
  const [followerCount, setFollowerCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isFollowing) {
        const res = await api.delete(`/organizers/${organizerId}/follow`);
        setIsFollowing(false);
        setFollowerCount(res.data.followerCount);
      } else {
        const res = await api.post(`/organizers/${organizerId}/follow`);
        setIsFollowing(true);
        setFollowerCount(res.data.followerCount);
      }
    } catch (err) {
      console.error('Follow toggle failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Don't show if user is not logged in
  if (!user) return null;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={loading}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-touch ${
          isFollowing
            ? 'bg-warm-200 text-warm-700 hover:bg-warm-300'
            : 'bg-amber-600 text-white hover:bg-amber-700'
        } disabled:opacity-50`}
      >
        {loading ? '...' : isFollowing ? 'Following' : 'Follow'}
      </button>
      <span className="text-sm text-warm-500">
        {followerCount} follower{followerCount !== 1 ? 's' : ''}
      </span>
    </div>
  );
};

export default FollowButton;
