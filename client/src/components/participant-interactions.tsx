import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  Textarea,
} from "@/components/ui/textarea";
import {
  Badge,
} from "@/components/ui/badge";
import {
  ScrollArea,
} from "@/components/ui/scroll-area";
import {
  Separator,
} from "@/components/ui/separator";
import {
  MessageCircle,
  Users,
  Heart,
  ThumbsUp,
  Smile,
  User,
  Send,
  UserPlus,
  Bell,
  Clock,
  MapPin,
  Globe,
  Star,
} from "lucide-react";

interface ParticipantInteractionsProps {
  experienceId: string;
  isCreator?: boolean;
}

interface Message {
  id: string;
  userId: string;
  message: string;
  messageType: "text" | "image" | "announcement";
  isPrivate: boolean;
  recipientId?: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string;
  };
  reactions?: Reaction[];
}

interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  reactionType: "like" | "love" | "laugh" | "wow" | "sad" | "angry";
  createdAt: string;
}

interface ParticipantProfile {
  id: string;
  userId: string;
  displayName?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  interests?: string[];
  travelStyle?: string[];
  languages?: string[];
  experienceLevel?: string | null;
  fitnessLevel?: string | null;
  occupation?: string | null;
  skills?: string[];
  rolePreferences?: string[];
  profileVisibility?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

interface Announcement {
  id: string;
  experienceId: string;
  creatorId: string;
  title: string;
  content: string;
  priority: "low" | "medium" | "high" | "urgent";
  isImportant: boolean;
  createdAt: string;
  creator: {
    firstName: string;
    lastName: string;
  };
}

export function ParticipantInteractions({ experienceId, isCreator = false }: ParticipantInteractionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [newAnnouncement, setNewAnnouncement] = useState({ title: "", content: "", priority: "medium" });
  const [activeTab, setActiveTab] = useState("chat");
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantProfile | null>(null);

  // Fetch messages
  const { data: messages = [], isLoading: messagesLoading, error: messagesError } = useQuery<Message[]>({
    queryKey: ["/api/experiences", experienceId, "messages"],
    enabled: !!experienceId,
  });
  const chatRequiresBooking =
    messagesError instanceof Error &&
    (messagesError.message.includes("403") || messagesError.message.includes("valid booking"));

  // Fetch participants
  const { data: participants = [], isLoading: participantsLoading } = useQuery<ParticipantProfile[]>({
    queryKey: ["/api/experiences", experienceId, "participants"],
    enabled: !!experienceId,
  });

  // Fetch announcements
  const { data: announcements = [], isLoading: announcementsLoading } = useQuery<Announcement[]>({
    queryKey: ["/api/experiences", experienceId, "announcements"],
    enabled: !!experienceId,
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageData: { message: string; messageType?: string; isPrivate?: boolean; recipientId?: string }) => {
      return apiRequest("POST", `/api/experiences/${experienceId}/messages`, messageData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experienceId, "messages"] });
      setNewMessage("");
      toast({
        title: "Message sent",
        description: "Your message has been posted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Create announcement mutation
  const createAnnouncementMutation = useMutation({
    mutationFn: async (announcementData: { title: string; content: string; priority: string; isImportant?: boolean }) => {
      return apiRequest("POST", `/api/experiences/${experienceId}/announcements`, announcementData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experienceId, "announcements"] });
      setNewAnnouncement({ title: "", content: "", priority: "medium" });
      toast({
        title: "Announcement created",
        description: "Your announcement has been posted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to create announcement. Please try again.",
        variant: "destructive",
      });
    },
  });

  // React to message mutation
  const reactToMessageMutation = useMutation({
    mutationFn: async ({ messageId, reactionType }: { messageId: string; reactionType: string }) => {
      return apiRequest("POST", `/api/messages/${messageId}/reactions`, { reactionType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/experiences", experienceId, "messages"] });
    },
  });

  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    
    sendMessageMutation.mutate({
      message: newMessage,
      messageType: "text",
      isPrivate: false,
    });
  };

  const handleCreateAnnouncement = () => {
    if (!newAnnouncement.title.trim() || !newAnnouncement.content.trim()) return;
    
    createAnnouncementMutation.mutate({
      ...newAnnouncement,
      isImportant: newAnnouncement.priority === "urgent",
    });
  };

  const handleReaction = (messageId: string, reactionType: string) => {
    reactToMessageMutation.mutate({ messageId, reactionType });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit",
      hour12: true 
    });
  };

  const getReactionIcon = (type: string) => {
    switch (type) {
      case "like": return "👍";
      case "love": return "❤️";
      case "laugh": return "😂";
      case "wow": return "😮";
      case "sad": return "😢";
      case "angry": return "😠";
      default: return "👍";
    }
  };

  const getTravelStyleIcon = (style?: string) => {
    switch (style) {
      case "adventurous": return "🏔️";
      case "relaxed": return "🏖️";
      case "cultural": return "🏛️";
      case "social": return "🎉";
      case "solo": return "🚶";
      default: return "✈️";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "destructive";
      case "high": return "destructive";
      case "medium": return "default";
      case "low": return "secondary";
      default: return "default";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Community Hub
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="participants" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              People
            </TabsTrigger>
            <TabsTrigger value="announcements" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Updates
            </TabsTrigger>
            {isCreator && (
              <TabsTrigger value="manage" className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Manage
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="chat" className="space-y-4">
            <ScrollArea className="h-96 w-full p-4 border rounded-lg">
              {messagesLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              ) : chatRequiresBooking ? (
                <div className="flex h-72 flex-col items-center justify-center px-6 text-center text-gray-600">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 text-primary opacity-70" />
                  <p className="font-semibold text-gray-900">Join this experience to view the chat</p>
                  <p className="mt-2 max-w-sm text-sm">
                    The community conversation is private to confirmed participants. Reserve your spot to meet the squad and start chatting.
                  </p>
                  <Button className="mt-5" onClick={() => { window.location.href = `/checkout/${experienceId}`; }}>
                    Join the Experience
                  </Button>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
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
                            {formatTime(message.createdAt)}
                          </span>
                          {message.messageType === "announcement" && (
                            <Badge variant="secondary" className="text-xs">
                              <Bell className="h-3 w-3 mr-1" />
                              Announcement
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{message.message}</p>
                        
                        {/* Reactions */}
                        <div className="flex items-center space-x-2 mt-2">
                          <div className="flex space-x-1">
                            {["like", "love", "laugh"].map((type) => (
                              <button
                                key={type}
                                onClick={() => handleReaction(message.id, type)}
                                className="text-xs hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                              >
                                {getReactionIcon(type)}
                              </button>
                            ))}
                          </div>
                          {message.reactions && message.reactions.length > 0 && (
                            <div className="flex space-x-1">
                              {message.reactions.map((reaction) => (
                                <span key={reaction.id} className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {getReactionIcon(reaction.reactionType)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Message input */}
            {!chatRequiresBooking && <div className="flex space-x-2">
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
            </div>}
          </TabsContent>

          <TabsContent value="participants" className="space-y-4">
            {participantsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : participants.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No participants yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {participants.map((participant) => {
                  const name = participant.displayName ||
                    `${participant.user?.firstName ?? ''} ${participant.user?.lastName ?? ''}`.trim() ||
                    'Explorer';
                  const avatar = participant.avatarUrl || participant.user?.profileImageUrl;
                  const initials = [participant.user?.firstName?.[0], participant.user?.lastName?.[0]].filter(Boolean).join('') || name[0]?.toUpperCase();
                  return (
                    <Card
                      key={participant.id}
                      className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedParticipant(participant)}
                    >
                      <div className="flex items-start space-x-3">
                        <Avatar className="h-10 w-10 shrink-0">
                          <AvatarImage src={avatar ?? undefined} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-medium truncate">{name}</h4>
                            {(participant.travelStyle ?? []).length > 0 && (
                              <span className="text-lg ml-2 shrink-0">
                                {getTravelStyleIcon((participant.travelStyle ?? [])[0])}
                              </span>
                            )}
                          </div>

                          {participant.location && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3" />{participant.location}
                            </p>
                          )}

                          {participant.bio && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">{participant.bio}</p>
                          )}

                          <div className="flex flex-wrap gap-1 mt-2">
                            {participant.experienceLevel && (
                              <Badge variant="outline" className="text-xs">{participant.experienceLevel}</Badge>
                            )}
                            {(participant.languages ?? []).slice(0, 2).map((lang) => (
                              <Badge key={lang} variant="secondary" className="text-xs">
                                <Globe className="h-3 w-3 mr-1" />{lang}
                              </Badge>
                            ))}
                          </div>

                          {(participant.interests ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {(participant.interests ?? []).slice(0, 3).map((interest) => (
                                <span key={interest} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  {interest}
                                </span>
                              ))}
                            </div>
                          )}

                          <p className="text-xs text-primary mt-2">Tap to view full profile →</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Profile detail dialog */}
            <Dialog open={!!selectedParticipant} onOpenChange={(open) => !open && setSelectedParticipant(null)}>
              <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                {selectedParticipant && (() => {
                  const p = selectedParticipant;
                  const name = p.displayName || `${p.user?.firstName ?? ''} ${p.user?.lastName ?? ''}`.trim() || 'Explorer';
                  const avatar = p.avatarUrl || p.user?.profileImageUrl;
                  const initials = [p.user?.firstName?.[0], p.user?.lastName?.[0]].filter(Boolean).join('') || name[0]?.toUpperCase();
                  return (
                    <>
                      <DialogHeader>
                        <div className="flex items-center gap-4">
                          <Avatar className="h-16 w-16">
                            <AvatarImage src={avatar ?? undefined} />
                            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <DialogTitle className="text-xl">{name}</DialogTitle>
                            {p.location && (
                              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                <MapPin className="h-3 w-3" />{p.location}
                              </p>
                            )}
                            {p.occupation && (
                              <p className="text-sm text-gray-600 mt-0.5">{p.occupation}</p>
                            )}
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="space-y-4 mt-2">
                        {p.bio && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">About</p>
                            <p className="text-sm text-gray-700">{p.bio}</p>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {p.experienceLevel && (
                            <Badge variant="outline">{p.experienceLevel}</Badge>
                          )}
                          {p.fitnessLevel && (
                            <Badge variant="outline">{p.fitnessLevel}</Badge>
                          )}
                          {(p.travelStyle ?? []).map((s) => (
                            <Badge key={s} variant="secondary">
                              {getTravelStyleIcon(s)} {s}
                            </Badge>
                          ))}
                        </div>

                        {(p.interests ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Interests</p>
                            <div className="flex flex-wrap gap-1">
                              {(p.interests ?? []).map((interest) => (
                                <span key={interest} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  {interest}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {(p.skills ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Skills</p>
                            <div className="flex flex-wrap gap-1">
                              {(p.skills ?? []).map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {(p.languages ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Languages</p>
                            <div className="flex flex-wrap gap-1">
                              {(p.languages ?? []).map((lang) => (
                                <Badge key={lang} variant="outline" className="text-xs">
                                  <Globe className="h-3 w-3 mr-1" />{lang}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {(p.rolePreferences ?? []).length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Open To Roles</p>
                            <div className="flex flex-wrap gap-1">
                              {(p.rolePreferences ?? []).map((r) => (
                                <Badge key={r} className="text-xs">{r}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="announcements" className="space-y-4">
            {announcementsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : announcements.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No announcements yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map((announcement) => (
                  <Card key={announcement.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge variant={getPriorityColor(announcement.priority)}>
                            {announcement.priority.toUpperCase()}
                          </Badge>
                          {announcement.isImportant && (
                            <Badge variant="destructive">
                              IMPORTANT
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-lg font-semibold mb-2">{announcement.title}</h4>
                        <p className="text-gray-700 mb-3">{announcement.content}</p>
                        <div className="flex items-center text-xs text-gray-500">
                          <Clock className="h-3 w-3 mr-1" />
                          Posted by {announcement.creator.firstName} {announcement.creator.lastName} • {formatTime(announcement.createdAt)}
                        </div>
                      </div>
                      <Bell className="h-5 w-5 text-gray-400" />
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {isCreator && (
            <TabsContent value="manage" className="space-y-4">
              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-4">Create Announcement</h3>
                <div className="space-y-4">
                  <Input
                    placeholder="Announcement title..."
                    value={newAnnouncement.title}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                  />
                  <Textarea
                    placeholder="Announcement content..."
                    value={newAnnouncement.content}
                    onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                    rows={4}
                  />
                  <div className="flex items-center justify-between">
                    <select
                      value={newAnnouncement.priority}
                      onChange={(e) => setNewAnnouncement({ ...newAnnouncement, priority: e.target.value })}
                      className="px-3 py-2 border rounded-lg"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <Button 
                      onClick={handleCreateAnnouncement}
                      disabled={!newAnnouncement.title.trim() || !newAnnouncement.content.trim() || createAnnouncementMutation.isPending}
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Post Announcement
                    </Button>
                  </div>
                </div>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
