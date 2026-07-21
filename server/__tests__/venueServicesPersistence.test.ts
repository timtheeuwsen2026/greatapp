import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../db';
import { venues } from '@shared/schema';
import { eq } from 'drizzle-orm';

const databaseAvailable = !!process.env.DATABASE_URL
  && !process.env.DATABASE_URL.includes('test:test@localhost');

describe.runIf(databaseAvailable)('Venue Services Persistence', () => {
  const testVenueId = 'test-venue-services-' + Date.now();
  const testUserId = '45788955'; // Development user ID
  
  beforeAll(async () => {
    // Clean up any existing test venues
    await db.delete(venues).where(eq(venues.id, testVenueId));
  });
  
  afterAll(async () => {
    // Clean up test venue
    await db.delete(venues).where(eq(venues.id, testVenueId));
  });

  it('should save venue services to database on create', async () => {
    // Arrange: Create venue data with services
    const venueData = {
      id: testVenueId,
      name: 'Test Venue with Services',
      city: 'Test City',
      description: 'A test venue to verify that services are properly persisted to the database when creating a new venue',
      capacity: 50,
      location: '123 Test Street, Test City, TC 12345',
      slug: 'test-venue-services-' + Date.now(),
      createdBy: testUserId,
      services: [
        {
          id: 'svc-1',
          title: 'Catering Service',
          description: 'Full service catering with organic ingredients and custom menu planning for all dietary requirements',
          price: 45.99,
          frequency: 'per_person' as const,
          quantity: 100,
        },
        {
          id: 'svc-2',
          title: 'Audio Visual Equipment',
          description: 'Professional AV equipment including projectors, sound systems, microphones, and technical support',
          price: 200.00,
          frequency: 'per_day' as const,
          quantity: 5,
        },
        {
          id: 'svc-3',
          title: 'Yoga Session',
          description: 'Guided yoga sessions with certified instructors, suitable for all experience levels and ages',
          price: 25.50,
          frequency: 'per_person' as const,
        },
      ],
    };

    // Act: Insert venue into database
    const [createdVenue] = await db.insert(venues).values(venueData).returning();

    // Assert: Verify venue was created
    expect(createdVenue).toBeDefined();
    expect(createdVenue.id).toBe(testVenueId);
    
    // Assert: Verify services were saved
    expect(createdVenue.services).toBeDefined();
    expect(Array.isArray(createdVenue.services)).toBe(true);
    expect(createdVenue.services).toHaveLength(3);
    
    // Assert: Verify first service details
    const firstService = (createdVenue.services as any)[0];
    expect(firstService.title).toBe('Catering Service');
    expect(firstService.description).toContain('organic ingredients');
    expect(firstService.price).toBe(45.99);
    expect(firstService.frequency).toBe('per_person');
    expect(firstService.quantity).toBe(100);
    
    // Assert: Verify second service details
    const secondService = (createdVenue.services as any)[1];
    expect(secondService.title).toBe('Audio Visual Equipment');
    expect(secondService.price).toBe(200.00);
    expect(secondService.frequency).toBe('per_day');
    
    // Assert: Verify third service details
    const thirdService = (createdVenue.services as any)[2];
    expect(thirdService.title).toBe('Yoga Session');
    expect(thirdService.price).toBe(25.50);
    expect(thirdService.quantity).toBeUndefined(); // Optional field not provided
  });

  it('should retrieve venue services from database', async () => {
    // Act: Fetch the venue from database
    const [fetchedVenue] = await db.select().from(venues).where(eq(venues.id, testVenueId));

    // Assert: Verify venue was retrieved
    expect(fetchedVenue).toBeDefined();
    
    // Assert: Verify services persist after retrieval
    expect(fetchedVenue.services).toBeDefined();
    expect(Array.isArray(fetchedVenue.services)).toBe(true);
    expect(fetchedVenue.services).toHaveLength(3);
    
    // Assert: Verify service data integrity
    const services = fetchedVenue.services as any[];
    expect(services[0].title).toBe('Catering Service');
    expect(services[1].title).toBe('Audio Visual Equipment');
    expect(services[2].title).toBe('Yoga Session');
  });

  it('should update venue services in database', async () => {
    // Arrange: Updated services list
    const updatedServices = [
      {
        id: 'svc-1',
        title: 'Premium Catering Service',
        description: 'Premium full service catering with organic ingredients, custom menu planning, and dedicated chef',
        price: 65.00,
        frequency: 'per_person' as const,
        quantity: 150,
      },
      {
        id: 'svc-4',
        title: 'Meditation Workshop',
        description: 'Guided meditation and mindfulness workshops with experienced meditation teachers and practitioners',
        price: 30.00,
        frequency: 'per_person' as const,
        quantity: 50,
      },
    ];

    // Act: Update venue services
    const [updatedVenue] = await db
      .update(venues)
      .set({ services: updatedServices })
      .where(eq(venues.id, testVenueId))
      .returning();

    // Assert: Verify update was successful
    expect(updatedVenue).toBeDefined();
    expect(updatedVenue.services).toHaveLength(2);
    
    // Assert: Verify updated service details
    const services = updatedVenue.services as any[];
    expect(services[0].title).toBe('Premium Catering Service');
    expect(services[0].price).toBe(65.00);
    expect(services[0].quantity).toBe(150);
    
    expect(services[1].title).toBe('Meditation Workshop');
    expect(services[1].price).toBe(30.00);
  });

  it('should handle empty services array', async () => {
    // Act: Update venue with empty services
    const [updatedVenue] = await db
      .update(venues)
      .set({ services: [] })
      .where(eq(venues.id, testVenueId))
      .returning();

    // Assert: Verify empty array is saved
    expect(updatedVenue.services).toBeDefined();
    expect(Array.isArray(updatedVenue.services)).toBe(true);
    expect(updatedVenue.services).toHaveLength(0);
  });

  it('should persist services through full save-fetch cycle', async () => {
    // Arrange: Create new venue with services
    const newVenueId = 'test-venue-cycle-' + Date.now();
    const servicesData = [
      {
        id: 'cycle-1',
        title: 'Conference Room Setup',
        description: 'Complete conference room setup including tables, chairs, whiteboards, and all necessary equipment',
        price: 150.00,
        frequency: 'one-time' as const,
      },
    ];

    try {
      // Act 1: Save venue
      const [savedVenue] = await db.insert(venues).values({
        id: newVenueId,
        name: 'Cycle Test Venue',
        city: 'Cycle City',
        description: 'Testing the complete save-fetch cycle to ensure services data integrity throughout the process',
        capacity: 25,
        location: '456 Cycle Ave, Cycle City, CC 54321',
        slug: 'cycle-test-' + Date.now(),
        createdBy: testUserId,
        services: servicesData,
      }).returning();

      // Assert 1: Verify save
      expect(savedVenue.services).toHaveLength(1);
      expect((savedVenue.services as any)[0].title).toBe('Conference Room Setup');

      // Act 2: Fetch venue
      const [fetchedVenue] = await db.select().from(venues).where(eq(venues.id, newVenueId));

      // Assert 2: Verify fetch returns same data
      expect(fetchedVenue.services).toHaveLength(1);
      expect((fetchedVenue.services as any)[0].title).toBe('Conference Room Setup');
      expect((fetchedVenue.services as any)[0].price).toBe(150.00);
      expect((fetchedVenue.services as any)[0].frequency).toBe('one-time');
      
      // Clean up
      await db.delete(venues).where(eq(venues.id, newVenueId));
    } catch (error) {
      // Clean up on error
      await db.delete(venues).where(eq(venues.id, newVenueId));
      throw error;
    }
  });
});
