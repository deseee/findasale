import { Router, Request, Response } from 'express';
import { register, login, oauthLogin, redeemInvite, verifyEmail, oauthVerifyAge } from '../controllers/authController';
import { authenticate, AuthRequest } from '../middleware/auth';
import { prisma } from '../index';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';

// Auth validation schemas
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
}).refine(data => data.currentPassword !== data.newPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Valid email is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// C2: Tight rate limit specifically for password reset — prevents email enumeration abuse and account takeover attempts
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts. Please try again in an hour.' },
});

// P0 Security Fix Item 4: Rate limit for reset-password endpoint (per token, 5 attempts)
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => `reset:${req.body?.token || req.params?.token || 'unknown'}:${ipKeyGenerator(req)}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset attempts. Please request a new reset link.' },
});

// P0 Security Fix Item 5: Email verification resend rate limiter (3 requests/hour/IP)
const verifyEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests. Please try again in an hour.' },
});

// L1: Login rate limiter — 5 attempts per 15 minutes per IP (P0-S2: COPPA compliance)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
});

// L2: Register rate limiter — 3 attempts per hour per IP (P0-S2: COPPA compliance)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts.' },
});