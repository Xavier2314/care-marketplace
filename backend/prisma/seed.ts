import bcrypt from 'bcryptjs';
import { PrismaClient, Profession, ServiceCategory, ServiceMode, PricingType } from '@prisma/client';

const prisma = new PrismaClient();

type SeedProvider = {
  name: string;
  email: string;
  profession: Profession;
  headline: string;
  bio: string;
  specialties: string[];
  languages: string[];
  years: number;
  country: string;
  city: string;
  timezone: string;
  licence: { type: string; body: string };
  status?: 'VERIFIED' | 'PENDING';
  services: { category: ServiceCategory; title: string; mode: ServiceMode; pricingType: PricingType; priceMinor: number; currency: string; durationMinutes: number; description: string }[];
};

const weekdays9to17 = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 17 * 60 }));
const everyDay8to20 = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 8 * 60, endMinute: 20 * 60 }));

const providers: SeedProvider[] = [
  {
    name: 'Amaka Okafor', email: 'amaka@example.com', profession: 'NURSE',
    headline: 'Registered nurse — post-surgery and elderly home care',
    bio: 'Ten years on surgical wards before moving into home care. Wound care, medication support and family guidance.',
    specialties: ['Wound care', 'Elderly care', 'Post-operative care'], languages: ['English', 'Igbo'], years: 10,
    country: 'NG', city: 'Lagos', timezone: 'Africa/Lagos', licence: { type: 'Professional licence', body: 'Nursing and Midwifery Council of Nigeria' },
    services: [
      { category: 'HOME_CARE', title: 'Home nursing visit', mode: 'HOME', pricingType: 'FIXED', priceMinor: 2500000, currency: 'NGN', durationMinutes: 90, description: 'Assessment, wound dressing and medication check.' },
      { category: 'TELEHEALTH', title: 'Nurse video check-in', mode: 'VIRTUAL', pricingType: 'FIXED', priceMinor: 800000, currency: 'NGN', durationMinutes: 30, description: 'Follow-up questions, recovery check, when to seek care.' },
    ],
  },
  {
    name: 'Tunde Bakare', email: 'tunde@example.com', profession: 'CAREGIVER',
    headline: 'Experienced caregiver — dementia and mobility support',
    bio: 'Patient, reliable caregiver supporting older adults with personal care, meals and mobility.',
    specialties: ['Dementia care', 'Mobility support', 'Personal care'], languages: ['English', 'Yoruba'], years: 6,
    country: 'NG', city: 'Lagos', timezone: 'Africa/Lagos', licence: { type: 'Caregiver certificate', body: 'Red Cross Nigeria' },
    services: [
      { category: 'HOME_CARE', title: 'Hourly home caregiver', mode: 'HOME', pricingType: 'HOURLY', priceMinor: 500000, currency: 'NGN', durationMinutes: 120, description: 'Personal care, companionship, meals and light mobility support.' },
    ],
  },
  {
    name: 'Dr. Wanjiru Kamau', email: 'wanjiru@example.com', profession: 'DOCTOR',
    headline: 'Family physician — online consultations',
    bio: 'General practice with interest in chronic conditions and women\'s health.',
    specialties: ['General practice', 'Hypertension', 'Diabetes'], languages: ['English', 'Swahili'], years: 12,
    country: 'KE', city: 'Nairobi', timezone: 'Africa/Nairobi', licence: { type: 'Medical licence', body: 'Kenya Medical Practitioners and Dentists Council' },
    services: [
      { category: 'TELEHEALTH', title: 'GP video consultation', mode: 'VIRTUAL', pricingType: 'FIXED', priceMinor: 250000, currency: 'KES', durationMinutes: 20, description: 'Consultation for non-emergency concerns, follow-up and referrals.' },
    ],
  },
  {
    name: 'Kofi Mensah', email: 'kofi@example.com', profession: 'PHYSIOTHERAPIST',
    headline: 'Physiotherapist — stroke and sports rehabilitation',
    bio: 'Home and clinic physiotherapy with structured exercise plans you can follow between sessions.',
    specialties: ['Stroke rehabilitation', 'Sports injuries', 'Back pain'], languages: ['English', 'Twi'], years: 8,
    country: 'GH', city: 'Accra', timezone: 'Africa/Accra', licence: { type: 'Professional licence', body: 'Allied Health Professions Council' },
    services: [
      { category: 'PHYSIOTHERAPY', title: 'Home physiotherapy session', mode: 'HOME', pricingType: 'FIXED', priceMinor: 45000, currency: 'GHS', durationMinutes: 60, description: 'Assessment and treatment at home.' },
      { category: 'PHYSIOTHERAPY', title: 'Online exercise review', mode: 'VIRTUAL', pricingType: 'FIXED', priceMinor: 20000, currency: 'GHS', durationMinutes: 30, description: 'Check technique and progress your home programme.' },
    ],
  },
  {
    name: 'Sarah Thompson', email: 'sarah@example.com', profession: 'PHYSIOTHERAPIST',
    headline: 'MSK physiotherapist — clinic and home visits',
    bio: 'Musculoskeletal specialist helping people recover from surgery and injury.',
    specialties: ['Post-operative rehab', 'Knee and hip', 'Back pain'], languages: ['English'], years: 9,
    country: 'GB', city: 'London', timezone: 'Europe/London', licence: { type: 'Professional registration', body: 'Health and Care Professions Council' },
    services: [
      { category: 'PHYSIOTHERAPY', title: 'Clinic physiotherapy', mode: 'CLINIC', pricingType: 'FIXED', priceMinor: 6500, currency: 'GBP', durationMinutes: 45, description: 'Assessment and hands-on treatment at the clinic.' },
      { category: 'PHYSIOTHERAPY', title: 'Home physiotherapy', mode: 'HOME', pricingType: 'FIXED', priceMinor: 9000, currency: 'GBP', durationMinutes: 60, description: 'Treatment in your home within zones 1–3.' },
    ],
  },
  {
    name: 'Maria Garcia', email: 'maria@example.com', profession: 'NURSE',
    headline: 'Registered nurse — overnight and recovery care',
    bio: 'Overnight shifts and recovery support after hospital discharge.',
    specialties: ['Overnight care', 'Hospital discharge support'], languages: ['English', 'Spanish'], years: 15,
    country: 'US', city: 'Houston', timezone: 'America/Chicago', licence: { type: 'RN licence', body: 'Texas Board of Nursing' },
    services: [
      { category: 'HOME_CARE', title: 'In-home nursing (hourly)', mode: 'HOME', pricingType: 'HOURLY', priceMinor: 6000, currency: 'USD', durationMinutes: 120, description: 'Skilled nursing at home, minimum two hours.' },
    ],
  },
  {
    name: 'Ibrahim Musa', email: 'ibrahim@example.com', profession: 'CAREGIVER',
    headline: 'Caregiver — awaiting verification',
    bio: 'New applicant used to demonstrate the admin verification queue.',
    specialties: ['Elderly care'], languages: ['English', 'Hausa'], years: 3,
    country: 'NG', city: 'Abuja', timezone: 'Africa/Lagos', licence: { type: 'Caregiver certificate', body: 'Federal Ministry of Health training programme' },
    status: 'PENDING',
    services: [
      { category: 'HOME_CARE', title: 'Day caregiver', mode: 'HOME', pricingType: 'HOURLY', priceMinor: 400000, currency: 'NGN', durationMinutes: 240, description: 'Daytime support for older adults.' },
    ],
  },
];

async function main() {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(), prisma.notification.deleteMany(), prisma.complaint.deleteMany(), prisma.review.deleteMany(),
    prisma.message.deleteMany(), prisma.payout.deleteMany(), prisma.payment.deleteMany(), prisma.booking.deleteMany(),
    prisma.availabilitySlot.deleteMany(), prisma.service.deleteMany(), prisma.credential.deleteMany(),
    prisma.providerProfile.deleteMany(), prisma.user.deleteMany(),
  ]);

  const hash = (p: string) => bcrypt.hash(p, 10);
  await prisma.user.create({ data: { email: 'admin@care.example', name: 'Care Admin', role: 'ADMIN', country: 'GB', passwordHash: await hash('Admin@12345') } });
  await prisma.user.create({ data: { email: 'patient@example.com', name: 'Ngozi Adeyemi', role: 'PATIENT', country: 'NG', phone: '+2348000000000', passwordHash: await hash('Patient@123') } });
  await prisma.user.create({ data: { email: 'family@example.com', name: 'James Carter', role: 'PATIENT', country: 'GB', phone: '+447700900000', passwordHash: await hash('Patient@123') } });

  const providerPassword = await hash('Provider@123');
  const inTwoYears = new Date(Date.now() + 2 * 365 * 24 * 3600_000);
  for (const p of providers) {
    const status = p.status ?? 'VERIFIED';
    await prisma.user.create({
      data: {
        email: p.email, name: p.name, role: 'PROVIDER', country: p.country, passwordHash: providerPassword,
        provider: {
          create: {
            profession: p.profession, headline: p.headline, bio: p.bio, specialties: p.specialties, languages: p.languages,
            yearsExperience: p.years, country: p.country, city: p.city, timezone: p.timezone, verificationStatus: status,
            credentials: {
              create: {
                type: p.licence.type, issuingBody: p.licence.body, number: `LIC-${Math.floor(Math.random() * 1e6)}`,
                country: p.country, expiresAt: inTwoYears, status: status === 'VERIFIED' ? 'APPROVED' : 'PENDING',
              },
            },
            services: { create: p.services },
            availability: { create: p.profession === 'CAREGIVER' ? everyDay8to20 : weekdays9to17 },
          },
        },
      },
    });
  }
  console.log(`Seeded admin, 2 patients and ${providers.length} providers.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
