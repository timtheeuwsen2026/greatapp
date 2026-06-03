import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { getAccessToken } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { SharedPhotoUpload, PhotoPreview } from '@/components/SharedPhotoUpload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Building, Users, ArrowLeft, ArrowRight, Save, DollarSign, AlertCircle, CheckCircle, Clock, XCircle, Upload, Image as ImageIcon, X, Calendar, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import VenueAvailability from '@/components/VenueAvailability';
import { VenueServicesEditor, type VenueService } from '@/components/VenueServicesEditor';
import { RolesEditor, type Role } from '@/components/RolesEditor';
import { GroupedMultiSelect } from '@/components/GroupedMultiSelect';
import servicesAndAmenitiesData from '@/data/options/services_and_amenities.json';
import Navigation from '@/components/navigation';

// Service validation schema
const venueServiceSchema = z.object({
  id: z.string(),
  title: z.string()
    .min(3, 'Service title must be at least 3 characters')
    .max(100, 'Service title must not exceed 100 characters'),
  description: z.string()
    .min(50, 'Service description must be at least 50 characters')
    .max(1000, 'Service description must not exceed 1000 characters'),
  price: z.number()
    .min(0, 'Price must be positive')
    .max(999999.99, 'Price is too high')
    .refine((val) => {
      if (val === undefined) return true;
      // Check for max 2 decimal places
      const decimalPlaces = (val.toString().split('.')[1] || '').length;
      return decimalPlaces <= 2;
    }, 'Price can have at most 2 decimal places')
    .optional(),
  frequency: z.enum(['one-time', 'per_day', 'per_person', 'per_hour']),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(0, 'Quantity must be positive')
    .optional(),
});

// Comprehensive schema matching database constraints
const venueProfileSchema = z.object({
  // Required fields with strict validation
  name: z.string()
    .min(1, 'Venue name is required')
    .max(255, 'Venue name must not exceed 255 characters')
    .trim(),
  
  city: z.string()
    .min(1, 'City is required')
    .max(255, 'City name must not exceed 255 characters')
    .trim(),
  
  description: z.string()
    .min(50, 'Description must be at least 50 characters to properly describe your venue')
    .max(5000, 'Description must not exceed 5000 characters')
    .trim(),
  
  venueType: z.enum(['multi_day', 'daytime']).default('multi_day'),

  capacity: z.coerce.number()
    .int('Capacity must be a whole number')
    .min(1, 'Capacity must be at least 1 person')
    .max(10000, 'Capacity must not exceed 10,000 people'),

  standingCapacity: z.coerce.number().int().min(0).optional().nullable(),
  seatedCapacity: z.coerce.number().int().min(0).optional().nullable(),

  location: z.string()
    .min(10, 'Please provide a complete address')
    .max(500, 'Address must not exceed 500 characters')
    .trim(),
  
  // Optional fields with validation when provided
  website: z.string()
    .trim()
    .refine((val) => {
      if (!val || val === '') return true;
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, 'Must be a valid URL (e.g., https://example.com)')
    .optional()
    .or(z.literal('')),
  
  instagram: z.string()
    .trim()
    .refine((val) => {
      if (!val || val === '') return true;
      // Allow @username or username format
      const cleanHandle = val.replace('@', '');
      return /^[a-zA-Z0-9._]{1,30}$/.test(cleanHandle);
    }, 'Instagram handle must be valid (letters, numbers, dots, underscores only)')
    .optional()
    .or(z.literal('')),
  
  // Step 1: Basic Info additions
  tagline: z.string()
    .max(255, 'Tagline must not exceed 255 characters')
    .optional()
    .or(z.literal('')),
  
  logoUrl: z.string().optional().or(z.literal('')),
  
  categories: z.array(z.string()).default([]),
  vibes: z.array(z.string()).default([]),
  
  amenities: z.array(z.string()).default([]),
  servicesOffered: z.array(z.string()).default([]),
  customAmenities: z.array(z.string()).default([]),
  customServicesOffered: z.array(z.string()).default([]),
  
  coverImageUrl: z.string().optional().or(z.literal('')),
  galleryImages: z.array(z.string()).default([]),
  videoUrl: z.string()
    .trim()
    .refine((val) => {
      if (!val || val === '') return true;
      try {
        new URL(val);
        return true;
      } catch {
        return false;
      }
    }, 'Must be a valid URL (e.g., https://youtube.com/watch?v=...)')
    .optional()
    .or(z.literal('')),
  
  // Step 2: Location additions
  friendlyAddress: z.string()
    .max(255, 'Friendly address must not exceed 255 characters')
    .optional()
    .or(z.literal('')),
  
  region: z.string().optional().or(z.literal('')),
  timezone: z.string().optional().or(z.literal('')),
  
  // Step 3: Contact & Social
  contactPerson: z.string().optional().or(z.literal('')),
  contactEmail: z.string()
    .email('Must be a valid email address')
    .optional()
    .or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  
  facebook: z.string().optional().or(z.literal('')),
  youtube: z.string().optional().or(z.literal('')),
  whatsapp: z.string().optional().or(z.literal('')),
  skype: z.string().optional().or(z.literal('')),
  
  // Services
  services: z.array(venueServiceSchema).max(20, 'Maximum 20 services allowed').default([]),
  
  // Step 5: Pricing & Commercial fields
  pricingModel: z.string().optional().or(z.literal('')),
  // DATA CONTRACT: Default to EUR for new venues
  currency: z.string().default('eur'),
  basePrice: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number()
      .min(0, 'Base price must be positive')
      .max(999999.99, 'Base price is too high')
      .refine((val) => {
        if (val === undefined) return true;
        const decimalPlaces = (val.toString().split('.')[1] || '').length;
        return decimalPlaces <= 2;
      }, 'Base price can have at most 2 decimal places')
      .optional()
  ),
  minStay: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number()
      .int('Minimum stay must be a whole number')
      .min(1, 'Minimum stay must be at least 1 day')
      .max(365, 'Minimum stay must not exceed 365 days')
      .optional()
  ),
  cancellationPolicy: z.string().optional().or(z.literal('')),
  
  softHoldDays: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number()
      .int('Soft hold days must be a whole number')
      .min(1, 'Soft hold days must be at least 1 day')
      .max(365, 'Soft hold days must not exceed 365 days')
      .optional()
  ),
  
  depositPercent: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number()
      .min(0, 'Deposit percentage must be at least 0%')
      .max(100, 'Deposit percentage must not exceed 100%')
      .refine((val) => {
        if (val === undefined) return true;
        const decimalPlaces = (val.toString().split('.')[1] || '').length;
        return decimalPlaces <= 2;
      }, 'Deposit percentage can have at most 2 decimal places')
      .optional()
  ),
  
  commissionPercent: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number()
      .min(0, 'Commission percentage must be at least 0%')
      .max(100, 'Commission percentage must not exceed 100%')
      .refine((val) => {
        if (val === undefined) return true;
        const decimalPlaces = (val.toString().split('.')[1] || '').length;
        return decimalPlaces <= 2;
      }, 'Commission percentage can have at most 2 decimal places')
      .optional()
  ),
  
  paymentModel: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.enum(['staggered', 'full_upfront', 'balance_on_arrival'], {
      errorMap: () => ({ message: 'Payment model must be one of: staggered, full upfront, or balance on arrival' })
    }).optional()
  ),
  
  approvalMode: z.string().optional().or(z.literal('')),
  commercialModel: z.string().optional().or(z.literal('')),
  
  // Step 3: Calendar - Google Calendar sync
  googleCalendarConnected: z.boolean().default(false),
  googleCalendarId: z.string().optional().or(z.literal('')),
  
  // Step 6: Roles
  venueRoles: z.array(z.object({
    name: z.string(),
    required: z.boolean().default(false),
    headcount: z.number().min(1).default(1),
    rate: z.number().optional(),
    notes: z.string().optional(),
  })).default([]),
  
  // Step 7: Rooms (similar to journey-builder)
  venueRoomTypes: z.array(z.object({
    name: z.string().min(1, 'Room name is required'),
    type: z.string().min(1, 'Room type is required'),
    capacity: z.number().min(1, 'Capacity must be at least 1'),
    bedConfiguration: z.string().optional(),
    quantity: z.number().min(1, 'Quantity must be at least 1').default(1),
    pricePerNight: z.number().min(0, 'Price per night cannot be negative'),
    description: z.string().optional(),
  })).default([]),
  
  // Step 8: Itinerary (default template for events)
  defaultItinerary: z.array(z.object({
    day: z.number(),
    title: z.string(),
    description: z.string().optional(),
    timeSlots: z.array(z.object({
      id: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      title: z.string(),
      description: z.string().optional(),
    })).default([]),
  })).default([]),
  
  // Step 9: Pricing Model Section
  // Option A - Whole Venue Pricing (only basePricePerDay - basePricePerEvent and cleaningFee removed per Milestone 1)
  basePricePerDay: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number().min(0, 'Price must be positive').optional()
  ),
  
  // Option B - Per Room Pricing
  useRoomPricesFromRoomsPage: z.boolean().default(true),
  defaultPricePerRoomPerNight: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number().min(0, 'Price must be positive').optional()
  ),
  minimumNights: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number().int().min(1, 'Minimum 1 night').optional()
  ),
  
  // Payment Timing Model
  paymentTimingModel: z.enum(['soft_hold_deposit_balance', 'deposit_upfront_balance', 'deposit_balance_arrival']).optional(),
  softHoldDurationDays: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number().int().min(1, 'Minimum 1 day').max(365, 'Maximum 365 days').optional()
  ),
  balanceDueDaysBeforeArrival: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.coerce.number().int().min(1, 'Minimum 1 day').max(90, 'Maximum 90 days').optional()
  ),
  
  // Pricing Notes
  pricingNotes: z.string().optional().or(z.literal('')),
  
  // Step 10: Terms & Conditions
  termsAndConditionsUrl: z.string().optional().or(z.literal('')),
  houseRules: z.string().optional().or(z.literal('')),
  damagePolicy: z.string().optional().or(z.literal('')),
  termsConfirmed: z.boolean().default(false),
});

type VenueProfileForm = z.infer<typeof venueProfileSchema>;

// Amenities - physical features of the venue (ordered by most frequently used)
const commonAmenities = [
  'WiFi',
  'Air Conditioning',
  'Kitchen',
  'Dining Room',
  'Parking',
  'Pool',
  'Yoga Studio',
  'Meditation Hall',
  'Gym',
  'Spa',
  'Beach Access',
  'Hot Tub',
  'Sauna',
  'BBQ Area',
  'Garden',
  'Terrace',
  'Conference Room',
  'Coworking Space',
  'Library',
  'Fireplace',
  'Restaurant',
  'Bar',
  'Pet Friendly',
  'Wheelchair Accessible'
];

// Services - things the venue provides (ordered by most frequently used)
const commonServices = [
  'Daily Housekeeping',
  'Airport Pickup',
  'Laundry Service',
  'Local Guide',
  'Event Coordinator',
  'Yoga Teacher Booking',
  'Massage or Wellness Practitioner',
  'Excursion Booking',
  'Marketing Support'
];

const venueCategories = [
  'Retreat Center', 'Villa', 'Studio', 'Eco-Lodge', 'Hotel',
  'Co-Living', 'Workation Property', 'Outdoor Spot'
];

const venueVibes = [
  'Jungle', 'Beach', 'Urban', 'Mountain', 'Remote', 'Luxury',
  'Eco', 'Spiritual', 'Adventure', 'Digital Nomad Friendly'
];

const viewsEnvironment = [
  'Ocean View', 'Lake View', 'Mountain View', 'Forest View',
  'City View', 'Quiet Area', 'Beach Access', 'Hiking Trails'
];

const accommodationTypes = [
  'Private Rooms', 'Shared Rooms', 'Dormitory', 'Glamping', 'Camping'
];

const currencies = ['USD', 'EUR', 'GBP', 'IDR', 'THB', 'MXN', 'AUD'];

const cancellationPolicies = ['Flexible', 'Moderate', 'Strict'];

const approvalModes = ['Direct', 'Approval', 'Fully Managed'];

const commercialModels = ['Fixed Rental', 'Revenue Share', 'Flexible'];

const regions = [
  'North America', 'South America', 'Europe', 'Africa', 'Asia',
  'Oceania', 'Central America', 'Caribbean', 'Middle East'
];

export default function VenueProfileSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  // Daytime Space: skip Rooms (step 7) and Default Itinerary (step 8)
  const isDaytime = form.watch('venueType') === 'daytime';
  const DAYTIME_SKIP_STEPS = [7, 8]; // Rooms & Itinerary hidden for daytime spaces

  // Get venue ID from URL for edit mode
  const urlParams = new URLSearchParams(window.location.search);
  const editVenueId = urlParams.get('edit');

  const form = useForm<VenueProfileForm>({
    resolver: zodResolver(venueProfileSchema),
    defaultValues: {
      name: '',
      tagline: '',
      city: '',
      description: '',
      venueType: 'multi_day',
      capacity: 1,
      standingCapacity: undefined,
      seatedCapacity: undefined,
      location: '',
      friendlyAddress: '',
      logoUrl: '',
      website: '',
      instagram: '',
      categories: [],
      vibes: [],
      amenities: [],
      servicesOffered: [],
      customAmenities: [],
      customServicesOffered: [],
      coverImageUrl: '',
      galleryImages: [],
      region: '',
      timezone: '',
      contactPerson: '',
      contactEmail: '',
      contactPhone: '',
      facebook: '',
      youtube: '',
      whatsapp: '',
      skype: '',
      services: [],
      pricingModel: '',
      // DATA CONTRACT: Default to EUR for new venues
      currency: 'eur',
      basePrice: undefined,
      minStay: undefined,
      cancellationPolicy: '',
      softHoldDays: undefined,
      depositPercent: undefined,
      commissionPercent: undefined,
      paymentModel: undefined,
      approvalMode: '',
      commercialModel: '',
      googleCalendarConnected: false,
      googleCalendarId: '',
      venueRoles: [],
      venueRoomTypes: [],
      defaultItinerary: [],
      pricingNotes: '',
      // New Page 9 fields (basePricePerEvent and cleaningFee removed per Milestone 1)
      basePricePerDay: undefined,
      useRoomPricesFromRoomsPage: true,
      defaultPricePerRoomPerNight: undefined,
      minimumNights: undefined,
      paymentTimingModel: undefined,
      softHoldDurationDays: undefined,
      balanceDueDaysBeforeArrival: undefined,
      // New Page 10 fields
      termsAndConditionsUrl: '',
      houseRules: '',
      damagePolicy: '',
      termsConfirmed: false,
    },
  });

  // Load existing venue data for editing
  const { data: existingVenue, isLoading: isLoadingVenue } = useQuery({
    queryKey: ['/api/venues', editVenueId, 'edit'],
    queryFn: async () => {
      const response = await fetch(`/api/venues/${editVenueId}/edit`);
      if (!response.ok) throw new Error('Failed to fetch venue');
      return response.json();
    },
    enabled: !!editVenueId,
  });

  // Populate form when editing
  useEffect(() => {
    if (existingVenue) {
      form.reset({
        name: existingVenue.name || '',
        tagline: existingVenue.tagline || '',
        city: existingVenue.city || '',
        description: existingVenue.description || '',
        capacity: existingVenue.capacity || 1,
        location: existingVenue.location || '',
        friendlyAddress: existingVenue.friendlyAddress || '',
        logoUrl: existingVenue.logoUrl || '',
        website: existingVenue.website || '',
        instagram: existingVenue.instagram || '',
        categories: existingVenue.categories || [],
        vibes: existingVenue.vibes || [],
        amenities: existingVenue.amenities || [],
        servicesOffered: existingVenue.servicesOffered || [],
        customAmenities: existingVenue.customAmenities || [],
        customServicesOffered: existingVenue.customServicesOffered || [],
        coverImageUrl: existingVenue.coverImageUrl || '',
        galleryImages: existingVenue.galleryImages || [],
        region: existingVenue.region || '',
        timezone: existingVenue.timezone || '',
        contactPerson: existingVenue.contactPerson || '',
        contactEmail: existingVenue.contactEmail || '',
        contactPhone: existingVenue.contactPhone || '',
        facebook: existingVenue.facebook || '',
        youtube: existingVenue.youtube || '',
        whatsapp: existingVenue.whatsapp || '',
        skype: existingVenue.skype || '',
        services: existingVenue.services || [],
        pricingModel: existingVenue.pricingModel || '',
        // DATA CONTRACT: Default to EUR for legacy venues
        currency: existingVenue.currency || 'eur',
        basePrice: existingVenue.basePrice ?? undefined,
        minStay: existingVenue.minStay ?? undefined,
        cancellationPolicy: existingVenue.cancellationPolicy || '',
        softHoldDays: existingVenue.softHoldDays ?? undefined,
        depositPercent: existingVenue.depositPercent ?? undefined,
        commissionPercent: existingVenue.commissionPercent ?? undefined,
        paymentModel: existingVenue.paymentModel ?? undefined,
        approvalMode: existingVenue.approvalMode || '',
        commercialModel: existingVenue.commercialModel || '',
        googleCalendarConnected: existingVenue.googleCalendarConnected || false,
        googleCalendarId: existingVenue.googleCalendarId || '',
        venueRoles: existingVenue.venueRoles || [],
        venueRoomTypes: existingVenue.venueRoomTypes || [],
        defaultItinerary: existingVenue.defaultItinerary || [],
        // New Page 9 fields (basePricePerEvent and cleaningFee removed per Milestone 1)
        pricingNotes: existingVenue.pricingNotes || '',
        basePricePerDay: existingVenue.basePricePerDay ?? undefined,
        useRoomPricesFromRoomsPage: existingVenue.useRoomPricesFromRoomsPage ?? true,
        defaultPricePerRoomPerNight: existingVenue.defaultPricePerRoomPerNight ?? undefined,
        minimumNights: existingVenue.minimumNights ?? undefined,
        paymentTimingModel: existingVenue.paymentTimingModel ?? undefined,
        softHoldDurationDays: existingVenue.softHoldDurationDays ?? undefined,
        balanceDueDaysBeforeArrival: existingVenue.balanceDueDaysBeforeArrival ?? undefined,
        // New Page 10 fields
        termsAndConditionsUrl: existingVenue.termsAndConditionsUrl || '',
        houseRules: existingVenue.houseRules || '',
        damagePolicy: existingVenue.damagePolicy || '',
        termsConfirmed: existingVenue.termsConfirmed ?? false,
      });
    }
  }, [existingVenue, form]);

  // Filter and sort amenities based on search

  // Mutation for saving venue (create or update)
  const profileMutation = useMutation({
    mutationFn: async (data: VenueProfileForm) => {
      if (editVenueId) {
        return apiRequest('PUT', `/api/venues/${editVenueId}`, data);
      } else {
        return apiRequest('POST', '/api/venues', data);
      }
    },
    onSuccess: async (response) => {
      const venue = await response.json();
      
      toast({
        title: editVenueId ? 'Venue updated!' : 'Venue saved as draft!',
        description: editVenueId 
          ? 'Your venue has been successfully updated.' 
          : 'Your venue has been saved. Submit it for review when ready.',
      });
      
      // Comprehensive cache invalidation for immediate UI update
      const invalidationPromises = [
        // All venues lists
        queryClient.invalidateQueries({ queryKey: ['/api/venues'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/user/venues'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/admin/venues'] }),
        
        // Venue-specific queries
        queryClient.invalidateQueries({ queryKey: ['venue', venue.slug] }),
        queryClient.invalidateQueries({ queryKey: ['venue', venue.id] }),
        
        // Venue services (if services were updated)
        queryClient.invalidateQueries({ queryKey: ['services', venue.id] }),
        
        // Venue pricing (if pricing was updated)
        queryClient.invalidateQueries({ queryKey: ['pricing', venue.id] }),
        
        // Venue availability
        queryClient.invalidateQueries({ queryKey: ['/api/venues', venue.id, 'availability'] }),
      ];
      
      // Invalidate public venue page by slug
      if (venue.slug) {
        invalidationPromises.push(
          queryClient.invalidateQueries({ queryKey: [`/api/v/${venue.slug}`] })
        );
      }
      
      // Invalidate edit mode query
      if (editVenueId) {
        invalidationPromises.push(
          queryClient.invalidateQueries({ queryKey: ['/api/venues', editVenueId, 'edit'] })
        );
      }
      
      // Wait for all invalidations to complete
      await Promise.all(invalidationPromises);
      
      // Stay on the page if it's a new venue so user can submit for review
      if (editVenueId) {
        setLocation('/venue-dashboard');
      } else {
        // Update the URL to edit mode
        window.history.replaceState({}, '', `/venue-profile-setup?edit=${venue.id}`);
        window.location.href = `/venue-profile-setup?edit=${venue.id}`;
      }
    },
    onError: (error: Error) => {
      toast({
        title: editVenueId ? 'Error updating venue' : 'Error creating venue',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Mutation for submitting venue for review
  const submitForReviewMutation = useMutation({
    mutationFn: async (venueId: string) => {
      return apiRequest('PATCH', `/api/venues/${venueId}/submit`, {});
    },
    onSuccess: async () => {
      toast({
        title: 'Venue submitted for review!',
        description: 'Your venue will be reviewed by our team. You\'ll be notified once it\'s approved.',
      });
      
      // Comprehensive cache invalidation for venue status change
      const invalidationPromises = [
        // All venues lists (admin will see it in pending)
        queryClient.invalidateQueries({ queryKey: ['/api/venues'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/user/venues'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/admin/venues'] }),
        
        // Venue-specific queries
        queryClient.invalidateQueries({ queryKey: ['venue', existingVenue?.slug] }),
        queryClient.invalidateQueries({ queryKey: ['venue', editVenueId] }),
      ];
      
      // Invalidate public venue page by slug
      if (existingVenue?.slug) {
        invalidationPromises.push(
          queryClient.invalidateQueries({ queryKey: [`/api/v/${existingVenue.slug}`] })
        );
      }
      
      // Wait for all invalidations
      await Promise.all(invalidationPromises);
      
      setLocation('/venue-dashboard');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error submitting venue',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: VenueProfileForm) => {
    console.log('Submitting venue profile:', {
      ...data,
      coverImageUrl: data.coverImageUrl || '(empty)',
      galleryImages: data.galleryImages?.length ? `${data.galleryImages.length} images` : '(empty)',
      galleryImagesList: data.galleryImages
    });
    
    // Convert decimal fields to strings and integer fields to numbers for backend compatibility
    const cleanedData = {
      ...data,
      galleryImages: data.galleryImages?.filter((url: string) => url && url.trim()) || [],
      // Decimal fields (prices, percentages) as strings - basePricePerEvent and cleaningFee removed per Milestone 1
      basePrice: data.basePrice ? String(data.basePrice) : null,
      basePricePerDay: data.basePricePerDay ? String(data.basePricePerDay) : null,
      defaultPricePerRoomPerNight: data.defaultPricePerRoomPerNight ? String(data.defaultPricePerRoomPerNight) : null,
      depositPercent: data.depositPercent ? String(data.depositPercent) : null,
      commissionPercent: data.commissionPercent ? String(data.commissionPercent) : null,
      // Integer fields as numbers (capacity is required so always a number)
      capacity: data.capacity ? Number(data.capacity) : data.capacity,
      standingCapacity: data.standingCapacity != null ? Number(data.standingCapacity) : null,
      seatedCapacity: data.seatedCapacity != null ? Number(data.seatedCapacity) : null,
      minimumNights: data.minimumNights ? Number(data.minimumNights) : null,
      softHoldDurationDays: data.softHoldDurationDays ? Number(data.softHoldDurationDays) : null,
      balanceDueDaysBeforeArrival: data.balanceDueDaysBeforeArrival ? Number(data.balanceDueDaysBeforeArrival) : null,
      softHoldDays: data.softHoldDays ? Number(data.softHoldDays) : null,
      minStay: data.minStay ? Number(data.minStay) : null,
    };
    
    console.log('Cleaned data for submission:', cleanedData);
    profileMutation.mutate(cleanedData as unknown as VenueProfileForm);
  };

  const handleNext = async () => {
    // Validate current step fields before proceeding
    let fieldsToValidate: (keyof VenueProfileForm)[] = [];
    
    if (step === 1) {
      // Step 1: Basic Info
      fieldsToValidate = ['name', 'city', 'description', 'capacity'];
    } else if (step === 2) {
      // Step 2: Media
      fieldsToValidate = ['coverImageUrl', 'galleryImages'];
    } else if (step === 3) {
      // Step 3: Calendar (availability only, no required fields)
      fieldsToValidate = [];
    } else if (step === 4) {
      // Step 4: Venue (location details)
      fieldsToValidate = ['location', 'website', 'instagram'];
    } else if (step === 5) {
      // Step 5: Services & Amenities
      fieldsToValidate = ['amenities', 'services', 'depositPercent', 'commissionPercent', 'paymentModel'];
    } else if (step === 6) {
      // Step 6: Roles (optional)
      fieldsToValidate = [];
    } else if (step === 7) {
      // Step 7: Rooms (optional)
      fieldsToValidate = [];
    } else if (step === 8) {
      // Step 8: Itinerary (optional)
      fieldsToValidate = [];
    } else if (step === 9) {
      // Step 9: Pricing (optional)
      fieldsToValidate = [];
    } else if (step === 10) {
      // Step 10: Terms (optional)
      fieldsToValidate = [];
    }
    
    // Trigger validation for current step fields (skip if none)
    if (fieldsToValidate.length > 0) {
      const isValid = await form.trigger(fieldsToValidate);
      
      if (!isValid) {
        toast({
          title: 'Validation Error',
          description: 'Please fix the errors before proceeding to the next step.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    if (step < 10) {
      // Skip Rooms & Itinerary steps for daytime spaces
      let nextStep = step + 1;
      while (isDaytime && DAYTIME_SKIP_STEPS.includes(nextStep) && nextStep <= 10) {
        nextStep++;
      }
      setStep(nextStep <= 10 ? nextStep : 10);
    } else {
      form.handleSubmit(onSubmit)();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      let prevStep = step - 1;
      while (isDaytime && DAYTIME_SKIP_STEPS.includes(prevStep) && prevStep >= 1) {
        prevStep--;
      }
      setStep(prevStep >= 1 ? prevStep : 1);
    } else {
      setLocation('/');
    }
  };


  // Helper functions for array management
  const addVenueRoomType = () => {
    const currentRooms = form.getValues("venueRoomTypes");
    form.setValue("venueRoomTypes", [
      ...currentRooms,
      { name: "", type: "", capacity: 1, bedConfiguration: "", quantity: 1, pricePerNight: 0, description: "" }
    ]);
  };

  const removeVenueRoomType = (index: number) => {
    const currentRooms = form.getValues("venueRoomTypes");
    form.setValue("venueRoomTypes", currentRooms.filter((_, i) => i !== index));
  };

  const addItineraryDay = () => {
    const currentItinerary = form.getValues("defaultItinerary");
    const nextDay = currentItinerary.length + 1;
    form.setValue("defaultItinerary", [
      ...currentItinerary,
      { day: nextDay, title: "", description: "", timeSlots: [] }
    ]);
  };

  const removeItineraryDay = (index: number) => {
    const currentItinerary = form.getValues("defaultItinerary");
    form.setValue("defaultItinerary", currentItinerary.filter((_, i) => i !== index));
  };

  const addTimeSlot = (dayIndex: number) => {
    const currentItinerary = form.getValues("defaultItinerary");
    const updatedItinerary = [...currentItinerary];
    
    if (!updatedItinerary[dayIndex].timeSlots) {
      updatedItinerary[dayIndex].timeSlots = [];
    }
    
    updatedItinerary[dayIndex].timeSlots.push({
      id: `slot-${Date.now()}-${Math.random()}`,
      startTime: "",
      endTime: "",
      title: "",
      description: ""
    });
    
    form.setValue('defaultItinerary', updatedItinerary);
  };

  const removeTimeSlot = (dayIndex: number, slotId: string) => {
    const currentItinerary = form.getValues("defaultItinerary");
    const updatedItinerary = [...currentItinerary];
    updatedItinerary[dayIndex].timeSlots = updatedItinerary[dayIndex].timeSlots.filter(
      (slot: any) => slot.id !== slotId
    );
    form.setValue('defaultItinerary', updatedItinerary);
  };

  const updateTimeSlot = (dayIndex: number, slotId: string, field: string, value: string) => {
    const currentItinerary = form.getValues("defaultItinerary");
    const updatedItinerary = [...currentItinerary];
    const slotIndex = updatedItinerary[dayIndex].timeSlots.findIndex((s: any) => s.id === slotId);
    if (slotIndex !== -1) {
      const slot = updatedItinerary[dayIndex].timeSlots[slotIndex];
      (slot as any)[field] = value;
      
      // Validate that start time is before end time
      if ((field === 'startTime' || field === 'endTime') && slot.startTime && slot.endTime) {
        if (slot.startTime >= slot.endTime) {
          toast({
            title: "Invalid Time Range",
            description: "Start time must be before end time",
            variant: "destructive",
          });
          return;
        }
      }
      
      form.setValue('defaultItinerary', updatedItinerary);
    }
  };

  const handleSubmitForReview = async () => {
    if (!editVenueId) {
      // If no venue ID yet, save first
      const isValid = await form.trigger();
      if (!isValid) {
        toast({
          title: 'Validation Error',
          description: 'Please fix all errors before submitting for review.',
          variant: 'destructive',
        });
        return;
      }
      form.handleSubmit(onSubmit)();
      return;
    }

    // Submit existing venue for review
    submitForReviewMutation.mutate(editVenueId);
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return null;
    
    const statusConfig = {
      draft: { 
        icon: AlertCircle, 
        label: 'Draft', 
        variant: 'secondary' as const,
        description: 'Your venue is saved but not yet submitted for review'
      },
      pending: { 
        icon: Clock, 
        label: 'Pending Review', 
        variant: 'default' as const,
        description: 'Your venue is being reviewed by our team'
      },
      approved: { 
        icon: CheckCircle, 
        label: 'Approved', 
        variant: 'default' as const,
        description: 'Your venue is approved and publicly visible'
      },
      rejected: { 
        icon: XCircle, 
        label: 'Rejected', 
        variant: 'destructive' as const,
        description: 'Your venue was not approved. Please review and resubmit'
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    const Icon = config.icon;
    return (
      <Alert className="mb-4" data-testid={`alert-status-${status}`}>
        <Icon className="h-4 w-4" />
        <AlertDescription>
          <div className="flex items-center justify-between">
            <div>
              <Badge variant={config.variant} className="mr-2" data-testid={`badge-status-${status}`}>
                {config.label}
              </Badge>
              <span className="text-sm">{config.description}</span>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  };

  // Show loading state when fetching venue for editing
  if (editVenueId && isLoadingVenue) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <Card>
            <CardContent className="py-12">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
                  <span className="sr-only">Loading...</span>
                </div>
                <p className="mt-4 text-muted-foreground">Loading venue details...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const progress = (step / 10) * 100;

  const stepTitles = [
    'Basic Information',
    'Photos & Media',
    'Calendar & Availability',
    'Location Details',
    'Services & Amenities',
    'Roles & Staffing',
    'Rooms',
    'Default Itinerary',
    'Pricing',
    'Terms & Review'
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {editVenueId ? 'Edit Venue Profile' : 'Create Venue Profile'}
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Step {step} of 10: {stepTitles[step - 1]}
              </p>
            </div>
          </div>
          
          <Progress value={progress} className="h-2" />
        </div>

        {/* Form Content */}
        <Form {...form}>
          <form className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="w-5 h-5" />
                  {stepTitles[step - 1]}
                </CardTitle>
                <p className="text-gray-600 dark:text-gray-400">
                  {step === 1 && 'Enter your venue\'s basic details including name, location, and capacity.'}
                  {step === 2 && 'Upload photos to showcase your venue to potential event creators.'}
                  {step === 3 && 'Manage your venue\'s availability and booking calendar settings.'}
                  {step === 4 && 'Provide detailed location information including address and coordinates.'}
                  {step === 5 && 'Select amenities and services your venue offers to guests.'}
                  {step === 6 && 'Define roles and staffing available at your venue.'}
                  {step === 7 && 'Configure room types and accommodation options.'}
                  {step === 8 && 'Create a default itinerary template for events at your venue.'}
                  {step === 9 && 'Set up pricing, payment terms, and commercial details.'}
                  {step === 10 && 'Review and accept the terms before submitting your venue.'}
                </p>
              </CardHeader>
              <CardContent className="min-h-[400px]">
                {/* Display status badge for existing venues */}
                {editVenueId && existingVenue && getStatusBadge(existingVenue.status)}
                
                {step === 1 && (
                  <div className="space-y-6">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Venue Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Amazing Retreat Center" 
                              {...field} 
                              maxLength={255}
                              data-testid="input-venue-name" 
                            />
                          </FormControl>
                          <FormDescription className="flex justify-between">
                            <span>The official name of your venue</span>
                            <span className="text-xs">{field.value?.length || 0}/255</span>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Ubud" 
                              {...field} 
                              maxLength={255}
                              data-testid="input-city" 
                            />
                          </FormControl>
                          <FormDescription className="flex justify-between">
                            <span>City where your venue is located</span>
                            <span className="text-xs">{field.value?.length || 0}/255</span>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Beachfront yoga shala with accommodation for 20 participants. Located in a peaceful area with stunning ocean views..."
                              rows={6}
                              {...field}
                              maxLength={5000}
                              data-testid="textarea-description" 
                            />
                          </FormControl>
                          <FormDescription className="flex justify-between">
                            <span>Minimum 50 characters - describe what makes your venue special</span>
                            <span className="text-xs">{field.value?.length || 0}/5000</span>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Venue Type — controls which onboarding steps appear */}
                    <FormField
                      control={form.control}
                      name="venueType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Space Type *</FormLabel>
                          <FormDescription>
                            Choose how your venue operates. <strong>Daytime Space</strong> hides multi-day room & itinerary steps.
                          </FormDescription>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            {[
                              { value: 'multi_day', label: '🏡 Multi-Day Venue', desc: 'Retreats, overnight stays, multi-day events' },
                              { value: 'daytime',   label: '☀️ Daytime Space',   desc: 'Co-working hubs, studios, one-day pop-ups' },
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => field.onChange(opt.value)}
                                className={`p-4 rounded-lg border-2 text-left transition-colors ${
                                  field.value === opt.value
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50'
                                }`}
                                data-testid={`btn-venue-type-${opt.value}`}
                              >
                                <div className="font-semibold text-sm">{opt.label}</div>
                                <div className="text-xs text-muted-foreground mt-1">{opt.desc}</div>
                              </button>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="capacity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            {isDaytime ? 'Max Capacity *' : 'Capacity (participants) *'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={10000}
                              {...field}
                              data-testid="input-capacity"
                            />
                          </FormControl>
                          <FormDescription>
                            {isDaytime
                              ? 'Total maximum number of people the space can hold'
                              : 'Maximum number of participants your venue can accommodate (1-10,000)'}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Daytime-only capacity breakdown */}
                    {isDaytime && (
                      <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                        <p className="col-span-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                          ☀️ Daytime Space — Capacity Breakdown
                        </p>
                        <FormField
                          control={form.control}
                          name="standingCapacity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Standing Capacity</FormLabel>
                              <FormControl>
                                <Input type="number" min={0} placeholder="e.g. 80"
                                  {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                  data-testid="input-standing-capacity" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="seatedCapacity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Seated Capacity</FormLabel>
                              <FormControl>
                                <Input type="number" min={0} placeholder="e.g. 40"
                                  {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                                  data-testid="input-seated-capacity" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="categories"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Venue Type *</FormLabel>
                          <FormDescription>
                            Select the categories that best describe your venue
                          </FormDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {venueCategories.map((category) => {
                              const isSelected = field.value?.includes(category);
                              return (
                                <Badge
                                  key={category}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                  onClick={() => {
                                    const current = field.value || [];
                                    if (isSelected) {
                                      field.onChange(current.filter((c: string) => c !== category));
                                    } else {
                                      field.onChange([...current, category]);
                                    }
                                  }}
                                  data-testid={`badge-category-${category.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  {category}
                                </Badge>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vibes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Venue Vibes</FormLabel>
                          <FormDescription>
                            Select the vibes and atmosphere of your venue
                          </FormDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {venueVibes.map((vibe) => {
                              const isSelected = field.value?.includes(vibe);
                              return (
                                <Badge
                                  key={vibe}
                                  variant={isSelected ? "default" : "outline"}
                                  className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                  onClick={() => {
                                    const current = field.value || [];
                                    if (isSelected) {
                                      field.onChange(current.filter((v: string) => v !== vibe));
                                    } else {
                                      field.onChange([...current, vibe]);
                                    }
                                  }}
                                  data-testid={`badge-vibe-${vibe.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  {vibe}
                                </Badge>
                              );
                            })}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-8">
                    <FormField
                      control={form.control}
                      name="coverImageUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cover Image *</FormLabel>
                          <FormDescription>
                            Upload a high-quality cover image that represents your venue. This will be the main image people see.
                          </FormDescription>
                          
                          {field.value ? (
                            <PhotoPreview
                              src={field.value}
                              alt="Cover image preview"
                              onRemove={() => field.onChange('')}
                              className="h-64"
                              size="lg"
                            />
                          ) : (
                            <SharedPhotoUpload
                              uploadType="s3"
                              onUploadComplete={field.onChange}
                              getUploadParameters={async () => {
                                const response = await apiRequest('POST', '/api/objects/upload');
                                if (!response.ok) throw new Error('Failed to get upload URL');
                                const { uploadURL } = await response.json();
                                return { method: 'PUT' as const, url: uploadURL };
                              }}
                              maxFileSize={10485760}
                              multiple={false}
                              className="min-h-[200px]"
                              data-testid="uploader-cover-image"
                            >
                              <div className="p-8 text-center">
                                <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <Button type="button" variant="outline" className="mb-2">
                                  <Upload className="w-4 h-4 mr-2" />
                                  Upload Cover Image
                                </Button>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  or drag and drop your image here
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  JPG, PNG, or WEBP up to 10MB
                                </p>
                              </div>
                            </SharedPhotoUpload>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="galleryImages"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gallery Images (Optional)</FormLabel>
                          <FormDescription>
                            Add additional photos to showcase different aspects of your venue.
                          </FormDescription>
                          
                          {field.value && field.value.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                              {field.value.map((url: string, index: number) => (
                                <PhotoPreview
                                  key={index}
                                  src={url}
                                  alt={`Gallery image ${index + 1}`}
                                  onRemove={() => {
                                    const newGallery = field.value.filter((_: string, i: number) => i !== index);
                                    field.onChange(newGallery);
                                  }}
                                  className="h-32"
                                  size="md"
                                />
                              ))}
                            </div>
                          )}
                          
                          <SharedPhotoUpload
                            uploadType="s3"
                            onUploadComplete={(url: string) => {
                              const currentGallery = field.value || [];
                              field.onChange([...currentGallery, url]);
                            }}
                            getUploadParameters={async () => {
                              const response = await apiRequest('POST', '/api/objects/upload');
                              if (!response.ok) throw new Error('Failed to get upload URL');
                              const { uploadURL } = await response.json();
                              return { method: 'PUT' as const, url: uploadURL };
                            }}
                            maxFileSize={10485760}
                            multiple={false}
                            className="min-h-[120px]"
                            data-testid="uploader-gallery-image"
                          >
                            <div className="p-6 text-center">
                              <Plus className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                              <Button type="button" variant="outline" className="mb-2">
                                <Plus className="w-4 h-4 mr-2" />
                                Add Gallery Image
                              </Button>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                or drag and drop image here
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                JPG, PNG, or WEBP up to 10MB
                              </p>
                            </div>
                          </SharedPhotoUpload>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="videoUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Video URL (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..." 
                              {...field} 
                              data-testid="input-video-url" 
                            />
                          </FormControl>
                          <FormDescription>
                            Add a video tour of your venue from YouTube, Vimeo, or other video platforms
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Upload Guidelines */}
                    <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                        Photo Guidelines
                      </h4>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                        <li>• Use high-resolution images (at least 1200px wide)</li>
                        <li>• Show the actual venue, facilities, and surrounding area</li>
                        <li>• Avoid heavily filtered or edited photos</li>
                        <li>• Include photos of key amenities and spaces</li>
                        <li>• Ensure you have rights to use all uploaded images</li>
                      </ul>
                    </div>
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-6">
                    
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <MapPin className="w-4 h-4" />
                            Full Address *
                          </FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123 Main Street, Ubud, Bali, Indonesia" 
                              {...field} 
                              maxLength={500}
                              data-testid="input-location" 
                            />
                          </FormControl>
                          <FormDescription className="flex justify-between">
                            <span>Minimum 10 characters - complete physical address of your venue</span>
                            <span className="text-xs">{field.value?.length || 0}/500</span>
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="https://yourvenuewebsite.com" 
                              {...field} 
                              data-testid="input-website" 
                            />
                          </FormControl>
                          <FormDescription>
                            Must be a valid URL starting with http:// or https://
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="instagram"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Instagram (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="@yourvenue or yourvenue" 
                              {...field} 
                              maxLength={31}
                              data-testid="input-instagram" 
                            />
                          </FormControl>
                          <FormDescription>
                            Instagram handle (letters, numbers, dots, underscores only, max 30 characters)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                {step === 5 && (
                  <div className="space-y-6">
                    <div className="space-y-6">
                      <h3 className="text-lg font-semibold">Amenities</h3>
                      <FormField
                        control={form.control}
                        name="amenities"
                        render={({ field }) => {
                          const selected = (field.value || []).map((id: string) => {
                            const found = servicesAndAmenitiesData.amenities
                              .flatMap(g => g.items)
                              .find(item => item.id === id);
                            return found || { id, name: id, custom: true };
                          });
                          
                          return (
                            <FormItem>
                              <FormLabel>Physical features available at your venue</FormLabel>
                              <FormDescription>
                                List amenities that guests can expect, such as sauna, outdoor deck, or pool.
                              </FormDescription>
                              <FormControl>
                                <GroupedMultiSelect
                                  options={servicesAndAmenitiesData.amenities}
                                  selected={selected}
                                  onChange={(items) => field.onChange(items.map(item => item.id))}
                                  placeholder="Search or select amenities..."
                                  allowCustom={true}
                                  data-testid="select-amenities"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-6 pt-4 border-t">
                      <h3 className="text-lg font-semibold">Services Offered</h3>
                      <FormField
                        control={form.control}
                        name="servicesOffered"
                        render={({ field }) => {
                          const selected = (field.value || []).map((id: string) => {
                            const found = servicesAndAmenitiesData.services
                              .flatMap(g => g.items)
                              .find(item => item.id === id);
                            return found || { id, name: id, custom: true };
                          });
                          
                          return (
                            <FormItem>
                              <FormLabel>Services your venue can provide</FormLabel>
                              <FormDescription>
                                Common services include airport pickup, chef, or yoga equipment.
                              </FormDescription>
                              <FormControl>
                                <GroupedMultiSelect
                                  options={servicesAndAmenitiesData.services}
                                  selected={selected}
                                  onChange={(items) => field.onChange(items.map(item => item.id))}
                                  placeholder="Search or select services..."
                                  allowCustom={true}
                                  data-testid="select-services"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-6 pt-4 border-t">
                      <h3 className="text-lg font-semibold">Additional Paid Services (Optional)</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Add premium services with specific pricing (e.g., spa treatments, equipment rental, catering packages).
                      </p>
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
                    </div>
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Venue Roles</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Define roles available at your venue. Select from standard roles or add custom ones. 
                        Specify if each role is required, how many people are needed, and optional rates.
                      </p>
                    </div>
                    
                    <RolesEditor
                      roles={form.watch("venueRoles")}
                      onChange={(roles) => form.setValue("venueRoles", roles, { shouldDirty: true })}
                    />
                  </div>
                )}

                {step === 7 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Room Types</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Define room types available at your venue with detailed configuration and pricing per night.
                      </p>
                    </div>
                    
                    <Button type="button" onClick={addVenueRoomType} variant="outline" data-testid="button-add-room">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Room Type
                    </Button>
                    
                    {form.watch("venueRoomTypes").map((room, index) => (
                      <Card key={index} className="p-6">
                        <div className="flex justify-between items-start mb-4">
                          <h4 className="font-semibold text-lg">Room {index + 1}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeVenueRoomType(index)}
                            data-testid={`button-remove-room-${index}`}
                          >
                            ×
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor={`room-name-${index}`}>Room Name *</Label>
                            <Input
                              id={`room-name-${index}`}
                              placeholder="e.g., Ocean View Suite, Mountain Cabin"
                              value={room.name}
                              onChange={(e) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].name = e.target.value;
                                form.setValue("venueRoomTypes", rooms);
                              }}
                              data-testid={`input-room-name-${index}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`room-type-${index}`}>Room Type *</Label>
                            <Input
                              id={`room-type-${index}`}
                              placeholder="e.g., Private Room, Shared Dorm, Suite"
                              value={room.type}
                              onChange={(e) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].type = e.target.value;
                                form.setValue("venueRoomTypes", rooms);
                              }}
                              data-testid={`input-room-type-${index}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`room-capacity-${index}`}>Guest Capacity *</Label>
                            <Select
                              value={room.capacity?.toString() || "1"}
                              onValueChange={(value) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].capacity = parseInt(value);
                                form.setValue("venueRoomTypes", rooms);
                              }}
                            >
                              <SelectTrigger id={`room-capacity-${index}`} data-testid={`select-room-capacity-${index}`}>
                                <SelectValue placeholder="Select capacity" />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                  <SelectItem key={num} value={num.toString()}>
                                    {num} {num === 1 ? 'Guest' : 'Guests'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`room-bed-config-${index}`}>Bed Configuration</Label>
                            <Input
                              id={`room-bed-config-${index}`}
                              placeholder="e.g., 1 King, 2 Twins, 1 Queen + 1 Single"
                              value={room.bedConfiguration || ""}
                              onChange={(e) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].bedConfiguration = e.target.value;
                                form.setValue("venueRoomTypes", rooms);
                              }}
                              data-testid={`input-room-bed-config-${index}`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`room-quantity-${index}`}>Room Count *</Label>
                            <Select
                              value={room.quantity?.toString() || "1"}
                              onValueChange={(value) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].quantity = parseInt(value);
                                form.setValue("venueRoomTypes", rooms);
                              }}
                            >
                              <SelectTrigger id={`room-quantity-${index}`} data-testid={`select-room-quantity-${index}`}>
                                <SelectValue placeholder="Select count" />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30].map((num) => (
                                  <SelectItem key={num} value={num.toString()}>
                                    {num} {num === 1 ? 'Room' : 'Rooms'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`room-price-${index}`}>Price Per Night *</Label>
                            <Input
                              id={`room-price-${index}`}
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="e.g., 150.00"
                              value={room.pricePerNight}
                              onChange={(e) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].pricePerNight = parseFloat(e.target.value) || 0;
                                form.setValue("venueRoomTypes", rooms);
                              }}
                              data-testid={`input-room-price-${index}`}
                            />
                          </div>
                          <div className="md:col-span-2 space-y-2">
                            <Label htmlFor={`room-description-${index}`}>Description</Label>
                            <Textarea
                              id={`room-description-${index}`}
                              placeholder="Additional details about this room type..."
                              value={room.description || ""}
                              rows={3}
                              onChange={(e) => {
                                const rooms = form.getValues("venueRoomTypes");
                                rooms[index].description = e.target.value;
                                form.setValue("venueRoomTypes", rooms);
                              }}
                              data-testid={`textarea-room-description-${index}`}
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {step === 8 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Default Itinerary</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Create a default itinerary template that events at your venue can use as a starting point. Add days with time-based activities.
                      </p>
                    </div>
                    
                    <Button type="button" onClick={addItineraryDay} variant="outline" data-testid="button-add-itinerary">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Day
                    </Button>
                    
                    {form.watch("defaultItinerary").map((day, dayIndex) => (
                      <Card key={dayIndex} className="p-6">
                        <div className="space-y-4">
                          <div className="flex justify-between items-start">
                            <h4 className="font-semibold text-lg">Day {day.day}</h4>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItineraryDay(dayIndex)}
                              data-testid={`button-remove-itinerary-${dayIndex}`}
                            >
                              ×
                            </Button>
                          </div>
                          
                          <div className="space-y-3">
                            <Input
                              placeholder="Day title (e.g., 'Arrival Day')"
                              value={day.title}
                              onChange={(e) => {
                                const itinerary = form.getValues("defaultItinerary");
                                itinerary[dayIndex].title = e.target.value;
                                form.setValue("defaultItinerary", itinerary);
                              }}
                              data-testid={`input-itinerary-title-${dayIndex}`}
                            />
                            <Textarea
                              placeholder="Day description (optional)"
                              value={day.description || ""}
                              onChange={(e) => {
                                const itinerary = form.getValues("defaultItinerary");
                                itinerary[dayIndex].description = e.target.value;
                                form.setValue("defaultItinerary", itinerary);
                              }}
                              rows={2}
                              data-testid={`textarea-itinerary-description-${dayIndex}`}
                            />
                          </div>

                          <div className="space-y-3 pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <label className="text-sm font-medium">Time Slots</label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addTimeSlot(dayIndex)}
                                data-testid={`button-add-timeslot-${dayIndex}`}
                              >
                                <Plus className="w-4 h-4 mr-1" />
                                Add Time Slot
                              </Button>
                            </div>

                            {day.timeSlots && day.timeSlots.length > 0 && (
                              <div className="space-y-2">
                                {day.timeSlots.map((slot: any, slotIndex: number) => (
                                  <div key={slot.id} className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                    <div className="col-span-2">
                                      <Input
                                        type="time"
                                        value={slot.startTime}
                                        onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'startTime', e.target.value)}
                                        data-testid={`input-start-time-${dayIndex}-${slotIndex}`}
                                      />
                                    </div>
                                    <div className="col-span-2">
                                      <Input
                                        type="time"
                                        value={slot.endTime}
                                        onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'endTime', e.target.value)}
                                        data-testid={`input-end-time-${dayIndex}-${slotIndex}`}
                                      />
                                    </div>
                                    <div className="col-span-7">
                                      <Input
                                        placeholder="Activity title"
                                        value={slot.title}
                                        onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'title', e.target.value)}
                                        data-testid={`input-activity-title-${dayIndex}-${slotIndex}`}
                                      />
                                      <Input
                                        placeholder="Description (optional)"
                                        value={slot.description || ""}
                                        onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'description', e.target.value)}
                                        className="mt-2"
                                        data-testid={`input-activity-description-${dayIndex}-${slotIndex}`}
                                      />
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeTimeSlot(dayIndex, slot.id)}
                                        data-testid={`button-remove-timeslot-${dayIndex}-${slotIndex}`}
                                      >
                                        ×
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {step === 9 && (
                  <div className="space-y-8">
                    {/* Section 1: Pricing Model */}
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4">Pricing Model</h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Choose how you want to price your venue for event organizers.
                      </p>
                      
                      <FormField
                        control={form.control}
                        name="pricingModel"
                        render={({ field }) => (
                          <FormItem className="space-y-4">
                            <FormControl>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Card 
                                  className={`p-4 cursor-pointer border-2 transition-colors ${field.value === 'whole_venue' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                                  onClick={() => field.onChange('whole_venue')}
                                  data-testid="card-pricing-whole-venue"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Building className="h-5 w-5 text-primary" />
                                    <span className="font-medium">Whole Venue Pricing</span>
                                  </div>
                                  <p className="text-sm text-gray-600">Charge a flat rate for the entire venue per day or per event</p>
                                </Card>
                                
                                <Card 
                                  className={`p-4 cursor-pointer border-2 transition-colors ${field.value === 'per_room' ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}
                                  onClick={() => field.onChange('per_room')}
                                  data-testid="card-pricing-per-room"
                                >
                                  <div className="flex items-center gap-2 mb-2">
                                    <Users className="h-5 w-5 text-primary" />
                                    <span className="font-medium">Per Room / Per Night</span>
                                  </div>
                                  <p className="text-sm text-gray-600">Charge based on individual room bookings per night</p>
                                </Card>
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Whole Venue Pricing Fields */}
                      {form.watch('pricingModel') === 'whole_venue' && (
                        <div className="mt-6 space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <h4 className="font-medium text-blue-800 dark:text-blue-200">Whole Venue Pricing</h4>
                          <FormField
                            control={form.control}
                            name="basePricePerDay"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Price Per Day</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="e.g., 2500"
                                    {...field}
                                    data-testid="input-base-price-per-day"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}

                      {/* Per Room Pricing Fields */}
                      {form.watch('pricingModel') === 'per_room' && (
                        <div className="mt-6 space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <h4 className="font-medium text-green-800 dark:text-green-200">Per Room Pricing Options</h4>
                          
                          <FormField
                            control={form.control}
                            name="useRoomPricesFromRoomsPage"
                            render={({ field }) => (
                              <FormItem className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-md">
                                <div>
                                  <FormLabel>Use prices from Rooms page</FormLabel>
                                  <FormDescription className="text-sm">
                                    Enable to use individual room prices defined in the Rooms step
                                  </FormDescription>
                                </div>
                                <FormControl>
                                  <input
                                    type="checkbox"
                                    checked={field.value}
                                    onChange={field.onChange}
                                    className="h-5 w-5 rounded border-gray-300"
                                    data-testid="checkbox-use-room-prices"
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          {!form.watch('useRoomPricesFromRoomsPage') && (
                            <FormField
                              control={form.control}
                              name="defaultPricePerRoomPerNight"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Default Price Per Room Per Night</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      placeholder="e.g., 150"
                                      {...field}
                                      data-testid="input-default-room-price"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          <FormField
                            control={form.control}
                            name="minimumNights"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Minimum Nights</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    placeholder="e.g., 2"
                                    {...field}
                                    data-testid="input-minimum-nights"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </Card>

                    {/* Section 2: Payment Timing Model (MVG) */}
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4">Payment Timing Model (MVG)</h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Choose how payments should be collected in relation to the Minimum Viable Group threshold.
                      </p>
                      
                      <FormField
                        control={form.control}
                        name="paymentTimingModel"
                        render={({ field }) => (
                          <FormItem className="space-y-4">
                            <FormControl>
                              <div className="space-y-3">
                                {/* Model 1 */}
                                <Card 
                                  className={`p-4 cursor-pointer border-2 transition-colors ${field.value === 'soft_hold_deposit_balance' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 hover:border-gray-300'}`}
                                  onClick={() => field.onChange('soft_hold_deposit_balance')}
                                  data-testid="card-payment-model-1"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${field.value === 'soft_hold_deposit_balance' ? 'border-blue-500' : 'border-gray-400'}`}>
                                      {field.value === 'soft_hold_deposit_balance' && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className="font-medium">Soft Hold → Deposit After MVG → Balance Before Arrival</span>
                                  </div>
                                  <p className="text-sm text-gray-600 ml-6 mt-1">
                                    Dates are held without payment, deposit collected after MVG is met, balance due before arrival
                                  </p>
                                </Card>

                                {/* Model 2 */}
                                <Card 
                                  className={`p-4 cursor-pointer border-2 transition-colors ${field.value === 'deposit_upfront_balance' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 hover:border-gray-300'}`}
                                  onClick={() => field.onChange('deposit_upfront_balance')}
                                  data-testid="card-payment-model-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${field.value === 'deposit_upfront_balance' ? 'border-green-500' : 'border-gray-400'}`}>
                                      {field.value === 'deposit_upfront_balance' && <div className="w-2 h-2 rounded-full bg-green-500" />}
                                    </div>
                                    <span className="font-medium">Deposit Upfront (Refundable Until MVG) → Balance Before Arrival</span>
                                  </div>
                                  <p className="text-sm text-gray-600 ml-6 mt-1">
                                    Deposit collected immediately but refundable if MVG not met, balance due before arrival
                                  </p>
                                </Card>

                                {/* Model 3 */}
                                <Card 
                                  className={`p-4 cursor-pointer border-2 transition-colors ${field.value === 'deposit_balance_arrival' ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20' : 'border-gray-200 hover:border-gray-300'}`}
                                  onClick={() => field.onChange('deposit_balance_arrival')}
                                  data-testid="card-payment-model-3"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${field.value === 'deposit_balance_arrival' ? 'border-orange-500' : 'border-gray-400'}`}>
                                      {field.value === 'deposit_balance_arrival' && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                                    </div>
                                    <span className="font-medium">Deposit After MVG → Balance on Arrival</span>
                                  </div>
                                  <p className="text-sm text-gray-600 ml-6 mt-1">
                                    Deposit collected only after MVG is met, remaining balance paid on arrival
                                  </p>
                                </Card>
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      {/* Conditional fields based on payment timing model */}
                      {form.watch('paymentTimingModel') && (
                        <div className="mt-6 space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                          {/* Soft Hold Duration - Only for Model 1 */}
                          {form.watch('paymentTimingModel') === 'soft_hold_deposit_balance' && (
                            <FormField
                              control={form.control}
                              name="softHoldDurationDays"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Soft Hold Duration (Days)</FormLabel>
                                  <FormDescription>
                                    Number of days to hold dates without requiring payment
                                  </FormDescription>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="1"
                                      max="30"
                                      placeholder="e.g., 7"
                                      {...field}
                                      data-testid="input-soft-hold-duration"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* Deposit Percentage - For all models */}
                          <FormField
                            control={form.control}
                            name="depositPercent"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Deposit Percentage (%)</FormLabel>
                                <FormDescription>
                                  Percentage of total booking cost required as deposit
                                </FormDescription>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    placeholder="e.g., 25"
                                    {...field}
                                    data-testid="input-deposit-percent"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Balance Due Days - For Model 1 and 2 */}
                          {(form.watch('paymentTimingModel') === 'soft_hold_deposit_balance' || 
                            form.watch('paymentTimingModel') === 'deposit_upfront_balance') && (
                            <FormField
                              control={form.control}
                              name="balanceDueDaysBeforeArrival"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Balance Due (Days Before Arrival)</FormLabel>
                                  <FormDescription>
                                    Number of days before arrival when the remaining balance is due
                                  </FormDescription>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min="1"
                                      max="90"
                                      placeholder="e.g., 14"
                                      {...field}
                                      data-testid="input-balance-due-days"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                      )}
                    </Card>

                    {/* Section 3: Platform Commission */}
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4">Platform Commission</h3>
                      <FormField
                        control={form.control}
                        name="commissionPercent"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Commission Percentage (%)</FormLabel>
                            <FormDescription>
                              Percentage of booking revenue that goes to the platform. The remainder goes to you as the venue provider.
                            </FormDescription>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                placeholder="e.g., 15"
                                {...field}
                                data-testid="input-commission-percent"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Card>

                    {/* Section 4: Pricing Notes */}
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4">Pricing Notes</h3>
                      <FormField
                        control={form.control}
                        name="pricingNotes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Additional Pricing Information (Optional)</FormLabel>
                            <FormDescription>
                              Any special rates, discounts, seasonal pricing, or booking conditions.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                placeholder="e.g., 10% discount for bookings over 14 days, special rates available for retreats during low season..."
                                rows={4}
                                {...field}
                                data-testid="textarea-pricing-notes"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Card>
                  </div>
                )}

                {step === 10 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Terms & Conditions</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Provide your venue's terms, policies, and house rules for guests.
                      </p>
                    </div>

                    {/* Terms & Conditions Upload */}
                    <Card className="p-6">
                      <h4 className="font-medium mb-4">Terms & Conditions Document</h4>
                      <FormField
                        control={form.control}
                        name="termsAndConditionsUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Upload Terms & Conditions (PDF) *</FormLabel>
                            <FormDescription>
                              Upload a PDF document containing your full terms and conditions for venue bookings.
                            </FormDescription>
                            <FormControl>
                              <div className="space-y-3">
                                {field.value ? (
                                  <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <span className="text-sm font-medium text-green-800 dark:text-green-200 block">Terms & Conditions uploaded</span>
                                      <a 
                                        href={field.value} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:underline truncate block"
                                        data-testid="link-view-terms-pdf"
                                      >
                                        View uploaded PDF
                                      </a>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => field.onChange('')}
                                      data-testid="button-remove-terms-pdf"
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    {/* PDF File Upload */}
                                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                                      <input
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        className="hidden"
                                        id="terms-pdf-upload"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;
                                          
                                          // Validate file type
                                          if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                                            toast({
                                              title: 'Invalid file type',
                                              description: 'Please upload a PDF file.',
                                              variant: 'destructive',
                                            });
                                            return;
                                          }
                                          
                                          // Validate file size (max 10MB)
                                          if (file.size > 10 * 1024 * 1024) {
                                            toast({
                                              title: 'File too large',
                                              description: 'PDF must be smaller than 10MB.',
                                              variant: 'destructive',
                                            });
                                            return;
                                          }
                                          
                                          try {
                                            const formData = new FormData();
                                            formData.append('file', file);
                                            const token = getAccessToken();
                                            const uploadResponse = await fetch('/api/uploads/documents', {
                                              method: 'POST',
                                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                                              body: formData,
                                            });
                                            if (!uploadResponse.ok) throw new Error('Upload failed');
                                            const { url: publicUrl } = await uploadResponse.json();
                                            field.onChange(publicUrl);
                                            
                                            toast({
                                              title: 'PDF uploaded successfully',
                                              description: 'Your Terms & Conditions document has been uploaded.',
                                            });
                                          } catch (error) {
                                            toast({
                                              title: 'Upload failed',
                                              description: 'Failed to upload PDF. Please try again.',
                                              variant: 'destructive',
                                            });
                                          }
                                          
                                          // Reset input
                                          e.target.value = '';
                                        }}
                                        data-testid="input-terms-pdf-upload"
                                      />
                                      <label 
                                        htmlFor="terms-pdf-upload" 
                                        className="cursor-pointer flex flex-col items-center gap-2"
                                      >
                                        <Upload className="h-8 w-8 text-gray-400" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                          Click to upload PDF
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          PDF up to 10MB
                                        </span>
                                      </label>
                                    </div>
                                    
                                    {/* Or enter URL manually */}
                                    <div className="relative">
                                      <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t" />
                                      </div>
                                      <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-white dark:bg-gray-900 px-2 text-muted-foreground">
                                          Or enter URL
                                        </span>
                                      </div>
                                    </div>
                                    
                                    <Input
                                      type="url"
                                      placeholder="https://example.com/terms.pdf"
                                      value={field.value || ''}
                                      onChange={field.onChange}
                                      data-testid="input-terms-url"
                                    />
                                  </div>
                                )}
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Card>

                    {/* House Rules */}
                    <Card className="p-6">
                      <h4 className="font-medium mb-4">House Rules</h4>
                      <FormField
                        control={form.control}
                        name="houseRules"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>House Rules</FormLabel>
                            <FormDescription>
                              Specify the rules and guidelines that guests must follow during their stay.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                placeholder="e.g., No smoking indoors, Quiet hours from 10pm to 8am, No pets allowed, Respect the natural environment..."
                                rows={6}
                                {...field}
                                data-testid="textarea-house-rules"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Card>

                    {/* Cancellation Policy */}
                    <Card className="p-6">
                      <h4 className="font-medium mb-4">Cancellation Policy</h4>
                      <FormField
                        control={form.control}
                        name="cancellationPolicy"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cancellation Policy Type</FormLabel>
                            <FormDescription>
                              Select the type of cancellation policy that applies to your venue.
                            </FormDescription>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <FormControl>
                                <SelectTrigger data-testid="select-cancellation-policy">
                                  <SelectValue placeholder="Select cancellation policy" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="flexible">Flexible - Full refund up to 7 days before</SelectItem>
                                <SelectItem value="moderate">Moderate - Full refund up to 14 days before</SelectItem>
                                <SelectItem value="strict">Strict - 50% refund up to 30 days before</SelectItem>
                                <SelectItem value="super_strict">Super Strict - No refund after booking</SelectItem>
                                <SelectItem value="custom">Custom - See notes below</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Card>

                    {/* Damage/Liability Policy */}
                    <Card className="p-6">
                      <h4 className="font-medium mb-4">Damage & Liability Policy</h4>
                      <FormField
                        control={form.control}
                        name="damagePolicy"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Damage & Liability Policy</FormLabel>
                            <FormDescription>
                              Describe your policy regarding damages, liability, and security deposits.
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                placeholder="e.g., A security deposit of $500 is required, Guests are liable for any damages caused during their stay, Insurance coverage requirements..."
                                rows={6}
                                {...field}
                                data-testid="textarea-damage-policy"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Card>

                    {/* Final Confirmation */}
                    <Card className="p-6 border-2 border-primary/20">
                      <h4 className="font-medium mb-4">Confirmation</h4>
                      <FormField
                        control={form.control}
                        name="termsConfirmed"
                        render={({ field }) => (
                          <FormItem className="flex items-start gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="h-5 w-5 mt-0.5 rounded border-gray-300"
                                data-testid="checkbox-terms-confirmed"
                              />
                            </FormControl>
                            <div>
                              <FormLabel className="text-base font-medium">
                                I confirm these Terms & Conditions are correct
                              </FormLabel>
                              <FormDescription>
                                By checking this box, you confirm that all information provided is accurate and you agree to abide by the platform's policies.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />
                    </Card>

                    {/* Submit for Review Button */}
                    <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                      <AlertCircle className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-800 dark:text-blue-200">
                        Once you submit your venue for review, our team will review your listing and get back to you within 2-3 business days.
                      </AlertDescription>
                    </Alert>

                    <Button
                      type="button"
                      className="w-full btn-gradient py-6 text-lg"
                      disabled={!form.watch('termsConfirmed') || submitForReviewMutation.isPending || profileMutation.isPending}
                      onClick={async () => {
                        if (editVenueId) {
                          submitForReviewMutation.mutate(editVenueId);
                        } else {
                          try {
                            const formData = form.getValues();
                            
                            const cleanedData = {
                              ...formData,
                              capacity: formData.capacity ? Number(formData.capacity) : null,
                              basePrice: formData.basePrice ? String(formData.basePrice) : null,
                              basePricePerDay: formData.basePricePerDay ? String(formData.basePricePerDay) : null,
                              defaultPricePerRoomPerNight: formData.defaultPricePerRoomPerNight ? String(formData.defaultPricePerRoomPerNight) : null,
                              minimumNights: formData.minimumNights ? Number(formData.minimumNights) : null,
                              softHoldDurationDays: formData.softHoldDurationDays ? Number(formData.softHoldDurationDays) : null,
                              softHoldDays: formData.softHoldDays ? Number(formData.softHoldDays) : null,
                              depositPercent: formData.depositPercent ? String(formData.depositPercent) : null,
                              commissionPercent: formData.commissionPercent ? String(formData.commissionPercent) : null,
                              balanceDueDaysBeforeArrival: formData.balanceDueDaysBeforeArrival ? Number(formData.balanceDueDaysBeforeArrival) : null,
                              minStay: formData.minStay ? Number(formData.minStay) : null,
                            };
                            
                            const response = await apiRequest('POST', '/api/venues', cleanedData);
                            const venue = await response.json();
                            
                            toast({
                              title: 'Venue saved!',
                              description: 'Now submitting for review...',
                            });
                            
                            await queryClient.invalidateQueries({ queryKey: ['/api/venues'] });
                            await queryClient.invalidateQueries({ queryKey: ['/api/user/venues'] });
                            
                            window.history.replaceState({}, '', `/venue-profile-setup?edit=${venue.id}`);
                            
                            submitForReviewMutation.mutate(venue.id);
                          } catch (error) {
                            toast({
                              title: 'Error saving venue',
                              description: 'Please try again or save as draft first.',
                              variant: 'destructive',
                            });
                          }
                        }
                      }}
                      data-testid="button-submit-for-review"
                    >
                      {(submitForReviewMutation.isPending || profileMutation.isPending) ? (
                        <>
                          <Clock className="h-5 w-5 mr-2 animate-spin" />
                          {profileMutation.isPending ? 'Saving...' : 'Submitting...'}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-5 w-5 mr-2" />
                          Submit for Review
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {step === 13 && (
                  <div className="space-y-6">
                    <p className="text-sm text-muted-foreground">
                      Add services that your venue offers to guests (e.g., catering, equipment rental, spa services)
                    </p>
                    
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
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Calendar className="w-5 h-5" />
                    </div>
                    
                    <div className="space-y-6">
                      <h4 className="text-md font-medium">Availability Calendar</h4>
                      <p className="text-sm text-muted-foreground">
                        Manage your venue's availability calendar. This helps coordinate bookings.
                      </p>
                      
                      {editVenueId ? (
                        <VenueAvailability venueId={editVenueId} />
                      ) : (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Save your venue as a draft first to manage availability.
                            Click "Save as Draft" below to continue.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    <div className="space-y-6 pt-4 border-t">
                      <h4 className="text-md font-medium">Google Calendar Sync</h4>
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          Google Calendar sync is coming soon. You'll be able to automatically sync your venue's availability with your Google Calendar.
                        </AlertDescription>
                      </Alert>
                    </div>

                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-6 mt-8">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={step === 1}
                    data-testid="button-previous-step"
                    aria-label={step === 1 ? "First step" : "Go to previous step"}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Previous
                  </Button>
                  
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex flex-wrap items-center gap-4 justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => form.handleSubmit(onSubmit)()}
                        disabled={profileMutation.isPending || submitForReviewMutation.isPending}
                        data-testid="button-save-draft"
                        aria-label="Save venue as draft"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {profileMutation.isPending ? 'Saving...' : (editVenueId ? 'Save Changes' : 'Save as Draft')}
                      </Button>
                      
                      {step < 10 ? (
                        <Button
                          type="button"
                          onClick={handleNext}
                          disabled={profileMutation.isPending}
                          data-testid="button-next-step"
                          aria-label="Go to next step"
                        >
                          Next
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      ) : (
                        <>
                          {editVenueId && existingVenue?.status === 'pending' ? (
                            <Button
                              disabled={true}
                              variant="outline"
                              data-testid="button-already-submitted"
                              className="opacity-50 cursor-not-allowed"
                              aria-label="Venue already submitted for review"
                            >
                              Already Submitted for Review
                              <CheckCircle className="w-4 h-4 ml-2" />
                            </Button>
                          ) : (
                            // Show submit button for: new venues (no editVenueId) OR existing draft/rejected venues
                            (!existingVenue || existingVenue.status === 'draft' || existingVenue.status === 'rejected') && (
                              <Button
                                type="button"
                                onClick={handleSubmitForReview}
                                disabled={profileMutation.isPending || submitForReviewMutation.isPending}
                                data-testid="button-submit-for-review"
                                aria-label="Submit venue for admin review"
                              >
                                {submitForReviewMutation.isPending ? 'Submitting...' : 'Submit for Review'}
                                <CheckCircle className="w-4 h-4 ml-2" />
                              </Button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </form>
        </Form>
      </div>
    </div>
  );
}