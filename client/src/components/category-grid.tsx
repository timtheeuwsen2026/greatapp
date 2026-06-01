import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useState } from "react";

const categories = [
  {
    id: "sports_wellness",
    title: "Sports & Wellness Events",
    subtitle: "workshops, fitness, 1‑day events",
    icon: "fas fa-dumbbell",
    bgColor: "category-sports"
  },
  {
    id: "retreats",
    title: "Retreats",
    subtitle: "multi‑day wellness & spiritual escapes",
    icon: "fas fa-leaf",
    bgColor: "category-retreats"
  },
  {
    id: "adventure_trips",
    title: "Adventure Trips",
    subtitle: "surf, hiking, cycling, outdoor challenges",
    icon: "fas fa-mountain",
    bgColor: "category-adventure"
  },
  {
    id: "community_social",
    title: "Community & Social",
    subtitle: "networking, volunteering, creative meetups",
    icon: "fas fa-users",
    bgColor: "category-community"
  },
  {
    id: "workations",
    title: "Workations", 
    subtitle: "remote work + co‑living + travel",
    icon: "fas fa-laptop",
    bgColor: "category-workations"
  },
  {
    id: "festivals_events",
    title: "Festivals & Special Events",
    subtitle: "seasonal or one‑off trips, marathons, conferences",
    icon: "fas fa-star",
    bgColor: "category-festivals"
  }
];

export default function CategoryGrid() {
  const [, setLocation] = useLocation();
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);

  const handleCategoryClick = async (categoryId: string) => {
    setLoadingCategory(categoryId);
    // Small delay to show loading state
    setTimeout(() => {
      setLocation(`/experiences?category=${categoryId}`);
      setLoadingCategory(null);
    }, 200);
  };

  return (
    <section className="py-12 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="overflow-x-auto">
          <div className="flex justify-center items-center gap-4 min-w-max px-4">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`category-card cursor-pointer group text-center flex-shrink-0 ${
                  loadingCategory === category.id ? 'opacity-50' : ''
                }`}
                onClick={() => handleCategoryClick(category.id)}
                data-testid={`category-${category.id}`}
              >
                <div className={`w-16 h-16 mx-auto mb-3 rounded-xl ${category.bgColor} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  {loadingCategory === category.id ? (
                    <div className="animate-spin w-6 h-6 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <i className={`${category.icon} text-white text-xl`}></i>
                  )}
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1 max-w-[100px]">{category.title}</h3>
                <p className="text-xs text-gray-600 max-w-[100px] line-clamp-2">{category.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
