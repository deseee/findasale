import cron from 'node-cron';
import { sendPresaleSneakPeekEmails } from '../services/presaleSneakPeekEmailService';
import { cronGuard } from '../utils/cronGuard';

// Run daily at 09:00 UTC — catches sales starting 24–48h from now
cron.schedule('0 9 * * *', cronGuard({ jobName: 'presaleSneakPeekJob' }, async () => {
  console.log('[presaleSneakPeekJob] Starting pre-sale sneak peek email run...');
  await sendPresaleSneakPeekEmails();
  console.log('[presaleSneakPeekJob] Completed.');
}));
