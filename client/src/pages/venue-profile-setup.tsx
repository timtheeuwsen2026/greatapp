import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getAccessToken } from '@/lib/authToken';
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
import type { VenueService } from '@/components/VenueServicesEditor';
import type { Role } from '@/components/RolesEditor';
import Navigation from '@/components/navigation';
import LegalConsentLabel from '@/components/LegalConsentLabel';

const VenueAvailability = lazy(() => import('@/components/VenueAvailability'));
const VenueServicesEditor = lazy(() =>
  import('@/components/VenueServicesEditor').then((module) => ({
    default: module.VenueServicesEditor,
  }))
);
const RolesEditor = lazy(() =>
  import('@/components/RolesEditor').then((module) => ({
    default: module.RolesEditor,
  }))
);
const GroupedMultiSelect = lazy(() =>
  import('@/components/GroupedMultiSelect').then((module) => ({
    default: module.GroupedMultiSelect,
  }))
);
const VenueIcalSync = lazy(() =>
  import('@/components/VenueIcalSync').then((module) => ({
    default: module.VenueIcalSync,
  }))
);

function StepLoading({ label = 'Loading step...' }: { label?: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 text-sm font-medium text-gray-600">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {label}
    </div>
  );
}

// Service validation schema
const venueServiceSchema = z.object({
  id: z.string(),
  title: z.string()
    .min(3, 'Service title must be at least 3 characters')
    .max(100, 'Service title must not exceed 100 characters'),
  description: z.string()
    .min(50, 'Service description must be at least 50 characters')
    .max(1000, 'Service description must not exceed 1000 characters'),
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
  
  // Pricing removed — venue profiles are visual only (photos, capacity, amenities).
  
  paymentModel: z.preprocess(
    (val) => val === '' || val === null ? undefined : val,
    z.enum(['staggered', 'full_upfront', 'balance_on_arrival'], {
      errorMap: () => ({ message: 'Payment model must be one of: staggered, full upfront, or balance on arrival' })
    }).optional()
  ),
  
  
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
  
  // Venues no longer publish prices. A creator proposes a Target Deal and the
  // venue accepts or counters it, so nothing here collects rates.
  
  // Step 10: Terms & Conditions
  // A booking policy, not a price — stays on Terms & Review.
  cancellationPolicy: z.string().optional().or(z.literal('')),
  termsAndConditionsUrl: z.string().optional().or(z.literal('')),
  houseRules: z.string().optional().or(z.literal('')),
  damagePolicy: z.string().optional().or(z.literal('')),
  termsConfirmed: z.boolean().default(false),
  // Mandatory consent to the platform's own legal terms, given afresh on every
  // submission — deliberately never rehydrated from a saved venue.
  platformTermsAccepted: z.boolean().default(false),
});

type VenueProfileForm = z.infer<typeof venueProfileSchema>;

type GroupedOptionsData = {
  services: Array<{
    category: string;
    items: Array<{ id: string; name: string; description?: string }>;
  }>;
  amenities: Array<{
    category: string;
    items: Array<{ id: string; name: string; description?: string }>;
  }>;
};

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

const multiDayVenueCategories = [
  'Retreat Center', 'Villa', 'Studio', 'Eco-Lodge', 'Hotel',
  'Co-Living', 'Workation Property', 'Outdoor Spot'
];

const daytimeVenueCategories = [
  'Coffee Shop/Cafe', 'Restaurant', 'Yoga/Fitness Studio',
  'Retail/Gallery', 'Co-working Space'
];

const multiDayVenueVibes = [
  'Jungle', 'Beach', 'Urban', 'Mountain', 'Remote', 'Luxury',
  'Eco', 'Spiritual', 'Adventure', 'Digital Nomad Friendly'
];

const daytimeVenueVibes = [
  'Cozy', 'Bright', 'Industrial', 'Minimal', 'Premium', 'Family Friendly',
  'Community Driven', 'Creative', 'High Energy', 'Quiet', 'Late Night', 'Pop-Up Ready'
];



const viewsEnvironment = [
  'Ocean View', 'Lake View', 'Mountain View', 'Forest View',
  'City View', 'Quiet Area', 'Beach Access', 'Hiking Trails'
];

const accommodationTypes = [
  'Private Rooms', 'Shared Rooms', 'Dormitory', 'Glamping', 'Camping'
];



const cancellationPolicies = ['Flexible', 'Moderate', 'Strict'];



const regions = [
  'North America', 'South America', 'Europe', 'Africa', 'Asia',
  'Oceania', 'Central America', 'Caribbean', 'Middle East'
];

export default function VenueProfileSetup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Get venue ID from URL for edit mode
  const urlParams = new URLSearchParams(window.location.search);

  // Saving a new venue as a draft redirects so the wizard picks up the new id.
  // Without carrying the step across, that redirect dumped the owner back on
  // step 1 — which is how someone following "save a draft first to connect
  // your calendars" ended up nowhere near the calendar step.
  const requestedStep = Number(urlParams.get('step'));
  const [step, setStep] = useState(
    Number.isFinite(requestedStep) && requestedStep >= 1 && requestedStep <= 9 ? requestedStep : 1,
  );
  const [servicesAndAmenitiesData, setServicesAndAmenitiesData] = useState<GroupedOptionsData | null>(null);

  const editVenueId = urlParams.get('edit');
  const requestedVenueType = urlParams.get('venueType') || urlParams.get('type');
  const initialVenueType: VenueProfileForm['venueType'] =
    requestedVenueType === 'daytime' ||
    requestedVenueType === 'day_event' ||
    requestedVenueType === 'one-day' ||
    requestedVenueType === 'single-day'
      ? 'daytime'
      : 'multi_day';

  const form = useForm<VenueProfileForm>({
    resolver: zodResolver(venueProfileSchema),
    defaultValues: {
      name: '',
      tagline: '',
      city: '',
      description: '',
      venueType: initialVenueType,
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
      paymentModel: undefined,
      googleCalendarConnected: false,
      googleCalendarId: '',
      venueRoles: [],
      venueRoomTypes: [],
      defaultItinerary: [],
      // New Page 10 fields
      cancellationPolicy: '',
      termsAndConditionsUrl: '',
      houseRules: '',
      damagePolicy: '',
      termsConfirmed: false,
      platformTermsAccepted: false,
    },
  });

  // Daytime Space: skip staff roles, rooms, and default itinerary for cafes/studios/retail venues.
  const isDaytime = form.watch('venueType') === 'daytime';
  const DAYTIME_SKIP_STEPS = [6, 7, 8];
  const visibleStepIds = useMemo(
    () => Array.from({ length: 9 }, (_, index) => index + 1).filter((id) => !isDaytime || !DAYTIME_SKIP_STEPS.includes(id)),
    [isDaytime]
  );
  const currentVisibleStep = Math.max(visibleStepIds.indexOf(step), 0) + 1;
  const totalVisibleSteps = visibleStepIds.length;
  const activeVenueCategories = isDaytime ? daytimeVenueCategories : multiDayVenueCategories;
  const activeVenueVibes = isDaytime ? daytimeVenueVibes : multiDayVenueVibes;

  useEffect(() => {
    const allowedCategories = new Set(activeVenueCategories);
    const allowedVibes = new Set(activeVenueVibes);
    form.setValue('categories', form.getValues('categories').filter((category) => allowedCategories.has(category)));
    form.setValue('vibes', form.getValues('vibes').filter((vibe) => allowedVibes.has(vibe)));

    if (isDaytime) {
      if (DAYTIME_SKIP_STEPS.includes(step)) {
        setStep(9);
      }
      form.setValue('venueRoles', []);
      form.setValue('venueRoomTypes', []);
      form.setValue('defaultItinerary', []);
    }
  }, [activeVenueCategories, activeVenueVibes, form, isDaytime, step]);

  useEffect(() => {
    if (step !== 5 || servicesAndAmenitiesData) return;

    void import('@/data/options/services_and_amenities.json').then((module) => {
      setServicesAndAmenitiesData(module.default as GroupedOptionsData);
    });
  }, [servicesAndAmenitiesData, step]);

  // Load existing venue data for editing
  const { data: existingVenue, isLoading: isLoadingVenue } = useQuery({
    queryKey: ['/api/venues', editVenueId, 'edit'],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/venues/${editVenueId}/edit`);
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
        venueType: existingVenue.venueType || 'multi_day',
        capacity: existingVenue.capacity || 1,
        standingCapacity: existingVenue.standingCapacity ?? undefined,
        seatedCapacity: existingVenue.seatedCapacity ?? undefined,
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
        // DATA CONTRACT: Default to EUR for legacy venues
        paymentModel: existingVenue.paymentModel ?? undefined,
        googleCalendarConnected: existingVenue.googleCalendarConnected || false,
        googleCalendarId: existingVenue.googleCalendarId || '',
        venueRoles: existingVenue.venueRoles || [],
        venueRoomTypes: existingVenue.venueRoomTypes || [],
        defaultItinerary: existingVenue.defaultItinerary || [],
        // New Page 10 fields
        cancellationPolicy: existingVenue.cancellationPolicy || '',
        termsAndConditionsUrl: existingVenue.termsAndConditionsUrl || '',
        houseRules: existingVenue.houseRules || '',
        damagePolicy: existingVenue.damagePolicy || '',
        termsConfirmed: existingVenue.termsConfirmed ?? false,
        // Consent to the platform terms is re-given on every submission, so it
        // stays false when an existing listing is loaded for editing.
        platformTermsAccepted: false,
      });
    }
  }, [existingVenue, form]);

  // Filter and sort amenities based on search
  const refreshVenueCaches = (venue?: { id?: string; slug?: string | null }) => {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: ['/api/venues'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/user/venues'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/admin/venues'] }),
    ];

    if (venue?.id) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ['venue', venue.id] }),
        queryClient.invalidateQueries({ queryKey: ['services', venue.id] }),
        queryClient.invalidateQueries({ queryKey: ['pricing', venue.id] }),
        queryClient.invalidateQueries({ queryKey: ['/api/venues', venue.id, 'availability'] })
      );
    }

    if (venue?.slug) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ['venue', venue.slug] }),
        queryClient.invalidateQueries({ queryKey: [`/api/v/${venue.slug}`] })
      );
    }

    if (editVenueId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: ['/api/venues', editVenueId, 'edit'] })
      );
    }

    void Promise.all(invalidations).catch((error) => {
      console.error('Failed to refresh venue caches:', error);
    });
  };

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

      if (editVenueId) {
        setLocation('/venue-dashboard');
      } else {
        // Keep the user in the listing flow after the draft is created, on the
        // step they were already working on.
        setLocation(`/venues/new?edit=${venue.id}&step=${step}`);
      }

      refreshVenueCaches(venue);
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
    onSuccess: () => {
      toast({
        title: 'Venue submitted for review!',
        description: 'Your venue will be reviewed by our team. You\'ll be notified once it\'s approved.',
      });

      setLocation('/venue-dashboard');
      refreshVenueCaches({
        id: editVenueId || existingVenue?.id,
        slug: existingVenue?.slug,
      });
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
    const isDaytimeVenue = data.venueType === 'daytime';
    // Convert decimal fields to strings and integer fields to numbers for backend compatibility
    const cleanedData = {
      ...data,
      galleryImages: data.galleryImages?.filter((url: string) => url && url.trim()) || [],
      // Integer fields as numbers (capacity is required so always a number)
      capacity: data.capacity ? Number(data.capacity) : data.capacity,
      standingCapacity: data.standingCapacity != null ? Number(data.standingCapacity) : null,
      seatedCapacity: data.seatedCapacity != null ? Number(data.seatedCapacity) : null,
      venueRoles: isDaytimeVenue ? [] : data.venueRoles,
      venueRoomTypes: isDaytimeVenue ? [] : data.venueRoomTypes,
      defaultItinerary: isDaytimeVenue ? [] : data.defaultItinerary,
    };
    
    profileMutation.mutate(cleanedData as unknown as VenueProfileForm);
  };

  const handleNext = async () => {
    if (step < 9) {
      // Skip Rooms & Itinerary steps for daytime spaces
      let nextStep = step + 1;
      while (isDaytime && DAYTIME_SKIP_STEPS.includes(nextStep) && nextStep <= 9) {
        nextStep++;
      }
      setStep(nextStep <= 9 ? nextStep : 9);
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
      { name: "", type: "", capacity: 1, bedConfiguration: "", quantity: 1, description: "" }
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

  const progress = (currentVisibleStep / totalVisibleSteps) * 100;

  const stepTitles: Record<number, string> = {
    1: 'Basic Information',
    2: 'Photos & Media',
    3: 'Calendar & Availability',
    4: 'Location Details',
    5: 'Services & Amenities',
    6: 'Roles & Staffing',
    7: 'Rooms',
    8: 'Default Itinerary',
    9: 'Terms & Review'
  };

  const stepDescriptions: Record<number, string> = {
    1: isDaytime
      ? 'Add the core details for your cafe, studio, retail space, or other daytime venue.'
      : "Enter your venue's basic details including name, location, and capacity.",
    2: 'Upload photos to showcase your venue to potential event creators.',
    3: "Manage your venue's availability and booking calendar settings.",
    4: 'Provide detailed location information including address and public-facing links.',
    5: isDaytime
      ? 'Select the amenities and services your space can support for day events.'
      : 'Select amenities and services your venue offers to guests.',
    6: 'Define roles and staffing available at your venue.',
    7: 'List your room types and how many spots each one sleeps.',
    8: 'Create a default itinerary template for events at your venue.',
    9: 'Review and accept the terms before submitting your venue.'
  };

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
                Step {currentVisibleStep} of {totalVisibleSteps}: {stepTitles[step]}
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
                  {stepTitles[step]}
                </CardTitle>
                <p className="text-gray-600 dark:text-gray-400">
                  {stepDescriptions[step]}
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
                              placeholder={isDaytime ? "Neighborhood Cafe" : "Amazing Retreat Center"}
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
                              placeholder={isDaytime
                                ? "A bright cafe and event space for workshops, pop-ups, tastings, and community gatherings..."
                                : "Beachfront yoga shala with accommodation for 20 participants. Located in a peaceful area with stunning ocean views..."
                              }
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
                            Choose the format that best matches your venue and events.
                          </FormDescription>
                          <div className="grid grid-cols-2 gap-3 mt-2">
                            {[
                              { value: 'multi_day', label: 'Multi-Day Venue', desc: 'Retreats, overnight stays, multi-day events' },
                              { value: 'daytime', label: 'Daytime Space', desc: 'Cafes, retail spaces, studios, workshops, pop-ups' },
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
                          <FormLabel>{isDaytime ? 'Space Category *' : 'Venue Type *'}</FormLabel>
                          <FormDescription>
                            {isDaytime
                              ? 'Select the categories that best describe your daytime space'
                              : 'Select the categories that best describe your venue'
                            }
                          </FormDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {activeVenueCategories.map((category) => {
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
                          <FormLabel>{isDaytime ? 'Space Vibes' : 'Venue Vibes'}</FormLabel>
                          <FormDescription>
                            {isDaytime
                              ? 'Select the atmosphere creators can expect in your space'
                              : 'Select the vibes and atmosphere of your venue'
                            }
                          </FormDescription>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {activeVenueVibes.map((vibe) => {
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
                              onUploadComplete={field.onChange}
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
                            onUploadComplete={(url: string) => {
                              const currentGallery = field.value || [];
                              field.onChange([...currentGallery, url]);
                            }}
                            maxFileSize={10485760}
                            multiple={false}
                            className="min-h-[120px]"
                            showGuidelines
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
                          if (!servicesAndAmenitiesData) {
                            return (
                              <FormItem>
                                <FormLabel>Physical features available at your venue</FormLabel>
                                <StepLoading label="Loading amenities..." />
                              </FormItem>
                            );
                          }

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
                                <Suspense fallback={<StepLoading label="Loading amenities..." />}>
                                  <GroupedMultiSelect
                                    options={servicesAndAmenitiesData.amenities}
                                    selected={selected}
                                    onChange={(items) => field.onChange(items.map(item => item.id))}
                                    placeholder="Search or select amenities..."
                                    allowCustom={true}
                                    data-testid="select-amenities"
                                  />
                                </Suspense>
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
                          if (!servicesAndAmenitiesData) {
                            return (
                              <FormItem>
                                <FormLabel>Services your venue can provide</FormLabel>
                                <StepLoading label="Loading services..." />
                              </FormItem>
                            );
                          }

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
                                <Suspense fallback={<StepLoading label="Loading services..." />}>
                                  <GroupedMultiSelect
                                    options={servicesAndAmenitiesData.services}
                                    selected={selected}
                                    onChange={(items) => field.onChange(items.map(item => item.id))}
                                    placeholder="Search or select services..."
                                    allowCustom={true}
                                    data-testid="select-services"
                                  />
                                </Suspense>
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
                        List the services you can provide (e.g., spa treatments, equipment rental, catering packages). Describe what's on offer — the cost is agreed per event with the creator.
                      </p>
                      <FormField
                        control={form.control}
                        name="services"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Suspense fallback={<StepLoading label="Loading paid services..." />}>
                                <VenueServicesEditor
                                  services={field.value}
                                  onChange={field.onChange}
                                  maxServices={20}
                                />
                              </Suspense>
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
                        Specify if each role is required and how many people are needed. Creators budget for staffing on their side.
                      </p>
                    </div>

                    <Suspense fallback={<StepLoading label="Loading roles..." />}>
                      <RolesEditor
                        roles={form.watch("venueRoles")}
                        onChange={(roles) => form.setValue("venueRoles", roles, { shouldDirty: true })}
                        showRate={false}
                      />
                    </Suspense>
                  </div>
                )}

                {step === 7 && (
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">Room Types</h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        Define the room types available at your venue — how many there are and how many people each one sleeps. No rates: creators bring their own budget and propose a deal.
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
                          {/* No nightly rate here. Venues no longer publish
                              prices — the creator proposes a Target Deal and the
                              venue accepts or counters it. */}
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
                            <FormLabel>Upload Terms & Conditions</FormLabel>
                            <FormDescription>
                              Upload a PDF or Word document (.pdf, .doc, .docx) with your venue's terms and conditions for bookings. This is shown to creators and guests.
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
                                        View uploaded document
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
                                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                        className="hidden"
                                        id="terms-pdf-upload"
                                        onChange={async (e) => {
                                          const file = e.target.files?.[0];
                                          if (!file) return;

                                          const allowedTypes = [
                                            'application/pdf',
                                            'application/msword',
                                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                          ];
                                          const allowedExts = ['.pdf', '.doc', '.docx'];
                                          const ext = '.' + file.name.split('.').pop()?.toLowerCase();
                                          if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
                                            toast({
                                              title: 'Invalid file type',
                                              description: 'Please upload a PDF or Word document (.pdf, .doc, .docx).',
                                              variant: 'destructive',
                                            });
                                            return;
                                          }
                                          
                                          // Validate file size (max 10MB)
                                          if (file.size > 10 * 1024 * 1024) {
                                            toast({
                                              title: 'File too large',
                                              description: 'Document must be smaller than 10MB.',
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
                                              title: 'Document uploaded successfully',
                                              description: 'Your Terms & Conditions document has been uploaded.',
                                            });
                                          } catch (error) {
                                            toast({
                                              title: 'Upload failed',
                                              description: 'Failed to upload document. Please try again.',
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
                                          Click to upload PDF or Word document
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          PDF or Word document (up to 10MB)
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

                    {/* Platform T&C notice */}
                    <Card className="p-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Platform Terms & Conditions</h4>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        By listing your venue on this platform you also agree to the{' '}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                          Great App Terms and Conditions
                        </a>{' '}
                        and{' '}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                          Privacy Policy
                        </a>. These govern the relationship between your venue and the platform.
                      </p>
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
                                By checking this box, you confirm that all information provided is accurate, your venue T&C document (if uploaded) is up to date, and you agree to the platform's policies.
                              </FormDescription>
                            </div>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="platformTermsAccepted"
                        render={({ field }) => (
                          <FormItem className="mt-4 flex items-start gap-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
                            <FormControl>
                              <input
                                type="checkbox"
                                checked={field.value}
                                onChange={field.onChange}
                                className="h-5 w-5 mt-0.5 rounded border-gray-300"
                                data-testid="checkbox-platform-terms-accepted"
                              />
                            </FormControl>
                            <div>
                              <FormLabel className="text-base font-medium">
                                <LegalConsentLabel />
                                <span className="text-destructive"> *</span>
                              </FormLabel>
                              <FormDescription>
                                You must accept these to submit your venue listing.
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
                      disabled={!form.watch('termsConfirmed') || !form.watch('platformTermsAccepted') || submitForReviewMutation.isPending || profileMutation.isPending}
                      onClick={async () => {
                        if (editVenueId) {
                          submitForReviewMutation.mutate(editVenueId);
                        } else {
                          try {
                            const formData = form.getValues();
                            const isDaytimeVenue = formData.venueType === 'daytime';
                            
                            const cleanedData = {
                              ...formData,
                              capacity: formData.capacity ? Number(formData.capacity) : null,
                              venueRoles: isDaytimeVenue ? [] : formData.venueRoles,
                              venueRoomTypes: isDaytimeVenue ? [] : formData.venueRoomTypes,
                              defaultItinerary: isDaytimeVenue ? [] : formData.defaultItinerary,
                            };
                            
                            const response = await apiRequest('POST', '/api/venues', cleanedData);
                            const venue = await response.json();
                            
                            toast({
                              title: 'Venue saved!',
                              description: 'Now submitting for review...',
                            });
                            
                            window.history.replaceState({}, '', `/venues/new?edit=${venue.id}`);
                            refreshVenueCaches(venue);
                            
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
                              <Suspense fallback={<StepLoading label="Loading services..." />}>
                                <VenueServicesEditor
                                  services={field.value}
                                  onChange={field.onChange}
                                  maxServices={20}
                                />
                              </Suspense>
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
                        <Suspense fallback={<StepLoading label="Loading availability..." />}>
                          <VenueAvailability venueId={editVenueId} />
                        </Suspense>
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

                    <div className="space-y-4 pt-4 border-t">
                      <div>
                        <h4 className="text-md font-medium">Calendar Sync</h4>
                        <p className="text-sm text-muted-foreground">
                          Keep this calendar and the ones you already use in step with each other, both ways.
                        </p>
                      </div>

                      {editVenueId ? (
                        <Suspense fallback={<StepLoading label="Loading calendar sync..." />}>
                          <VenueIcalSync venueId={editVenueId} />
                        </Suspense>
                      ) : (
                        <Alert>
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>
                            Click "Save as Draft" below and you'll come straight back here, with your Airbnb,
                            Booking.com and Google Calendar links ready to paste in. We need the venue to exist
                            before we can attach a calendar to it.
                          </AlertDescription>
                        </Alert>
                      )}
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
                        onClick={() => onSubmit(form.getValues())}
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
