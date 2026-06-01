/**
 * Shared constants for the platform
 * These constants are used across both frontend and backend
 */

/**
 * Standard roles available for both Venue and Event management
 * These roles can be assigned to staff, participants, or team members
 */
export const STANDARD_ROLES = [
  "Retreat Host",
  "Lead Facilitator",
  "Assistant Facilitator",
  "Yoga Teacher",
  "Meditation Teacher",
  "Sound Healing Facilitator",
  "Chef",
  "Sous Chef",
  "House Manager",
  "Housekeeper",
  "Driver",
  "Massage Therapist",
  "Photographer",
  "Videographer",
  "Marketing Manager",
  "Technical/AV",
  "Customer Support",
  "Safety Officer",
  "Childcare Provider",
  "Wellness Coordinator",
  "Booking Manager"
] as const;

/**
 * Type-safe role type derived from the STANDARD_ROLES array
 */
export type StandardRole = typeof STANDARD_ROLES[number];

/**
 * Helper function to check if a string is a standard role
 */
export function isStandardRole(role: string): role is StandardRole {
  return STANDARD_ROLES.includes(role as StandardRole);
}
