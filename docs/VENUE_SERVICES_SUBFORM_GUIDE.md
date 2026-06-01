# Venue Services Sub-Form - Complete Implementation Guide

**Date:** October 17, 2025  
**Purpose:** Add services sub-form to venue builder with full CRUD operations  
**Storage:** JSONB array (recommended)  

---

## 🎯 Part 1: Storage Strategy - JSONB vs Separate Table

### Recommendation: **JSONB Array** ✅

**Why JSONB is Better for Venue Services:**

✅ **Atomic operations** - Services saved with venue in single transaction  
✅ **Simpler queries** - No joins needed to fetch venue with services  
✅ **Better performance** - One query instead of two (venue + services)  
✅ **Easier updates** - Update entire array in one operation  
✅ **Data locality** - Services always co-located with venue  
✅ **No orphans** - Delete venue = delete services automatically  
✅ **Flexible schema** - Can add fields without migrations  

**When to Use Separate Table:**
- ❌ Services shared across multiple venues
- ❌ Complex querying/filtering on services alone
- ❌ Services have many relationships (e.g., bookings per service)
- ❌ Services need separate permissions/access control

**Verdict:** For venue-specific services that aren't shared, JSONB is ideal.

---

## 📊 Part 2: Database Schema

### Current Schema (Already Implemented)

```typescript
// shared/schema.ts
export const venues = pgTable("venues", {
  // ... other fields
  services: jsonb("services").default('[]'::jsonb),
  // Stores: [{ title, description, price, frequency, quantity }, ...]
});
```

**Service Object Structure:**
```typescript
interface VenueService {
  id?: string;                    // Optional: for tracking in UI
  title: string;                  // Required: "Catering"
  description: string;            // Required: min 50 chars
  price: number;                  // Required: 2 decimals, e.g., 25.00
  frequency: "one-time" | "per_day" | "per_person" | "per_hour";
  quantity?: number;              // Optional: available quantity
}
```

**Example JSONB Data:**
```json
[
  {
    "id": "svc-1",
    "title": "Gourmet Catering",
    "description": "Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options.",
    "price": 45.00,
    "frequency": "per_day",
    "quantity": 50
  },
  {
    "id": "svc-2",
    "title": "Yoga Mat Rental",
    "description": "Premium eco-friendly yoga mats available for rent during your stay. Includes cleaning service between uses.",
    "price": 5.00,
    "frequency": "one-time",
    "quantity": 30
  }
]
```

---

## 🎨 Part 3: Enhanced ServiceEditor Component

Create `client/src/components/venue-services-editor.tsx`:

```typescript
import { useState } from "react";
import { Plus, Trash2, GripVertical, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export interface VenueService {
  id: string;
  title: string;
  description: string;
  price: number;
  frequency: "one-time" | "per_day" | "per_person" | "per_hour";
  quantity?: number;
}

interface VenueServicesEditorProps {
  services: VenueService[];
  onChange: (services: VenueService[]) => void;
  maxServices?: number;
}

export function VenueServicesEditor({ 
  services, 
  onChange,
  maxServices = 20 
}: VenueServicesEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Generate unique ID for new service
  const generateId = () => `svc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Add new service
  const addService = () => {
    const newService: VenueService = {
      id: generateId(),
      title: "",
      description: "",
      price: 0,
      frequency: "one-time",
      quantity: undefined,
    };
    onChange([...services, newService]);
    setEditingId(newService.id);
  };

  // Update service field
  const updateService = (id: string, field: keyof VenueService, value: any) => {
    const updated = services.map(service => 
      service.id === id ? { ...service, [field]: value } : service
    );
    onChange(updated);
  };

  // Delete service
  const deleteService = (id: string) => {
    onChange(services.filter(service => service.id !== id));
    if (editingId === id) setEditingId(null);
  };

  // Reorder services (drag and drop)
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null) return;

    const reordered = [...services];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, removed);

    onChange(reordered);
    setDraggedIndex(null);
  };

  // Validation
  const validateService = (service: VenueService): string[] => {
    const errors: string[] = [];
    
    if (!service.title || service.title.trim().length < 3) {
      errors.push("Title must be at least 3 characters");
    }
    
    if (!service.description || service.description.trim().length < 50) {
      errors.push("Description must be at least 50 characters");
    }
    
    if (service.price < 0) {
      errors.push("Price must be positive");
    }
    
    if (service.quantity !== undefined && service.quantity < 0) {
      errors.push("Quantity must be positive");
    }
    
    return errors;
  };

  return (
    <div className="space-y-4">
      {/* Service List */}
      {services.length > 0 && (
        <div className="space-y-3">
          {services.map((service, index) => {
            const isEditing = editingId === service.id;
            const errors = validateService(service);
            const hasErrors = errors.length > 0;

            return (
              <Card
                key={service.id}
                className={cn(
                  "transition-shadow",
                  isEditing && "ring-2 ring-primary",
                  hasErrors && !isEditing && "border-destructive"
                )}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                      <CardTitle className="text-base">
                        {isEditing ? (
                          <Input
                            value={service.title}
                            onChange={(e) => updateService(service.id, "title", e.target.value)}
                            placeholder="Service title..."
                            className="h-8"
                            data-testid={`input-service-title-${index}`}
                          />
                        ) : (
                          <span>{service.title || "(Untitled Service)"}</span>
                        )}
                      </CardTitle>
                      {!isEditing && (
                        <Badge variant="secondary">
                          ${service.price.toFixed(2)} / {service.frequency.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(null)}
                            data-testid={`button-save-service-${index}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteService(service.id)}
                            data-testid={`button-delete-service-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingId(service.id)}
                            data-testid={`button-edit-service-${index}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteService(service.id)}
                            data-testid={`button-remove-service-${index}`}
                          >
                            <X className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isEditing && (
                  <CardContent className="space-y-4 pt-0">
                    {/* Description */}
                    <div>
                      <Label htmlFor={`service-description-${service.id}`}>
                        Description *
                      </Label>
                      <Textarea
                        id={`service-description-${service.id}`}
                        value={service.description}
                        onChange={(e) => updateService(service.id, "description", e.target.value)}
                        placeholder="Describe the service in detail (minimum 50 characters)..."
                        rows={3}
                        className={cn(
                          service.description.length > 0 && service.description.length < 50 && "border-destructive"
                        )}
                        data-testid={`input-service-description-${index}`}
                      />
                      <p className="text-sm text-muted-foreground mt-1">
                        {service.description.length} / 50 minimum characters
                      </p>
                    </div>

                    {/* Price & Frequency */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`service-price-${service.id}`}>
                          Price (USD) *
                        </Label>
                        <Input
                          id={`service-price-${service.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          value={service.price}
                          onChange={(e) => updateService(service.id, "price", parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          data-testid={`input-service-price-${index}`}
                        />
                      </div>

                      <div>
                        <Label htmlFor={`service-frequency-${service.id}`}>
                          Frequency *
                        </Label>
                        <Select
                          value={service.frequency}
                          onValueChange={(value) => updateService(service.id, "frequency", value)}
                        >
                          <SelectTrigger 
                            id={`service-frequency-${service.id}`}
                            data-testid={`select-service-frequency-${index}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one-time">One-Time Fee</SelectItem>
                            <SelectItem value="per_day">Per Day</SelectItem>
                            <SelectItem value="per_person">Per Person</SelectItem>
                            <SelectItem value="per_hour">Per Hour</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Quantity */}
                    <div>
                      <Label htmlFor={`service-quantity-${service.id}`}>
                        Available Quantity (Optional)
                      </Label>
                      <Input
                        id={`service-quantity-${service.id}`}
                        type="number"
                        min="0"
                        value={service.quantity ?? ""}
                        onChange={(e) => updateService(
                          service.id, 
                          "quantity", 
                          e.target.value ? parseInt(e.target.value) : undefined
                        )}
                        placeholder="Leave empty for unlimited"
                        data-testid={`input-service-quantity-${index}`}
                      />
                    </div>

                    {/* Validation Errors */}
                    {hasErrors && (
                      <Alert variant="destructive">
                        <AlertDescription>
                          <ul className="list-disc list-inside space-y-1">
                            {errors.map((error, i) => (
                              <li key={i} className="text-sm">{error}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                )}

                {/* Collapsed View */}
                {!isEditing && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {service.description || "No description"}
                    </p>
                    {service.quantity && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Available: {service.quantity}
                      </p>
                    )}
                    {hasErrors && (
                      <Badge variant="destructive" className="mt-2">
                        Incomplete
                      </Badge>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Service Button */}
      {services.length < maxServices && (
        <Button
          type="button"
          variant="outline"
          onClick={addService}
          className="w-full"
          data-testid="button-add-service"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Service
        </Button>
      )}

      {/* Max services warning */}
      {services.length >= maxServices && (
        <Alert>
          <AlertDescription>
            Maximum {maxServices} services reached
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {services.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">
            No services added yet
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={addService}
            data-testid="button-add-first-service"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Service
          </Button>
        </div>
      )}
    </div>
  );
}
```

---

## 📝 Part 4: Zod Validation Schema

Update `client/src/schemas/venue-form-schema.ts`:

```typescript
import { z } from "zod";

// Service validation schema
export const venueServiceSchema = z.object({
  id: z.string().optional(),
  title: z.string()
    .min(3, "Service title must be at least 3 characters")
    .max(100, "Service title is too long"),
  description: z.string()
    .min(50, "Service description must be at least 50 characters")
    .max(1000, "Service description is too long"),
  price: z.number()
    .min(0, "Price must be positive")
    .max(999999.99, "Price is too high")
    .refine(
      (val) => /^\d+(\.\d{1,2})?$/.test(val.toString()),
      "Price must have maximum 2 decimal places"
    ),
  frequency: z.enum(["one-time", "per_day", "per_person", "per_hour"], {
    errorMap: () => ({ message: "Invalid frequency" })
  }),
  quantity: z.number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity must be positive")
    .optional()
    .nullable(),
});

export type VenueService = z.infer<typeof venueServiceSchema>;

// Update venue form schema
export const venueFormSchema = insertVenueSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    // ... existing fields
    
    services: z.array(venueServiceSchema)
      .max(20, "Maximum 20 services allowed")
      .default([]),
  });
```

---

## 🔌 Part 5: Integration with Venue Form

Update `client/src/pages/venue-builder.tsx`:

```typescript
import { VenueServicesEditor } from "@/components/venue-services-editor";

export function VenueBuilder() {
  const form = useForm<VenueFormValues>({
    resolver: zodResolver(venueFormSchema),
    defaultValues: {
      // ... other fields
      services: [],
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        
        {/* ... other sections ... */}

        {/* ==================== SERVICES SECTION ==================== */}
        <Card>
          <CardHeader>
            <CardTitle>On-Site Services</CardTitle>
            <CardDescription>
              What additional services do you offer?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="services"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <VenueServicesEditor
                      services={field.value}
                      onChange={field.onChange}
                      maxServices={20}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* ... submit button ... */}
      </form>
    </Form>
  );
}
```

---

## 🔒 Part 6: Server-Side Validation

Update `server/routes.ts`:

```typescript
import { z } from "zod";
import { venueServiceSchema } from "@shared/schema"; // Export from shared

// Venue service validation (server-side)
const venueServiceValidation = z.object({
  id: z.string().optional(),
  title: z.string().min(3).max(100),
  description: z.string().min(50).max(1000),
  price: z.number().min(0).max(999999.99),
  frequency: z.enum(["one-time", "per_day", "per_person", "per_hour"]),
  quantity: z.number().int().min(0).optional().nullable(),
});

// Validate services array
const servicesArrayValidation = z.array(venueServiceValidation).max(20);

// Create venue endpoint
app.post("/api/venues", async (req, res) => {
  try {
    // Validate request body
    const venueData = insertVenueSchema.parse(req.body);
    
    // Additional validation for services
    if (venueData.services) {
      try {
        servicesArrayValidation.parse(venueData.services);
      } catch (error) {
        return res.status(400).json({
          error: "Invalid services data",
          details: error.errors,
        });
      }
      
      // Validate price has max 2 decimals
      for (const service of venueData.services) {
        const priceStr = service.price.toString();
        const decimals = priceStr.split('.')[1]?.length || 0;
        if (decimals > 2) {
          return res.status(400).json({
            error: `Service "${service.title}" has invalid price format (max 2 decimal places)`,
          });
        }
      }
    }
    
    // Create venue with services
    const venue = await storage.createVenue(venueData);
    
    res.status(201).json(venue);
  } catch (error) {
    console.error("Error creating venue:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Failed to create venue" });
  }
});

// Update venue endpoint
app.patch("/api/venues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Validate services if provided
    if (updates.services) {
      servicesArrayValidation.parse(updates.services);
    }
    
    const venue = await storage.updateVenue(id, updates);
    
    if (!venue) {
      return res.status(404).json({ error: "Venue not found" });
    }
    
    res.json(venue);
  } catch (error) {
    console.error("Error updating venue:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors,
      });
    }
    res.status(500).json({ error: "Failed to update venue" });
  }
});
```

---

## 📤 Part 7: Example JSON Payloads

### Create Venue with Services

**POST** `/api/venues`

```json
{
  "name": "Zen Garden Retreat",
  "city": "Sedona",
  "slug": "zen-garden-retreat-sedona",
  "location": "123 Retreat Lane, Sedona, AZ 86336",
  "description": "A peaceful retreat center nestled in the red rocks of Sedona...",
  "capacity": 50,
  "createdBy": "user-uuid-here",
  "services": [
    {
      "id": "svc-1234567890",
      "title": "Gourmet Catering",
      "description": "Organic farm-to-table meals prepared by our in-house chef. Includes breakfast, lunch, and dinner with vegetarian and vegan options available.",
      "price": 45.00,
      "frequency": "per_day",
      "quantity": 50
    },
    {
      "id": "svc-0987654321",
      "title": "Yoga Mat Rental",
      "description": "Premium eco-friendly yoga mats available for rent during your stay. Includes cleaning service between uses for optimal hygiene.",
      "price": 5.00,
      "frequency": "one-time",
      "quantity": 30
    },
    {
      "id": "svc-5555555555",
      "title": "Guided Meditation Sessions",
      "description": "Daily guided meditation sessions led by experienced practitioners. Sessions include breathwork, mindfulness techniques, and silent meditation periods.",
      "price": 25.00,
      "frequency": "per_person",
      "quantity": null
    }
  ]
}
```

### Update Venue Services Only

**PATCH** `/api/venues/venue-uuid-here`

```json
{
  "services": [
    {
      "id": "svc-1234567890",
      "title": "Gourmet Catering (Updated)",
      "description": "Organic farm-to-table meals prepared by our award-winning chef. Now includes gluten-free and paleo options in addition to vegetarian and vegan.",
      "price": 50.00,
      "frequency": "per_day",
      "quantity": 60
    }
  ]
}
```

### Validation Error Response

**400 Bad Request**

```json
{
  "error": "Validation failed",
  "details": [
    {
      "code": "too_small",
      "minimum": 50,
      "type": "string",
      "inclusive": true,
      "message": "Service description must be at least 50 characters",
      "path": ["services", 0, "description"]
    },
    {
      "code": "invalid_enum_value",
      "options": ["one-time", "per_day", "per_person", "per_hour"],
      "received": "per_week",
      "message": "Invalid frequency",
      "path": ["services", 1, "frequency"]
    }
  ]
}
```

---

## ✅ Part 8: Unit Test Checklist

### Frontend Tests (Component Behavior)

#### Service Editor Component

- [ ] **Add service** - Click "Add Service" → New empty service appears
- [ ] **Edit service inline** - Click edit icon → Fields become editable
- [ ] **Update title** - Type in title field → Value updates
- [ ] **Update description** - Type 50+ chars → Validation passes
- [ ] **Update description (short)** - Type <50 chars → Shows error
- [ ] **Update price** - Enter number → Formatted to 2 decimals
- [ ] **Update price (invalid)** - Enter negative → Shows error
- [ ] **Select frequency** - Choose from dropdown → Value updates
- [ ] **Add quantity** - Enter number → Optional field saves
- [ ] **Save service** - Click check icon → Edit mode closes
- [ ] **Delete service** - Click delete → Service removed from list
- [ ] **Reorder services** - Drag service → Order changes
- [ ] **Max services** - Add 20 services → "Add" button disabled
- [ ] **Empty state** - No services → Shows "Add First Service" button

#### Form Integration

- [ ] **Form submission** - Submit with services → Services included in payload
- [ ] **Form validation** - Submit with invalid service → Form blocks submission
- [ ] **Default value** - Load form → Services default to empty array
- [ ] **Reset form** - Reset form → Services cleared

### Backend Tests (API Validation)

#### Create Venue with Services

```typescript
// Test: Create venue with valid services
POST /api/venues
Body: {
  name: "Test Venue",
  services: [
    {
      title: "Test Service",
      description: "A" * 50, // Exactly 50 chars
      price: 25.50,
      frequency: "per_day"
    }
  ]
}
Expected: 201 Created

// Test: Create venue with invalid service (description too short)
POST /api/venues
Body: {
  name: "Test Venue",
  services: [
    {
      title: "Test",
      description: "Too short", // < 50 chars
      price: 25.00,
      frequency: "per_day"
    }
  ]
}
Expected: 400 Bad Request
Error: "Service description must be at least 50 characters"

// Test: Create venue with invalid price (3 decimals)
POST /api/venues
Body: {
  name: "Test Venue",
  services: [
    {
      title: "Test Service",
      description: "A" * 50,
      price: 25.123, // 3 decimals
      frequency: "per_day"
    }
  ]
}
Expected: 400 Bad Request
Error: "Invalid price format (max 2 decimal places)"

// Test: Create venue with too many services
POST /api/venues
Body: {
  name: "Test Venue",
  services: [ /* 21 services */ ]
}
Expected: 400 Bad Request
Error: "Maximum 20 services allowed"

// Test: Create venue with invalid frequency
POST /api/venues
Body: {
  name: "Test Venue",
  services: [
    {
      title: "Test",
      description: "A" * 50,
      price: 25.00,
      frequency: "invalid" // Not in enum
    }
  ]
}
Expected: 400 Bad Request
Error: "Invalid frequency"
```

#### Update Venue Services

```typescript
// Test: Update existing venue services
PATCH /api/venues/:id
Body: {
  services: [
    {
      id: "svc-existing",
      title: "Updated Service",
      description: "B" * 50,
      price: 30.00,
      frequency: "per_person"
    }
  ]
}
Expected: 200 OK

// Test: Clear all services
PATCH /api/venues/:id
Body: {
  services: []
}
Expected: 200 OK
```

### Database Persistence Tests

#### JSONB Storage

```sql
-- Test: Verify services saved as JSONB
SELECT services FROM venues WHERE id = 'test-venue-id';
-- Expected: JSON array with service objects

-- Test: Query venues by service price
SELECT * FROM venues WHERE 
  EXISTS (
    SELECT 1 FROM jsonb_array_elements(services) AS service
    WHERE (service->>'price')::numeric < 50
  );
-- Expected: Venues with services under $50

-- Test: Update single service in array
UPDATE venues 
SET services = jsonb_set(
  services,
  '{0,price}',
  '35.00'
)
WHERE id = 'test-venue-id';
-- Expected: First service price updated
```

### Venue Details Page Tests

#### Service Display

- [ ] **Show services list** - Load venue page → Services render
- [ ] **Service card shows title** - Each service displays title
- [ ] **Service card shows description** - Each service displays full description
- [ ] **Service card shows price** - Formatted as "$25.00"
- [ ] **Service card shows frequency** - "Per Day", "One-Time", etc.
- [ ] **Service card shows quantity** - "Available: 30" or hidden if null
- [ ] **Empty state** - No services → Shows "No services available"
- [ ] **Service order** - Services display in saved order

Example component for venue page:

```typescript
// client/src/pages/venue-details.tsx
function VenueServices({ services }: { services: VenueService[] }) {
  if (!services || services.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No services available
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {services.map((service) => (
        <Card key={service.id} data-testid={`service-${service.id}`}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="text-lg">{service.title}</CardTitle>
              <Badge variant="secondary">
                ${service.price.toFixed(2)} / {service.frequency.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {service.description}
            </p>
            {service.quantity && (
              <p className="text-sm font-medium">
                Available: {service.quantity}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

## 🎯 Part 9: Complete UI Flow

### User Journey

```
1. Create Venue Page
   ↓
2. Scroll to "On-Site Services" section
   ↓
3. Click "Add Your First Service"
   ↓
4. Service card appears in edit mode
   ↓
5. Fill in:
   - Title: "Gourmet Catering"
   - Description: (50+ characters)
   - Price: 45.00
   - Frequency: "Per Day"
   - Quantity: 50
   ↓
6. Click ✓ (check) to save
   ↓
7. Service card collapses to summary view
   ↓
8. Click "Add Service" to add more
   ↓
9. Drag services to reorder (grab handle)
   ↓
10. Click edit icon to modify existing
    ↓
11. Click delete icon to remove
    ↓
12. Submit venue form
    ↓
13. Services saved with venue in JSONB
    ↓
14. View venue details page
    ↓
15. Services render in cards
```

### Visual States

**Empty State:**
```
┌────────────────────────────────────┐
│  No services added yet             │
│                                    │
│  [+ Add Your First Service]        │
└────────────────────────────────────┘
```

**Editing State:**
```
┌────────────────────────────────────┐
│ ≡ [Gourmet Catering ___________] [✓][🗑️] │
│                                    │
│ Description *                      │
│ [Organic farm-to-table meals...  ]│
│ 142 / 50 minimum characters        │
│                                    │
│ Price (USD) *     Frequency *      │
│ [45.00        ]  [Per Day      ▼]  │
│                                    │
│ Available Quantity (Optional)      │
│ [50           ]                    │
└────────────────────────────────────┘
```

**Collapsed State:**
```
┌────────────────────────────────────┐
│ ≡ Gourmet Catering  [$45.00 / per day] [✏️][✕] │
│                                    │
│ Organic farm-to-table meals        │
│ prepared by our in-house chef...   │
│                                    │
│ Available: 50                      │
└────────────────────────────────────┘
```

---

## 📊 Part 10: Performance Considerations

### JSONB Query Performance

**Indexing services (optional):**

```sql
-- Create GIN index for JSONB queries
CREATE INDEX idx_venues_services ON venues USING GIN (services);

-- Query example: Find venues with specific service
SELECT * FROM venues 
WHERE services @> '[{"title": "Catering"}]'::jsonb;
```

**Pros:**
- ✅ Fast queries on JSONB fields
- ✅ Supports complex queries

**Cons:**
- ❌ Larger index size
- ❌ Only needed if filtering by services frequently

**Recommendation:** Skip indexing unless you need to filter venues by service attributes.

---

## ✅ Summary

### What You Get

✅ **Complete ServiceEditor component** - Add, edit, reorder, delete  
✅ **Inline validation** - Real-time error feedback  
✅ **JSONB storage** - Atomic saves with venue  
✅ **Server validation** - Double validation on backend  
✅ **Type safety** - Full TypeScript + Zod  
✅ **Test checklist** - Comprehensive test scenarios  
✅ **Example payloads** - API request/response samples  
✅ **Venue details display** - Services render on public page  

### Files to Create/Modify

```
client/src/
  ├── components/
  │   └── venue-services-editor.tsx    ← New component
  ├── schemas/
  │   └── venue-form-schema.ts         ← Add service validation
  └── pages/
      ├── venue-builder.tsx            ← Add services section
      └── venue-details.tsx            ← Display services

server/
  └── routes.ts                        ← Add service validation

shared/
  └── schema.ts                        ← Already has services JSONB
```

**Implementation time:** ~2 hours  
**Ready to use!** All code provided above.
