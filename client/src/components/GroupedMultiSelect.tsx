import { useState, useMemo } from "react";
import { Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface GroupedOption {
  category: string;
  items: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}

interface SelectedItem {
  id: string;
  name: string;
  description?: string;
  custom?: boolean;
  approvedByAdmin?: boolean;
}

interface GroupedMultiSelectProps {
  options: GroupedOption[];
  selected: SelectedItem[];
  onChange: (selected: SelectedItem[]) => void;
  placeholder?: string;
  emptyText?: string;
  allowCustom?: boolean;
  customLabel?: string;
  "data-testid"?: string;
  ariaLabel?: string;
}

export function GroupedMultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  emptyText = "No items found.",
  allowCustom = true,
  customLabel = "Add custom item",
  "data-testid": dataTestId,
  ariaLabel,
}: GroupedMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const allOptions = useMemo(() => {
    return options.flatMap(group => 
      group.items.map(item => ({ ...item, category: group.category }))
    );
  }, [options]);

  const handleSelect = (item: { id: string; name: string; description?: string }) => {
    const isSelected = selected.some(s => s.id === item.id);
    
    if (isSelected) {
      onChange(selected.filter(s => s.id !== item.id));
    } else {
      onChange([...selected, {
        id: item.id,
        name: item.name,
        description: item.description,
        custom: false,
        approvedByAdmin: false,
      }]);
    }
  };

  const handleRemove = (id: string) => {
    onChange(selected.filter(s => s.id !== id));
  };

  const handleAddCustom = () => {
    if (customInput.trim()) {
      const customId = `custom_${Date.now()}_${customInput.toLowerCase().replace(/\s+/g, '_')}`;
      onChange([...selected, {
        id: customId,
        name: customInput.trim(),
        custom: true,
        approvedByAdmin: false,
      }]);
      setCustomInput("");
      setShowCustomInput(false);
    }
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel || placeholder}
            className="w-full justify-between"
            data-testid={dataTestId}
          >
            {selected.length > 0
              ? `${selected.length} selected`
              : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search..."
              aria-label="Search items"
            />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              
              {options.map((group) => (
                <CommandGroup
                  key={group.category}
                  heading={group.category}
                  aria-label={`${group.category} options`}
                >
                  {group.items.map((item) => {
                    const isSelected = selected.some(s => s.id === item.id);
                    return (
                      <CommandItem
                        key={item.id}
                        onSelect={() => handleSelect(item)}
                        data-testid={`option-${item.id}`}
                        aria-label={`${item.name}${item.description ? `: ${item.description}` : ''}`}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="list"
          aria-label="Selected items"
        >
          {selected.map((item) => (
            <Badge
              key={item.id}
              variant={item.custom ? "secondary" : "default"}
              className="gap-1"
              role="listitem"
              data-testid={`chip-${item.id}`}
            >
              {item.name}
              {item.custom && (
                <span className="text-xs opacity-70">(custom)</span>
              )}
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                className="ml-1 hover:text-destructive"
                aria-label={`Remove ${item.name}`}
                data-testid={`remove-${item.id}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {allowCustom && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            {customLabel}
          </label>
          <div className="flex gap-2" role="form" aria-label="Add custom item">
            <Input
              placeholder="Enter custom item name"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              data-testid="custom-input"
              aria-label="Custom item name"
            />
            <Button
              onClick={handleAddCustom}
              size="sm"
              disabled={!customInput.trim()}
              data-testid="confirm-custom"
              aria-label="Add custom item"
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
