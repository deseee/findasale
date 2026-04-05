import React, { createContext, useState, useCallback, useContext, ReactNode } from 'react';

export interface SurveyDef {
  id: string;
  title: string;
  question: string;
  options: string[];
  subtext: string;
  role: 'ORGANIZER' | 'SHOPPER' | 'BOTH';
  frequency: 'once-ever' | 'once-per-sale' | 'once-per-24h';
  tierGate?: string; // e.g., 'SIMPLE+' for OG-4
}

export interface FeedbackContextType {
  isSurveyOpen: boolean;
  currentSurvey: SurveyDef | null;
  answer: string | null;
  dontAskAgain: boolean;
  isSubmitting: boolean;
  cooldownEndTime: number | null;

  openSurvey: (survey: SurveyDef) => void;
  closeSurvey: () => void;
  setAnswer: (answer: string) => void;
  setDontAskAgain: (checked: boolean) => void;
  setIsSubmitting: (submitting: boolean) => void;
  setCooldownEndTime: (time: number | null) => void;
}

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [currentSurvey, setCurrentSurvey] = useState<SurveyDef | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownEndTime, setCooldownEndTime] = useState<number | null>(null);

  const openSurvey = useCallback((survey: SurveyDef) => {
    setCurrentSurvey(survey);
    setIsSurveyOpen(true);
    setAnswer(null);
    setDontAskAgain(false);
    setIsSubmitting(false);
  }, []);

  const closeSurvey = useCallback(() => {
    setIsSurveyOpen(false);
    setCurrentSurvey(null);
    setAnswer(null);
    setDontAskAgain(false);
    setIsSubmitting(false);
  }, []);

  const value: FeedbackContextType = {
    isSurveyOpen,
    currentSurvey,
    answer,
    dontAskAgain,
    isSubmitting,
    cooldownEndTime,
    openSurvey,
    closeSurvey,
    setAnswer,
    setDontAskAgain,
    setIsSubmitting,
    setCooldownEndTime,
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
    </FeedbackContext.Provider>
  );
};

export const useFeedbackContext = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedbackContext must be used within FeedbackProvider');
  }
  return context;
};
