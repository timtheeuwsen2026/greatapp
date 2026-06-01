import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Navigation from "@/components/navigation";
import DashboardGuard from "@/components/DashboardGuard";
import RoleSwitcher from "@/components/role-switcher";
import { useAuth } from "@/hooks/useAuth";
import { Calendar, MapPin, Users, Star } from "lucide-react";

function UserDashboardContent() {
  const { user } = useAuth();

  const upcomingExperiences = [
    {
      id: 1,
      title: "Weekend Yoga Retreat",
      date: "March 15-17, 2024",
      location: "Sedona, AZ",
      participants: 12,
      rating: 4.8
    },
    {
      id: 2, 
      title: "Photography Workshop",
      date: "March 22, 2024",
      location: "Golden Gate Park",
      participants: 8,
      rating: 4.9
    }
  ];

  const pastExperiences = [
    {
      id: 3,
      title: "Cooking Class: Italian Cuisine",
      date: "February 28, 2024", 
      location: "San Francisco, CA",
      participants: 6,
      rating: 5.0
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navigation />
      
      <div className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                  Welcome back, {user?.firstName || 'Explorer'}!
                </h1>
                <p className="text-gray-600 dark:text-gray-300 mt-2">
                  Discover amazing experiences and connect with like-minded people
                </p>
              </div>
              
              <RoleSwitcher variant="card" />
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Calendar className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Upcoming</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">2</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Star className="h-8 w-8 text-yellow-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Completed</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">8</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Connections</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">24</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <MapPin className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Cities Visited</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">5</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Upcoming Experiences */}
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Experiences</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {upcomingExperiences.map((experience) => (
                    <div key={experience.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {experience.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {experience.date} • {experience.location}
                        </p>
                        <div className="flex items-center mt-2 space-x-4">
                          <span className="text-xs text-gray-500 flex items-center">
                            <Users className="h-3 w-3 mr-1" />
                            {experience.participants} participants
                          </span>
                          <span className="text-xs text-gray-500 flex items-center">
                            <Star className="h-3 w-3 mr-1" />
                            {experience.rating}
                          </span>
                        </div>
                      </div>
                      <Button size="sm">View Details</Button>
                    </div>
                  ))}
                </div>
                
                <Button className="w-full mt-4" variant="outline">
                  Browse More Experiences
                </Button>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pastExperiences.map((experience) => (
                    <div key={experience.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {experience.title}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {experience.date} • {experience.location}
                        </p>
                        <div className="flex items-center mt-2">
                          <Star className="h-4 w-4 text-yellow-400 mr-1" />
                          <span className="text-sm">Rated {experience.rating}/5</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">Leave Review</Button>
                    </div>
                  ))}
                </div>

                <Button className="w-full mt-4" variant="outline">
                  View All Activity
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="p-6 text-center">
                <Calendar className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Find Experiences
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Discover unique experiences near you
                </p>
                <Button className="w-full">Explore Now</Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
              <CardContent className="p-6 text-center">
                <Users className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Connect & Share
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Join our community of explorers
                </p>
                <Button className="w-full" variant="outline">Join Community</Button>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-violet-100 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-800">
              <CardContent className="p-6 text-center">
                <Star className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Become a Creator
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Share your passion with others
                </p>
                <RoleSwitcher variant="toggle" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserDashboard() {
  return (
    <DashboardGuard requiredRole="participant">
      <UserDashboardContent />
    </DashboardGuard>
  );
}