/**
 * Payment gateway abstraction. Bookings are authorized up front (funds held),
 * captured on completion and refunded (fully or partially) on decline or
 * cancellation. Real gateways (Stripe for worldwide cards, Paystack/Flutterwave
 * for African markets, etc.) implement the same interface.
 */
export interface PaymentGateway {
  name: string;
  authorize(input: { amountMinor: number; currency: string; reference: string }): Promise<{ externalId: string }>;
  capture(externalId: string, amountMinor: number): Promise<void>;
  refund(externalId: string, amountMinor: number): Promise<void>;
  /** Releases an uncaptured authorization. */
  void(externalId: string): Promise<void>;
}

/** Simulated gateway for development, demos and tests. Always succeeds. */
export const mockGateway: PaymentGateway = {
  name: 'mock',
  async authorize({ reference }) {
    return { externalId: `mock_${reference}` };
  },
  async capture() {},
  async refund() {},
  async void() {},
};

const gateways: Record<string, PaymentGateway> = { mock: mockGateway };

export function getGateway(name: string): PaymentGateway {
  const gateway = gateways[name];
  if (!gateway) throw new Error(`Payment gateway "${name}" is not configured`);
  return gateway;
}
