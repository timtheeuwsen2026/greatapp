import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MapPin, Star, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';

interface CreatorProfileCardProps {
  creator: {
    id: string;
    displayName?: string;
    businessName?: string;
    bio?: string;
    avatarUrl?: string;
    baseLocation?: string;
    expertise?: string[];
    experienceLevel?: string;
    isVerified?: boolean;
    averageRating?: number;
    totalExperiences?: number;
    socialLink?: string | null;
  };
  variant?: 'compact' | 'full';
}

export default function CreatorProfileCard({ creator, variant = 'compact' }: CreatorProfileCardProps) {
  const displayName = creator.displayName || creator.businessName || 'Creator';
  const socialLink = creator.socialLink
    ? (/^https?:\/\//i.test(creator.socialLink) ? creator.socialLink : `https://${creator.socialLink}`)
    : null;
  const truncatedBio = creator.bio ? 
    (creator.bio.length > 100 ? creator.bio.substring(0, 100) + '...' : creator.bio) : 
    'Passionate experience creator dedicated to building meaningful connections.';

  if (variant === 'compact') {
    return (
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16 flex-shrink-0">
              <AvatarImage src={creator.avatarUrl} alt={displayName} />
              <AvatarFallback className="text-lg font-semibold">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg truncate">{displayName}</h3>
                {creator.isVerified && (
                  <Badge variant="secondary" className="text-primary bg-primary/10 text-xs">
                    Verified
                  </Badge>
                )}
              </div>
              
              {creator.baseLocation && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                  <MapPin className="h-3 w-3" />
                  <span>{creator.baseLocation}</span>
                </div>
              )}
              
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                {truncatedBio}
              </p>
              
              {creator.expertise && creator.expertise.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {creator.expertise.slice(0, 3).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                  {creator.expertise.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{creator.expertise.length - 3} more
                    </Badge>
                  )}
                </div>
              )}
              
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {creator.averageRating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span>{creator.averageRating.toFixed(1)}</span>
                    </div>
                  )}
                  {creator.totalExperiences && (
                    <span>{creator.totalExperiences} experiences</span>
                  )}
                </div>

                {socialLink ? (
                  <a
                    href={socialLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primary/80 text-sm font-medium"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Social link
                  </a>
                ) : (
                  <Link href={`/creator/${creator.id}`} className="text-primary hover:text-primary/80 text-sm font-medium">
                    View Profile
                  </Link>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full variant for dedicated creator profile pages
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <Avatar className="h-32 w-32 mx-auto md:mx-0 flex-shrink-0">
            <AvatarImage src={creator.avatarUrl} alt={displayName} />
            <AvatarFallback className="text-2xl font-semibold">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-2 mb-3">
              <h1 className="text-3xl font-bold">{displayName}</h1>
              {creator.isVerified && (
                <Badge variant="secondary" className="text-primary bg-primary/10 w-fit mx-auto md:mx-0">
                  Verified Creator
                </Badge>
              )}
            </div>
            
            {creator.baseLocation && (
              <div className="flex items-center justify-center md:justify-start gap-1 text-muted-foreground mb-4">
                <MapPin className="h-4 w-4" />
                <span>{creator.baseLocation}</span>
              </div>
            )}
            
            <p className="text-gray-600 mb-4 max-w-2xl">
              {creator.bio || 'Passionate experience creator dedicated to building meaningful connections and unforgettable adventures.'}
            </p>

            {socialLink && (
              <a
                href={socialLink}
                target="_blank"
                rel="noreferrer"
                className="mb-4 inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium"
              >
                <ExternalLink className="h-4 w-4" />
                Social link
              </a>
            )}
            
            {creator.expertise && creator.expertise.length > 0 && (
              <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                {creator.expertise.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            )}
            
            <div className="flex items-center justify-center md:justify-start gap-6 text-sm">
              {creator.averageRating && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-medium">{creator.averageRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">rating</span>
                </div>
              )}
              {creator.totalExperiences && (
                <div className="flex items-center gap-1">
                  <span className="font-medium">{creator.totalExperiences}</span>
                  <span className="text-muted-foreground">experiences hosted</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <span className="font-medium capitalize">{creator.experienceLevel || 'Professional'}</span>
                <span className="text-muted-foreground">level</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
