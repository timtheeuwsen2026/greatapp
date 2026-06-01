/**
 * Promoter Commission Field - Database Persistence Tests
 * 
 * These tests verify that the promoterCommission field:
 * 1. Can be saved when creating a new experience
 * 2. Can be updated on existing experiences
 * 3. Persists correctly in the database
 * 4. Defaults to 0.00 when not provided
 * 5. Stores as decimal type with 2 decimal places
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DatabaseStorage } from '../storage';

describe('Promoter Commission Field - Database Persistence Tests', () => {
  let storage: DatabaseStorage;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize storage
    storage = new DatabaseStorage();
    
    // Create test user
    const testUser = await storage.upsertUser({
      id: 'test-promoter-commission-user',
      email: 'test-promoter@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'creator',
    });
    testUserId = testUser.id;
  });

  describe('Creating Experience with Promoter Commission', () => {
    it('should save promoterCommission when creating a new experience', async () => {
      const experience = await storage.createExperience({
        title: 'Test Retreat with Promoter Commission',
        description: 'A test retreat to verify promoter commission saves correctly',
        shortDescription: 'Test retreat',
        category: 'retreats',
        experienceType: 'multi-day',
        location: 'Bali, Indonesia',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-07'),
        price: '1500.00',
        maxParticipants: 20,
        creatorId: testUserId,
        status: 'draft',
        promoterCommission: '15.50', // 15.5% commission
      });

      expect(experience.promoterCommission).toBe('15.50');
      
      // Verify it's persisted in database
      const savedExperience = await storage.getExperience(experience.id);
      expect(savedExperience?.promoterCommission).toBe('15.50');
    });

    it('should default promoterCommission to 0.00 when not provided', async () => {
      const experience = await storage.createExperience({
        title: 'Test Retreat without Promoter Commission',
        description: 'A test retreat without promoter commission specified',
        shortDescription: 'Test retreat',
        category: 'retreats',
        experienceType: 'multi-day',
        location: 'Bali, Indonesia',
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-07'),
        price: '1500.00',
        maxParticipants: 20,
        creatorId: testUserId,
        status: 'draft',
        // No promoterCommission field
      });

      expect(experience.promoterCommission).toBe('0.00');
      
      // Verify default value in database
      const savedExperience = await storage.getExperience(experience.id);
      expect(savedExperience?.promoterCommission).toBe('0.00');
    });

    it('should save promoterCommission with valid decimal precision (2 decimal places)', async () => {
      const testCases = [
        { value: '10.00', expected: '10.00' },
        { value: '5.50', expected: '5.50' },
        { value: '20.99', expected: '20.99' },
        { value: '0.00', expected: '0.00' },
        { value: '100.00', expected: '100.00' },
      ];

      for (const testCase of testCases) {
        const experience = await storage.createExperience({
          title: `Test with commission ${testCase.value}`,
          description: 'Testing decimal precision',
          shortDescription: 'Test',
          category: 'retreats',
          experienceType: 'one-day',
          location: 'Test Location',
          startDate: new Date('2025-07-01'),
          endDate: new Date('2025-07-01'),
          price: '100.00',
          maxParticipants: 10,
          creatorId: testUserId,
          status: 'draft',
          promoterCommission: testCase.value,
        });

        expect(experience.promoterCommission).toBe(testCase.expected);
      }
    });
  });

  describe('Updating Experience Promoter Commission', () => {
    it('should update promoterCommission on existing experience', async () => {
      // Create a test experience first
      const experience = await storage.createExperience({
        title: 'Test Experience for Updates',
        description: 'Will be updated with promoter commission',
        shortDescription: 'Test',
        category: 'retreats',
        experienceType: 'multi-day',
        location: 'Bali',
        startDate: new Date('2025-08-01'),
        endDate: new Date('2025-08-07'),
        price: '2000.00',
        maxParticipants: 15,
        creatorId: testUserId,
        status: 'draft',
        promoterCommission: '0.00', // Start with no commission
      });

      // Update promoterCommission
      const updated = await storage.updateExperience(experience.id, {
        promoterCommission: '12.75',
      });

      expect(updated.promoterCommission).toBe('12.75');
      
      // Verify update persisted
      const retrieved = await storage.getExperience(experience.id);
      expect(retrieved?.promoterCommission).toBe('12.75');
    });

    it('should update promoterCommission from non-zero to zero', async () => {
      // Create with commission
      const experience = await storage.createExperience({
        title: 'Test Update to Zero',
        description: 'Testing update to zero',
        shortDescription: 'Test',
        category: 'retreats',
        experienceType: 'one-day',
        location: 'Test',
        startDate: new Date('2025-09-01'),
        endDate: new Date('2025-09-01'),
        price: '500.00',
        maxParticipants: 10,
        creatorId: testUserId,
        status: 'draft',
        promoterCommission: '20.00',
      });

      // Update to zero
      const updated = await storage.updateExperience(experience.id, {
        promoterCommission: '0.00',
      });

      expect(updated.promoterCommission).toBe('0.00');
    });

    it('should update promoterCommission along with other fields', async () => {
      // Create experience
      const experience = await storage.createExperience({
        title: 'Original Title',
        description: 'Original description',
        shortDescription: 'Test',
        category: 'workations',
        experienceType: 'multi-day',
        location: 'Test City',
        startDate: new Date('2025-10-01'),
        endDate: new Date('2025-10-07'),
        price: '1000.00',
        maxParticipants: 20,
        creatorId: testUserId,
        status: 'draft',
        promoterCommission: '5.00',
      });

      // Update multiple fields including promoterCommission
      const updated = await storage.updateExperience(experience.id, {
        title: 'Updated Title',
        promoterCommission: '8.50',
        maxParticipants: 25,
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.promoterCommission).toBe('8.50');
      expect(updated.maxParticipants).toBe(25);
    });
  });

  describe('Promoter Commission Persistence', () => {
    it('should persist promoterCommission across database reads', async () => {
      // Create experience with commission
      const experience = await storage.createExperience({
        title: 'Persistence Test Experience',
        description: 'Testing commission persistence',
        shortDescription: 'Test',
        category: 'workations',
        experienceType: 'one-day',
        location: 'Test City',
        startDate: new Date('2025-09-15'),
        endDate: new Date('2025-09-15'),
        price: '500.00',
        maxParticipants: 30,
        creatorId: testUserId,
        status: 'draft',
        promoterCommission: '18.25',
      });

      // Read it back multiple times
      const read1 = await storage.getExperience(experience.id);
      const read2 = await storage.getExperience(experience.id);
      
      expect(read1?.promoterCommission).toBe('18.25');
      expect(read2?.promoterCommission).toBe('18.25');
      expect(read1?.promoterCommission).toBe(read2?.promoterCommission);
    });
  });

  describe('Type Safety and Validation', () => {
    it('should store promoterCommission as decimal type', async () => {
      const experience = await storage.createExperience({
        title: 'Type Test Experience',
        description: 'Testing data type',
        shortDescription: 'Test',
        category: 'retreats',
        experienceType: 'multi-day',
        location: 'Test Location',
        startDate: new Date('2025-10-01'),
        endDate: new Date('2025-10-07'),
        price: '1000.00',
        maxParticipants: 20,
        creatorId: testUserId,
        status: 'draft',
        promoterCommission: '15.00',
      });

      const retrieved = await storage.getExperience(experience.id);
      
      // Verify it's stored as string (decimal type)
      expect(typeof retrieved?.promoterCommission).toBe('string');
      // Verify it matches the numeric format (decimal with 2 places)
      expect(retrieved?.promoterCommission).toMatch(/^\d+\.\d{2}$/);
    });
  });
});

/**
 * Manual Testing Checklist
 * 
 * Test these scenarios manually:
 * 
 * 1. Create Experience with Commission:
 *    - Use experience creation form/API
 *    - Add promoterCommission: 15.50
 *    - Submit and verify it saves
 * 
 * 2. Create Experience without Commission:
 *    - Use experience creation form/API
 *    - Don't provide promoterCommission
 *    - Verify it defaults to 0.00
 * 
 * 3. Update Existing Experience:
 *    - Edit an existing experience
 *    - Update promoterCommission to new value
 *    - Verify update persists
 * 
 * 4. Database Verification:
 *    - Query database directly
 *    - SELECT promoter_commission FROM experiences
 *    - Verify values match expected format
 */
