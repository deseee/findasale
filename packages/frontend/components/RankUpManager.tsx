/**
 * RankUpManager — Global rank-up modal manager
 *
 * Monitors explorerRank changes via useRankUp hook and displays RankUpModal
 * when user ranks up. Should be placed in a top-level layout component.
 */

import React, { useState } from 'react';
import useRankUp from '../hooks/useRankUp';
import { ExplorerRank } from './RankBadge';
import RankUpModal from './RankUpModal';

export const RankUpManager: React.FC = () => {
  const [showRankUpModal, setShowRankUpModal] = useState(false);
  const [rankUpData, setRankUpData] = useState<{ newRank: ExplorerRank } | null>(null);

  const handleRankUp = (newRank: string) => {
    setRankUpData({ newRank: newRank as ExplorerRank });
    setShowRankUpModal(true);
  };

  useRankUp(handleRankUp);

  return (
    <>
      {showRankUpModal && rankUpData && (
        <RankUpModal
          rank={rankUpData.newRank}
          onDismiss={() => {
            setShowRankUpModal(false);
            setRankUpData(null);
          }}
        />
      )}
    </>
  );
};

export default RankUpManager;
