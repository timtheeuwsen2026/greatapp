import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { STANDARD_ROLES } from "@shared/constants";
import { cn } from "@/lib/utils";

export interface Role {
  name: string;
  required: boolean;
  headcount: number;
  rate?: number;
  notes?: string;
}

interface RolesEditorProps {
  roles: Role[];
  onChange: (roles: Role[]) => void;
  className?: string;
}

export function RolesEditor({ roles, onChange, className }: RolesEditorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [customRoleName, setCustomRoleName] = useState("");

  const selectedRoleNames = roles.map((r) => r.name);
  const availableStandardRoles = STANDARD_ROLES.filter(
    (role) => !selectedRoleNames.includes(role)
  );

  const addRole = (roleName: string) => {
    if (!roleName.trim()) return;
    
    const newRole: Role = {
      name: roleName.trim(),
      required: false,
      headcount: 1,
      rate: undefined,
      notes: "",
    };
    
    onChange([...roles, newRole]);
  };

  const addStandardRole = (roleName: string) => {
    addRole(roleName);
  };

  const addCustomRole = () => {
    if (customRoleName.trim() && !selectedRoleNames.includes(customRoleName.trim())) {
      addRole(customRoleName);
      setCustomRoleName("");
    }
  };

  const removeRole = (index: number) => {
    onChange(roles.filter((_, i) => i !== index));
  };

  const updateRole = (index: number, field: keyof Role, value: any) => {
    const updatedRoles = [...roles];
    updatedRoles[index] = { ...updatedRoles[index], [field]: value };
    onChange(updatedRoles);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Multi-Select Dropdown */}
      <div className="space-y-3">
        <Label>Select Roles</Label>
        <div className="relative">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            data-testid="button-roles-dropdown"
          >
            <span className="text-muted-foreground">
              {availableStandardRoles.length > 0
                ? "Choose from standard roles..."
                : "All standard roles selected"}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
          
          {isDropdownOpen && availableStandardRoles.length > 0 && (
            <Card className="absolute z-50 w-full mt-2 max-h-72 overflow-y-auto">
              <div className="p-2 space-y-1">
                {availableStandardRoles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      addStandardRole(role);
                      setIsDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors"
                    data-testid={`option-role-${role.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
        
        {/* Selected roles badges */}
        {selectedRoleNames.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedRoleNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Editable Table */}
      {roles.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Role Name</TableHead>
                <TableHead className="w-[100px] text-center">Required?</TableHead>
                <TableHead className="w-[120px]">Headcount</TableHead>
                <TableHead className="w-[140px]">Rate (Optional)</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role, index) => (
                <TableRow key={index} data-testid={`role-row-${index}`}>
                  {/* Role Name */}
                  <TableCell>
                    <Input
                      value={role.name}
                      onChange={(e) => updateRole(index, "name", e.target.value)}
                      placeholder="Role name"
                      data-testid={`input-role-name-${index}`}
                    />
                  </TableCell>
                  
                  {/* Required Checkbox */}
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={role.required}
                        onCheckedChange={(checked) =>
                          updateRole(index, "required", checked === true)
                        }
                        data-testid={`checkbox-role-required-${index}`}
                      />
                    </div>
                  </TableCell>
                  
                  {/* Headcount */}
                  <TableCell>
                    <Input
                      type="number"
                      min="1"
                      value={role.headcount}
                      onChange={(e) =>
                        updateRole(index, "headcount", parseInt(e.target.value) || 1)
                      }
                      placeholder="1"
                      data-testid={`input-role-headcount-${index}`}
                    />
                  </TableCell>
                  
                  {/* Rate */}
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={role.rate ?? ""}
                      onChange={(e) =>
                        updateRole(
                          index,
                          "rate",
                          e.target.value ? parseFloat(e.target.value) : undefined
                        )
                      }
                      placeholder="0.00"
                      data-testid={`input-role-rate-${index}`}
                    />
                  </TableCell>
                  
                  {/* Notes */}
                  <TableCell>
                    <Textarea
                      value={role.notes ?? ""}
                      onChange={(e) => updateRole(index, "notes", e.target.value)}
                      placeholder="Additional notes..."
                      rows={2}
                      className="min-w-[200px]"
                      data-testid={`textarea-role-notes-${index}`}
                    />
                  </TableCell>
                  
                  {/* Delete Button */}
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRole(index)}
                      data-testid={`button-remove-role-${index}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Manual Role */}
      <div className="space-y-3 pt-4 border-t">
        <Label>Add manual role</Label>
        <div className="flex gap-2">
          <Input
            value={customRoleName}
            onChange={(e) => setCustomRoleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomRole();
              }
            }}
            placeholder="Enter role name..."
            className="flex-1"
            data-testid="input-custom-role-name"
          />
          <Button
            type="button"
            onClick={addCustomRole}
            disabled={
              !customRoleName.trim() ||
              selectedRoleNames.includes(customRoleName.trim())
            }
            data-testid="button-add-custom-role"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Role
          </Button>
        </div>
      </div>

      {/* Guidelines */}
      {roles.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No roles added yet.</p>
          <p className="text-sm">
            Select from standard roles above or add a custom role.
          </p>
        </div>
      )}
    </div>
  );
}
