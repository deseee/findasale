import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getConversations,
  getThread,
  sendMessage,
  replyInThread,
  getUnreadCount,
} from '../controllers/messageController';

const router = express.Router();

// All message routes require auth
router.use(authenticate);

router.get('/', getConversations);              // list conversations
router.get('/unread-count', getUnreadCount);   // unread badge count
router.get('/:conversationId', getThread);     // full thread
router.post('/', sendMessage);                 // start/continue conversation
router.post('/:conversationId/reply', replyInThread); // reply in thread

export default router;
