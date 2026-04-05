import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { useFeedbackContext, SurveyDef } from '@/context/FeedbackContext';
import { useOrganizerTier } from './useOrganizerTier';
import api from '@/lib/api';

// Survey definitions — all 10 surveys
const SURVEY_DEFINITIONS: Record<string, SurveyDef> = {
  'OG-1': {
    id: 'OG-1',
    title: 'Your first sale is live!',
    question: 'How confident do you feel about the photos?',
    options: ['Struggling', 'Okay', 'Great'],
    subtext: '(Your answer helps us prioritize features)',
    role: 'ORGANIZER',
    frequency: 'once-ever',
  },
  'OG-2': {
    id: 'OG-2',
    title: 'How\'s the add-items flow treating you?',
    question: 'Rate your experience adding photos',
    options: ['Too slow', 'Okay', 'Fast'],
    subtext: '(We use this to optimize the editor)',
    role: 'ORGANIZER',
    frequency: 'once-per-sale',
  },
  'OG-3': {
    id: 'OG-3',
    title: 'Great! An item sold.',
    question: 'How did you connect with the buyer?',
    options: ['In-person', 'Online bid', 'Other'],
    subtext: '(This helps us understand your selling model)',
    role: 'ORGANIZER',
    frequency: 'once-per-sale',
  },
  'OG-4': {
    id: 'OG-4',
    title: 'You used online checkout!',
    question: 'Was the payment process smooth?',
    options: ['Nope', 'Okay', 'Smooth'],
    subtext: '(We want checkout to be effortless)',
    role: 'ORGANIZER',
    frequency: 'once-ever',
    tierGate: 'SIMPLE+',
  },
  'OG-5': {
    id: 'OG-5',
    title: 'Settings updated.',
    question: 'Was that easy to find?',
    options: ['No', 'Sort of', 'Yes'],
    subtext: '(Navigation feedback helps us build better menus)',
    role: 'ORGANIZER',
    frequency: 'once-ever',
  },
  'SH-1': {
    id: 'SH-1',
    title: 'Purchase confirmed!',
    question: 'How easy was checkout?',
    options: ['Confusing', 'Okay', 'Smooth'],
    subtext: '(We\'re improving the buying experience)',
    role: 'SHOPPER',
    frequency: 'once-ever',
  },
  'SH-2': {
    id: 'SH-2',
    title: 'Added to favorites!',
    question: 'Why this item?',
    options: ['Looks cool', 'Good price', 'Saving for later'],
    subtext: '(Helps us suggest items you\'ll love)',
    role: 'SHOPPER',
    frequency: 'once-ever',
  },
  'SH-3': {
    id: 'SH-3',
    title: 'Bid placed!',
    question: 'How confident are you in the final price?',
    options: ['Uncertain', 'Reasonable', 'Great deal'],
    subtext: '(Auction pricing feedback helps us tune listings)',
    role: 'SHOPPER',
    frequency: 'once-ever',
  },
  'SH-4': {
    id: 'SH-4',
    title: 'Your haul is live!',
    question: 'How fun was sharing it?',
    options: ['Annoying', 'Okay', 'Fun'],
    subtext: '(Community features work best when users share)',
    role: 'SHOPPER',
    frequency: 'once-ever',
  },
  'SH-5': {
    id: 'SH-5',
    title: 'You\'re following this organizer!',
    question: 'What drew you to them?',
    options: ['Great items', 'Good reputation', 'Location'],
    subtext: '(Helps us recommend organizers you\'ll love)',
    role: 'SHOPPER',
    frequency: 'once-ever',
  },
};

interface UseFeedbackSurveyReturn {
  showSurvey: (surveyType: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const useFeedbackSurvey = (): UseFeedbackSurveyReturn => {
  const { user, isLoading: authLoading } = useAuth();
  const { openSurvey, closeSurvey, isSurveyOpen, cooldownEndTime, setCooldownEndTime } = useFeedbackContext();
  // useOrganizerTier available if tier gating needed in future
  const _orgTier = useOrganizerTier();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppressions, setSuppressions] = useState<Set<string>>(new Set());

  // Fetch suppressions on mount and when user changes
  useEffect(() => {
    const fetchSuppressions = async () => {
      if (!user?.id) {
        setSuppressions(new Set());
        return;
      }

      try {
        const res = await api.get('/api/feedback/suppression');
        const suppressedIds = new Set<string>(res.data.map((s: any) => s.surveyType));
        setSuppressions(suppressedIds);
      } catch (err) {
        console.error('Failed to fetch suppressions:', err);
        setSuppressions(new Set());
      }
    };

    fetchSuppressions();
  }, [user?.id]);

  const showSurvey = useCallback(
    async (surveyType: string) => {
      setError(null);

      // Check auth
      if (!user?.id || authLoading) {
        setError('User not authenticated');
        return;
      }

      // Check if survey is already open
      if (isSurveyOpen) {
        return;
      }

      // Get survey definition
      const survey = SURVEY_DEFINITIONS[surveyType];
      if (!survey) {
        setError(`Unknown survey type: ${surveyType}`);
        return;
      }

      // Check role match
      if (survey.role === 'ORGANIZER' && !user.roles?.includes('ORGANIZER')) {
        return; // Silently skip if not an organizer
      }
      if (survey.role === 'SHOPPER' && user.roles?.includes('ORGANIZER')) {
        return; // Silently skip if organizer (shoppers can also be organizers)
      }

      // Check suppression
      if (suppressions.has(surveyType)) {
        return; // Silently skip if suppressed
      }

      // Tier gate: SIMPLE is the lowest tier, so SIMPLE+ = all tiers. No gate needed.

      // Check cooldown (30 minutes)
      if (cooldownEndTime && Date.now() < cooldownEndTime) {
        return; // Silently skip if in cooldown
      }

      // Check 24-hour frequency cap (client-side; backend also tracks lastSurveyShownAt)
      try {
        const lastShown = window.localStorage.getItem('feedback_last_shown');
        if (lastShown) {
          const oneDayMs = 24 * 60 * 60 * 1000;
          if (Date.now() - parseInt(lastShown, 10) < oneDayMs) {
            return; // Silently skip if shown within 24 hours
          }
        }
      } catch { /* localStorage unavailable — proceed */ }

      // All checks passed — open survey
      openSurvey(survey);

      // Record last-shown timestamp for 24h frequency cap
      try { window.localStorage.setItem('feedback_last_shown', String(Date.now())); } catch { /* noop */ }

      // Set cooldown end time (30 minutes from now)
      const cooldownMs = 30 * 60 * 1000;
      setCooldownEndTime(Date.now() + cooldownMs);
    },
    [user, authLoading, isSurveyOpen, suppressions, cooldownEndTime, openSurvey, setCooldownEndTime]
  );

  return {
    showSurvey,
    isLoading,
    error,
  };
};
