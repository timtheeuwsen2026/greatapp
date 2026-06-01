import {
  users,
  experiences,
  bookings,
  reviews,
  experienceGallery,
  venues,
  serviceProviders,
  experienceVenues,
  experienceServices,
  participantConnections,
  experienceMessages,
  participantProfiles,
  experienceAnnouncements,
  participantReactions,

  type User,
  type UpsertUser,
  type Experience,
  type InsertExperience,
  type Booking,
  type InsertBooking,
  type Review,
  type InsertReview,
  type Venue,
  type InsertVenue,
  type ServiceProvider,
  type InsertServiceProvider,
  type ExperienceVenue,
  type InsertExperienceVenue,
  type ExperienceService,
  type InsertExperienceService,
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

} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, count } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUserStripeInfo(userId: string, customerId: string, subscriptionId?: string): Promise<User>;

  // Experience operations
  createExperience(experience: InsertExperience): Promise<Experience>;
  getExperience(id: string): Promise<Experience | undefined>;
  getExperiences(options?: { category?: string; status?: string; limit?: number }): Promise<Experience[]>;
  updateExperience(id: string, updates: Partial<InsertExperience>): Promise<Experience>;
  deleteExperience(id: string): Promise<void>;
  
  // Admin operations
  getPendingExperiences(): Promise<Experience[]>;
  approveExperience(id: string): Promise<Experience>;
  rejectExperience(id: string): Promise<Experience>;

  // Booking operations
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByExperience(experienceId: string): Promise<Booking[]>;
  getBookingsByUser(userId: string): Promise<Booking[]>;
  updateBookingStatus(id: string, status: string): Promise<Booking>;

  // Review operations
  createReview(review: InsertReview): Promise<Review>;
  getReviewsByExperience(experienceId: string): Promise<Review[]>;

  // Statistics
  getExperienceStats(experienceId: string): Promise<{ participantCount: number; averageRating: number }>;

  // Venue operations
  createVenue(venue: InsertVenue): Promise<Venue>;
  getVenue(id: string): Promise<Venue | undefined>;
  getVenues(options?: { approved?: boolean; location?: string }): Promise<Venue[]>;
  updateVenue(id: string, updates: Partial<InsertVenue>): Promise<Venue>;
  approveVenue(id: string): Promise<Venue>;
  rejectVenue(id: string): Promise<void>;

  // Service operations
  createService(service: InsertService): Promise<Service>;
  getService(id: string): Promise<Service | undefined>;
  getServices(options?: { approved?: boolean; type?: string; location?: string }): Promise<Service[]>;
  updateService(id: string, updates: Partial<InsertService>): Promise<Service>;
  approveService(id: string): Promise<Service>;
  rejectService(id: string): Promise<void>;

  // Experience venue/service assignment
  assignVenueToExperience(data: InsertExperienceVenue): Promise<ExperienceVenue>;
  assignServiceToExperience(data: InsertExperienceService): Promise<ExperienceService>;
  getExperienceVenues(experienceId: string): Promise<Venue[]>;
  getExperienceServices(experienceId: string): Promise<Service[]>;

  // Participant interaction operations
  createParticipantConnection(connection: InsertParticipantConnection): Promise<ParticipantConnection>;
  getParticipantConnections(userId: string, experienceId?: string): Promise<ParticipantConnection[]>;
  updateConnectionStatus(connectionId: string, status: string): Promise<ParticipantConnection>;
  
  // Messaging operations
  createMessage(message: InsertExperienceMessage): Promise<ExperienceMessage>;
  getMessages(experienceId: string, isPrivate?: boolean): Promise<ExperienceMessage[]>;
  getPrivateMessages(experienceId: string, userId: string, recipientId: string): Promise<ExperienceMessage[]>;
  
  // Participant profile operations
  createOrUpdateProfile(profile: InsertParticipantProfile): Promise<ParticipantProfile>;
  getProfile(userId: string): Promise<ParticipantProfile | undefined>;
  getProfilesByExperience(experienceId: string): Promise<ParticipantProfile[]>;
  
  // Announcement operations
  createAnnouncement(announcement: InsertExperienceAnnouncement): Promise<ExperienceAnnouncement>;
  getAnnouncements(experienceId: string): Promise<ExperienceAnnouncement[]>;
  
  // Reaction operations
  createReaction(reaction: InsertParticipantReaction): Promise<ParticipantReaction>;
  getReactions(messageId: string): Promise<ParticipantReaction[]>;
  removeReaction(messageId: string, userId: string): Promise<void>;

  // Creator profile operations
  createOrUpdateCreatorProfile(profile: InsertCreatorProfile): Promise<CreatorProfile>;
  getCreatorProfile(userId: string): Promise<CreatorProfile | undefined>;
  getCreatorExperiences(creatorId: string): Promise<Experience[]>;

  // Creator analytics operations
  getCreatorAnalytics(creatorId: string, period: string): Promise<CreatorAnalytic[]>;
  getCreatorEarnings(creatorId: string, period: string): Promise<CreatorEarning[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
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

  // Experience operations
  async createExperience(experience: InsertExperience): Promise<Experience> {
    const [newExperience] = await db
      .insert(experiences)
      .values(experience)
      .returning();
    return newExperience;
  }

  async getExperience(id: string): Promise<Experience | undefined> {
    const [experience] = await db
      .select()
      .from(experiences)
      .where(eq(experiences.id, id));
    return experience;
  }

  async getExperiences(options?: { category?: string; status?: string; limit?: number }): Promise<Experience[]> {
    let query = db.select().from(experiences);
    
    const conditions = [];
    if (options?.category) {
      conditions.push(eq(experiences.category, options.category as any));
    }
    if (options?.status) {
      conditions.push(eq(experiences.status, options.status as any));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(experiences.createdAt));

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    return await query;
  }

  async updateExperience(id: string, updates: Partial<InsertExperience>): Promise<Experience> {
    const [experience] = await db
      .update(experiences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  async deleteExperience(id: string): Promise<void> {
    await db.delete(experiences).where(eq(experiences.id, id));
  }

  // Admin operations
  async getPendingExperiences(): Promise<Experience[]> {
    return await db
      .select()
      .from(experiences)
      .where(eq(experiences.status, "pending_approval"))
      .orderBy(desc(experiences.createdAt));
  }

  async approveExperience(id: string): Promise<Experience> {
    const [experience] = await db
      .update(experiences)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  async rejectExperience(id: string): Promise<Experience> {
    const [experience] = await db
      .update(experiences)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(experiences.id, id))
      .returning();
    return experience;
  }

  // Booking operations
  async createBooking(booking: InsertBooking): Promise<Booking> {
    const [newBooking] = await db
      .insert(bookings)
      .values(booking)
      .returning();

    // Update participant count
    await db
      .update(experiences)
      .set({
        currentParticipants: sql`${experiences.currentParticipants} + 1`,
        updatedAt: new Date()
      })
      .where(eq(experiences.id, booking.experienceId));

    return newBooking;
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));
    return booking;
  }

  async getBookingsByExperience(experienceId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.experienceId, experienceId))
      .orderBy(desc(bookings.createdAt));
  }

  async getBookingsByUser(userId: string): Promise<Booking[]> {
    return await db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.createdAt));
  }

  async updateBookingStatus(id: string, status: string): Promise<Booking> {
    const [booking] = await db
      .update(bookings)
      .set({ status })
      .where(eq(bookings.id, id))
      .returning();
    return booking;
  }

  // Review operations
  async createReview(review: InsertReview): Promise<Review> {
    const [newReview] = await db
      .insert(reviews)
      .values(review)
      .returning();
    return newReview;
  }

  async getReviewsByExperience(experienceId: string): Promise<Review[]> {
    return await db
      .select()
      .from(reviews)
      .where(eq(reviews.experienceId, experienceId))
      .orderBy(desc(reviews.createdAt));
  }

  // Statistics
  async getExperienceStats(experienceId: string): Promise<{ participantCount: number; averageRating: number }> {
    const [participantCount] = await db
      .select({ count: count() })
      .from(bookings)
      .where(and(eq(bookings.experienceId, experienceId), eq(bookings.status, "confirmed")));

    const [avgRating] = await db
      .select({ avg: sql<number>`AVG(${reviews.rating})` })
      .from(reviews)
      .where(eq(reviews.experienceId, experienceId));

    return {
      participantCount: participantCount.count,
      averageRating: avgRating.avg || 0,
    };
  }

  // Venue operations
  async createVenue(venue: InsertVenue): Promise<Venue> {
    const [newVenue] = await db
      .insert(venues)
      .values(venue)
      .returning();
    return newVenue;
  }

  async getVenue(id: string): Promise<Venue | undefined> {
    const [venue] = await db
      .select()
      .from(venues)
      .where(eq(venues.id, id));
    return venue;
  }

  async getVenues(options?: { approved?: boolean; location?: string }): Promise<Venue[]> {
    let query = db.select().from(venues);
    
    if (options?.approved !== undefined) {
      query = query.where(eq(venues.approved, options.approved));
    }
    
    if (options?.location) {
      query = query.where(eq(venues.location, options.location));
    }
    
    return await query.orderBy(desc(venues.createdAt));
  }

  async updateVenue(id: string, updates: Partial<InsertVenue>): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async approveVenue(id: string): Promise<Venue> {
    const [venue] = await db
      .update(venues)
      .set({ approved: true, updatedAt: new Date() })
      .where(eq(venues.id, id))
      .returning();
    return venue;
  }

  async rejectVenue(id: string): Promise<void> {
    await db
      .delete(venues)
      .where(eq(venues.id, id));
  }

  // Service operations
  async createService(service: InsertService): Promise<Service> {
    const [newService] = await db
      .insert(services)
      .values(service)
      .returning();
    return newService;
  }

  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db
      .select()
      .from(services)
      .where(eq(services.id, id));
    return service;
  }

  async getServices(options?: { approved?: boolean; type?: string; location?: string }): Promise<Service[]> {
    let query = db.select().from(services);
    
    if (options?.approved !== undefined) {
      query = query.where(eq(services.approved, options.approved));
    }
    
    if (options?.type) {
      query = query.where(eq(services.type, options.type as any));
    }
    
    if (options?.location) {
      query = query.where(eq(services.location, options.location));
    }
    
    return await query.orderBy(desc(services.createdAt));
  }

  async updateService(id: string, updates: Partial<InsertService>): Promise<Service> {
    const [service] = await db
      .update(services)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();
    return service;
  }

  async approveService(id: string): Promise<Service> {
    const [service] = await db
      .update(services)
      .set({ approved: true, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();
    return service;
  }

  async rejectService(id: string): Promise<void> {
    await db
      .delete(services)
      .where(eq(services.id, id));
  }

  // Experience venue/service assignment
  async assignVenueToExperience(data: InsertExperienceVenue): Promise<ExperienceVenue> {
    const [assignment] = await db
      .insert(experienceVenues)
      .values(data)
      .returning();
    return assignment;
  }

  async assignServiceToExperience(data: InsertExperienceService): Promise<ExperienceService> {
    const [assignment] = await db
      .insert(experienceServices)
      .values(data)
      .returning();
    return assignment;
  }

  async getExperienceVenues(experienceId: string): Promise<Venue[]> {
    const result = await db
      .select({ venue: venues })
      .from(experienceVenues)
      .innerJoin(venues, eq(experienceVenues.venueId, venues.id))
      .where(eq(experienceVenues.experienceId, experienceId));
    
    return result.map(r => r.venue);
  }

  async getExperienceServices(experienceId: string): Promise<Service[]> {
    const result = await db
      .select({ service: services })
      .from(experienceServices)
      .innerJoin(services, eq(experienceServices.serviceId, services.id))
      .where(eq(experienceServices.experienceId, experienceId));
    
    return result.map(r => r.service);
  }

  // Participant interaction operations
  async createParticipantConnection(connection: InsertParticipantConnection): Promise<ParticipantConnection> {
    const [newConnection] = await db
      .insert(participantConnections)
      .values(connection)
      .returning();
    return newConnection;
  }

  async getParticipantConnections(userId: string, experienceId?: string): Promise<ParticipantConnection[]> {
    const conditions = experienceId 
      ? and(eq(participantConnections.userId, userId), eq(participantConnections.experienceId, experienceId))
      : eq(participantConnections.userId, userId);
    
    return await db
      .select()
      .from(participantConnections)
      .where(conditions)
      .orderBy(desc(participantConnections.createdAt));
  }

  async updateConnectionStatus(connectionId: string, status: string): Promise<ParticipantConnection> {
    const [connection] = await db
      .update(participantConnections)
      .set({ status })
      .where(eq(participantConnections.id, connectionId))
      .returning();
    return connection;
  }

  // Messaging operations
  async createMessage(message: InsertExperienceMessage): Promise<ExperienceMessage> {
    const [newMessage] = await db
      .insert(experienceMessages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getMessages(experienceId: string, isPrivate?: boolean): Promise<ExperienceMessage[]> {
    const conditions = isPrivate !== undefined 
      ? and(eq(experienceMessages.experienceId, experienceId), eq(experienceMessages.isPrivate, isPrivate))
      : eq(experienceMessages.experienceId, experienceId);
    
    return await db
      .select()
      .from(experienceMessages)
      .where(conditions)
      .orderBy(experienceMessages.createdAt);
  }

  async getPrivateMessages(experienceId: string, userId: string, recipientId: string): Promise<ExperienceMessage[]> {
    return await db
      .select()
      .from(experienceMessages)
      .where(
        and(
          eq(experienceMessages.experienceId, experienceId),
          eq(experienceMessages.isPrivate, true),
          and(
            eq(experienceMessages.userId, userId),
            eq(experienceMessages.recipientId, recipientId)
          )
        )
      )
      .orderBy(experienceMessages.createdAt);
  }

  // Participant profile operations
  async createOrUpdateProfile(profile: InsertParticipantProfile): Promise<ParticipantProfile> {
    const [newProfile] = await db
      .insert(participantProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: participantProfiles.userId,
        set: {
          ...profile,
          updatedAt: new Date(),
        },
      })
      .returning();
    return newProfile;
  }

  async getProfile(userId: string): Promise<ParticipantProfile | undefined> {
    const [profile] = await db
      .select()
      .from(participantProfiles)
      .where(eq(participantProfiles.userId, userId));
    return profile;
  }

  async getProfilesByExperience(experienceId: string): Promise<ParticipantProfile[]> {
    const profilesWithBookings = await db
      .select()
      .from(participantProfiles)
      .innerJoin(bookings, eq(participantProfiles.userId, bookings.userId))
      .where(
        and(
          eq(bookings.experienceId, experienceId),
          eq(participantProfiles.isVisible, true),
          eq(bookings.status, "confirmed")
        )
      );
    
    return profilesWithBookings.map(item => item.participant_profiles);
  }

  // Announcement operations
  async createAnnouncement(announcement: InsertExperienceAnnouncement): Promise<ExperienceAnnouncement> {
    const [newAnnouncement] = await db
      .insert(experienceAnnouncements)
      .values(announcement)
      .returning();
    return newAnnouncement;
  }

  async getAnnouncements(experienceId: string): Promise<ExperienceAnnouncement[]> {
    return await db
      .select()
      .from(experienceAnnouncements)
      .where(eq(experienceAnnouncements.experienceId, experienceId))
      .orderBy(desc(experienceAnnouncements.createdAt));
  }

  // Reaction operations
  async createReaction(reaction: InsertParticipantReaction): Promise<ParticipantReaction> {
    // First try to upsert - remove existing reaction if it exists, then add new one
    await db
      .delete(participantReactions)
      .where(
        and(
          eq(participantReactions.messageId, reaction.messageId),
          eq(participantReactions.userId, reaction.userId)
        )
      );

    const [newReaction] = await db
      .insert(participantReactions)
      .values(reaction)
      .returning();
    return newReaction;
  }

  async getReactions(messageId: string): Promise<ParticipantReaction[]> {
    return await db
      .select()
      .from(participantReactions)
      .where(eq(participantReactions.messageId, messageId))
      .orderBy(participantReactions.createdAt);
  }

  async removeReaction(messageId: string, userId: string): Promise<void> {
    await db
      .delete(participantReactions)
      .where(
        and(
          eq(participantReactions.messageId, messageId),
          eq(participantReactions.userId, userId)
        )
      );
  }

  // Creator profile operations
  async createOrUpdateCreatorProfile(profile: InsertCreatorProfile): Promise<CreatorProfile> {
    const [newProfile] = await db
      .insert(creatorProfiles)
      .values(profile)
      .onConflictDoUpdate({
        target: creatorProfiles.userId,
        set: {
          ...profile,
          updatedAt: new Date(),
        },
      })
      .returning();
    return newProfile;
  }

  async getCreatorProfile(userId: string): Promise<CreatorProfile | undefined> {
    const [profile] = await db
      .select()
      .from(creatorProfiles)
      .where(eq(creatorProfiles.userId, userId));
    return profile;
  }

  async getCreatorExperiences(creatorId: string): Promise<Experience[]> {
    return await db
      .select()
      .from(experiences)
      .where(eq(experiences.creatorId, creatorId))
      .orderBy(desc(experiences.createdAt));
  }

  // Creator analytics operations
  async getCreatorAnalytics(creatorId: string, period: string): Promise<CreatorAnalytic[]> {
    const startDate = new Date();
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    return await db
      .select()
      .from(creatorAnalytics)
      .where(
        and(
          eq(creatorAnalytics.creatorId, creatorId),
          sql`${creatorAnalytics.date} >= ${startDate.toISOString().split('T')[0]}`
        )
      )
      .orderBy(desc(creatorAnalytics.date));
  }

  async getCreatorEarnings(creatorId: string, period: string): Promise<CreatorEarning[]> {
    const startDate = new Date();
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    return await db
      .select()
      .from(creatorEarnings)
      .where(
        and(
          eq(creatorEarnings.creatorId, creatorId),
          sql`${creatorEarnings.createdAt} >= ${startDate.toISOString()}`
        )
      )
      .orderBy(desc(creatorEarnings.createdAt));
  }
}

export const storage = new DatabaseStorage();
