import { Profession, ServiceCategory, ServiceMode } from '@prisma/client';

/**
 * Professional scope: each role can only offer the service categories its
 * profession allows. Local law may narrow this further per country; that
 * belongs in this table once a launch market is chosen.
 */
export const allowedCategories: Record<Profession, ServiceCategory[]> = {
  CAREGIVER: ['HOME_CARE'],
  NURSE: ['HOME_CARE', 'TELEHEALTH'],
  DOCTOR: ['TELEHEALTH', 'HOME_CARE'],
  PHYSIOTHERAPIST: ['PHYSIOTHERAPY'],
};

export const allowedModes: Record<ServiceCategory, ServiceMode[]> = {
  HOME_CARE: ['HOME'],
  PHYSIOTHERAPY: ['HOME', 'CLINIC', 'VIRTUAL'],
  TELEHEALTH: ['VIRTUAL'],
};

export function isServiceAllowed(profession: Profession, category: ServiceCategory, mode: ServiceMode) {
  return allowedCategories[profession].includes(category) && allowedModes[category].includes(mode);
}
