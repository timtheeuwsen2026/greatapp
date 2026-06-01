# Venue Form Implementation - Part 2: Components & Transformations

**Continuation from VENUE_FORM_IMPLEMENTATION_GUIDE.md**

---

## Part 3: Services, Images, and Business Fields

```typescript
// Continuing the form from previous file...

          {/* ==================== SERVICES & PRICING ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Services & Pricing</CardTitle>
              <CardDescription>What services do you offer?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Services Editor */}
              <FormField
                control={form.control}
                name="services"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Services</FormLabel>
                    <FormControl>
                      <ServiceEditor
                        services={field.value}
                        onChange={field.onChange}
                        data-testid="service-editor"
                      />
                    </FormControl>
                    <FormDescription>
                      Add services like catering, equipment rental, guided activities
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Pricing Model */}
              <FormField
                control={form.control}
                name="pricingModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pricing Model</FormLabel>
                    <Select
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      data-testid="select-pricing-model"
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select pricing model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="per_night">Per Night</SelectItem>
                        <SelectItem value="per_person">Per Person</SelectItem>
                        <SelectItem value="per_event">Per Event</SelectItem>
                        <SelectItem value="flat_rate">Flat Rate</SelectItem>
                        <SelectItem value="custom">Custom Pricing</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Payment Terms */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="depositPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deposit %</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          placeholder="20"
                          data-testid="input-deposit-percent"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormDescription>
                        Deposit required
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="softHoldDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hold Days</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="30"
                          placeholder="7"
                          data-testid="input-soft-hold-days"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormDescription>
                        Days to hold booking
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Cancellation Policy */}
              <FormField
                control={form.control}
                name="cancellationPolicy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cancellation Policy</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., Free cancellation up to 30 days before event. 50% refund 15-30 days. No refund within 15 days."
                        className="min-h-[100px]"
                        data-testid="input-cancellation-policy"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Describe your cancellation and refund policy
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          {/* ==================== IMAGES & MEDIA ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Images & Media</CardTitle>
              <CardDescription>Show off your venue with photos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Cover Images (New JSONB structure) */}
              <FormField
                control={form.control}
                name="coverImages"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cover Images</FormLabel>
                    <FormControl>
                      <ImageUploader
                        images={field.value}
                        onChange={field.onChange}
                        maxImages={3}
                        aspectRatio="16:9"
                        data-testid="uploader-cover-images"
                      />
                    </FormControl>
                    <FormDescription>
                      Upload 1-3 hero images for your venue (16:9 aspect ratio recommended)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Gallery Images (New JSONB structure) */}
              <FormField
                control={form.control}
                name="galleryImagesJsonb"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gallery Images</FormLabel>
                    <FormControl>
                      <ImageUploader
                        images={field.value}
                        onChange={field.onChange}
                        maxImages={20}
                        allowReorder
                        data-testid="uploader-gallery-images"
                      />
                    </FormControl>
                    <FormDescription>
                      Upload up to 20 images showcasing your venue (drag to reorder)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Legacy Cover Image URL (Backward compatibility) */}
              <FormField
                control={form.control}
                name="coverImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cover Image URL (Legacy)</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://example.com/image.jpg"
                        data-testid="input-cover-image-url"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Direct image URL (for backward compatibility)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          {/* ==================== SOCIAL & WEB ==================== */}
          <Card>
            <CardHeader>
              <CardTitle>Website & Social Media</CardTitle>
              <CardDescription>Help people find you online</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://yourvenuewebsite.com"
                        data-testid="input-website"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram</FormLabel>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 text-sm border border-r-0 rounded-l-md bg-muted">
                        @
                      </span>
                      <FormControl>
                        <Input
                          placeholder="yourvenuehandle"
                          className="rounded-l-none"
                          data-testid="input-instagram"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Instagram handle (without @)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </CardContent>
          </Card>

          {/* ==================== FORM ACTIONS ==================== */}
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
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  form.setValue("status", "draft");
                  form.handleSubmit(onSubmit)();
                }}
                disabled={createVenueMutation.isPending}
                data-testid="button-save-draft"
              >
                Save as Draft
              </Button>

              <Button
                type="submit"
                disabled={createVenueMutation.isPending}
                data-testid="button-submit"
              >
                {createVenueMutation.isPending ? "Creating..." : "Create Venue"}
              </Button>
            </div>
          </div>

          {/* Form Errors Display */}
          {Object.keys(form.formState.errors).length > 0 && (
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Form Errors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-1">
                  {Object.entries(form.formState.errors).map(([field, error]) => (
                    <li key={field} className="text-sm text-destructive">
                      <strong>{field}:</strong> {error.message}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

        </form>
      </Form>
    </div>
  );
}
```

---

## Part 4: Helper Components

### 4.1 MultiSelect Component

Create `client/src/components/ui/multi-select.tsx`:

```typescript
import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface MultiSelectOption {
  label: string;
  value: string;
  group?: string;
  emoji?: string;
  icon?: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  maxSelections?: number;
  searchable?: boolean;
  groupBy?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  maxSelections,
  searchable = true,
  groupBy,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  
  // Group options if groupBy is provided
  const groupedOptions = React.useMemo(() => {
    if (!groupBy) return { "": options };
    
    const groups: Record<string, MultiSelectOption[]> = {};
    options.forEach((option) => {
      const group = (option as any)[groupBy] || "";
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group].push(option);
    });
    return groups;
  }, [options, groupBy]);

  const handleSelect = (value: string) => {
    const isSelected = selected.includes(value);
    
    if (isSelected) {
      onChange(selected.filter((v) => v !== value));
    } else {
      if (maxSelections && selected.length >= maxSelections) {
        return; // Don't add if max reached
      }
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string) => {
    onChange(selected.filter((v) => v !== value));
  };

  const selectedOptions = options.filter((opt) => selected.includes(opt.value));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selected.length === 0
                ? placeholder
                : `${selected.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            {searchable && <CommandInput placeholder="Search..." />}
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>
              
              {Object.entries(groupedOptions).map(([group, groupOptions]) => (
                <CommandGroup key={group} heading={group || undefined}>
                  {groupOptions.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      onSelect={() => handleSelect(option.value)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selected.includes(option.value)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {option.emoji && <span className="mr-2">{option.emoji}</span>}
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Items Display */}
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <Badge key={option.value} variant="secondary" className="gap-1">
              {option.emoji && <span>{option.emoji}</span>}
              {option.label}
              <button
                type="button"
                className="ml-1 rounded-full outline-none hover:bg-muted"
                onClick={() => handleRemove(option.value)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Max selections warning */}
      {maxSelections && selected.length >= maxSelections && (
        <p className="text-sm text-muted-foreground">
          Maximum {maxSelections} selections reached
        </p>
      )}
    </div>
  );
}
```

### 4.2 TagInput Component

Create `client/src/components/ui/tag-input.tsx`:

```typescript
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export function TagInput({
  tags,
  onTagsChange,
  placeholder = "Type and press Enter...",
  maxTags,
  className,
}: TagInputProps) {
  const [inputValue, setInputValue] = React.useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      // Remove last tag on backspace if input is empty
      removeTag(tags.length - 1);
    }
  };

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    
    // Check if tag already exists
    if (tags.includes(trimmed)) {
      setInputValue("");
      return;
    }

    // Check max tags
    if (maxTags && tags.length >= maxTags) {
      return;
    }

    onTagsChange([...tags, trimmed]);
    setInputValue("");
  };

  const removeTag = (index: number) => {
    onTagsChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={placeholder}
      />
      
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, index) => (
            <Badge key={index} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                className="ml-1 rounded-full outline-none hover:bg-muted"
                onClick={() => removeTag(index)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {maxTags && (
        <p className="text-sm text-muted-foreground">
          {tags.length} / {maxTags} tags
        </p>
      )}
    </div>
  );
}
```

### 4.3 ServiceEditor Component

Create `client/src/components/service-editor.tsx`:

```typescript
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Service {
  title: string;
  description?: string;
  price?: number;
  frequency?: "per_person" | "per_event" | "per_day" | "per_hour";
  quantity?: number;
}

interface ServiceEditorProps {
  services: Service[];
  onChange: (services: Service[]) => void;
}

export function ServiceEditor({ services, onChange }: ServiceEditorProps) {
  const addService = () => {
    onChange([
      ...services,
      { title: "", description: "", price: undefined, frequency: "per_event", quantity: undefined }
    ]);
  };

  const removeService = (index: number) => {
    onChange(services.filter((_, i) => i !== index));
  };

  const updateService = (index: number, field: keyof Service, value: any) => {
    const updated = services.map((service, i) => {
      if (i === index) {
        return { ...service, [field]: value };
      }
      return service;
    });
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {services.map((service, index) => (
        <Card key={index}>
          <CardContent className="pt-6 space-y-4">
            <div className="flex justify-between items-start">
              <h4 className="font-medium">Service {index + 1}</h4>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeService(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <Input
                  placeholder="Service title (e.g., Catering)"
                  value={service.title}
                  onChange={(e) => updateService(index, "title", e.target.value)}
                />
              </div>

              <div>
                <Textarea
                  placeholder="Description (optional)"
                  value={service.description || ""}
                  onChange={(e) => updateService(index, "description", e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Input
                    type="number"
                    placeholder="Price"
                    value={service.price || ""}
                    onChange={(e) => updateService(index, "price", e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </div>

                <div>
                  <Select
                    value={service.frequency}
                    onValueChange={(value) => updateService(index, "frequency", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_person">Per Person</SelectItem>
                      <SelectItem value="per_event">Per Event</SelectItem>
                      <SelectItem value="per_day">Per Day</SelectItem>
                      <SelectItem value="per_hour">Per Hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={service.quantity || ""}
                    onChange={(e) => updateService(index, "quantity", e.target.value ? parseInt(e.target.value) : undefined)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={addService}
        className="w-full"
      >
        <Plus className="h-4 w-4 mr-2" />
        Add Service
      </Button>
    </div>
  );
}
```

### 4.4 ImageUploader Component

Create `client/src/components/image-uploader.tsx`:

```typescript
import * as React from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ImageData {
  url: string;
  altText?: string;
  order?: number;
  isCover?: boolean;
}

interface ImageUploaderProps {
  images: ImageData[];
  onChange: (images: ImageData[]) => void;
  maxImages?: number;
  aspectRatio?: string;
  allowReorder?: boolean;
  className?: string;
}

export function ImageUploader({
  images,
  onChange,
  maxImages = 10,
  aspectRatio,
  allowReorder = false,
  className,
}: ImageUploaderProps) {
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remaining = maxImages - images.length;
    const filesToUpload = Array.from(files).slice(0, remaining);

    // Convert files to base64 URLs (in production, upload to cloud storage)
    const newImages: ImageData[] = await Promise.all(
      filesToUpload.map(async (file, index) => {
        const url = await fileToBase64(file);
        return {
          url,
          altText: file.name,
          order: images.length + index,
        };
      })
    );

    onChange([...images, ...newImages]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const updateAltText = (index: number, altText: string) => {
    const updated = images.map((img, i) => 
      i === index ? { ...img, altText } : img
    );
    onChange(updated);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedIndex === null || !allowReorder) return;

    const reordered = [...images];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(dropIndex, 0, removed);

    // Update order
    const withOrder = reordered.map((img, i) => ({ ...img, order: i }));
    onChange(withOrder);
    setDraggedIndex(null);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Upload Button */}
      {images.length < maxImages && (
        <div className="flex items-center justify-center w-full">
          <label
            htmlFor="image-upload"
            className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50"
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, GIF up to 10MB ({maxImages - images.length} remaining)
              </p>
            </div>
            <input
              id="image-upload"
              type="file"
              className="hidden"
              accept="image/*"
              multiple
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </label>
        </div>
      )}

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((image, index) => (
            <Card
              key={index}
              className={cn(
                "relative group",
                allowReorder && "cursor-move"
              )}
              draggable={allowReorder}
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
            >
              <div className={cn(
                "relative overflow-hidden rounded-md",
                aspectRatio && `aspect-${aspectRatio.replace(":", "/")}`
              )}>
                <img
                  src={image.url}
                  alt={image.altText || `Image ${index + 1}`}
                  className="object-cover w-full h-full"
                />
                
                {/* Remove Button */}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => removeImage(index)}
                >
                  <X className="h-4 w-4" />
                </Button>

                {/* Order Badge */}
                {allowReorder && (
                  <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                    #{index + 1}
                  </div>
                )}
              </div>

              {/* Alt Text Input */}
              <div className="p-2">
                <Input
                  placeholder="Image description..."
                  value={image.altText || ""}
                  onChange={(e) => updateAltText(index, e.target.value)}
                  className="text-sm"
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Part 5: Client-Side Transformations

### 5.1 Slug Generation

Already implemented in the main form component:

```typescript
// Auto-generate slug from name + city
function generateSlug(name: string, city: string): string {
  const combined = `${name}-${city}`;
  return combined
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // spaces to hyphens
    .replace(/[^\w\-]+/g, '')       // remove special chars
    .replace(/\-\-+/g, '-')         // multiple hyphens to single
    .replace(/^-+/, '')             // trim start
    .replace(/-+$/, '');            // trim end
}

// Live preview
useEffect(() => {
  if (!isManualSlug && watchName && watchCity) {
    const generatedSlug = generateSlug(watchName, watchCity);
    setSlugPreview(generatedSlug);
    form.setValue("slug", generatedSlug, { shouldValidate: true });
  }
}, [watchName, watchCity, isManualSlug]);
```

### 5.2 Array Handling

Arrays are automatically handled by the form:

```typescript
// MultiSelect component returns array of strings
<MultiSelect
  selected={field.value}  // string[]
  onChange={field.onChange}  // (value: string[]) => void
/>

// Form submits with arrays intact
{
  categories: ["retreat_center", "yoga_studio"],
  vibes: ["peaceful", "luxurious"],
  amenities: ["amenity-id-1", "amenity-id-2"],
  customAmenities: ["Saltwater pool", "Sound healing room"]
}
```

### 5.3 Image Upload Transformation

```typescript
// Convert File objects to upload-ready format
async function handleImageUpload(files: FileList) {
  const uploads = await Promise.all(
    Array.from(files).map(async (file) => {
      // Option 1: Base64 (for preview)
      const base64 = await fileToBase64(file);
      
      // Option 2: Upload to cloud storage (recommended)
      // const url = await uploadToCloudStorage(file);
      
      return {
        url: base64,  // or cloud URL
        altText: file.name,
        order: images.length,
      };
    })
  );
  
  return uploads;
}

// Form submission transforms images array
const formData = {
  ...values,
  coverImages: [
    { url: "https://cdn.example.com/image1.jpg", altText: "Main hall", isCover: true },
    { url: "https://cdn.example.com/image2.jpg", altText: "Garden view", isCover: false },
  ],
  galleryImagesJsonb: [
    { url: "https://cdn.example.com/gallery1.jpg", altText: "Yoga studio", order: 1 },
    { url: "https://cdn.example.com/gallery2.jpg", altText: "Meditation room", order: 2 },
  ]
};
```

### 5.4 Null vs Empty String Handling

```typescript
// Form submission transformation
async function onSubmit(values: VenueFormValues) {
  const transformedData = {
    ...values,
    // Convert empty strings to null for optional fields
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

  // Submit to API
  await apiRequest("/api/venues", {
    method: "POST",
    body: JSON.stringify(transformedData),
  });
}
```

---

## Part 6: Form Submission Flow

```
1. User fills form
   ↓
2. React Hook Form validates (Zod schema)
   ↓
3. onSubmit function called
   ↓
4. Transform data (null handling, type conversion)
   ↓
5. API request (POST /api/venues)
   ↓
6. Backend validates again (insertVenueSchema)
   ↓
7. Save to database
   ↓
8. Return created venue
   ↓
9. Invalidate cache
   ↓
10. Navigate to venue page (/v/slug)
```

---

## Part 7: Error Handling

### Inline Field Errors

Automatically shown by `<FormMessage />`:

```typescript
<FormField
  name="name"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Venue Name</FormLabel>
      <FormControl>
        <Input {...field} />
      </FormControl>
      <FormMessage />  {/* ← Shows validation error */}
    </FormItem>
  )}
/>
```

### Form-Level Errors

Displayed at bottom of form:

```typescript
{Object.keys(form.formState.errors).length > 0 && (
  <Card className="border-destructive">
    <CardHeader>
      <CardTitle className="text-destructive">Form Errors</CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="list-disc list-inside space-y-1">
        {Object.entries(form.formState.errors).map(([field, error]) => (
          <li key={field} className="text-sm text-destructive">
            <strong>{field}:</strong> {error.message}
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
)}
```

### API Errors

Handled by mutation:

```typescript
const createVenueMutation = useMutation({
  onError: (error: Error) => {
    toast({
      title: "Error",
      description: error.message || "Failed to create venue",
      variant: "destructive",
    });
  },
});
```

---

✅ **Complete form implementation with exact code for all requirements!**
