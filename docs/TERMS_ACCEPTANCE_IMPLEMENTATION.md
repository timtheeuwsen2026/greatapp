# Terms Acceptance Checkbox - Complete Implementation Guide

**Date:** October 17, 2025  
**Purpose:** Enforce terms acceptance before venue submission  
**Enforcement:** Client-side + Server-side validation  

---

## 📋 Part 1: Database Schema

### Add terms_accepted Field

Update `shared/schema.ts`:

```typescript
export const venues = pgTable("venues", {
  // ... existing fields
  
  // Terms acceptance
  termsAccepted: boolean("terms_accepted").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  
  // ... rest of fields
});
```

### Migration

```bash
npm run db:push --force
```

**Verification:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'venues' 
  AND column_name IN ('terms_accepted', 'terms_accepted_at');
```

---

## 📝 Part 2: Exact Checkbox Text & Link

### Checkbox Label (Copy-Paste Ready)

```
I agree to the Terms of Service and Privacy Policy, and confirm that I have the right to list this venue on Great.
```

### Links to Include

- **Terms of Service:** `/terms-of-service`
- **Privacy Policy:** `/privacy-policy`

### Alternative Shorter Version

```
I agree to the Terms of Service and confirm I have the right to list this venue.
```

### Full HTML Text

```tsx
<span>
  I agree to the{" "}
  <a 
    href="/terms-of-service" 
    target="_blank" 
    rel="noopener noreferrer"
    className="text-primary underline hover:no-underline"
  >
    Terms of Service
  </a>
  {" "}and{" "}
  <a 
    href="/privacy-policy" 
    target="_blank" 
    rel="noopener noreferrer"
    className="text-primary underline hover:no-underline"
  >
    Privacy Policy
  </a>
  , and confirm that I have the right to list this venue on Great.
</span>
```

---

## 🎨 Part 3: Client-Side Implementation

### Update Zod Schema

Update `client/src/schemas/venue-form-schema.ts`:

```typescript
import { z } from "zod";
import { insertVenueSchema } from "@shared/schema";

export const venueFormSchema = insertVenueSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
    termsAcceptedAt: true, // Server sets this
  })
  .extend({
    // ... existing fields
    
    // Terms acceptance - REQUIRED
    termsAccepted: z.boolean()
      .refine((val) => val === true, {
        message: "You must accept the terms and conditions to continue",
      }),
  });

export type VenueFormValues = z.infer<typeof venueFormSchema>;
```

### Update Venue Form Component

Update `client/src/pages/venue-builder.tsx`:

```typescript
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { venueFormSchema, type VenueFormValues } from "@/schemas/venue-form-schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function VenueBuilder() {
  const [showTermsError, setShowTermsError] = useState(false);

  const form = useForm<VenueFormValues>({
    resolver: zodResolver(venueFormSchema),
    defaultValues: {
      // ... existing defaults
      termsAccepted: false, // Default to unchecked
    },
  });

  // Watch terms checkbox state
  const termsAccepted = form.watch("termsAccepted");

  // Handle submit button click when terms not accepted
  const handleSubmitAttempt = () => {
    if (!termsAccepted) {
      setShowTermsError(true);
      form.setError("termsAccepted", {
        type: "manual",
        message: "You must accept the terms and conditions to continue",
      });
      // Scroll to terms checkbox
      document.getElementById("terms-checkbox")?.scrollIntoView({ 
        behavior: "smooth", 
        block: "center" 
      });
      return;
    }
    setShowTermsError(false);
    form.handleSubmit(onSubmit)();
  };

  async function onSubmit(values: VenueFormValues) {
    // Double-check terms accepted
    if (!values.termsAccepted) {
      setShowTermsError(true);
      return;
    }

    // Transform data for API
    const transformedData = {
      ...values,
      termsAcceptedAt: new Date().toISOString(), // Set acceptance timestamp
    };

    createVenueMutation.mutate(transformedData);
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          
          {/* ... all other form sections ... */}

          {/* ==================== TERMS ACCEPTANCE ==================== */}
          <Card className={showTermsError ? "border-destructive" : ""}>
            <CardHeader>
              <CardTitle>Terms & Conditions</CardTitle>
              <CardDescription>
                Please review and accept our terms before submitting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Terms Checkbox */}
              <FormField
                control={form.control}
                name="termsAccepted"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="terms-checkbox"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          setShowTermsError(false);
                        }}
                        data-testid="checkbox-terms-accepted"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-sm font-normal cursor-pointer">
                        <label htmlFor="terms-checkbox">
                          I agree to the{" "}
                          <a
                            href="/terms-of-service"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline hover:no-underline"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="link-terms"
                          >
                            Terms of Service
                          </a>
                          {" "}and{" "}
                          <a
                            href="/privacy-policy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline hover:no-underline"
                            onClick={(e) => e.stopPropagation()}
                            data-testid="link-privacy"
                          >
                            Privacy Policy
                          </a>
                          , and confirm that I have the right to list this venue on Great.
                        </label>
                      </FormLabel>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              {/* Inline Error Alert */}
              {showTermsError && (
                <Alert variant="destructive" data-testid="alert-terms-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    You must accept the terms and conditions before submitting your venue.
                  </AlertDescription>
                </Alert>
              )}

            </CardContent>
          </Card>

          {/* ==================== SUBMIT SECTION ==================== */}
          <div className="flex justify-between items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/venues")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>

            <div className="flex gap-2">
              {/* Save Draft (terms not required) */}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  // Draft doesn't require terms
                  const draftData = { ...form.getValues(), status: "draft" };
                  createVenueMutation.mutate(draftData);
                }}
                disabled={createVenueMutation.isPending}
                data-testid="button-save-draft"
              >
                Save as Draft
              </Button>

              {/* Submit (terms required) */}
              <Button
                type="button"
                onClick={handleSubmitAttempt}
                disabled={!termsAccepted || createVenueMutation.isPending}
                data-testid="button-submit"
              >
                {createVenueMutation.isPending ? "Submitting..." : "Submit Venue"}
              </Button>
            </div>
          </div>

          {/* Form-level error if terms not accepted */}
          {form.formState.errors.termsAccepted && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {form.formState.errors.termsAccepted.message}
              </AlertDescription>
            </Alert>
          )}

        </form>
      </Form>
    </div>
  );
}
```

### Key Client-Side Behaviors

✅ **Checkbox unchecked by default** - `termsAccepted: false`  
✅ **Submit button disabled** - `disabled={!termsAccepted}`  
✅ **Inline error on attempt** - Shows alert if trying to submit unchecked  
✅ **Auto-scroll to checkbox** - Scrolls to terms section on error  
✅ **Links open in new tab** - `target="_blank"`  
✅ **Draft saves without terms** - Save draft bypasses requirement  
✅ **Final submit requires terms** - Only "Submit Venue" button enforces  

---

## 🔒 Part 4: Server-Side Enforcement

### API Validation

Update `server/routes.ts`:

```typescript
import { z } from "zod";

// Create venue endpoint
app.post("/api/venues", async (req, res) => {
  try {
    // Parse and validate request body
    const venueData = req.body;

    // ENFORCE TERMS ACCEPTANCE
    // Skip terms check for drafts
    if (venueData.status !== "draft") {
      if (!venueData.termsAccepted || venueData.termsAccepted !== true) {
        return res.status(400).json({
          error: "TERMS_NOT_ACCEPTED",
          message: "You must accept the terms and conditions before submitting your venue",
          code: "TERMS_REQUIRED",
        });
      }

      // Set acceptance timestamp on server (trusted source)
      venueData.termsAcceptedAt = new Date();
    }

    // Validate schema
    const validatedData = insertVenueSchema.parse(venueData);

    // Create venue
    const venue = await storage.createVenue(validatedData);

    res.status(201).json(venue);
  } catch (error) {
    console.error("Error creating venue:", error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Invalid venue data",
        details: error.errors,
      });
    }
    
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to create venue",
    });
  }
});

// Update venue endpoint
app.patch("/api/venues/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // ENFORCE TERMS ACCEPTANCE if changing status from draft
    const existingVenue = await storage.getVenueById(id);
    
    if (!existingVenue) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Venue not found",
      });
    }

    // If changing from draft to published, require terms
    if (existingVenue.status === "draft" && updates.status !== "draft") {
      if (!existingVenue.termsAccepted && !updates.termsAccepted) {
        return res.status(400).json({
          error: "TERMS_NOT_ACCEPTED",
          message: "You must accept the terms before publishing this venue",
          code: "TERMS_REQUIRED",
        });
      }

      // Set acceptance timestamp if accepting now
      if (updates.termsAccepted && !existingVenue.termsAcceptedAt) {
        updates.termsAcceptedAt = new Date();
      }
    }

    const venue = await storage.updateVenue(id, updates);

    res.json(venue);
  } catch (error) {
    console.error("Error updating venue:", error);
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "Failed to update venue",
    });
  }
});
```

### Error Response Format

**Standard error response:**

```json
{
  "error": "TERMS_NOT_ACCEPTED",
  "message": "You must accept the terms and conditions before submitting your venue",
  "code": "TERMS_REQUIRED"
}
```

**Error codes:**
- `TERMS_NOT_ACCEPTED` - Terms acceptance field is false
- `TERMS_REQUIRED` - Terms acceptance field is missing
- `VALIDATION_ERROR` - Other validation failures
- `NOT_FOUND` - Venue not found (for updates)
- `INTERNAL_ERROR` - Server error

---

## ✅ Part 5: Test Cases

### Client-Side Tests

#### Test 1: Submit Button Disabled When Unchecked

```typescript
// Test setup
const { getByTestId } = render(<VenueBuilder />);
const submitButton = getByTestId("button-submit");
const termsCheckbox = getByTestId("checkbox-terms-accepted");

// Initial state
expect(termsCheckbox).not.toBeChecked();
expect(submitButton).toBeDisabled();

// After checking
fireEvent.click(termsCheckbox);
expect(termsCheckbox).toBeChecked();
expect(submitButton).not.toBeDisabled();

// After unchecking
fireEvent.click(termsCheckbox);
expect(termsCheckbox).not.toBeChecked();
expect(submitButton).toBeDisabled();
```

**Expected:** ✅ Submit button disabled until checkbox checked

---

#### Test 2: Inline Error Shows on Submit Attempt

```typescript
// Test setup
const { getByTestId, queryByTestId } = render(<VenueBuilder />);
const submitButton = getByTestId("button-submit");

// Try to submit without accepting terms
fireEvent.click(submitButton);

// Error alert should appear
const errorAlert = queryByTestId("alert-terms-error");
expect(errorAlert).toBeInTheDocument();
expect(errorAlert).toHaveTextContent("You must accept the terms");

// Check terms
const termsCheckbox = getByTestId("checkbox-terms-accepted");
fireEvent.click(termsCheckbox);

// Error should disappear
expect(queryByTestId("alert-terms-error")).not.toBeInTheDocument();
```

**Expected:** ✅ Error alert appears when trying to submit unchecked

---

#### Test 3: Form Validation Fails Without Terms

```typescript
// Test setup
const form = useForm({
  resolver: zodResolver(venueFormSchema),
  defaultValues: {
    name: "Test Venue",
    termsAccepted: false,
    // ... other valid fields
  },
});

// Try to validate
const result = await form.trigger();

// Should fail
expect(result).toBe(false);
expect(form.formState.errors.termsAccepted).toBeDefined();
expect(form.formState.errors.termsAccepted.message).toBe(
  "You must accept the terms and conditions to continue"
);

// Accept terms
form.setValue("termsAccepted", true);
const result2 = await form.trigger();

// Should pass
expect(result2).toBe(true);
expect(form.formState.errors.termsAccepted).toBeUndefined();
```

**Expected:** ✅ Zod validation fails if terms not accepted

---

#### Test 4: Links Open in New Tab

```typescript
// Test setup
const { getByTestId } = render(<VenueBuilder />);
const termsLink = getByTestId("link-terms");
const privacyLink = getByTestId("link-privacy");

// Check attributes
expect(termsLink).toHaveAttribute("target", "_blank");
expect(termsLink).toHaveAttribute("rel", "noopener noreferrer");
expect(termsLink).toHaveAttribute("href", "/terms-of-service");

expect(privacyLink).toHaveAttribute("target", "_blank");
expect(privacyLink).toHaveAttribute("rel", "noopener noreferrer");
expect(privacyLink).toHaveAttribute("href", "/privacy-policy");
```

**Expected:** ✅ Links open in new tab with security attributes

---

#### Test 5: Draft Saves Without Terms

```typescript
// Test setup
const { getByTestId } = render(<VenueBuilder />);
const draftButton = getByTestId("button-save-draft");
const termsCheckbox = getByTestId("checkbox-terms-accepted");

// Terms not checked
expect(termsCheckbox).not.toBeChecked();

// Draft button should NOT be disabled
expect(draftButton).not.toBeDisabled();

// Click draft button
fireEvent.click(draftButton);

// API should be called without terms requirement
await waitFor(() => {
  expect(mockApiRequest).toHaveBeenCalledWith(
    "/api/venues",
    expect.objectContaining({
      body: expect.stringContaining('"status":"draft"'),
    })
  );
});
```

**Expected:** ✅ Draft saves without requiring terms acceptance

---

### Server-Side Tests

#### Test 6: API Rejects Submission Without Terms

```bash
# Test: Create venue without terms_accepted
curl -X POST http://localhost:5000/api/venues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Venue",
    "city": "Sedona",
    "slug": "test-venue-sedona",
    "description": "A test venue...",
    "capacity": 50,
    "location": "123 Test St",
    "createdBy": "user-123",
    "termsAccepted": false
  }'

# Expected Response: 400 Bad Request
{
  "error": "TERMS_NOT_ACCEPTED",
  "message": "You must accept the terms and conditions before submitting your venue",
  "code": "TERMS_REQUIRED"
}
```

**Expected:** ✅ API rejects with error code `TERMS_NOT_ACCEPTED`

---

#### Test 7: API Rejects Submission With Missing Terms Field

```bash
# Test: Create venue without terms_accepted field
curl -X POST http://localhost:5000/api/venues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Venue",
    "city": "Sedona",
    "slug": "test-venue-sedona",
    "description": "A test venue...",
    "capacity": 50,
    "location": "123 Test St",
    "createdBy": "user-123"
  }'

# Expected Response: 400 Bad Request
{
  "error": "TERMS_NOT_ACCEPTED",
  "message": "You must accept the terms and conditions before submitting your venue",
  "code": "TERMS_REQUIRED"
}
```

**Expected:** ✅ API rejects with error code `TERMS_NOT_ACCEPTED`

---

#### Test 8: API Accepts Submission With Terms

```bash
# Test: Create venue with terms_accepted = true
curl -X POST http://localhost:5000/api/venues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Venue",
    "city": "Sedona",
    "slug": "test-venue-sedona",
    "description": "A test venue...",
    "capacity": 50,
    "location": "123 Test St",
    "createdBy": "user-123",
    "termsAccepted": true
  }'

# Expected Response: 201 Created
{
  "id": "venue-uuid",
  "name": "Test Venue",
  "termsAccepted": true,
  "termsAcceptedAt": "2025-10-17T12:34:56.789Z",
  ...
}
```

**Expected:** ✅ API accepts and sets `termsAcceptedAt` timestamp

---

#### Test 9: API Allows Draft Without Terms

```bash
# Test: Create draft venue without terms
curl -X POST http://localhost:5000/api/venues \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Venue",
    "city": "Sedona",
    "slug": "test-venue-sedona",
    "description": "A test venue...",
    "capacity": 50,
    "location": "123 Test St",
    "createdBy": "user-123",
    "status": "draft",
    "termsAccepted": false
  }'

# Expected Response: 201 Created
{
  "id": "venue-uuid",
  "name": "Test Venue",
  "status": "draft",
  "termsAccepted": false,
  "termsAcceptedAt": null,
  ...
}
```

**Expected:** ✅ API allows draft creation without terms

---

#### Test 10: API Rejects Publishing Draft Without Terms

```bash
# Step 1: Create draft (allowed)
curl -X POST http://localhost:5000/api/venues \
  -d '{"status": "draft", "termsAccepted": false, ...}'

# Step 2: Try to publish without accepting terms
curl -X PATCH http://localhost:5000/api/venues/venue-uuid \
  -H "Content-Type: application/json" \
  -d '{
    "status": "pending"
  }'

# Expected Response: 400 Bad Request
{
  "error": "TERMS_NOT_ACCEPTED",
  "message": "You must accept the terms before publishing this venue",
  "code": "TERMS_REQUIRED"
}
```

**Expected:** ✅ API prevents publishing draft without terms

---

### Integration Tests

#### Test 11: End-to-End Flow

```typescript
describe("Venue Submission with Terms", () => {
  it("should enforce terms acceptance end-to-end", async () => {
    // 1. Render form
    const { getByTestId, getByRole } = render(<VenueBuilder />);
    
    // 2. Fill in all fields
    fireEvent.change(getByTestId("input-venue-name"), {
      target: { value: "Test Venue" },
    });
    // ... fill other fields
    
    // 3. Try to submit without terms
    const submitButton = getByTestId("button-submit");
    expect(submitButton).toBeDisabled();
    
    // 4. Check terms
    const termsCheckbox = getByTestId("checkbox-terms-accepted");
    fireEvent.click(termsCheckbox);
    
    // 5. Submit button enabled
    expect(submitButton).not.toBeDisabled();
    
    // 6. Submit form
    fireEvent.click(submitButton);
    
    // 7. API called with terms accepted
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalledWith(
        "/api/venues",
        expect.objectContaining({
          body: expect.stringContaining('"termsAccepted":true'),
        })
      );
    });
    
    // 8. Success response includes timestamp
    expect(mockApiResponse).toMatchObject({
      termsAccepted: true,
      termsAcceptedAt: expect.any(String),
    });
  });
});
```

**Expected:** ✅ Complete flow from checkbox to API response

---

## 📊 Part 6: Error Code Reference

| Error Code | HTTP Status | Trigger | Message |
|------------|-------------|---------|---------|
| `TERMS_NOT_ACCEPTED` | 400 | `termsAccepted` is `false` or missing | "You must accept the terms and conditions before submitting your venue" |
| `TERMS_REQUIRED` | 400 | Publishing draft without terms | "You must accept the terms before publishing this venue" |
| `VALIDATION_ERROR` | 400 | Zod validation fails | "Invalid venue data" |
| `NOT_FOUND` | 404 | Venue ID doesn't exist | "Venue not found" |
| `INTERNAL_ERROR` | 500 | Server error | "Failed to create venue" |

---

## 🎯 Part 7: Implementation Checklist

### Database
- [ ] Add `terms_accepted` boolean field
- [ ] Add `terms_accepted_at` timestamp field
- [ ] Run migration: `npm run db:push --force`
- [ ] Verify fields exist in database

### Frontend
- [ ] Update Zod schema with terms validation
- [ ] Add terms checkbox to venue form
- [ ] Add links to Terms & Privacy pages
- [ ] Implement submit button disable logic
- [ ] Add inline error alert
- [ ] Handle draft vs submit logic
- [ ] Test all client-side behaviors

### Backend
- [ ] Add terms enforcement to POST `/api/venues`
- [ ] Add terms enforcement to PATCH `/api/venues/:id`
- [ ] Set `termsAcceptedAt` timestamp on server
- [ ] Return proper error codes
- [ ] Allow drafts without terms
- [ ] Test all API endpoints

### Testing
- [ ] Write client-side unit tests
- [ ] Write server-side API tests
- [ ] Run integration tests
- [ ] Verify error messages
- [ ] Test draft flow
- [ ] Test publish flow

---

## 🚀 Summary

**What You Get:**

✅ **Client-side enforcement** - Submit button disabled until checked  
✅ **Inline validation** - Zod schema requires terms acceptance  
✅ **Error feedback** - Alert shows if trying to submit unchecked  
✅ **Auto-scroll** - Scrolls to checkbox on error  
✅ **Server-side enforcement** - API rejects if `termsAccepted !== true`  
✅ **Clear error codes** - `TERMS_NOT_ACCEPTED` with descriptive message  
✅ **Timestamp tracking** - `termsAcceptedAt` set by server  
✅ **Draft exemption** - Drafts don't require terms  
✅ **Publish enforcement** - Publishing draft requires terms  
✅ **Comprehensive tests** - 11 test cases covering all scenarios  

**Implementation Time:** ~1 hour  
**Status:** Complete code ready to implement!
