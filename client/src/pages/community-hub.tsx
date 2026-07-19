import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Users, 
  MessageCircle, 
  Heart, 
  Plus,
  Calendar,
  MapPin,
  Star,
  Clock,
  CheckCircle,
  User,
  Settings,
  BookOpen,
  Send,
  Bell,
  Globe,
  Camera,
  Music,
  Dumbbell,
  Utensils,
  Code,
  Palette,
  Mountain,
  Waves,
  Plane,
  Coffee,
  Brain,
  Briefcase
} from "lucide-react";

export default function CommunityHub() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupCategory, setNewGroupCategory] = useState("general");
  const [newMessage, setNewMessage] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const [activeTab, setActiveTab] = useState(
    ["groups", "chat", "events", "roles", "spotlight"].includes(requestedTab || "")
      ? requestedTab!
      : "groups",
  );

  // Suggest-an-event form state
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventType, setNewEventType] = useState("in-person");
  const [newEventMaxAttendees, setNewEventMaxAttendees] = useState("");

  // Fetch community groups
  const { data: groups = [], isLoading: groupsLoading } = useQuery<any[]>({
    queryKey: ["/api/community/groups"],
    enabled: isAuthenticated,
  });

  // Fetch featured members
  const { data: featuredMembers = [], isLoading: membersLoading } = useQuery<any[]>({
    queryKey: ["/api/community/featured-members"],
    enabled: isAuthenticated,
  });

  // Fetch community events
  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/community/events"],
    enabled: isAuthenticated,
  });

  const { data: roleOpportunities = [], isLoading: rolesLoading } = useQuery<any[]>({
    queryKey: ["/api/community/role-opportunities"],
    enabled: isAuthenticated,
  });

  const applyForRoleMutation = useMutation({
    mutationFn: async ({ experienceId, roleId }: { experienceId: string; roleId: string }) => {
      const response = await apiRequest('POST', `/api/experiences/${experienceId}/role-assignments`, { roleId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/role-opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/participant/role-applications"] });
      toast({
        title: "Application sent",
        description: "A confirmation email is on its way. Track the application under My Gigs in your dashboard.",
      });
    },
    onError: (error: any) => toast({
      title: "Application not sent",
      description: error?.message || "Please try again.",
      variant: "destructive",
    }),
  });

  const { data: participantProfileStatus, isLoading: participantProfileLoading } = useQuery<{ hasProfile: boolean }>({
    queryKey: ["/api/participant-profile/status"],
    enabled: isAuthenticated,
    retry: false,
  });

  // Fetch group messages
  const { data: messages = [], isLoading: messagesLoading } = useQuery<any[]>({
    queryKey: ["/api/community/groups", selectedGroup, "messages"],
    enabled: !!selectedGroup,
  });

  // Create group mutation
  const createGroupMutation = useMutation({
    mutationFn: async (groupData: { name: string; description: string; category: string }) => {
      const response = await apiRequest('POST', '/api/community/groups', groupData);
      if (!response.ok) throw new Error('Failed to create group');
      return response.json();
    },
    onSuccess: (createdGroup) => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups"] });
      const group = createdGroup?.group || createdGroup;
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupCategory("general");
      setSelectedGroup(group?.id || null);
      setActiveTab("chat");
      setCreateGroupOpen(false);
      toast({
        title: "Group created!",
        description: "Your community group has been created successfully.",
      });
    },
    onError: (error: Error) => {
      if (handleCommunityLockError(error)) return;
      toast({
        title: "Error",
        description: "Failed to create group. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { groupId: string; message: string }) => {
      const response = await apiRequest('POST', `/api/community/groups/${messageData.groupId}/messages`, {
        message: messageData.message
      });
      if (!response.ok) throw new Error('Failed to send message');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups", selectedGroup, "messages"] });
      setNewMessage("");
    },
    onError: (error: Error) => {
      if (handleCommunityLockError(error)) return;
      toast({
        title: "Message not sent",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Join group mutation — records real membership so "Join Chat" isn't just a UI-only tab switch
  const joinGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const response = await apiRequest('POST', `/api/community/groups/${groupId}/join`);
      if (!response.ok) throw new Error('Failed to join group');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/groups"] });
    },
    onError: (error: Error) => {
      if (handleCommunityLockError(error)) return;
      toast({
        title: "Couldn't join group",
        description: "Failed to join the group. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleJoinChat = (groupId: string) => {
    joinGroupMutation.mutate(groupId);
    setSelectedGroup(groupId);
    setActiveTab("chat");
  };

  // Create event mutation
  const createEventMutation = useMutation({
    mutationFn: async (eventData: {
      title: string; description: string; date: string; time: string;
      location: string; type: string; maxAttendees?: number;
    }) => {
      const response = await apiRequest('POST', '/api/community/events', eventData);
      if (!response.ok) throw new Error('Failed to create event');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/events"] });
      setNewEventTitle("");
      setNewEventDescription("");
      setNewEventDate("");
      setNewEventTime("");
      setNewEventLocation("");
      setNewEventType("in-person");
      setNewEventMaxAttendees("");
      setCreateEventOpen(false);
      toast({
        title: "Event suggested!",
        description: "Your event has been added to the community calendar.",
      });
    },
    onError: (error: Error) => {
      if (handleCommunityLockError(error)) return;
      toast({
        title: "Error",
        description: "Failed to create event. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Join event mutation
  const joinEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const response = await apiRequest('POST', `/api/community/events/${eventId}/join`);
      if (!response.ok) throw new Error('Failed to join event');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/community/events"] });
      toast({ title: "You're in!", description: "You've joined this event." });
    },
    onError: (error: Error) => {
      if (handleCommunityLockError(error)) return;
      toast({
        title: "Couldn't join event",
        description: "Failed to join the event. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCreateEvent = () => {
    if (!newEventTitle.trim() || !newEventDescription.trim() || !newEventDate || !newEventTime.trim() || !newEventLocation.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields to suggest an event.",
        variant: "destructive",
      });
      return;
    }

    createEventMutation.mutate({
      title: newEventTitle.trim(),
      description: newEventDescription.trim(),
      date: newEventDate,
      time: newEventTime.trim(),
      location: newEventLocation.trim(),
      type: newEventType,
      maxAttendees: newEventMaxAttendees ? Number(newEventMaxAttendees) : undefined,
    });
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim() || !newGroupDescription.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in all fields to create a group.",
        variant: "destructive",
      });
      return;
    }
    
    createGroupMutation.mutate({
      name: newGroupName.trim(),
      description: newGroupDescription.trim(),
      category: newGroupCategory,
    });
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedGroup) return;
    
    sendMessageMutation.mutate({
      groupId: selectedGroup,
      message: newMessage,
    });
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'fitness': return <Dumbbell className="h-4 w-4" />;
      case 'food': return <Utensils className="h-4 w-4" />;
      case 'tech': return <Code className="h-4 w-4" />;
      case 'art': return <Palette className="h-4 w-4" />;
      case 'adventure': return <Mountain className="h-4 w-4" />;
      case 'wellness': return <Waves className="h-4 w-4" />;
      case 'travel': return <Plane className="h-4 w-4" />;
      case 'social': return <Coffee className="h-4 w-4" />;
      case 'learning': return <Brain className="h-4 w-4" />;
      case 'business': return <Briefcase className="h-4 w-4" />;
      case 'photography': return <Camera className="h-4 w-4" />;
      case 'music': return <Music className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      'fitness': 'bg-red-100 text-red-800',
      'food': 'bg-orange-100 text-orange-800',
      'tech': 'bg-blue-100 text-blue-800',
      'art': 'bg-purple-100 text-purple-800',
      'adventure': 'bg-green-100 text-green-800',
      'wellness': 'bg-teal-100 text-teal-800',
      'travel': 'bg-sky-100 text-sky-800',
      'social': 'bg-pink-100 text-pink-800',
      'learning': 'bg-yellow-100 text-yellow-800',
      'business': 'bg-gray-100 text-gray-800',
      'photography': 'bg-indigo-100 text-indigo-800',
      'music': 'bg-rose-100 text-rose-800',
      'general': 'bg-slate-100 text-slate-800',
    };
    return colors[category as keyof typeof colors] || colors.general;
  };

  const redirectToParticipantProfile = () => {
    sessionStorage.setItem("postParticipantOnboardingRedirect", "/community-hub");
    setLocation("/participant-profile-setup");
  };

  const handleCommunityLockError = (error: Error) => {
    const message = error.message || "";
    const needsProfile =
      message.includes("PARTICIPANT_PROFILE_REQUIRED") ||
      message.includes("Complete your profile to unlock the Community Hub") ||
      message.startsWith("403:");

    if (!needsProfile) return false;

    toast({
      title: "Complete your profile first",
      description: "Complete your profile to unlock the Community Hub and join the Tribe Chat.",
      variant: "destructive",
    });
    redirectToParticipantProfile();
    return true;
  };

  if (!isAuthenticated && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <Users className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Join the Community</h2>
            <p className="text-gray-600 mb-4">
              Sign in to access the community hub and connect with fellow travelers.
            </p>
            <Button onClick={() => window.location.href = '/api/login'} className="w-full">
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const participantProfileMissing = participantProfileStatus?.hasProfile === false;

  if (participantProfileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (participantProfileMissing) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <Navigation />
        <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <MessageCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-2xl font-semibold mb-3">Participant Onboarding</h2>
              <p className="text-gray-600 mb-6">
                Complete your profile to unlock the Community Hub and join the Tribe Chat.
              </p>
              <Button
                onClick={() => {
                  redirectToParticipantProfile();
                }}
                className="w-full"
                data-testid="button-complete-participant-profile"
              >
                Complete Profile
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Navigation />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-gray-900">Community Hub</h1>
              <p className="text-gray-600">Connect, share, and grow together</p>
            </div>
            <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => setLocation('/community')}>
                <User className="w-4 h-4 mr-2" />
                Browse Members
              </Button>
              <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Group
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create a Community Group</DialogTitle>
                    <DialogDescription>
                      Start a group around shared interests, skills, or experiences.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Group Name</label>
                      <Input
                        placeholder="e.g., Digital Nomad Photographers"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        placeholder="What's this group about?"
                        value={newGroupDescription}
                        onChange={(e) => setNewGroupDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Category</label>
                      <select
                        value={newGroupCategory}
                        onChange={(e) => setNewGroupCategory(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="general">General</option>
                        <option value="fitness">Fitness & Health</option>
                        <option value="food">Food & Culinary</option>
                        <option value="tech">Technology</option>
                        <option value="art">Art & Creativity</option>
                        <option value="adventure">Adventure Sports</option>
                        <option value="wellness">Wellness & Mindfulness</option>
                        <option value="travel">Travel & Exploration</option>
                        <option value="social">Social & Networking</option>
                        <option value="learning">Learning & Education</option>
                        <option value="business">Business & Entrepreneurship</option>
                        <option value="photography">Photography</option>
                        <option value="music">Music & Arts</option>
                      </select>
                    </div>
                    <Button 
                      onClick={handleCreateGroup}
                      disabled={createGroupMutation.isPending}
                      className="w-full"
                    >
                      {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5">
            <TabsTrigger value="groups" className="flex min-w-0 items-center justify-center gap-2 py-2">
              <Users className="h-4 w-4" />
              Groups
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex min-w-0 items-center justify-center gap-2 py-2">
              <MessageCircle className="h-4 w-4" />
              Group Chat
            </TabsTrigger>
            <TabsTrigger value="events" className="flex min-w-0 items-center justify-center gap-2 py-2">
              <Calendar className="h-4 w-4" />
              Events
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex min-w-0 items-center justify-center gap-2 py-2">
              <Briefcase className="h-4 w-4" />
              Roles & Gigs
            </TabsTrigger>
            <TabsTrigger value="spotlight" className="flex min-w-0 items-center justify-center gap-2 py-2">
              <Star className="h-4 w-4" />
              Member Spotlight
            </TabsTrigger>
          </TabsList>

          <TabsContent value="groups" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-full mb-4"></div>
                      <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    </CardContent>
                  </Card>
                ))
              ) : groups.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="text-center py-12">
                    <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No groups yet</h3>
                    <p className="text-gray-600 mb-4">Be the first to create a community group!</p>
                  </CardContent>
                </Card>
              ) : (
                groups.map((group: any) => (
                  <Card key={group.id} className="hover:shadow-lg transition-all duration-200 cursor-pointer">
                    <CardContent className="p-6">
                      <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {getCategoryIcon(group.category)}
                          <h3 className="min-w-0 break-words text-lg font-semibold">{group.name}</h3>
                        </div>
                        <Badge className={getCategoryColor(group.category)}>
                          {group.category}
                        </Badge>
                      </div>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                        {group.description}
                      </p>
                      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {group.memberCount || 0} members
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {group.messageCount || 0} messages
                          </span>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleJoinChat(group.id)}
                          className="w-full sm:ml-auto sm:w-auto"
                        >
                          Join Chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="chat" className="space-y-6">
            {!selectedGroup ? (
              <Card>
                <CardContent className="text-center py-12">
                  <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Select a group to chat</h3>
                  <p className="text-gray-600">Choose a group from the Groups tab to start chatting.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Group List Sidebar */}
                <Card className="lg:col-span-1">
                  <CardHeader>
                    <CardTitle className="text-sm">Your Groups</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3">
                    <div className="space-y-2">
                      {groups.map((group: any) => (
                        <button
                          key={group.id}
                          onClick={() => handleJoinChat(group.id)}
                          className={`w-full text-left p-3 rounded-lg transition-all ${
                            selectedGroup === group.id ? 'bg-primary text-white' : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {getCategoryIcon(group.category)}
                            <span className="font-medium text-sm truncate">{group.name}</span>
                          </div>
                          <p className="text-xs opacity-75 truncate">{group.description}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Chat Area */}
                <Card className="lg:col-span-3">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {getCategoryIcon(groups.find((g: any) => g.id === selectedGroup)?.category)}
                      {groups.find((g: any) => g.id === selectedGroup)?.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-96 w-full p-4 border rounded-lg mb-4">
                      {messagesLoading ? (
                        <div className="flex items-center justify-center h-32">
                          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                          <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No messages yet. Start the conversation!</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {messages.map((message: any) => (
                            <div key={message.id} className="flex items-start space-x-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={message.user?.profileImageUrl} />
                                <AvatarFallback>
                                  {message.user?.firstName?.[0]}{message.user?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-medium">
                                    {message.user?.firstName} {message.user?.lastName}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {new Date(message.createdAt).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-700 mt-1">{message.content}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </ScrollArea>

                    <div className="flex space-x-2">
                      <Input
                        placeholder="Type your message..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                        className="flex-1"
                      />
                      <Button 
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || sendMessageMutation.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <div className="flex justify-end">
              <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-open-suggest-event">
                    <Plus className="h-4 w-4 mr-2" />
                    Suggest an Event
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Suggest a Community Event</DialogTitle>
                    <DialogDescription>
                      Propose a meetup for the community — virtual, in-person, or hybrid.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Event Title</label>
                      <Input
                        placeholder="e.g., Sunset Beach Run"
                        value={newEventTitle}
                        onChange={(e) => setNewEventTitle(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <Textarea
                        placeholder="What's this event about?"
                        value={newEventDescription}
                        onChange={(e) => setNewEventDescription(e.target.value)}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium">Date</label>
                        <Input
                          type="date"
                          value={newEventDate}
                          onChange={(e) => setNewEventDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Time</label>
                        <Input
                          placeholder="e.g., 6:00 PM"
                          value={newEventTime}
                          onChange={(e) => setNewEventTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Location</label>
                      <Input
                        placeholder="e.g., Barceloneta Beach or Zoom link"
                        value={newEventLocation}
                        onChange={(e) => setNewEventLocation(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Format</label>
                      <select
                        value={newEventType}
                        onChange={(e) => setNewEventType(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="in-person">In-person</option>
                        <option value="virtual">Virtual</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Max Attendees (optional)</label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="e.g., 20"
                        value={newEventMaxAttendees}
                        onChange={(e) => setNewEventMaxAttendees(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleCreateEvent}
                      disabled={createEventMutation.isPending}
                      className="w-full"
                      data-testid="button-submit-suggest-event"
                    >
                      {createEventMutation.isPending ? 'Submitting...' : 'Suggest Event'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {eventsLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-full mb-4"></div>
                      <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    </CardContent>
                  </Card>
                ))
              ) : events.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="text-center py-12">
                    <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No upcoming events</h3>
                    <p className="text-gray-600 mb-4">Community events will appear here when scheduled.</p>
                  </CardContent>
                </Card>
              ) : (
                events.map((event: any) => {
                  const isFull = !!event.maxAttendees && (event.attendeeCount || 0) >= event.maxAttendees;
                  return (
                    <Card key={event.id} className="hover:shadow-lg transition-all duration-200">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-semibold text-lg">{event.title}</h3>
                          <Badge variant="outline">
                            {event.type}
                          </Badge>
                        </div>
                        <p className="text-gray-600 text-sm mb-4">{event.description}</p>
                        <div className="space-y-2 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(event.date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3" />
                            <span>{event.time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3" />
                            <span>{event.location}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-3 w-3" />
                            <span>
                              {event.attendeeCount || 0}{event.maxAttendees ? ` / ${event.maxAttendees}` : ''} attending
                            </span>
                          </div>
                        </div>
                        <Button
                          className="w-full mt-4"
                          size="sm"
                          disabled={isFull || joinEventMutation.isPending}
                          onClick={() => joinEventMutation.mutate(event.id)}
                          data-testid={`button-join-event-${event.id}`}
                        >
                          {isFull ? 'Event Full' : 'Join Event'}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </TabsContent>

          <TabsContent value="roles" className="space-y-6">
            {rolesLoading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index} className="animate-pulse"><CardContent className="h-56 p-6" /></Card>
                ))}
              </div>
            ) : roleOpportunities.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Briefcase className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                  <h3 className="mb-2 text-lg font-medium">No open roles yet</h3>
                  <p className="text-gray-600">Creator roles and event gigs will appear here when available.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {roleOpportunities.map((row: any) => {
                  const role = row.role || {};
                  const experience = row.experience || {};
                  const assignmentStatus = row.assignment?.status === "applied" ? "pending" : row.assignment?.status;
                  const isFull = (role.currentCount || 0) >= (role.maxCount || 1);
                  const isOwnExperience = experience.creatorId === user?.id;
                  return (
                    <Card key={role.id} className="border-gray-200">
                      <CardContent className="flex h-full flex-col p-5">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="mb-1 text-xs font-medium text-primary">{experience.title}</p>
                            <h3 className="break-words text-lg font-semibold">{role.name}</h3>
                          </div>
                          <Badge variant={isFull ? "secondary" : "outline"}>
                            {role.currentCount || 0}/{role.maxCount || 1} filled
                          </Badge>
                        </div>

                        {role.description && <p className="mb-3 text-sm text-gray-600">{role.description}</p>}
                        {Array.isArray(role.requirements) && role.requirements.length > 0 && (
                          <div className="mb-4 flex flex-wrap gap-1">
                            {role.requirements.map((requirement: string) => (
                              <Badge key={requirement} variant="secondary" className="text-xs">{requirement}</Badge>
                            ))}
                          </div>
                        )}

                        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/experience/${experience.slug || experience.id}`)}
                          >
                            <BookOpen className="mr-1 h-4 w-4" />Details
                          </Button>
                          <Button
                            size="sm"
                            disabled={isOwnExperience || isFull || assignmentStatus === "pending" || assignmentStatus === "confirmed" || applyForRoleMutation.isPending}
                            onClick={() => applyForRoleMutation.mutate({ experienceId: experience.id, roleId: role.id })}
                            data-testid={`button-community-apply-role-${role.id}`}
                          >
                            {isOwnExperience
                              ? "Your Event"
                              : assignmentStatus === "confirmed"
                                ? "Confirmed"
                                : assignmentStatus === "pending"
                                  ? "Pending"
                                  : isFull
                                    ? "Role Full"
                                    : applyForRoleMutation.isPending ? "Applying..." : "Apply"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="spotlight" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {membersLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="animate-pulse">
                    <CardContent className="p-6">
                      <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4"></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto mb-2"></div>
                      <div className="h-3 bg-gray-200 rounded w-full mb-4"></div>
                    </CardContent>
                  </Card>
                ))
              ) : featuredMembers.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="text-center py-12">
                    <Star className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No featured members yet</h3>
                    <p className="text-gray-600">Community stars will be featured here.</p>
                  </CardContent>
                </Card>
              ) : (
                featuredMembers.map((member: any) => (
                  <Card key={member.id} className="text-center hover:shadow-lg transition-all duration-200">
                    <CardContent className="p-6">
                      <Avatar className="w-16 h-16 mx-auto mb-4">
                        <AvatarImage src={member.avatarUrl} />
                        <AvatarFallback>
                          {member.displayName?.[0] || <User className="h-6 w-6" />}
                        </AvatarFallback>
                      </Avatar>
                      <h3 className="font-semibold text-lg mb-1">{member.displayName}</h3>
                      <p className="text-sm text-gray-600 mb-3">{member.occupation}</p>
                      <p className="text-xs text-gray-500 mb-4">{member.bio}</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button
                          className="min-w-0 flex-1 sm:flex-none"
                          size="sm"
                          variant="outline"
                          onClick={() => toast({
                            title: "Coming soon",
                            description: "Direct messaging isn't available yet — view their profile for now.",
                          })}
                          data-testid={`button-message-member-${member.userId}`}
                        >
                          <MessageCircle className="h-3 w-3 mr-1" />
                          Message
                        </Button>
                        <Button
                          className="min-w-0 flex-1 sm:flex-none"
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/community/profile/${member.userId}`)}
                          data-testid={`button-view-profile-${member.userId}`}
                        >
                          <User className="h-3 w-3 mr-1" />
                          View Profile
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
