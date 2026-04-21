export interface TaskTemplate {
  title: string;
  description?: string;
  phase?: 'pre' | 'during' | 'post';
}

export interface TaskTemplateCategory {
  id: string;
  label: string;
  emoji: string;
  tasks: TaskTemplate[];
}

export const TASK_TEMPLATES: TaskTemplateCategory[] = [
  {
    id: 'setup',
    label: 'Setup',
    emoji: '🏗️',
    tasks: [
      { title: 'Confirm sale dates and hours', phase: 'pre' },
      { title: 'Write sale description and title', phase: 'pre' },
      { title: 'Upload cover photo', phase: 'pre' },
      { title: 'Test online checkout flow', phase: 'pre' },
      { title: 'Coordinate team roles and coverage areas', phase: 'pre' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    emoji: '📦',
    tasks: [
      { title: 'Upload all items', phase: 'pre' },
      { title: 'Review and approve auto-suggested tags', phase: 'pre' },
      { title: 'Price all items', phase: 'pre' },
      { title: 'Prepare item descriptions for high-value pieces', phase: 'pre' },
      { title: 'Create treasure hunt clues', phase: 'pre' },
    ],
  },
  {
    id: 'day_of',
    label: 'Day Of',
    emoji: '🚀',
    tasks: [
      { title: 'Set up POS and run a test transaction', phase: 'during' },
      { title: 'Place QR codes and directional signs', phase: 'during' },
      { title: 'Brief team on coverage areas', phase: 'during' },
      { title: 'Monitor online vs in-person activity', phase: 'during' },
      { title: 'Check virtual queue status', phase: 'during' },
    ],
  },
  {
    id: 'close_out',
    label: 'Close Out',
    emoji: '✅',
    tasks: [
      { title: 'Mark sale as complete', phase: 'post' },
      { title: 'Sort unsold items (donate / relist / discard)', phase: 'post' },
      { title: 'Schedule donation pickup', phase: 'post' },
      { title: 'Review settlement and earnings', phase: 'post' },
      { title: 'Respond to any shopper messages or reviews', phase: 'post' },
    ],
  },
  {
    id: 'recurring',
    label: 'Recurring',
    emoji: '🔁',
    tasks: [
      { title: 'Review workspace performance metrics', phase: 'pre' },
      { title: 'Update brand kit or workspace settings', phase: 'pre' },
      { title: 'Process team payouts', phase: 'post' },
      { title: 'Plan next sale', phase: 'post' },
    ],
  },
];
