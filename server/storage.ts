import {
  users,
  experiences,
  bookings,
  reviews,
  experienceGallery,
  venues,
  venueAvailability,
  serviceProviders,
  services,
  participantRoles,
  participantRoleAssignments,
  experienceVenues,
  venueContracts,
  venueInvites,
  venueOffers,
  experienceServices,
  experienceAmenities,
  amenities,
  participantConnections,
  experienceMessages,
  participantProfiles,
  experienceAnnouncements,
  participantReactions,
  promoterExperiences,
  promoterProfiles,
  promotionDeals,
  perkFulfillments,
  type PromotionDeal,
  type InsertPromotionDeal,
  type User,
  type UpsertUser,
  type Experience,
  type InsertExperience,
  type Booking,
  type InsertBooking,
  type Review,
  type InsertReview,
  type ExperienceGallery,
  type Venue,
  type InsertVenue,
  type VenueAvailability,
  type InsertVenueAvailability,
  type ServiceProvider,
  type InsertServiceProvider,
  type Service,
  type InsertService,
  type ParticipantRole,
  type InsertParticipantRole,
  type ParticipantRoleAssignment,
  type InsertParticipantRoleAssignment,
  type ExperienceVenue,
  type InsertExperienceVenue,
  type VenueContract,
  type InsertVenueContract,
  type VenueInvite,
  type InsertVenueInvite,
  type ExperienceService,
  type InsertExperienceService,
  type Amenity,
  type ExperienceAmenity,
  type ParticipantConnection,
  type InsertParticipantConnection,
  type ExperienceMessage,
  type InsertExperienceMessage,
  type ParticipantProfile,
  type InsertParticipantProfile,
  type ExperienceAnnouncement,
  type InsertExperienceAnnouncement,
  type ParticipantReaction,
  type InsertParticipantReaction,
  communityApplications,
  type CommunityApplication,
  type InsertCommunityApplication,
  creatorProfiles,
  type CreatorProfile,
  type InsertCreatorProfile,
  type PromoterProfile,
  type InsertPromoterProfile,
  communityGroups,
  communityGroupMembers,
  communityGroupMessages,
  communityEvents,
  type CommunityGroup,
  type InsertCommunityGroup,
  type CommunityGroupMember,
  type InsertCommunityGroupMember,
  type CommunityGroupMessage,
  type InsertCommunityGroupMessage,
  type CommunityEvent,
  type InsertCommunityEvent,
  experienceDrafts,
  type ExperienceDraft,
  type InsertExperienceDraft,
  reservations,
  type Reservation,
  type InsertReservation,
  referralClicks,
  experienceMessages,
  splitRecipients,
  type SplitRecipient,
  type InsertSplitRecipient,
  scheduledPayouts,
  type ScheduledPayout,
  type InsertScheduledPayout,
} from "@shared/schema";
import { db } from "./db";
import { randomBytes } from "crypto";
import { eq, desc, and, or, sql, count, inArray, asc, not, isNull, isNotNull } from "drizzle-orm";
import { normalizeCurrency } from "./impactLedger";
import { getDepositSchedule, isSingleDayExperience } from "@shared/depositRules";
import { isQualifyingReferralBooking, resolveMilestoneReward } from "./fulfillmentRules";
import { sumBookingTicketQuantity } from "@shared/ticketDeduction";
import { getVenueDealTermsKey, normalizeVenueDealModel } from "@shared/venueDealModels";

function withoutSingleDayDeposits(experience: Record<string, any>): any {
  if (!isSingleDayExperience(experience)) return experience;

  const ticketSkus = Array.isArray(experience.ticketSkus)
    ? experience.ticketSkus.map((sku: any) => ({ ...sku, depositPerPerson: 0 }))
    : experience.ticketSkus;

  return {
    ...experience,
    ticketSkus,
    depositEnabled: false,
    depositPercentage: "0.00",
    depositAmount: "0.00",
    balanceAmount: "0.00",
  };
}

type ReferralClickStats = {
  totalClicks: number;
  uniqueClicks: number;
  conversions: number;
  conversionRate: number;
};

type PromoterExperienceRecord = {
  id: string;
  promoterId: string;
  experienceId: string;
  shareToken: string | null;
  referralAudience: string;
  promotionDealId: string | null;
  createdAt: Date | null;
};

export type MilestoneReferralProgress = {
  promoterExperienceId: string;
  promoterId: string;
  referralAudience: string;
  qualifyingBookings: number;
  milestoneTarget: number;
  rewardDescription: string;
  fulfillmentId: string | null;
  unlocked: boolean;
};

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPromoterCode(code: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User>;
  setUserReferrer(userId: string, promoterId: string): Promise<User>;
  ensureUserReferralCode(userId: string): Promise<string>;

  // Experience operations
  createExperience(experience: InsertExperience): Promise<Experience>;
  getExperience(id: string): Promise<Experience | undefined>;
  getExperienceBySlug(slug: string): Promise<Experience | undefined>;
  getAllExperiences(): Promise<Experience[]>;
  getExperiences(options?: { category?: string; status?: string; limit?: number }): Promise<Experience[]>;
  getOpenVenueEvents(city?: string): Promise<Experience[]>;
  getExperiencesWithParticipantPreview(options?: { category?: string; status?: string; limit?: number }): Promise<Array<Experience & {
    participantsPreview: Array<{
      userId: string;
      avatarUrl: string | null;
      displayName: string | null;
      firstName: string | null;
      isActive?: boolean;
    }>;
    activeChatters: number;
  }>>;
  getExperiencesByCreator(creatorId: string): Promise<Experience[]>;
  getExperiencesByVenue(venueId: string): Promise<Experience[]>;
  getExperiencesByVenueIds(venueIds: string[], status?: string): Promise<Experience[]>;
  updateExperience(id: string, updates: Partial<InsertExperience>): Promise<Experience>;
  updateExperienceStatus(id: string, status: string): Promise<void>;
  getBookingsByVenueIds(venueIds: string[]): Promise<any[]>;
  getBookingsByCreator(creatorId: string): Promise<any[]>;
  recordReferralClick(data: {
    promoterCode: string;
    promoterId: string;
    experienceId: string | null;
    promoterExperienceId?: string | null;
    visitorUserId: string | null;
    ipHash: string | null;
    userAgent: string | null;
  }): Promise<void>;
  markReferralClickConverted(criteria: {
    bookingId: string;
    promoterCode?: string | null;
    promoterId?: string | null;
    experienceId?: string | null;
    promoterExperienceId?: string | null;
  }): Promise<void>;
  getReferralClickStats(
    promoterId: string,
    options?: { promoterExperienceId?: string; experienceId?: string; referralAudience?: "participant" | "official_partner" },
  ): Promise<ReferralClickStats>;
  createExperienceMessage(data: { experienceId: string; userId: string; message: string; messageType?: string }): Promise<void>;
  deleteExperience(id: string): Promise<void>;
  archiveExperience(id: string, actorId: string, reason?: string): Promise<Experience>;
  
  // Experience draft operations
  getExperienceDraftsByCreator(creatorId: string): Promise<ExperienceDraft[]>;
  createExperienceDraft(draft: InsertExperienceDraft): Promise<ExperienceDraft>;
  updateExperienceDraft(id: string, creatorId: string, updates: Partial<InsertExperienceDraft>): Promise<ExperienceDraft>;
  deleteExperienceDraft(id: string, creatorId: string): Promise<void>;
  getExperienceDraftById(id: string): Promise<ExperienceDraft | undefined>;
  getExperienceDraft(id: string, creatorId: string): Promise<ExperienceDraft | undefined>;

  // Admin operations
  getPendingExperiences(): Promise<Experience[]>;
  getPendingExperiencesByCreator(creatorId: string): Promise<Experience[]>;
  approveExperience(id: string, reviewedBy: string, reviewNotes?: string): Promise<Experience>;
  rejectExperience(id: string, reviewedBy: string, reviewNotes?: string): Promise<Experience>;

  // Booking operations
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingByUserAndExperience(userId: string, experienceId: string): Promise<Booking | undefined>;
  getUserBookings(userId: string): Promise<Booking[]>;
  getExperienceBookings(experienceId: string): Promise<Booking[]>;
  getBookingsByExperience(experienceId: string): Promise<Booking[]>;
  updateBooking(id: string, updates: Partial<any>): Promise<Booking>;
  updateBookingStatus(id: string, status: string): Promise<Booking>;
  updateBookingBalancePayment(id: string, balancePaymentIntentId: string, balanceDueDate: Date | null): Promise<Booking>;
  createDeposit(experienceId: string, userId: string, amount: number, paymentIntentId?: string): Promise<Booking>;
  deleteBooking(id: string): Promise<void>;
  getExperienceParticipantAvatars(experienceId: string): Promise<Array<{
    avatarUrl: string | null;
    firstName: string | null;
    displayName: string | null;
  }>>;
  getExperienceSocialProof(experienceId: string): Promise<{
    participants: Array<{ userId?: string | null; avatarUrl: string | null; firstName: string | null; displayName: string | null; isPlaceholder?: boolean }>;
    totalCount: number;
  }>;

  // Reservation operations (soft-hold system)
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  getReservation(id: string): Promise<Reservation | undefined>;
  getUserActiveReservations(userId: string): Promise<Reservation[]>;
  getExperienceActiveReservations(experienceId: string): Promise<Reservation[]>;
  convertReservationToBooking(reservationId: string, bookingId: string): Promise<Reservation>;
  expireReservation(reservationId: string): Promise<Reservation>;
  cancelReservation(reservationId: string): Promise<Reservation>;
  getExpiredReservations(): Promise<Reservation[]>; // For cleanup jobs
  
  // MVG operations
  getAllMVGExperiences(): Promise<Experience[]>;
  updateExperienceMVGStatus(id: string, status: "pending" | "met" | "failed"): Promise<Experience>;
  processMVGSuccess(experienceId: string): Promise<{ experience: Experience; confirmedBookings: number }>;
  processMVGFailure(experienceId: string): Promise<{ experience: Experience; refundedBookings: number }>;
  getMVGProgress(experienceId: string): Promise<{
    current_participants: number;
    minimum_participants: number;
    mvg_met: boolean;
  }>;
  
  // Deposit capture operations
  getEligibleDepositsForCapture(experienceId: string): Promise<Booking[]>;
  markDepositAsCaptured(bookingId: string): Promise<Booking>;
  getConfirmedBookings(experienceId: string): Promise<Booking[]>;
  
  // Deposit refund operations (MVG failure)
  getEligibleBookingsForRefund(experienceId: string): Promise<Booking[]>;
  markBookingAsRefunded(bookingId: string): Promise<Booking>;

  // Review operations
  createReview(review: InsertReview): Promise<Review>;
  getExperienceReviews(experienceId: string): Promise<Review[]>;
  
  // Gallery operations
  getExperienceGallery(experienceId: string): Promise<ExperienceGallery[]>;
  getExperienceAmenities(experienceId: string): Promise<Array<{ id: string; name: string; category: string; icon?: string }>>;
  getExperienceServices(experienceId: string): Promise<Array<{ id: string; name: string; category: string; status: string }>>;

  // Venue operations
  createVenue(venue: InsertVenue): Promise<Venue>;
  getVenue(id: string): Promise<Venue | undefined>;
  getVenueBySlug(slug: string): Promise<Venue | undefined>;
  getVenues(options?: { location?: string; type?: string; approved?: boolean }): Promise<Venue[]>;
  getVenuesByCreator(userId: string): Promise<Venue[]>;
  updateVenue(id: string, updates: Partial<InsertVenue>): Promise<Venue>;
  deleteVenue(id: string): Promise<void>;
  updateVenueDisplayPrefs(id: string, displayPrefs: { servicesPlacement?: "sidebar" | "inline" }): Promise<Venue>;
  
  // Admin operations for venues
  getPendingVenues(): Promise<Venue[]>;
  approveVenue(id: string, reviewedBy: string, reviewNotes?: string): Promise<Venue>;
  rejectVenue(id: string, reviewedBy: string, reviewNotes?: string): Promise<Venue>;
  
  // Venue availability operations
  createVenueAvailability(availability: InsertVenueAvailability): Promise<VenueAvailability>;
  getVenueAvailability(venueId: string): Promise<VenueAvailability[]>;
  getVenueAvailabilityById(id: string): Promise<VenueAvailability | undefined>;
  updateVenueAvailability(id: string, updates: Partial<InsertVenueAvailability>): Promise<VenueAvailability>;
  deleteVenueAvailability(id: string): Promise<void>;
  updateVenueGoogleCalendar(venueId: string, connected: boolean, calendarId?: string): Promise<Venue>;

  // Service provider operations
  createServiceProvider(service: InsertServiceProvider): Promise<ServiceProvider>;
  getServiceProvider(id: string): Promise<ServiceProvider | undefined>;
  getServiceProviders(options?: { location?: string; type?: string; approved?: boolean }): Promise<ServiceProvider[]>;
  updateServiceProvider(id: string, updates: Partial<InsertServiceProvider>): Promise<ServiceProvider>;
  deleteServiceProvider(id: string): Promise<void>;
  
  // Admin operations for service providers
  getPendingServiceProviders(): Promise<ServiceProvider[]>;
  approveServiceProvider(id: string): Promise<ServiceProvider>;
  rejectServiceProvider(id: string): Promise<ServiceProvider>;

  // Experience venue/service linking operations
  addVenueToExperience(experienceId: string, venueId: string): Promise<ExperienceVenue>;
  addServiceToExperience(experienceId: string, serviceId: string, roleDescription?: string): Promise<ExperienceService>;
  getExperienceVenues(experienceId: string): Promise<Venue[]>;
  upsertVenueContract(contract: InsertVenueContract): Promise<VenueContract>;
  getVenueContractsByVenueIds(venueIds: string[], status?: string | string[]): Promise<any[]>;
  getVenueContractByExperience(experienceId: string): Promise<VenueContract | undefined>;
  getVenueContractById(contractId: string): Promise<VenueContract | undefined>;
  getAcceptedVenueContractForExperience(experienceId: string): Promise<VenueContract | undefined>;
  acceptVenueContract(experienceId: string, venueId: string): Promise<VenueContract>;
  declineVenueContract(experienceId: string, venueId: string, reason?: string): Promise<VenueContract>;
  updateVenueContractSponsorshipStatus(contractId: string, status: string, paymentIntentId?: string): Promise<VenueContract>;

  // Venue Offers — Reverse Handshake bids (venue owner → creator)
  createVenueOffer(data: { experienceId: string; venueId: string; venueOwnerId: string; model: string; terms: object; message?: string; status?: "pending" }): Promise<any>;
  getVenueOffersForExperience(experienceId: string): Promise<any[]>;
  getVenueOffersForCreator(creatorId: string): Promise<any[]>;
  getAcceptedVenueOffersForCreator(creatorId: string): Promise<any[]>;
  getAcceptedVenueDealsForVenueOwner(venueOwnerId: string, venueIds: string[]): Promise<any[]>;
  getVenueOffer(offerId: string): Promise<any | undefined>;
  updateVenueOfferStatus(offerId: string, status: "accepted" | "declined"): Promise<any>;
  updateVenueContractProposal(experienceId: string, venueId: string, model: string, terms: object, status: "pending" | "countered"): Promise<VenueContract>;
  
  // Availability checking operations
  getAvailableVenues(options: { startDate?: string; endDate?: string; capacity?: number; venueType?: string }): Promise<Venue[]>;
  getAvailableServices(options: { startDate?: string; endDate?: string; category?: string; location?: string }): Promise<ServiceProvider[]>;
  getAllServicesWithProviders(): Promise<(Service & { provider: ServiceProvider })[]>;
  
  // Experience association methods
  associateExperienceVenue(experienceId: string, venueId: string): Promise<ExperienceVenue>;
  associateExperienceService(experienceId: string, serviceId: string, roleDescription?: string): Promise<ExperienceService>;
  
  // Venue/service assignment methods (aliases for compatibility)
  assignVenueToExperience(data: { experienceId: string; venueId: string }): Promise<ExperienceVenue>;
  assignServiceToExperience(data: { experienceId: string; serviceId: string; roleDescription?: string }): Promise<ExperienceService>;

  // Experience authorization operations
  isExperienceCreator(experienceId: string, userId: string): Promise<boolean>;

  // Participant profile operations
  createParticipantProfile(profile: InsertParticipantProfile): Promise<ParticipantProfile>;
  getParticipantProfile(userId: string): Promise<ParticipantProfile | undefined>;
  getParticipantProfileByUserId(userId: string): Promise<ParticipantProfile | undefined>;
  getAllParticipantProfiles(): Promise<ParticipantProfile[]>;
  getExperienceParticipants(experienceId: string, requestingUserId?: string): Promise<Array<{
    userId: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    bookingId: string;
    bookingDate: Date;
  }>>;
  updateParticipantProfile(userId: string, updates: Partial<InsertParticipantProfile>): Promise<ParticipantProfile>;
  getProfilesByExperience(experienceId: string, requestingUserId?: string): Promise<ParticipantProfile[]>;

  // Creator profile operations
  createCreatorProfile(profile: InsertCreatorProfile): Promise<CreatorProfile>;
  getCreatorProfile(userId: string): Promise<CreatorProfile | undefined>;
  getCreatorProfileByUserId(userId: string): Promise<CreatorProfile | undefined>;
  createOrUpdateCreatorProfile(userId: string, profileData: Omit<InsertCreatorProfile, 'userId'>): Promise<CreatorProfile>;
  updateCreatorProfileStripe(userId: string, stripeAccountId: string): Promise<void>;
  setCreatorStripeVerificationStatus(userId: string, verificationStatus: string): Promise<void>;
  getPromoterProfile(userId: string): Promise<PromoterProfile | undefined>;
  getPromoterProfileByUserId(userId: string): Promise<PromoterProfile | undefined>;
  createOrUpdatePromoterProfile(userId: string, profileData: Omit<InsertPromoterProfile, 'userId'>): Promise<PromoterProfile>;
  updatePromoterProfileStripe(userId: string, stripeAccountId: string, verificationStatus?: string): Promise<void>;

  // Participant interaction operations
  createConnection(connection: InsertParticipantConnection): Promise<ParticipantConnection>;
  getUserConnections(userId: string): Promise<ParticipantConnection[]>;
  createMessage(message: InsertExperienceMessage): Promise<ExperienceMessage>;
  getExperienceMessages(experienceId: string): Promise<ExperienceMessage[]>;
  createAnnouncement(announcement: InsertExperienceAnnouncement): Promise<ExperienceAnnouncement>;
  getExperienceAnnouncements(experienceId: string): Promise<ExperienceAnnouncement[]>;
  createReaction(reaction: InsertParticipantReaction): Promise<ParticipantReaction>;

  // Community group operations
  createCommunityGroup(group: InsertCommunityGroup): Promise<CommunityGroup>;
  getCommunityGroups(): Promise<CommunityGroup[]>;
  getCommunityGroup(id: string): Promise<CommunityGroup | undefined>;
  joinGroup(groupId: string, userId: string): Promise<CommunityGroupMember>;
  leaveGroup(groupId: string, userId: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<CommunityGroupMember[]>;
  isGroupMember(groupId: string, userId: string): Promise<boolean>;
  createGroupMessage(message: InsertCommunityGroupMessage): Promise<CommunityGroupMessage>;
  getGroupMessages(groupId: string): Promise<CommunityGroupMessage[]>;
  getCommunityEvents(): Promise<CommunityEvent[]>;
  createCommunityEvent(event: InsertCommunityEvent): Promise<CommunityEvent>;
  joinCommunityEvent(eventId: string): Promise<CommunityEvent>;
  getFeaturedMembers(): Promise<ParticipantProfile[]>;

  // Promoter dashboard operations
  getPromoterBookings(promoterId: string, referralAudience?: "participant" | "official_partner"): Promise<Booking[]>;
  getPromoterEarningsSummary(promoterId: string, referralAudience?: "participant" | "official_partner"): Promise<{
    byCurrency: Array<{
      currency: string;
      estimated: number;
      locked: number;
      paid: number;
      voided: number;
      totalBookings: number;
    }>;
  }>;
  getPromoterExperiences(promoterId: string): Promise<Array<{
    promoterExperienceId: string | null;
    shareToken: string | null;
    referralAudience: string;
    promotionDealId: string | null;
    experience: Experience;
    spotsBooked: number;
    estimatedCommission: number;
    lockedCommission: number;
    paidCommission: number;
    currency: string;
    clicks: number;
    uniqueVisitors: number;
    conversions: number;
    conversionRate: number;
  }>>;
  syncMilestoneFulfillmentForBooking(bookingId: string): Promise<MilestoneReferralProgress | undefined>;
  getCreatorPerkFulfillments(creatorId: string): Promise<any[]>;
  updatePerkFulfillmentStatus(
    id: string,
    creatorId: string,
    status: "unlocked" | "fulfilled",
    notes?: string,
  ): Promise<any | undefined>;

  // Admin promoter management operations
  getAllPromoters(): Promise<User[]>;
  getPromoterBookingsWithDetails(promoterId: string): Promise<Array<{
    booking: Booking;
    experience: Experience;
    participant: User | undefined;
  }>>;
  getAdminDealLedger(): Promise<any[]>;

  // Split recipients (multi-party payout routing per experience)
  createSplitRecipients(recipients: InsertSplitRecipient[]): Promise<SplitRecipient[]>;
  getSplitRecipientsByExperience(experienceId: string): Promise<SplitRecipient[]>;
  deleteSplitRecipientsByExperience(experienceId: string): Promise<void>;

  // Scheduled payouts (7-day post-event payout jobs)
  upsertScheduledPayout(experienceId: string, scheduledFor: Date, totalGrossCents: number): Promise<ScheduledPayout>;
  addScheduledPayoutAdditionalGross(experienceId: string, scheduledFor: Date, amountCents: number): Promise<ScheduledPayout>;
  getScheduledPayoutByExperience(experienceId: string): Promise<ScheduledPayout | undefined>;
  updateScheduledPayout(id: string, updates: Partial<ScheduledPayout>): Promise<ScheduledPayout>;
  getExperiencesReadyForPayout(): Promise<{
    experienceId: string;
    scheduledPayoutId: string;
    presetGrossCents: number;
    additionalGrossCents: number;
  }[]>;
}

function getReferralVisitorKey(click: {
  id?: string;
  visitorUserId?: string | null;
  ipHash?: string | null;
}): string {
  if (click.visitorUserId) return `user:${click.visitorUserId}`;
  if (click.ipHash) return `ip:${click.ipHash}`;
  return `click:${click.id ?? Math.random().toString(36).slice(2)}`;
}

function getPromoterMetricKey(promoterExperienceId: string | null, experienceId: string | null): string | null {
  if (promoterExperienceId) return `pe:${promoterExperienceId}`;
  if (experienceId) return `exp:${experienceId}`;
  return null;
}

export class DatabaseStorage implements IStorage {
  // User operations (mandatory for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPromoterCode(code: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.promoterCode, code));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUserRole(id: string, role: "participant" | "creator" | "venue_provider" | "service_provider" | "admin" | "promoter"): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async setUserReferrer(userId: string, promoterId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        referredByPromoterId: promoterId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async ensureUserReferralCode(userId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");
    if (user.promoterCode) return user.promoterCode;

    const code = `P${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const [updatedUser] = await db
      .update(users)
      .set({ promoterCode: code, updatedAt: new Date() })
      .where(and(eq(users.id, userId), sql`${users.promoterCode} IS NULL`))
      .returning();

    if (updatedUser?.promoterCode) return updatedUser.promoterCode;

    const freshUser = await this.getUser(userId);
    if (freshUser?.promoterCode) return freshUser.promoterCode;
    throw new Error("Could not generate referral code");
  }

  // Experience operations
  async createExperience(experienceData: InsertExperience): Promise<Experience> {
    const normalizedExperience = withoutSingleDayDeposits(experienceData);
    const [experience] = await db.insert(experiences).values([normalizedExperience]).returning();
    this.syncDirectPromotionDeals(experience.id).catch((err) =>
      console.error("Error syncing direct promotion deals:", err),
    );
    return experience;
  }

  async getExperience(id: string): Promise<Experience | undefined> {
    const [experience] = await db.select().from(experiences).where(eq(experiences.id, id));
    return experience;
  }

  async getExperienceBySlug(slug: string): Promise<Experience | undefined> {
    const [experience] = await db.select().from(experiences).where(eq(experiences.slug, slug));
    return experience;
  }

  async getAllExperiences(): Promise<Experience[]> {
    return await db.select().from(experiences).orderBy(desc(experiences.createdAt));
  }

  async getExperiences(options: { category?: string; status?: string; limit?: number } = {}): Promise<Experience[]> {
    // Return approved AND published experiences by default, or filter by provided status
    // Ordering: startDate ASC (closest first), then createdAt DESC (newest upload as tiebreaker)
    try {
      if (options.status) {
        // Filter by specific status if provided
        return await db
          .select()
          .from(experiences)
          .where(eq(experiences.status, options.status as any))
          .orderBy(asc(experiences.startDate), desc(experiences.createdAt))
          .limit(options.limit || 50);
      } else {
        // Default: return both approved and published experiences
        return await db
          .select()
          .from(experiences)
          .where(
            or(
              eq(experiences.status, 'approved'),
              eq(experiences.status, 'published')
            )
          )
          .orderBy(asc(experiences.startDate), desc(experiences.createdAt))
          .limit(options.limit || 50);
      }
    } catch (error) {
      console.error("Error in getExperiences:", error);
      throw error;
    }
  }

  async getExperiencesWithParticipantPreview(options: { category?: string; status?: string; limit?: number } = {}): Promise<Array<Experience & {
    participantsPreview: Array<{
      userId: string;
      avatarUrl: string | null;
      displayName: string | null;
      firstName: string | null;
      isActive?: boolean;
    }>;
    activeChatters: number;
  }>> {
    // Get base experiences
    const experiencesList = await this.getExperiences(options);
    
    if (experiencesList.length === 0) {
      return [];
    }

    const experienceIds = experiencesList.map(e => e.id);

    // Batch-load all bookings for these experiences
    // Only include participants who have actually committed with payment
    // Exclude raw "pending" (payment not started) and cancelled/failed statuses
    const allBookings = await db
      .select({
        experienceId: bookings.experienceId,
        userId: bookings.userId,
      })
      .from(bookings)
      .where(
        and(
          inArray(bookings.experienceId, experienceIds),
          or(
            eq(bookings.status, "confirmed"),
            eq(bookings.status, "deposit_authorized"),
            eq(bookings.status, "deposit_paid"),
            eq(bookings.status, "fully_paid")
          )
        )
      );

    // Get unique user IDs
    const allUserIds = Array.from(new Set(allBookings.map(b => b.userId)));
    
    if (allUserIds.length === 0) {
      return experiencesList.map(exp => ({
        ...exp,
        participantsPreview: [],
        activeChatters: 0,
      }));
    }

    // Batch-load member identity data. Keep booked users even when they have not
    // completed the optional participant profile yet, so social proof does not vanish.
    const participantProfilesData = await db
      .select({
        userId: users.id,
        avatarUrl: participantProfiles.avatarUrl,
        displayName: participantProfiles.displayName,
        firstName: users.firstName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .leftJoin(participantProfiles, eq(participantProfiles.userId, users.id))
      .where(inArray(users.id, allUserIds));

    // Batch-load recent messages (last 15 minutes) to determine active chatters
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recentMessages = await db
      .select({
        experienceId: experienceMessages.experienceId,
        userId: experienceMessages.userId,
      })
      .from(experienceMessages)
      .where(
        and(
          inArray(experienceMessages.experienceId, experienceIds),
          sql`${experienceMessages.createdAt} >= ${fifteenMinutesAgo}`
        )
      );

    // Build lookup maps
    const profilesByUserId = new Map(
      participantProfilesData.map(p => [p.userId, p])
    );

    const activeUsersByExperience = new Map<string, Set<string>>();
    recentMessages.forEach(msg => {
      if (!activeUsersByExperience.has(msg.experienceId)) {
        activeUsersByExperience.set(msg.experienceId, new Set());
      }
      activeUsersByExperience.get(msg.experienceId)!.add(msg.userId);
    });

    // Enrich each experience with participant previews
    return experiencesList.map(exp => {
      const expBookings = allBookings.filter(b => b.experienceId === exp.id);
      const activeUsers = activeUsersByExperience.get(exp.id) || new Set();
      
      // Test account filter — exclude test/qa/anonymous users
      const isTestAccount = (firstName: string | null, displayName: string | null) => {
        const name = `${firstName || ''} ${displayName || ''}`.toLowerCase();
        return name.includes('test') || name.includes(' qa') || name.startsWith('qa') || name.includes('anonymous');
      };

      // Get first 4 real participants with profiles
      const participantsPreview = expBookings
        .map(b => {
          const profile = profilesByUserId.get(b.userId);
          if (!profile) return null;
          if (isTestAccount(profile.firstName, profile.displayName)) return null;
          
          return {
            userId: b.userId,
            avatarUrl: profile.avatarUrl || profile.profileImageUrl || null,
            displayName: profile.displayName || null,
            firstName: profile.firstName || null,
            isActive: activeUsers.has(b.userId),
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null && (p.displayName !== null || p.firstName !== null || p.avatarUrl !== null))
        .slice(0, 4); // Limit to 4 previews

      return {
        ...exp,
        participantsPreview,
        activeChatters: activeUsers.size || 0,
      };
    });
  }

  async getExperiencesByCreator(creatorId: string): Promise<Experience[]> {
    return await db
      .select()
      .from(experiences)
      .where(eq(experiences.creatorId, creatorId))
      .orderBy(desc(experiences.createdAt));
  }

  async getExperiencesByVenue(venueId: string): Promise<Experience[]> {
    return await db
      .select()
      .from(experiences)
      .where(
        and(
          eq(experiences.linkedVenueId, venueId),
          or(
            eq(experiences.status, "published"),
            eq(experiences.status, "approved")
          )
        )
      )
      .orderBy(desc(experiences.startDate));
  }

  async updateExperience(id: string, updates: Partial<InsertExperience>): Promise<Experience> {
    const current = await this.getExperience(id);
    const normalizedUpdates = current && isSingleDayExperience({ ...current, ...updates })
      ? withoutSingleDayDeposits({
          ...updates,
          experienceType: updates.experienceType ?? current.experienceType,
          startDate: updates.startDate ?? current.startDate,
          endDate: updates.endDate ?? current.endDate,
          ticketSkus: updates.ticketSkus ?? current.ticketSkus,
        })
      : updates;
    const updateData = { ...normalizedUpdates, updatedAt: new Date() } as any;
    const [experience] = await db
      .update(experiences)
      .set(updateData)
      .where(eq(experiences.id, id))
      .returning();
    this.syncDirectPromotionDeals(id).catch((err) =>
      console.error("Error syncing direct promotion deals:", err),
    );
    return experience;
  }

  async updateExperienceStatus(id: string, status: string): Promise<void> {
    if (status === "approved" || status === "published") {
      const current = await this.getExperience(id);
      if (current?.status === "cancelled" || current?.mvgStatus === "failed") {
        return;
      }
    }
    await db.update(experiences).set({ status: status as any, updatedAt: new Date() }).where(eq(experiences.id, id));
    this.syncDirectPromotionDeals(id).catch((err) =>
      console.error("Error syncing direct promotion deals:", err),
    );
  }

  async getExperiencesByVenueIds(venueIds: string[], status?: string): Promise<Experience[]> {
    if (!venueIds.length) return [];
    const rows = await db.select().from(experiences)
      .where(inArray((experiences as any).linkedVenueId, venueIds));
    if (status) return rows.filter((e: any) => e.status === status);
    return rows;
  }

  async getOpenVenueEvents(city?: string): Promise<Experience[]> {
    // Returns published/approved experiences that are actively seeking a venue
    // (venueStatus = "venue_pending"). Optionally filtered by city substring match.
    const conditions = [
      eq((experiences as any).venueStatus, "venue_pending"),
    ];
    if (city && city.trim()) {
      conditions.push(
        sql`lower(${(experiences as any).location}) like ${'%' + city.trim().toLowerCase() + '%'}` as any
      );
    }
    return await db.select().from(experiences).where(and(...conditions));
  }

  // ── Venue Offers (Reverse Handshake) ────────────────────────────────────────

  async createVenueOffer(data: { experienceId: string; venueId: string; venueOwnerId: string; model: string; terms: object; message?: string; status?: "pending" }): Promise<any> {
    const [offer] = await db.insert(venueOffers).values({
      experienceId: data.experienceId,
      venueId: data.venueId,
      venueOwnerId: data.venueOwnerId,
      model: data.model,
      terms: data.terms as any,
      message: data.message || null,
      // A venue's bid reaches the creator's Venue Offers tab immediately — the
      // platform does not sit in the middle of every negotiation.
      status: data.status || "pending",
    }).returning();
    return offer;
  }

  async getVenueOffersForExperience(experienceId: string): Promise<any[]> {
    return await db.select({
      offer: venueOffers,
      venue: venues,
    })
      .from(venueOffers)
      .leftJoin(venues, eq(venueOffers.venueId, venues.id))
      .where(eq(venueOffers.experienceId, experienceId))
      .orderBy(desc((venueOffers as any).createdAt));
  }

  async getVenueOffersForCreator(creatorId: string): Promise<any[]> {
    // Returns pending reverse-market bids and direct-invite counter offers.
    const creatorExperiences = await this.getExperiencesByCreator(creatorId);
    const experienceIds = creatorExperiences.map((experience: any) => experience.id);
    if (!experienceIds.length) return [];
    const rows = await db.select({
      offer: venueOffers,
      venue: venues,
      experience: experiences,
    })
      .from(venueOffers)
      .leftJoin(venues, eq(venueOffers.venueId, venues.id))
      .leftJoin(experiences, eq(venueOffers.experienceId, experiences.id))
      .where(and(
        inArray(venueOffers.experienceId, experienceIds),
        eq((venueOffers as any).status, "pending"),
        eq((venues as any).status, "approved"),
      ))
      .orderBy(desc((venueOffers as any).createdAt));
    return rows;
  }

  /**
   * Invitations the creator has emailed to venues that are not on the platform
   * yet, and which nobody has answered.
   *
   * These are not bids — there is no venue account behind them and nothing for
   * the creator to accept. They exist so a creator can see that an invitation
   * is out and waiting, rather than wondering whether it sent at all.
   */
  async getPendingVenueInvitesForCreator(creatorId: string): Promise<any[]> {
    const rows = await db.select({ invite: venueInvites, experience: experiences })
      .from(venueInvites)
      .innerJoin(experiences, eq(venueInvites.experienceId, experiences.id))
      .where(and(
        eq(venueInvites.creatorId, creatorId),
        eq(venueInvites.status, "pending"),
      ))
      .orderBy(desc(venueInvites.createdAt));

    return rows.map(({ invite, experience }) => ({
      id: invite.id,
      experienceId: experience.id,
      experienceTitle: experience.title,
      startDate: experience.startDate,
      endDate: experience.endDate,
      venueName: invite.venueName || invite.contactName || invite.email,
      contactName: invite.contactName,
      email: invite.email,
      proposedModel: invite.proposedModel,
      proposedValue: invite.proposedValue != null ? Number(invite.proposedValue) : null,
      currency: invite.currency || experience.currency || "eur",
      status: invite.status,
      sentAt: invite.createdAt,
      // Every write to a still-pending invite is a send — the original, a
      // republish, or a creator asking for it again — so this is when the
      // venue was last emailed.
      lastSentAt: invite.updatedAt || invite.createdAt,
      expiresAt: invite.expiresAt,
    }));
  }

  async getAcceptedVenueOffersForCreator(creatorId: string): Promise<any[]> {
    // Returns all accepted offers for experiences the creator owns — used to show confirmed venue deals
    const creatorExperiences = await this.getExperiencesByCreator(creatorId);
    const allIds = creatorExperiences.map((e: any) => e.id);
    if (!allIds.length) return [];
    const [offerRows, contractRows] = await Promise.all([
      db.select({ offer: venueOffers, venue: venues, experience: experiences })
        .from(venueOffers)
        .leftJoin(venues, eq(venueOffers.venueId, venues.id))
        .leftJoin(experiences, eq(venueOffers.experienceId, experiences.id))
        .where(and(
          inArray(venueOffers.experienceId, allIds),
          eq((venueOffers as any).status, "accepted"),
        )),
      db.select({ contract: venueContracts, venue: venues, experience: experiences })
        .from(venueContracts)
        .leftJoin(venues, eq(venueContracts.venueId, venues.id))
        .leftJoin(experiences, eq(venueContracts.experienceId, experiences.id))
        .where(and(
          eq(venueContracts.creatorId, creatorId),
          eq(venueContracts.status, "accepted"),
        )),
    ]);

    const offerKeys = new Set(offerRows.map(({ offer }) => `${offer.experienceId}:${offer.venueId}`));
    const normalizedContracts = contractRows
      .filter(({ contract }) => !offerKeys.has(`${contract.experienceId}:${contract.venueId}`))
      .map(({ contract, venue, experience }) => ({ offer: contract, venue, experience }));

    return [...offerRows, ...normalizedContracts].sort((left, right) =>
      new Date((right.offer as any).updatedAt || 0).getTime()
      - new Date((left.offer as any).updatedAt || 0).getTime(),
    );
  }

  async getAcceptedVenueDealsForVenueOwner(venueOwnerId: string, venueIds: string[]): Promise<any[]> {
    if (!venueIds.length) return [];
    const [contractRows, offerRows] = await Promise.all([
      db.select({ contract: venueContracts, venue: venues, experience: experiences })
        .from(venueContracts)
        .innerJoin(venues, eq(venueContracts.venueId, venues.id))
        .innerJoin(experiences, eq(venueContracts.experienceId, experiences.id))
        .where(and(
          inArray(venueContracts.venueId, venueIds),
          eq(venueContracts.status, "accepted"),
        )),
      db.select({ offer: venueOffers, venue: venues, experience: experiences })
        .from(venueOffers)
        .innerJoin(venues, eq(venueOffers.venueId, venues.id))
        .innerJoin(experiences, eq(venueOffers.experienceId, experiences.id))
        .where(and(
          eq(venueOffers.venueOwnerId, venueOwnerId),
          inArray(venueOffers.venueId, venueIds),
          eq((venueOffers as any).status, "accepted"),
        )),
    ]);

    const contractKeys = new Set(contractRows.map(({ contract }) => `${contract.experienceId}:${contract.venueId}`));
    const normalized = [
      ...contractRows.map(({ contract, venue, experience }) => ({
        id: contract.id,
        source: "contract",
        status: contract.status,
        model: contract.model,
        terms: contract.terms || {},
        acceptedAt: contract.acceptedAt || contract.updatedAt,
        experience,
        venue,
      })),
      ...offerRows
        .filter(({ offer }) => !contractKeys.has(`${offer.experienceId}:${offer.venueId}`))
        .map(({ offer, venue, experience }) => ({
          id: offer.id,
          source: "offer",
          status: offer.status,
          model: offer.model,
          terms: offer.terms || {},
          acceptedAt: offer.updatedAt,
          experience,
          venue,
        })),
    ];

    return normalized.sort((left, right) =>
      new Date(right.acceptedAt || 0).getTime() - new Date(left.acceptedAt || 0).getTime(),
    );
  }

  async getVenueOffer(offerId: string): Promise<any | undefined> {
    const rows = await db.select().from(venueOffers).where(eq(venueOffers.id, offerId));
    return rows[0];
  }

  async updateVenueOfferStatus(offerId: string, status: "accepted" | "declined"): Promise<any> {
    const [updated] = await db.update(venueOffers)
      .set({ status, updatedAt: new Date() } as any)
      .where(eq(venueOffers.id, offerId))
      .returning();
    return updated;
  }

  async getVenueOffersForAdmin(): Promise<any[]> {
    return await db.select({
      offer: venueOffers,
      venue: venues,
      experience: experiences,
    })
      .from(venueOffers)
      .leftJoin(venues, eq(venueOffers.venueId, venues.id))
      .leftJoin(experiences, eq(venueOffers.experienceId, experiences.id))
      .where(eq((venueOffers as any).status, "admin_review"))
      .orderBy(desc((venueOffers as any).createdAt));
  }

  async approveVenueOffer(offerId: string): Promise<any> {
    const [updated] = await db.update(venueOffers)
      .set({ status: "pending", updatedAt: new Date() } as any)
      .where(eq(venueOffers.id, offerId))
      .returning();
    return updated;
  }

  async rejectVenueOfferByAdmin(offerId: string): Promise<any> {
    const [updated] = await db.update(venueOffers)
      .set({ status: "declined", updatedAt: new Date() } as any)
      .where(eq(venueOffers.id, offerId))
      .returning();
    return updated;
  }

  async getBookingsByVenueIds(venueIds: string[]): Promise<any[]> {
    if (!venueIds.length) return [];
    // Get all bookings for experiences linked to these venues
    const linkedExperiences = await this.getExperiencesByVenueIds(venueIds);
    if (!linkedExperiences.length) return [];
    const expIds = linkedExperiences.map(e => e.id);
    const rows = await db.select().from(bookings).where(inArray(bookings.experienceId, expIds));
    // Attach experience to each booking for split calculation
    return rows.map(b => ({
      ...b,
      experience: linkedExperiences.find(e => e.id === b.experienceId),
    }));
  }

  async getBookingsByCreator(creatorId: string): Promise<any[]> {
    const creatorExps = await this.getExperiencesByCreator(creatorId);
    if (!creatorExps.length) return [];
    const expIds = creatorExps.map(e => e.id);
    const rows = await db.select().from(bookings).where(inArray(bookings.experienceId, expIds));
    return rows.map(b => ({
      ...b,
      experience: creatorExps.find(e => e.id === b.experienceId),
    }));
  }

  // ─── Referral Click Tracking ─────────────────────────────────────────────
  async recordReferralClick(data: {
    promoterCode: string;
    promoterId: string;
    experienceId: string | null;
    promoterExperienceId?: string | null;
    visitorUserId: string | null;
    ipHash: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await db.insert(referralClicks).values({
      promoterCode: data.promoterCode,
      promoterId: data.promoterId,
      experienceId: data.experienceId,
      promoterExperienceId: data.promoterExperienceId ?? null,
      visitorUserId: data.visitorUserId,
      ipHash: data.ipHash,
      userAgent: data.userAgent,
    });
  }

  async markReferralClickConverted(criteria: {
    bookingId: string;
    promoterCode?: string | null;
    promoterId?: string | null;
    experienceId?: string | null;
    promoterExperienceId?: string | null;
  }): Promise<void> {
    const conditions = [eq(referralClicks.converted, false)];

    if (criteria.promoterExperienceId) {
      conditions.push(eq(referralClicks.promoterExperienceId, criteria.promoterExperienceId));
    } else if (criteria.experienceId) {
      conditions.push(eq(referralClicks.experienceId, criteria.experienceId));
    }

    if (criteria.promoterCode) {
      conditions.push(eq(referralClicks.promoterCode, criteria.promoterCode));
    } else if (criteria.promoterId) {
      conditions.push(eq(referralClicks.promoterId, criteria.promoterId));
    }

    const [click] = await db
      .select()
      .from(referralClicks)
      .where(and(...conditions))
      .orderBy(desc(referralClicks.clickedAt))
      .limit(1);

    if (!click) return;

    await db
      .update(referralClicks)
      .set({ converted: true, bookingId: criteria.bookingId, convertedAt: new Date() })
      .where(eq(referralClicks.id, click.id));
  }

  async getReferralClickStats(
    promoterId: string,
    options?: { promoterExperienceId?: string; experienceId?: string; referralAudience?: "participant" | "official_partner" },
  ): Promise<ReferralClickStats> {
    const conditions = [eq(referralClicks.promoterId, promoterId)];

    if (options?.promoterExperienceId) {
      conditions.push(eq(referralClicks.promoterExperienceId, options.promoterExperienceId));
    } else if (options?.experienceId) {
      conditions.push(eq(referralClicks.experienceId, options.experienceId));
    }

    let clicks = await db
      .select()
      .from(referralClicks)
      .where(and(...conditions));

    if (options?.referralAudience) {
      const promotedExperiences = await this.getPromoterPromotedExperiences(promoterId);
      const audienceIds = new Set(
        promotedExperiences
          .filter((row) => row.referralAudience === options.referralAudience)
          .map((row) => row.id),
      );
      clicks = clicks.filter((click) => click.promoterExperienceId
        ? audienceIds.has(click.promoterExperienceId)
        : options.referralAudience === "participant");
    }

    const totalClicks = clicks.length;
    const uniqueVisitors = new Set(clicks.map((click) => getReferralVisitorKey(click))).size;
    const conversions = clicks.filter(c => c.converted).length;
    return {
      totalClicks,
      uniqueClicks: uniqueVisitors,
      conversions,
      conversionRate: totalClicks > 0 ? Math.round((conversions / totalClicks) * 100) : 0,
    };
  }

  // ─── Chat: create message ─────────────────────────────────────────────────
  async createExperienceMessage(data: {
    experienceId: string;
    userId: string;
    message: string;
    messageType?: string;
  }): Promise<void> {
    await db.insert(experienceMessages).values({
      experienceId: data.experienceId,
      userId: data.userId,
      message: data.message,
      messageType: (data.messageType ?? 'text') as any,
    });
  }

  async deleteExperience(id: string): Promise<void> {
    await db.delete(experiences).where(eq(experiences.id, id));
  }

  async archiveExperience(id: string, actorId: string, reason = "Archived"): Promise<Experience> {
    const now = new Date();
    const [archived] = await db
      .update(experiences)
      .set({
        status: "cancelled",
        archivedAt: now,
        archivedBy: actorId,
        cancelledAt: now,
        cancellationReason: reason,
        updatedAt: now,
      } as any)
      .where(eq(experiences.id, id))
      .returning();

    if (!archived) throw new Error("Experience not found");
    return archived;
  }

  async getPendingExperiences(): Promise<Experience[]> {
    return await db.select().from(experiences).where(eq(experiences.status, "pending_approval" as any));
  }

  async getPendingExperiencesByCreator(creatorId: string): Promise<Experience[]> {
    return await db
      .select()
      .from(experiences)
      .where(and(
        eq(experiences.creatorId, creatorId),
        eq(experiences.status, "pending_approval" as any)
      ))
      .orderBy(desc(experiences.createdAt));
  }

  async approveExperience(id: string, reviewedBy: string, reviewNotes?: string): Promise<Experience> {
    const current = await this.getExperience(id);
    if (!current) {
      throw new Error("Experience not found");
    }
    if (current.status === "cancelled" || current.mvgStatus === "failed") {
      return current;
    }

    const [experience] = await db
      .update(experiences)
      .set({ 
        status: "published", 
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
        updatedAt: new Date() 
      })
      .where(eq(experiences.id, id))
      .returning();
    await this.syncDirectPromotionDeals(id);
    return experience;
  }

  async rejectExperience(id: string, reviewedBy: string, reviewNotes?: string): Promise<Experience> {
    const [experience] = await db
      .update(experiences)
      .set({
        status: "rejected",
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
        rejectionCount: sql`COALESCE(${experiences.rejectionCount}, 0) + 1`,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  async resubmitExperience(id: string): Promise<Experience> {
    const [experience] = await db
      .update(experiences)
      .set({
        status: "pending_approval",
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  // Booking operations
  async createBooking(bookingData: InsertBooking): Promise<Booking> {
    const [booking] = await db.insert(bookings).values(bookingData).returning();
    return booking;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  async getBookingByUserAndExperience(userId: string, experienceId: string): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, userId),
          eq(bookings.experienceId, experienceId),
          not(inArray(bookings.status, ['cancelled', 'refunded', 'failed']))
        )
      );
    return booking;
  }

  async getUserBookings(userId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.userId, userId));
  }

  async getExperienceBookings(experienceId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.experienceId, experienceId));
  }

  async updateBooking(id: string, updates: Partial<any>): Promise<Booking> {
    const [booking] = await db
      .update(bookings)
      .set(updates)
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async updateBookingStatus(id: string, status: "pending" | "deposit_authorized" | "deposit_paid" | "confirmed" | "fully_paid" | "cancelled" | "refunded" | "failed"): Promise<Booking> {
    const [booking] = await db
      .update(bookings)
      .set({ status })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async deleteBooking(id: string): Promise<void> {
    await db.delete(bookings).where(eq(bookings.id, id));
  }

  async updateBookingBalancePayment(id: string, balancePaymentIntentId: string, balanceDueDate: Date | null): Promise<Booking> {
    const [booking] = await db
      .update(bookings)
      .set({ 
        status: "confirmed",
        balancePaymentIntentId,
        balanceDueDate
      })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async createDeposit(experienceId: string, userId: string, amount: number, paymentIntentId?: string): Promise<Booking> {
    const experience = await this.getExperience(experienceId);
    if (!experience) {
      throw new Error(`Experience ${experienceId} not found`);
    }

    if (experience.status !== "approved" && experience.status !== "published") {
      throw new Error(`Cannot create deposit for experience with status: ${experience.status}`);
    }

    const depositSchedule = getDepositSchedule({
      experienceType: experience.experienceType,
      startDate: experience.startDate,
      endDate: experience.endDate,
      balanceDueDays: experience.balanceDueDays,
      depositAmount: amount,
    });
    if (!depositSchedule.available) {
      throw new Error("Deposits are not available for this event. Please use full payment.");
    }

    const totalPrice = Number(experience.price);
    const allowedDeposit = experience.depositAmount ? Number(experience.depositAmount) : totalPrice;

    if (amount <= 0) {
      throw new Error("Deposit amount must be greater than 0");
    }

    if (amount > allowedDeposit) {
      throw new Error(`Deposit amount cannot exceed ${allowedDeposit}`);
    }

    if (amount > totalPrice) {
      throw new Error(`Deposit amount cannot exceed total price of ${totalPrice}`);
    }

    const currentParticipants = experience.currentParticipants || 0;
    const maxParticipants = experience.maxParticipants;
    if (currentParticipants >= maxParticipants) {
      throw new Error("Experience is fully booked");
    }

    const existingBooking = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          eq(bookings.userId, userId),
          or(
            eq(bookings.status, "pending"),
            eq(bookings.status, "confirmed")
          )
        )
      );

    if (existingBooking.length > 0) {
      throw new Error("User already has an active booking for this experience");
    }

    const depositAmount = amount;
    const balanceAmount = totalPrice - depositAmount;

    const [booking] = await db.insert(bookings).values({
      experienceId,
      userId,
      stripePaymentIntentId: paymentIntentId,
      amount: depositAmount.toString(),
      isDepositOnly: true,
      totalPrice: totalPrice.toString(),
      depositAmount: depositAmount.toString(),
      balanceAmount: balanceAmount.toString(),
      status: "pending",
      depositStatus: "refundable",
    }).returning();

    return booking;
  }

  async updateBookingBalancePaid(id: string, paid: boolean): Promise<Booking> {
    const [booking] = await db
      .update(bookings)
      .set({ balancePaid: paid })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  async getBookingByPaymentIntent(paymentIntentId: string): Promise<Booking | undefined> {
    // Check both stripePaymentIntentId and balancePaymentIntentId
    const [booking] = await db
      .select()
      .from(bookings)
      .where(
        or(
          eq(bookings.stripePaymentIntentId, paymentIntentId),
          eq(bookings.balancePaymentIntentId, paymentIntentId)
        )
      );
    return booking;
  }

  async getBookingsByExperience(experienceId: string): Promise<Booking[]> {
    // Alias for getExperienceBookings for consistency
    return this.getExperienceBookings(experienceId);
  }

  async getExperienceParticipantAvatars(experienceId: string): Promise<Array<{
    avatarUrl: string | null;
    firstName: string | null;
    displayName: string | null;
  }>> {
    const experienceBookings = await db
      .select({
        userId: bookings.userId,
        status: bookings.status,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          or(
            eq(bookings.status, "confirmed"),
            eq(bookings.status, "deposit_authorized"),
            eq(bookings.status, "deposit_paid"),
            eq(bookings.status, "fully_paid")
          )
        )
      );

    if (experienceBookings.length === 0) {
      return [];
    }

    const userIds = experienceBookings.map(b => b.userId);
    
    const participants = await db
      .select({
        userId: participantProfiles.userId,
        avatarUrl: participantProfiles.avatarUrl,
        displayName: participantProfiles.displayName,
        firstName: users.firstName,
      })
      .from(participantProfiles)
      .leftJoin(users, eq(participantProfiles.userId, users.id))
      .where(inArray(participantProfiles.userId, userIds));

    return participants.map(p => ({
      avatarUrl: p.avatarUrl || null,
      firstName: p.firstName || null,
      displayName: p.displayName || null,
    }));
  }

  async getExperienceSocialProof(experienceId: string): Promise<{
    participants: Array<{ userId?: string | null; avatarUrl: string | null; firstName: string | null; displayName: string | null; isPlaceholder?: boolean }>;
    totalCount: number;
  }> {
    // Fetch all committed booking user IDs
    const committedBookings = await db
      .select({ userId: bookings.userId })
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          or(
            eq(bookings.status, "confirmed"),
            eq(bookings.status, "deposit_authorized"),
            eq(bookings.status, "deposit_paid"),
            eq(bookings.status, "fully_paid"),
            eq(bookings.status, "pending")
          )
        )
      );

    if (committedBookings.length === 0) {
      return { participants: [], totalCount: 0 };
    }

    const userIds = committedBookings.map(b => b.userId);

    // Fetch user + optional profile data for ALL booking users (LEFT JOIN so ghost users are included)
    const rows = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        avatarUrl: participantProfiles.avatarUrl,
        displayName: participantProfiles.displayName,
      })
      .from(users)
      .leftJoin(participantProfiles, eq(users.id, participantProfiles.userId))
      .where(inArray(users.id, userIds));

    // Shared anonymous-user check (name is null/empty/anonymous/test/QA/"???")
    const isAnon = (firstName: string | null, lastName: string | null, displayName?: string | null): boolean => {
      const combined = `${firstName || ''} ${lastName || ''} ${displayName || ''}`.toLowerCase().trim();
      if (!combined || combined.replace(/\s/g, '') === '') return true;
      if (combined.includes('anonymous')) return true;
      if (combined.includes('???')) return true;
      if (combined.includes('test')) return true;
      if (combined.startsWith('qa') || combined.includes(' qa')) return true;
      return false;
    };

    // Build the participants list — anonymous users are excluded, ghost users (no profile) get a placeholder
    const participants = rows
      .filter(r => !isAnon(r.firstName, r.lastName, r.displayName))
      .slice(0, 6)
      .map(r => {
        const hasProfile = r.displayName !== null || r.avatarUrl !== null;
        return {
          userId: r.userId || null,
          avatarUrl: r.avatarUrl || r.profileImageUrl || null,
          firstName: r.firstName || null,
          displayName: r.displayName || null,
          isPlaceholder: !hasProfile && !r.firstName,
        };
      });

    return { participants, totalCount: participants.length };
  }

  async isExperienceCreator(experienceId: string, userId: string): Promise<boolean> {
    try {
      const [experience] = await db
        .select({ creatorId: experiences.creatorId })
        .from(experiences)
        .where(eq(experiences.id, experienceId));
      
      return experience?.creatorId === userId;
    } catch (error) {
      console.error("Error checking experience creator:", error);
      return false;
    }
  }

  async getExperienceParticipants(experienceId: string, requestingUserId?: string): Promise<Array<{
    userId: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    bookingId: string;
    bookingDate: Date;
  }>> {
    try {
      // Check if participant list should be shown and if user is authorized
      if (requestingUserId) {
        const [experience] = await db
          .select({ 
            showParticipantList: experiences.showParticipantList,
            creatorId: experiences.creatorId 
          })
          .from(experiences)
          .where(eq(experiences.id, experienceId));

        if (!experience) {
          throw new Error("Experience not found");
        }

        // If participant list is private and user is not the creator, throw authorization error
        if (!experience.showParticipantList && experience.creatorId !== requestingUserId) {
          throw new Error("UNAUTHORIZED_PRIVATE_PARTICIPANT_LIST");
        }
      }

      const result = await db
        .select({
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          displayName: participantProfiles.displayName,
          avatarUrl: participantProfiles.avatarUrl,
          bookingId: bookings.id,
          bookingDate: sql<Date>`COALESCE(${bookings.bookingDate}, NOW())`,
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .leftJoin(participantProfiles, eq(users.id, participantProfiles.userId))
        .where(
          and(
            eq(bookings.experienceId, experienceId),
            eq(bookings.status, "confirmed")
          )
        )
        .orderBy(asc(bookings.bookingDate));

      // Filter out anonymous/test/QA/broken entries
      const isAnon = (firstName: string | null, lastName: string | null, displayName?: string | null): boolean => {
        const combined = `${firstName || ''} ${lastName || ''} ${displayName || ''}`.toLowerCase().trim();
        if (!combined || combined.replace(/\s/g, '') === '') return true;
        if (combined.includes('anonymous')) return true;
        if (combined.includes('???')) return true;
        if (combined.includes('test')) return true;
        if (combined.startsWith('qa') || combined.includes(' qa')) return true;
        return false;
      };

      return result.filter(r => !isAnon(r.firstName, r.lastName, r.displayName));
    } catch (error) {
      console.error("Error fetching experience participants:", error);
      throw error;
    }
  }

  // Reservation operations (soft-hold system)
  async createReservation(reservationData: InsertReservation): Promise<Reservation> {
    const [reservation] = await db.insert(reservations).values(reservationData).returning();
    
    // Update experience reservation count
    await db
      .update(experiences)
      .set({ 
        currentReservations: sql`${experiences.currentReservations} + 1`,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, reservationData.experienceId));
    
    return reservation;
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id));
    return reservation;
  }

  async getUserActiveReservations(userId: string): Promise<Reservation[]> {
    return await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.userId, userId),
          eq(reservations.status, "active")
        )
      )
      .orderBy(desc(reservations.createdAt));
  }

  async getExperienceActiveReservations(experienceId: string): Promise<Reservation[]> {
    return await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.experienceId, experienceId),
          eq(reservations.status, "active")
        )
      )
      .orderBy(desc(reservations.createdAt));
  }

  async convertReservationToBooking(reservationId: string, bookingId: string): Promise<Reservation> {
    const [reservation] = await db
      .update(reservations)
      .set({ 
        status: "converted",
        convertedAt: new Date(),
        convertedBookingId: bookingId
      })
      .where(eq(reservations.id, reservationId))
      .returning();

    // Update experience counts (decrease reservations, increase participants)
    await db
      .update(experiences)
      .set({ 
        currentReservations: sql`${experiences.currentReservations} - 1`,
        currentParticipants: sql`${experiences.currentParticipants} + 1`,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, reservation.experienceId));
    
    return reservation;
  }

  async expireReservation(reservationId: string): Promise<Reservation> {
    const [reservation] = await db
      .update(reservations)
      .set({ status: "expired" })
      .where(eq(reservations.id, reservationId))
      .returning();

    // Update experience reservation count
    await db
      .update(experiences)
      .set({ 
        currentReservations: sql`${experiences.currentReservations} - 1`,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, reservation.experienceId));
    
    return reservation;
  }

  async cancelReservation(reservationId: string): Promise<Reservation> {
    const [reservation] = await db
      .update(reservations)
      .set({ status: "cancelled" })
      .where(eq(reservations.id, reservationId))
      .returning();

    // Update experience reservation count
    await db
      .update(experiences)
      .set({ 
        currentReservations: sql`${experiences.currentReservations} - 1`,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, reservation.experienceId));
    
    return reservation;
  }

  async getExpiredReservations(): Promise<Reservation[]> {
    return await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.status, "active"),
          sql`${reservations.expiresAt} < NOW()`
        )
      );
  }

  async getAllMVGExperiences(): Promise<Experience[]> {
    // Get all experiences that have MVG enabled (requireMinimumParticipants = true)
    return await db.select().from(experiences).where(eq(experiences.requireMinimumParticipants, true));
  }

  async updateExperienceMVGStatus(id: string, status: "pending" | "met" | "failed"): Promise<Experience> {
    const [experience] = await db
      .update(experiences)
      .set({ mvgStatus: status })
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  async processMVGSuccess(experienceId: string): Promise<{ experience: Experience; confirmedBookings: number }> {
    const experience = await this.getExperience(experienceId);
    if (!experience) {
      throw new Error(`Experience ${experienceId} not found`);
    }

    const allBookings = await this.getBookingsByExperience(experienceId);
    
    const confirmedAmount = allBookings
      .filter(b => b.status === "confirmed")
      .reduce((sum, b) => sum + Number(b.amount), 0);
    
    const pendingAmount = allBookings
      .filter(b => b.status === "pending")
      .reduce((sum, b) => sum + Number(b.amount), 0);
    
    const totalFunded = confirmedAmount + pendingAmount;
    const totalSeats = sumBookingTicketQuantity(
      allBookings.filter(b => b.status === "confirmed" || b.status === "pending"),
    );
    
    const price = Number(experience.price);
    const minimumParticipants = experience.minimumParticipants || 0;
    const mvgTargetAmount = price * minimumParticipants;

    const mvgMet = totalFunded >= mvgTargetAmount || totalSeats >= minimumParticipants;

    if (!mvgMet) {
      throw new Error("MVG requirements not met");
    }

    const pendingBookings = allBookings.filter(b => b.status === "pending" && b.depositStatus === "refundable");

    let confirmedCount = 0;
    for (const booking of pendingBookings) {
      await db
        .update(bookings)
        .set({ 
          status: "confirmed",
          depositStatus: "locked"
        })
        .where(eq(bookings.id, booking.id));
      confirmedCount++;
    }

    await db
      .update(experiences)
      .set({ 
        mvgStatus: "met",
        currentParticipants: totalSeats,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, experienceId));

    const updatedExperience = await this.getExperience(experienceId);
    if (!updatedExperience) {
      throw new Error("Failed to retrieve updated experience");
    }

    return { experience: updatedExperience, confirmedBookings: confirmedCount };
  }

  async processMVGFailure(experienceId: string): Promise<{ experience: Experience; refundedBookings: number }> {
    const experience = await this.getExperience(experienceId);
    if (!experience) {
      throw new Error(`Experience ${experienceId} not found`);
    }

    const refundableBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          eq(bookings.depositStatus, "refundable")
        )
      );

    let refundedCount = 0;
    for (const booking of refundableBookings) {
      await db
        .update(bookings)
        .set({ 
          status: "refunded",
          depositStatus: "refunded"
        })
        .where(eq(bookings.id, booking.id));
      refundedCount++;
    }

    await db
      .update(experiences)
      .set({ 
        mvgStatus: "failed",
        updatedAt: new Date()
      })
      .where(eq(experiences.id, experienceId));

    const updatedExperience = await this.getExperience(experienceId);
    if (!updatedExperience) {
      throw new Error("Failed to retrieve updated experience");
    }

    return { experience: updatedExperience, refundedBookings: refundedCount };
  }

  async getMVGProgress(experienceId: string): Promise<{
    current_participants: number;
    minimum_participants: number;
    mvg_met: boolean;
  }> {
    const experience = await this.getExperience(experienceId);
    if (!experience) {
      return { current_participants: 0, minimum_participants: 0, mvg_met: false };
    }
    
    const validBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          inArray(bookings.status, [
            'pending',
            'deposit_authorized',
            'deposit_paid',
            'confirmed',
            'fully_paid',
          ]),
          isNull(bookings.cancelledAt)
        )
      );
    
    const current_participants = sumBookingTicketQuantity(validBookings);
    const minimum_participants = experience.minimumParticipants || 0;
    const mvg_met = current_participants >= minimum_participants;
    
    return { current_participants, minimum_participants, mvg_met };
  }

  // Deposit capture operations
  async getEligibleDepositsForCapture(experienceId: string): Promise<Booking[]> {
    // Returns bookings awaiting capture: deposit_authorized OR pending (normal checkout),
    // that have not already been captured or cancelled
    return await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          or(
            eq(bookings.status, 'deposit_authorized'),
            eq(bookings.status, 'pending')
          ),
          isNull(bookings.depositCapturedAt),
          isNull(bookings.cancelledAt)
        )
      );
  }

  async markDepositAsCaptured(bookingId: string): Promise<Booking> {
    const [updated] = await db
      .update(bookings)
      .set({
        status: 'confirmed',
        depositStatus: 'captured',
        depositCapturedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    return updated;
  }

  async getConfirmedBookings(experienceId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          eq(bookings.status, 'confirmed')
        )
      );
  }

  // Deposit refund operations (MVG failure)
  async getEligibleBookingsForRefund(experienceId: string): Promise<Booking[]> {
    // Returns bookings eligible for refund: deposit_authorized OR pending (normal checkout),
    // that have not already been captured or cancelled.
    // Includes pending because the main checkout flow creates MVG bookings with status='pending'.
    return await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          or(
            eq(bookings.status, 'deposit_authorized'),
            eq(bookings.status, 'pending')
          ),
          isNull(bookings.depositCapturedAt),
          isNull(bookings.cancelledAt)
        )
      );
  }

  async markBookingAsRefunded(bookingId: string): Promise<Booking> {
    const [updated] = await db
      .update(bookings)
      .set({
        status: 'cancelled',
        depositStatus: 'refunded',
        cancelledAt: new Date(),
      })
      .where(eq(bookings.id, bookingId))
      .returning();
    return updated;
  }

  // Review operations
  async createReview(reviewData: InsertReview): Promise<Review> {
    const [review] = await db.insert(reviews).values(reviewData).returning();
    return review;
  }

  async getExperienceReviews(experienceId: string): Promise<Review[]> {
    return await db.select().from(reviews).where(eq(reviews.experienceId, experienceId));
  }

  async getExperienceGallery(experienceId: string): Promise<ExperienceGallery[]> {
    return await db.select().from(experienceGallery).where(eq(experienceGallery.experienceId, experienceId)).orderBy(asc(experienceGallery.order));
  }

  async getExperienceAmenities(experienceId: string): Promise<Array<{ id: string; name: string; category: string; icon?: string }>> {
    const results = await db
      .select({
        id: amenities.id,
        name: amenities.name,
        category: amenities.category,
        icon: amenities.icon,
      })
      .from(experienceAmenities)
      .innerJoin(amenities, eq(experienceAmenities.amenityId, amenities.id))
      .where(eq(experienceAmenities.experienceId, experienceId));
    
    return results.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category || '',
      icon: r.icon || undefined,
    }));
  }

  async getExperienceServices(experienceId: string): Promise<Array<{ id: string; name: string; category: string; status: string }>> {
    const results = await db
      .select({
        id: services.id,
        name: services.name,
        category: services.category,
        status: experienceServices.status,
      })
      .from(experienceServices)
      .innerJoin(services, eq(experienceServices.serviceId, services.id))
      .where(eq(experienceServices.experienceId, experienceId));
    
    return results.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category || '',
      status: r.status || 'requested',
    }));
  }

  // Venue operations
  async createVenue(venueData: InsertVenue): Promise<Venue> {
    const [venue] = await db.insert(venues).values(venueData).returning();
    return venue;
  }

  async getVenue(id: string): Promise<Venue | undefined> {
    const [venue] = await db.select().from(venues).where(eq(venues.id, id));
    return venue;
  }

  async getVenueBySlug(slug: string): Promise<Venue | undefined> {
    const [venue] = await db.select().from(venues).where(eq(venues.slug, slug));
    return venue;
  }

  async getVenues(options: { location?: string; type?: string; approved?: boolean } = {}): Promise<Venue[]> {
    const conditions = [];

    if (options.approved !== undefined) {
      // When approved=true is requested, filter by BOTH approved field AND status field.
      // This dual-check ensures consistency: approved (boolean) tracks admin decision,
      // while status (string) tracks workflow state. Both must be set to 'approved' state
      // for venues to appear in Event Builder and public listings.
      // Note: approveVenue() sets both fields atomically to maintain this invariant.
      if (options.approved === true) {
        conditions.push(eq(venues.approved, true));
        conditions.push(eq(venues.status, 'approved'));
      } else {
        conditions.push(eq(venues.approved, options.approved));
      }
    }

    if (options.location) {
      conditions.push(eq(venues.location, options.location));
    }

    if (conditions.length > 0) {
      return await db.select().from(venues).where(and(...conditions)).orderBy(desc(venues.createdAt));
    }

    return await db.select().from(venues).orderBy(desc(venues.createdAt));
  }

  async getVenuesWithCreators(): Promise<any[]> {
    // Get all venues first
    const allVenues = await db.select().from(venues).orderBy(desc(venues.createdAt));
    
    // Enrich with owner information
    const venuesWithOwners = await Promise.all(
      allVenues.map(async (venue) => {
        try {
          const owner = await db.select()
            .from(users)
            .where(eq(users.id, venue.createdBy))
            .limit(1);
          
          const ownerData = owner[0];
          return {
            ...venue,
            ownerName: ownerData?.name || null,
            ownerEmail: ownerData?.email || null,
          };
        } catch (error) {
          // If owner fetch fails, return venue without owner info
          return {
            ...venue,
            ownerName: null,
            ownerEmail: null,
          };
        }
      })
    );
    
    return venuesWithOwners;
  }

  async getVenuesByCreator(userId: string): Promise<Venue[]> {
    return await db.select().from(venues).where(eq(venues.createdBy, userId)).orderBy(desc(venues.createdAt));
  }

  async updateVenue(id: string, updates: Partial<InsertVenue>): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async deleteVenue(id: string): Promise<void> {
    await db.delete(venues).where(eq(venues.id, id));
  }

  async updateVenueDisplayPrefs(id: string, displayPrefs: { servicesPlacement?: "sidebar" | "inline" }): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ displayPrefs, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async getPendingVenues(): Promise<Venue[]> {
    return await db.select().from(venues).where(eq(venues.status, 'pending'));
  }

  async approveVenue(id: string, reviewedBy: string, reviewNotes?: string): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ 
        approved: true, 
        status: 'approved', 
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
        updatedAt: new Date() 
      })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async rejectVenue(id: string, reviewedBy: string, reviewNotes?: string): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({
        approved: false,
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
        rejectionCount: sql`COALESCE(${venues.rejectionCount}, 0) + 1`,
        updatedAt: new Date()
      })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async resubmitVenue(id: string): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({
        status: 'pending',
        approved: false,
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null,
        updatedAt: new Date(),
      })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async updateVenueStatus(id: string, status: string): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ status, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }
  
  // Venue availability operations
  async createVenueAvailability(availability: InsertVenueAvailability): Promise<VenueAvailability> {
    const [newAvailability] = await db
      .insert(venueAvailability)
      .values(availability)
      .returning();
    return newAvailability;
  }
  
  async getVenueAvailability(venueId: string): Promise<VenueAvailability[]> {
    return await db
      .select()
      .from(venueAvailability)
      .where(eq(venueAvailability.venueId, venueId))
      .orderBy(venueAvailability.startDate);
  }
  
  async getVenueAvailabilityById(id: string): Promise<VenueAvailability | undefined> {
    const [availability] = await db
      .select()
      .from(venueAvailability)
      .where(eq(venueAvailability.id, id))
      .limit(1);
    return availability;
  }
  
  async updateVenueAvailability(id: string, updates: Partial<InsertVenueAvailability>): Promise<VenueAvailability> {
    const [updated] = await db
      .update(venueAvailability)
      .set(updates)
      .where(eq(venueAvailability.id, id))
      .returning();
    return updated;
  }
  
  async deleteVenueAvailability(id: string): Promise<void> {
    await db
      .delete(venueAvailability)
      .where(eq(venueAvailability.id, id));
  }
  
  async updateVenueGoogleCalendar(venueId: string, connected: boolean, calendarId?: string): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ 
        googleCalendarConnected: connected,
        googleCalendarId: calendarId,
        updatedAt: new Date() 
      })
      .where(eq(venues.id, venueId))
      .returning();
    return venue;
  }

  // Service provider operations
  async createServiceProvider(serviceData: InsertServiceProvider): Promise<ServiceProvider> {
    // Map the form data to match database schema
    const dbData = {
      ...serviceData,
      serviceType: serviceData.serviceType || [], // This maps to service_types column
      galleryImages: serviceData.galleryImages || [],
      createdBy: serviceData.createdBy || '1', // Temporary user ID
    };
    
    const [service] = await db.insert(serviceProviders).values(dbData).returning();
    return service;
  }

  async getServiceProvider(id: string): Promise<ServiceProvider | undefined> {
    const [service] = await db.select().from(serviceProviders).where(eq(serviceProviders.id, id));
    return service;
  }

  async getServiceProviders(options: { location?: string; type?: string; approved?: boolean } = {}): Promise<ServiceProvider[]> {
    try {
      const conditions = [];

      if (options.approved !== undefined) {
        conditions.push(eq(serviceProviders.approved, options.approved));
      }

      if (options.location) {
        conditions.push(eq(serviceProviders.location, options.location));
      }

      if (conditions.length > 0) {
        const result = await db.select().from(serviceProviders).where(and(...conditions)).orderBy(desc(serviceProviders.createdAt));
        return result || [];
      }

      const result = await db.select().from(serviceProviders).orderBy(desc(serviceProviders.createdAt));
      return result || [];
    } catch (error) {
      console.error("Error in getServiceProviders:", error);
      return [];
    }
  }

  async updateServiceProvider(id: string, updates: Partial<InsertServiceProvider>): Promise<ServiceProvider> {
    const [service] = await db
      .update(serviceProviders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(serviceProviders.id, id))
      .returning();
    return service;
  }

  async deleteServiceProvider(id: string): Promise<void> {
    await db.delete(serviceProviders).where(eq(serviceProviders.id, id));
  }

  async getPendingServiceProviders(): Promise<ServiceProvider[]> {
    return await db.select().from(serviceProviders).where(eq(serviceProviders.approved, false));
  }

  async approveServiceProvider(id: string): Promise<ServiceProvider> {
    const [service] = await db
      .update(serviceProviders)
      .set({ approved: true, updatedAt: new Date() })
      .where(eq(serviceProviders.id, id))
      .returning();
    return service;
  }

  async rejectServiceProvider(id: string): Promise<ServiceProvider> {
    const [service] = await db
      .update(serviceProviders)
      .set({ approved: false, updatedAt: new Date() })
      .where(eq(serviceProviders.id, id))
      .returning();
    return service;
  }

  // Participant profile operations
  async createParticipantProfile(profileData: InsertParticipantProfile): Promise<ParticipantProfile> {
    const [profile] = await db.insert(participantProfiles).values(profileData).returning();
    return profile;
  }

  async getParticipantProfile(userId: string): Promise<ParticipantProfile | undefined> {
    const [profile] = await db.select().from(participantProfiles).where(eq(participantProfiles.userId, userId));
    return profile;
  }

  async getParticipantProfileByUserId(userId: string): Promise<ParticipantProfile | undefined> {
    return this.getParticipantProfile(userId);
  }

  async getAllParticipantProfiles(): Promise<ParticipantProfile[]> {
    return await db.select().from(participantProfiles).orderBy(desc(participantProfiles.createdAt));
  }

  async updateParticipantProfile(userId: string, updates: Partial<InsertParticipantProfile>): Promise<ParticipantProfile> {
    const [profile] = await db
      .update(participantProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(participantProfiles.userId, userId))
      .returning();
    return profile;
  }



  // Experience stats operations
  async getExperienceStats(experienceId: string): Promise<{
    totalBookings: number;
    totalViews: number;
    averageRating: number;
    totalReviews: number;
  }> {
    const [bookingStats] = await db
      .select({ count: count() })
      .from(bookings)
      .where(eq(bookings.experienceId, experienceId));

    const [reviewStats] = await db
      .select({ 
        count: count(),
        avgRating: sql<number>`COALESCE(AVG(${reviews.rating}), 0)`
      })
      .from(reviews)
      .where(eq(reviews.experienceId, experienceId));

    return {
      totalBookings: bookingStats?.count || 0,
      totalViews: 0, // Placeholder - would need a views tracking table
      averageRating: Number(reviewStats?.avgRating || 0),
      totalReviews: reviewStats?.count || 0,
    };
  }


  async getReviewsByExperience(experienceId: string): Promise<Review[]> {
    return await db.select().from(reviews).where(eq(reviews.experienceId, experienceId));
  }

  async getBookingsByUser(userId: string): Promise<Booking[]> {
    return await db.select().from(bookings).where(eq(bookings.userId, userId));
  }

  // Profile operations
  async createOrUpdateProfile(profileData: any): Promise<ParticipantProfile> {
    const existing = await this.getProfile(profileData.userId);
    if (existing) {
      const [profile] = await db
        .update(participantProfiles)
        .set({ ...profileData, updatedAt: new Date() })
        .where(eq(participantProfiles.userId, profileData.userId))
        .returning();
      return profile;
    }
    const [profile] = await db
      .insert(participantProfiles)
      .values(profileData)
      .returning();
    return profile;
  }

  async getProfile(userId: string): Promise<ParticipantProfile | undefined> {
    const [profile] = await db.select().from(participantProfiles).where(eq(participantProfiles.userId, userId));
    return profile;
  }

  async getProfilesByExperience(experienceId: string, requestingUserId?: string): Promise<any[]> {
    try {
      if (requestingUserId) {
        const [experience] = await db
          .select({
            showParticipantList: experiences.showParticipantList,
            creatorId: experiences.creatorId,
          })
          .from(experiences)
          .where(eq(experiences.id, experienceId));

        if (!experience) throw new Error("Experience not found");

        if (!experience.showParticipantList && experience.creatorId !== requestingUserId) {
          throw new Error("UNAUTHORIZED_PRIVATE_PARTICIPANT_LIST");
        }
      }

      // Include all active booking statuses — not just "confirmed"
      const activeStatuses: Array<NonNullable<Booking["status"]>> = [
        'pending', 'deposit_authorized', 'deposit_paid', 'confirmed', 'fully_paid',
      ];

      // Join bookings with users to always have name + avatar
      const bookingUsers = await db
        .select({
          userId: bookings.userId,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        })
        .from(bookings)
        .innerJoin(users, eq(bookings.userId, users.id))
        .where(
          and(
            eq(bookings.experienceId, experienceId),
            inArray(bookings.status, activeStatuses),
          )
        );

      if (bookingUsers.length === 0) return [];

      // Deduplicate (a user may have multiple bookings for different ticket types)
      const seen = new Set<string>();
      const uniqueUsers = bookingUsers.filter(bu => {
        if (seen.has(bu.userId)) return false;
        seen.add(bu.userId);
        return true;
      });

      const userIds = uniqueUsers.map(bu => bu.userId);

      // Fetch participant profiles if they have one set up
      const profiles = await db
        .select()
        .from(participantProfiles)
        .where(inArray(participantProfiles.userId, userIds));

      const profileMap = new Map(profiles.map(p => [p.userId, p]));

      // Every booking holder appears; profile fields are optional extras
      return uniqueUsers.map(bu => {
        const profile = profileMap.get(bu.userId);
        return {
          id: profile?.id ?? bu.userId,
          userId: bu.userId,
          displayName: profile?.displayName ?? ([bu.firstName, bu.lastName].filter(Boolean).join(' ') || 'Explorer'),
          bio: profile?.bio ?? null,
          avatarUrl: profile?.avatarUrl ?? bu.profileImageUrl,
          location: profile?.location ?? null,
          interests: profile?.interests ?? [],
          travelStyle: profile?.travelStyle ?? [],
          languages: profile?.languages ?? [],
          experienceLevel: profile?.experienceLevel ?? null,
          fitnessLevel: profile?.fitnessLevel ?? null,
          occupation: profile?.occupation ?? null,
          skills: profile?.skills ?? [],
          rolePreferences: profile?.rolePreferences ?? [],
          profileVisibility: profile?.profileVisibility ?? 'Public',
          user: {
            id: bu.userId,
            firstName: bu.firstName ?? '',
            lastName: bu.lastName ?? '',
            profileImageUrl: bu.profileImageUrl ?? null,
          },
        };
      });
    } catch (error) {
      console.error("Error fetching participant profiles by experience:", error);
      throw error;
    }
  }

  // Creator profile operations
  async getCreatorProfile(userId: string): Promise<CreatorProfile | undefined> {
    const [profile] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId));
    return profile;
  }

  async getCreatorProfileByUserId(userId: string): Promise<CreatorProfile | undefined> {
    return this.getCreatorProfile(userId);
  }

  async createCreatorProfile(profileData: InsertCreatorProfile): Promise<CreatorProfile> {
    const [profile] = await db.insert(creatorProfiles).values(profileData as any).returning();
    return profile;
  }

  async createOrUpdateCreatorProfile(userId: string, profileData: Omit<InsertCreatorProfile, 'userId'>): Promise<CreatorProfile> {
    const existing = await this.getCreatorProfile(userId);
    
    const dataWithUserId = {
      ...profileData,
      userId,
    };
    
    if (existing) {
      // Update existing profile
      const [updated] = await db
        .update(creatorProfiles)
        .set({
          ...dataWithUserId,
          updatedAt: new Date(),
        })
        .where(eq(creatorProfiles.userId, userId))
        .returning();
      return updated;
    } else {
      // Create new profile
      const [created] = await db
        .insert(creatorProfiles)
        .values(dataWithUserId)
        .returning();
      return created;
    }
  }

  async updateCreatorProfileStripe(userId: string, stripeAccountId: string): Promise<void> {
    await db
      .update(creatorProfiles)
      .set({
        stripeAccountId,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.userId, userId));
  }

  async setCreatorStripeVerificationStatus(userId: string, verificationStatus: string): Promise<void> {
    await db
      .update(creatorProfiles)
      .set({
        stripeVerificationStatus: verificationStatus,
        updatedAt: new Date(),
      })
      .where(eq(creatorProfiles.userId, userId));
  }

  async getPromoterProfile(userId: string): Promise<PromoterProfile | undefined> {
    const [profile] = await db
      .select()
      .from(promoterProfiles)
      .where(eq(promoterProfiles.userId, userId));
    return profile;
  }

  async getPromoterProfileByUserId(userId: string): Promise<PromoterProfile | undefined> {
    return this.getPromoterProfile(userId);
  }

  async createOrUpdatePromoterProfile(userId: string, profileData: Omit<InsertPromoterProfile, 'userId'>): Promise<PromoterProfile> {
    const existing = await this.getPromoterProfile(userId);
    const dataWithUserId = {
      ...profileData,
      completed: profileData.completed ?? true,
      userId,
    };

    if (existing) {
      const [updated] = await db
        .update(promoterProfiles)
        .set({
          ...dataWithUserId,
          updatedAt: new Date(),
        })
        .where(eq(promoterProfiles.userId, userId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(promoterProfiles)
      .values(dataWithUserId)
      .returning();
    return created;
  }

  async updatePromoterProfileStripe(userId: string, stripeAccountId: string, verificationStatus = 'pending'): Promise<void> {
    await db
      .update(promoterProfiles)
      .set({
        stripeAccountId,
        stripeVerificationStatus: verificationStatus,
        updatedAt: new Date(),
      })
      .where(eq(promoterProfiles.userId, userId));
  }

  async getCreatorExperiences(userId: string): Promise<Experience[]> {
    return await db.select().from(experiences).where(eq(experiences.creatorId, userId));
  }

  async getCreatorAnalytics(userId: string): Promise<any> {
    const userExperiences = await this.getCreatorExperiences(userId);
    const totalBookings = await db
      .select({ count: count() })
      .from(bookings)
      .where(inArray(bookings.experienceId, userExperiences.map(e => e.id)));

    return {
      totalExperiences: userExperiences.length,
      totalBookings: totalBookings[0]?.count || 0,
      totalViews: 0,
      conversionRate: 0,
      monthlyData: [],
    };
  }

  /**
   * @deprecated Never computed anything — it returned zeros, which is why the
   * dashboard's revenue cards showed €0.00 next to a populated ledger strip.
   * Creator money now comes from summarizeCreatorEarnings() in
   * server/creatorEarnings.ts, fed by getBookingsByCreator().
   */
  async getCreatorEarnings(userId: string): Promise<any> {
    throw new Error(
      "getCreatorEarnings is retired — use summarizeCreatorEarnings(await storage.getBookingsByCreator(userId))",
    );
  }

  // Venue and service operations moved to proper interface implementations below

  // Social features
  async createParticipantConnection(connectionData: InsertParticipantConnection): Promise<ParticipantConnection> {
    const [connection] = await db.insert(participantConnections).values(connectionData).returning();
    return connection;
  }

  async getParticipantConnections(userId: string): Promise<ParticipantConnection[]> {
    return await db.select().from(participantConnections).where(
      sql`${participantConnections.userId} = ${userId} OR ${participantConnections.connectedUserId} = ${userId}`
    );
  }

  async updateConnectionStatus(connectionId: string, status: "pending" | "accepted" | "declined"): Promise<ParticipantConnection> {
    const [connection] = await db
      .update(participantConnections)
      .set({ status })
      .where(eq(participantConnections.id, connectionId))
      .returning();
    return connection;
  }

  // Messaging
  async getMessages(experienceId: string): Promise<ExperienceMessage[]> {
    return await db
      .select({
        id: experienceMessages.id,
        experienceId: experienceMessages.experienceId,
        userId: experienceMessages.userId,
        message: experienceMessages.message,
        messageType: experienceMessages.messageType,
        isPrivate: experienceMessages.isPrivate,
        recipientId: experienceMessages.recipientId,
        createdAt: experienceMessages.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          email: users.email,
        }
      })
      .from(experienceMessages)
      .leftJoin(users, eq(experienceMessages.userId, users.id))
      .where(eq(experienceMessages.experienceId, experienceId))
      .orderBy(desc(experienceMessages.createdAt));
  }

  // Announcements
  async getAnnouncements(experienceId: string): Promise<ExperienceAnnouncement[]> {
    return await db
      .select()
      .from(experienceAnnouncements)
      .where(eq(experienceAnnouncements.experienceId, experienceId))
      .orderBy(desc(experienceAnnouncements.createdAt));
  }

  // Reactions
  async getReactions(messageId: string): Promise<ParticipantReaction[]> {
    return await db
      .select()
      .from(participantReactions)
      .where(eq(participantReactions.messageId, messageId));
  }

  async removeReaction(reactionId: string): Promise<void> {
    await db.delete(participantReactions).where(eq(participantReactions.id, reactionId));
  }

  // Experience venue/service linking operations
  async addVenueToExperience(experienceId: string, venueId: string): Promise<ExperienceVenue> {
    const [link] = await db.insert(experienceVenues).values({
      experienceId,
      venueId,
    }).returning();
    return link;
  }

  async addServiceToExperience(experienceId: string, serviceId: string, roleDescription?: string): Promise<ExperienceService> {
    const [link] = await db.insert(experienceServices).values({
      experienceId,
      serviceId,
      demandNotes: roleDescription,
    }).returning();
    return link;
  }

  async getExperienceVenues(experienceId: string): Promise<Venue[]> {
    const result = await db
      .select({ venue: venues })
      .from(experienceVenues)
      .leftJoin(venues, eq(experienceVenues.venueId, venues.id))
      .where(eq(experienceVenues.experienceId, experienceId));
    
    return result.map(r => r.venue).filter(Boolean) as Venue[];
  }

  async upsertVenueContract(contract: InsertVenueContract): Promise<VenueContract> {
    const existing = await this.getVenueContractByExperience(contract.experienceId);
    const payload = {
      ...contract,
      status: contract.status || "pending",
      updatedAt: new Date(),
    } as any;

    if (existing) {
      const [updated] = await db
        .update(venueContracts)
        .set(payload)
        .where(eq(venueContracts.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(venueContracts)
      .values(payload)
      .returning();
    return created;
  }

  async getVenueContractsByVenueIds(venueIds: string[], status?: string | string[]): Promise<any[]> {
    if (!venueIds.length) return [];
    const rows = await db
      .select({
        contract: venueContracts,
        experience: experiences,
        venue: venues,
      })
      .from(venueContracts)
      .leftJoin(experiences, eq(venueContracts.experienceId, experiences.id))
      .leftJoin(venues, eq(venueContracts.venueId, venues.id))
      .where(inArray(venueContracts.venueId, venueIds))
      .orderBy(desc(venueContracts.createdAt));

    const requestedStatuses = Array.isArray(status) ? status : status ? [status] : [];

    return rows
      .filter((row) => requestedStatuses.length === 0
        || (row.contract.status != null && requestedStatuses.includes(row.contract.status)))
      .map((row) => ({
        ...row.experience,
        venue: row.venue,
        contract: row.contract,
      }));
  }

  async getVenueContractByExperience(experienceId: string): Promise<VenueContract | undefined> {
    const [contract] = await db
      .select()
      .from(venueContracts)
      .where(eq(venueContracts.experienceId, experienceId))
      .orderBy(desc(venueContracts.createdAt))
      .limit(1);
    return contract;
  }

  async getAcceptedVenueContractForExperience(experienceId: string): Promise<VenueContract | undefined> {
    const [contract] = await db
      .select()
      .from(venueContracts)
      .where(and(eq(venueContracts.experienceId, experienceId), eq(venueContracts.status, "accepted")))
      .orderBy(desc(venueContracts.acceptedAt))
      .limit(1);
    return contract;
  }

  async acceptVenueContract(experienceId: string, venueId: string): Promise<VenueContract> {
    const [contract] = await db
      .update(venueContracts)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        declinedAt: null,
        declineReason: null,
        updatedAt: new Date(),
      } as any)
      .where(and(eq(venueContracts.experienceId, experienceId), eq(venueContracts.venueId, venueId)))
      .returning();
    if (!contract) throw new Error("Contract not found");
    return contract;
  }

  async declineVenueContract(experienceId: string, venueId: string, reason?: string): Promise<VenueContract> {
    const [contract] = await db
      .update(venueContracts)
      .set({
        status: "declined",
        declinedAt: new Date(),
        declineReason: reason || null,
        updatedAt: new Date(),
      } as any)
      .where(and(eq(venueContracts.experienceId, experienceId), eq(venueContracts.venueId, venueId)))
      .returning();
    if (!contract) throw new Error("Contract not found");
    return contract;
  }

  async updateVenueContractProposal(
    experienceId: string,
    venueId: string,
    model: string,
    terms: object,
    status: "pending" | "countered",
  ): Promise<VenueContract> {
    const [contract] = await db
      .update(venueContracts)
      .set({ model, terms: terms as any, status, updatedAt: new Date() } as any)
      .where(and(eq(venueContracts.experienceId, experienceId), eq(venueContracts.venueId, venueId)))
      .returning();
    if (!contract) throw new Error("Contract not found");
    return contract;
  }

  async getVenueContractById(contractId: string): Promise<VenueContract | undefined> {
    const [contract] = await db
      .select()
      .from(venueContracts)
      .where(eq(venueContracts.id, contractId));
    return contract;
  }

  // ─── External venue invites ───────────────────────────────────────────────

  /**
   * One pending invite per (experience, email). Re-publishing an event refreshes
   * the existing invite instead of minting a second token for the same venue.
   */
  async upsertVenueInvite(invite: InsertVenueInvite): Promise<VenueInvite> {
    const [existing] = await db
      .select()
      .from(venueInvites)
      .where(
        and(
          eq(venueInvites.experienceId, invite.experienceId),
          sql`lower(${venueInvites.email}) = lower(${invite.email})`,
        ),
      );

    if (existing) {
      // A venue that already answered keeps its answer; only refresh the details
      // of an invite still waiting for a response.
      if (existing.status !== "pending" && existing.status !== "expired") {
        return existing;
      }
      const [updated] = await db
        .update(venueInvites)
        .set({
          ...invite,
          token: existing.token,
          status: "pending",
          updatedAt: new Date(),
        })
        .where(eq(venueInvites.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(venueInvites).values(invite).returning();
    return created;
  }

  async getVenueInviteByToken(token: string): Promise<VenueInvite | undefined> {
    const [invite] = await db
      .select()
      .from(venueInvites)
      .where(eq(venueInvites.token, token));
    return invite;
  }

  async getVenueInviteById(inviteId: string): Promise<VenueInvite | undefined> {
    const [invite] = await db
      .select()
      .from(venueInvites)
      .where(eq(venueInvites.id, inviteId));
    return invite;
  }

  async getVenueInvitesByExperience(experienceId: string): Promise<VenueInvite[]> {
    return db
      .select()
      .from(venueInvites)
      .where(eq(venueInvites.experienceId, experienceId))
      .orderBy(desc(venueInvites.createdAt));
  }

  async updateVenueInvite(
    inviteId: string,
    updates: Partial<InsertVenueInvite>,
  ): Promise<VenueInvite> {
    const [invite] = await db
      .update(venueInvites)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(venueInvites.id, inviteId))
      .returning();
    return invite;
  }

  async updateVenueContractSponsorshipStatus(
    contractId: string,
    status: string,
    paymentIntentId?: string,
  ): Promise<VenueContract> {
    const updates: Record<string, any> = {
      sponsorshipPaymentStatus: status,
      updatedAt: new Date(),
    };
    if (paymentIntentId) updates.stripeSponsorshipPaymentIntentId = paymentIntentId;
    if (status === 'paid') updates.sponsorshipPaidAt = new Date();

    const [contract] = await db
      .update(venueContracts)
      .set(updates as any)
      .where(eq(venueContracts.id, contractId))
      .returning();
    if (!contract) throw new Error(`Contract ${contractId} not found`);
    return contract;
  }

  // Experience draft operations
  async getExperienceDraftsByCreator(creatorId: string): Promise<ExperienceDraft[]> {
    return await db
      .select()
      .from(experienceDrafts)
      .where(eq(experienceDrafts.creatorId, creatorId))
      .orderBy(desc(experienceDrafts.updatedAt));
  }

  async createExperienceDraft(draft: InsertExperienceDraft): Promise<ExperienceDraft> {
    const [created] = await db
      .insert(experienceDrafts)
      .values(draft)
      .returning();
    return created;
  }

  async getExperienceDraftById(id: string): Promise<ExperienceDraft | undefined> {
    const [draft] = await db
      .select()
      .from(experienceDrafts)
      .where(eq(experienceDrafts.id, id));
    return draft;
  }

  async updateExperienceDraft(id: string, creatorId: string, updates: Partial<InsertExperienceDraft>): Promise<ExperienceDraft> {
    const [updated] = await db
      .update(experienceDrafts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(
        eq(experienceDrafts.id, id),
        eq(experienceDrafts.creatorId, creatorId)
      ))
      .returning();
    
    if (!updated) {
      throw new Error("Draft not found or access denied");
    }
    
    return updated;
  }

  async getExperienceDraft(id: string, creatorId: string): Promise<ExperienceDraft | undefined> {
    const [draft] = await db
      .select()
      .from(experienceDrafts)
      .where(and(
        eq(experienceDrafts.id, id),
        eq(experienceDrafts.creatorId, creatorId)
      ));
    return draft;
  }

  async deleteExperienceDraft(id: string, creatorId: string): Promise<void> {
    const result = await db
      .delete(experienceDrafts)
      .where(and(
        eq(experienceDrafts.id, id),
        eq(experienceDrafts.creatorId, creatorId)
      ))
      .returning();
    
    if (result.length === 0) {
      throw new Error("Draft not found or access denied");
    }
  }

  // Participant interaction operations
  async createConnection(connectionData: InsertParticipantConnection): Promise<ParticipantConnection> {
    const [connection] = await db.insert(participantConnections).values(connectionData).returning();
    return connection;
  }

  async getUserConnections(userId: string): Promise<ParticipantConnection[]> {
    return await db.select().from(participantConnections).where(eq(participantConnections.userId, userId));
  }

  async createMessage(messageData: InsertExperienceMessage): Promise<ExperienceMessage> {
    const [message] = await db.insert(experienceMessages).values(messageData).returning();
    return message;
  }

  async getExperienceMessages(experienceId: string): Promise<ExperienceMessage[]> {
    return await db.select().from(experienceMessages).where(eq(experienceMessages.experienceId, experienceId));
  }

  async createAnnouncement(announcementData: InsertExperienceAnnouncement): Promise<ExperienceAnnouncement> {
    const [announcement] = await db.insert(experienceAnnouncements).values(announcementData).returning();
    return announcement;
  }

  async getExperienceAnnouncements(experienceId: string): Promise<ExperienceAnnouncement[]> {
    return await db.select().from(experienceAnnouncements).where(eq(experienceAnnouncements.experienceId, experienceId));
  }

  async createReaction(reactionData: InsertParticipantReaction): Promise<ParticipantReaction> {
    const [reaction] = await db.insert(participantReactions).values(reactionData).returning();
    return reaction;
  }

  // Community application operations
  async submitCommunityApplication(applicationData: InsertCommunityApplication): Promise<CommunityApplication> {
    const [application] = await db
      .insert(communityApplications)
      .values(applicationData)
      .returning();
    return application;
  }

  async getCommunityApplications(): Promise<CommunityApplication[]> {
    return await db
      .select()
      .from(communityApplications)
      .orderBy(desc(communityApplications.createdAt));
  }

  async reviewCommunityApplication(
    applicationId: string, 
    status: string, 
    reviewNotes: string | null, 
    reviewerId: string
  ): Promise<CommunityApplication> {
    const [application] = await db
      .update(communityApplications)
      .set({
        status,
        reviewNotes,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(eq(communityApplications.id, applicationId))
      .returning();
    return application;
  }

  // Community group operations
  async createCommunityGroup(groupData: InsertCommunityGroup): Promise<CommunityGroup> {
    const [group] = await db.insert(communityGroups).values(groupData).returning();
    // Auto-join the creator as admin
    await db.insert(communityGroupMembers).values({
      groupId: group.id,
      userId: groupData.createdBy,
      role: "admin"
    });
    return group;
  }

  async getCommunityGroups(): Promise<CommunityGroup[]> {
    return await db
      .select()
      .from(communityGroups)
      .orderBy(desc(communityGroups.createdAt));
  }

  async getCommunityGroup(id: string): Promise<CommunityGroup | undefined> {
    const [group] = await db.select().from(communityGroups).where(eq(communityGroups.id, id));
    return group;
  }

  async joinGroup(groupId: string, userId: string): Promise<CommunityGroupMember> {
    const [member] = await db.insert(communityGroupMembers).values({
      groupId,
      userId,
      role: "member"
    }).returning();
    
    // Update member count
    await db
      .update(communityGroups)
      .set({ 
        memberCount: sql`${communityGroups.memberCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(communityGroups.id, groupId));
    
    return member;
  }

  async leaveGroup(groupId: string, userId: string): Promise<void> {
    await db
      .delete(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId)
        )
      );
    
    // Update member count
    await db
      .update(communityGroups)
      .set({ 
        memberCount: sql`${communityGroups.memberCount} - 1`,
        updatedAt: new Date()
      })
      .where(eq(communityGroups.id, groupId));
  }

  async getGroupMembers(groupId: string): Promise<CommunityGroupMember[]> {
    return await db
      .select()
      .from(communityGroupMembers)
      .where(eq(communityGroupMembers.groupId, groupId))
      .orderBy(communityGroupMembers.joinedAt);
  }

  async isGroupMember(groupId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select()
      .from(communityGroupMembers)
      .where(
        and(
          eq(communityGroupMembers.groupId, groupId),
          eq(communityGroupMembers.userId, userId)
        )
      );
    return !!row;
  }

  async createGroupMessage(messageData: InsertCommunityGroupMessage): Promise<CommunityGroupMessage> {
    const [message] = await db.insert(communityGroupMessages).values(messageData).returning();
    
    // Update message count
    await db
      .update(communityGroups)
      .set({ 
        messageCount: sql`${communityGroups.messageCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(communityGroups.id, messageData.groupId));
    
    return message;
  }

  async getGroupMessages(groupId: string): Promise<CommunityGroupMessage[]> {
    return await db
      .select({
        id: communityGroupMessages.id,
        groupId: communityGroupMessages.groupId,
        userId: communityGroupMessages.userId,
        content: communityGroupMessages.content,
        messageType: communityGroupMessages.messageType,
        createdAt: communityGroupMessages.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(communityGroupMessages)
      .leftJoin(users, eq(communityGroupMessages.userId, users.id))
      .where(eq(communityGroupMessages.groupId, groupId))
      .orderBy(communityGroupMessages.createdAt);
  }

  async getCommunityEvents(): Promise<CommunityEvent[]> {
    return await db
      .select()
      .from(communityEvents)
      .orderBy(communityEvents.date);
  }

  async createCommunityEvent(eventData: InsertCommunityEvent): Promise<CommunityEvent> {
    const [event] = await db.insert(communityEvents).values(eventData).returning();
    return event;
  }

  async joinCommunityEvent(eventId: string): Promise<CommunityEvent> {
    const [event] = await db
      .update(communityEvents)
      .set({
        attendeeCount: sql`${communityEvents.attendeeCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(communityEvents.id, eventId))
      .returning();
    return event;
  }

  async getFeaturedMembers(): Promise<ParticipantProfile[]> {
    return await db
      .select()
      .from(participantProfiles)
      .where(eq(participantProfiles.profileVisibility, 'Public'))
      .limit(10);
  }

  // Availability checking operations
  async getAvailableVenues(options: { startDate?: string; endDate?: string; capacity?: number; venueType?: string }): Promise<Venue[]> {
    const conditions = [eq(venues.approved, true), eq(venues.status, 'approved')];
    
    // Add capacity filter
    if (options.capacity) {
      conditions.push(sql`${venues.capacity} >= ${options.capacity}`);
    }
    
    // Note: venueType field doesn't exist in schema, skipping that filter
    
    // TODO: Add date availability checking when venue bookings are implemented
    // For now, return all venues that match criteria
    
    return await db.select().from(venues).where(and(...conditions));
  }

  async getAvailableServices(options: { startDate?: string; endDate?: string; category?: string; location?: string }): Promise<ServiceProvider[]> {
    const conditions = [eq(serviceProviders.approved, true)];
    
    // Add category filter
    if (options.category) {
      conditions.push(eq(serviceProviders.serviceCategory, options.category));
    }
    
    // Add location filter
    if (options.location) {
      conditions.push(sql`${serviceProviders.location} ILIKE ${`%${options.location}%`}`);
    }
    
    // TODO: Add date availability checking when service bookings are implemented
    // For now, return all service providers that match criteria
    
    return await db.select().from(serviceProviders).where(and(...conditions));
  }

  async getAllServicesWithProviders(): Promise<(Service & { provider: ServiceProvider })[]> {
    const result = await db
      .select({
        id: services.id,
        providerId: services.providerId,
        name: services.name,
        description: services.description,
        category: services.category,
        price: services.price,
        priceModel: services.priceModel,
        duration: services.duration,
        maxParticipants: services.maxParticipants,
        availabilityType: services.availabilityType,
        requirements: services.requirements,
        tags: services.tags,
        imageUrl: services.imageUrl,
        available: services.available,
        approved: services.approved,
        createdAt: services.createdAt,
        updatedAt: services.updatedAt,
        provider: serviceProviders
      })
      .from(services)
      .innerJoin(serviceProviders, eq(services.providerId, serviceProviders.id));
    
    return result as (Service & { provider: ServiceProvider })[];
  }

  // Experience association methods
  async associateExperienceVenue(experienceId: string, venueId: string): Promise<ExperienceVenue> {
    const [association] = await db
      .insert(experienceVenues)
      .values({ experienceId, venueId })
      .returning();
    return association;
  }

  async associateExperienceService(experienceId: string, serviceId: string, roleDescription?: string): Promise<ExperienceService> {
    const [association] = await db
      .insert(experienceServices)
      .values({ experienceId, serviceId, demandNotes: roleDescription })
      .returning();
    return association;
  }

  // Venue/service assignment methods (aliases for compatibility)
  async assignVenueToExperience(data: { experienceId: string; venueId: string }): Promise<ExperienceVenue> {
    return this.associateExperienceVenue(data.experienceId, data.venueId);
  }

  async assignServiceToExperience(data: { experienceId: string; serviceId: string; roleDescription?: string }): Promise<ExperienceService> {
    return this.associateExperienceService(data.experienceId, data.serviceId, data.roleDescription);
  }

  // Participant roles management
  async createParticipantRole(roleData: InsertParticipantRole): Promise<ParticipantRole> {
    const [role] = await db.insert(participantRoles).values(roleData).returning();
    return role;
  }

  async getParticipantRolesByExperience(experienceId: string): Promise<ParticipantRole[]> {
    return await db
      .select()
      .from(participantRoles)
      .where(eq(participantRoles.experienceId, experienceId))
      .orderBy(asc(participantRoles.createdAt));
  }

  async getParticipantRole(roleId: string): Promise<ParticipantRole | undefined> {
    const [role] = await db
      .select()
      .from(participantRoles)
      .where(eq(participantRoles.id, roleId));
    return role;
  }

  async getParticipantRoleAssignment(roleId: string, userId: string): Promise<ParticipantRoleAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(participantRoleAssignments)
      .where(and(
        eq(participantRoleAssignments.roleId, roleId),
        eq(participantRoleAssignments.userId, userId),
        inArray(participantRoleAssignments.status, ["pending", "applied", "confirmed"]),
      ))
      .orderBy(desc(participantRoleAssignments.createdAt));
    return assignment;
  }

  async getParticipantRoleAssignmentById(assignmentId: string): Promise<ParticipantRoleAssignment | undefined> {
    const [assignment] = await db
      .select()
      .from(participantRoleAssignments)
      .where(eq(participantRoleAssignments.id, assignmentId));
    return assignment;
  }

  async assignParticipantRole(assignmentData: InsertParticipantRoleAssignment): Promise<ParticipantRoleAssignment> {
    const [assignment] = await db.insert(participantRoleAssignments).values(assignmentData).returning();
    return assignment;
  }

  async getParticipantRoleAssignments(experienceId: string): Promise<(ParticipantRoleAssignment & { role: ParticipantRole; user: User })[]> {
    const result = await db
      .select({
        id: participantRoleAssignments.id,
        roleId: participantRoleAssignments.roleId,
        userId: participantRoleAssignments.userId,
        experienceId: participantRoleAssignments.experienceId,
        status: participantRoleAssignments.status,
        appliedAt: participantRoleAssignments.appliedAt,
        confirmedAt: participantRoleAssignments.confirmedAt,
        createdAt: participantRoleAssignments.createdAt,
        role: participantRoles,
        user: users
      })
      .from(participantRoleAssignments)
      .innerJoin(participantRoles, eq(participantRoleAssignments.roleId, participantRoles.id))
      .innerJoin(users, eq(participantRoleAssignments.userId, users.id))
      .where(eq(participantRoleAssignments.experienceId, experienceId));
    
    return result as (ParticipantRoleAssignment & { role: ParticipantRole; user: User })[];
  }

  async getParticipantRoleOpportunities(userId: string): Promise<any[]> {
    return await db
      .select({
        role: participantRoles,
        experience: experiences,
        assignment: participantRoleAssignments,
      })
      .from(participantRoles)
      .innerJoin(experiences, eq(participantRoles.experienceId, experiences.id))
      .leftJoin(participantRoleAssignments, and(
        eq(participantRoleAssignments.roleId, participantRoles.id),
        eq(participantRoleAssignments.userId, userId),
        inArray(participantRoleAssignments.status, ["pending", "applied", "confirmed"]),
      ))
      .where(or(eq(experiences.status, "approved"), eq(experiences.status, "published")))
      .orderBy(desc(experiences.createdAt), asc(participantRoles.createdAt));
  }

  async getParticipantRoleApplicationsForUser(userId: string): Promise<any[]> {
    return await db
      .select({
        assignment: participantRoleAssignments,
        role: participantRoles,
        experience: experiences,
      })
      .from(participantRoleAssignments)
      .innerJoin(participantRoles, eq(participantRoleAssignments.roleId, participantRoles.id))
      .innerJoin(experiences, eq(participantRoleAssignments.experienceId, experiences.id))
      .where(eq(participantRoleAssignments.userId, userId))
      .orderBy(desc(participantRoleAssignments.appliedAt));
  }

  async getParticipantRoleApplicationsForCreator(creatorId: string): Promise<any[]> {
    return await db
      .select({
        assignment: participantRoleAssignments,
        role: participantRoles,
        applicant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
        },
        experience: experiences,
      })
      .from(participantRoleAssignments)
      .innerJoin(participantRoles, eq(participantRoleAssignments.roleId, participantRoles.id))
      .innerJoin(experiences, eq(participantRoleAssignments.experienceId, experiences.id))
      .innerJoin(users, eq(participantRoleAssignments.userId, users.id))
      .where(and(
        eq(experiences.creatorId, creatorId),
        inArray(participantRoleAssignments.status, ["pending", "applied"]),
      ))
      .orderBy(desc(participantRoleAssignments.appliedAt));
  }

  async getApprovedParticipantRolesForCreator(creatorId: string): Promise<any[]> {
    return await db
      .select({
        assignment: participantRoleAssignments,
        role: participantRoles,
        applicant: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImageUrl: users.profileImageUrl,
        },
        experience: experiences,
      })
      .from(participantRoleAssignments)
      .innerJoin(participantRoles, eq(participantRoleAssignments.roleId, participantRoles.id))
      .innerJoin(experiences, eq(participantRoleAssignments.experienceId, experiences.id))
      .innerJoin(users, eq(participantRoleAssignments.userId, users.id))
      .where(and(
        eq(experiences.creatorId, creatorId),
        eq(participantRoleAssignments.status, "confirmed"),
      ))
      .orderBy(desc(participantRoleAssignments.confirmedAt));
  }

  async resolveParticipantRoleAssignment(
    assignmentId: string,
    status: "confirmed" | "declined",
  ): Promise<ParticipantRoleAssignment> {
    return await db.transaction(async (tx) => {
      const [assignment] = await tx
        .update(participantRoleAssignments)
        .set({
          status,
          confirmedAt: status === "confirmed" ? new Date() : null,
        })
        .where(and(
          eq(participantRoleAssignments.id, assignmentId),
          inArray(participantRoleAssignments.status, ["pending", "applied"]),
        ))
        .returning();

      if (!assignment) throw new Error("ROLE_APPLICATION_ALREADY_RESOLVED");

      if (status === "confirmed") {
        const [updatedRole] = await tx
          .update(participantRoles)
          .set({
            currentCount: sql`${participantRoles.currentCount} + 1`,
            updatedAt: new Date(),
          })
          .where(and(
            eq(participantRoles.id, assignment.roleId),
            sql`coalesce(${participantRoles.currentCount}, 0) < coalesce(${participantRoles.maxCount}, 1)`,
          ))
          .returning();
        if (!updatedRole) throw new Error("ROLE_IS_FULL");
      }

      return assignment;
    });
  }

  async getParticipantsWithSkillsAndRoles(experienceId: string): Promise<any[]> {
    return await db
      .select({
        booking: {
          id: bookings.id,
          userId: bookings.userId,
          status: bookings.status,
          bookingDate: bookings.bookingDate,
        },
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          email: users.email,
        },
        profile: {
          id: participantProfiles.id,
          displayName: participantProfiles.displayName,
          bio: participantProfiles.bio,
          skills: participantProfiles.skills,
          rolePreferences: participantProfiles.rolePreferences,
          interests: participantProfiles.interests,
          experienceLevel: participantProfiles.experienceLevel,
          occupation: participantProfiles.occupation,
        },
        roleAssignments: sql`(
          SELECT json_agg(
            json_build_object(
              'id', pra.id,
              'roleId', pra.role_id,
              'status', pra.status,
              'roleName', pr.name,
              'roleDescription', pr.description
            )
          )
          FROM participant_role_assignments pra
          LEFT JOIN participant_roles pr ON pra.role_id = pr.id
          WHERE pra.user_id = ${users.id} AND pra.experience_id = ${experienceId}
        )`.as('roleAssignments')
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userId, users.id))
      .leftJoin(participantProfiles, eq(users.id, participantProfiles.userId))
      .where(eq(bookings.experienceId, experienceId));
  }

  // Promoter dashboard operations
  async getPromoterBookings(promoterId: string, referralAudience?: "participant" | "official_partner"): Promise<Booking[]> {
    const promoterBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.promoterId, promoterId))
      .orderBy(desc(bookings.bookingDate));

    if (!referralAudience) return promoterBookings;

    const promotedExperiences = await this.getPromoterPromotedExperiences(promoterId);
    const audienceIds = new Set(
      promotedExperiences
        .filter((row) => row.referralAudience === referralAudience)
        .map((row) => row.id),
    );

    return promoterBookings.filter((booking) => booking.promoterExperienceId
      ? audienceIds.has(booking.promoterExperienceId)
      : referralAudience === "participant");
  }

  async getPromoterEarningsSummary(promoterId: string, referralAudience?: "participant" | "official_partner"): Promise<{
    byCurrency: Array<{
      currency: string;
      estimated: number;
      locked: number;
      paid: number;
      voided: number;
      totalBookings: number;
    }>;
  }> {
    const promoterBookings = await this.getPromoterBookings(promoterId, referralAudience);
    const experienceIds = Array.from(new Set(promoterBookings.map((booking) => booking.experienceId)));
    const experienceRows = experienceIds.length > 0
      ? await db.select({ id: experiences.id, currency: experiences.currency })
          .from(experiences)
          .where(inArray(experiences.id, experienceIds))
      : [];
    const experienceCurrencyById = new Map(
      experienceRows.map((experience) => [experience.id, experience.currency]),
    );
    
    // Group by currency and SUM stored commission amounts (no recalculation)
    // Amount and status remain immutable booking-ledger values; event currency fills legacy nulls.
    const currencyMap = new Map<string, { estimated: number; locked: number; paid: number; voided: number; totalBookings: number }>();
    
    for (const booking of promoterBookings) {
      const currency = normalizeCurrency(
        booking.commissionCurrency,
        experienceCurrencyById.get(booking.experienceId),
      );
      if (!currency) continue;
      // Use stored commission amount directly (calculated at booking time)
      const amount = parseFloat(booking.commissionAmount || '0');
      const status = booking.commissionStatus || 'estimated';
      
      if (!currencyMap.has(currency)) {
        currencyMap.set(currency, { estimated: 0, locked: 0, paid: 0, voided: 0, totalBookings: 0 });
      }
      
      const entry = currencyMap.get(currency)!;
      entry.totalBookings++; // Each booking = 1 spot (current data model)
      
      if (status === 'estimated') {
        entry.estimated += amount;
      } else if (status === 'locked') {
        entry.locked += amount;
      } else if (status === 'paid') {
        entry.paid += amount;
      } else if (status === 'voided') {
        entry.voided += amount;
      }
    }
    
    return {
      byCurrency: Array.from(currencyMap.entries()).map(([currency, data]) => ({
        currency,
        ...data,
      })),
    };
  }

  async getPromoterExperiences(promoterId: string): Promise<Array<{
    promoterExperienceId: string | null;
    shareToken: string | null;
    referralAudience: string;
    promotionDealId: string | null;
    experience: Experience;
    spotsBooked: number;
    estimatedCommission: number;
    lockedCommission: number;
    paidCommission: number;
    currency: string;
    clicks: number;
    uniqueVisitors: number;
    conversions: number;
    conversionRate: number;
  }>> {
    const promotedExperiences = await this.getPromoterPromotedExperiences(promoterId);
    const promotedExperienceById = new Map(
      promotedExperiences.map((row) => [row.id, row]),
    );
    const promotedExperienceByExperienceId = new Map(
      promotedExperiences.map((row) => [row.experienceId, row]),
    );

    const promoterBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.promoterId, promoterId));

    const promoterClicks = await db
      .select()
      .from(referralClicks)
      .where(eq(referralClicks.promoterId, promoterId));

    const experienceIds = Array.from(new Set([
      ...promotedExperiences.map((row) => row.experienceId),
      ...promoterBookings.map((booking) => booking.experienceId),
      ...promoterClicks.map((click) => click.experienceId).filter((value): value is string => !!value),
    ]));

    if (experienceIds.length === 0) {
      return [];
    }

    const linkedExperiences = await db
      .select()
      .from(experiences)
      .where(inArray(experiences.id, experienceIds));

    const experienceMap = new Map(linkedExperiences.map((experience) => [experience.id, experience]));

    const bookingStatsMap = new Map<string, {
      experienceId: string;
      promoterExperienceId: string | null;
      spotsBooked: number;
      estimatedCommission: number;
      lockedCommission: number;
      paidCommission: number;
      currency: string;
    }>();

    for (const booking of promoterBookings) {
      if (!isQualifyingReferralBooking(booking.status)) continue;
      const expId = booking.experienceId;
      const promotedExperience = promotedExperienceByExperienceId.get(expId);
      const promoterExperienceId = booking.promoterExperienceId || promotedExperience?.id || null;
      const key = getPromoterMetricKey(promoterExperienceId, expId);
      if (!key) continue;

      const currency =
        booking.commissionCurrency ||
        experienceMap.get(expId)?.currency ||
        'EUR';
      const amount = parseFloat(booking.commissionAmount || '0');
      const status = booking.commissionStatus || 'estimated';

      if (!bookingStatsMap.has(key)) {
        bookingStatsMap.set(key, {
          experienceId: expId,
          promoterExperienceId,
          spotsBooked: 0,
          estimatedCommission: 0,
          lockedCommission: 0,
          paidCommission: 0,
          currency,
        });
      }

      const entry = bookingStatsMap.get(key)!;
      entry.spotsBooked++;

      if (status === 'estimated') {
        entry.estimatedCommission += amount;
      } else if (status === 'locked') {
        entry.lockedCommission += amount;
      } else if (status === 'paid') {
        entry.paidCommission += amount;
      }
    }

    const clickStatsMap = new Map<string, {
      experienceId: string;
      promoterExperienceId: string | null;
      totalClicks: number;
      conversions: number;
      visitorKeys: Set<string>;
    }>();

    for (const click of promoterClicks) {
      const promotedExperience =
        (click.promoterExperienceId
          ? promotedExperienceById.get(click.promoterExperienceId)
          : undefined) ||
        (click.experienceId
          ? promotedExperienceByExperienceId.get(click.experienceId)
          : undefined);
      const expId = click.experienceId || promotedExperience?.experienceId || null;
      const promoterExperienceId = click.promoterExperienceId || promotedExperience?.id || null;
      const key = getPromoterMetricKey(promoterExperienceId, expId);
      if (!key || !expId) continue;

      if (!clickStatsMap.has(key)) {
        clickStatsMap.set(key, {
          experienceId: expId,
          promoterExperienceId,
          totalClicks: 0,
          conversions: 0,
          visitorKeys: new Set<string>(),
        });
      }

      const entry = clickStatsMap.get(key)!;
      entry.totalClicks++;
      entry.visitorKeys.add(getReferralVisitorKey(click));
      if (click.converted) {
        entry.conversions++;
      }
    }

    const result: Array<{
      promoterExperienceId: string | null;
      shareToken: string | null;
      referralAudience: string;
      promotionDealId: string | null;
      experience: Experience;
      spotsBooked: number;
      estimatedCommission: number;
      lockedCommission: number;
      paidCommission: number;
      currency: string;
      clicks: number;
      uniqueVisitors: number;
      conversions: number;
      conversionRate: number;
    }> = [];

    const seenMetricKeys = new Set<string>();

    for (const promotedExperience of promotedExperiences) {
      const experience = experienceMap.get(promotedExperience.experienceId);
      if (!experience) continue;

      const metricKey = getPromoterMetricKey(promotedExperience.id, promotedExperience.experienceId)!;
      seenMetricKeys.add(metricKey);

      const bookingStats = bookingStatsMap.get(metricKey);
      const clickStats = clickStatsMap.get(metricKey);

      result.push({
        promoterExperienceId: promotedExperience.id,
        shareToken: promotedExperience.shareToken,
        referralAudience: promotedExperience.referralAudience,
        promotionDealId: promotedExperience.promotionDealId,
        experience,
        spotsBooked: bookingStats?.spotsBooked || 0,
        estimatedCommission: bookingStats?.estimatedCommission || 0,
        lockedCommission: bookingStats?.lockedCommission || 0,
        paidCommission: bookingStats?.paidCommission || 0,
        currency: bookingStats?.currency || experience.currency || 'EUR',
        clicks: clickStats?.totalClicks || 0,
        uniqueVisitors: clickStats?.visitorKeys.size || 0,
        conversions: clickStats?.conversions || 0,
        conversionRate: clickStats?.totalClicks
          ? Math.round((clickStats.conversions / clickStats.totalClicks) * 100)
          : 0,
      });
    }

    for (const [metricKey, bookingStats] of Array.from(bookingStatsMap.entries())) {
      if (seenMetricKeys.has(metricKey)) continue;
      const experience = experienceMap.get(bookingStats.experienceId);
      if (!experience) continue;

      const clickStats = clickStatsMap.get(metricKey);

      result.push({
        promoterExperienceId: bookingStats.promoterExperienceId,
        shareToken: bookingStats.promoterExperienceId
          ? promotedExperienceById.get(bookingStats.promoterExperienceId)?.shareToken || null
          : null,
        referralAudience: bookingStats.promoterExperienceId
          ? promotedExperienceById.get(bookingStats.promoterExperienceId)?.referralAudience || 'participant'
          : 'participant',
        promotionDealId: bookingStats.promoterExperienceId
          ? promotedExperienceById.get(bookingStats.promoterExperienceId)?.promotionDealId || null
          : null,
        experience,
        spotsBooked: bookingStats.spotsBooked,
        estimatedCommission: bookingStats.estimatedCommission,
        lockedCommission: bookingStats.lockedCommission,
        paidCommission: bookingStats.paidCommission,
        currency: bookingStats.currency,
        clicks: clickStats?.totalClicks || 0,
        uniqueVisitors: clickStats?.visitorKeys.size || 0,
        conversions: clickStats?.conversions || 0,
        conversionRate: clickStats?.totalClicks
          ? Math.round((clickStats.conversions / clickStats.totalClicks) * 100)
          : 0,
      });
      seenMetricKeys.add(metricKey);
    }

    for (const [metricKey, clickStats] of Array.from(clickStatsMap.entries())) {
      if (seenMetricKeys.has(metricKey)) continue;
      const experience = experienceMap.get(clickStats.experienceId);
      if (!experience) continue;

      result.push({
        promoterExperienceId: clickStats.promoterExperienceId,
        shareToken: clickStats.promoterExperienceId
          ? promotedExperienceById.get(clickStats.promoterExperienceId)?.shareToken || null
          : null,
        referralAudience: clickStats.promoterExperienceId
          ? promotedExperienceById.get(clickStats.promoterExperienceId)?.referralAudience || 'participant'
          : 'participant',
        promotionDealId: clickStats.promoterExperienceId
          ? promotedExperienceById.get(clickStats.promoterExperienceId)?.promotionDealId || null
          : null,
        experience,
        spotsBooked: 0,
        estimatedCommission: 0,
        lockedCommission: 0,
        paidCommission: 0,
        currency: experience.currency || 'EUR',
        clicks: clickStats.totalClicks,
        uniqueVisitors: clickStats.visitorKeys.size,
        conversions: clickStats.conversions,
        conversionRate: clickStats.totalClicks
          ? Math.round((clickStats.conversions / clickStats.totalClicks) * 100)
          : 0,
      });
      seenMetricKeys.add(metricKey);
    }

    result.sort((a, b) => {
      const aStart = a.experience.startDate ? new Date(a.experience.startDate).getTime() : Infinity;
      const bStart = b.experience.startDate ? new Date(b.experience.startDate).getTime() : Infinity;
      if (aStart !== bStart) {
        return aStart - bStart;
      }
      const aCreated = a.experience.createdAt ? new Date(a.experience.createdAt).getTime() : 0;
      const bCreated = b.experience.createdAt ? new Date(b.experience.createdAt).getTime() : 0;
      return bCreated - aCreated;
    });

    return result;
  }

  // Experience Pool Methods
  async getPromotableExperiences(): Promise<Experience[]> {
    // The pool covers every Digital Handshake deal type: promoters can self-serve
    // commission/milestone deals instantly, while brand_barter and financial_sponsorship
    // go through the marketplace Accept / Counter Offer flow (see promotionDeals).
    return await db
      .select()
      .from(experiences)
      .where(
        and(
          or(eq(experiences.status, 'approved'), eq(experiences.status, 'published')),
          eq(experiences.promoterEnabled, true),
          or(
            eq(experiences.promotionDealType, 'commission_per_ticket'),
            eq(experiences.promotionDealType, 'milestone_barter'),
            eq(experiences.promotionDealType, 'brand_barter'),
            eq(experiences.promotionDealType, 'financial_sponsorship'),
            and(
              isNull(experiences.promotionDealType),
              eq(experiences.influencerPromotionEnabled, true),
            ),
          ),
        )
      )
      .orderBy(asc(experiences.startDate), desc(experiences.createdAt));
  }

  async getPromoterPromotedExperiences(promoterId: string): Promise<PromoterExperienceRecord[]> {
    const rows = await db
      .select()
      .from(promoterExperiences)
      .where(eq(promoterExperiences.promoterId, promoterId))
      .orderBy(desc(promoterExperiences.createdAt));

    const normalized: PromoterExperienceRecord[] = [];

    for (const row of rows) {
      if (row.shareToken) {
        normalized.push(row);
        continue;
      }

      const [updated] = await db
        .update(promoterExperiences)
        .set({ shareToken: row.id })
        .where(eq(promoterExperiences.id, row.id))
        .returning();

      normalized.push(updated ?? { ...row, shareToken: row.id });
    }

    return normalized;
  }

  async getPromoterExperience(
    promoterId: string,
    experienceId: string,
    referralAudience = 'participant',
  ): Promise<PromoterExperienceRecord | undefined> {
    const [existing] = await db
      .select()
      .from(promoterExperiences)
      .where(
        and(
          eq(promoterExperiences.promoterId, promoterId),
          eq(promoterExperiences.experienceId, experienceId),
          eq(promoterExperiences.referralAudience, referralAudience),
        ),
      )
      .limit(1);

    if (!existing) return undefined;
    if (existing.shareToken) return existing;

    const [updated] = await db
      .update(promoterExperiences)
      .set({ shareToken: existing.id })
      .where(eq(promoterExperiences.id, existing.id))
      .returning();

    return updated ?? { ...existing, shareToken: existing.id };
  }

  async getPromoterPromotedExperienceIds(promoterId: string): Promise<string[]> {
    const rows = await this.getPromoterPromotedExperiences(promoterId);
    return rows.map((row) => row.experienceId);
  }

  async getPromoterExperienceByShareToken(shareToken: string): Promise<PromoterExperienceRecord | undefined> {
    const [row] = await db
      .select()
      .from(promoterExperiences)
      .where(eq(promoterExperiences.shareToken, shareToken))
      .limit(1);

    return row;
  }

  async promoteExperience(
    promoterId: string,
    experienceId: string,
    options: { referralAudience?: 'participant' | 'official_partner'; promotionDealId?: string | null } = {},
  ): Promise<PromoterExperienceRecord> {
    const referralAudience = options.referralAudience || 'participant';
    const existing = await this.getPromoterExperience(promoterId, experienceId, referralAudience);
    if (existing) {
      if (options.promotionDealId && existing.promotionDealId !== options.promotionDealId) {
        const [updated] = await db
          .update(promoterExperiences)
          .set({ promotionDealId: options.promotionDealId })
          .where(eq(promoterExperiences.id, existing.id))
          .returning();
        return updated || existing;
      }
      return existing;
    }

    const [inserted] = await db
      .insert(promoterExperiences)
      .values({
        promoterId,
        experienceId,
        referralAudience,
        promotionDealId: options.promotionDealId || null,
      })
      .returning();

    if (inserted.shareToken) {
      return inserted;
    }

    const [updated] = await db
      .update(promoterExperiences)
      .set({ shareToken: inserted.id })
      .where(eq(promoterExperiences.id, inserted.id))
      .returning();

    return updated ?? { ...inserted, shareToken: inserted.id };
  }

  async isPromotingExperience(promoterId: string, experienceId: string): Promise<boolean> {
    const [result] = await db
      .select()
      .from(promoterExperiences)
      .where(
        and(
          eq(promoterExperiences.promoterId, promoterId),
          eq(promoterExperiences.experienceId, experienceId)
        )
      );
    return !!result;
  }

  // Promotion Deals — Digital Handshake for promoter/brand negotiation (Part 3)
  private extractBaselinePromotionTerms(experience: Experience, dealType: string): NonNullable<PromotionDeal["terms"]> {
    switch (dealType) {
      case "commission_per_ticket":
        return { commissionPct: Number((experience as any).influencerCommissionPct || 0) };
      case "milestone_barter":
        return {
          milestoneAttendeeTarget: (experience as any).promotionMilestoneAttendeeTarget ?? undefined,
          milestoneRewardTickets: (experience as any).promotionMilestoneRewardTickets ?? undefined,
        };
      case "brand_barter":
        return { brandPitch: (experience as any).promotionBrandPitch ?? undefined };
      case "financial_sponsorship":
        return {
          sponsorshipAmount: (experience as any).promotionSponsorshipAmount
            ? Number((experience as any).promotionSponsorshipAmount)
            : undefined,
          currency: (experience as any).currency ?? undefined,
        };
      default:
        return {};
    }
  }

  // Translate an experience's Option A (platform partners) and Option B (external invites)
  // selections into Digital Handshake deal rows the recipients see in their Offers tab.
  // Idempotent — safe to call every time the promotion step is saved.
  async syncDirectPromotionDeals(experienceId: string): Promise<void> {
    const experience = await this.getExperience(experienceId);
    if (!experience || !(experience as any).promotionDealType) return;
    if (experience.status !== "approved" && experience.status !== "published") return;

    const dealType = (experience as any).promotionDealType as string;
    const baselineTerms = this.extractBaselinePromotionTerms(experience, dealType);
    const selectedPartnerIds: string[] = Array.isArray((experience as any).promotionSelectedPartnerIds)
      ? (experience as any).promotionSelectedPartnerIds
      : [];
    const externalInvites: Array<{ id: string; email: string; name: string }> = Array.isArray(
      (experience as any).promotionExternalInvites,
    )
      ? (experience as any).promotionExternalInvites
      : [];

    const existingDeals = await db
      .select()
      .from(promotionDeals)
      .where(
        and(
          eq(promotionDeals.experienceId, experienceId),
          or(eq(promotionDeals.source, "platform_direct"), eq(promotionDeals.source, "external_direct")),
        ),
      );

    const desiredPartnerIds = new Set(selectedPartnerIds);
    const desiredEmails = new Set(
      externalInvites
        .map((invite) => invite?.email?.toLowerCase().trim())
        .filter((email): email is string => !!email),
    );

    for (const deal of existingDeals) {
      if (deal.status !== "pending") continue;
      const isSelected = deal.source === "platform_direct"
        ? !!deal.partnerId && desiredPartnerIds.has(deal.partnerId)
        : !!deal.partnerEmail && desiredEmails.has(deal.partnerEmail.toLowerCase());

      if (!isSelected) {
        await db.delete(promotionDeals).where(eq(promotionDeals.id, deal.id));
        continue;
      }

      await db
        .update(promotionDeals)
        .set({
          dealType,
          baselineTerms,
          terms: baselineTerms,
          pendingActionBy: "partner",
          updatedAt: new Date(),
        })
        .where(eq(promotionDeals.id, deal.id));
    }

    const currentDeals = await db
      .select()
      .from(promotionDeals)
      .where(
        and(
          eq(promotionDeals.experienceId, experienceId),
          or(eq(promotionDeals.source, "platform_direct"), eq(promotionDeals.source, "external_direct")),
        ),
      );
    const existingByPartnerId = new Set(
      currentDeals.filter((d) => d.source === "platform_direct" && d.partnerId).map((d) => d.partnerId),
    );
    const existingByEmail = new Set(
      currentDeals
        .filter((d) => d.source === "external_direct" && d.partnerEmail)
        .map((d) => d.partnerEmail!.toLowerCase()),
    );
    const creator = await this.getUser(experience.creatorId);
    const creatorName = [creator?.firstName, creator?.lastName].filter(Boolean).join(' ') || creator?.email || 'the creator';

    for (const partnerId of selectedPartnerIds) {
      if (existingByPartnerId.has(partnerId)) continue;
      await db.insert(promotionDeals).values({
        experienceId,
        creatorId: experience.creatorId,
        partnerId,
        source: "platform_direct",
        dealType,
        baselineTerms,
        terms: baselineTerms,
        status: "pending",
        pendingActionBy: "partner",
      });

      // Notify the platform partner their Offers tab has a new Digital Handshake.
      // Dynamic import — notifications.ts imports storage, so a static import here
      // would be circular. Fire-and-forget: email failure must not break the sync.
      this.getUser(partnerId)
        .then(async (partner) => {
          if (!partner?.email) return;
          const { notificationService } = await import('./notifications');
          await notificationService.sendPromotionOfferReceivedEmail({
            to: partner.email,
            recipientName: partner.firstName,
            senderName: creatorName,
            experienceTitle: experience.title,
            experienceSlugOrId: (experience as any).slug || experience.id,
            dealType,
            terms: baselineTerms,
            currency: (experience as any).currency,
          });
        })
        .catch((err) => console.error('Promotion offer email failed:', err?.message || err));
    }

    for (const invite of externalInvites) {
      const email = invite?.email?.toLowerCase().trim();
      if (!email || existingByEmail.has(email)) continue;
      const matchedUser = await this.getUserByEmail(email);
      // The token is the invite's front door: the emailed link opens
      // /partner-invite/:token where the brand sees the deal, signs up and
      // accepts — instead of being dropped on the public event page.
      const inviteToken = randomBytes(24).toString("base64url");
      await db.insert(promotionDeals).values({
        experienceId,
        creatorId: experience.creatorId,
        partnerId: matchedUser?.id,
        partnerEmail: email,
        partnerName: invite.name,
        source: "external_direct",
        dealType,
        baselineTerms,
        terms: baselineTerms,
        status: "pending",
        pendingActionBy: "partner",
        inviteToken,
      });

      // External partners may not have an account yet. The deal is persisted
      // before the email is sent, so signing up with this address immediately
      // reveals a live offer in their dashboard. The eventKey matches the one
      // used by the publish-time invitation path, so the partner gets ONE email
      // no matter which path runs first.
      import('./notifications')
        .then(({ notificationService, formatPromotionDealSummary, notificationEventKey, partnerInviteUrl }) => notificationService.sendExternalPartnerInviteEmail({
          to: email,
          partnerName: matchedUser?.firstName || invite.name,
          creatorName,
          eventName: experience.title,
          eventSlugOrId: (experience as any).slug || experience.id,
          proposedTerms: formatPromotionDealSummary(dealType, baselineTerms, (experience as any).currency),
          reviewUrl: partnerInviteUrl(inviteToken),
          ctaLabel: 'Review & Accept the Deal',
          eventKey: notificationEventKey('external_promotion_invite', experienceId, email),
        }))
        .catch((err) => console.error('External promotion invitation email failed:', err?.message || err));
    }
  }

  async getPromotionDealForExperienceEmail(
    experienceId: string,
    email: string,
  ): Promise<PromotionDeal | undefined> {
    const [row] = await db
      .select()
      .from(promotionDeals)
      .where(and(
        eq(promotionDeals.experienceId, experienceId),
        sql`lower(${promotionDeals.partnerEmail}) = lower(${email})`,
      ))
      .limit(1);
    return row;
  }

  async getPromotionDealByInviteToken(token: string): Promise<PromotionDeal | undefined> {
    const [row] = await db
      .select()
      .from(promotionDeals)
      .where(eq(promotionDeals.inviteToken, token))
      .limit(1);
    return row;
  }

  /**
   * Attaches an invited external deal to the account that opened the claim
   * link. Token possession is the credential — the invite may have been
   * forwarded to whoever actually runs the brand's account.
   */
  async claimPromotionDealInvite(token: string, userId: string): Promise<PromotionDeal | undefined> {
    const [row] = await db
      .update(promotionDeals)
      .set({ partnerId: userId, updatedAt: new Date() })
      .where(and(
        eq(promotionDeals.inviteToken, token),
        or(isNull(promotionDeals.partnerId), eq(promotionDeals.partnerId, userId)),
      ))
      .returning();
    return row;
  }

  async getPromotionDeal(dealId: string): Promise<PromotionDeal | undefined> {
    const [row] = await db.select().from(promotionDeals).where(eq(promotionDeals.id, dealId)).limit(1);
    return row;
  }

  // Backfills partnerId on external-invite deals once the invited person creates/logs into
  // an account matching the invite email, then returns all direct offers awaiting this user.
  async getDirectPromotionDealsForPartner(
    userId: string,
    userEmail?: string | null,
  ): Promise<Array<{ deal: PromotionDeal; experience: Experience }>> {
    if (userEmail) {
      await db
        .update(promotionDeals)
        .set({ partnerId: userId })
        .where(and(isNull(promotionDeals.partnerId), eq(promotionDeals.partnerEmail, userEmail.toLowerCase())));
    }

    const rows = await db
      .select({ deal: promotionDeals, experience: experiences })
      .from(promotionDeals)
      .innerJoin(experiences, eq(promotionDeals.experienceId, experiences.id))
      .where(
        and(
          eq(promotionDeals.partnerId, userId),
          or(eq(promotionDeals.source, "platform_direct"), eq(promotionDeals.source, "external_direct")),
        ),
      )
      .orderBy(desc(promotionDeals.createdAt));

    return rows;
  }

  async respondToDirectPromotionDeal(
    dealId: string,
    partnerId: string,
    action: "accept" | "decline",
  ): Promise<PromotionDeal | undefined> {
    const deal = await this.getPromotionDeal(dealId);
    if (!deal || deal.partnerId !== partnerId || deal.status !== "pending") return undefined;

    const requiresPayment = deal.dealType === "financial_sponsorship" && action === "accept";
    const [updated] = await db
      .update(promotionDeals)
      .set({
        status: requiresPayment ? "pending_payment" : action === "accept" ? "accepted" : "declined",
        pendingActionBy: requiresPayment ? "partner" : null,
        paymentStatus: requiresPayment ? "unpaid" : deal.paymentStatus,
        respondedAt: requiresPayment ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(promotionDeals.id, dealId))
      .returning();

    // Accepting a deal is only useful if the partner walks away with a trackable link —
    // grant them the same promoter tracking record regular promoters get.
    if (updated && action === "accept" && !requiresPayment) {
      await this.promoteExperience(partnerId, deal.experienceId, {
        referralAudience: 'official_partner',
        promotionDealId: updated.id,
      });
    }

    return updated;
  }

  // All marketplace bids this partner has placed, keyed by experience — used to render
  // the Experience Pool card state (Accept/Counter vs. already accepted/countered).
  async getMarketplacePromotionDealsForPartner(partnerId: string): Promise<PromotionDeal[]> {
    return db
      .select()
      .from(promotionDeals)
      .where(and(eq(promotionDeals.partnerId, partnerId), eq(promotionDeals.source, "marketplace")));
  }

  // Marketplace (Option C): partner either accepts the creator's baseline terms as-is,
  // or counters with new terms that the creator must then accept/decline.
  async createOrUpdateMarketplacePromotionDeal(
    experienceId: string,
    partnerId: string,
    action: "accept" | "counter",
    counterTerms?: PromotionDeal["terms"],
    counterMessage?: string,
  ): Promise<PromotionDeal> {
    const experience = await this.getExperience(experienceId);
    if (!experience || !(experience as any).promotionDealType) {
      throw new Error("Experience is not configured for promotion deals");
    }

    const dealType = (experience as any).promotionDealType as string;
    const baselineTerms = this.extractBaselinePromotionTerms(experience, dealType);

    const [existing] = await db
      .select()
      .from(promotionDeals)
      .where(
        and(
          eq(promotionDeals.experienceId, experienceId),
          eq(promotionDeals.partnerId, partnerId),
          eq(promotionDeals.source, "marketplace"),
        ),
      )
      .limit(1);

    const requiresPayment = dealType === "financial_sponsorship" && action === "accept";
    const values = {
      status: requiresPayment ? "pending_payment" : action === "accept" ? "accepted" : "countered",
      pendingActionBy: requiresPayment ? "partner" : action === "accept" ? null : "creator",
      paymentStatus: requiresPayment ? "unpaid" : null,
      terms: action === "accept" ? baselineTerms : counterTerms ?? {},
      counterMessage: action === "counter" ? counterMessage ?? null : null,
      respondedAt: action === "accept" && !requiresPayment ? new Date() : null,
      updatedAt: new Date(),
    } as const;

    let result: PromotionDeal;
    if (existing) {
      const [updated] = await db
        .update(promotionDeals)
        .set(values)
        .where(eq(promotionDeals.id, existing.id))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db
        .insert(promotionDeals)
        .values({
          experienceId,
          creatorId: experience.creatorId,
          partnerId,
          source: "marketplace",
          dealType,
          baselineTerms,
          ...values,
        })
        .returning();
      result = inserted;
    }

    // Accepting a deal is only useful if the partner walks away with a trackable link —
    // grant them the same promoter tracking record regular promoters get.
    if (action === "accept" && !requiresPayment) {
      await this.promoteExperience(partnerId, experienceId, {
        referralAudience: 'official_partner',
        promotionDealId: result.id,
      });
    }

    return result;
  }

  async getPromotionDealsForCreator(
    creatorId: string,
  ): Promise<Array<{ deal: PromotionDeal; experience: Experience; partner: User | undefined }>> {
    const rows = await db
      .select({ deal: promotionDeals, experience: experiences, partner: users })
      .from(promotionDeals)
      .innerJoin(experiences, eq(promotionDeals.experienceId, experiences.id))
      .leftJoin(users, eq(promotionDeals.partnerId, users.id))
      .where(eq(promotionDeals.creatorId, creatorId))
      .orderBy(desc(promotionDeals.updatedAt));

    return rows;
  }

  async syncMilestoneFulfillmentForBooking(
    bookingId: string,
  ): Promise<MilestoneReferralProgress | undefined> {
    const [context] = await db
      .select({
        bookingStatus: bookings.status,
        promotion: promoterExperiences,
        experience: experiences,
        deal: promotionDeals,
      })
      .from(bookings)
      .innerJoin(promoterExperiences, eq(bookings.promoterExperienceId, promoterExperiences.id))
      .innerJoin(experiences, eq(promoterExperiences.experienceId, experiences.id))
      .leftJoin(promotionDeals, eq(promoterExperiences.promotionDealId, promotionDeals.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);

    if (!context || !isQualifyingReferralBooking(context.bookingStatus)) return undefined;

    const milestone = resolveMilestoneReward({
      referralAudience: context.promotion.referralAudience,
      experience: context.experience,
      deal: context.deal,
    });
    if (!milestone) return undefined;

    const attributedBookings = await db
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.promoterExperienceId, context.promotion.id));
    const qualifyingBookings = attributedBookings.filter((booking) =>
      isQualifyingReferralBooking(booking.status)
    ).length;

    let fulfillmentId: string | null = null;
    const unlocked = qualifyingBookings >= milestone.target;
    // Persist progress as soon as there's at least one qualifying booking so the
    // creator's Fulfillment tab can show partial milestones (e.g. 1/3), not just
    // fully unlocked ones. `in_progress` rows carry a null unlockedAt.
    if (qualifyingBookings > 0) {
      const now = new Date();
      const progressStatus = unlocked ? "unlocked" : "in_progress";
      const [existing] = await db
        .select()
        .from(perkFulfillments)
        .where(eq(perkFulfillments.promoterExperienceId, context.promotion.id))
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(perkFulfillments)
          .set({
            promotionDealId: context.promotion.promotionDealId,
            referralAudience: context.promotion.referralAudience,
            milestoneTarget: milestone.target,
            qualifyingBookings,
            rewardDescription: milestone.rewardDescription,
            status: existing.status === "fulfilled" ? "fulfilled" : progressStatus,
            unlockedAt: unlocked ? (existing.unlockedAt || now) : null,
            updatedAt: now,
          })
          .where(eq(perkFulfillments.id, existing.id))
          .returning({ id: perkFulfillments.id });
        fulfillmentId = updated?.id || existing.id;
      } else {
        const [inserted] = await db
          .insert(perkFulfillments)
          .values({
            promoterExperienceId: context.promotion.id,
            experienceId: context.promotion.experienceId,
            beneficiaryId: context.promotion.promoterId,
            promotionDealId: context.promotion.promotionDealId,
            referralAudience: context.promotion.referralAudience,
            dealType: "milestone_barter",
            milestoneTarget: milestone.target,
            qualifyingBookings,
            rewardDescription: milestone.rewardDescription,
            status: progressStatus,
            unlockedAt: unlocked ? now : null,
          })
          .onConflictDoNothing({ target: perkFulfillments.promoterExperienceId })
          .returning({ id: perkFulfillments.id });

        if (inserted) {
          fulfillmentId = inserted.id;
        } else {
          const [concurrent] = await db
            .select({ id: perkFulfillments.id })
            .from(perkFulfillments)
            .where(eq(perkFulfillments.promoterExperienceId, context.promotion.id))
            .limit(1);
          fulfillmentId = concurrent?.id || null;
        }
      }
    }

    return {
      promoterExperienceId: context.promotion.id,
      promoterId: context.promotion.promoterId,
      referralAudience: context.promotion.referralAudience,
      qualifyingBookings,
      milestoneTarget: milestone.target,
      rewardDescription: milestone.rewardDescription,
      fulfillmentId,
      unlocked,
    };
  }

  async getCreatorPerkFulfillments(creatorId: string): Promise<any[]> {
    const referralRows = await db
      .select({
        promotion: promoterExperiences,
        experience: experiences,
        beneficiary: users,
        deal: promotionDeals,
      })
      .from(promoterExperiences)
      .innerJoin(experiences, eq(promoterExperiences.experienceId, experiences.id))
      .innerJoin(users, eq(promoterExperiences.promoterId, users.id))
      .leftJoin(promotionDeals, eq(promoterExperiences.promotionDealId, promotionDeals.id))
      .where(eq(experiences.creatorId, creatorId));

    const referralIds = referralRows.map((row) => row.promotion.id);
    if (referralIds.length) {
      const attributedBookings = await db
        .select({
          promoterExperienceId: bookings.promoterExperienceId,
          status: bookings.status,
        })
        .from(bookings)
        .where(inArray(bookings.promoterExperienceId, referralIds));

      const bookingCounts = new Map<string, number>();
      for (const booking of attributedBookings) {
        if (!booking.promoterExperienceId || !isQualifyingReferralBooking(booking.status)) continue;
        bookingCounts.set(
          booking.promoterExperienceId,
          (bookingCounts.get(booking.promoterExperienceId) || 0) + 1,
        );
      }

      const existingRows = await db
        .select()
        .from(perkFulfillments)
        .where(inArray(perkFulfillments.promoterExperienceId, referralIds));
      const existingByReferral = new Map(existingRows.map((row) => [row.promoterExperienceId, row]));

      for (const row of referralRows) {
        const milestone = resolveMilestoneReward({
          referralAudience: row.promotion.referralAudience,
          experience: row.experience,
          deal: row.deal,
        });
        const qualifyingBookings = bookingCounts.get(row.promotion.id) || 0;
        const existing = existingByReferral.get(row.promotion.id);

        // No milestone configured, or no qualifying bookings yet → nothing to show.
        // Void any stale record whose bookings were later refunded/cancelled to zero.
        if (!milestone || qualifyingBookings <= 0) {
          if (existing && existing.status !== "fulfilled" && existing.status !== "voided") {
            await db
              .update(perkFulfillments)
              .set({ status: "voided", qualifyingBookings, updatedAt: new Date() })
              .where(eq(perkFulfillments.id, existing.id));
          }
          continue;
        }

        // At least one qualifying booking → show it. `in_progress` below target
        // (e.g. 1/3), `unlocked` at/above target. Preserve a manual `fulfilled`.
        const reached = qualifyingBookings >= milestone.target;
        const nextStatus = existing?.status === "fulfilled"
          ? "fulfilled"
          : reached ? "unlocked" : "in_progress";
        const nextUnlockedAt = reached ? (existing?.unlockedAt || new Date()) : null;

        if (existing) {
          await db
            .update(perkFulfillments)
            .set({
              promotionDealId: row.promotion.promotionDealId,
              referralAudience: row.promotion.referralAudience,
              milestoneTarget: milestone.target,
              qualifyingBookings,
              rewardDescription: milestone.rewardDescription,
              status: nextStatus,
              unlockedAt: nextUnlockedAt,
              updatedAt: new Date(),
            })
            .where(eq(perkFulfillments.id, existing.id));
        } else {
          await db.insert(perkFulfillments).values({
            promoterExperienceId: row.promotion.id,
            experienceId: row.promotion.experienceId,
            beneficiaryId: row.promotion.promoterId,
            promotionDealId: row.promotion.promotionDealId,
            referralAudience: row.promotion.referralAudience,
            dealType: "milestone_barter",
            milestoneTarget: milestone.target,
            qualifyingBookings,
            rewardDescription: milestone.rewardDescription,
            status: nextStatus,
            unlockedAt: nextUnlockedAt,
          })
          .onConflictDoNothing({ target: perkFulfillments.promoterExperienceId });
        }
      }
    }

    const fulfillments = await db
      .select({
        fulfillment: perkFulfillments,
        experience: experiences,
        beneficiary: users,
      })
      .from(perkFulfillments)
      .innerJoin(experiences, eq(perkFulfillments.experienceId, experiences.id))
      .innerJoin(users, eq(perkFulfillments.beneficiaryId, users.id))
      .where(eq(experiences.creatorId, creatorId))
      .orderBy(desc(perkFulfillments.unlockedAt));

    return fulfillments.map(({ fulfillment, experience, beneficiary }) => ({
      ...fulfillment,
      experience: {
        id: experience.id,
        title: experience.title,
        currency: normalizeCurrency(experience.currency),
        startDate: experience.startDate,
      },
      beneficiary: {
        id: beneficiary.id,
        firstName: beneficiary.firstName,
        lastName: beneficiary.lastName,
        email: beneficiary.email,
        role: beneficiary.role,
      },
    }));
  }

  async updatePerkFulfillmentStatus(
    id: string,
    creatorId: string,
    status: "unlocked" | "fulfilled",
    notes?: string,
  ): Promise<any | undefined> {
    const [owned] = await db
      .select({ fulfillment: perkFulfillments })
      .from(perkFulfillments)
      .innerJoin(experiences, eq(perkFulfillments.experienceId, experiences.id))
      .where(and(eq(perkFulfillments.id, id), eq(experiences.creatorId, creatorId)))
      .limit(1);
    if (!owned) return undefined;

    const [updated] = await db
      .update(perkFulfillments)
      .set({
        status,
        notes: notes?.trim() || null,
        fulfilledAt: status === "fulfilled" ? new Date() : null,
        fulfilledBy: status === "fulfilled" ? creatorId : null,
        updatedAt: new Date(),
      })
      .where(eq(perkFulfillments.id, id))
      .returning();
    return updated;
  }

  async getAdminDealLedger(): Promise<any[]> {
    const [venueRows, venueOfferRows, venueInviteRows, promotionRows, bookingRows, payoutRows] = await Promise.all([
      db.select({ contract: venueContracts, experience: experiences, venue: venues })
        .from(venueContracts)
        .innerJoin(experiences, eq(venueContracts.experienceId, experiences.id))
        .innerJoin(venues, eq(venueContracts.venueId, venues.id)),
      // Every venue offer regardless of status. The ledger must show pending,
      // countered, declined and admin_review deals — not only accepted ones.
      db.select({ offer: venueOffers, experience: experiences, venue: venues })
        .from(venueOffers)
        .innerJoin(experiences, eq(venueOffers.experienceId, experiences.id))
        .innerJoin(venues, eq(venueOffers.venueId, venues.id)),
      // An emailed invite to a venue that is not on the platform yet. It has
      // no contract and no offer until the venue claims it, so without this
      // the ledger showed nothing at all between sending and acceptance.
      db.select({ invite: venueInvites, experience: experiences })
        .from(venueInvites)
        .innerJoin(experiences, eq(venueInvites.experienceId, experiences.id)),
      db.select({ deal: promotionDeals, experience: experiences, partner: users })
        .from(promotionDeals)
        .innerJoin(experiences, eq(promotionDeals.experienceId, experiences.id))
        .leftJoin(users, eq(promotionDeals.partnerId, users.id)),
      db.select({ booking: bookings, experience: experiences, participant: users })
        .from(bookings)
        .innerJoin(experiences, eq(bookings.experienceId, experiences.id))
        .innerJoin(users, eq(bookings.userId, users.id)),
      db.select({ payout: scheduledPayouts, experience: experiences })
        .from(scheduledPayouts)
        .innerJoin(experiences, eq(scheduledPayouts.experienceId, experiences.id)),
    ]);

    const creatorIds = Array.from(new Set([
      ...venueRows.map((row) => row.contract.creatorId),
      ...venueOfferRows.map((row) => row.experience.creatorId),
      ...venueInviteRows.map((row) => row.invite.creatorId),
      ...promotionRows.map((row) => row.deal.creatorId),
      ...bookingRows.map((row) => row.experience.creatorId),
      ...payoutRows.map((row) => row.experience.creatorId),
    ]));
    const creatorRows = creatorIds.length
      ? await db.select().from(users).where(inArray(users.id, creatorIds))
      : [];
    const creatorsById = new Map(creatorRows.map((creator) => [creator.id, creator]));

    const creatorSummary = (creatorId: string) => {
      const creator = creatorsById.get(creatorId);
      return {
        id: creatorId,
        name: [creator?.firstName, creator?.lastName].filter(Boolean).join(" ") || creator?.email || "Creator",
        email: creator?.email || null,
      };
    };

    // Group offers by experience+venue so a contract row can carry the full
    // back-and-forth (creator invite → venue counter → resolution).
    const offersByVenueKey = new Map<string, any[]>();
    for (const { offer } of venueOfferRows) {
      const key = `${offer.experienceId}:${offer.venueId}`;
      const bucket = offersByVenueKey.get(key) || [];
      bucket.push(offer);
      offersByVenueKey.set(key, bucket);
    }
    const venueNegotiationRounds = (key: string) =>
      (offersByVenueKey.get(key) || [])
        .slice()
        .sort((left, right) =>
          new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
        .map((offer) => ({
          from: "venue",
          status: offer.status,
          model: offer.model,
          terms: offer.terms || {},
          note: offer.message || null,
          at: offer.updatedAt || offer.createdAt,
        }));

    const venueLedger = venueRows.map(({ contract, experience, venue }) => ({
      id: contract.id,
      contractType: "venue",
      dealType: contract.model,
      status: contract.status,
      terms: {
        ...(contract.terms || {}),
        sponsorshipPaymentStatus: contract.sponsorshipPaymentStatus,
      },
      currency: normalizeCurrency((contract.terms as any)?.currency || experience.currency),
      acceptedAt: contract.acceptedAt || contract.updatedAt,
      updatedAt: contract.updatedAt,
      experience: { id: experience.id, title: experience.title },
      creator: creatorSummary(contract.creatorId),
      counterparty: {
        id: venue.id,
        name: venue.name,
        email: venue.contactEmail || null,
        role: "venue",
      },
      negotiation: {
        isCountered: contract.status === "countered",
        pendingActionBy: contract.status === "countered" ? "creator" : null,
        originalTerms: contract.terms || {},
        currentTerms: contract.terms || {},
        declineReason: contract.declineReason || null,
        rounds: venueNegotiationRounds(`${contract.experienceId}:${contract.venueId}`),
      },
    }));

    // Offers with no contract row are standalone reverse-marketplace bids.
    const contractedVenueKeys = new Set(
      venueRows.map(({ contract }) => `${contract.experienceId}:${contract.venueId}`),
    );
    const venueOfferLedger = venueOfferRows
      .filter(({ offer }) => !contractedVenueKeys.has(`${offer.experienceId}:${offer.venueId}`))
      .map(({ offer, experience, venue }) => ({
        id: offer.id,
        contractType: "venue",
        dealType: offer.model,
        status: offer.status || "pending",
        terms: offer.terms || {},
        currency: normalizeCurrency((offer.terms as any)?.currency || experience.currency),
        acceptedAt: offer.updatedAt || offer.createdAt,
        updatedAt: offer.updatedAt,
        experience: { id: experience.id, title: experience.title },
        creator: creatorSummary(experience.creatorId),
        counterparty: {
          id: venue.id,
          name: venue.name,
          email: venue.contactEmail || null,
          role: "venue",
        },
        negotiation: {
          isCountered: false,
          pendingActionBy: offer.status === "pending"
            ? "creator"
            : offer.status === "admin_review" ? "admin" : null,
          originalTerms: offer.terms || {},
          currentTerms: offer.terms || {},
          declineReason: null,
          rounds: [{
            from: "venue",
            status: offer.status,
            model: offer.model,
            terms: offer.terms || {},
            note: offer.message || null,
            at: offer.updatedAt || offer.createdAt,
          }],
        },
      }));

    // A claimed invite becomes a contract, and the contract row above says it
    // better. Only show invites still waiting on the venue.
    const claimedInviteIds = new Set(
      venueInviteRows.filter(({ invite }) => invite.claimedVenueId).map(({ invite }) => invite.id),
    );
    const venueInviteLedger = venueInviteRows
      .filter(({ invite }) => !claimedInviteIds.has(invite.id))
      .map(({ invite, experience }) => {
        const model = normalizeVenueDealModel(invite.proposedModel) || "access_only";
        // An invite carries one loose number. Filing it under the key its model
        // owns is what lets the ledger read it — parked under a generic
        // "proposedValue" a 40% revenue split rendered as 0%.
        const termsKey = getVenueDealTermsKey(model);
        const terms: Record<string, any> = { currency: invite.currency || experience.currency || "eur" };
        if (termsKey && invite.proposedValue != null) {
          terms[termsKey] = Number(invite.proposedValue);
        }

        return {
          id: invite.id,
          contractType: "venue",
          dealType: model,
          status: invite.status || "pending",
          terms,
          currency: normalizeCurrency(invite.currency || experience.currency),
          acceptedAt: invite.respondedAt || invite.updatedAt || invite.createdAt,
          updatedAt: invite.updatedAt,
          experience: { id: experience.id, title: experience.title },
          creator: creatorSummary(invite.creatorId),
          counterparty: {
            id: invite.claimedVenueId || null,
            name: invite.venueName || invite.contactName || invite.email,
            email: invite.email,
            role: "venue",
          },
          negotiation: {
            isCountered: false,
            // Sent, delivered, and nobody on our side can move it forward.
            pendingActionBy: invite.status === "pending" ? "venue" : null,
            originalTerms: terms,
            currentTerms: terms,
            declineReason: invite.declineReason || null,
            rounds: [{
              from: "creator",
              status: invite.status || "pending",
              model,
              terms,
              note: "Invitation emailed to the venue",
              at: invite.createdAt,
            }],
          },
        };
      });

    const promotionLedger = promotionRows.map(({ deal, experience, partner }) => ({
      id: deal.id,
      contractType: "promotion",
      dealType: deal.dealType,
      status: deal.status,
      terms: {
        ...(deal.terms || deal.baselineTerms || {}),
        paymentStatus: deal.paymentStatus,
      },
      currency: normalizeCurrency((deal.terms as any)?.currency || experience.currency),
      acceptedAt: deal.respondedAt || deal.paidAt || deal.updatedAt,
      updatedAt: deal.updatedAt,
      experience: { id: experience.id, title: experience.title },
      creator: creatorSummary(deal.creatorId),
      counterparty: {
        id: partner?.id || null,
        name: [partner?.firstName, partner?.lastName].filter(Boolean).join(" ")
          || deal.partnerName
          || deal.partnerEmail
          || "External partner",
        email: partner?.email || deal.partnerEmail || null,
        role: partner?.role || "partner",
      },
      // baselineTerms hold the creator's opening offer; terms hold whatever the
      // latest counter changed them to. Together they are the negotiation trail.
      negotiation: {
        isCountered: deal.status === "countered",
        pendingActionBy: deal.pendingActionBy || null,
        originalTerms: deal.baselineTerms || {},
        currentTerms: deal.terms || {},
        declineReason: null,
        rounds: [],
      },
    }));

    const bookingLedger = bookingRows.map(({ booking, experience, participant }) => ({
      id: booking.id,
      contractType: "booking",
      dealType: "ticket_booking",
      status: booking.status || "pending",
      terms: {
        amount: Number(booking.amount || 0),
        totalPrice: Number(booking.totalPrice || 0),
        depositAmount: Number(booking.depositAmount || 0),
        balanceAmount: Number(booking.balanceAmount || 0),
        isDepositOnly: !!booking.isDepositOnly,
        balancePaid: !!booking.balancePaid,
        commissionAmount: Number(booking.commissionAmount || 0),
      },
      currency: normalizeCurrency(booking.commissionCurrency || experience.currency),
      acceptedAt: booking.bookingDate || booking.createdAt,
      updatedAt: booking.createdAt,
      experience: { id: experience.id, title: experience.title },
      creator: creatorSummary(experience.creatorId),
      counterparty: {
        id: participant.id,
        name: [participant.firstName, participant.lastName].filter(Boolean).join(" ")
          || participant.email
          || "Participant",
        email: participant.email || null,
        role: "participant",
      },
    }));

    const payoutLedger = payoutRows.map(({ payout, experience }) => ({
      id: payout.id,
      contractType: "payout",
      dealType: "scheduled_payout",
      status: payout.status || "pending",
      terms: {
        totalGross: Number(payout.totalGrossAmountCents || 0) / 100,
        additionalGross: Number(payout.additionalGrossAmountCents || 0) / 100,
        platformFee: Number(payout.platformFeeAmountCents || 0) / 100,
        scheduledFor: payout.scheduledFor,
      },
      currency: normalizeCurrency(experience.currency),
      acceptedAt: payout.processedAt || payout.updatedAt || payout.createdAt,
      updatedAt: payout.updatedAt,
      experience: { id: experience.id, title: experience.title },
      creator: creatorSummary(experience.creatorId),
      counterparty: {
        id: null,
        name: "Platform payout schedule",
        email: null,
        role: "platform",
      },
    }));

    return [
      ...venueLedger,
      ...venueOfferLedger,
      ...venueInviteLedger,
      ...promotionLedger,
      ...bookingLedger,
      ...payoutLedger,
    ].sort((left, right) =>
      new Date(right.acceptedAt || 0).getTime() - new Date(left.acceptedAt || 0).getTime(),
    );
  }

  async respondToCreatorPromotionDeal(
    dealId: string,
    creatorId: string,
    action: "accept" | "decline",
  ): Promise<PromotionDeal | undefined> {
    const deal = await this.getPromotionDeal(dealId);
    if (!deal || deal.creatorId !== creatorId || deal.status !== "countered" || deal.pendingActionBy !== "creator") {
      return undefined;
    }

    const requiresPayment = deal.dealType === "financial_sponsorship" && action === "accept";
    const [updated] = await db
      .update(promotionDeals)
      .set({
        status: requiresPayment ? "pending_payment" : action === "accept" ? "accepted" : "declined",
        pendingActionBy: requiresPayment ? "partner" : null,
        paymentStatus: requiresPayment ? "unpaid" : deal.paymentStatus,
        respondedAt: requiresPayment ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(promotionDeals.id, dealId))
      .returning();

    if (updated && action === "accept" && !requiresPayment && deal.partnerId) {
      await this.promoteExperience(deal.partnerId, deal.experienceId, {
        referralAudience: 'official_partner',
        promotionDealId: updated.id,
      });
    }

    return updated;
  }

  async setPromotionSponsorshipCheckoutSession(dealId: string, sessionId: string): Promise<PromotionDeal | undefined> {
    const [updated] = await db
      .update(promotionDeals)
      .set({
        status: "pending_payment",
        paymentStatus: "unpaid",
        pendingActionBy: "partner",
        stripeCheckoutSessionId: sessionId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(promotionDeals.id, dealId),
        eq(promotionDeals.dealType, "financial_sponsorship"),
        eq(promotionDeals.status, "pending_payment"),
        or(isNull(promotionDeals.paymentStatus), not(eq(promotionDeals.paymentStatus, "paid"))),
      ))
      .returning();
    return updated;
  }

  async finalizePromotionSponsorshipPayment(
    dealId: string,
    checkoutSessionId: string,
    paymentIntentId?: string | null,
  ): Promise<{ deal: PromotionDeal; newlyPaid: boolean } | undefined> {
    const deal = await this.getPromotionDeal(dealId);
    if (!deal || deal.dealType !== "financial_sponsorship") return undefined;
    if (deal.paymentStatus === "paid" && deal.status === "accepted") {
      return { deal, newlyPaid: false };
    }

    const [updated] = await db
      .update(promotionDeals)
      .set({
        status: "accepted",
        paymentStatus: "paid",
        pendingActionBy: null,
        stripeCheckoutSessionId: checkoutSessionId,
        stripePaymentIntentId: paymentIntentId || null,
        paidAt: new Date(),
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(promotionDeals.id, dealId),
        or(isNull(promotionDeals.paymentStatus), not(eq(promotionDeals.paymentStatus, "paid"))),
      ))
      .returning();

    if (updated) return { deal: updated, newlyPaid: true };
    const current = await this.getPromotionDeal(dealId);
    return current ? { deal: current, newlyPaid: false } : undefined;
  }

  // Admin Promoter Management Methods
  async getAllPromoters(): Promise<User[]> {
    const [bookingPromoters, sharingPromoters] = await Promise.all([
      db
        .selectDistinct({ promoterId: bookings.promoterId })
        .from(bookings)
        .where(isNotNull(bookings.promoterId)),
      db
        .selectDistinct({ promoterId: promoterExperiences.promoterId })
        .from(promoterExperiences),
    ]);
    const activePromoterIds = Array.from(new Set(
      [...bookingPromoters, ...sharingPromoters]
        .map(row => row.promoterId)
        .filter((id): id is string => !!id),
    ));

    return db
      .select()
      .from(users)
      .where(or(
        eq(users.role, 'promoter'),
        isNotNull(users.promoterCode),
        ...(activePromoterIds.length > 0 ? [inArray(users.id, activePromoterIds)] : []),
      ))
      .orderBy(desc(users.updatedAt));
  }

  async getPromoterBookingsWithDetails(promoterId: string): Promise<Array<{
    booking: Booking;
    experience: Experience;
    participant: User | undefined;
  }>> {
    const promoterBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.promoterId, promoterId))
      .orderBy(desc(bookings.createdAt));
    
    const result: Array<{
      booking: Booking;
      experience: Experience;
      participant: User | undefined;
    }> = [];
    
    for (const booking of promoterBookings) {
      const [experience] = await db.select().from(experiences).where(eq(experiences.id, booking.experienceId));
      const [participant] = booking.userId ? await db.select().from(users).where(eq(users.id, booking.userId)) : [undefined];
      
      if (experience) {
        result.push({
          booking,
          experience,
          participant,
        });
      }
    }
    
    return result;
  }

  // ── Split Recipients ─────────────────────────────────────────────────────

  async createSplitRecipients(recipients: InsertSplitRecipient[]): Promise<SplitRecipient[]> {
    if (recipients.length === 0) return [];
    return db.insert(splitRecipients).values(recipients).returning();
  }

  async getSplitRecipientsByExperience(experienceId: string): Promise<SplitRecipient[]> {
    return db
      .select()
      .from(splitRecipients)
      .where(and(eq(splitRecipients.experienceId, experienceId), eq(splitRecipients.isActive, true)))
      .orderBy(asc(splitRecipients.priority));
  }

  async deleteSplitRecipientsByExperience(experienceId: string): Promise<void> {
    await db.delete(splitRecipients).where(eq(splitRecipients.experienceId, experienceId));
  }

  // ── Scheduled Payouts ────────────────────────────────────────────────────

  async upsertScheduledPayout(experienceId: string, scheduledFor: Date, totalGrossCents: number): Promise<ScheduledPayout> {
    const existing = await this.getScheduledPayoutByExperience(experienceId);
    if (existing) {
      const [updated] = await db
        .update(scheduledPayouts)
        .set({ scheduledFor, totalGrossAmountCents: totalGrossCents, updatedAt: new Date() })
        .where(eq(scheduledPayouts.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(scheduledPayouts)
      .values({ experienceId, scheduledFor, totalGrossAmountCents: totalGrossCents })
      .returning();
    return created;
  }

  async addScheduledPayoutAdditionalGross(
    experienceId: string,
    scheduledFor: Date,
    amountCents: number,
  ): Promise<ScheduledPayout> {
    const existing = await this.getScheduledPayoutByExperience(experienceId);
    if (existing) {
      const [updated] = await db
        .update(scheduledPayouts)
        .set({
          scheduledFor,
          status: "pending",
          additionalGrossAmountCents: sql`COALESCE(${scheduledPayouts.additionalGrossAmountCents}, 0) + ${amountCents}`,
          updatedAt: new Date(),
        })
        .where(eq(scheduledPayouts.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(scheduledPayouts)
      .values({
        experienceId,
        scheduledFor,
        totalGrossAmountCents: 0,
        additionalGrossAmountCents: amountCents,
      })
      .returning();
    return created;
  }

  async getScheduledPayoutByExperience(experienceId: string): Promise<ScheduledPayout | undefined> {
    const [payout] = await db
      .select()
      .from(scheduledPayouts)
      .where(eq(scheduledPayouts.experienceId, experienceId));
    return payout;
  }

  async updateScheduledPayout(id: string, updates: Partial<ScheduledPayout>): Promise<ScheduledPayout> {
    const [updated] = await db
      .update(scheduledPayouts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scheduledPayouts.id, id))
      .returning();
    return updated;
  }

  async getExperiencesReadyForPayout(): Promise<{ experienceId: string; scheduledPayoutId: string; presetGrossCents: number; additionalGrossCents: number }[]> {
    const now = new Date();
    const rows = await db
      .select({
        experienceId: scheduledPayouts.experienceId,
        scheduledPayoutId: scheduledPayouts.id,
        presetGrossCents: scheduledPayouts.totalGrossAmountCents,
        additionalGrossCents: scheduledPayouts.additionalGrossAmountCents,
      })
      .from(scheduledPayouts)
      .where(
        and(
          eq(scheduledPayouts.status, "pending"),
          sql`${scheduledPayouts.scheduledFor} <= ${now}`
        )
      );
    return rows.map(r => ({
      ...r,
      presetGrossCents: r.presetGrossCents ?? 0,
      additionalGrossCents: r.additionalGrossCents ?? 0,
    }));
  }
}

export const storage = new DatabaseStorage();
