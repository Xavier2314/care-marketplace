import { config } from '../lib/config';

export function platformFee(priceMinor: number, percent = config.platformFeePercent) {
  return Math.round((priceMinor * percent) / 100);
}

/** Price for a booking: fixed services cost the listed price; hourly ones scale with duration. */
export function bookingPrice(pricingType: 'FIXED' | 'HOURLY', priceMinor: number, minutes: number) {
  return pricingType === 'FIXED' ? priceMinor : Math.round((priceMinor * minutes) / 60);
}
