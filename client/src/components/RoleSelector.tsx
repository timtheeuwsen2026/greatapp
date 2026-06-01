import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const roles = [
  { value: "participant", label: "Participant", description: "Browse and join experiences" },
  { value: "creator", label: "Creator", description: "Create and manage experiences" },
  { value: "venue_provider", label: "Venue Provider", description: "List and manage venues" },
  { value: "service_provider", label: "Service Provider", description: "Offer services to experiences" },
  { value: "admin", label: "Admin", description: "Platform administration" }
];

export default function RoleSelector() {
  const [selectedRole, setSelectedRole] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const assignRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      return await apiRequest("POST", "/api/auth/assign-role", { role });
    },
    onSuccess: () => {
      toast({
        title: "Role Updated",
        description: "Your role has been successfully updated!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error) => {
      console.error("Role assignment error:", error);
      toast({
        title: "Error",
        description: "Failed to update role. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAssignRole = () => {
    if (selectedRole) {
      assignRoleMutation.mutate(selectedRole);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto" data-testid="role-selector">
      <CardHeader>
        <CardTitle>Select Your Role</CardTitle>
        <CardDescription>
          Choose your role to access the appropriate dashboard (Development Only)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedRole} onValueChange={setSelectedRole}>
          <SelectTrigger data-testid="role-select">
            <SelectValue placeholder="Choose a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.value} value={role.value} data-testid={`role-option-${role.value}`}>
                <div>
                  <div className="font-medium">{role.label}</div>
                  <div className="text-sm text-muted-foreground">{role.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Button 
          onClick={handleAssignRole} 
          disabled={!selectedRole || assignRoleMutation.isPending}
          className="w-full"
          data-testid="button-assign-role"
        >
          {assignRoleMutation.isPending ? "Updating..." : "Set Role"}
        </Button>
      </CardContent>
    </Card>
  );
}