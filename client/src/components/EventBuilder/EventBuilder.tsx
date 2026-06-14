import { useState, useEffect, useMemo, useRef, useCallback, Component, ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  ArrowRight, 
  Save, 
  CheckCircle, 
  Clock,
  Info,
  Image,
  Calendar,
  Building,
  Users,
  UserCog,
  Bed,
  DollarSign,
  FileText,
  Upload,
  Plus,
  Minus,
  AlertCircle,
  AlertTriangle,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { SharedPhotoUpload, PhotoPreview } from "@/components/SharedPhotoUpload";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { RolesEditor } from "@/components/RolesEditor";
import { GroupedMultiSelect } from "@/components/GroupedMultiSelect";
import Navigation from "@/components/navigation";
import { 
  applyDiscounts, 
  formatPriceByCurrency, 
  computeRevenueSplit, 
  computeMVGProgress, 
  getPriceSource, 
  buildSkusFromRooms,
  CURRENCY_CONFIG,
  safeMultiply,
  safeAdd
} from '@shared/pricingService';

const GREAT_PILLAR_VALUES = ["health", "sports", "wellness", "food"] as const;
const FIXED_PLATFORM_FEE_PCT = 15;
const VENUE_COMPENSATION_MODELS = [
  "fixed_fee",
  "per_head",
  "minimum_spend",
  "revenue_share",
  "access_only",
] as const;

function normalizeGreatPillars(value: unknown): Array<typeof GREAT_PILLAR_VALUES[number]> {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return rawValues
    .map((item) => String(item).trim().toLowerCase())
    .filter((item): item is typeof GREAT_PILLAR_VALUES[number] =>
      (GREAT_PILLAR_VALUES as readonly string[]).includes(item)
    );
}

// 9-Step Event Builder Schema aligned with database fields
const eventBuilderSchema = z.object({
  // Step 1: Basic Info
  title: z.string().min(1, "Title is required").max(255, "Title too long").optional().or(z.literal('')),
  shortDescription: z.string().max(500, "Short description too long").optional(),
  description: z.string().min(10, "Description must be at least 10 characters").optional().or(z.literal('')),
  category: z.enum(["sports_wellness", "retreats", "community_social", "adventure_trips", "workations", "festivals_events"]).optional(),
  type: z.enum(["one-day", "multi-day", "virtual"]).optional(),
  greatPillars: z.preprocess(
    normalizeGreatPillars,
    z.array(z.enum(GREAT_PILLAR_VALUES)).default([])
  ),

  // Step 2: Media - Allow empty during editing, validate on publish
  coverImageUrl: z.string().optional().or(z.literal('')),
  gallery: z.array(z.string()).default([]), // Allow any string, URL validation done in validateForPublish

  // Step 3: Dates
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  startTime: z.string().max(20, "Start time too long").optional().or(z.literal('')),
  endTime: z.string().max(20, "End time too long").optional().or(z.literal('')),
  maxParticipants: z.number().min(1, "Must allow at least 1 participant").max(200).optional(),

  // Step 4: Venue
  location: z.string().min(1, "Location is required").optional().or(z.literal('')),
  venueType: z.enum(["catalog", "outdoor", "manual", "virtual", "open"]).default("catalog"),

  // Open-to-Venue-Offers fields (reverse bidding)
  venueOpenSpaceType: z.string().optional(),
  venueTargetDeal: z.string().optional(),

  // Catalog venue fields
  selectedVenueId: z.string().optional(),
  venue: z.string().optional(), // Keep for backward compatibility

  // Manual venue fields
  manualVenueName: z.string().optional(),
  manualVenueAddress: z.string().optional(),
  manualVenueDescription: z.string().optional(),
  manualVenueCapacity: z.coerce.number().min(1).optional().nullable(),
  manualVenuePhotos: z.array(z.string()).default([]), // Allow any string
  // Daytime Space capacity (for one-day events)
  standingCapacity: z.coerce.number().int().min(0).optional().nullable(),
  seatedCapacity: z.coerce.number().int().min(0).optional().nullable(),

  // Virtual event fields
  virtualPlatform: z.string().optional(),
  virtualMeetingUrl: z.string().optional(), // Allow any string, URL validation done separately
  virtualInstructions: z.string().optional(),

  // Step 5: Services & Amenities
  selectedServiceIds: z.array(z.string()).default([]),
  selectedAmenityIds: z.array(z.string()).default([]),
  serviceDemandNotes: z.record(z.string()).default({}),
  serviceConnectRequests: z.record(z.boolean()).default({}),

  // Step 6: Roles
  roles: z.array(z.object({
    name: z.string(),
    required: z.boolean().default(false),
    headcount: z.number().min(1).default(1),
    rate: z.number().optional(),
    notes: z.string().optional(),
  })).default([]),

  // Step 7: Rooms
  accommodationType: z.enum(["shared", "private", "mixed", "none"]).optional().nullable(),
  roomCapacity: z.coerce.number().min(1).optional().nullable(),
  totalRooms: z.coerce.number().min(1).optional().nullable(),
  rooms: z.preprocess(
    (val) => (val === null || val === undefined) ? [] : val,
    z.array(z.object({
      id: z.string(),
      name: z.string().min(1, "Room name is required"),
      capacity: z.coerce.number().int().min(1, "Capacity must be at least 1"),
      quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
      gallery: z.array(z.string()).default([]),
      notes: z.string().optional()
    }))
  ),

  // Step 8: Itinerary
  itinerary: z.array(z.object({
    day: z.number(),
    date: z.date(),
    title: z.string().default(""),
    timeSlots: z.array(z.object({
      id: z.string(),
      startTime: z.string(),
      endTime: z.string(),
      activity: z.string(),
      notes: z.string().optional()
    })).default([]),
    notes: z.string().default("")
  })).default([]),

  // Step 9: Pricing
  price: z.coerce.number().min(0, "Price cannot be negative").optional(),
  pricePerPerson: z.coerce.number().min(0, "Price per person cannot be negative").default(0),
  currency: z.enum(["usd", "eur", "gbp", "cad", "aud"]).optional(),
  
  // Ticket SKUs - per-ticket pricing for different accommodation types
  ticketSkus: z.array(z.object({
    id: z.string(),
    ticketName: z.string().min(1, "Ticket name is required"),
    pricePerPerson: z.number().min(0, "Price cannot be negative"),
    depositPerPerson: z.number().min(0, "Deposit cannot be negative"),
    ticketCapacity: z.number().int().min(1, "Capacity must be at least 1"),
    sourceRoomId: z.string().optional(),
    soldCount: z.number().default(0)
  })).default([]),
  
  // Deposit Settings
  depositEnabled: z.boolean().default(false),
  depositPercentage: z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '' || val === 0) return 20;
      return val;
    },
    z.coerce.number()
  ),
  
  // Legacy monetization model (keep for backward compatibility)
  monetizationModel: z.enum(["facilitator", "influencer"]).optional().nullable(),
  facilitatorServices: z.array(z.string()).default([]),
  serviceCosts: z.record(z.number()).default({}),
  expectedPayout: z.coerce.number().optional().nullable(),
  platformCommission: z.coerce.number().optional().nullable(),
  stripeFee: z.coerce.number().optional().nullable(),
  
  // Creator-led monetisation default
  monetisationMode: z.enum(["creator_led", "great_managed", "promo_only", "extra_services"]).optional(),
  
  // Influencer Commission Pool
  influencerPromotionEnabled: z.boolean().default(false),
  influencerCommissionPct: z.coerce.number().min(0).max(50).optional().nullable().default(0),
  
  // Per-SKU Discounts
  discounts: z.array(z.object({
    id: z.string(),
    title: z.string().min(1, "Discount title is required"),
    type: z.enum(["percentage", "fixed"]),
    value: z.number().min(0, "Discount value must be positive"),
    validUntil: z.date().optional(),
    capacityCap: z.number().min(1).optional(),
    active: z.boolean().default(true),
    skuId: z.string().optional()
  })).default([]),
  
  // Secure Payout via Stripe Connect
  stripeConnectRequired: z.boolean().default(true),
  balanceDueDays: z.number().min(1, "Balance due days must be at least 1").max(90, "Maximum 90 days").default(14),
  
  // Pillar A: Infrastructure fee (fixed) and creator net economics
  creatorPct: z.coerce.number().min(0).max(100).optional().nullable().default(85),
  platformPct: z.coerce.number().min(0).max(100).optional().nullable().default(FIXED_PLATFORM_FEE_PCT),

  // Pillar B: Commercial venue terms
  venueCompensationModel: z.enum(VENUE_COMPENSATION_MODELS).default("access_only"),
  venueFixedFee: z.coerce.number().min(0).optional().nullable().default(0),
  venuePerHeadAmount: z.coerce.number().min(0).optional().nullable().default(0),
  venueMinimumSpend: z.coerce.number().min(0).optional().nullable().default(0),
  venueRevenueSharePct: z.coerce.number().min(0).max(100).optional().nullable().default(0),
  venueAccessFee: z.coerce.number().min(0).optional().nullable().default(0),
  
  // Legacy Revenue Splits (keep for backward compatibility)
  venueRevenuePercentage: z.coerce.number().min(0).max(100).optional().nullable().default(0),
  creatorRevenuePercentage: z.coerce.number().min(0).max(100).optional().nullable().default(85),
  platformRevenuePercentage: z.coerce.number().min(0).max(100).optional().nullable().default(15),
  
  // MVG (Minimum Viable Group) Settings
  requireMinimumParticipants: z.boolean().default(true),
  minimumParticipants: z.number().min(2, "Minimum participants must be at least 2").max(50, "Maximum 50 participants").default(6),
  mvgDeadline: z.date().optional(),

  // Soft-Hold Reservation Settings
  softHoldEnabled: z.boolean().default(false),
  softHoldDurationHours: z.number().min(1, "Minimum hold duration is 1 hour").max(168, "Maximum hold duration is 7 days").default(48),

  // Step 10: Terms - validation handled in validateForPublish to avoid immediate errors on step load
  termsAccepted: z.boolean().default(false),
  termsDocumentUrl: z.string().optional(), // URL to uploaded PDF terms document
  customTerms: z.string().optional() // Editable custom terms and conditions text
});

type EventBuilderData = z.infer<typeof eventBuilderSchema>;

// All available steps with their absolute IDs
const ALL_STEPS = [
  { id: 1, title: "Basic Info", icon: Info, description: "Title, description, and category" },
  { id: 2, title: "Media", icon: Image, description: "Photos and visual content" },
  { id: 3, title: "Dates", icon: Calendar, description: "Schedule and capacity" },
  { id: 4, title: "Venue", icon: Building, description: "Location and space details" },
  { id: 5, title: "Services & Amenities", icon: Users, description: "Services and facility features" },
  { id: 6, title: "Roles", icon: UserCog, description: "Participant roles and contributions" },
  { id: 7, title: "Rooms", icon: Bed, description: "Accommodation and capacity" },
  { id: 8, title: "Plan", icon: Calendar, description: "Daily schedule and activities" },
  { id: 9, title: "Pricing", icon: DollarSign, description: "Pricing and monetization" },
  { id: 10, title: "Terms", icon: FileText, description: "Terms and final review" }
];

// Helper to get filtered steps based on event type.
// Event (one-day) / Virtual: skip Services & Amenities and Rooms to keep the pilot flow lean.
// Trip (multi-day): all steps, including Services, Amenities, Rooms, and MVG threshold.
function getStepsForEventType(eventType: string | undefined): typeof ALL_STEPS {
  if (eventType === 'one-day' || eventType === 'virtual') {
    return ALL_STEPS.filter(step => step.id !== 5 && step.id !== 7);
  }
  return ALL_STEPS;
}

// True when the selected type is a local one-day Event (not a multi-day Trip)
const isEventType = (t: string | undefined) => t === 'one-day';

// Legacy STEPS constant for backward compatibility (will be replaced by dynamic steps)
const STEPS = ALL_STEPS;

interface EventBuilderProps {
  draftId?: string;
  initialExperienceType?: "one-day" | "multi-day";
  onComplete?: (experienceId: string) => void;
}

// Client-side normalization to prevent bad payloads
function normalizeDraftForSave(draft: any) {
  const copy = normalizeEventTripFields(draft);
  if (copy.startDate) copy.startDate = new Date(copy.startDate).toISOString();
  if (copy.endDate) copy.endDate = new Date(copy.endDate).toISOString();
  if (copy.mvgDeadline) copy.mvgDeadline = new Date(copy.mvgDeadline).toISOString();
  return copy;
}

function normalizeEventTripFields(draft: any) {
  const copy = { ...draft };
  const type = copy.type || 'one-day';
  copy.greatPillars = normalizeGreatPillars(copy.greatPillars);
  copy.monetisationMode = 'creator_led';

  if (type === 'one-day') {
    copy.endDate = copy.startDate || copy.endDate;
    copy.rooms = [];
    copy.accommodationType = null;
    copy.roomCapacity = null;
    copy.totalRooms = null;
    // Use explicitly set maxParticipants; do not pull from venue capacity (that's a physical limit, not the creator's spot count)
    copy.maxParticipants = copy.maxParticipants ? Number(copy.maxParticipants) : undefined;
    copy.selectedServices = [];
    copy.selectedAmenities = [];
    copy.selectedServiceIds = [];
    copy.selectedAmenityIds = [];
    copy.serviceDemandNotes = {};
    copy.serviceConnectRequests = {};
  }

  if (type === 'multi-day') {
    copy.startTime = '';
    copy.endTime = '';
    copy.standingCapacity = null;
    copy.seatedCapacity = null;
    const rooms = Array.isArray(copy.rooms) ? copy.rooms : [];
    const sleepingCapacity = rooms.reduce((total: number, room: any) => {
      const capacity = Number(room?.capacity || 0);
      const quantity = Number(room?.quantity || 0);
      return total + capacity * quantity;
    }, 0);
    if (sleepingCapacity > 0) {
      copy.maxParticipants = sleepingCapacity;
    }
  }

  return copy;
}

export default function EventBuilder({ draftId, initialExperienceType, onComplete }: EventBuilderProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false); // Track if experience was published (to stop auto-save)
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(undefined);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<number>(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string>('draft');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Track event type to dynamically show/hide Rooms step
  const [activeSteps, setActiveSteps] = useState(getStepsForEventType(initialExperienceType));
  

  const form = useForm<EventBuilderData>({
    resolver: zodResolver(eventBuilderSchema),
    mode: "onChange",
    defaultValues: {
      title: "",
      shortDescription: "",
      description: "",
      category: undefined,
      type: initialExperienceType,
      greatPillars: [],
      coverImageUrl: "",
      gallery: [],
      startDate: undefined,
      endDate: undefined,
      startTime: "",
      endTime: "",
      maxParticipants: undefined,
      location: "",
      venueType: "catalog",
      venueOpenSpaceType: "",
      venueTargetDeal: "",
      selectedVenueId: "",
      venue: "",
      manualVenueName: "",
      manualVenueAddress: "",
      manualVenueDescription: "",
      manualVenueCapacity: undefined,
      manualVenuePhotos: [],
      standingCapacity: undefined,
      seatedCapacity: undefined,
      virtualPlatform: "",
      virtualMeetingUrl: "",
      virtualInstructions: "",
      selectedServiceIds: [],
      selectedAmenityIds: [],
      serviceDemandNotes: {},
      serviceConnectRequests: {},
      roles: [],
      accommodationType: undefined,
      roomCapacity: undefined,
      totalRooms: undefined,
      itinerary: [],
      price: undefined,
      pricePerPerson: 0,
      currency: undefined,
      ticketSkus: [],
      
      // Deposit Settings
      depositEnabled: false,
      depositPercentage: 20,
      
      // Legacy monetization
      monetizationModel: undefined,
      facilitatorServices: [],
      serviceCosts: {},
      expectedPayout: undefined,
      platformCommission: undefined,
      stripeFee: undefined,
      
      // New Pricing Features (Phase 3) - PHASE 3 FIX: Set explicit defaults
      monetisationMode: 'creator_led',  // Default to creator-led business model
      influencerPromotionEnabled: false,
      influencerCommissionPct: 0,
      discounts: [],
      
      // Secure Payout via Stripe Connect
      stripeConnectRequired: true,
      balanceDueDays: 14,
      
      // Pillar A: Infrastructure fee (fixed)
      creatorPct: 85,
      platformPct: FIXED_PLATFORM_FEE_PCT,

      // Pillar B: Commercial venue terms
      venueCompensationModel: "access_only",
      venueFixedFee: 0,
      venuePerHeadAmount: 0,
      venueMinimumSpend: 0,
      venueRevenueSharePct: 0,
      venueAccessFee: 0,
      
      // Legacy Revenue Splits
      venueRevenuePercentage: 0,
      creatorRevenuePercentage: 85,
      platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
      
      // MVG fields
      requireMinimumParticipants: true,
      minimumParticipants: 6,
      mvgDeadline: undefined,
      
      // Soft-Hold fields
      softHoldEnabled: false,
      softHoldDurationHours: 48,
      
      termsAccepted: false,
      termsDocumentUrl: '',
      customTerms: ''
    }
  });

  // Silent auto-save mutation (no toast notifications)
  const autoSaveMutation = useMutation({
    mutationFn: async (data: Partial<EventBuilderData>) => {
      if (!user?.id) throw new Error("User not authenticated");
      const normalizedData = normalizeEventTripFields(data);
      
      // Map form field names to draft schema field names
      // CRITICAL: Explicitly preserve all array fields to prevent data loss during autosave
      const mappedData = {
        ...normalizedData,
        // Handle date fields safely - ensure proper serialization for all date types
        startDate: normalizedData.startDate ? (typeof normalizedData.startDate === 'string' ? normalizedData.startDate : 
                   (normalizedData.startDate instanceof Date ? normalizedData.startDate.toISOString() : null)) : null,
        endDate: normalizedData.endDate ? (typeof normalizedData.endDate === 'string' ? normalizedData.endDate : 
                 (normalizedData.endDate instanceof Date ? normalizedData.endDate.toISOString() : null)) : null,
        mvgDeadline: normalizedData.mvgDeadline ? (typeof normalizedData.mvgDeadline === 'string' ? normalizedData.mvgDeadline : 
                     (normalizedData.mvgDeadline instanceof Date ? normalizedData.mvgDeadline.toISOString() : null)) : null,
        // Map MVG form fields to draft schema fields
        mvgEnabled: (normalizedData as any).requireMinimumParticipants ?? (normalizedData as any).mvgEnabled ?? true,
        mvgMinimumSize: (normalizedData as any).minimumParticipants || (normalizedData as any).mvgMinimumSize || 6,
        // Ensure maxParticipants is preserved
        maxParticipants: normalizedData.maxParticipants || 1,
        // STABILITY: Explicitly preserve greatPillars array to prevent silent data loss
        greatPillars: normalizeGreatPillars((normalizedData as any).greatPillars),
        monetisationMode: 'creator_led',
        // Preserve other critical arrays
        gallery: Array.isArray(normalizedData.gallery) ? normalizedData.gallery : [],
        rooms: Array.isArray(normalizedData.rooms) ? normalizedData.rooms : [],
        roles: Array.isArray((normalizedData as any).roles) ? (normalizedData as any).roles : [],
        ticketSkus: Array.isArray(normalizedData.ticketSkus) ? normalizedData.ticketSkus : [],
      };
      
      const draftData = {
        ...mappedData,
        currentStep, // Save current step
        creatorId: user.id
      };

      if (currentDraftId) {
        return apiRequest("PUT", `/api/experience-drafts/${currentDraftId}`, draftData);
      } else {
        return apiRequest("POST", "/api/experience-drafts", draftData);
      }
    },
    onSuccess: async (response) => {
      setLastSaved(new Date());
      setIsSaving(false);
      
      // If this was a POST (new draft), capture the draft ID
      if (!currentDraftId && response.ok) {
        const result = await response.json();
        if (result.id) {
          setDraftLoaded(true);
          setCurrentDraftId(result.id);
          // Don't update URL during autosave - causes infinite render loop
          // URL will update on manual save or navigation
        }
      }
      // Silent autosave - no toast notification
    },
    onError: (error: any) => {
      setIsSaving(false);
      
      // Determine if this is a transient network error that should be ignored
      const isTransientError = (
        error?.name === 'TypeError' ||
        error?.message?.includes('fetch') ||
        error?.message?.includes('network') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('disconnected') ||
        !navigator.onLine
      );
      
      // Absolutely silent operation - never show user notifications for autosave failures
      // Only log in development for debugging purposes
      if (import.meta.env.DEV) {
        if (isTransientError) {
          console.log("Autosave: Transient network error (ignored):", error?.message || error);
        } else {
          console.log("Autosave: Non-network error (silent):", error?.message || error);
        }
      }
      
      // Complete silence - no toast notifications, no user alerts, no interruptions
      // The user should never know autosave failed - it will retry on next change
    },
    // Add retry configuration for network failures
    retry: (failureCount, error: any) => {
      // Only retry network-related errors, and only up to 2 times
      const isNetworkError = (
        error?.name === 'TypeError' ||
        error?.message?.includes('fetch') ||
        error?.message?.includes('network') ||
        error?.message?.includes('timeout')
      );
      
      return isNetworkError && failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * (2 ** attemptIndex), 10000), // Exponential backoff, max 10s
  });

  // Manual save mutation (with toast notifications)
  const manualSaveMutation = useMutation({
    mutationFn: async (data: Partial<EventBuilderData>) => {
      if (!user?.id) throw new Error("User not authenticated");
      
      // Ensure dates are properly serialized for database storage
      // CRITICAL: Explicitly preserve all array fields to prevent data loss during save
      const mappedData = {
        ...data,
        // Handle date fields safely - ensure proper serialization for all date types
        startDate: data.startDate ? (typeof data.startDate === 'string' ? data.startDate : 
                   (data.startDate instanceof Date ? data.startDate.toISOString() : null)) : null,
        endDate: data.endDate ? (typeof data.endDate === 'string' ? data.endDate : 
                 (data.endDate instanceof Date ? data.endDate.toISOString() : null)) : null,
        mvgDeadline: data.mvgDeadline ? (typeof data.mvgDeadline === 'string' ? data.mvgDeadline : 
                     (data.mvgDeadline instanceof Date ? data.mvgDeadline.toISOString() : null)) : null,
        // Map MVG form fields to draft schema fields
        mvgEnabled: (data as any).requireMinimumParticipants ?? (data as any).mvgEnabled ?? true,
        mvgMinimumSize: (data as any).minimumParticipants || (data as any).mvgMinimumSize || 6,
        // STABILITY: Explicitly preserve greatPillars array to prevent silent data loss
        greatPillars: normalizeGreatPillars((data as any).greatPillars),
        monetisationMode: 'creator_led',
        // Preserve other critical arrays
        gallery: Array.isArray(data.gallery) ? data.gallery : [],
        rooms: Array.isArray(data.rooms) ? data.rooms : [],
        roles: Array.isArray((data as any).roles) ? (data as any).roles : [],
        ticketSkus: Array.isArray(data.ticketSkus) ? data.ticketSkus : [],
      };
      
      const draftData = {
        ...mappedData,
        currentStep,
        creatorId: user.id
      };

      if (currentDraftId) {
        return apiRequest("PUT", `/api/experience-drafts/${currentDraftId}`, draftData);
      } else {
        return apiRequest("POST", "/api/experience-drafts", draftData);
      }
    },
    onSuccess: async (response) => {
      setLastSaved(new Date());
      setIsSaving(false);
      
      // If this was a POST (new draft), capture the draft ID
      if (!currentDraftId && response.ok) {
        const result = await response.json();
        if (result.id) {
          setDraftLoaded(true);
          setCurrentDraftId(result.id);
          // Don't update URL during autosave - causes infinite render loop
          // URL will update on manual save or navigation
        }
      }
      
      toast({
        title: "Progress saved",
        description: "Your changes have been saved successfully.",
        duration: 2000,
      });
    },
    onError: (error: any) => {
      setIsSaving(false);
      console.error("Manual save error:", error);
      
      // Provide specific error messages based on error type
      let errorMessage = "Unable to save your progress. Please try again.";
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error. Please check your connection and try saving again.";
      } else if (error.message?.includes('401') || error.message?.includes('unauthorized')) {
        errorMessage = "Session expired. Please refresh the page and log in again.";
      } else if (error.message?.includes('413')) {
        errorMessage = "Draft too large. Please reduce image sizes or content length.";
      } else if (error.message) {
        errorMessage = `Save failed: ${error.message}`;
      }
      
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Helper function to detect demo events for placeholder bypass
  const isDemoEvent = (formData: any) => {
    return formData.title?.toLowerCase().includes('mystic') && 
           formData.title?.toLowerCase().includes('marrakesh');
  };

  // Refs to track autosave state without causing re-renders
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const pendingChangesRef = useRef(false); // Track if changes occurred while saving
  
  // Keep isSavingRef in sync with state and handle pending changes
  useEffect(() => {
    const wasSaving = isSavingRef.current;
    isSavingRef.current = isSaving;
    
    // When save completes and there were pending changes, schedule a follow-up save
    if (wasSaving && !isSaving && pendingChangesRef.current) {
      pendingChangesRef.current = false;
      // Schedule follow-up save after brief delay
      autoSaveTimeoutRef.current = setTimeout(() => {
        if (!isSavingRef.current && !autoSaveMutation.isPending && form.formState.isDirty) {
          const formData = form.getValues();
          if (import.meta.env.DEV) {
            console.log('Triggering follow-up auto-save for pending changes...');
          }
          setIsSaving(true);
          setLastAutoSaveTime(Date.now());
          autoSaveMutation.mutate(formData);
        }
      }, 2000);
    }
  }, [isSaving, form, autoSaveMutation]);
  
  // Check if form has meaningful data
  const hasMeaningfulData = useCallback((formData: any) => {
    const hasTitle = formData.title && formData.title.trim().length > 0;
    const hasDescription = formData.description && formData.description.trim().length > 0;
    const hasCoverImage = formData.coverImageUrl && formData.coverImageUrl.trim().length > 0;
    const hasGallery = formData.gallery && formData.gallery.length > 0;
    const hasServices = formData.selectedServiceIds && formData.selectedServiceIds.length > 0;
    const hasAmenities = formData.selectedAmenityIds && formData.selectedAmenityIds.length > 0;
    const hasItinerary = formData.itinerary && formData.itinerary.length > 0;
    return hasTitle || hasDescription || hasCoverImage || hasGallery || hasServices || hasAmenities || hasItinerary;
  }, []);

  // Auto-save effect using debounced form.watch subscription
  // This avoids render loops while still reacting to form changes
  useEffect(() => {
    // Subscribe to form changes - form.watch with callback doesn't cause re-renders
    const subscription = form.watch(() => {
      // If already saving, mark pending changes for follow-up
      if (isSavingRef.current || autoSaveMutation.isPending) {
        pendingChangesRef.current = true;
        return;
      }
      
      // Skip if offline, hidden, or published
      if (!navigator.onLine || document.hidden || isPublished) {
        return;
      }
      
      // Clear any existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      // Debounce autosave by 8 seconds
      autoSaveTimeoutRef.current = setTimeout(() => {
        // Re-check conditions using refs for fresh values
        if (isSavingRef.current || autoSaveMutation.isPending || !navigator.onLine || document.hidden || isPublished) {
          return;
        }
        
        if (!form.formState.isDirty) {
          return;
        }
        
        const formData = form.getValues();
        if (!hasMeaningfulData(formData)) {
          return;
        }
        
        // Trigger autosave
        if (import.meta.env.DEV) {
          console.log('Triggering debounced auto-save...');
        }
        setIsSaving(true);
        setLastAutoSaveTime(Date.now());
        autoSaveMutation.mutate(formData);
      }, 8000);
    });
    
    // Cleanup subscription and timeout on unmount
    return () => {
      subscription.unsubscribe();
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPublished, hasMeaningfulData]);

  // Reset draftLoaded when navigating to a different draft
  useEffect(() => {
    if (draftId !== currentDraftId) {
      setDraftLoaded(false);
    }
  }, [draftId, currentDraftId]);

  // Watch event type and update active steps dynamically
  // One-day and virtual events skip the Rooms step
  const eventType = form.watch('type');
  const prevEventTypeForClear = useRef<string>('multi-day'); // Initialize to default
  useEffect(() => {
    const newSteps = getStepsForEventType(eventType);
    setActiveSteps(newSteps);
    
    // If the current step is hidden for this type, move to the next available step.
    if (!newSteps.some(step => step.id === currentStep)) {
      const nextVisibleStep = newSteps.find(step => step.id > currentStep) || newSteps[newSteps.length - 1];
      setCurrentStep(nextVisibleStep.id);
    }
    
    // Clear trip-only fields when switching TO one-day or virtual FROM multi-day
    const wasMultiDay = prevEventTypeForClear.current === 'multi-day';
    const isNowNonRoom = eventType === 'one-day' || eventType === 'virtual';
    if (wasMultiDay && isNowNonRoom) {
      const currentRooms = form.getValues('rooms') || [];
      if (currentRooms.length > 0) {
        form.setValue('rooms', [], { shouldDirty: true });
        form.setValue('ticketSkus', [], { shouldDirty: true });
      }
      (form as any).setValue('selectedServices', [], { shouldDirty: true });
      (form as any).setValue('selectedAmenities', [], { shouldDirty: true });
      form.setValue('selectedServiceIds', [], { shouldDirty: true });
      form.setValue('selectedAmenityIds', [], { shouldDirty: true });
      form.setValue('serviceDemandNotes', {}, { shouldDirty: true });
      form.setValue('serviceConnectRequests', {}, { shouldDirty: true });
    }
    prevEventTypeForClear.current = eventType || 'multi-day';
  }, [eventType, currentStep, form]);

  // Helper function to normalize loaded data (works for both drafts and experiences)
  const normalizeLoadedData = (data: any) => {
    // Normalize dates from ISO strings to Date objects
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    if (data.mvgDeadline) data.mvgDeadline = new Date(data.mvgDeadline);
    if (data.itinerary) {
      data.itinerary = data.itinerary.map((day: any) => ({
        ...day,
        date: new Date(day.date)
      }));
    }
    
    // Map MVG fields and ensure image fields are properly handled
    return {
      ...data,
      requireMinimumParticipants: data.mvgEnabled !== undefined ? data.mvgEnabled : true,
      minimumParticipants: data.mvgMinimumSize || data.minimumParticipants || 6,
      mvgDeadline: data.mvgDeadline,
      // Ensure Great Pillars array is properly handled
      greatPillars: normalizeGreatPillars(data.greatPillars),
      // Ensure image fields are properly handled
      coverImageUrl: data.coverImageUrl || '',
      gallery: Array.isArray(data.gallery) ? data.gallery.filter((url: string) => url && url.startsWith('http')) : [],
      // Migrate legacy room photo field to gallery array
      rooms: Array.isArray(data.rooms) ? data.rooms.map((room: any) => ({
        ...room,
        gallery: (room.gallery ?? (room.photo ? [room.photo] : [])).slice(0,3),
        photo: undefined
      })) : [],
      // Ensure services and amenities arrays are properly handled
      selectedServiceIds: Array.isArray(data.selectedServiceIds) ? data.selectedServiceIds : [],
      selectedAmenityIds: Array.isArray(data.selectedAmenityIds) ? data.selectedAmenityIds : [],
      serviceDemandNotes: data.serviceDemandNotes || {},
      serviceConnectRequests: data.serviceConnectRequests || {},
      // Ensure roles array is properly loaded
      roles: Array.isArray(data.roles) ? data.roles : [],
      // Ensure currency is properly set without fallback
      currency: data.currency ?? null,
      // Map experience-specific fields to form fields
      maxParticipants: data.maxParticipants || data.capacity,
      price: data.price || data.basePrice,
      // Ensure marketplace economics defaults are preserved when loading drafts.
      monetisationMode: 'creator_led',
      venueCompensationModel: data.venueCompensationModel ?? "access_only",
      venueFixedFee: data.venueFixedFee != null ? parseFloat(data.venueFixedFee) : 0,
      venuePerHeadAmount: data.venuePerHeadAmount != null ? parseFloat(data.venuePerHeadAmount) : 0,
      venueMinimumSpend: data.venueMinimumSpend != null ? parseFloat(data.venueMinimumSpend) : 0,
      venueRevenueSharePct: data.venueRevenueSharePct != null
        ? parseFloat(data.venueRevenueSharePct)
        : (data.venueRevenuePercentage ?? 0),
      venueAccessFee: data.venueAccessFee != null ? parseFloat(data.venueAccessFee) : 0,
      venueRevenuePercentage: data.venueRevenuePercentage ?? data.venueRevenueSharePct ?? 0,
      creatorPct: data.creatorPct ?? 85,
      platformPct: FIXED_PLATFORM_FEE_PCT,
      influencerPromotionEnabled: data.influencerPromotionEnabled ?? false,
      influencerCommissionPct: data.influencerCommissionPct != null ? parseFloat(data.influencerCommissionPct) : 0,
      standingCapacity: data.standingCapacity ?? null,
      seatedCapacity: data.seatedCapacity ?? null,
      // Ensure ticketSkus array is properly handled
      ticketSkus: Array.isArray(data.ticketSkus) ? data.ticketSkus : [],
    };
  };

  // Load existing draft or published experience
  useEffect(() => {
    const loadData = async () => {
      if (!user?.id) return;
      if (!draftId || draftLoaded) return;

      try {
        // First try loading as a draft
        let response = await apiRequest("GET", `/api/experience-drafts/${draftId}`);
        
        if (response.ok) {
          const draft = await response.json();
          const mappedData = normalizeLoadedData(draft);
          
          form.reset(mappedData);
          setCurrentStep(draft.currentStep || 1);
          setCurrentDraftId(draft.id);
          setDraftStatus(draft.status || 'draft');
          setDraftLoaded(true);
          console.log("Loaded draft:", draft.id);
          return;
        }
        
        // If not found as draft, try loading as published experience
        response = await apiRequest("GET", `/api/experiences/${draftId}`);
        
        if (response.ok) {
          const experience = await response.json();
          const mappedData = normalizeLoadedData(experience);
          
          form.reset(mappedData);
          setCurrentStep(1); // Start from beginning when editing experience
          setCurrentDraftId(experience.id);
          setDraftStatus(experience.status || 'pending_approval');
          setDraftLoaded(true);
          console.log("Loaded experience for editing:", experience.id);
          return;
        }
        
        // Neither found
        console.log("ID not found as draft or experience:", draftId);
        toast({
          title: "Not found",
          description: "The requested experience could not be found. Starting with a fresh form.",
          variant: "destructive",
        });
        
      } catch (error) {
        console.error("Error loading data:", error);
        toast({
          title: "Error loading",
          description: "Failed to load the experience. Starting with a fresh form.",
          variant: "destructive",
        });
      }
    };

    loadData();
  }, [user?.id, draftId, draftLoaded, toast]);

  const nextStep = async () => {
    // Find current position in activeSteps and move to next
    const currentIdx = activeSteps.findIndex(s => s.id === currentStep);
    if (currentIdx < activeSteps.length - 1) {
      const nextStepId = activeSteps[currentIdx + 1].id;
      setCurrentStep(nextStepId);

      try {
        const formData = form.getValues();
        
        // If no draft ID exists, create one first
        if (!currentDraftId) {
          if (!user?.id) {
            toast({
              title: "Authentication required",
              description: "Please log in to continue creating your experience.",
              variant: "destructive",
            });
            return;
          }
          
          // Create initial draft before navigation
          const draftData = normalizeDraftForSave({
            ...formData,
            currentStep: nextStepId, // Set to next step
            creatorId: user.id
          });
          
          const response = await apiRequest("POST", "/api/experience-drafts", draftData);
          
          const result = await response.json();
          if (result.id) {
            setCurrentDraftId(result.id);
            window.history.replaceState(null, "", `/event-builder/${result.id}`);
          }
        } else {
          // Update existing draft - note: currentStep will be updated separately in the mutation function
          autoSaveMutation.mutate({ ...formData, currentStep: nextStepId } as any);
        }
      } catch (error) {
        console.error("Draft save during navigation failed:", error);
        setSaveError(error instanceof Error ? error.message : "Draft save failed");
        toast({
          title: "Draft not saved yet",
          description: "You can keep building. Save or submit will retry syncing your draft.",
          variant: "destructive",
        });
      }
    }
  };

  const prevStep = () => {
    // Find current position in activeSteps and move to previous
    const currentIdx = activeSteps.findIndex(s => s.id === currentStep);
    if (currentIdx > 0) {
      setCurrentStep(activeSteps[currentIdx - 1].id);
    }
  };

  const handleSaveDraft = async () => {
    // Prevent duplicate requests
    if (isSaving) return;
    
    setIsSaving(true);
    setSaveError(null); // Clear previous errors
    
    try {
      // Get all form values
      const formData = form.getValues();
      
      // Collect all required form fields (title, description, location, media, rooms, pricing, terms)
      const rawDraftPayload = {
        // Basic info fields
        title: formData.title || '',
        shortDescription: formData.shortDescription || '',
        description: formData.description || '',
        category: formData.category || '',
        type: formData.type || 'one-day',
        greatPillars: normalizeGreatPillars(formData.greatPillars),
        
        // Media fields
        coverImageUrl: formData.coverImageUrl || '',
        gallery: formData.gallery || [],
        
        // Date fields - will be normalized below
        startDate: formData.startDate,
        endDate: formData.endDate,
        mvgDeadline: formData.mvgDeadline,
        
        // Venue/location fields
        location: formData.location || '',
        venueType: formData.venueType || 'catalog',
        venueOpenSpaceType: formData.venueOpenSpaceType || undefined,
        venueTargetDeal: formData.venueTargetDeal || undefined,
        selectedVenueId: formData.selectedVenueId || '',
        manualVenueName: formData.manualVenueName || '',
        manualVenueAddress: formData.manualVenueAddress || '',
        manualVenueDescription: formData.manualVenueDescription || '',
        manualVenueCapacity: formData.manualVenueCapacity,
        manualVenuePhotos: formData.manualVenuePhotos || [],
        virtualPlatform: formData.virtualPlatform || '',
        virtualMeetingUrl: formData.virtualMeetingUrl || '',
        virtualInstructions: formData.virtualInstructions || '',

        // Room fields
        accommodationType: formData.accommodationType,
        roomCapacity: formData.roomCapacity,
        totalRooms: formData.totalRooms,
        rooms: formData.rooms || [],
        
        // Pricing and deposit fields
        price: formData.price || formData.pricePerPerson || '',
        pricePerPerson: formData.pricePerPerson || formData.price || 0,
        // DATA CONTRACT: Default to EUR for new experiences
        currency: (formData.currency || 'eur').toLowerCase(),
        depositEnabled: formData.depositEnabled || false,
        depositPercentage: formData.depositPercentage || 20,
        
        // Marketplace economics
        venueCompensationModel: formData.venueCompensationModel || "access_only",
        venueFixedFee: formData.venueFixedFee || 0,
        venuePerHeadAmount: formData.venuePerHeadAmount || 0,
        venueMinimumSpend: formData.venueMinimumSpend || 0,
        venueRevenueSharePct: formData.venueRevenueSharePct || 0,
        venueAccessFee: formData.venueAccessFee || 0,
        // Legacy percentage fields remain for compatibility, but platform is fixed.
        venueRevenuePercentage: formData.venueCompensationModel === "revenue_share"
          ? (formData.venueRevenueSharePct || 0)
          : 0,
        creatorRevenuePercentage: 85,
        platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
        creatorPct: 85,
        platformPct: FIXED_PLATFORM_FEE_PCT,
        monetisationMode: 'creator_led',

        // Promoter bounty (deducted from creator's share)
        influencerPromotionEnabled: formData.influencerPromotionEnabled ?? false,
        influencerCommissionPct: formData.influencerCommissionPct ?? 0,
        promoterCommission: formData.influencerCommissionPct ?? 0,

        // Daytime Space capacity
        standingCapacity: formData.standingCapacity ?? null,
        seatedCapacity: formData.seatedCapacity ?? null,

        // Capacity and MVG fields
        maxParticipants: formData.maxParticipants || formData.standingCapacity || formData.seatedCapacity || 1,
        // Map frontend MVG fields to draft schema fields (mvgMinimumSize in db)
        mvgEnabled: formData.requireMinimumParticipants ?? true,
        mvgMinimumSize: formData.minimumParticipants || 6,
        // Also send both names for backward compatibility
        requireMinimumParticipants: formData.requireMinimumParticipants ?? true,
        minimumParticipants: formData.minimumParticipants || 6,

        // Services and amenities
        selectedServiceIds: formData.selectedServiceIds || [],
        selectedAmenityIds: formData.selectedAmenityIds || [],
        serviceDemandNotes: formData.serviceDemandNotes || {},
        serviceConnectRequests: formData.serviceConnectRequests || {},
        
        // Roles and itinerary
        roles: formData.roles || [],
        itinerary: formData.itinerary || [],
        
        // Soft hold and other settings
        softHoldEnabled: formData.softHoldEnabled || false,
        softHoldDurationHours: formData.softHoldDurationHours || 48,
        balanceDueDays: formData.balanceDueDays || 14,
        termsAccepted: formData.termsAccepted === true, // Explicit boolean check to prevent false coercion
        termsDocumentUrl: formData.termsDocumentUrl || '',
        customTerms: formData.customTerms || '',
        
        // Meta fields
        currentStep,
        status: 'draft'
      };

      // Normalize dates to prevent bad payloads
      const draftPayload = normalizeDraftForSave(rawDraftPayload);

      let response;
      let endpoint;
      let method;
      
      if (currentDraftId) {
        // Update existing draft
        endpoint = `/api/events/updateDraft/${currentDraftId}`;
        method = "PUT";
      } else {
        // Create new draft
        endpoint = "/api/events/saveDraft";
        method = "POST";
      }
      
      // Call the appropriate API endpoint
      response = await apiRequest(method, endpoint, draftPayload);

      if (response.ok) {
        const result = await response.json();
        
        if (result.success) {
          setLastSaved(new Date());
          setSaveError(null); // Clear any previous errors
          
          // If this was a new draft, capture the ID
          if (!currentDraftId && result.draft?.id) {
            setCurrentDraftId(result.draft.id);
            setLocation(`/event-builder/${result.draft.id}`);
          }
          
          toast({
            title: "Draft saved",
            description: "Your experience draft has been saved successfully.",
            duration: 2000,
          });
        } else {
          const errorMessage = result.message || 'Failed to save draft';
          setSaveError(errorMessage);
          throw new Error(errorMessage);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || 'Failed to save draft';
        setSaveError(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error("Draft save error:", error);
      const errorMessage = error.message || "There was an error saving your draft. Please try again.";
      setSaveError(errorMessage);
      
      toast({
        title: "Failed to save draft",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Validation function for required fields - STRICT validation for publishing
  // Strict validation for publishing - requires HTTPS URLs
  const validateForPublish = (data: any) => {
    const errors: string[] = [];
    
    // Check if this is a demo event (bypass validation for demos)
    const isDemoEvent = data.title?.toLowerCase().includes('mystic') && 
                       data.title?.toLowerCase().includes('marrakesh');
    
    // REQUIRED: Cover photo - allow valid URL formats with protocol allowlist
    // Skip for demo events
    if (!isDemoEvent) {
      if (!data.coverImageUrl || data.coverImageUrl.trim() === '') {
        errors.push("Cover photo is required and must be uploaded");
      } else {
        // Validate URL format and protocol
        try {
          const url = new URL(data.coverImageUrl);
          const allowedProtocols = ['https:', 'http:', 'blob:', 'data:'];
          if (!allowedProtocols.includes(url.protocol)) {
            errors.push("Cover photo must use a valid protocol (https, http, blob, or data)");
          }
        } catch {
          errors.push("Cover photo must be a valid URL");
        }
      }
    }
    
    // Gallery validation - ensure valid URLs with protocol allowlist
    // Skip for demo events
    if (!isDemoEvent && data.gallery && data.gallery.length > 0) {
      const allowedProtocols = ['https:', 'http:', 'blob:', 'data:'];
      const invalidGalleryUrls = data.gallery.filter((url: string) => {
        if (!url || url.trim() === '') return true;
        try {
          const urlObj = new URL(url);
          return !allowedProtocols.includes(urlObj.protocol);
        } catch {
          return true;
        }
      });
      if (invalidGalleryUrls.length > 0) {
        errors.push("All gallery images must be valid URLs with supported protocols");
      }
    }
    
    // Required: title
    if (!data.title || data.title.trim() === '') {
      errors.push("Title is required");
    }
    
    // Required: description
    if (!data.description || data.description.trim() === '') {
      errors.push("Description is required");
    }
    
    // Required: at least one date
    if (!data.startDate) {
      errors.push("Start date is required");
    }

    const experienceType = data.type || 'one-day';

    if (experienceType === 'one-day') {
      if (!data.startTime || data.startTime.trim() === '') {
        errors.push("Start time is required for a single-day event");
      }
      if (!data.endTime || data.endTime.trim() === '') {
        errors.push("End time is required for a single-day event");
      }
      if (!data.standingCapacity && !data.seatedCapacity && !data.maxParticipants) {
        errors.push("Standing or seated capacity is required for a single-day event");
      }
    }

    if (experienceType === 'multi-day') {
      if (!data.endDate) {
        errors.push("End date is required for a multi-day trip");
      }
      const rooms = Array.isArray(data.rooms) ? data.rooms : [];
      if (rooms.length === 0) {
        errors.push("At least one room or sleeping option is required for a multi-day trip");
      }
    }
    
    // Required: location
    if (!data.location || data.location.trim() === '') {
      errors.push("Location is required");
    }
    
    // Venue type specific validation - 5 distinct modes, no overlap
    const venueType = data.venueType || 'catalog';

    if (venueType === 'catalog') {
      // For catalog venues: ensure a venue is selected
      if (!data.selectedVenueId || data.selectedVenueId.trim() === '') {
        errors.push("Please select a venue from the catalog");
      }
    } else if (venueType === 'outdoor') {
      // For outdoor/public locations: only location is needed (validated above)
    } else if (venueType === 'manual') {
      // For custom venues: ensure required fields are filled
      if (!data.manualVenueName || data.manualVenueName.trim() === '') {
        errors.push("Custom venue name is required");
      }
      if (!data.manualVenueAddress || data.manualVenueAddress.trim() === '') {
        errors.push("Custom venue address is required");
      }
    } else if (venueType === 'virtual') {
      // For virtual events: ensure platform is selected
      if (!data.virtualPlatform || data.virtualPlatform.trim() === '') {
        errors.push("Virtual platform is required");
      }
    } else if (venueType === 'open') {
      // For open venue offers: city/location already validated above; space type required
      if (!data.venueOpenSpaceType || data.venueOpenSpaceType.trim() === '') {
        errors.push("Please select the type of space you are looking for");
      }
    }

    // Required: pricing - zero is valid for free RSVP events.
    const ticketSkus = Array.isArray(data.ticketSkus) ? data.ticketSkus : [];
    const hasTicketPricing = ticketSkus.some((sku: any) => {
      const price = Number(sku?.pricePerPerson);
      return !Number.isNaN(price) && price >= 0;
    });
    const basePrice = data.pricePerPerson ?? data.price;
    const hasBasePricing = basePrice !== undefined && basePrice !== null && basePrice !== '' && Number(basePrice) >= 0;
    if (!hasTicketPricing && !hasBasePricing) {
      errors.push("Please set a ticket price, including 0 for free RSVP events");
    }
    
    // Required: explicit currency selection
    if (!data.currency || data.currency === '') {
      errors.push("Currency must be explicitly selected");
    }
    
    // Required: terms acceptance
    if (!data.termsAccepted) {
      errors.push("You must accept the terms and conditions");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      missingFields: errors.length
    };
  };

  // Relaxed validation for draft saving - allows incomplete data
  const validateDraft = (data: any) => {
    const errors: string[] = [];
    
    // For draft saving, allow HTTP URLs (during upload process)
    if (!data.coverImageUrl || data.coverImageUrl.trim() === '' || !data.coverImageUrl.startsWith('http')) {
      errors.push("Cover photo is required and must be uploaded");
    }
    
    // Required: title
    if (!data.title || data.title.trim() === '') {
      errors.push("Title is required");
    }
    
    // Required: description
    if (!data.description || data.description.trim() === '') {
      errors.push("Description is required");
    }
    
    // Required: at least one date
    if (!data.startDate) {
      errors.push("Start date is required");
    }
    
    // Required: location
    if (!data.location || data.location.trim() === '') {
      errors.push("Location is required");
    }
    
    // Venue type specific validation - 5 distinct modes, no overlap
    const venueType = data.venueType || 'catalog';

    if (venueType === 'catalog') {
      // For catalog venues: ensure a venue is selected
      if (!data.selectedVenueId || data.selectedVenueId.trim() === '') {
        errors.push("Please select a venue from the catalog");
      }
    } else if (venueType === 'outdoor') {
      // For outdoor/public locations: only location is needed (validated above)
    } else if (venueType === 'manual') {
      // For custom venues: ensure required fields are filled
      if (!data.manualVenueName || data.manualVenueName.trim() === '') {
        errors.push("Custom venue name is required");
      }
      if (!data.manualVenueAddress || data.manualVenueAddress.trim() === '') {
        errors.push("Custom venue address is required");
      }
    } else if (venueType === 'virtual') {
      // For virtual events: ensure platform is selected
      if (!data.virtualPlatform || data.virtualPlatform.trim() === '') {
        errors.push("Virtual platform is required");
      }
    } else if (venueType === 'open') {
      // For open venue offers: space type required
      if (!data.venueOpenSpaceType || data.venueOpenSpaceType.trim() === '') {
        errors.push("Please select the type of space you are looking for");
      }
    }

    // Required: pricing - experience-level pricePerPerson (relaxed for draft)
    // Draft validation is more lenient - just check if some pricing info exists
    
    return {
      isValid: errors.length === 0,
      errors,
      missingFields: errors.length
    };
  };

  const handleSubmit = async (data: EventBuilderData) => {
    // Prevent duplicate submissions
    if (isPublishing) return;
    
    // Prevent submission if already submitted
    if (draftStatus === 'pending' || draftStatus === 'pending_approval') {
      toast({
        title: "Already submitted",
        description: "This experience has already been submitted for review.",
        variant: "destructive",
      });
      return;
    }
    
    setIsPublishing(true);
    setPublishError(null); // Clear previous errors
    
    try {
      // Get all form values
      const formData = form.getValues();
      
      // Prepare event data for publishing (collect all form fields like saveDraft)
      const rawPublishPayload = {
        // Pass the current draft ID if we have one
        id: currentDraftId || undefined,
        
        // Basic info fields
        title: formData.title || '',
        shortDescription: formData.shortDescription || '',
        description: formData.description || '',
        category: formData.category || '',
        type: formData.type || 'one-day',
        greatPillars: normalizeGreatPillars(formData.greatPillars),
        
        // Media fields
        coverImageUrl: formData.coverImageUrl || '',
        gallery: formData.gallery || [],
        
        // Date fields - will be normalized below
        startDate: formData.startDate,
        endDate: formData.endDate,
        mvgDeadline: formData.mvgDeadline,
        
        // Venue/location fields
        location: formData.location || '',
        venueType: formData.venueType || 'catalog',
        venueOpenSpaceType: formData.venueOpenSpaceType || undefined,
        venueTargetDeal: formData.venueTargetDeal || undefined,
        selectedVenueId: formData.selectedVenueId || '',
        manualVenueName: formData.manualVenueName || '',
        manualVenueAddress: formData.manualVenueAddress || '',
        manualVenueDescription: formData.manualVenueDescription || '',
        manualVenueCapacity: formData.manualVenueCapacity,
        manualVenuePhotos: formData.manualVenuePhotos || [],
        virtualPlatform: formData.virtualPlatform || '',
        virtualMeetingUrl: formData.virtualMeetingUrl || '',
        virtualInstructions: formData.virtualInstructions || '',

        // Room fields
        accommodationType: formData.accommodationType,
        roomCapacity: formData.roomCapacity,
        totalRooms: formData.totalRooms,
        rooms: formData.rooms || [],
        
        // Pricing and deposit fields
        price: formData.price || formData.pricePerPerson || '',
        pricePerPerson: formData.pricePerPerson || formData.price || 0,
        // DATA CONTRACT: Default to EUR for new experiences
        currency: (formData.currency || 'eur').toLowerCase(),
        depositEnabled: formData.depositEnabled || false,
        depositPercentage: formData.depositPercentage || 20,
        
        // Marketplace economics
        venueCompensationModel: formData.venueCompensationModel || "access_only",
        venueFixedFee: formData.venueFixedFee || 0,
        venuePerHeadAmount: formData.venuePerHeadAmount || 0,
        venueMinimumSpend: formData.venueMinimumSpend || 0,
        venueRevenueSharePct: formData.venueRevenueSharePct || 0,
        venueAccessFee: formData.venueAccessFee || 0,
        // Legacy percentage fields remain for compatibility, but platform is fixed.
        venueRevenuePercentage: formData.venueCompensationModel === "revenue_share"
          ? (formData.venueRevenueSharePct || 0)
          : 0,
        creatorRevenuePercentage: 85,
        platformRevenuePercentage: FIXED_PLATFORM_FEE_PCT,
        creatorPct: 85,
        platformPct: FIXED_PLATFORM_FEE_PCT,
        monetisationMode: 'creator_led',

        // Promoter bounty (deducted from creator's share)
        influencerPromotionEnabled: formData.influencerPromotionEnabled ?? false,
        influencerCommissionPct: formData.influencerCommissionPct ?? 0,
        promoterCommission: formData.influencerCommissionPct ?? 0,

        // Daytime Space capacity
        standingCapacity: formData.standingCapacity ?? null,
        seatedCapacity: formData.seatedCapacity ?? null,

        // Capacity and MVG fields
        maxParticipants: formData.maxParticipants || formData.standingCapacity || formData.seatedCapacity || 1,
        // Map frontend MVG fields to draft schema fields (mvgMinimumSize in db)
        mvgEnabled: formData.requireMinimumParticipants ?? true,
        mvgMinimumSize: formData.minimumParticipants || 6,
        // Also send both names for backward compatibility
        requireMinimumParticipants: formData.requireMinimumParticipants ?? true,
        minimumParticipants: formData.minimumParticipants || 6,

        // Services and amenities
        selectedServiceIds: formData.selectedServiceIds || [],
        selectedAmenityIds: formData.selectedAmenityIds || [],
        serviceDemandNotes: formData.serviceDemandNotes || {},
        serviceConnectRequests: formData.serviceConnectRequests || {},
        
        // Roles and itinerary
        roles: formData.roles || [],
        itinerary: formData.itinerary || [],
        
        // Soft hold and other settings
        softHoldEnabled: formData.softHoldEnabled || false,
        softHoldDurationHours: formData.softHoldDurationHours || 48,
        balanceDueDays: formData.balanceDueDays || 14,
        termsAccepted: formData.termsAccepted === true, // Explicit boolean check to prevent false coercion
        termsDocumentUrl: formData.termsDocumentUrl || '',
        customTerms: formData.customTerms || '',
        
        // Meta fields
        currentStep,
        status: 'pending'
      };

      // Normalize dates to prevent bad payloads
      const publishPayload = normalizeDraftForSave(rawPublishPayload);

      let publishDraftId = currentDraftId;
      if (!publishDraftId) {
        const createDraftResponse = await apiRequest("POST", "/api/experience-drafts", {
          ...publishPayload,
          status: "draft",
          currentStep,
        });
        const createdDraft = await createDraftResponse.json();
        publishDraftId = createdDraft.id;
        setCurrentDraftId(publishDraftId);
      }

      // Call the publish API to convert draft to experience
      const response = await apiRequest("POST", `/api/experience-drafts/${publishDraftId}/publish`, publishPayload);

      if (response.ok) {
        const result = await response.json();
        
        // Check for success: either result.success is true OR we have a valid experience/id returned
        if (result.success || result.experience || result.id) {
          setPublishError(null); // Clear any previous errors
          setIsPublished(true); // Stop auto-save from running
          
          toast({
            title: "Experience submitted for review!",
            description: "Your experience has been submitted successfully and is pending approval.",
            duration: 3000,
          });
          
          // Redirect to creator dashboard pending tab after successful submission
          setTimeout(() => {
            setLocation("/creator-dashboard?tab=pending");
          }, 1500);
          
          onComplete?.(result.experience?.id || result.id);
        } else {
          const errorMessage = result.message || 'Failed to publish event';
          setPublishError(errorMessage);
          throw new Error(errorMessage);
        }
      } else {
        // Handle specific API response errors
        const errorData = await response.json().catch(() => ({}));
        let errorMessage = "There was an error submitting your experience for review.";
        
        if (response.status === 400) {
          // Validation errors from server
          if (errorData.errors && Array.isArray(errorData.errors)) {
            errorMessage = `Please complete the following: ${errorData.errors.join(', ')}`;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else {
            errorMessage = "Your experience has validation errors. Please review all required fields.";
          }
        } else if (response.status === 404) {
          errorMessage = "Draft not found. Please save your changes first.";
        } else if (response.status === 403) {
          errorMessage = "You don't have permission to submit this experience.";
        } else if (response.status >= 500) {
          errorMessage = "Server error occurred. Please try again in a few moments.";
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
        
        setPublishError(errorMessage);
        
        toast({
          title: "Submission failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      // Handle network errors or other unexpected errors
      let errorMessage = "There was an error submitting your experience for review.";
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.name === 'AbortError') {
        errorMessage = "Request timed out. Please try again.";
      } else if (error.message) {
        // Parse API error responses that come in format "400: {json}"
        const errorMatch = error.message.match(/^\d+:\s*(.+)$/);
        if (errorMatch) {
          try {
            const errorData = JSON.parse(errorMatch[1]);
            if (errorData.errors && Array.isArray(errorData.errors)) {
              errorMessage = `Please complete the following: ${errorData.errors.join(', ')}`;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // If JSON parsing fails, use the message as-is but clean it up
            errorMessage = error.message.replace(/^\d+:\s*/, '');
          }
        } else {
          errorMessage = error.message;
        }
      }
      
      setPublishError(errorMessage);
      
      toast({
        title: "Submission failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Use activeSteps for dynamic step navigation (skips Rooms for one-day/virtual)
  const currentStepIndex = activeSteps.findIndex(s => s.id === currentStep);
  const currentStepData = activeSteps[currentStepIndex] || ALL_STEPS[currentStep - 1]; // Fallback to ALL_STEPS
  const progress = ((currentStepIndex + 1) / activeSteps.length) * 100;
  const isLastStep = currentStepIndex === activeSteps.length - 1;
  
  // Watch termsAccepted to trigger re-validation when checkbox changes
  const watchedTermsAccepted = form.watch('termsAccepted');
  
  // Get current validation status - use strict validation for submit button
  // Note: We include watchedTermsAccepted in deps to re-validate when terms checkbox changes
  const currentValidation = useMemo(() => {
    try {
      const formData = form.getValues();
      return isLastStep 
        ? validateForPublish(formData) 
        : validateDraft(formData);
    } catch (error) {
      console.error('[EventBuilder] Validation error:', error);
      return { isValid: false, missingFields: 0, errors: [] as string[] };
    }
  }, [isLastStep, form.formState.submitCount, watchedTermsAccepted]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Create Experience
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Step {currentStepIndex + 1} of {activeSteps.length}: {currentStepData.title}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {lastSaved && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Saved {lastSaved.toLocaleTimeString()}
                </div>
              )}
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="w-4 h-4 animate-spin" />
                  Saving...
                </div>
              )}
            </div>
          </div>
          
          <Progress value={progress} className="h-2" />
        </div>

        {/* Steps Navigation */}
        <div className="mb-8">
          <div className="flex flex-wrap gap-2">
            {activeSteps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = idx < currentStepIndex;
              
              return (
                <Button
                  key={step.id}
                  variant={isActive ? "default" : isCompleted ? "secondary" : "outline"}
                  size="sm"
                  className={cn(
                    "flex items-center gap-2",
                    isActive && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => setCurrentStep(step.id)}
                  data-testid={`step-${step.id}-button`}
                >
                  <Icon className="w-4 h-4" />
                  {step.title}
                  {isCompleted && <CheckCircle className="w-3 h-3 ml-1" />}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <Form {...form}>
          <form onSubmit={(event) => event.preventDefault()} noValidate>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <currentStepData.icon className="w-5 h-5" />
                  {currentStepData.title}
                </CardTitle>
                <p className="text-gray-600 dark:text-gray-400">
                  {currentStepData.description}
                </p>
              </CardHeader>
              <CardContent className="min-h-[400px]">
                <StepContentWrapper>
                  {renderStepContent()}
                </StepContentWrapper>
              </CardContent>
            </Card>

          {/* Validation Checklist - Show on final step */}
          {isLastStep && (
            <div className="mt-8 p-6 border rounded-lg bg-white dark:bg-gray-800">
              <h3 className="text-lg font-semibold mb-4">Publication Checklist</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ChecklistItem 
                    label="Cover Photo" 
                    completed={(() => {
                      const coverUrl = form.watch('coverImageUrl');
                      return !!(coverUrl && coverUrl.trim() && coverUrl.startsWith('http'));
                    })()} 
                  />
                  <ChecklistItem 
                    label="Title" 
                    completed={!!form.watch('title')?.trim()} 
                  />
                  <ChecklistItem 
                    label="Description" 
                    completed={!!form.watch('description')?.trim()} 
                  />
                  <ChecklistItem 
                    label="Start Date" 
                    completed={!!form.watch('startDate')} 
                  />
                  <ChecklistItem 
                    label="Location" 
                    completed={!!form.watch('location')?.trim()} 
                  />
                  <ChecklistItem 
                    label="Venue Selection" 
                    completed={(() => {
                      const venueType = form.watch('venueType') || 'catalog';
                      if (venueType === 'catalog') {
                        return !!form.watch('selectedVenueId')?.trim();
                      } else if (venueType === 'outdoor') {
                        // Outdoor venues only need location (already validated separately)
                        return !!form.watch('location')?.trim();
                      } else if (venueType === 'manual') {
                        return !!form.watch('manualVenueName')?.trim() && !!form.watch('manualVenueAddress')?.trim();
                      } else if (venueType === 'virtual') {
                        return !!form.watch('virtualPlatform')?.trim();
                      } else if (venueType === 'open') {
                        return !!form.watch('venueOpenSpaceType')?.trim();
                      }
                      return false;
                    })()}
                  />
                  <ChecklistItem
                    label="Currency Selection"
                    completed={!!form.watch('currency')}
                  />
                  <ChecklistItem
                    label="Price Per Person"
                    completed={(() => {
                      const pricePerPerson = form.watch('pricePerPerson');
                      const parsed = parseFloat(String(pricePerPerson));
                      return pricePerPerson !== undefined && pricePerPerson !== null && pricePerPerson !== '' && !Number.isNaN(parsed) && parsed >= 0;
                    })()}
                  />
                  <ChecklistItem 
                    label="Terms Accepted" 
                    completed={!!form.watch('termsAccepted')} 
                  />
                </div>
                
                {!currentValidation.isValid && (
                  <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                          {currentValidation.missingFields} required field{currentValidation.missingFields !== 1 ? 's' : ''} missing
                        </h4>
                        <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
                          {currentValidation.errors.map((error, index) => (
                            <li key={index}>• {error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                
                {currentValidation.isValid && (
                  <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <span className="font-medium text-green-900 dark:text-green-100">
                        Ready to publish! All required fields are complete.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between items-center mt-8">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              data-testid="button-previous-step"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <div className="flex flex-col items-end gap-2">
              {/* Inline Error Messages */}
              {(saveError || publishError) && (
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-3 max-w-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-red-900 dark:text-red-100">
                        {saveError ? "Draft Save Failed" : "Publish Failed"}
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {saveError || publishError}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isSaving || isPublishing}
                  data-testid="button-save-draft"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? "Saving..." : "Save Draft"}
                </Button>

                {!isLastStep ? (
                  <Button
                    type="button"
                    onClick={nextStep}
                    data-testid="button-next-step"
                  >
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                ) : (
                  <>
                    {draftStatus === 'pending' || draftStatus === 'pending_approval' ? (
                      <Button
                        disabled={true}
                        variant="outline"
                        data-testid="button-already-submitted"
                        className="opacity-50 cursor-not-allowed"
                      >
                        Already Submitted for Review
                        <CheckCircle className="w-4 h-4 ml-2" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => handleSubmit(form.getValues())}
                        disabled={!currentValidation.isValid || isPublishing}
                        data-testid="button-submit-experience"
                        className={(!currentValidation.isValid || isPublishing) ? "opacity-50 cursor-not-allowed" : ""}
                      >
                        {isPublishing ? "Submitting..." : "Submit for Review"}
                        <CheckCircle className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          </form>
        </Form>
      </div>
    </div>
  );

  function renderStepContent() {
    switch (currentStep) {
      case 1:
        return <BasicInfoStep form={form} />;
      case 2:
        return <MediaStep form={form} isSaving={isSaving} setIsSaving={setIsSaving} autoSaveMutation={autoSaveMutation} />;
      case 3:
        return <DatesStep form={form} />;
      case 4:
        return <VenueStepWrapper form={form} />;
      case 5:
        return <ServicesAndAmenitiesStep form={form} />;
      case 6:
        return <RolesStep form={form} />;
      case 7:
        return <RoomsStep form={form} />;
      case 8:
        return <ItineraryStep form={form} />;
      case 9:
        return <PricingStep form={form} />;
      case 10:
        return <TermsStep form={form} />;
      default:
        return <div>Unknown step</div>;
    }
  }
}

// Step Content Wrapper - catches errors in step rendering
class StepContentWrapper extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[StepContentWrapper] Error caught:', error);
    console.error('[StepContentWrapper] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 border-2 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">Error loading this step</h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">
            {this.state.error?.message || 'An unexpected error occurred while loading this step.'}
          </p>
          <pre className="text-xs bg-red-100 dark:bg-red-900 p-2 rounded overflow-auto max-h-32 mb-4">
            {this.state.error?.stack || 'No stack trace available'}
          </pre>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload Page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Validation Components
function ChecklistItem({ label, completed }: { label: string; completed: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {completed ? (
        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
      ) : (
        <AlertCircle className="w-4 h-4 text-gray-400" />
      )}
      <span className={completed ? "text-green-900 dark:text-green-100" : "text-gray-600 dark:text-gray-400"}>
        {label}
      </span>
    </div>
  );
}

// Step Components
function BasicInfoStep({ form }: { form: any }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6">
        {/* Title Field */}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Experience Title *</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Yoga Retreat in Bali"
                  {...field}
                  data-testid="input-experience-title"
                />
              </FormControl>
              <FormDescription>
                Choose a clear, engaging title that captures the essence of your experience.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Short Description Field */}
        <FormField
          control={form.control}
          name="shortDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short Description</FormLabel>
              <FormControl>
                <Input
                  placeholder="Brief one-line summary for search results"
                  {...field}
                  data-testid="input-short-description"
                />
              </FormControl>
              <FormDescription>
                A brief summary that appears in search results and cards (optional, max 500 characters).
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Long Description Field */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Description *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your experience in detail. What will participants do? What makes it special? What should they expect?"
                  className="min-h-[120px]"
                  {...field}
                  data-testid="textarea-description"
                />
              </FormControl>
              <FormDescription>
                Provide a detailed description of your experience. Include what participants will do, what makes it unique, and what they should expect.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category Field */}
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="sports_wellness">Sports & Wellness</SelectItem>
                  <SelectItem value="retreats">Retreats</SelectItem>
                  <SelectItem value="community_social">Community & Social</SelectItem>
                  <SelectItem value="adventure_trips">Adventure Trips</SelectItem>
                  <SelectItem value="workations">Workations</SelectItem>
                  <SelectItem value="festivals_events">Festivals & Events</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose the category that best describes your experience.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Experience Type Field */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <div className="sr-only">
              <FormLabel>Experience Type *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ""}>
                <FormControl>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue placeholder="Select experience type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="one-day">Event (Local) - single day, no rooms, MVG allowed</SelectItem>
                  <SelectItem value="multi-day">✈️ Trip (Global) — Multi-day with rooms &amp; group thresholds</SelectItem>
                  <SelectItem value="virtual">💻 Virtual — Online event</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                <strong>Event</strong> bypasses room inventory but can still use an MVG threshold.{" "}
                <strong>Trip</strong> requires dates, rooms, and a minimum group size.
              </FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Great Pillars Multi-Select - using simple visual checkbox to avoid Radix loop issues */}
        <FormField
          control={form.control}
          name="greatPillars"
          render={({ field }) => {
            const pillars = [
              { value: "health", label: "Health" },
              { value: "sports", label: "Sports" },
              { value: "wellness", label: "Wellness" },
              { value: "food", label: "Food" },
            ];
            const currentValue = normalizeGreatPillars(field.value);
            
            return (
              <FormItem>
                <FormLabel>Which Great Pillars apply?</FormLabel>
                <FormDescription className="mb-3">
                  Select all that apply to your experience.
                </FormDescription>
                <div className="grid grid-cols-2 gap-3" data-testid="great-pillars-container">
                  {pillars.map((pillar) => {
                    const isSelected = currentValue.includes(pillar.value);
                    return (
                      <button
                        key={pillar.value}
                        type="button"
                        className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-background border-border hover:border-primary/50"
                        }`}
                        onClick={() => {
                          const newValue = isSelected
                            ? currentValue.filter((v: string) => v !== pillar.value)
                            : [...currentValue, pillar.value];
                          form.setValue("greatPillars", newValue, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          });
                        }}
                        data-testid={`pillar-${pillar.value}`}
                      >
                        <div 
                          className={`w-4 h-4 border-2 rounded flex items-center justify-center ${
                            isSelected 
                              ? "bg-primary border-primary" 
                              : "border-gray-400"
                          }`}
                          data-testid={`checkbox-pillar-${pillar.value}`}
                        >
                          {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <span className="text-sm font-medium">{pillar.label}</span>
                      </button>
                    );
                  })}
                </div>
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>

      {/* Character count indicators removed - causing render loops with form.watch() */}
    </div>
  );
}

function MediaStep({ form, isSaving, setIsSaving, autoSaveMutation }: { form: any, isSaving: boolean, setIsSaving: (saving: boolean) => void, autoSaveMutation: any }) {
  const coverImageUrl = form.watch('coverImageUrl');
  const gallery = form.watch('gallery') || [];

  const handleCoverImageUpload = (url: string) => {
    // Accept all valid URLs including blob URLs for immediate preview
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('blob:') || url.startsWith('data:'))) {
      form.setValue('coverImageUrl', url, { shouldDirty: true });
      
      // Only trigger auto-save for permanent URLs (https), not temporary blob URLs
      if (url.startsWith('https://')) {
        setTimeout(() => {
          if (!isSaving) {
            setIsSaving(true);
            autoSaveMutation.mutate(form.getValues());
          }
        }, 750); // Slightly longer debounce for image uploads
      }
    }
  };

  const handleGalleryImageUpload = (url: string) => {
    // Accept all valid URLs including blob URLs for immediate preview
    if (url && (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('blob:') || url.startsWith('data:'))) {
      const currentGallery = form.getValues('gallery') || [];
      const updatedGallery = [...currentGallery, url];
      form.setValue('gallery', updatedGallery, { shouldDirty: true });
      
      // Only trigger auto-save for permanent URLs (https), not temporary blob URLs
      if (url.startsWith('https://')) {
        setTimeout(() => {
          if (!isSaving) {
            setIsSaving(true);
            autoSaveMutation.mutate(form.getValues());
          }
        }, 750); // Slightly longer debounce for image uploads
      }
    }
  };

  const removeCoverImage = () => {
    form.setValue('coverImageUrl', '', { shouldDirty: true });
    // Trigger auto-save after removing cover image
    setTimeout(() => {
      if (!isSaving) {
        setIsSaving(true);
        autoSaveMutation.mutate(form.getValues());
      }
    }, 500);
  };

  const removeGalleryImage = (indexToRemove: number) => {
    const currentGallery = form.getValues('gallery') || [];
    const updatedGallery = currentGallery.filter((_: any, index: number) => index !== indexToRemove);
    form.setValue('gallery', updatedGallery, { shouldDirty: true });
    // Trigger auto-save after removing gallery image
    setTimeout(() => {
      if (!isSaving) {
        setIsSaving(true);
        autoSaveMutation.mutate(form.getValues());
      }
    }, 500);
  };

  return (
    <div className="space-y-8">
      {/* Cover Image Section */}
      <FormField
        control={form.control}
        name="coverImageUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cover Image *</FormLabel>
            <FormDescription>
              Upload a high-quality cover image that represents your experience. This will be the main image people see.
            </FormDescription>
            
            {coverImageUrl ? (
              <PhotoPreview
                src={coverImageUrl}
                alt="Cover image preview"
                onRemove={removeCoverImage}
                className="h-64"
                size="lg"
              />
            ) : (
              <SharedPhotoUpload
                uploadType="s3"
                onUploadComplete={handleCoverImageUpload}
                getUploadParameters={async () => {
                  const response = await apiRequest('POST', '/api/objects/upload');
                  if (!response.ok) throw new Error('Failed to get upload URL');
                  const { uploadURL } = await response.json();
                  return { method: 'PUT' as const, url: uploadURL };
                }}
                isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
                maxFileSize={10485760} // 10MB
                multiple={false}
                className="min-h-[200px]"
                data-testid="uploader-cover-image"
              >
                <div className="p-8 text-center">
                  <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <Button type="button" className="mb-2">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Cover Image
                  </Button>
                  <p className="text-sm text-gray-500">
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

      {/* Gallery Section */}
      <FormField
        control={form.control}
        name="gallery"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Gallery Images (Optional)</FormLabel>
            <FormDescription>
              Add additional photos to showcase different aspects of your experience.
            </FormDescription>
            
            {gallery.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                {gallery.map((imageUrl: string, index: number) => (
                  <PhotoPreview
                    key={index}
                    src={imageUrl}
                    alt={`Gallery image ${index + 1}`}
                    onRemove={() => removeGalleryImage(index)}
                    className="h-32"
                    size="md"
                  />
                ))}
              </div>
            )}
            
            <SharedPhotoUpload
              uploadType="s3"
              onUploadComplete={handleGalleryImageUpload}
              getUploadParameters={async () => {
                const response = await apiRequest('POST', '/api/objects/upload');
                if (!response.ok) throw new Error('Failed to get upload URL');
                const { uploadURL } = await response.json();
                return { method: 'PUT' as const, url: uploadURL };
              }}
              isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
              maxFileSize={10485760} // 10MB
              multiple={false}
              className="min-h-[120px]"
              data-testid="uploader-gallery-image"
            >
              <div className="p-6 text-center">
                <Plus className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                <Button type="button" className="mb-2">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Gallery Image
                </Button>
                <p className="text-sm text-gray-500">
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

      {/* Upload Guidelines */}
      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          Photo Guidelines
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
          <li>• Use high-resolution images (at least 1200px wide)</li>
          <li>• Show the actual experience, location, or activities</li>
          <li>• Avoid heavily filtered or edited photos</li>
          <li>• Include photos of the venue, activities, and participants if possible</li>
          <li>• Ensure you have rights to use all uploaded images</li>
        </ul>
      </div>
    </div>
  );
}

function DatesStep({ form }: { form: any }) {
  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');
  const startTime = form.watch('startTime');
  const endTime = form.watch('endTime');
  const eventType = form.watch('type');
  const isSingleDayEvent = eventType === 'one-day';

  return (
    <div className="space-y-8">
      {/* Single Date Range Section */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">{isSingleDayEvent ? "Event Date" : "Trip Dates"}</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start Date */}
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{isSingleDayEvent ? "Date *" : "Start Date *"}</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        data-testid="button-start-date"
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick start date</span>
                        )}
                        <Calendar className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        if (isSingleDayEvent) {
                          form.setValue('endDate', date, { shouldDirty: true });
                        }
                      }}
                      disabled={(date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                   {isSingleDayEvent ? "What date is your event?" : "When does your trip start?"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Date */}
          {!isSingleDayEvent && (
          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date *</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={`w-full pl-3 text-left font-normal ${!field.value && "text-muted-foreground"}`}
                        data-testid="button-end-date"
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick end date</span>
                        )}
                        <Calendar className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date < new Date() || (startDate && date < startDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  When does your trip end?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          )}
        </div>
      </div>

      {/* Time Section */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Experience Times</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Set the start and end times for your experience (optional for multi-day events)
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Start Time */}
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    value={field.value || ''}
                    className="w-full"
                    data-testid="input-start-time"
                  />
                </FormControl>
                <FormDescription>
                  What time does your experience begin?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* End Time */}
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Time</FormLabel>
                <FormControl>
                  <Input
                    type="time"
                    {...field}
                    value={field.value || ''}
                    className="w-full"
                    data-testid="input-end-time"
                  />
                </FormControl>
                <FormDescription>
                  What time does your experience end?
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {isSingleDayEvent ? (
        <FormField
          control={form.control}
          name="maxParticipants"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Capacity (Standing) *</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min="1"
                  placeholder="Maximum number of attendees"
                  value={field.value || ''}
                  onChange={(event) => {
                    const value = parseInt(event.target.value) || undefined;
                    field.onChange(value);
                    form.setValue('standingCapacity', value ?? null, { shouldDirty: true });
                  }}
                  data-testid="input-event-standing-capacity"
                />
              </FormControl>
              <FormDescription>
                Total number of people who can attend this single-day event.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Sleeping capacity is calculated from the rooms and beds you add in the Rooms step.
        </div>
      )}

      {/* Date Range Summary */}
      {startDate && endDate && (
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Experience Summary
          </h4>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <p>Duration: {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}</p>
            <p>Total days: {Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}</p>
            {startTime && <p>Start time: {startTime}</p>}
            {endTime && <p>End time: {endTime}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

class VenueStepErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode; onRetry: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[VenueStep] Error caught:', error);
    console.error('[VenueStep] Error info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 border-2 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 rounded-lg">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-4">
            <AlertCircle className="w-5 h-5" />
            <h3 className="font-semibold">Error loading venue step</h3>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              this.props.onRetry();
            }}
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function VenueStepWrapper({ form }: { form: any }) {
  const [retryKey, setRetryKey] = useState(0);
  return (
    <VenueStepErrorBoundary onRetry={() => setRetryKey(k => k + 1)} key={retryKey}>
      <VenueStep form={form} />
    </VenueStepErrorBoundary>
  );
}

function VenueStep({ form }: { form: any }) {
  const [venues, setVenues] = useState<any[]>([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(false);
  const [venuesError, setVenuesError] = useState<string | null>(null);

  // Safely watch form values with defaults
  const venueType = form.watch('venueType') ?? 'catalog';
  const selectedVenueId = form.watch('selectedVenueId') ?? '';
  const manualVenuePhotos = form.watch('manualVenuePhotos') ?? [];
  const eventType = form.watch('type');

  // Fetch both approved catalog venues AND user's own venues (including drafts)
  useEffect(() => {
    const fetchVenues = async () => {
      if (venueType !== 'catalog') return;
      
      setIsLoadingVenues(true);
      setVenuesError(null);
      try {
        // Fetch approved catalog venues and user's own venues in parallel
        const [catalogResponse, userVenuesResponse] = await Promise.all([
          apiRequest("GET", "/api/venues?approved=true"),
          apiRequest("GET", "/api/user/venues").catch(() => null) // Fallback if not authenticated
        ]);
        
        // Parse catalog venues (required)
        const catalogData = await catalogResponse.json();
        const catalogVenues = Array.isArray(catalogData) ? catalogData : [];
        
        // Parse user venues (optional - may fail if not authenticated)
        let userVenues: any[] = [];
        if (userVenuesResponse && userVenuesResponse.ok) {
          const userData = await userVenuesResponse.json();
          userVenues = Array.isArray(userData) ? userData : [];
        }
        
        // Merge venues: user's venues first, then approved catalog (avoiding duplicates)
        const catalogVenueIds = new Set(catalogVenues.map((v: any) => v.id));
        const userVenuesNotInCatalog = userVenues.filter((v: any) => !catalogVenueIds.has(v.id));
        
        // Mark venues with their source for display
        const markedCatalogVenues = catalogVenues.map((v: any) => ({ ...v, _source: 'catalog' }));
        const markedUserVenues = userVenuesNotInCatalog.map((v: any) => ({ ...v, _source: 'own' }));
        
        // User's own venues first, then catalog
        setVenues([...markedUserVenues, ...markedCatalogVenues]);
      } catch (error) {
        console.error("Error fetching venues:", error);
        setVenuesError("Failed to load venues. Please try again.");
      } finally {
        setIsLoadingVenues(false);
      }
    };

    fetchVenues();
  }, [venueType]);

  const handleManualVenuePhotoUpload = (url: string) => {
    const currentPhotos = form.getValues('manualVenuePhotos') || [];
    form.setValue('manualVenuePhotos', [...currentPhotos, url], { shouldDirty: true });
  };

  const removeManualPhoto = (photoUrl: string) => {
    const currentPhotos = form.getValues('manualVenuePhotos') || [];
    form.setValue('manualVenuePhotos', currentPhotos.filter((url: string) => url !== photoUrl), { shouldDirty: true });
  };

  return (
    <div className="space-y-6">
      {/* Location Input */}
      <FormField
        control={form.control}
        name="location"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Location/City *</FormLabel>
            <FormControl>
              <Input
                placeholder="e.g., Bali, Indonesia or Online"
                {...field}
                value={field.value ?? ''}
                data-testid="input-location"
              />
            </FormControl>
            <FormDescription>
              The general location where your experience takes place.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Venue Type Selection */}
      <FormField
        control={form.control}
        name="venueType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Venue Type *</FormLabel>
            <FormControl>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "catalog" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("catalog")}
                  data-testid="venue-type-catalog"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "catalog"}
                      readOnly
                      className="text-primary"
                    />
                    <Building className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Select from Venues</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Choose from approved venues
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "outdoor" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("outdoor")}
                  data-testid="venue-type-outdoor"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "outdoor"}
                      readOnly
                      className="text-primary"
                    />
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 22h20L12 2z" />
                      <circle cx="12" cy="8" r="2" />
                    </svg>
                    <div>
                      <div className="font-semibold">Outdoor / Public</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Park, beach, or public space
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "manual" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("manual")}
                  data-testid="venue-type-manual"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "manual"}
                      readOnly
                      className="text-primary"
                    />
                    <Plus className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Custom Venue</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Private venue not in catalog
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "virtual" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("virtual")}
                  data-testid="venue-type-virtual"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "virtual"}
                      readOnly
                      className="text-primary"
                    />
                    <Users className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Virtual Event</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Online meeting or livestream
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    "border-2 rounded-lg p-4 cursor-pointer transition-all hover:border-primary/50",
                    field.value === "open" ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  )}
                  onClick={() => field.onChange("open")}
                  data-testid="venue-type-open"
                >
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      checked={field.value === "open"}
                      readOnly
                      className="text-primary"
                    />
                    <AlertCircle className="w-5 h-5 text-amber-500" />
                    <div>
                      <div className="font-semibold">Open to Venue Offers</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Let venues bid to host your event
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Catalog Venue Selection */}
      {venueType === "catalog" && (
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="selectedVenueId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Select Venue *</FormLabel>
                {isLoadingVenues ? (
                  <div className="flex items-center gap-2 p-4 border rounded-lg">
                    <Clock className="w-4 h-4 animate-spin" />
                    Loading venues...
                  </div>
                ) : venuesError ? (
                  <div className="flex items-center gap-2 p-4 border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <span className="text-red-600 dark:text-red-400">{venuesError}</span>
                  </div>
                ) : (
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger data-testid="select-venue">
                        <SelectValue placeholder="Choose a venue from our catalog" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {venues.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No venues available. Create a venue first or wait for admin approval.
                        </div>
                      ) : (
                        venues.map((venue) => (
                          <SelectItem key={venue.id} value={venue.id} data-testid={`venue-option-${venue.id}`}>
                            <div className="flex items-center gap-3">
                              {venue.coverImageUrl && (
                                <img
                                  src={venue.coverImageUrl}
                                  alt={venue.name}
                                  className="w-8 h-8 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{venue.name}</span>
                                  {venue._source === 'own' && venue.status !== 'approved' && (
                                    <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                                      Your Venue
                                    </Badge>
                                  )}
                                  {venue._source === 'own' && venue.status === 'approved' && (
                                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                                      Your Venue
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-500">
                                  {venue.city || venue.location} • Capacity: {venue.capacity}
                                </div>
                              </div>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                <FormDescription>
                  Select from your own venues or our curated list of approved venues.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Show selected venue details */}
          {selectedVenueId && selectedVenueId.length > 0 && venues.length > 0 && (
            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
              {(() => {
                const selectedVenue = venues.find(v => v.id === selectedVenueId);
                if (!selectedVenue) return null;
                return (
                  <div className="flex gap-4">
                    {selectedVenue.coverImageUrl && (
                      <img
                        src={selectedVenue.coverImageUrl}
                        alt={selectedVenue.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{selectedVenue.name}</h4>
                        {selectedVenue._source === 'own' && selectedVenue.status !== 'approved' && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-300">
                            Draft - Pending Approval
                          </Badge>
                        )}
                        {selectedVenue._source === 'own' && selectedVenue.status === 'approved' && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                            Your Approved Venue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {selectedVenue.city || selectedVenue.location}
                      </p>
                      <div className="flex gap-4 text-sm">
                        <span>Capacity: {selectedVenue.capacity}</span>
                        {selectedVenue.price && (
                          <span>Price: ${selectedVenue.price}</span>
                        )}
                      </div>
                      {selectedVenue.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          {selectedVenue.description}
                        </p>
                      )}

                      {/* Venue Pricing & Terms */}
                      {(selectedVenue.commissionPercent || selectedVenue.depositPercent || selectedVenue.paymentModel || selectedVenue.softHoldDays) && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <h5 className="text-sm font-semibold mb-2">Pricing & Booking Terms</h5>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            {selectedVenue.commissionPercent && (
                              <div>
                                <span className="text-gray-500">Commission: </span>
                                <span className="font-medium">{parseFloat(selectedVenue.commissionPercent).toFixed(2)}%</span>
                              </div>
                            )}
                            {selectedVenue.depositPercent && (
                              <div>
                                <span className="text-gray-500">Deposit: </span>
                                <span className="font-medium">{parseFloat(selectedVenue.depositPercent).toFixed(2)}%</span>
                              </div>
                            )}
                            {selectedVenue.paymentModel && (
                              <div>
                                <span className="text-gray-500">Payment: </span>
                                <span className="font-medium capitalize">
                                  {selectedVenue.paymentModel === 'full_upfront' ? 'Full Upfront' :
                                   selectedVenue.paymentModel === 'balance_on_arrival' ? 'Balance on Arrival' :
                                   selectedVenue.paymentModel === 'staggered' ? 'Staggered' :
                                   selectedVenue.paymentModel}
                                </span>
                              </div>
                            )}
                            {selectedVenue.softHoldDays && (
                              <div>
                                <span className="text-gray-500">Soft Hold: </span>
                                <span className="font-medium">{selectedVenue.softHoldDays} days</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Outdoor / Public Location - Minimal fields, just needs location which is already above */}
      {venueType === "outdoor" && (
        <div className="space-y-4 border rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 22h20L12 2z" />
              <circle cx="12" cy="8" r="2" />
            </svg>
            <div>
              <h4 className="font-semibold text-lg text-green-800 dark:text-green-200">Outdoor / Public Location</h4>
              <p className="text-sm text-green-700 dark:text-green-300">
                Parks, beaches, trails, and public spaces. Just specify the location above - no venue booking required.
              </p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Location entered above:</strong> {form.watch('location') || 'Not specified yet'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Tip: Be specific about the meeting point (e.g., "Central Park, Bethesda Fountain entrance")
            </p>
          </div>
        </div>
      )}

      {/* Manual Venue Fields */}
      {venueType === "manual" && (
        <div className="space-y-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          <h4 className="font-semibold text-lg">Custom Venue Details</h4>
          
          <FormField
            control={form.control}
            name="manualVenueName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Name *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Sunset Beach Resort, Mountain View Lodge"
                    {...field}
                    data-testid="input-manual-venue-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Full address or specific location details"
                    {...field}
                    data-testid="input-manual-venue-address"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Describe the venue, its features, amenities, and what makes it special..."
                    className="min-h-[100px]"
                    {...field}
                    data-testid="textarea-manual-venue-description"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="manualVenueCapacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacity</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Maximum number of people the venue can accommodate"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                    data-testid="input-manual-venue-capacity"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Manual Venue Photos */}
          <FormField
            control={form.control}
            name="manualVenuePhotos"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Venue Photos</FormLabel>
                <FormDescription>
                  Upload photos of the venue to help participants know what to expect.
                </FormDescription>
                
                {manualVenuePhotos.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                    {manualVenuePhotos.map((photoUrl: string, index: number) => (
                      <PhotoPreview
                        key={index}
                        src={photoUrl}
                        alt={`Venue photo ${index + 1}`}
                        onRemove={() => removeManualPhoto(photoUrl)}
                        className="h-32"
                        size="md"
                        data-testid={`img-venue-photo-${index}`}
                      />
                    ))}
                  </div>
                )}

                <SharedPhotoUpload
                  uploadType="s3"
                  onUploadComplete={handleManualVenuePhotoUpload}
                  getUploadParameters={async () => {
                    const response = await apiRequest('POST', '/api/objects/upload');
                    if (!response.ok) throw new Error('Failed to get upload URL');
                    const { uploadURL } = await response.json();
                    return { method: 'PUT' as const, url: uploadURL };
                  }}
                  isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
                  maxFileSize={10485760} // 10MB
                  multiple={false}
                  className="min-h-[120px]"
                  data-testid="uploader-venue-photos"
                >
                  <div className="p-6 text-center">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                    <Button type="button" className="mb-2">
                      <Upload className="w-4 h-4 mr-2" />
                      {manualVenuePhotos.length === 0 ? "Upload venue photos" : "Add more photos"}
                    </Button>
                    <p className="text-sm text-gray-500">
                      or drag and drop images here
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      JPG, PNG, or WEBP up to 10MB each
                    </p>
                  </div>
                </SharedPhotoUpload>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Virtual Event Fields */}
      {venueType === "virtual" && (
        <div className="space-y-4 border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
          <h4 className="font-semibold text-lg">Virtual Event Details</h4>
          
          <FormField
            control={form.control}
            name="virtualPlatform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Platform *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-virtual-platform">
                      <SelectValue placeholder="Select virtual platform" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="zoom">Zoom</SelectItem>
                    <SelectItem value="google_meet">Google Meet</SelectItem>
                    <SelectItem value="microsoft_teams">Microsoft Teams</SelectItem>
                    <SelectItem value="discord">Discord</SelectItem>
                    <SelectItem value="custom">Custom Platform</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="virtualMeetingUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meeting URL</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://zoom.us/j/..."
                    {...field}
                    data-testid="input-virtual-meeting-url"
                  />
                </FormControl>
                <FormDescription>
                  The link participants will use to join the virtual experience.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="virtualInstructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Instructions for Participants</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Provide instructions on how to join, what to prepare, technical requirements, etc."
                    className="min-h-[100px]"
                    {...field}
                    data-testid="textarea-virtual-instructions"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Daytime Space inputs — raw/functional inputs for one-day events (coffeeshop collabs etc.) */}
      {eventType === 'one-day' && (
        <div style={{ border: '1px solid #ccc', padding: '12px', borderRadius: '6px', marginTop: '12px' }}>
          <p style={{ fontWeight: 600, marginBottom: '8px' }}>Daytime Space Details</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label htmlFor="standing-capacity" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>
                Standing Capacity
              </label>
              <input
                id="standing-capacity"
                type="number"
                min="0"
                placeholder="e.g. 100"
                value={form.watch('standingCapacity') ?? ''}
                onChange={(e) => form.setValue('standingCapacity', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                data-testid="input-standing-capacity"
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
            <div>
              <label htmlFor="seated-capacity" style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px' }}>
                Seated Capacity
              </label>
              <input
                id="seated-capacity"
                type="number"
                min="0"
                placeholder="e.g. 40"
                value={form.watch('seatedCapacity') ?? ''}
                onChange={(e) => form.setValue('seatedCapacity', e.target.value ? parseInt(e.target.value) : null, { shouldDirty: true })}
                data-testid="input-seated-capacity"
                style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Open to Venue Offers Fields */}
      {venueType === "open" && (
        <div className="space-y-4 border-2 border-amber-200 dark:border-amber-800 rounded-lg p-4 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h4 className="font-semibold text-amber-900 dark:text-amber-100">Open Venue Request</h4>
          </div>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Your event will publish with <strong>Venue Pending</strong> status. Venues matching your criteria can discover and bid to host your event.
          </p>

          <FormField
            control={form.control}
            name="venueOpenSpaceType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Space Type Needed *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-venue-open-space-type">
                      <SelectValue placeholder="Select the type of space you need" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="coffee_shop">Coffee Shop / Café</SelectItem>
                    <SelectItem value="restaurant">Restaurant / Bar</SelectItem>
                    <SelectItem value="fitness_studio">Fitness Studio / Gym</SelectItem>
                    <SelectItem value="yoga_studio">Yoga / Dance Studio</SelectItem>
                    <SelectItem value="coworking">Co-working Space</SelectItem>
                    <SelectItem value="retail_gallery">Retail / Gallery</SelectItem>
                    <SelectItem value="outdoor_park">Outdoor / Park</SelectItem>
                    <SelectItem value="private_villa">Private Villa / Home</SelectItem>
                    <SelectItem value="retreat_center">Retreat Center</SelectItem>
                    <SelectItem value="hotel_conference">Hotel / Conference Room</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Venues of this type in your selected city will be able to see and respond to your event.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Validation Summary */}
      <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Venue Requirements</h4>
        <div className="space-y-1 text-sm text-blue-800 dark:text-blue-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            Location must be specified
          </div>
          {venueType === "catalog" && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              A venue must be selected from the catalog
            </div>
          )}
          {venueType === "manual" && (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Venue name and address are required
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                Description and photos help attract participants
              </div>
            </>
          )}
          {venueType === "virtual" && (
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Virtual platform must be selected
            </div>
          )}
          {venueType === "open" && (() => {
            const spaceType = form.watch('venueOpenSpaceType');
            return spaceType ? (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                Space type selected — event publishes as Venue Pending until matched
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Space type must be selected before publishing
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function ServicesAndAmenitiesStep({ form }: { form: any }) {
  // Load services and amenities from JSON
  const [servicesData, setServicesData] = useState<any>(null);
  
  useEffect(() => {
    import('@/data/options/services_and_amenities.json').then((data) => {
      setServicesData(data.default || data);
    });
  }, []);

  // Watch form state for selected services and amenities
  const formState = form.watch();
  const selectedServices = useMemo(() => 
    Array.isArray(formState.selectedServices) ? formState.selectedServices : [], 
    [formState.selectedServices]
  );
  const selectedAmenities = useMemo(() => 
    Array.isArray(formState.selectedAmenities) ? formState.selectedAmenities : [], 
    [formState.selectedAmenities]
  );

  // Legacy support: keep selectedServiceIds and selectedAmenityIds for backward compatibility
  // IMPORTANT: This must be called BEFORE any early returns to maintain consistent hook order
  // Note: Removed `form` from dependency array to prevent infinite re-render loop
  useEffect(() => {
    const serviceIds = selectedServices.map((s: any) => s.id);
    const amenityIds = selectedAmenities.map((a: any) => a.id);
    form.setValue('selectedServiceIds', serviceIds, { shouldDirty: false });
    form.setValue('selectedAmenityIds', amenityIds, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedServices, selectedAmenities]);

  // Early return for loading state - after all hooks are called
  if (!servicesData) {
    return <div className="p-4">Loading options...</div>;
  }

  const availableServices = servicesData.services.map((group: any) => ({
    category: group.category,
    items: group.items
  }));

  const availableAmenities = servicesData.amenities.map((group: any) => ({
    category: group.category,
    items: group.items
  }));

  const handleServicesChange = (services: any[]) => {
    form.setValue('selectedServices', services, { shouldDirty: true, shouldTouch: true });
  };

  const handleAmenitiesChange = (amenities: any[]) => {
    form.setValue('selectedAmenities', amenities, { shouldDirty: true, shouldTouch: true });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="services" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="services" data-testid="tab-services">Services</TabsTrigger>
          <TabsTrigger value="amenities" data-testid="tab-amenities">Amenities</TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Service Providers</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Select service providers you need for your experience. You can choose from our list or add custom services.
            </p>
          </div>

          <GroupedMultiSelect
            options={availableServices}
            selected={selectedServices}
            onChange={handleServicesChange}
            placeholder="Select services..."
            emptyText="No services found."
            allowCustom={true}
            customLabel="Add custom service"
            data-testid="services-select"
            ariaLabel="Select service providers for your experience"
          />
        </TabsContent>

        <TabsContent value="amenities" className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Facilities & Amenities</h3>
            <p className="text-gray-600 dark:text-gray-400">
              Select the facilities and amenities available at your experience location. You can add custom amenities if needed.
            </p>
          </div>

          <GroupedMultiSelect
            options={availableAmenities}
            selected={selectedAmenities}
            onChange={handleAmenitiesChange}
            placeholder="Select amenities..."
            emptyText="No amenities found."
            allowCustom={true}
            customLabel="Add custom amenity"
            data-testid="amenities-select"
            ariaLabel="Select amenities for your experience"
          />
        </TabsContent>
      </Tabs>

      {/* Guidelines */}
      <div className="bg-amber-50 dark:bg-amber-950 p-4 rounded-lg">
        <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-2">
          Guidelines
        </h4>
        <ul className="text-sm text-amber-800 dark:text-amber-200 space-y-1">
          <li>• Services are people who provide expertise (instructors, guides, chefs)</li>
          <li>• Amenities are facilities and features available at the location</li>
          <li>• Select from our standard list or add custom items specific to your experience</li>
          <li>• Custom items will be marked for review by our team</li>
          <li>• Only select amenities that are actually available at your venue</li>
        </ul>
      </div>
    </div>
  );
}

function RolesStep({ form }: { form: any }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Team Roles & Staffing</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Define roles needed for your experience team. Select from standard roles or add custom ones.
          Specify if each role is required, headcount needed, and optional rates.
        </p>
      </div>
      
      <RolesEditor
        roles={form.watch("roles")}
        onChange={(roles) => form.setValue("roles", roles, { shouldDirty: true })}
      />

      {/* Guidelines */}
      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
          Role Guidelines
        </h4>
        <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
          <li>• Select all roles needed to run your experience safely and effectively</li>
          <li>• Mark roles as "required" if they're essential for the experience</li>
          <li>• Set headcount to specify how many people are needed for each role</li>
          <li>• Add rates if you want to track role costs (optional)</li>
          <li>• Use notes to add special requirements or instructions</li>
        </ul>
      </div>
    </div>
  );
}

// Old code removed - now using GroupedMultiSelect component with JSON data

function ItineraryStep({ form }: { form: any }) {
  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');
  const itinerary = form.watch('itinerary') || [];

  // Auto-generate days based on start and end dates
  const generateDaysFromDates = () => {
    if (!startDate || !endDate) return [];
    
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const existingDays = itinerary.length;
    
    if (totalDays === existingDays) return itinerary;
    
    const newItinerary = [];
    for (let i = 0; i < totalDays; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(startDate.getDate() + i);
      
      // Keep existing day data if it exists
      const existingDay = itinerary[i];
      newItinerary.push({
        day: i + 1,
        date: dayDate,
        title: existingDay?.title || `Day ${i + 1}`,
        timeSlots: existingDay?.timeSlots || [],
        notes: existingDay?.notes || ""
      });
    }
    
    return newItinerary;
  };

  // Update itinerary when dates change
  useEffect(() => {
    const newItinerary = generateDaysFromDates();
    if (newItinerary.length > 0) {
      form.setValue('itinerary', newItinerary, { shouldDirty: true });
    }
  }, [startDate, endDate]);

  const addTimeSlot = (dayIndex: number) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    
    if (!updatedItinerary[dayIndex].timeSlots) {
      updatedItinerary[dayIndex].timeSlots = [];
    }
    
    updatedItinerary[dayIndex].timeSlots.push({
      id: `slot-${dayIndex}-${Date.now()}`,
      startTime: "",
      endTime: "",
      activity: "",
      notes: ""
    });
    
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const removeTimeSlot = (dayIndex: number, slotId: string) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    
    updatedItinerary[dayIndex].timeSlots = updatedItinerary[dayIndex].timeSlots.filter(
      (slot: any) => slot.id !== slotId
    );
    
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const updateDay = (dayIndex: number, field: string, value: any) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    updatedItinerary[dayIndex] = { ...updatedItinerary[dayIndex], [field]: value };
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const updateTimeSlot = (dayIndex: number, slotId: string, field: string, value: any) => {
    const currentItinerary = form.getValues('itinerary') || [];
    const updatedItinerary = [...currentItinerary];
    
    updatedItinerary[dayIndex].timeSlots = updatedItinerary[dayIndex].timeSlots.map((slot: any) =>
      slot.id === slotId ? { ...slot, [field]: value } : slot
    );
    
    form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
  };

  const addDay = () => {
    const currentItinerary = form.getValues('itinerary') || [];
    const newDayNumber = currentItinerary.length + 1;
    
    // Calculate date for new day
    const baseDate = startDate || new Date();
    const newDayDate = new Date(baseDate);
    newDayDate.setDate(baseDate.getDate() + currentItinerary.length);
    
    const newDay = {
      day: newDayNumber,
      date: newDayDate,
      title: `Day ${newDayNumber}`,
      timeSlots: [],
      notes: ""
    };
    
    form.setValue('itinerary', [...currentItinerary, newDay], { shouldDirty: true });
  };

  const removeDay = () => {
    const currentItinerary = form.getValues('itinerary') || [];
    if (currentItinerary.length > 0) {
      const updatedItinerary = currentItinerary.slice(0, -1);
      form.setValue('itinerary', updatedItinerary, { shouldDirty: true });
    }
  };

  return (
    <div className="space-y-8">
      {/* Daily Schedule Section */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Daily Schedule</h3>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {itinerary.length} day{itinerary.length !== 1 ? 's' : ''} planned
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addDay()}
                data-testid="button-add-day"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Day
              </Button>
              {itinerary.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeDay()}
                  data-testid="button-remove-day"
                >
                  <Minus className="w-4 h-4 mr-1" />
                  Remove Day
                </Button>
              )}
            </div>
          </div>
        </div>

        {itinerary.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              No Plan Yet
            </h4>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Set your start and end dates first, then add days to build your schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {itinerary.map((day: any, dayIndex: number) => (
              <div key={day.day} className="border rounded-lg p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <Label htmlFor={`day-title-${dayIndex}`}>Day {day.day} Title</Label>
                    <Input
                      id={`day-title-${dayIndex}`}
                      value={day.title}
                      onChange={(e) => updateDay(dayIndex, 'title', e.target.value)}
                      placeholder={`Day ${day.day}`}
                      className="mt-1"
                      data-testid={`input-day-title-${dayIndex}`}
                    />
                  </div>
                  <div className="ml-4 text-sm text-gray-600 dark:text-gray-400">
                    {format(new Date(day.date), "MMM d, yyyy")}
                  </div>
                </div>

                {/* Time Slots */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label>Time Slots</Label>
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

                  {day.timeSlots?.length === 0 ? (
                    <div className="text-center py-4 border border-dashed border-gray-200 rounded text-gray-500">
                      No time slots added yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {day.timeSlots?.map((slot: any, slotIndex: number) => (
                        <div key={slot.id} className="grid grid-cols-12 gap-2 items-center p-3 border rounded">
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
                          <div className="col-span-4">
                            <Input
                              placeholder="Activity name"
                              value={slot.activity}
                              onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'activity', e.target.value)}
                              data-testid={`input-activity-${dayIndex}-${slotIndex}`}
                            />
                          </div>
                          <div className="col-span-3">
                            <Input
                              placeholder="Notes (optional)"
                              value={slot.notes}
                              onChange={(e) => updateTimeSlot(dayIndex, slot.id, 'notes', e.target.value)}
                              data-testid={`input-notes-${dayIndex}-${slotIndex}`}
                            />
                          </div>
                          <div className="col-span-1">
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

                {/* Day Notes */}
                <div>
                  <Label htmlFor={`day-notes-${dayIndex}`}>Day Notes</Label>
                  <Textarea
                    id={`day-notes-${dayIndex}`}
                    placeholder="Special instructions, requirements, or notes for this day..."
                    value={day.notes}
                    onChange={(e) => updateDay(dayIndex, 'notes', e.target.value)}
                    className="mt-1"
                    data-testid={`textarea-day-notes-${dayIndex}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoomsStep({ form }: { form: any }) {
  const rooms = form.watch('rooms') || [];
  const currency = form.watch('currency');

  // Auto-calculate maxParticipants from sum of (room quantity × capacity)
  // Note: Removed `form` from dependency array to prevent infinite re-render loop
  useEffect(() => {
    if (rooms.length > 0) {
      const totalCapacity = rooms.reduce((total: number, room: any) => {
        const quantity = parseInt(room.quantity) || 0;
        const capacity = parseInt(room.capacity) || 1;
        return total + (quantity * capacity);
      }, 0);
      
      // Only update if capacity has changed to avoid unnecessary form updates
      const currentMaxParticipants = form.getValues('maxParticipants');
      if (totalCapacity > 0 && totalCapacity !== currentMaxParticipants) {
        form.setValue('maxParticipants', totalCapacity, { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  const addRoom = () => {
    const currentRooms = form.getValues('rooms') || [];
    const newRoom = {
      id: `room-${Date.now()}`,
      name: '',
      quantity: 1,
      capacity: 2,
      gallery: [],
      notes: ''
    };
    form.setValue('rooms', [...currentRooms, newRoom], { shouldDirty: true });
  };

  const removeRoom = (roomId: string) => {
    const currentRooms = form.getValues('rooms') || [];
    const updatedRooms = currentRooms.filter((room: any) => room.id !== roomId);
    form.setValue('rooms', updatedRooms, { shouldDirty: true });
  };

  const updateRoom = (roomId: string, field: string, value: any) => {
    const currentRooms = form.getValues('rooms') || [];
    const updatedRooms = currentRooms.map((room: any) => 
      room.id === roomId ? { ...room, [field]: value } : room
    );
    form.setValue('rooms', updatedRooms, { shouldDirty: true });
  };

  const getTotalUnits = () => {
    return rooms.reduce((total: number, room: any) => {
      const quantity = parseInt(room.quantity) || 0;
      const capacity = parseInt(room.capacity) || 1;
      return total + (quantity * capacity);
    }, 0);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Room Inventory</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Define the room types and their capacity for your experience. Each room type will automatically create a Ticket SKU in the Pricing step where you can set the price per person.
        </p>
      </div>

      {/* Add Room Button */}
      <div className="flex justify-between items-center">
        <h4 className="font-medium">Room SKUs</h4>
        <Button
          type="button"
          variant="outline"
          onClick={addRoom}
          data-testid="button-add-room-sku"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Room SKU
        </Button>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
          <Bed className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 dark:text-gray-400">
            No room inventory defined yet. Add sellable room units to enable bookings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rooms.map((room: any, roomIndex: number) => (
            <div key={room.id} className="border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <h5 className="font-medium">Room SKU {roomIndex + 1}</h5>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeRoom(room.id)}
                  data-testid={`button-remove-room-${roomIndex}`}
                >
                  ×
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                {/* Room Name */}
                <div>
                  <Label htmlFor={`room-name-${room.id}`}>Room Name *</Label>
                  <Input
                    id={`room-name-${room.id}`}
                    placeholder="e.g., Shared Dorm"
                    value={room.name || ''}
                    onChange={(e) => updateRoom(room.id, 'name', e.target.value)}
                    data-testid={`input-room-name-${roomIndex}`}
                  />
                </div>

                {/* Capacity per Room */}
                <div>
                  <Label htmlFor={`room-capacity-${room.id}`}>People/Room *</Label>
                  <Input
                    id={`room-capacity-${room.id}`}
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Beds per room"
                    value={room.capacity || 2}
                    onChange={(e) => updateRoom(room.id, 'capacity', parseInt(e.target.value) || 1)}
                    data-testid={`input-room-capacity-${roomIndex}`}
                  />
                </div>

                {/* Quantity */}
                <div>
                  <Label htmlFor={`room-quantity-${room.id}`}>Rooms *</Label>
                  <Input
                    id={`room-quantity-${room.id}`}
                    type="number"
                    min="1"
                    max="100"
                    placeholder="# of rooms"
                    value={room.quantity || ''}
                    onChange={(e) => updateRoom(room.id, 'quantity', parseInt(e.target.value) || 1)}
                    data-testid={`input-room-quantity-${roomIndex}`}
                  />
                </div>

                {/* Total Spots (calculated) */}
                <div>
                  <Label>Total Spots</Label>
                  <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-md border text-sm font-medium">
                    {((parseInt(room.capacity) || 1) * (parseInt(room.quantity) || 0))} people
                  </div>
                </div>
              </div>

              {/* Room Photo and Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Room Photos */}
                <div>
                  <Label>Room Photos (Optional - up to 3)</Label>
                  <div className="space-y-4">
                    {/* Current room photos */}
                    {room.gallery && room.gallery.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {room.gallery.map((imageUrl: string, index: number) => (
                          <PhotoPreview
                            key={index}
                            src={imageUrl}
                            alt={`Room ${index + 1}`}
                            onRemove={() => {
                              const newGallery = room.gallery.filter((_: string, i: number) => i !== index);
                              updateRoom(room.id, 'gallery', newGallery);
                            }}
                            className="h-24"
                            size="sm"
                          />
                        ))}
                      </div>
                    )}
                    
                    {/* Success message for room uploads */}
                    {room.gallery && room.gallery.length > 0 && (
                      <p className="text-xs text-green-600 dark:text-green-400" data-testid={`text-room-gallery-success-${roomIndex}`}>
                        ✓ {room.gallery.length} photo{room.gallery.length !== 1 ? 's' : ''} uploaded successfully
                      </p>
                    )}
                    
                    {/* Upload button - only show if less than 3 photos */}
                    {(!room.gallery || room.gallery.length < 3) && (
                      <SharedPhotoUpload
                        uploadType="s3"
                        maxFiles={3 - (room.gallery?.length || 0)}
                        multiple={false}
                        onUploadComplete={(url) => {
                          const currentGallery = room.gallery || [];
                          const updatedGallery = [...currentGallery, url];
                          updateRoom(room.id, 'gallery', updatedGallery);
                        }}
                        getUploadParameters={async () => {
                          const response = await apiRequest('POST', '/api/objects/upload');
                          if (!response.ok) throw new Error('Failed to get upload URL');
                          const { uploadURL } = await response.json();
                          return { method: 'PUT' as const, url: uploadURL };
                        }}
                        isDemoEvent={form.getValues().title?.toLowerCase().includes('mystic') && form.getValues().title?.toLowerCase().includes('marrakesh') || false}
                        variant="compact"
                        className="w-full"
                      />
                    )}
                  </div>
                </div>

                {/* Room Notes */}
                <div>
                  <Label htmlFor={`room-notes-${room.id}`}>Notes (Optional)</Label>
                  <Input
                    id={`room-notes-${room.id}`}
                    placeholder="Special details about this room type..."
                    value={room.notes || ''}
                    onChange={(e) => updateRoom(room.id, 'notes', e.target.value)}
                    data-testid={`input-room-notes-${roomIndex}`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inventory Summary */}
      {rooms.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Room Capacity Summary
          </h4>
          <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <p>Total room types: {rooms.length}</p>
            <p>Total rooms: {rooms.reduce((t: number, r: any) => t + (parseInt(r.quantity) || 0), 0)}</p>
            <p className="font-semibold">Total capacity: {getTotalUnits()} people</p>
            <p className="text-xs mt-2 opacity-75">Capacity = (People/Room × Number of Rooms) for each type. Pricing is set at the experience level.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PricingStep({ form }: { form: any }) {
  // Watch form values for reactivity
  const currency = form.watch('currency');
  const rooms = form.watch('rooms') || [];
  const pricePerPerson = form.watch('pricePerPerson') || 0;
  const maxParticipants = form.watch('maxParticipants') || 0;
  const eventType = form.watch('type'); // Track event type for dynamic UI
  const venueType = form.watch('venueType') || "catalog";
  const selectedVenueId = form.watch('selectedVenueId') || "";
  const monetisationMode = form.watch('monetisationMode');
  const creatorPct = form.watch('creatorPct') || 85;
  const platformPct = FIXED_PLATFORM_FEE_PCT;
  const venueCompensationModel = form.watch('venueCompensationModel') || "access_only";
  const venueFixedFee = form.watch('venueFixedFee') || 0;
  const venuePerHeadAmount = form.watch('venuePerHeadAmount') || 0;
  const venueMinimumSpend = form.watch('venueMinimumSpend') || 0;
  const venueRevenueSharePct = form.watch('venueRevenueSharePct') || 0;
  const venueAccessFee = form.watch('venueAccessFee') || 0;
  const requireMinimumParticipants = form.watch('requireMinimumParticipants');
  const minimumParticipants = form.watch('minimumParticipants') || 6;
  const softHoldEnabled = form.watch('softHoldEnabled');
  const softHoldDurationHours = form.watch('softHoldDurationHours') || 48;
  const influencerPromotionEnabled = form.watch('influencerPromotionEnabled');
  const influencerCommissionPct = form.watch('influencerCommissionPct') || 0;
  const discounts = form.watch('discounts') || [];
  const ticketSkus = form.watch('ticketSkus') || [];
  const [selectedMarketplaceVenue, setSelectedMarketplaceVenue] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchSelectedVenue = async () => {
      if (venueType !== "catalog" || !selectedVenueId) {
        setSelectedMarketplaceVenue(null);
        return;
      }

      try {
        const [catalogResponse, userVenuesResponse] = await Promise.all([
          apiRequest("GET", "/api/venues?approved=true"),
          apiRequest("GET", "/api/user/venues").catch(() => null),
        ]);
        const catalogVenues = await catalogResponse.json();
        let userVenues: any[] = [];
        if (userVenuesResponse && userVenuesResponse.ok) {
          userVenues = await userVenuesResponse.json();
        }
        const selected = [...(Array.isArray(userVenues) ? userVenues : []), ...(Array.isArray(catalogVenues) ? catalogVenues : [])]
          .find((venue: any) => venue.id === selectedVenueId);
        if (!cancelled) setSelectedMarketplaceVenue(selected || null);
      } catch {
        if (!cancelled) setSelectedMarketplaceVenue(null);
      }
    };

    fetchSelectedVenue();
    return () => {
      cancelled = true;
    };
  }, [venueType, selectedVenueId]);

  // The platform infrastructure fee is fixed and non-negotiable.
  useEffect(() => {
    form.setValue('platformPct', FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
    form.setValue('platformRevenuePercentage', FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
    form.setValue('creatorPct', 100 - FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
    form.setValue('creatorRevenuePercentage', 100 - FIXED_PLATFORM_FEE_PCT, { shouldDirty: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (form.getValues('monetisationMode') !== 'creator_led') {
      form.setValue('monetisationMode', 'creator_led', { shouldDirty: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-day and virtual events don't have rooms - use Number of Spots instead
  const isNonRoomEvent = eventType === 'one-day' || eventType === 'virtual';
  const isMultiDayEvent = eventType === 'multi-day';
  // venueDealContext drives which UI branch the Pricing step renders:
  //   "open"              — creator is seeking venue bids; sets a target deal preference only
  //   "external"          — non-catalog venue (manual/outdoor/virtual); creator manages venue payment themselves
  //   "marketplace_day"   — catalog daytime space or one-day event; limited short-stay deal models
  //   "marketplace_retreat" — catalog multi-day retreat; full revenue-share models
  const venueDealContext =
    venueType === "open"
      ? "open"
      : venueType !== "catalog"
        ? "external"
        : selectedMarketplaceVenue?.venueType === "daytime" || eventType === "one-day"
          ? "marketplace_day"
          : "marketplace_retreat";

  // All available target deal options (for "open" mode where creator sets a preference)
  const openTargetDealOptions = [
    { value: "access_only", label: "Access-Only / Pay-at-Counter" },
    { value: "fixed_fee", label: "Flat Fee" },
    { value: "per_head", label: "Per Head" },
    { value: "minimum_spend", label: "Minimum Spend Guarantee" },
    { value: "revenue_share", label: "Percentage Revenue Share" },
  ];

  const venueDealOptions = useMemo(() => {
    if (venueDealContext === "marketplace_retreat") {
      return [
        { value: "revenue_share", label: "Percentage Revenue Share" },
        { value: "per_head", label: "Per-Head Package" },
        { value: "fixed_fee", label: "Flat Rental Fee / Day Rate" },
      ];
    }
    if (venueDealContext === "marketplace_day") {
      return [
        { value: "fixed_fee", label: "Flat Fee Offer" },
        { value: "per_head", label: "Per Head" },
        { value: "minimum_spend", label: "Minimum Spend Guarantee" },
        { value: "access_only", label: "Access-Only / Pay-at-Counter" },
      ];
    }
    return [];
  }, [venueDealContext]);

  useEffect(() => {
    if (venueDealContext === "external" || venueDealContext === "open") {
      // Zero out venue deal amounts for external and open modes.
      // External: creator handles venue payment independently, no platform split needed.
      // Open: no specific venue is chosen yet — amounts are determined when a venue accepts the bid.
      form.setValue('venueCompensationModel', 'access_only', { shouldDirty: false });
      form.setValue('venueFixedFee', 0, { shouldDirty: false });
      form.setValue('venuePerHeadAmount', 0, { shouldDirty: false });
      form.setValue('venueMinimumSpend', 0, { shouldDirty: false });
      form.setValue('venueRevenueSharePct', 0, { shouldDirty: false });
      form.setValue('venueAccessFee', 0, { shouldDirty: false });
      return;
    }

    if (!venueDealOptions.some((option) => option.value === venueCompensationModel)) {
      form.setValue('venueCompensationModel', venueDealOptions[0]?.value || 'access_only', { shouldDirty: true });
    }
  }, [form, venueDealContext, venueDealOptions, venueCompensationModel]);

  // **1. CURRENCY CONSOLIDATION** - Unified currency that propagates to all pricing
  const handleCurrencyChange = (newCurrency: string) => {
    form.setValue('currency', newCurrency, { shouldDirty: true });
  };

  // Calculate total capacity from rooms
  const totalCapacity = rooms.reduce((total: number, room: any) => {
    const quantity = parseInt(room.quantity) || 0;
    const capacity = parseInt(room.capacity) || 1;
    return total + (quantity * capacity);
  }, 0);

  // Use experience-level pricePerPerson for all calculations
  const hasRooms = rooms.length > 0;

  // Build priceSource object for legacy compatibility
  const priceSource = {
    source: hasRooms ? 'rooms' as const : 'base' as const,
    totalPrice: pricePerPerson,
    hasRooms: hasRooms
  };

  // Build SKUs from rooms using the experience-level pricePerPerson (legacy, used for discounts)
  const skus: Array<{ id: string; name: string; capacity: number; pricePerPerson: number; quantity: number; description?: string; photos: string[] }> = rooms.map((room: any) => ({
    id: room.id,
    name: room.name,
    capacity: (parseInt(room.capacity) || 1) * (parseInt(room.quantity) || 1),
    pricePerPerson: pricePerPerson,
    quantity: room.quantity || 1,
    description: room.notes,
    photos: room.gallery || []
  }));

  // Track previous state to detect changes for auto-generation
  const prevRoomsRef = useRef<string>('');
  const prevMaxParticipantsRef = useRef<number>(0);
  const prevEventTypeRef = useRef<string>('');

  // Auto-generate ticketSkus when rooms or maxParticipants change
  useEffect(() => {
    const roomsKey = JSON.stringify(rooms.map((r: any) => ({ id: r.id, name: r.name, quantity: r.quantity, capacity: r.capacity })));
    const maxPartChanged = maxParticipants !== prevMaxParticipantsRef.current;
    const roomsChanged = roomsKey !== prevRoomsRef.current;
    const eventTypeChanged = eventType !== prevEventTypeRef.current;

    // Only regenerate if something changed
    if (!roomsChanged && !maxPartChanged && !eventTypeChanged) return;
    
    prevRoomsRef.current = roomsKey;
    prevMaxParticipantsRef.current = maxParticipants;
    prevEventTypeRef.current = eventType || '';

    // For events with rooms (multi-day or unspecified type), generate SKUs from rooms
    // If rooms exist, generate ticketSkus regardless of whether eventType is explicitly set
    if (hasRooms) {
      const existingSkus = ticketSkus || [];
      const newSkus = rooms.map((room: any) => {
        const roomCapacity = (parseInt(room.quantity) || 1) * (parseInt(room.capacity) || 1);
        // Try to preserve existing pricing for this room
        const existingSku = existingSkus.find((s: any) => s.sourceRoomId === room.id);
        return {
          id: existingSku?.id || `sku-${room.id}-${Date.now()}`,
          ticketName: `${room.name} – Per Person`,
          pricePerPerson: existingSku?.pricePerPerson ?? 0,
          depositPerPerson: existingSku?.depositPerPerson ?? 0,
          ticketCapacity: roomCapacity,
          sourceRoomId: room.id,
          soldCount: existingSku?.soldCount ?? 0
        };
      });
      form.setValue('ticketSkus', newSkus, { shouldDirty: true });
    }
    // For one-day/virtual events without rooms, create the first ticket once and then preserve creator-added tickets.
    else if (isNonRoomEvent && maxParticipants > 0) {
      const existingSkus = ticketSkus || [];
      if (existingSkus.length === 0) {
        form.setValue('ticketSkus', [{
          id: `sku-ga-${Date.now()}`,
          ticketName: 'General Admission',
          pricePerPerson: pricePerPerson || 0,
          depositPerPerson: 0,
          ticketCapacity: maxParticipants,
          sourceRoomId: undefined,
          soldCount: 0
        }], { shouldDirty: true });
      } else if (eventTypeChanged && existingSkus.length === 1 && existingSkus[0].ticketName === 'General Admission') {
        form.setValue('ticketSkus', [{
          ...existingSkus[0],
          ticketCapacity: existingSkus[0].ticketCapacity || maxParticipants,
        }], { shouldDirty: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, maxParticipants, eventType, isMultiDayEvent, isNonRoomEvent, hasRooms]);

  // Sync pricePerPerson to legacy price field for backend compatibility
  // Set legacy pricePerPerson to the lowest ticket price
  useEffect(() => {
    if (ticketSkus && ticketSkus.length > 0) {
      const prices = ticketSkus.map((s: any) => Number(s.pricePerPerson || 0)).filter((p: number) => Number.isFinite(p));
      if (prices.length > 0) {
        const lowestPrice = Math.min(...prices);
        form.setValue('pricePerPerson', lowestPrice, { shouldDirty: true });
        form.setValue('price', lowestPrice, { shouldDirty: true });
      }
    } else if (pricePerPerson > 0) {
      form.setValue('price', pricePerPerson, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketSkus]);

  // Update a specific ticket SKU field
  const updateTicketSku = (skuId: string, field: string, value: string | number) => {
    const updated = ticketSkus.map((sku: any) => 
      sku.id === skuId ? { ...sku, [field]: value } : sku
    );
    form.setValue('ticketSkus', updated, { shouldDirty: true });
  };

  const addTicketSku = () => {
    const nextIndex = ticketSkus.length + 1;
    form.setValue('ticketSkus', [
      ...ticketSkus,
      {
        id: `sku-custom-${Date.now()}`,
        ticketName: `Ticket ${nextIndex}`,
        pricePerPerson: 0,
        depositPerPerson: 0,
        ticketCapacity: 1,
        sourceRoomId: undefined,
        soldCount: 0,
      },
    ], { shouldDirty: true });
  };

  const removeTicketSku = (skuId: string) => {
    const updated = ticketSkus.filter((sku: any) => sku.id !== skuId);
    form.setValue('ticketSkus', updated, { shouldDirty: true });
  };

  // Calculate totals from ticket SKUs
  const ticketTotalCapacity = ticketSkus.reduce((total: number, sku: any) => total + (sku.ticketCapacity || 0), 0);
  const ticketTotalRevenue = ticketSkus.reduce((total: number, sku: any) => 
    safeAdd(total, safeMultiply(sku.pricePerPerson || 0, sku.ticketCapacity || 0)), 0);

  useEffect(() => {
    if (isNonRoomEvent && ticketTotalCapacity > 0 && ticketTotalCapacity !== maxParticipants) {
      form.setValue('maxParticipants', ticketTotalCapacity, { shouldDirty: true });
    }
  }, [form, isNonRoomEvent, ticketTotalCapacity, maxParticipants]);

  useEffect(() => {
    form.setValue(
      'venueRevenuePercentage',
      venueCompensationModel === "revenue_share" ? venueRevenueSharePct : 0,
      { shouldDirty: false }
    );
  }, [form, venueCompensationModel, venueRevenueSharePct]);

  // Compute example payout using ticket SKU totals
  const effectiveCapacity = ticketTotalCapacity > 0 ? ticketTotalCapacity : (hasRooms ? totalCapacity : maxParticipants);
  const totalRevenue = ticketTotalRevenue > 0 ? ticketTotalRevenue : safeMultiply(pricePerPerson, effectiveCapacity);
  const revenueSplit = computeRevenueSplit(totalRevenue, creatorPct, platformPct);
  const venueRevenueShareAmount = safeMultiply(totalRevenue, venueRevenueSharePct / 100);
  const venuePerHeadEstimate = safeMultiply(venuePerHeadAmount, effectiveCapacity);
  const venueCommercialEstimate = (() => {
    if (venueDealContext === "external") return 0;
    switch (venueCompensationModel) {
      case "fixed_fee":
        return venueFixedFee;
      case "per_head":
        return venuePerHeadEstimate;
      case "minimum_spend":
        return venueMinimumSpend;
      case "revenue_share":
        return venueRevenueShareAmount;
      case "access_only":
      default:
        return venueAccessFee;
    }
  })();

  // **4. MVG PROGRESS** - Using pricing service computation
  const mvgProgress = computeMVGProgress(0, minimumParticipants); // 0 current bookings in draft mode

  // **5. DISCOUNT MANAGEMENT** 
  const addDiscount = () => {
    const newDiscount = {
      id: `discount-${Date.now()}`,
      title: '',
      type: 'percentage' as const,
      value: 0,
      validUntil: undefined,
      capacityCap: undefined,
      active: true,
      skuId: ticketSkus.length > 0 ? ticketSkus[0].id : undefined
    };
    form.setValue('discounts', [...discounts, newDiscount], { shouldDirty: true });
  };

  const removeDiscount = (discountId: string) => {
    const updatedDiscounts = discounts.filter((d: any) => d.id !== discountId);
    form.setValue('discounts', updatedDiscounts, { shouldDirty: true });
  };

  const updateDiscount = (discountId: string, field: string, value: any) => {
    const updatedDiscounts = discounts.map((d: any) => 
      d.id === discountId ? { ...d, [field]: value } : d
    );
    form.setValue('discounts', updatedDiscounts, { shouldDirty: true });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Pricing & Monetisation</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Configure pricing, marketplace economics, and payment triggers.
        </p>
      </div>

      {/* **1. CURRENCY CONSOLIDATION** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Currency Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="currency">Currency *</Label>
              <Select 
                value={currency || ''} 
                onValueChange={handleCurrencyChange}
              >
                <SelectTrigger data-testid="select-currency">
                  <SelectValue placeholder="Select currency for all pricing" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCY_CONFIG).map(([code, config]) => (
                    <SelectItem key={code} value={code}>
                      {config.symbol} {code.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                This currency will be used for all pricing, rooms, and payouts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* **2. TICKET SKU EDITOR** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Ticket Pricing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* For one-day/virtual events: Show Number of Spots input first */}
            {isNonRoomEvent && (
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg mb-4">
                <h4 className="font-medium mb-3">Number of Spots</h4>
                <div>
                  <Label htmlFor="maxParticipants">Available Spots *</Label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    min="1"
                    max="1000"
                    value={maxParticipants || ''}
                    onChange={(e) => {
                      const newVal = parseInt(e.target.value) || 0;
                      form.setValue('maxParticipants', newVal, { shouldDirty: true });
                      // Sync to the single ticket SKU so the reverse-sync effect doesn't override it
                      const currentSkus = form.getValues('ticketSkus') || [];
                      if (currentSkus.length === 1) {
                        form.setValue('ticketSkus', [{ ...currentSkus[0], ticketCapacity: newVal }], { shouldDirty: true });
                      }
                    }}
                    placeholder="e.g., 20"
                    data-testid="input-number-of-spots"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Total number of people who can join this {eventType === 'virtual' ? 'virtual session' : 'one-day event'}.
                  </p>
                </div>
              </div>
            )}

            {/* Ticket SKUs Table/Cards */}
            {ticketSkus.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Ticket Types</h4>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" data-testid="badge-ticket-count">
                      {ticketSkus.length} ticket type{ticketSkus.length > 1 ? 's' : ''}
                    </Badge>
                    {isNonRoomEvent && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addTicketSku}
                        data-testid="button-add-ticket-sku"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Add Ticket
                      </Button>
                    )}
                  </div>
                </div>
                
                {!currency && (
                  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Please select a currency above before setting prices.
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  {ticketSkus.map((sku: any, index: number) => {
                    const skuRevenue = safeMultiply(sku.pricePerPerson || 0, sku.ticketCapacity || 0);
                    return (
                      <div 
                        key={sku.id} 
                        className="bg-white dark:bg-gray-800 border rounded-lg p-4 space-y-3"
                        data-testid={`ticket-sku-card-${index}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 pr-3">
                            <Label htmlFor={`sku-name-${sku.id}`}>Ticket Name *</Label>
                            <Input
                              id={`sku-name-${sku.id}`}
                              value={sku.ticketName || ''}
                              onChange={(e) => updateTicketSku(sku.id, 'ticketName', e.target.value)}
                              placeholder="e.g., Run + Coffee Add-on"
                              data-testid={`input-ticket-name-${index}`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" data-testid={`ticket-sku-capacity-${index}`}>
                              {sku.ticketCapacity} spots
                            </Badge>
                            {isNonRoomEvent && ticketSkus.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTicketSku(sku.id)}
                                data-testid={`button-remove-ticket-${index}`}
                                aria-label="Remove ticket"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {(isNonRoomEvent || !sku.sourceRoomId) && (
                            <div>
                              <Label htmlFor={`sku-capacity-${sku.id}`}>Ticket Capacity *</Label>
                              <Input
                                id={`sku-capacity-${sku.id}`}
                                type="number"
                                min="1"
                                value={sku.ticketCapacity || ''}
                                onChange={(e) => updateTicketSku(sku.id, 'ticketCapacity', parseInt(e.target.value) || 1)}
                                data-testid={`input-ticket-capacity-${index}`}
                              />
                            </div>
                          )}
                          <div>
                            <Label htmlFor={`sku-price-${sku.id}`}>Price Per Person *</Label>
                            <div className="flex gap-2">
                              <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md text-sm">
                                {currency ? CURRENCY_CONFIG[currency as keyof typeof CURRENCY_CONFIG]?.symbol : '$'}
                              </span>
                              <Input
                                id={`sku-price-${sku.id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={sku.pricePerPerson || ''}
                                onChange={(e) => updateTicketSku(sku.id, 'pricePerPerson', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                disabled={!currency}
                                data-testid={`input-ticket-price-${index}`}
                                className="flex-1"
                              />
                            </div>
                          </div>
                          
                          {requireMinimumParticipants && (
                          <div>
                            <Label htmlFor={`sku-deposit-${sku.id}`}>Deposit Per Person</Label>
                            <div className="flex gap-2">
                              <span className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border rounded-md text-sm">
                                {currency ? CURRENCY_CONFIG[currency as keyof typeof CURRENCY_CONFIG]?.symbol : '$'}
                              </span>
                              <Input
                                id={`sku-deposit-${sku.id}`}
                                type="number"
                                min="0"
                                step="0.01"
                                value={sku.depositPerPerson || ''}
                                onChange={(e) => updateTicketSku(sku.id, 'depositPerPerson', parseFloat(e.target.value) || 0)}
                                placeholder="0.00"
                                disabled={!currency}
                                data-testid={`input-ticket-deposit-${index}`}
                                className="flex-1"
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Fixed dollar amount (not %)</p>
                          </div>
                          )}
                        </div>
                        
                        <div className="flex justify-between items-center pt-2 border-t text-sm">
                          <span className="text-gray-600 dark:text-gray-400">Subtotal Revenue</span>
                          <span className="font-semibold text-green-700 dark:text-green-400" data-testid={`ticket-sku-revenue-${index}`}>
                            {formatPriceByCurrency(skuRevenue, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total Revenue Summary */}
                <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Capacity</span>
                      <span className="font-medium" data-testid="text-total-capacity">{ticketTotalCapacity} people</span>
                    </div>
                    <div className="flex justify-between font-semibold text-green-700 dark:text-green-400">
                      <span>Total Revenue Potential</span>
                      <span data-testid="text-total-revenue">{formatPriceByCurrency(ticketTotalRevenue, currency)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                {isMultiDayEvent && !hasRooms ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    💡 Define rooms in the Rooms step to automatically generate ticket types, or set max participants in the Dates step.
                  </p>
                ) : isNonRoomEvent && maxParticipants === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    💡 Enter the number of available spots above to generate a General Admission ticket.
                  </p>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    💡 No ticket types available. Please configure your event details first.
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* **3. MARKETPLACE ECONOMICS — The Digital Handshake** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Commercial Model
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Platform fee, venue commercial terms, and creator earnings are estimated from your ticket setup.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Split grid: Platform (fixed) | Space | Creator */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="platform-pct-display">Platform Fee (%)</Label>
                <Input
                  id="platform-pct-display"
                  type="number"
                  value={platformPct}
                  readOnly
                  disabled
                  className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  data-testid="input-platform-pct"
                />
                <p className="text-xs text-gray-500 mt-1">Fixed — set by platform</p>
              </div>
              {venueDealContext === "external" ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100">
                  External Venue Selected. You manage venue payments independently.
                </div>
              ) : venueDealContext === "open" ? (
                <div>
                  <Label htmlFor="venue-target-deal">Target Deal (What you're looking for)</Label>
                  <Select
                    value={form.watch('venueTargetDeal') || ""}
                    onValueChange={(value) => form.setValue('venueTargetDeal', value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="venue-target-deal" data-testid="select-venue-target-deal">
                      <SelectValue placeholder="Select preferred deal type" />
                    </SelectTrigger>
                    <SelectContent>
                      {openTargetDealOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-amber-600 mt-1">
                    Venues will see this preference when they bid to host your event.
                  </p>
                </div>
              ) : (
                <div>
                  <Label htmlFor="venue-compensation-model">Venue Commercial Deal</Label>
                  <Select
                    value={venueCompensationModel}
                    onValueChange={(value) => form.setValue('venueCompensationModel', value, { shouldDirty: true })}
                  >
                    <SelectTrigger id="venue-compensation-model" data-testid="select-venue-compensation-model">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {venueDealOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">Propose a Commercial Deal to your Venue Partner.</p>
                </div>
              )}
              <div>
                <Label htmlFor="creator-pct">Creator Net Before Venue Terms (%)</Label>
                <Input
                  id="creator-pct"
                  type="number"
                  min="0"
                  max={100 - FIXED_PLATFORM_FEE_PCT}
                  value={creatorPct}
                  readOnly
                  disabled
                  className="bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                  data-testid="input-creator-pct"
                />
                {influencerPromotionEnabled && influencerCommissionPct > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Promoter bounty ({influencerCommissionPct}%) deducted from your share
                  </p>
                )}
              </div>
            </div>

            {venueDealContext !== "external" && venueDealContext !== "open" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {venueCompensationModel === "fixed_fee" && (
                <div>
                  <Label htmlFor="venue-fixed-fee">Fixed Fee</Label>
                  <Input
                    id="venue-fixed-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={venueFixedFee || ''}
                    onChange={(e) => form.setValue('venueFixedFee', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    data-testid="input-venue-fixed-fee"
                  />
                </div>
              )}
              {venueCompensationModel === "per_head" && (
                <div>
                  <Label htmlFor="venue-per-head">Per-Head Amount</Label>
                  <Input
                    id="venue-per-head"
                    type="number"
                    min="0"
                    step="0.01"
                    value={venuePerHeadAmount || ''}
                    onChange={(e) => form.setValue('venuePerHeadAmount', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    data-testid="input-venue-per-head"
                  />
                </div>
              )}
              {venueCompensationModel === "minimum_spend" && (
                <div>
                  <Label htmlFor="venue-minimum-spend">Minimum Spend</Label>
                  <Input
                    id="venue-minimum-spend"
                    type="number"
                    min="0"
                    step="0.01"
                    value={venueMinimumSpend || ''}
                    onChange={(e) => form.setValue('venueMinimumSpend', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    data-testid="input-venue-minimum-spend"
                  />
                </div>
              )}
              {venueCompensationModel === "revenue_share" && (
                <div>
                  <Label htmlFor="venue-revenue-share">Venue Revenue Share (%)</Label>
                  <Input
                    id="venue-revenue-share"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={venueRevenueSharePct || ''}
                    onChange={(e) => form.setValue('venueRevenueSharePct', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    data-testid="input-venue-revenue-share-pct"
                  />
                </div>
              )}
              {venueCompensationModel === "access_only" && (
                <div>
                  <Label htmlFor="venue-access-fee">Optional Access Fee</Label>
                  <Input
                    id="venue-access-fee"
                    type="number"
                    min="0"
                    step="0.01"
                    value={venueAccessFee || ''}
                    onChange={(e) => form.setValue('venueAccessFee', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                    data-testid="input-venue-access-fee"
                  />
                  <p className="text-xs text-gray-500 mt-1">Venue keeps its own food and beverage sales.</p>
                </div>
              )}
            </div>
            )}

            {venueDealContext === "open" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-100">
                <strong>Venue Pending:</strong> Your event will publish to the platform. Venues matching your city and space type will be able to discover and bid to host it. Once a venue accepts, their deal terms are locked into the payment flow.
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {venueDealContext === "external"
                ? "Only the fixed 15% platform infrastructure fee is applied in Great."
                : venueDealContext === "open"
                  ? "Actual venue payout will be determined when a venue accepts your offer."
                  : "Venue compensation is negotiated separately from the 15% platform infrastructure fee."}
            </p>

            {/* Estimated grand total calculation */}
            <div className="bg-green-50 dark:bg-green-950 p-4 rounded-lg">
              <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">Estimated Grand Total Calculator</h4>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Gross Ticket Price</span>
                  <span className="font-medium" data-testid="text-gross-revenue">{formatPriceByCurrency(totalRevenue, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform Fee ({platformPct}%)</span>
                  <span className="text-red-600" data-testid="text-platform-fee">-{formatPriceByCurrency(revenueSplit.platformAmount, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Venue Payout (Based on Deal)</span>
                  <span className="text-blue-600" data-testid="text-venue-share">-{formatPriceByCurrency(venueCommercialEstimate, currency)}</span>
                </div>
                {influencerPromotionEnabled && influencerCommissionPct > 0 && (
                  <div className="flex justify-between">
                    <span>Promoter Bounty ({influencerCommissionPct}%) — from your share</span>
                    <span className="text-amber-600">-{formatPriceByCurrency(totalRevenue * influencerCommissionPct / 100, currency)}</span>
                  </div>
                )}
                <div className="border-t pt-1 flex justify-between font-semibold text-green-700 dark:text-green-300">
                  <span>Estimated Net</span>
                  <span data-testid="text-your-payout">
                    {formatPriceByCurrency(
                      Math.max(0, revenueSplit.creatorAmount - venueCommercialEstimate - (influencerPromotionEnabled ? totalRevenue * influencerCommissionPct / 100 : 0)),
                      currency
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* **4. MVG + SOFT-HOLD** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Minimum Viable Group & Reservations
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Day events and trips can require a minimum number of bookings before the experience proceeds.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="mvg-enabled">Require Minimum Participants</Label>
                  <p className="text-xs text-gray-500">
                    {isEventType(eventType)
                      ? "Event only proceeds if enough people book for food and space prep"
                      : "Experience only proceeds if minimum bookings are met"}
                  </p>
                </div>
                <Switch
                  id="mvg-enabled"
                  checked={requireMinimumParticipants}
                  onCheckedChange={(checked) => form.setValue('requireMinimumParticipants', checked, { shouldDirty: true })}
                  data-testid="switch-mvg-enabled"
                />
              </div>
              
              {requireMinimumParticipants && (
                <div className="space-y-4 ml-4 border-l-2 border-gray-200 pl-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="minimum-participants">Minimum Participants</Label>
                      <Input
                        id="minimum-participants"
                        type="number"
                        min="2"
                        max="50"
                        value={minimumParticipants}
                        onChange={(e) => form.setValue('minimumParticipants', parseInt(e.target.value) || 6, { shouldDirty: true })}
                        data-testid="input-minimum-participants"
                      />
                    </div>
                    <div>
                      <Label htmlFor="mvg-deadline-days">Deadline (Days Before Start)</Label>
                      <Input
                        id="mvg-deadline-days"
                        type="number"
                        min="1"
                        max="30"
                        placeholder="7"
                        onChange={(e) => {
                          const days = parseInt(e.target.value) || 7;
                          const startDate = form.getValues('startDate');
                          if (startDate) {
                            const deadlineDate = new Date(startDate);
                            deadlineDate.setDate(deadlineDate.getDate() - days);
                            form.setValue('mvgDeadline', deadlineDate, { shouldDirty: true });
                          }
                        }}
                        data-testid="input-mvg-deadline-days"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Days before start date when MVG status is final
                      </p>
                    </div>
                  </div>
                  
                  {/* MVG Progress Bar */}
                  <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Current Progress</span>
                      <span>{mvgProgress.current} / {mvgProgress.minimum}</span>
                    </div>
                    <Progress value={mvgProgress.percentage} className="w-full" data-testid="progress-mvg" />
                    <p className="text-xs text-gray-600 mt-1">
                      {mvgProgress.isMet ? '✅ Minimum reached!' : `${mvgProgress.minimum - mvgProgress.current} more bookings needed`}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Soft-Hold Settings */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="soft-hold-enabled">Soft-Hold Reservations</Label>
                  <p className="text-xs text-gray-500">Allow temporary reservations before payment</p>
                </div>
                <Switch
                  id="soft-hold-enabled"
                  checked={softHoldEnabled}
                  onCheckedChange={(checked) => form.setValue('softHoldEnabled', checked, { shouldDirty: true })}
                  data-testid="switch-soft-hold-enabled"
                />
              </div>
              
              {softHoldEnabled && (
                <div className="ml-4 border-l-2 border-gray-200 pl-4">
                  <Label htmlFor="soft-hold-duration">Hold Duration (Hours)</Label>
                  <Input
                    id="soft-hold-duration"
                    type="number"
                    min="1"
                    max="168"
                    value={softHoldDurationHours}
                    onChange={(e) => form.setValue('softHoldDurationHours', parseInt(e.target.value) || 48, { shouldDirty: true })}
                    data-testid="input-soft-hold-duration"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    How long reservations are held before expiring (1-168 hours)
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* **5. INFLUENCER COMMISSION POOL** */}
      {(monetisationMode === 'promo_only' || monetisationMode === 'creator_led') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Influencer Promotion
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="influencer-enabled">Enable Influencer Promotion</Label>
                  <p className="text-xs text-gray-500">Allow influencers to promote your experience for commission</p>
                </div>
                <Switch
                  id="influencer-enabled"
                  checked={influencerPromotionEnabled}
                  onCheckedChange={(checked) => form.setValue('influencerPromotionEnabled', checked, { shouldDirty: true })}
                  data-testid="switch-influencer-enabled"
                />
              </div>
              
              {influencerPromotionEnabled && (
                <div className="ml-4 border-l-2 border-gray-200 pl-4 space-y-4">
                  <div>
                    <Label htmlFor="influencer-commission">Commission Percentage (%)</Label>
                    <Input
                      id="influencer-commission"
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={influencerCommissionPct}
                      onChange={(e) => form.setValue('influencerCommissionPct', parseFloat(e.target.value) || 0, { shouldDirty: true })}
                      data-testid="input-influencer-commission"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Commission paid to influencers per successful booking (0-50%)
                    </p>
                  </div>
                  
                  <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded text-sm">
                    <p className="text-purple-700 dark:text-purple-300">
                      🚀 Your experience will be available in our influencer marketplace for promotion.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* **6. DISCOUNTS SYSTEM** */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge className="w-5 h-5" />
            Discount Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">Create promotional discounts for your experience</p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm"
                onClick={addDiscount}
                data-testid="button-add-discount"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Discount
              </Button>
            </div>
            
            {discounts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Badge className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No discounts created yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {discounts.map((discount: any, index: number) => (
                  <div key={discount.id} className="border rounded-lg p-4" data-testid={`discount-${index}`}>
                    <div className="flex justify-between items-start mb-4">
                      <h5 className="font-medium">Discount {index + 1}</h5>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDiscount(discount.id)}
                        data-testid={`button-remove-discount-${index}`}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor={`discount-title-${discount.id}`}>Title</Label>
                          <Input
                            id={`discount-title-${discount.id}`}
                            placeholder="e.g., Early Bird Special"
                            value={discount.title}
                            onChange={(e) => updateDiscount(discount.id, 'title', e.target.value)}
                            data-testid={`input-discount-title-${index}`}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`discount-type-${discount.id}`}>Type</Label>
                          <Select 
                            value={discount.type} 
                            onValueChange={(value) => updateDiscount(discount.id, 'type', value)}
                          >
                            <SelectTrigger data-testid={`select-discount-type-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Percentage (%)</SelectItem>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label htmlFor={`discount-value-${discount.id}`}>
                            Value {discount.type === 'percentage' ? '(%)' : `(${currency ? CURRENCY_CONFIG[currency as keyof typeof CURRENCY_CONFIG]?.symbol : '$'})`}
                          </Label>
                          <Input
                            id={`discount-value-${discount.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={discount.value}
                            onChange={(e) => updateDiscount(discount.id, 'value', parseFloat(e.target.value) || 0)}
                            data-testid={`input-discount-value-${index}`}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`discount-valid-until-${discount.id}`}>Valid Until (Optional)</Label>
                          <Input
                            id={`discount-valid-until-${discount.id}`}
                            type="date"
                            value={discount.validUntil || ''}
                            onChange={(e) => updateDiscount(discount.id, 'validUntil', e.target.value)}
                            data-testid={`input-discount-valid-until-${index}`}
                          />
                        </div>
                        
                        <div>
                          <Label htmlFor={`discount-capacity-cap-${discount.id}`}>Capacity Cap (Optional)</Label>
                          <Input
                            id={`discount-capacity-cap-${discount.id}`}
                            type="number"
                            min="1"
                            placeholder="e.g., 10"
                            value={discount.capacityCap || ''}
                            onChange={(e) => updateDiscount(discount.id, 'capacityCap', e.target.value ? parseInt(e.target.value) : undefined)}
                            data-testid={`input-discount-capacity-cap-${index}`}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        {priceSource.source === 'rooms' && skus.length > 0 && (
                          <div>
                            <Label htmlFor={`discount-sku-${discount.id}`}>Apply to SKU (Optional)</Label>
                            <Select 
                              value={discount.skuId || 'all'} 
                              onValueChange={(value) => updateDiscount(discount.id, 'skuId', value === 'all' ? undefined : value)}
                            >
                              <SelectTrigger data-testid={`select-discount-sku-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">All Room Types</SelectItem>
                                {skus.map((sku) => (
                                  <SelectItem key={sku.id} value={sku.id}>
                                    {sku.name} (×{sku.quantity})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`discount-active-${discount.id}`}
                            checked={discount.active}
                            onCheckedChange={(checked) => updateDiscount(discount.id, 'active', checked)}
                            data-testid={`switch-discount-active-${index}`}
                          />
                          <Label htmlFor={`discount-active-${discount.id}`}>Active</Label>
                        </div>
                      </div>
                    </div>
                    
                    {/* Discount Preview */}
                    {discount.title && discount.value > 0 && (
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Preview: {discount.title} - {discount.type === 'percentage' ? `${discount.value}% off` : `${formatPriceByCurrency(discount.value, currency)} off`}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950">
        <CardContent className="p-6">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">
            Pricing Configuration Summary
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Pricing Source:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200 capitalize">{priceSource.source}</span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Currency:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">{currency?.toUpperCase() || 'Not set'}</span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Business Model:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">Creator-Led</span>
            </div>
            <div>
              <span className="font-medium text-blue-900 dark:text-blue-100">Marketplace Economics:</span>{" "}
              <span className="text-blue-800 dark:text-blue-200">
                15% platform fee / {form.watch('venueCompensationModel') || "access_only"} venue terms
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TermsStep({ form }: { form: any }) {
  const formData = form.watch();

  // Currency symbol helper
  // DATA CONTRACT: Default to EUR for display consistency
  const getCurrencySymbol = (currency: string | null | undefined): string => {
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
    };
    const code = currency?.toUpperCase() || 'EUR';
    return symbols[code] || code + ' ';
  };

  const currencySymbol = getCurrencySymbol(formData.currency);
  const displayPrice = formData.pricePerPerson || formData.price || 0;

  return (
    <div className="space-y-8">
      {/* Final Review Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
              Ready to Submit Your Experience
            </h3>
            <p className="text-blue-800 dark:text-blue-200 text-sm mb-4">
              Review your experience details and accept our terms to submit for approval.
            </p>
            
            {/* Quick Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Experience:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200">{formData.title || "Untitled"}</span>
              </div>
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Category:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200 capitalize">
                  {formData.category?.replace('_', ' & ') || "Not set"}
                </span>
              </div>
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Capacity:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200">{formData.maxParticipants || 0} participants</span>
              </div>
              <div>
                <span className="font-medium text-blue-900 dark:text-blue-100">Base Price:</span>{" "}
                <span className="text-blue-800 dark:text-blue-200">{currencySymbol}{displayPrice}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Terms & Conditions */}
      <div className="space-y-6">
        <h4 className="font-semibold text-gray-900 dark:text-white">Platform Terms & Conditions</h4>
        
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h5 className="font-medium text-gray-900 dark:text-white mb-4">
            Great. Experience Platform - Terms of Service
          </h5>
          
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-4 max-h-60 overflow-y-auto bg-gray-50 dark:bg-gray-800 p-4 rounded border">
            <p><strong>1. Experience Creation & Publishing</strong></p>
            <p>By creating and publishing an experience, you confirm that you have the right to offer this experience and all information provided is accurate.</p>
            
            <p><strong>2. Payment Processing</strong></p>
            <p>Payments are processed securely through Stripe. Platform fees and processing charges apply as outlined in your creator dashboard.</p>
            
            <p><strong>3. Cancellations & Refunds</strong></p>
            <p>You must honor your stated cancellation and refund policies. Participants may be entitled to refunds based on your experience terms.</p>
            
            <p><strong>4. Content Guidelines</strong></p>
            <p>All experience content must be appropriate, legal, and comply with our community guidelines. We reserve the right to remove inappropriate content.</p>
            
            <p><strong>5. Liability & Insurance</strong></p>
            <p>You are responsible for appropriate insurance coverage and safety measures for your experiences.</p>
            
            <p><strong>6. Revenue & Payments</strong></p>
            <p>Platform fees will be deducted from gross revenue before payouts. Payouts are processed according to your selected schedule.</p>
          </div>
        </div>
      </div>

      {/* Custom Experience Terms & Conditions */}
      <div className="space-y-6">
        <h4 className="font-semibold text-gray-900 dark:text-white">Your Experience Terms & Conditions (Optional)</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add your specific terms, cancellation policies, and conditions that participants must agree to when booking this experience.
        </p>
        
        {/* Editable Custom Terms Text Area */}
        <FormField
          control={form.control}
          name="customTerms"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Custom Terms & Conditions</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  placeholder="Enter your custom terms and conditions here...

Example sections:
• Cancellation Policy: ...
• Refund Policy: ...
• What's Included: ...
• What's Not Included: ...
• Participant Requirements: ...
• Safety Guidelines: ...
• Liability Waiver: ..."
                  className="w-full min-h-[200px] p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-y focus:ring-2 focus:ring-primary focus:border-transparent"
                  data-testid="textarea-custom-terms"
                />
              </FormControl>
              <FormDescription>
                These terms will be displayed to participants during checkout. Leave blank to use only platform terms.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        {/* OR Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300 dark:border-gray-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-2 text-gray-500">OR upload a PDF document</span>
          </div>
        </div>
        
        {/* PDF Upload */}
        <FormField
          control={form.control}
          name="termsDocumentUrl"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="space-y-3">
                  {field.value ? (
                    <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-200">Terms Document Uploaded</p>
                          <a 
                            href={field.value} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-green-600 dark:text-green-400 hover:underline"
                          >
                            View PDF Document
                          </a>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => field.onChange('')}
                        className="text-red-600 hover:text-red-700"
                        data-testid="button-remove-terms-pdf"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                      <input
                        type="file"
                        accept=".pdf,application/pdf"
                        className="hidden"
                        id="experience-terms-pdf-upload"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          if (file.size > 10 * 1024 * 1024) {
                            return;
                          }
                          
                          try {
                            const response = await apiRequest('POST', '/api/objects/upload');
                            if (!response.ok) throw new Error('Failed to get upload URL');
                            const { uploadURL } = await response.json();
                            
                            const uploadResponse = await fetch(uploadURL, {
                              method: 'PUT',
                              body: file,
                              headers: {
                                'Content-Type': 'application/pdf'
                              }
                            });
                            
                            if (!uploadResponse.ok) {
                              throw new Error('Upload failed');
                            }
                            
                            const publicUrl = uploadURL.split('?')[0];
                            field.onChange(publicUrl);
                          } catch (error) {
                            console.error('PDF upload error:', error);
                          }
                          e.target.value = '';
                        }}
                        data-testid="input-experience-terms-pdf-upload"
                      />
                      <label 
                        htmlFor="experience-terms-pdf-upload" 
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <Upload className="h-8 w-8 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Click to upload PDF
                        </span>
                        <span className="text-xs text-gray-500">
                          PDF files only, max 10MB
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Terms Acceptance - Use explicit boolean handling to avoid Radix "indeterminate" issues */}
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <FormField
            control={form.control}
            name="termsAccepted"
            render={({ field }) => {
              const isChecked = field.value === true;
              return (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        // Ensure we only pass boolean true/false, never "indeterminate"
                        field.onChange(checked === true);
                      }}
                      data-testid="checkbox-terms-accepted"
                      className="mt-1"
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-normal">
                      I agree to the Terms of Service and Privacy Policy *
                    </FormLabel>
                    <FormDescription>
                      You must accept our terms to submit your experience for review.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        </div>
      </div>

      {/* Submission Status */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">Review Process</p>
            <p className="text-amber-800 dark:text-amber-200">
              After submission, our team will review your experience within 2-3 business days. You'll receive email updates about the approval status.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
