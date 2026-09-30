/**
 * PassportUnlockManager: global watcher that shows a MilestoneUnlockedToast whenever the shopper
 * has Sale Passport stamps or milestone badges they have not been told about yet (a check-in,
 * purchase, review or referral that just landed, or an unlock derived from favorites/hauls).
 *
 * Mount once, next to RankUpManager, in pages/_app.tsx:
 *   const PassportUnlockManager = dynamic(() => import('../components/PassportUnlockManager'), { ssr: false });
 *   ...
 *   <RankUpManager />
 *   <PassportUnlockManager />
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import MilestoneUnlockedToast, { UnlockToastItem, claimUnlockToasts } from './MilestoneUnlockedToast';
import { useMarkPassportSeen, usePassportUnseen } from '../hooks/useLoyaltyPassport';

export const PassportUnlockManager: React.FC = () => {
  const { user } = useAuth();
  const { data } = usePassportUnseen(!!user);
  const markSeen = useMarkPassportSeen();
  const [items, setItems] = useState<UnlockToastItem[]>([]);

  useEffect(() => {
    if (!data) return;
    const stampIds = claimUnlockToasts(data.stamps.map((s) => s.id));
    const milestoneIds = claimUnlockToasts(data.milestones.map((m) => `milestone-${m.milestone}`));
    if (stampIds.length === 0 && milestoneIds.length === 0) return;

    const next: UnlockToastItem[] = [];
    for (const s of data.stamps) {
      if (!stampIds.includes(s.id)) continue;
      next.push({
        id: s.id,
        icon: s.icon,
        title: `${s.name} stamp`,
        message: s.placeLabel ? `Added to your Sale Passport from ${s.placeLabel}.` : 'Added to your Sale Passport.',
      });
    }
    for (const m of data.milestones) {
      if (!milestoneIds.includes(`milestone-${m.milestone}`)) continue;
      next.push({
        id: `milestone-${m.milestone}`,
        icon: '✨',
        title: m.name,
        message: "You've reached a new milestone! New badge unlocked.",
      });
    }
    setItems((prev) => [...prev, ...next]);
    markSeen.mutate({
      stampIds,
      milestones: data.milestones.filter((m) => milestoneIds.includes(`milestone-${m.milestone}`)).map((m) => m.milestone),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return <MilestoneUnlockedToast items={items} onDismiss={dismiss} />;
};

export default PassportUnlockManager;
