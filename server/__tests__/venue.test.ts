import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { DatabaseStorage } from '../storage';
import type { InsertVenue } from '@shared/schema';

// Mock user for authentication
const mockAdminUser = {
  id: 'test-admin-id',
  claims: {
    email: 'timtheeuwsen@gmail.com',
  },
};

const mockNonAdminUser = {
  id: 'test-user-id',
  claims: {
    email: 'regular@user.com',
  },
};

const databaseAvailable = !!process.env.DATABASE_URL
  && !process.env.DATABASE_URL.includes('test:test@localhost');

describe.runIf(databaseAvailable)('Venue Module - Backend Tests', () => {
  let app: express.Application;
  let storage: DatabaseStorage;
  let testVenueId: string;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize storage
    storage = new DatabaseStorage();
    
    // Create test user
    const testUser = await storage.upsertUser({
      id: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'creator',
    });
    testUserId = testUser.id;
  });

  beforeEach(async () => {
    // Setup Express app with minimal configuration
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );

    // Mock authentication middleware
    app.use((req: any, res, next) => {
      if (req.headers.authorization === 'admin') {
        req.user = mockAdminUser;
      } else if (req.headers.authorization === 'user') {
        req.user = mockNonAdminUser;
      }
      next();
    });

    // Venue routes
    app.post('/api/venues', async (req: any, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ message: 'Unauthorized' });
        }
        const venueData = { ...req.body, createdBy: testUserId };
        const venue = await storage.createVenue(venueData);
        res.status(201).json(venue);
      } catch (error: any) {
        res.status(400).json({ message: error.message });
      }
    });

    app.get('/api/v/:slug', async (req, res) => {
      try {
        const venue = await storage.getVenueBySlug(req.params.slug);
        if (!venue) {
          return res.status(404).json({ message: 'Venue not found' });
        }
        if (venue.status !== 'approved' || !venue.approved) {
          return res.status(404).json({ message: 'Venue not available' });
        }
        res.json(venue);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.patch('/api/admin/venues/:id', async (req: any, res) => {
      try {
        if (!req.user || req.user.claims.email !== 'timtheeuwsen@gmail.com') {
          return res.status(403).json({ message: 'Admin access required' });
        }
        const { status } = req.body;
        let venue;
        if (status === 'approved') {
          venue = await storage.approveVenue(req.params.id);
        } else if (status === 'rejected') {
          venue = await storage.rejectVenue(req.params.id);
        } else {
          return res.status(400).json({ message: 'Invalid status' });
        }
        res.json(venue);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });

    app.get('/api/admin/venues', async (req: any, res) => {
      try {
        if (!req.user || req.user.claims.email !== 'timtheeuwsen@gmail.com') {
          return res.status(403).json({ message: 'Admin access required' });
        }
        const venues = await storage.getVenuesWithCreators();
        res.json(venues);
      } catch (error: any) {
        res.status(500).json({ message: error.message });
      }
    });
  });

  describe('Venue Creation', () => {
    it('should create a venue with valid data', async () => {
      const validVenue: InsertVenue = {
        name: 'Test Retreat Center',
        city: 'Bali',
        description: 'Beautiful retreat center in Bali',
        capacity: 20,
        location: '123 Beach Road, Bali, Indonesia',
        slug: 'test-retreat-bali-' + Date.now(),
        status: 'pending',
        createdBy: testUserId,
      };

      const response = await request(app)
        .post('/api/venues')
        .set('Authorization', 'admin')
        .send(validVenue)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(validVenue.name);
      expect(response.body.city).toBe(validVenue.city);
      expect(response.body.status).toBe('pending');
      expect(response.body.approved).toBe(false);

      testVenueId = response.body.id;
    });

    it('should reject venue creation without authentication', async () => {
      const validVenue: InsertVenue = {
        name: 'Test Retreat Center',
        city: 'Bali',
        description: 'Beautiful retreat center',
        capacity: 20,
        location: '123 Beach Road, Bali',
        slug: 'test-retreat-no-auth-' + Date.now(),
        status: 'pending',
        createdBy: testUserId,
      };

      await request(app)
        .post('/api/venues')
        .send(validVenue)
        .expect(401);
    });

    it('should reject venue with missing required fields', async () => {
      const invalidVenue = {
        name: 'Test Venue',
        // Missing required fields: city, description, capacity, location, slug
      };

      const response = await request(app)
        .post('/api/venues')
        .set('Authorization', 'admin')
        .send(invalidVenue)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should reject venue with invalid capacity (negative number)', async () => {
      const invalidVenue: any = {
        name: 'Test Venue',
        city: 'Bali',
        description: 'Test description',
        capacity: -5, // Invalid negative capacity
        location: '123 Test St',
        slug: 'test-negative-capacity-' + Date.now(),
        status: 'pending',
        createdBy: testUserId,
      };

      const response = await request(app)
        .post('/api/venues')
        .set('Authorization', 'admin')
        .send(invalidVenue)
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Venue Approval Workflow', () => {
    let pendingVenueId: string;

    beforeEach(async () => {
      // Create a pending venue for testing
      const venue = await storage.createVenue({
        name: 'Pending Test Venue',
        city: 'Ubud',
        description: 'Pending venue for testing',
        capacity: 15,
        location: '456 Mountain Road, Ubud',
        slug: 'pending-test-venue-' + Date.now(),
        status: 'pending',
        createdBy: testUserId,
      });
      pendingVenueId = venue.id;
    });

    it('should approve a venue with admin authentication', async () => {
      const response = await request(app)
        .patch(`/api/admin/venues/${pendingVenueId}`)
        .set('Authorization', 'admin')
        .send({ status: 'approved' })
        .expect(200);

      expect(response.body.approved).toBe(true);
      expect(response.body.status).toBe('approved');
    });

    it('should reject a venue with admin authentication', async () => {
      const response = await request(app)
        .patch(`/api/admin/venues/${pendingVenueId}`)
        .set('Authorization', 'admin')
        .send({ status: 'rejected' })
        .expect(200);

      expect(response.body.approved).toBe(false);
      expect(response.body.status).toBe('rejected');
    });

    it('should deny approval attempt by non-admin user', async () => {
      await request(app)
        .patch(`/api/admin/venues/${pendingVenueId}`)
        .set('Authorization', 'user')
        .send({ status: 'approved' })
        .expect(403);
    });

    it('should deny approval attempt without authentication', async () => {
      await request(app)
        .patch(`/api/admin/venues/${pendingVenueId}`)
        .send({ status: 'approved' })
        .expect(403);
    });

    it('should reject invalid status values', async () => {
      await request(app)
        .patch(`/api/admin/venues/${pendingVenueId}`)
        .set('Authorization', 'admin')
        .send({ status: 'invalid-status' })
        .expect(400);
    });
  });

  describe('Public Venue Page', () => {
    let approvedVenueId: string;
    let approvedVenueSlug: string;
    let rejectedVenueSlug: string;

    beforeEach(async () => {
      // Create and approve a venue
      const approvedVenue = await storage.createVenue({
        name: 'Approved Public Venue',
        city: 'Canggu',
        description: 'Approved venue for public viewing',
        capacity: 25,
        location: '789 Beach Road, Canggu',
        slug: 'approved-public-venue-' + Date.now(),
        status: 'pending',
        createdBy: testUserId,
      });
      approvedVenueId = approvedVenue.id;
      approvedVenueSlug = approvedVenue.slug;
      await storage.approveVenue(approvedVenueId);

      // Create a rejected venue
      const rejectedVenue = await storage.createVenue({
        name: 'Rejected Venue',
        city: 'Seminyak',
        description: 'Rejected venue',
        capacity: 10,
        location: '321 Street, Seminyak',
        slug: 'rejected-venue-' + Date.now(),
        status: 'pending',
        createdBy: testUserId,
      });
      rejectedVenueSlug = rejectedVenue.slug;
      await storage.rejectVenue(rejectedVenue.id);
    });

    it('should load approved venue public page', async () => {
      const response = await request(app)
        .get(`/api/v/${approvedVenueSlug}`)
        .expect(200);

      expect(response.body.name).toBe('Approved Public Venue');
      expect(response.body.status).toBe('approved');
      expect(response.body.approved).toBe(true);
    });

    it('should return 404 for rejected venue', async () => {
      await request(app)
        .get(`/api/v/${rejectedVenueSlug}`)
        .expect(404);
    });

    it('should return 404 for non-existent venue slug', async () => {
      await request(app)
        .get('/api/v/non-existent-venue-12345')
        .expect(404);
    });
  });

  describe('Admin Venue List', () => {
    it('should return all venues for admin user', async () => {
      const response = await request(app)
        .get('/api/admin/venues')
        .set('Authorization', 'admin')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Should include venues with different statuses
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('id');
        expect(response.body[0]).toHaveProperty('name');
        expect(response.body[0]).toHaveProperty('status');
        expect(response.body[0]).toHaveProperty('ownerName');
        expect(response.body[0]).toHaveProperty('ownerEmail');
      }
    });

    it('should deny access to non-admin user', async () => {
      await request(app)
        .get('/api/admin/venues')
        .set('Authorization', 'user')
        .expect(403);
    });

    it('should deny access without authentication', async () => {
      await request(app)
        .get('/api/admin/venues')
        .expect(403);
    });
  });
});
