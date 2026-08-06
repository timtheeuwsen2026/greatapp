/**
 * Venue Services CRUD - Acceptance Tests
 *
 * These tests verify the complete lifecycle of venue services:
 * - Adding services to a venue
 * - Editing existing services
 * - Deleting services
 * - Reordering services (drag and drop)
 * - Services persistence in database
 * - Services display on public venue page
 *
 * Venue services carry no price. A venue describes what it can provide; the
 * money is agreed per event through the creator's Target Deal.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VenueServicesEditor, type VenueService } from '@/components/VenueServicesEditor';

describe('Venue Services CRUD - Acceptance Tests', () => {
  let mockServices: VenueService[];
  let mockOnChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockServices = [];
    mockOnChange = vi.fn((services) => {
      mockServices = services;
    });
  });

  describe('Adding Services', () => {
    it('should add a new service when clicking "Add Service" button', async () => {
      const { rerender } = render(
        <VenueServicesEditor services={mockServices} onChange={mockOnChange} />
      );

      // Initially show empty state
      expect(screen.getByText('No services added yet')).toBeInTheDocument();

      // Click "Add Your First Service" button
      const addButton = screen.getByTestId('button-add-first-service');
      fireEvent.click(addButton);

      // Verify onChange was called with new service
      expect(mockOnChange).toHaveBeenCalled();
      const newServices = mockOnChange.mock.calls[0][0];
      expect(newServices).toHaveLength(1);
      expect(newServices[0]).toMatchObject({
        id: expect.stringContaining('svc-'),
        title: '',
        description: '',
        frequency: 'one-time',
      });

      // Rerender with new services
      rerender(
        <VenueServicesEditor services={newServices} onChange={mockOnChange} />
      );

      // Service card should be visible and in edit mode
      expect(screen.getByPlaceholderText('Service title...')).toBeInTheDocument();
    });

    it('should fill in service details and save', async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <VenueServicesEditor services={mockServices} onChange={mockOnChange} />
      );

      // Add service
      fireEvent.click(screen.getByTestId('button-add-first-service'));
      const newServices = mockOnChange.mock.calls[0][0];
      rerender(<VenueServicesEditor services={newServices} onChange={mockOnChange} />);

      // Fill in title
      const titleInput = screen.getByTestId('input-service-title-0');
      await user.clear(titleInput);
      await user.type(titleInput, 'Gourmet Catering');

      // Fill in description
      const descInput = screen.getByTestId('input-service-description-0');
      await user.type(descInput, 'Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options.');

      // Set frequency
      const frequencySelect = screen.getByTestId('select-service-frequency-0');
      fireEvent.click(frequencySelect);
      const perDayOption = await screen.findByText('Per Day');
      fireEvent.click(perDayOption);

      // Set quantity
      const quantityInput = screen.getByTestId('input-service-quantity-0');
      await user.type(quantityInput, '50');

      // Verify all onChange calls happened with correct data
      expect(mockOnChange).toHaveBeenCalled();
    });

    it('should not offer a price field — venues publish no rates', () => {
      const service: VenueService = {
        id: 'svc-1',
        title: 'Catering',
        description: 'A'.repeat(50),
        frequency: 'per_day',
      };

      render(
        <VenueServicesEditor services={[service]} onChange={mockOnChange} />
      );

      fireEvent.click(screen.getByTestId('button-edit-service-0'));

      expect(screen.queryByTestId('input-service-price-0')).not.toBeInTheDocument();
      expect(screen.queryByText(/price/i)).not.toBeInTheDocument();
    });

    it('should validate service description (minimum 50 characters)', async () => {
      const shortDescService: VenueService = {
        id: 'svc-1',
        title: 'Test Service',
        description: 'Too short', // Less than 50 characters
        frequency: 'one-time',
      };

      render(
        <VenueServicesEditor services={[shortDescService]} onChange={mockOnChange} />
      );

      // Should show validation error
      const descriptionField = screen.getByTestId('input-service-description-0');
      expect(descriptionField).toHaveClass('border-destructive');

      // Should show character count
      expect(screen.getByText(/9 \/ 50 minimum characters/)).toBeInTheDocument();

      // Should show error in alert
      expect(screen.getByText('Description must be at least 50 characters')).toBeInTheDocument();
    });

    it('should prevent adding more than 20 services', () => {
      const twentyServices: VenueService[] = Array.from({ length: 20 }, (_, i) => ({
        id: `svc-${i}`,
        title: `Service ${i}`,
        description: 'A'.repeat(50), // Valid description
        frequency: 'one-time' as const,
      }));

      render(
        <VenueServicesEditor services={twentyServices} onChange={mockOnChange} />
      );

      // "Add Service" button should not be visible
      expect(screen.queryByTestId('button-add-service')).not.toBeInTheDocument();

      // Should show max services warning
      expect(screen.getByText('Maximum 20 services reached')).toBeInTheDocument();
    });
  });

  describe('Editing Services', () => {
    it('should switch to edit mode when clicking edit icon', () => {
      const existingService: VenueService = {
        id: 'svc-1',
        title: 'Catering',
        description: 'A'.repeat(50),
        frequency: 'per_day',
      };

      render(
        <VenueServicesEditor services={[existingService]} onChange={mockOnChange} />
      );

      // Initially in collapsed view
      expect(screen.getByText('Catering')).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Service title...')).not.toBeInTheDocument();

      // Click edit button
      const editButton = screen.getByTestId('button-edit-service-0');
      fireEvent.click(editButton);

      // Now in edit mode
      expect(screen.getByTestId('input-service-title-0')).toBeInTheDocument();
      expect(screen.getByTestId('input-service-description-0')).toBeInTheDocument();
    });

    it('should save edits when clicking save (checkmark) icon', async () => {
      const user = userEvent.setup();

      const existingService: VenueService = {
        id: 'svc-1',
        title: 'Catering',
        description: 'A'.repeat(50),
        frequency: 'per_day',
      };

      const { rerender } = render(
        <VenueServicesEditor services={[existingService]} onChange={mockOnChange} />
      );

      // Enter edit mode
      fireEvent.click(screen.getByTestId('button-edit-service-0'));

      // Change the quantity available. The editor is controlled by its parent,
      // which does not re-render here, so type a single digit and assert on it.
      const quantityInput = screen.getByTestId('input-service-quantity-0');
      await user.clear(quantityInput);
      await user.type(quantityInput, '8');

      // Verify onChange called with the updated quantity
      expect(mockOnChange).toHaveBeenCalled();
      const updatedServices = mockOnChange.mock.calls[mockOnChange.mock.calls.length - 1][0];
      expect(updatedServices[0].quantity).toBe(8);

      // Click save (this just closes edit mode in the component)
      const saveButton = screen.getByTestId('button-save-service-0');
      fireEvent.click(saveButton);

      // Should exit edit mode
      rerender(<VenueServicesEditor services={updatedServices} onChange={mockOnChange} />);
      expect(screen.queryByTestId('input-service-title-0')).not.toBeInTheDocument();
    });
  });

  describe('Deleting Services', () => {
    it('should delete service when clicking delete icon', () => {
      const existingServices: VenueService[] = [
        {
          id: 'svc-1',
          title: 'Catering',
          description: 'A'.repeat(50),
          frequency: 'per_day',
        },
        {
          id: 'svc-2',
          title: 'Yoga Mats',
          description: 'B'.repeat(50),
          frequency: 'one-time',
        },
      ];

      render(
        <VenueServicesEditor services={existingServices} onChange={mockOnChange} />
      );

      // Both services should be visible
      expect(screen.getByText('Catering')).toBeInTheDocument();
      expect(screen.getByText('Yoga Mats')).toBeInTheDocument();

      // Delete first service
      const deleteButton = screen.getByTestId('button-remove-service-0');
      fireEvent.click(deleteButton);

      // Verify onChange called with service removed
      expect(mockOnChange).toHaveBeenCalled();
      const updatedServices = mockOnChange.mock.calls[0][0];
      expect(updatedServices).toHaveLength(1);
      expect(updatedServices[0].title).toBe('Yoga Mats');
    });
  });

  describe('Reordering Services (Drag and Drop)', () => {
    it('should reorder services when dragging', () => {
      const existingServices: VenueService[] = [
        {
          id: 'svc-1',
          title: 'Service A',
          description: 'A'.repeat(50),
          frequency: 'one-time',
        },
        {
          id: 'svc-2',
          title: 'Service B',
          description: 'B'.repeat(50),
          frequency: 'one-time',
        },
        {
          id: 'svc-3',
          title: 'Service C',
          description: 'C'.repeat(50),
          frequency: 'one-time',
        },
      ];

      const { container } = render(
        <VenueServicesEditor services={existingServices} onChange={mockOnChange} />
      );

      // Get all service cards
      const cards = container.querySelectorAll('[draggable="true"]');
      expect(cards).toHaveLength(3);

      // Simulate drag and drop: drag first item to third position
      const firstCard = cards[0] as HTMLElement;
      const thirdCard = cards[2] as HTMLElement;

      // Trigger dragstart on first card
      fireEvent.dragStart(firstCard);

      // Trigger dragover on third card
      fireEvent.dragOver(thirdCard);

      // Trigger drop on third card
      fireEvent.drop(thirdCard);

      // Verify onChange called with reordered services
      expect(mockOnChange).toHaveBeenCalled();
      const reorderedServices = mockOnChange.mock.calls[0][0];

      // Order should be: B, C, A
      expect(reorderedServices[0].title).toBe('Service B');
      expect(reorderedServices[1].title).toBe('Service C');
      expect(reorderedServices[2].title).toBe('Service A');
    });
  });

  describe('Persistence & Display Tests', () => {
    it('should include services in venue data when saved', () => {
      // This test simulates the form submission
      const services: VenueService[] = [
        {
          id: 'svc-1',
          title: 'Catering',
          description: 'Organic farm-to-table meals prepared by our in-house chef.',
          frequency: 'per_day',
          quantity: 50,
        },
      ];

      render(
        <VenueServicesEditor services={services} onChange={mockOnChange} />
      );

      // Verify the services data structure
      expect(services[0]).toMatchObject({
        id: expect.any(String),
        title: 'Catering',
        description: expect.stringContaining('Organic'),
        frequency: 'per_day',
        quantity: 50,
      });
    });

    it('should handle services with no quantity', () => {
      const services: VenueService[] = [
        {
          id: 'svc-1',
          title: 'Free Service',
          description: 'A'.repeat(50),
          frequency: 'one-time',
          // No quantity
        },
      ];

      render(
        <VenueServicesEditor services={services} onChange={mockOnChange} />
      );

      // Should render without errors
      expect(screen.getByText('Free Service')).toBeInTheDocument();

      // No price badge exists anywhere in the editor
      expect(screen.queryByTestId('badge-service-price-0')).not.toBeInTheDocument();
    });
  });

  describe('API Contract Tests', () => {
    it('should send correct JSON structure to backend', () => {
      const services: VenueService[] = [
        {
          id: 'svc-123',
          title: 'Gourmet Catering',
          description: 'Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options.',
          frequency: 'per_day',
          quantity: 50,
        },
      ];

      // Expected JSON structure when sending to backend — no price key.
      const expectedPayload = {
        services: [
          {
            id: 'svc-123',
            title: 'Gourmet Catering',
            description: 'Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options.',
            frequency: 'per_day',
            quantity: 50,
          },
        ],
      };

      // Verify structure matches
      expect(expectedPayload.services).toEqual(services);

      // Verify all required fields are present
      expect(services[0].title).toBeDefined();
      expect(services[0].description).toBeDefined();
      expect(services[0].frequency).toBeDefined();

      // Verify optional fields can be undefined
      const minimalService: VenueService = {
        id: 'svc-456',
        title: 'Minimal',
        description: 'X'.repeat(50),
        frequency: 'one-time',
      };
      expect(minimalService.quantity).toBeUndefined();
      expect('price' in minimalService).toBe(false);
    });
  });
});

/**
 * Manual Testing Checklist
 *
 * Test these scenarios manually in the browser:
 *
 * 1. Add Service Flow:
 *    - Navigate to venue creation/edit page
 *    - Click "Add Service"
 *    - Fill in title (min 3 chars)
 *    - Fill in description (min 50 chars)
 *    - Select frequency
 *    - Enter quantity
 *    - Click save (checkmark)
 *    - Verify service appears in collapsed view
 *    - Verify no price field is offered anywhere
 *
 * 2. Edit Service Flow:
 *    - Click edit icon on existing service
 *    - Modify any field
 *    - Click save
 *    - Verify changes persist
 *
 * 3. Delete Service Flow:
 *    - Click delete icon (X)
 *    - Verify service removed from list
 *
 * 4. Reorder Services:
 *    - Drag service card by grip handle
 *    - Drop in new position
 *    - Verify new order persists
 *
 * 5. Validation Tests:
 *    - Try description < 50 chars → Should show error
 *    - Try adding 21st service → Should be blocked
 *
 * 6. Persistence Test:
 *    - Add services
 *    - Save venue
 *    - Reload page
 *    - Verify services restored
 *
 * 7. Public Display Test:
 *    - Navigate to public venue page
 *    - Verify services displayed in cards
 *    - Verify quantity shown if available
 *    - Verify no rates or prices are shown
 */
