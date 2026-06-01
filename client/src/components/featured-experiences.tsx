import { useQuery } from "@tanstack/react-query";
import ExperienceCard from "@/components/experience-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function FeaturedExperiences() {
  const { data: experiences, isLoading, error } = useQuery({
    queryKey: ["/api/experiences"],
    queryFn: async () => {
      const response = await fetch("/api/experiences?status=approved&limit=6");
      if (!response.ok) {
        throw new Error("Failed to fetch experiences");
      }
      return response.json();
    },
  });

  if (error) {
    return (
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-red-600">Failed to load experiences. Please try again later.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          {/* Display experiences directly without heading */}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            // Loading skeletons
            [...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                <Skeleton className="w-full h-48" />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                  <Skeleton className="h-6 w-full mb-2" />
                  <Skeleton className="h-16 w-full mb-4" />
                  <div className="flex items-center justify-between mb-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-20 w-full mb-4" />
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-10 w-28" />
                  </div>
                </div>
              </div>
            ))
          ) : experiences && experiences.length > 0 ? (
            experiences.slice(0, 6).map((experience: any) => (
              <ExperienceCard key={experience.id} experience={experience} />
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-600 text-lg">No experiences available at the moment.</p>
              <p className="text-gray-500">Check back soon for amazing new adventures!</p>
            </div>
          )}
        </div>
        
        {experiences && experiences.length > 0 && (
          <div className="text-center mt-12">
            <Button size="lg" className="btn-gradient">
              View All Experiences
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
