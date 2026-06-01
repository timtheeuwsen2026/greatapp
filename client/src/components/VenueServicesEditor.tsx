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
  price?: number;
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
      price: undefined,
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
    
    if (service.price !== undefined && service.price < 0) {
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
                      {!isEditing && service.price !== undefined && (
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
                          Price (USD)
                        </Label>
                        <Input
                          id={`service-price-${service.id}`}
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={service.price ?? ""}
                          key={`price-${service.id}-${service.price}`}
                          onBlur={(e) => {
                            const val = e.target.valueAsNumber;
                            if (e.target.value === "" || isNaN(val)) {
                              updateService(service.id, "price", undefined);
                            } else {
                              // Round to 2 decimal places to match validation
                              const rounded = Math.round(val * 100) / 100;
                              updateService(service.id, "price", rounded);
                            }
                          }}
                          placeholder="0.00 (optional)"
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
