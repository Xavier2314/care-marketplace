export type Role = 'PATIENT' | 'PROVIDER' | 'ADMIN';
export type Profession = 'CAREGIVER' | 'NURSE' | 'DOCTOR' | 'PHYSIOTHERAPIST';
export type Category = 'HOME_CARE' | 'PHYSIOTHERAPY' | 'TELEHEALTH';
export type Mode = 'HOME' | 'CLINIC' | 'VIRTUAL';
export type BookingStatus = 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'IN_PROGRESS' | 'COMPLETED';
export type VerificationStatus = 'DRAFT' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED';

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: Role;
  country: string;
  provider?: { id: string; verificationStatus: VerificationStatus } | null;
}

export interface Service {
  id: string;
  category: Category;
  title: string;
  description: string;
  mode: Mode;
  pricingType: 'FIXED' | 'HOURLY';
  priceMinor: number;
  currency: string;
  durationMinutes: number;
  active: boolean;
}

export interface Slot {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface Credential {
  id: string;
  type: string;
  issuingBody: string;
  number: string;
  country: string;
  expiresAt: string | null;
  documentUrl: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
}

export interface ProviderSummary {
  id: string;
  profession: Profession;
  headline: string;
  bio: string;
  specialties: string[];
  languages: string[];
  yearsExperience: number;
  country: string;
  city: string;
  serviceArea: string;
  timezone: string;
  ratingAvg: number;
  ratingCount: number;
  user: { name: string };
  services: Service[];
  fromPriceMinor: number | null;
  currency: string | null;
}

export interface ProviderDetail extends Omit<ProviderSummary, 'fromPriceMinor' | 'currency'> {
  availability: Slot[];
  credentials: { type: string; issuingBody: string; country: string; expiresAt: string | null }[];
  reviews: { rating: number; comment: string; createdAt: string; booking: { service: { title: string } } }[];
  busy: { startAt: string; endAt: string }[];
}

export interface Booking {
  id: string;
  startAt: string;
  endAt: string;
  mode: Mode;
  address: string | null;
  careRecipientName: string;
  notes: string;
  status: BookingStatus;
  priceMinor: number;
  platformFeeMinor: number;
  currency: string;
  videoRoomUrl: string | null;
  checklist: { label: string; done: boolean }[];
  visitNotes: string | null;
  cancelReason: string | null;
  recurrenceGroupId: string | null;
  service: Service;
  patient: { id: string; name: string; phone: string | null };
  provider: { id: string; userId: string; profession: Profession; timezone: string; user: { id: string; name: string; phone: string | null } };
  payment: { status: string; amountMinor: number; refundedMinor: number } | null;
  payout: { status: string; amountMinor: number } | null;
  review: { rating: number; comment: string } | null;
  messages: { id: string; body: string; createdAt: string; sender: { id: string; name: string } }[];
  complaints: { id: string; category: string; status: string; description: string; resolution: string | null }[];
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}
