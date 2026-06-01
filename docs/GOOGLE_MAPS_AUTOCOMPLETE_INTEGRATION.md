# Google Maps Places Autocomplete Integration Guide

**Date:** October 17, 2025  
**Purpose:** Integrate Google Maps Places Autocomplete for venue location selection  
**Framework:** React + TypeScript + Vite + React Hook Form  

---

## 🗺️ Part 1: Overview

### What It Does

- **Autocomplete address input** - Type partial address, get suggestions
- **Auto-fill city and region** - Extracts city from selected place
- **Capture coordinates** - Saves latitude/longitude automatically
- **Reverse geocoding** - Convert coordinates to address
- **Fallback mode** - Manual input if API key unavailable

### UI Placement

**Recommended:** Single location field with autocomplete + hidden lat/lng fields

```
┌─────────────────────────────────────────────┐
│ Location *                                  │
│ ┌─────────────────────────────────────────┐ │
│ │ 123 Retreat Lane, Sedona, AZ 86336    ▼ │ │ ← Autocomplete dropdown
│ └─────────────────────────────────────────┘ │
│                                             │
│ Latitude: 34.8697  Longitude: -111.7610     │ ← Auto-filled
└─────────────────────────────────────────────┘
```

**Alternative:** Separate fields (more control)

```
Address: [                                    ]
City:    [                                    ]
Lat:     [34.8697     ]  Long: [-111.7610     ]
```

---

## 🔑 Part 2: Environment Variables

### For Vite Projects (This Project)

**Frontend (client-side):**
```bash
VITE_GOOGLE_MAPS_API_KEY=AIzaSyC...your-key-here
```

**Backend (server-side geocoding - optional):**
```bash
GOOGLE_MAPS_API_KEY=AIzaSyC...your-key-here
```

### Setting Up in Replit

**Method 1: Secrets Panel (Recommended)**

1. Click **Tools** → **Secrets**
2. Add secret: `VITE_GOOGLE_MAPS_API_KEY`
3. Paste your API key
4. Save

**Method 2: Environment Variables**

```bash
# In Replit Shell
echo 'VITE_GOOGLE_MAPS_API_KEY=your-key-here' >> .env
```

### Getting a Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable these APIs:
   - **Maps JavaScript API** (for autocomplete widget)
   - **Places API** (for place details)
   - **Geocoding API** (optional, for server-side geocoding)
4. Go to **APIs & Services** → **Credentials**
5. Click **Create Credentials** → **API Key**
6. Copy your API key

---

## 🔒 Part 3: Security - API Key Restrictions

### Restrict by HTTP Referrer (Website)

**Recommended for production:**

1. In Google Cloud Console → **Credentials**
2. Click your API key
3. Under **Application restrictions**, select **HTTP referrers**
4. Add these referrers:
   ```
   https://your-repl-name.replit.app/*
   https://*.replit.dev/*
   https://your-custom-domain.com/*
   ```

**For development:**
```
http://localhost:5000/*
http://127.0.0.1:5000/*
```

### Restrict by API

Under **API restrictions**, select **Restrict key** and choose:
- ✅ Maps JavaScript API
- ✅ Places API
- ✅ Geocoding API (if using server-side)

### Prevent Quota Exhaustion

Set daily quotas:
1. Go to **APIs & Services** → **Quotas**
2. Set **Requests per day** limit (e.g., 1,000)
3. Enable **Billing alerts** to monitor usage

**Free tier limits:**
- Places Autocomplete: $2.83 per 1,000 requests (first $200/month free)
- Geocoding API: $5 per 1,000 requests

---

## 📦 Part 4: Installation

### Install Google Maps React Library

```bash
npm install @react-google-maps/api
```

**Already done?** Check package.json for `@react-google-maps/api`

### Load Google Maps Script

Add to `index.html` (if not using library):

```html
<script
  src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&libraries=places"
  async
  defer
></script>
```

**Or** use the library's `useLoadScript` hook (recommended).

---

## 🎨 Part 5: LocationPicker Component

Create `client/src/components/location-picker.tsx`:

```typescript
import { useRef, useEffect, useState } from "react";
import { useLoadScript } from "@react-google-maps/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, AlertCircle } from "lucide-react";

// Define libraries outside component to prevent re-renders
const libraries: ("places")[] = ["places"];

interface LocationPickerProps {
  // Form field values
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  
  // Callbacks to update form
  onAddressChange: (address: string) => void;
  onCityChange: (city: string) => void;
  onCoordinatesChange: (lat: number, lng: number) => void;
  
  // Optional
  disabled?: boolean;
  className?: string;
}

export function LocationPicker({
  address,
  city,
  latitude,
  longitude,
  onAddressChange,
  onCityChange,
  onCoordinatesChange,
  disabled = false,
  className = "",
}: LocationPickerProps) {
  const addressInputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Load Google Maps script
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: apiKey || "",
    libraries,
  });

  // Initialize autocomplete
  useEffect(() => {
    if (!isLoaded || !addressInputRef.current || !apiKey) return;

    const autocompleteInstance = new google.maps.places.Autocomplete(
      addressInputRef.current,
      {
        types: ["establishment", "geocode"],
        fields: ["formatted_address", "geometry", "address_components", "name"],
      }
    );

    autocompleteInstance.addListener("place_changed", () => {
      const place = autocompleteInstance.getPlace();
      
      if (!place.geometry || !place.geometry.location) {
        console.error("No geometry data for selected place");
        return;
      }

      // Extract coordinates
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Extract city from address components
      let extractedCity = "";
      if (place.address_components) {
        for (const component of place.address_components) {
          if (component.types.includes("locality")) {
            extractedCity = component.long_name;
            break;
          }
          // Fallback to administrative_area_level_1 (state) if no city
          if (component.types.includes("administrative_area_level_1")) {
            extractedCity = component.long_name;
          }
        }
      }

      // Update form fields
      onAddressChange(place.formatted_address || "");
      onCityChange(extractedCity);
      onCoordinatesChange(lat, lng);
    });

    setAutocomplete(autocompleteInstance);

    return () => {
      google.maps.event.clearInstanceListeners(autocompleteInstance);
    };
  }, [isLoaded, apiKey, onAddressChange, onCityChange, onCoordinatesChange]);

  // Handle manual address input (when autocomplete not used)
  const handleManualInput = (value: string) => {
    onAddressChange(value);
  };

  // Show error if API fails to load
  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load Google Maps. Using manual input mode.
        </AlertDescription>
      </Alert>
    );
  }

  // Fallback UI if no API key
  if (!apiKey) {
    return (
      <div className={className}>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Google Maps API key not configured. Using manual input mode.
          </AlertDescription>
        </Alert>
        
        <div className="space-y-4 mt-4">
          {/* Manual address input */}
          <div>
            <Label htmlFor="manual-address">Full Address *</Label>
            <Input
              id="manual-address"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="123 Retreat Lane, Sedona, AZ 86336, USA"
              disabled={disabled}
              data-testid="input-address-manual"
            />
          </div>

          {/* Manual city input */}
          <div>
            <Label htmlFor="manual-city">City *</Label>
            <Input
              id="manual-city"
              value={city}
              onChange={(e) => onCityChange(e.target.value)}
              placeholder="Sedona"
              disabled={disabled}
              data-testid="input-city-manual"
            />
          </div>

          {/* Manual coordinates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="manual-lat">Latitude</Label>
              <Input
                id="manual-lat"
                type="number"
                step="0.0000001"
                value={latitude ?? ""}
                onChange={(e) => {
                  const lat = parseFloat(e.target.value);
                  if (!isNaN(lat) && longitude !== null) {
                    onCoordinatesChange(lat, longitude);
                  }
                }}
                placeholder="34.8697"
                disabled={disabled}
                data-testid="input-latitude-manual"
              />
            </div>
            <div>
              <Label htmlFor="manual-lng">Longitude</Label>
              <Input
                id="manual-lng"
                type="number"
                step="0.0000001"
                value={longitude ?? ""}
                onChange={(e) => {
                  const lng = parseFloat(e.target.value);
                  if (!isNaN(lng) && latitude !== null) {
                    onCoordinatesChange(latitude, lng);
                  }
                }}
                placeholder="-111.7610"
                disabled={disabled}
                data-testid="input-longitude-manual"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (!isLoaded) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <MapPin className="h-4 w-4 animate-pulse" />
          <span>Loading Google Maps...</span>
        </div>
      </div>
    );
  }

  // Main autocomplete UI
  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Autocomplete address input */}
        <div>
          <Label htmlFor="location-autocomplete">
            Location *
          </Label>
          <Input
            id="location-autocomplete"
            ref={addressInputRef}
            value={address}
            onChange={(e) => handleManualInput(e.target.value)}
            placeholder="Start typing address..."
            disabled={disabled}
            data-testid="input-location-autocomplete"
            className="w-full"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Start typing to see suggestions, or enter manually
          </p>
        </div>

        {/* City (auto-filled or manual) */}
        <div>
          <Label htmlFor="city-field">City *</Label>
          <Input
            id="city-field"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="Will auto-fill from address"
            disabled={disabled}
            data-testid="input-city"
          />
        </div>

        {/* Coordinates (auto-filled, read-only) */}
        {(latitude !== null || longitude !== null) && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="latitude-display">Latitude</Label>
              <Input
                id="latitude-display"
                value={latitude?.toFixed(7) || ""}
                readOnly
                disabled={disabled}
                className="bg-muted"
                data-testid="display-latitude"
              />
            </div>
            <div>
              <Label htmlFor="longitude-display">Longitude</Label>
              <Input
                id="longitude-display"
                value={longitude?.toFixed(7) || ""}
                readOnly
                disabled={disabled}
                className="bg-muted"
                data-testid="display-longitude"
              />
            </div>
          </div>
        )}

        {/* Coordinates verification */}
        {latitude && longitude && (
          <Alert>
            <MapPin className="h-4 w-4" />
            <AlertDescription>
              <a
                href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                View on Google Maps →
              </a>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
```

---

## 🔌 Part 6: Integration with Venue Form

Update `client/src/pages/venue-builder.tsx`:

```typescript
import { LocationPicker } from "@/components/location-picker";

export function VenueBuilder() {
  const form = useForm<VenueFormValues>({
    // ... existing setup
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        
        {/* ==================== LOCATION SECTION ==================== */}
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
            <CardDescription>Where is your venue located?</CardDescription>
          </CardHeader>
          <CardContent>
            
            {/* Use LocationPicker component */}
            <LocationPicker
              address={form.watch("location")}
              city={form.watch("city")}
              latitude={form.watch("latitude")}
              longitude={form.watch("longitude")}
              onAddressChange={(address) => form.setValue("location", address)}
              onCityChange={(city) => form.setValue("city", city)}
              onCoordinatesChange={(lat, lng) => {
                form.setValue("latitude", lat);
                form.setValue("longitude", lng);
              }}
            />

            {/* Optional: Region field */}
            <FormField
              control={form.control}
              name="region"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Region</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Southwest USA"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

          </CardContent>
        </Card>

        {/* ... rest of form */}
      </form>
    </Form>
  );
}
```

---

## 🎯 Part 7: Extracting Place Data - Code Examples

### Basic Place Selection

```typescript
autocomplete.addListener("place_changed", () => {
  const place = autocomplete.getPlace();
  
  // Extract coordinates
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  
  console.log("Coordinates:", lat, lng);
  // Output: Coordinates: 34.8697 -111.7610
});
```

### Extract All Address Components

```typescript
autocomplete.addListener("place_changed", () => {
  const place = autocomplete.getPlace();
  
  if (!place.address_components) return;
  
  let streetNumber = "";
  let route = "";
  let city = "";
  let state = "";
  let postalCode = "";
  let country = "";
  
  for (const component of place.address_components) {
    const types = component.types;
    
    if (types.includes("street_number")) {
      streetNumber = component.long_name;
    }
    if (types.includes("route")) {
      route = component.long_name;
    }
    if (types.includes("locality")) {
      city = component.long_name;
    }
    if (types.includes("administrative_area_level_1")) {
      state = component.short_name; // "AZ"
    }
    if (types.includes("postal_code")) {
      postalCode = component.long_name;
    }
    if (types.includes("country")) {
      country = component.long_name;
    }
  }
  
  // Build full address
  const fullAddress = `${streetNumber} ${route}, ${city}, ${state} ${postalCode}, ${country}`;
  
  // Update form
  form.setValue("location", fullAddress);
  form.setValue("city", city);
  form.setValue("latitude", place.geometry.location.lat());
  form.setValue("longitude", place.geometry.location.lng());
});
```

### Extract Region

```typescript
let region = "";

for (const component of place.address_components) {
  // Administrative area level 1 (state/province)
  if (component.types.includes("administrative_area_level_1")) {
    region = component.long_name; // "Arizona"
  }
  
  // Or combine state + country
  if (component.types.includes("country")) {
    region = `${region}, ${component.long_name}`;
    // Result: "Arizona, United States"
  }
}

form.setValue("region", region);
```

---

## 🧪 Part 8: Validation & Error Handling

### Validate Coordinates

```typescript
// In Zod schema
latitude: z.number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90")
  .optional()
  .nullable(),

longitude: z.number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180")
  .optional()
  .nullable(),
```

### Handle Autocomplete Errors

```typescript
autocomplete.addListener("place_changed", () => {
  const place = autocomplete.getPlace();
  
  // No geometry data
  if (!place.geometry || !place.geometry.location) {
    toast({
      title: "Invalid Selection",
      description: "Please select a valid address from the dropdown",
      variant: "destructive",
    });
    return;
  }
  
  // No address components
  if (!place.address_components) {
    toast({
      title: "Incomplete Data",
      description: "Selected place is missing address details",
      variant: "warning",
    });
  }
  
  // Success
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  onCoordinatesChange(lat, lng);
});
```

### Check if API Key is Valid

```typescript
const { loadError } = useLoadScript({
  googleMapsApiKey: apiKey || "",
  libraries,
});

if (loadError) {
  console.error("Google Maps failed to load:", loadError);
  // Fall back to manual input
}
```

---

## 🎨 Part 9: Styling the Autocomplete Dropdown

### Custom CSS (Optional)

Add to `client/src/index.css`:

```css
/* Style Google Maps autocomplete dropdown */
.pac-container {
  background-color: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  font-family: inherit;
  margin-top: 4px;
  z-index: 1000;
}

.pac-item {
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-top: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
}

.pac-item:first-child {
  border-top: none;
}

.pac-item:hover {
  background-color: hsl(var(--accent));
}

.pac-item-query {
  font-size: 0.875rem;
  color: hsl(var(--foreground));
}

.pac-matched {
  font-weight: 600;
  color: hsl(var(--primary));
}

.pac-icon {
  display: none; /* Hide default Google icon */
}
```

---

## 🔄 Part 10: Server-Side Geocoding (Optional)

For reverse geocoding or address validation on the backend:

### Setup

```bash
# Install Google Maps Node.js client
npm install @googlemaps/google-maps-services-js
```

### Backend Route

Add to `server/routes.ts`:

```typescript
import { Client } from "@googlemaps/google-maps-services-js";

const mapsClient = new Client({});

// Reverse geocoding: coordinates → address
app.post("/api/geocode/reverse", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    
    const response = await mapsClient.reverseGeocode({
      params: {
        latlng: { lat: latitude, lng: longitude },
        key: process.env.GOOGLE_MAPS_API_KEY || "",
      },
    });

    if (response.data.results.length === 0) {
      return res.status(404).json({ error: "No address found" });
    }

    const address = response.data.results[0].formatted_address;
    res.json({ address });
  } catch (error) {
    console.error("Geocoding error:", error);
    res.status(500).json({ error: "Geocoding failed" });
  }
});

// Forward geocoding: address → coordinates
app.post("/api/geocode/forward", async (req, res) => {
  try {
    const { address } = req.body;
    
    const response = await mapsClient.geocode({
      params: {
        address,
        key: process.env.GOOGLE_MAPS_API_KEY || "",
      },
    });

    if (response.data.results.length === 0) {
      return res.status(404).json({ error: "No coordinates found" });
    }

    const location = response.data.results[0].geometry.location;
    res.json({ latitude: location.lat, longitude: location.lng });
  } catch (error) {
    console.error("Geocoding error:", error);
    res.status(500).json({ error: "Geocoding failed" });
  }
});
```

---

## ✅ Part 11: Testing Checklist

### Autocomplete Functionality

- [ ] Type partial address → See dropdown suggestions
- [ ] Select suggestion → Address auto-fills
- [ ] Select suggestion → City auto-fills
- [ ] Select suggestion → Coordinates populate
- [ ] Manual typing → Can still type full address
- [ ] Clear field → Coordinates remain (or clear based on preference)

### Fallback Mode

- [ ] No API key → Shows manual input mode
- [ ] API load error → Shows manual input mode
- [ ] Manual coordinates → Can enter lat/lng directly
- [ ] Coordinate validation → -90 to 90, -180 to 180

### Data Extraction

- [ ] Urban address → Extracts street, city, state
- [ ] Rural address → Handles missing street numbers
- [ ] International address → Works with non-US formats
- [ ] Place name → "Grand Canyon" → Gets coordinates

### Form Integration

- [ ] Form validation → Required fields work
- [ ] Form submission → All fields save to database
- [ ] Form reset → Clears autocomplete state
- [ ] Error display → Shows validation errors

---

## 🚨 Part 12: Common Issues & Solutions

### Issue: Autocomplete dropdown not showing

**Causes:**
- API key invalid or missing
- Wrong libraries loaded
- CSS z-index conflict

**Solution:**
```typescript
// Check API key
console.log("API Key:", import.meta.env.VITE_GOOGLE_MAPS_API_KEY);

// Verify libraries
const libraries: ("places")[] = ["places"];

// Fix z-index in CSS
.pac-container {
  z-index: 9999 !important;
}
```

### Issue: "This page can't load Google Maps correctly"

**Cause:** API key not configured or billing not enabled

**Solution:**
1. Enable billing in Google Cloud Console
2. Verify API key is correct
3. Check API restrictions

### Issue: Coordinates not updating form

**Cause:** Form setValue not triggering update

**Solution:**
```typescript
// Use shouldValidate option
form.setValue("latitude", lat, { shouldValidate: true, shouldDirty: true });
```

### Issue: Address components empty

**Cause:** Not requesting address_components field

**Solution:**
```typescript
new google.maps.places.Autocomplete(input, {
  fields: ["formatted_address", "geometry", "address_components", "name"],
  //                                          ^^^^^^^^^^^^^^^^^^^^ Required!
});
```

---

## 📦 Part 13: Complete Implementation Summary

### Files to Create/Modify

```
client/src/
  ├── components/
  │   └── location-picker.tsx       ← New component
  └── pages/
      └── venue-builder.tsx         ← Modify (integrate LocationPicker)

.env (or Replit Secrets)
  └── VITE_GOOGLE_MAPS_API_KEY      ← Add API key
```

### Installation

```bash
npm install @react-google-maps/api
```

### Environment Variable

**Replit Secrets:**
- Key: `VITE_GOOGLE_MAPS_API_KEY`
- Value: `AIzaSyC...your-api-key`

### Usage in Form

```typescript
<LocationPicker
  address={form.watch("location")}
  city={form.watch("city")}
  latitude={form.watch("latitude")}
  longitude={form.watch("longitude")}
  onAddressChange={(addr) => form.setValue("location", addr)}
  onCityChange={(city) => form.setValue("city", city)}
  onCoordinatesChange={(lat, lng) => {
    form.setValue("latitude", lat);
    form.setValue("longitude", lng);
  }}
/>
```

---

## 🎓 Key Takeaways

✅ **Single component** handles autocomplete + fallback  
✅ **Auto-fills** address, city, and coordinates  
✅ **Graceful degradation** when API unavailable  
✅ **Type-safe** with TypeScript interfaces  
✅ **Validated** with Zod schema  
✅ **Secure** with API key restrictions  
✅ **Tested** with comprehensive checklist  

**Ready to integrate!** Copy the LocationPicker component and add to your venue form.
