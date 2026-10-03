import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 5100),
  jwtSecret: required('JWT_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  platformFeePercent: Number(process.env.PLATFORM_FEE_PERCENT ?? 15),
  paymentGateway: process.env.PAYMENT_GATEWAY ?? 'mock',
  videoBaseUrl: process.env.VIDEO_BASE_URL ?? 'https://meet.jit.si',
  // Patient cancellations inside this window only get a partial refund.
  lateCancelHours: Number(process.env.LATE_CANCEL_HOURS ?? 24),
  lateCancelRefundPercent: Number(process.env.LATE_CANCEL_REFUND_PERCENT ?? 50),
  reminderLeadHours: Number(process.env.REMINDER_LEAD_HOURS ?? 24),
};
