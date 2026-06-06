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
  experienceServices,
  experienceAmenities,
  amenities,
  participantConnections,
  experienceMessages,
  participantProfiles,
  experienceAnnouncements,
  participantReactions,
  promoterExperiences,
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
  experienceDrafts,
  type ExperienceDraft,
  type InsertExperienceDraft,
  reservations,
  type Reservation,
  type InsertReservation,
  referralClicks,
  experienceMessages,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, sql, count, inArray, asc, not, isNull } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPromoterCode(code: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserRole(id: string, role: string): Promise<User>;
  addUserRole(id: string, role: string): Promise<User>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User>;
  setUserReferrer(userId: string, promoterId: string): Promise<User>;
  ensureUserReferralCode(userId: string): Promise<string>;

  // Experience operations
  createExperience(experience: InsertExperience): Promise<Experience>;
  getExperience(id: string): Promise<Experience | undefined>;
  getExperienceBySlug(slug: string): Promise<Experience | undefined>;
  getAllExperiences(): Promise<Experience[]>;
  getExperiences(options?: { category?: string; status?: string; limit?: number }): Promise<Experience[]>;
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
  recordReferralClick(data: { promoterCode: string; promoterId: string; experienceId: string | null; visitorUserId: string | null; ipHash: string | null; userAgent: string | null }): Promise<void>;
  markReferralClickConverted(promoterCode: string, bookingId: string): Promise<void>;
  getReferralClickStats(promoterId: string): Promise<{ totalClicks: number; uniqueClicks: number; conversions: number; conversionRate: number }>;
  createExperienceMessage(data: { experienceId: string; userId: string; message: string; messageType?: string }): Promise<void>;
  deleteExperience(id: string): Promise<void>;
  
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
  createGroupMessage(message: InsertCommunityGroupMessage): Promise<CommunityGroupMessage>;
  getGroupMessages(groupId: string): Promise<CommunityGroupMessage[]>;
  getCommunityEvents(): Promise<CommunityEvent[]>;
  getFeaturedMembers(): Promise<ParticipantProfile[]>;

  // Promoter dashboard operations
  getPromoterBookings(promoterId: string): Promise<Booking[]>;
  getPromoterEarningsSummary(promoterId: string): Promise<{
    byCurrency: Array<{
      currency: string;
      estimated: number;
      locked: number;
      voided: number;
      totalBookings: number;
    }>;
  }>;
  getPromoterExperiences(promoterId: string): Promise<Array<{
    experience: Experience;
    spotsBooked: number;
    estimatedCommission: number;
    lockedCommission: number;
    currency: string;
  }>>;

  // Admin promoter management operations
  getAllPromoters(): Promise<User[]>;
  getPromoterBookingsWithDetails(promoterId: string): Promise<Array<{
    booking: Booking;
    experience: Experience;
    participant: User | undefined;
  }>>;
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
      .set({ role, userRoles: [role], updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async addUserRole(id: string, role: string): Promise<User> {
    // Add role to userRoles array if not already present (multi-role support)
    const currentUser = await this.getUser(id);
    if (!currentUser) {
      throw new Error("User not found");
    }
    
    const currentRoles = currentUser.userRoles || [];
    if (!currentRoles.includes(role)) {
      const [user] = await db
        .update(users)
        .set({ 
          userRoles: [...currentRoles, role],
          updatedAt: new Date() 
        })
        .where(eq(users.id, id))
        .returning();
      return user;
    }
    return currentUser;
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
    const [experience] = await db.insert(experiences).values([experienceData]).returning();
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

    // Batch-load participant profiles with user avatar URLs and names
    const participantProfilesData = await db
      .select({
        userId: users.id,
        avatarUrl: participantProfiles.avatarUrl,
        displayName: participantProfiles.displayName,
        firstName: users.firstName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(participantProfiles)
      .innerJoin(users, eq(participantProfiles.userId, users.id))
      .where(inArray(participantProfiles.userId, allUserIds));

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
        .filter((p): p is NonNullable<typeof p> => p !== null && (p.displayName !== null || p.firstName !== null)) // Only include participants with names
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
    const updateData = { ...updates, updatedAt: new Date() } as any;
    const [experience] = await db
      .update(experiences)
      .set(updateData)
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  async updateExperienceStatus(id: string, status: string): Promise<void> {
    await db.update(experiences).set({ status: status as any, updatedAt: new Date() }).where(eq(experiences.id, id));
  }

  async getExperiencesByVenueIds(venueIds: string[], status?: string): Promise<Experience[]> {
    if (!venueIds.length) return [];
    const rows = await db.select().from(experiences)
      .where(inArray((experiences as any).linkedVenueId, venueIds));
    if (status) return rows.filter((e: any) => e.status === status);
    return rows;
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
    visitorUserId: string | null;
    ipHash: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await db.insert(referralClicks).values({
      promoterCode: data.promoterCode,
      promoterId: data.promoterId,
      experienceId: data.experienceId,
      visitorUserId: data.visitorUserId,
      ipHash: data.ipHash,
      userAgent: data.userAgent,
    });
  }

  async markReferralClickConverted(promoterCode: string, bookingId: string): Promise<void> {
    // Mark the most recent unconverted click for this code as converted
    const [click] = await db
      .select()
      .from(referralClicks)
      .where(and(eq(referralClicks.promoterCode, promoterCode), eq(referralClicks.converted, false)))
      .orderBy(desc(referralClicks.clickedAt))
      .limit(1);

    if (click) {
      await db
        .update(referralClicks)
        .set({ converted: true, bookingId, convertedAt: new Date() })
        .where(eq(referralClicks.id, click.id));
    }
  }

  async getReferralClickStats(promoterId: string): Promise<{
    totalClicks: number;
    uniqueClicks: number;
    conversions: number;
    conversionRate: number;
  }> {
    const clicks = await db
      .select()
      .from(referralClicks)
      .where(eq(referralClicks.promoterId, promoterId));

    const totalClicks = clicks.length;
    const uniqueIps = new Set(clicks.map(c => c.ipHash).filter(Boolean)).size;
    const conversions = clicks.filter(c => c.converted).length;
    return {
      totalClicks,
      uniqueClicks: uniqueIps,
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
        updatedAt: new Date() 
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
    const totalSeats = allBookings.filter(b => b.status === "confirmed" || b.status === "pending").length;
    
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
          inArray(bookings.status, ['deposit_authorized', 'confirmed', 'pending']),
          isNull(bookings.cancelledAt)
        )
      );
    
    const current_participants = validBookings.length;
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
        updatedAt: new Date() 
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

  async getProfilesByExperience(experienceId: string, requestingUserId?: string): Promise<ParticipantProfile[]> {
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

      // Get participants from bookings and then their profiles
      const bookingUsers = await db
        .select({ userId: bookings.userId })
        .from(bookings)
        .where(
          and(
            eq(bookings.experienceId, experienceId),
            eq(bookings.status, "confirmed")
          )
        );
      
      if (bookingUsers.length === 0) return [];
      
      const userIds = bookingUsers.map(b => b.userId);
      return await db.select().from(participantProfiles).where(
        inArray(participantProfiles.userId, userIds)
      );
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

  async getCreatorEarnings(userId: string): Promise<any> {
    return {
      totalEarnings: 0,
      monthlyEarnings: 0,
      pendingPayouts: 0,
      completedPayouts: 0,
      earningsHistory: [],
    };
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
  async getPromoterBookings(promoterId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.promoterId, promoterId))
      .orderBy(desc(bookings.bookingDate));
  }

  async getPromoterEarningsSummary(promoterId: string): Promise<{
    byCurrency: Array<{
      currency: string;
      estimated: number;
      locked: number;
      voided: number;
      totalBookings: number;
    }>;
  }> {
    const promoterBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.promoterId, promoterId));
    
    // Group by currency and SUM stored commission amounts (no recalculation)
    // Uses ONLY stored booking data: commissionAmount, commissionCurrency, commissionStatus
    const currencyMap = new Map<string, { estimated: number; locked: number; voided: number; totalBookings: number }>();
    
    for (const booking of promoterBookings) {
      const currency = booking.commissionCurrency || 'EUR';
      // Use stored commission amount directly (calculated at booking time)
      const amount = parseFloat(booking.commissionAmount || '0');
      const status = booking.commissionStatus || 'estimated';
      
      if (!currencyMap.has(currency)) {
        currencyMap.set(currency, { estimated: 0, locked: 0, voided: 0, totalBookings: 0 });
      }
      
      const entry = currencyMap.get(currency)!;
      entry.totalBookings++; // Each booking = 1 spot (current data model)
      
      if (status === 'estimated') {
        entry.estimated += amount;
      } else if (status === 'locked') {
        entry.locked += amount;
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
    experience: Experience;
    spotsBooked: number;
    estimatedCommission: number;
    lockedCommission: number;
    currency: string;
  }>> {
    // Get all experiences the promoter is actively promoting
    const promotedExperienceIds = await this.getPromoterPromotedExperienceIds(promoterId);
    
    // Get all bookings for this promoter
    const promoterBookings = await db
      .select()
      .from(bookings)
      .where(eq(bookings.promoterId, promoterId));
    
    // Build booking stats by (experience, currency)
    const bookingStatsMap = new Map<string, { 
      spotsBooked: number; 
      estimatedCommission: number; 
      lockedCommission: number; 
      currency: string;
    }>();
    
    for (const booking of promoterBookings) {
      const expId = booking.experienceId;
      const currency = booking.commissionCurrency || 'EUR';
      const amount = parseFloat(booking.commissionAmount || '0');
      const status = booking.commissionStatus || 'estimated';
      
      const key = `${expId}:${currency}`;
      if (!bookingStatsMap.has(key)) {
        bookingStatsMap.set(key, { 
          spotsBooked: 0, 
          estimatedCommission: 0, 
          lockedCommission: 0, 
          currency 
        });
      }
      
      const entry = bookingStatsMap.get(key)!;
      entry.spotsBooked++;
      
      if (status === 'estimated') {
        entry.estimatedCommission += amount;
      } else if (status === 'locked') {
        entry.lockedCommission += amount;
      }
    }
    
    // Build result: include ALL promoted experiences (even without bookings)
    const result: Array<{
      experience: Experience;
      spotsBooked: number;
      estimatedCommission: number;
      lockedCommission: number;
      currency: string;
    }> = [];
    
    const seenExperienceIds = new Set<string>();
    
    // First, add promoted experiences (from promoter_experiences table)
    for (const expId of promotedExperienceIds) {
      const [experience] = await db.select().from(experiences).where(eq(experiences.id, expId));
      if (experience) {
        seenExperienceIds.add(expId);
        // Check if we have booking stats for this experience
        const currency = experience.currency || 'EUR';
        const key = `${expId}:${currency}`;
        const stats = bookingStatsMap.get(key);
        
        result.push({
          experience,
          spotsBooked: stats?.spotsBooked || 0,
          estimatedCommission: stats?.estimatedCommission || 0,
          lockedCommission: stats?.lockedCommission || 0,
          currency,
        });
      }
    }
    
    // Also add any experiences from bookings that aren't in the promoter_experiences table yet
    // (legacy bookings from before this feature, or direct referrals)
    for (const [key, stats] of bookingStatsMap.entries()) {
      const expId = key.split(':')[0];
      if (!seenExperienceIds.has(expId)) {
        const [experience] = await db.select().from(experiences).where(eq(experiences.id, expId));
        if (experience) {
          result.push({
            experience,
            spotsBooked: stats.spotsBooked,
            estimatedCommission: stats.estimatedCommission,
            lockedCommission: stats.lockedCommission,
            currency: stats.currency,
          });
        }
      }
    }
    
    // Sort by startDate ASC (closest first), then createdAt DESC (matches homepage ordering)
    result.sort((a, b) => {
      const aStart = a.experience.startDate ? new Date(a.experience.startDate).getTime() : Infinity;
      const bStart = b.experience.startDate ? new Date(b.experience.startDate).getTime() : Infinity;
      if (aStart !== bStart) {
        return aStart - bStart; // Closest date first
      }
      const aCreated = a.experience.createdAt ? new Date(a.experience.createdAt).getTime() : 0;
      const bCreated = b.experience.createdAt ? new Date(b.experience.createdAt).getTime() : 0;
      return bCreated - aCreated; // Newest created first as tiebreaker
    });
    
    return result;
  }

  // Experience Pool Methods
  async getPromotableExperiences(): Promise<Experience[]> {
    // Get approved/published experiences - matches homepage logic exactly
    // DO NOT filter by promoterEnabled - all approved/published experiences are promotable
    // Ordering: startDate ASC (closest first), then createdAt DESC (newest upload as tiebreaker)
    return await db
      .select()
      .from(experiences)
      .where(
        or(eq(experiences.status, 'approved'), eq(experiences.status, 'published'))
      )
      .orderBy(asc(experiences.startDate), desc(experiences.createdAt));
  }

  async getPromoterPromotedExperienceIds(promoterId: string): Promise<string[]> {
    const results = await db
      .select({ experienceId: promoterExperiences.experienceId })
      .from(promoterExperiences)
      .where(eq(promoterExperiences.promoterId, promoterId));
    return results.map(r => r.experienceId);
  }

  async promoteExperience(promoterId: string, experienceId: string): Promise<void> {
    await db.insert(promoterExperiences).values({
      promoterId,
      experienceId,
    }).onConflictDoNothing();
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

  // Admin Promoter Management Methods
  async getAllPromoters(): Promise<User[]> {
    // Get all users who have 'promoter' in their userRoles array
    const allUsers = await db.select().from(users);
    return allUsers.filter(user => {
      const roles = user.userRoles || [];
      return roles.includes('promoter');
    });
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
}

export const storage = new DatabaseStorage();
