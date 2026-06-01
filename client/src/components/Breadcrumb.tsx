import { ChevronRight, Home } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export default function Breadcrumb({ items, className }: BreadcrumbProps) {
  // Don't render if no items
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center space-x-2 text-sm", className)}>
      <Link 
        href="/" 
        className="flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
        data-testid="breadcrumb-home"
      >
        <Home className="h-4 w-4" />
        <span className="sr-only">Home</span>
      </Link>
      
      {items.length > 0 && (
        <ChevronRight className="h-4 w-4 text-gray-400" />
      )}
      
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          {item.href && !item.current ? (
            <Link 
              href={item.href}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
              data-testid={`breadcrumb-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {item.label}
            </Link>
          ) : (
            <span 
              className={cn(
                "font-medium",
                item.current ? "text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"
              )}
              data-testid={`breadcrumb-current-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {item.label}
            </span>
          )}
          
          {index < items.length - 1 && (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
        </div>
      ))}
    </nav>
  );
}