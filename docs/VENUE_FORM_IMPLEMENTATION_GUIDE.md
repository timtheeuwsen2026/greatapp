# Venue Form Implementation - Complete Guide

**Date:** October 17, 2025  
**Framework:** React Hook Form + Zod + shadcn/ui  
**Purpose:** Exact form wiring for venue builder with all new fields  

---

## Part 1: Zod Validation Schema

Create `client/src/schemas/venue-form-schema.ts`:

```typescript
import { z } from "zod";
import { insertVenueSchema } from "@shared/schema";

// Extend the base venue schema with form-specific validation
export const venueFormSchema = insertVenueSchema
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    // Required fields with custom messages
    name: z.string()
      .min(3, "Venue name must be at least 3 characters")
      .max(255, "Venue name must be less than 255 characters"),
    
    city: z.string()
      .min(2, "City is required")
      .max(255, "City name is too long"),
    
    description: z.string()
      .min(50, "Description must be at least 50 characters")
      .max(5000, "Description is too long"),
    
    capacity: z.number()
      .int("Capacity must be a whole number")
      .min(1, "Capacity must be at least 1")
      .max(10000, "Capacity seems unrealistic"),
    
    location: z.string()
      .min(5, "Full address is required"),
    
    slug: z.string()
      .min(3, "Slug is too short")
      .max(255, "Slug is too long")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only"),
    
    createdBy: z.string()
      .uuid("Invalid creator ID"),
    
    // Optional geographic fields
    latitude: z.number()
      .min(-90, "Invalid latitude")
      .max(90, "Invalid latitude")
      .optional()
      .nullable(),
    
    longitude: z.number()
      .min(-180, "Invalid longitude")
      .max(180, "Invalid longitude")
      .optional()
      .nullable(),
    
    region: z.string()
      .max(255, "Region name is too long")
      .optional()
      .nullable(),
    
    // Array fields with validation
    categories: z.array(z.string())
      .min(1, "Select at least one venue category")
      .max(5, "Maximum 5 categories allowed")
      .default([]),
    
    vibes: z.array(z.string())
      .max(10, "Maximum 10 vibes allowed")
      .default([]),
    
    amenities: z.array(z.string())
      .max(30, "Maximum 30 amenities allowed")
      .default([]),
    
    customAmenities: z.array(z.string())
      .max(10, "Maximum 10 custom amenities allowed")
      .default([]),
    
    // JSONB fields
    services: z.array(z.object({
      title: z.string().min(1, "Service title required"),
      description: z.string().optional(),
      price: z.number().min(0, "Price must be positive").optional(),
      frequency: z.enum(["per_person", "per_event", "per_day", "per_hour"]).optional(),
      quantity: z.number().int().min(1).optional(),
    })).default([]),
    
    coverImages: z.array(z.object({
      url: z.string().url("Invalid image URL"),
      altText: z.string().optional(),
      isCover: z.boolean().optional(),
    })).default([]),
    
    galleryImagesJsonb: z.array(z.object({
      url: z.string().url("Invalid image URL"),
      altText: z.string().optional(),
      order: z.number().int().optional(),
    })).default([]),
    
    // Business fields
    pricingModel: z.enum([
      "per_night",
      "per_person",
      "per_event",
      "flat_rate",
      "custom"
    ]).optional().nullable(),
    
    cancellationPolicy: z.string()
      .max(2000, "Cancellation policy is too long")
      .optional()
      .nullable(),
    
    // URLs
    website: z.string()
      .url("Invalid website URL")
      .optional()
      .nullable()
      .or(z.literal("")),
    
    instagram: z.string()
      .regex(/^@?[a-zA-Z0-9._]+$/, "Invalid Instagram handle")
      .optional()
      .nullable()
      .or(z.literal("")),
    
    // Legacy image fields (backward compatibility)
    coverImageUrl: z.string()
      .url("Invalid image URL")
      .optional()
      .nullable()
      .or(z.literal("")),
    
    galleryImages: z.array(z.string().url("Invalid image URL"))
      .default([]),
    
    // Payment fields
    depositPercent: z.number()
      .min(0, "Deposit percentage must be at least 0")
      .max(100, "Deposit percentage cannot exceed 100")
      .optional()
      .nullable(),
    
    commissionPercent: z.number()
      .min(0, "Commission percentage must be at least 0")
      .max(100, "Commission percentage cannot exceed 100")
      .optional()
      .nullable(),
    
    softHoldDays: z.number()
      .int("Must be whole days")
      .min(0, "Cannot be negative")
      .max(30, "Maximum 30 days")
      .optional()
      .nullable(),
  });

export type VenueFormValues = z.infer<typeof venueFormSchema>;
```

---

## Part 2: Form Component Setup

Create `client/src/pages/venue-builder.tsx`:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { venueFormSchema, type VenueFormValues } from "@/schemas/venue-form-schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

// shadcn components
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

// Custom components
import { MultiSelect } from "@/components/ui/multi-select";
import { ImageUploader } from "@/components/image-uploader";
import { ServiceEditor } from "@/components/service-editor";
import { LocationPicker } from "@/components/location-picker";

// Taxonomy data
import { VENUE_CATEGORIES, VENUE_VIBES } from "@shared/taxonomy";

// Slug generation utility
function generateSlug(name: string, city: string): string {
  const combined = `${name}-${city}`;
  return combined
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function VenueBuilder() {
  const { user } = useUser();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [slugPreview, setSlugPreview] = useState("");
  const [isManualSlug, setIsManualSlug] = useState(false);

  // Fetch amenities for selection
  const { data: amenities = [] } = useQuery({
    queryKey: ["/api/taxonomy/amenities"],
  });

  // Initialize form with default values
  const form = useForm<VenueFormValues>({
    resolver: zodResolver(venueFormSchema),
    defaultValues: {
      name: "",
      city: "",
      description: "",
      capacity: 10,
      location: "",
      website: "",
      instagram: "",
      slug: "",
      status: "draft",
      approved: false,
      createdBy: user?.id || "",
      
      // New geographic fields
      latitude: null,
      longitude: null,
      region: null,
      
      // Arrays
      categories: [],
      vibes: [],
      amenities: [],
      customAmenities: [],
      galleryImages: [],
      
      // JSONB
      services: [],
      coverImages: [],
      galleryImagesJsonb: [],
      
      // Business
      pricingModel: null,
      cancellationPolicy: null,
      
      // Payment
      depositPercent: null,
      commissionPercent: null,
      softHoldDays: null,
      
      // Legacy
      coverImageUrl: null,
      
      // Google Calendar
      googleCalendarConnected: false,
      googleCalendarId: null,
      featuredWeeksToFill: [],
    },
  });

  // Watch name and city for slug generation
  const watchName = form.watch("name");
  const watchCity = form.watch("city");

  // Auto-generate slug preview
  useEffect(() => {
    if (!isManualSlug && watchName && watchCity) {
      const generatedSlug = generateSlug(watchName, watchCity);
      setSlugPreview(generatedSlug);
      form.setValue("slug", generatedSlug, { shouldValidate: true });
    }
  }, [watchName, watchCity, isManualSlug, form]);

  // Create venue mutation
  const createVenueMutation = useMutation({
    mutationFn: async (data: VenueFormValues) => {
      return await apiRequest<any>("/api/venues", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Venue Created!",
        description: "Your venue has been successfully created.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/venues"] });
      navigate(`/v/${data.slug}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create venue",
        variant: "destructive",
      });
    },
  });

  // Form submission handler
  async function onSubmit(values: VenueFormValues) {
    console.log("Form submitted:", values);
    
    // Transform data for API
    const transformedData = {
      ...values,
      // Ensure createdBy is set
      createdBy: user?.id || values.createdBy,
      // Convert empty strings to null
      website: values.website || null,
      instagram: values.instagram || null,
      coverImageUrl: values.coverImageUrl || null,
      latitude: values.latitude || null,
      longitude: values.longitude || null,
      region: values.region || null,
      pricingModel: values.pricingModel || null,
      cancellationPolicy: values.cancellationPolicy || null,
      depositPercent: values.depositPercent || null,
      commissionPercent: values.commissionPercent || null,
      softHoldDays: values.softHoldDays || null,
    };

    createVenueMutation.mutate(transformedData);
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create New Venue</h1>
        <p className="text-muted-foreground">
          Add your venue to the Great. platform
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          {/* ==================== BASIC INFORMATION ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Essential details about your venue</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Venue Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue Name *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Zen Garden Retreat Center"
                        data-testid="input-venue-name"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The official name of your venue
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* City */}
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Sedona"
                        data-testid="input-city"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Slug */}
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Slug *</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          placeholder="zen-garden-retreat-center-sedona"
                          data-testid="input-slug"
                          {...field}
                          onChange={(e) => {
                            setIsManualSlug(true);
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsManualSlug(false);
                          const generated = generateSlug(watchName, watchCity);
                          form.setValue("slug", generated, { shouldValidate: true });
                        }}
                        data-testid="button-regenerate-slug"
                      >
                        Auto-Generate
                      </Button>
                    </div>
                    <FormDescription>
                      URL: great.com/v/<span className="font-mono text-primary">{slugPreview || field.value}</span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your venue, its unique features, and what makes it special..."
                        className="min-h-[150px]"
                        data-testid="input-description"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value?.length || 0} / 5000 characters (minimum 50)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Capacity */}
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum Capacity *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="50"
                        data-testid="input-capacity"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum number of people your venue can accommodate
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          {/* ==================== LOCATION & GEOGRAPHY ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Location & Geography</CardTitle>
              <CardDescription>Where is your venue located?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Full Address */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Address *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="123 Retreat Lane, Sedona, AZ 86336, USA"
                        className="min-h-[80px]"
                        data-testid="input-location"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.0000001"
                          placeholder="34.8697"
                          data-testid="input-latitude"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.0000001"
                          placeholder="-111.7610"
                          data-testid="input-longitude"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Region */}
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Region</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., North America, Southwest USA"
                        data-testid="input-region"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Geographic region or area
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Location Picker Component */}
              <LocationPicker
                onLocationSelect={(lat, lng, address) => {
                  form.setValue("latitude", lat);
                  form.setValue("longitude", lng);
                  form.setValue("location", address);
                }}
              />

            </CardContent>
          </Card>

          {/* ==================== CATEGORIZATION ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Categories & Vibes</CardTitle>
              <CardDescription>How would you describe your venue?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Categories */}
              <FormField
                control={form.control}
                name="categories"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue Categories *</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={VENUE_CATEGORIES.map(cat => ({
                          label: cat.label,
                          value: cat.value,
                          group: cat.group,
                        }))}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder="Select venue types..."
                        maxSelections={5}
                        groupBy="group"
                        data-testid="select-categories"
                      />
                    </FormControl>
                    <FormDescription>
                      Select 1-5 categories that best describe your venue
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Vibes */}
              <FormField
                control={form.control}
                name="vibes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vibes & Atmosphere</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={VENUE_VIBES.map(vibe => ({
                          label: vibe.label,
                          value: vibe.value,
                          emoji: vibe.emoji,
                        }))}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder="Select vibes..."
                        maxSelections={10}
                        searchable
                        data-testid="select-vibes"
                      />
                    </FormControl>
                    <FormDescription>
                      Choose tags that capture the atmosphere of your venue
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Selected Display */}
              {field.value && field.value.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {field.value.map((vibe) => {
                    const vibeData = VENUE_VIBES.find(v => v.value === vibe);
                    return (
                      <Badge key={vibe} variant="secondary">
                        {vibeData?.emoji} {vibeData?.label || vibe}
                      </Badge>
                    );
                  })}
                </div>
              )}

            </CardContent>
          </Card>

          {/* ==================== AMENITIES ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Amenities & Facilities</CardTitle>
              <CardDescription>What does your venue offer?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Standard Amenities */}
              <FormField
                control={form.control}
                name="amenities"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Standard Amenities</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={amenities.map(amenity => ({
                          label: amenity.name,
                          value: amenity.id,
                          group: amenity.category,
                          icon: amenity.icon,
                        }))}
                        selected={field.value}
                        onChange={field.onChange}
                        placeholder="Select amenities..."
                        searchable
                        groupBy="group"
                        data-testid="select-amenities"
                      />
                    </FormControl>
                    <FormDescription>
                      Select from our curated list of amenities
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Custom Amenities */}
              <FormField
                control={form.control}
                name="customAmenities"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom Amenities</FormLabel>
                    <FormControl>
                      <TagInput
                        tags={field.value}
                        onTagsChange={field.onChange}
                        placeholder="Type and press Enter to add custom amenity..."
                        maxTags={10}
                        data-testid="input-custom-amenities"
                      />
                    </FormControl>
                    <FormDescription>
                      Add unique amenities not in our standard list
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          Continued...
