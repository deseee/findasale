import React, { useState } from 'react';
import { useBrandFollows } from '../hooks/useBrandFollows';
import { useAuth } from './AuthContext';

const BrandFollowManager: React.FC = () => {
  const { user } = useAuth();
  const { brandFollows, isLoading, addBrandFollow, removeBrandFollow } = useBrandFollows(user?.id);
  const [inputValue, setInputValue] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setIsAdding(true);
    setAddError(null);
    try {
      await addBrandFollow(trimmed);
      setInputValue('');
    } catch (err: any) {
      setAddError(err.message || 'Error adding brand');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Followed Brands</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Get notified when items from these brands appear at sales.
      </p>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Pottery Barn, MCM, Ralph Lauren"
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
          disabled={isAdding}
        />
        <button
          onClick={handleAdd}
          disabled={isAdding || !inputValue.trim()}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </div>
      {addError && <p className="text-sm text-red-600 dark:text-red-400 mb-3">{addError}</p>}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />)}
        </div>
      ) : brandFollows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No brands followed yet.</p>
      ) : (
        <div className="space-y-2">
          {brandFollows.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <span className="text-sm font-medium text-gray-900 dark:text-white">{f.brandName}</span>
              <button
                onClick={() => removeBrandFollow(f.id)}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BrandFollowManager;
