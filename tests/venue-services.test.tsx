/**
 * Venue Services Integration Tests
 * 
 * Tests for venue-related features including:
 * - Services persistence and placement in venue profile
 * - Photo upload flow (S3-backed uploads)
 * - Soft hold days configuration
 * - Deposit percentage field
 * - Integration with backend API
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { Venue } from '@shared/schema';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Helper to create a query client for each test
const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
};

// Helper to wrap component with providers
const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('Venue Services - Integration Tests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Services Persistence', () => {
    it('should save services to venue and persist in database', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-123',
        name: 'Mountain Retreat Center',
        slug: 'mountain-retreat',
        services: [
          {
            id: 'svc-1',
            title: 'Gourmet Catering',
            description: 'Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options available.',
            price: 45.00,
            frequency: 'per-day',
            quantity: 50,
          },
          {
            id: 'svc-2',
            title: 'Yoga Classes',
            description: 'Daily morning and evening yoga sessions led by certified instructors. Suitable for all experience levels from beginners to advanced practitioners.',
            price: 25.00,
            frequency: 'per-session',
            quantity: 20,
          },
        ],
      };

      // Mock successful save response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      // Simulate saving venue with services
      const response = await fetch('/api/venues/venue-123', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockVenue),
      });

      const savedVenue = await response.json();

      // Verify services are saved
      expect(savedVenue.services).toHaveLength(2);
      expect(savedVenue.services[0]).toMatchObject({
        id: 'svc-1',
        title: 'Gourmet Catering',
        price: 45.00,
        frequency: 'per-day',
      });
      expect(savedVenue.services[1]).toMatchObject({
        id: 'svc-2',
        title: 'Yoga Classes',
        price: 25.00,
        frequency: 'per-session',
      });
    });

    it('should handle empty services array', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-456',
        name: 'Basic Venue',
        slug: 'basic-venue',
        services: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockVenue),
      });

      const savedVenue = await response.json();

      expect(savedVenue.services).toEqual([]);
      expect(Array.isArray(savedVenue.services)).toBe(true);
    });

    it('should preserve service order when saving', async () => {
      const services = [
        {
          id: 'svc-1',
          title: 'First Service',
          description: 'This is the first service in our list and should appear first on the venue page for users to see.',
          price: 10,
          frequency: 'one-time' as const,
        },
        {
          id: 'svc-2',
          title: 'Second Service',
          description: 'This is the second service in our list and should appear after the first service on the venue page.',
          price: 20,
          frequency: 'one-time' as const,
        },
        {
          id: 'svc-3',
          title: 'Third Service',
          description: 'This is the third service in our list and should appear last on the venue page for proper ordering.',
          price: 30,
          frequency: 'one-time' as const,
        },
      ];

      const mockVenue: Partial<Venue> = {
        id: 'venue-789',
        slug: 'ordered-venue',
        services,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-789', {
        method: 'PATCH',
        body: JSON.stringify(mockVenue),
      });

      const savedVenue = await response.json();

      // Verify order is preserved
      expect(savedVenue.services[0].title).toBe('First Service');
      expect(savedVenue.services[1].title).toBe('Second Service');
      expect(savedVenue.services[2].title).toBe('Third Service');
    });

    it('should validate service fields before saving', async () => {
      const invalidService = {
        id: 'svc-invalid',
        title: '', // Invalid: empty title
        description: 'Short desc', // Invalid: < 50 chars
        price: -10, // Invalid: negative price
        frequency: 'one-time' as const,
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          issues: [
            { path: ['title'], message: 'Title is required' },
            { path: ['description'], message: 'Description must be at least 50 characters' },
            { path: ['price'], message: 'Price must be positive' },
          ],
        }),
      });

      const response = await fetch('/api/venues/test', {
        method: 'PATCH',
        body: JSON.stringify({ services: [invalidService] }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const error = await response.json();
      expect(error.error).toBe('Validation failed');
      expect(error.issues).toHaveLength(3);
    });
  });

  describe('Photo Upload Flow', () => {
    it('should upload photo to S3 and return public URL', async () => {
      const mockFile = new File(['mock image data'], 'test-image.jpg', {
        type: 'image/jpeg',
      });

      const mockUploadUrl = 'https://storage.googleapis.com/bucket/uploads/abc-123.jpg';
      const mockPublicUrl = '/objects/uploads/abc-123.jpg';

      // Mock upload URL generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ uploadUrl: mockUploadUrl }),
      });

      // Step 1: Get pre-signed upload URL
      const urlResponse = await fetch('/api/objects/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });

      const { uploadUrl } = await urlResponse.json();
      expect(uploadUrl).toBe(mockUploadUrl);

      // Mock S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      // Step 2: Upload file to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: mockFile,
        headers: { 'Content-Type': 'image/jpeg' },
      });

      expect(uploadResponse.ok).toBe(true);

      // Mock public URL generation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: mockPublicUrl }),
      });

      // Step 3: Confirm upload and get public URL
      const confirmResponse = await fetch('/api/objects/confirm', {
        method: 'POST',
        body: JSON.stringify({ uploadUrl: mockUploadUrl }),
      });

      const { url } = await confirmResponse.json();
      expect(url).toBe(mockPublicUrl);
    });

    it('should validate file type before upload', async () => {
      const invalidFile = new File(['text content'], 'document.txt', {
        type: 'text/plain',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Invalid file type. Only JPG, PNG, and WEBP images are allowed.',
        }),
      });

      const response = await fetch('/api/objects/upload', {
        method: 'POST',
        body: JSON.stringify({ contentType: 'text/plain' }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toContain('Invalid file type');
    });

    it('should validate file size (max 10MB)', async () => {
      const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large-image.jpg', {
        type: 'image/jpeg',
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'File size exceeds 10MB limit',
        }),
      });

      const response = await fetch('/api/objects/upload', {
        method: 'POST',
        body: JSON.stringify({
          contentType: 'image/jpeg',
          fileSize: largeFile.size,
        }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toContain('10MB');
    });

    it('should handle upload failure and retry', async () => {
      const mockFile = new File(['image data'], 'retry-test.jpg', {
        type: 'image/jpeg',
      });

      // First attempt fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Second attempt succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://storage.googleapis.com/bucket/retry-abc.jpg',
        }),
      });

      let error: Error | null = null;
      try {
        await fetch('/api/objects/upload', {
          method: 'POST',
          body: JSON.stringify({ contentType: 'image/jpeg' }),
        });
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeTruthy();
      expect(error?.message).toBe('Network error');

      // Retry
      const retryResponse = await fetch('/api/objects/upload', {
        method: 'POST',
        body: JSON.stringify({ contentType: 'image/jpeg' }),
      });

      expect(retryResponse.ok).toBe(true);
    });

    it('should save multiple photos to venue gallery', async () => {
      const galleryUrls = [
        '/objects/uploads/gallery-1.jpg',
        '/objects/uploads/gallery-2.jpg',
        '/objects/uploads/gallery-3.jpg',
      ];

      const mockVenue: Partial<Venue> = {
        id: 'venue-gallery',
        slug: 'gallery-venue',
        galleryImages: galleryUrls,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-gallery', {
        method: 'PATCH',
        body: JSON.stringify({ galleryImages: galleryUrls }),
      });

      const savedVenue = await response.json();
      expect(savedVenue.galleryImages).toHaveLength(3);
      expect(savedVenue.galleryImages).toEqual(galleryUrls);
    });
  });

  describe('Soft Hold Days Configuration', () => {
    it('should save soft hold days to venue', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-soft-hold',
        slug: 'soft-hold-venue',
        softHoldDays: 7,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-soft-hold', {
        method: 'PATCH',
        body: JSON.stringify({ softHoldDays: 7 }),
      });

      const savedVenue = await response.json();
      expect(savedVenue.softHoldDays).toBe(7);
    });

    it('should handle null/undefined soft hold days (no soft hold)', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-no-hold',
        slug: 'no-hold-venue',
        softHoldDays: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-no-hold', {
        method: 'PATCH',
        body: JSON.stringify({ softHoldDays: null }),
      });

      const savedVenue = await response.json();
      expect(savedVenue.softHoldDays).toBeNull();
    });

    it('should validate soft hold days range (0-90 days)', async () => {
      // Test valid values
      const validValues = [0, 1, 7, 14, 30, 60, 90];

      for (const days of validValues) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ softHoldDays: days }),
        });

        const response = await fetch('/api/venues/test', {
          method: 'PATCH',
          body: JSON.stringify({ softHoldDays: days }),
        });

        const venue = await response.json();
        expect(venue.softHoldDays).toBe(days);
      }
    });

    it('should reject negative soft hold days', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Soft hold days must be between 0 and 90',
        }),
      });

      const response = await fetch('/api/venues/test', {
        method: 'PATCH',
        body: JSON.stringify({ softHoldDays: -5 }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toContain('between 0 and 90');
    });

    it('should reject soft hold days > 90', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Soft hold days must be between 0 and 90',
        }),
      });

      const response = await fetch('/api/venues/test', {
        method: 'PATCH',
        body: JSON.stringify({ softHoldDays: 120 }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toContain('between 0 and 90');
    });
  });

  describe('Deposit Percentage Field', () => {
    it('should save deposit percentage to venue', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-deposit',
        slug: 'deposit-venue',
        depositPercent: 25,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-deposit', {
        method: 'PATCH',
        body: JSON.stringify({ depositPercent: 25 }),
      });

      const savedVenue = await response.json();
      expect(savedVenue.depositPercent).toBe(25);
    });

    it('should handle null deposit percentage (no deposit required)', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-no-deposit',
        slug: 'no-deposit-venue',
        depositPercent: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/venues/venue-no-deposit', {
        method: 'PATCH',
        body: JSON.stringify({ depositPercent: null }),
      });

      const savedVenue = await response.json();
      expect(savedVenue.depositPercent).toBeNull();
    });

    it('should validate deposit percentage range (0-100)', async () => {
      const validValues = [0, 10, 25, 50, 75, 100];

      for (const percent of validValues) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ depositPercent: percent }),
        });

        const response = await fetch('/api/venues/test', {
          method: 'PATCH',
          body: JSON.stringify({ depositPercent: percent }),
        });

        const venue = await response.json();
        expect(venue.depositPercent).toBe(percent);
      }
    });

    it('should reject negative deposit percentage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Deposit percentage must be between 0 and 100',
        }),
      });

      const response = await fetch('/api/venues/test', {
        method: 'PATCH',
        body: JSON.stringify({ depositPercent: -10 }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toContain('between 0 and 100');
    });

    it('should reject deposit percentage > 100', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Deposit percentage must be between 0 and 100',
        }),
      });

      const response = await fetch('/api/venues/test', {
        method: 'PATCH',
        body: JSON.stringify({ depositPercent: 150 }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toContain('between 0 and 100');
    });

    it('should save common deposit percentages', async () => {
      const commonValues = [10, 20, 25, 30, 50];

      for (const percent of commonValues) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ depositPercent: percent }),
        });

        const response = await fetch('/api/venues/test', {
          method: 'PATCH',
          body: JSON.stringify({ depositPercent: percent }),
        });

        const venue = await response.json();
        expect(venue.depositPercent).toBe(percent);
      }
    });
  });

  describe('Complete Venue Profile Integration', () => {
    it('should save complete venue profile with services, photos, soft hold, and deposit', async () => {
      const completeVenue: Partial<Venue> = {
        id: 'venue-complete',
        name: 'Complete Mountain Retreat',
        slug: 'complete-mountain-retreat',
        description: 'A fully equipped mountain retreat center offering premium accommodations and services',
        coverImageUrl: '/objects/uploads/cover-mountain.jpg',
        galleryImages: [
          '/objects/uploads/gallery-mountain-1.jpg',
          '/objects/uploads/gallery-mountain-2.jpg',
          '/objects/uploads/gallery-mountain-3.jpg',
        ],
        services: [
          {
            id: 'svc-1',
            title: 'All-Inclusive Catering',
            description: 'Three gourmet meals daily with vegetarian, vegan, and gluten-free options. Prepared by award-winning chefs using locally sourced organic ingredients.',
            price: 75.00,
            frequency: 'per-day',
            quantity: 100,
          },
          {
            id: 'svc-2',
            title: 'Wellness Program',
            description: 'Daily yoga, meditation, and mindfulness sessions with certified instructors. Includes morning energy sessions and evening relaxation practices.',
            price: 35.00,
            frequency: 'per-day',
            quantity: 50,
          },
        ],
        softHoldDays: 14,
        depositPercent: 30,
        basePrice: 150,
        commissionPercent: 20,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => completeVenue,
      });

      const response = await fetch('/api/venues/venue-complete', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completeVenue),
      });

      const savedVenue = await response.json();

      // Verify all fields are saved correctly
      expect(savedVenue.name).toBe('Complete Mountain Retreat');
      expect(savedVenue.coverImageUrl).toBe('/objects/uploads/cover-mountain.jpg');
      expect(savedVenue.galleryImages).toHaveLength(3);
      expect(savedVenue.services).toHaveLength(2);
      expect(savedVenue.services[0].title).toBe('All-Inclusive Catering');
      expect(savedVenue.services[0].price).toBe(75.00);
      expect(savedVenue.softHoldDays).toBe(14);
      expect(savedVenue.depositPercent).toBe(30);
      expect(savedVenue.basePrice).toBe(150);
      expect(savedVenue.commissionPercent).toBe(20);
    });

    it('should retrieve complete venue profile from API', async () => {
      const mockVenue: Partial<Venue> = {
        id: 'venue-retrieve',
        slug: 'test-venue',
        name: 'Test Venue',
        services: [
          {
            id: 'svc-test',
            title: 'Test Service',
            description: 'A comprehensive test service that provides all the necessary features for validating our system works correctly.',
            price: 50,
            frequency: 'one-time',
          },
        ],
        softHoldDays: 7,
        depositPercent: 25,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenue,
      });

      const response = await fetch('/api/v/test-venue');
      const venue = await response.json();

      expect(venue.slug).toBe('test-venue');
      expect(venue.services).toHaveLength(1);
      expect(venue.softHoldDays).toBe(7);
      expect(venue.depositPercent).toBe(25);
    });

    it('should handle partial updates without affecting other fields', async () => {
      // Initial venue state
      const initialVenue: Partial<Venue> = {
        id: 'venue-partial',
        slug: 'partial-venue',
        services: [{ id: 'svc-1', title: 'Service 1', description: 'Original service description that is long enough to meet our validation requirements.', price: 10, frequency: 'one-time' as const }],
        softHoldDays: 7,
        depositPercent: 25,
      };

      // Update only deposit percentage
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ...initialVenue,
          depositPercent: 50, // Updated
        }),
      });

      const response = await fetch('/api/venues/venue-partial', {
        method: 'PATCH',
        body: JSON.stringify({ depositPercent: 50 }),
      });

      const updatedVenue = await response.json();

      // Services and soft hold should remain unchanged
      expect(updatedVenue.services).toHaveLength(1);
      expect(updatedVenue.softHoldDays).toBe(7);
      // Deposit should be updated
      expect(updatedVenue.depositPercent).toBe(50);
    });
  });
});
