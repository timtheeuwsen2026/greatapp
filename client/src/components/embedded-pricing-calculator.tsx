import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calculator,
  DollarSign,
  CheckCircle,
  Briefcase,
  Heart,
  Building,
  Users,
  AlertCircle
} from "lucide-react";

interface RoleBasedRevenueBreakdown {
  grossAmount: number;
  platformFeeAmount: number;
  platformFeePercentage: number;
  stripeFeeAmount: number;
  netAmount: number;
  currency: string;
  creatorRole: string;
  supportLevel: string;
  roleDescription: string;
  supportDescription: string;
  feeDescription: string;
}

interface VenueSplitBreakdown {
  grossAmount: number;
  stripeFeeAmount: number;
  netAmountAfterStripe: number;
  venueShareAmount: number;
  venuePercentage: number;
  creatorShareAmount: number;
  creatorPercentage: number;
  platformShareAmount: number;
  platformPercentage: number;
  currency: string;
  breakdown: {
    venue: { amount: number; percentage: number; description: string };
    creator: { amount: number; percentage: number; description: string };
    platform: { amount: number; percentage: number; description: string };
    stripe: { amount: number; description: string };
  };
  summary: {
    grossRevenue: number;
    stripeFees: number;
    netRevenueAfterStripe: number;
    venueShare: number;
    creatorShare: number;
    platformShare: number;
  };
}

type CalculationMode = 'role-based' | 'venue-splits';

// Type guards
function isRoleBasedBreakdown(breakdown: any): breakdown is RoleBasedRevenueBreakdown {
  return breakdown && 'netAmount' in breakdown && 'creatorRole' in breakdown;
}

function isVenueSplitBreakdown(breakdown: any): breakdown is VenueSplitBreakdown {
  return breakdown && 'breakdown' in breakdown && 'venueShareAmount' in breakdown;
}

export default function EmbeddedPricingCalculator() {
  const [price, setPrice] = useState<string>("150");
  const [breakdown, setBreakdown] = useState<RoleBasedRevenueBreakdown | VenueSplitBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [creatorRole, setCreatorRole] = useState<string>("facilitator");
  const [supportLevel, setSupportLevel] = useState<string>("basic");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>('role-based');
  
  // Venue splits state
  const [venuePercentage, setVenuePercentage] = useState<string>("30");
  const [creatorPercentage, setCreatorPercentage] = useState<string>("50");
  const [platformPercentage, setPlatformPercentage] = useState<string>("20");
  const [percentageError, setPercentageError] = useState<string>("");

  const calculateRevenue = async () => {
    const amount = parseFloat(price);
    if (amount <= 0) {
      setBreakdown(null);
      return;
    }

    setIsLoading(true);
    try {
      let requestBody: any;
      
      if (calculationMode === 'venue-splits') {
        // Validate percentages for venue splits
        const vPerc = parseFloat(venuePercentage);
        const cPerc = parseFloat(creatorPercentage);
        const pPerc = parseFloat(platformPercentage);
        
        if (Math.abs(vPerc + cPerc + pPerc - 100) > 0.1) {
          setPercentageError('Percentages must add up to 100%');
          setIsLoading(false);
          return;
        } else {
          setPercentageError('');
        }
        
        requestBody = {
          amount,
          venuePercentage: vPerc,
          creatorPercentage: cPerc,
          platformPercentage: pPerc
        };
      } else {
        // Role-based calculation
        requestBody = {
          amount,
          creatorRole,
          supportLevel
        };
      }

      const response = await fetch('/api/calculate-revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        setBreakdown(data);
      } else {
        setBreakdown(null);
      }
    } catch (error) {
      console.error('Revenue calculation error:', error);
      setBreakdown(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const amount = parseFloat(price);
    if (!isNaN(amount) && amount > 0) {
      const debounceTimer = setTimeout(() => {
        calculateRevenue();
      }, 300);
      
      return () => clearTimeout(debounceTimer);
    } else {
      setBreakdown(null);
      setPercentageError('');
    }
  }, [price, creatorRole, supportLevel, calculationMode, venuePercentage, creatorPercentage, platformPercentage]);

  const supportOptions = {
    facilitator: [
      { value: 'basic', label: 'DIY', description: 'Platform only', fee: '20%' },
      { value: 'enhanced', label: 'Enhanced', description: 'Venue + marketing help', fee: '27%' },
      { value: 'full', label: 'Full Service', description: 'Complete support', fee: '34%' }
    ],
    influencer: [
      { value: 'managed', label: 'Fully Managed', description: 'Great provides facilitator', fee: '75%' }
    ]
  };

  const currentOptions = supportOptions[creatorRole as keyof typeof supportOptions] || [];

  // Auto-adjust percentages to 100% when one changes
  const handlePercentageChange = (type: 'venue' | 'creator' | 'platform', value: string) => {
    const numValue = parseFloat(value) || 0;
    
    if (type === 'venue') {
      setVenuePercentage(value);
      const remaining = 100 - numValue;
      const creatorCurrent = parseFloat(creatorPercentage) || 0;
      const platformCurrent = parseFloat(platformPercentage) || 0;
      const total = creatorCurrent + platformCurrent;
      
      if (total > 0) {
        setCreatorPercentage(((creatorCurrent / total) * remaining).toFixed(1));
        setPlatformPercentage(((platformCurrent / total) * remaining).toFixed(1));
      }
    } else if (type === 'creator') {
      setCreatorPercentage(value);
      const remaining = 100 - numValue;
      const venueCurrent = parseFloat(venuePercentage) || 0;
      const platformCurrent = parseFloat(platformPercentage) || 0;
      const total = venueCurrent + platformCurrent;
      
      if (total > 0) {
        setVenuePercentage(((venueCurrent / total) * remaining).toFixed(1));
        setPlatformPercentage(((platformCurrent / total) * remaining).toFixed(1));
      }
    } else {
      setPlatformPercentage(value);
      const remaining = 100 - numValue;
      const venueCurrent = parseFloat(venuePercentage) || 0;
      const creatorCurrent = parseFloat(creatorPercentage) || 0;
      const total = venueCurrent + creatorCurrent;
      
      if (total > 0) {
        setVenuePercentage(((venueCurrent / total) * remaining).toFixed(1));
        setCreatorPercentage(((creatorCurrent / total) * remaining).toFixed(1));
      }
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-center">
          <Calculator className="w-5 h-5" />
          Creator Pricing Calculator
        </CardTitle>
        <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Estimate earnings across creator roles and venue commercial terms
        </p>
      </CardHeader>
      <CardContent>
        <Tabs value={calculationMode} onValueChange={(value) => {
          setCalculationMode(value as CalculationMode);
          setPercentageError('');
        }} className="mb-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="role-based" className="flex items-center gap-2" data-testid="tab-role-based">
              <Users className="w-4 h-4" />
              Role-Based
            </TabsTrigger>
            <TabsTrigger value="venue-splits" className="flex items-center gap-2" data-testid="tab-venue-splits">
              <Building className="w-4 h-4" />
              Venue Terms
            </TabsTrigger>
          </TabsList>

          <TabsContent value="role-based" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Price Input */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="price-role">Experience Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="price-role"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="150"
                      className="pl-9"
                      min="0"
                      step="0.01"
                      data-testid="input-price-role"
                    />
                  </div>
                </div>

                {/* Role Selection */}
                <div className="space-y-3">
                  <Label>Creator Role</Label>
                  <RadioGroup value={creatorRole} onValueChange={setCreatorRole}>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="facilitator" id="facilitator-embed" data-testid="radio-facilitator" />
                        <Label htmlFor="facilitator-embed" className="text-sm flex items-center gap-1 cursor-pointer">
                          <Briefcase className="w-3 h-3" />
                          Facilitator
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="influencer" id="influencer-embed" data-testid="radio-influencer" />
                        <Label htmlFor="influencer-embed" className="text-sm flex items-center gap-1 cursor-pointer">
                          <Heart className="w-3 h-3" />
                          Influencer
                        </Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
              </div>

              {/* Support Level */}
              <div className="space-y-4">
                <Label>Support Level</Label>
                <RadioGroup value={supportLevel} onValueChange={setSupportLevel}>
                  <div className="space-y-2">
                    {currentOptions.map((option) => (
                      <div key={option.value} className="flex items-center justify-between p-2 border rounded">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value={option.value} id={`${option.value}-embed`} data-testid={`radio-support-${option.value}`} />
                          <div>
                            <Label htmlFor={`${option.value}-embed`} className="text-sm font-medium cursor-pointer">
                              {option.label}
                            </Label>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {option.description}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {option.fee}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>

              {/* Role-Based Results */}
              <div className="space-y-4">
                <Label>Your Earnings</Label>
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}

                {breakdown && isRoleBasedBreakdown(breakdown) && !isLoading && (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Customer Pays</span>
                        <span className="text-lg font-bold text-blue-600" data-testid="text-customer-pays">
                          ${(breakdown.grossAmount / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <div className="text-xs text-red-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Platform Fee</span>
                          <span>-{breakdown.platformFeePercentage}%</span>
                        </div>
                        {breakdown.stripeFeeAmount > 0 && (
                          <div className="flex justify-between">
                            <span>Stripe Fee</span>
                            <span>-${(breakdown.stripeFeeAmount / 100).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold flex items-center gap-1 text-green-900 dark:text-green-100">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          You Earn
                        </span>
                        <span className="text-lg font-bold text-green-600" data-testid="text-role-earnings">
                          ${(breakdown.netAmount / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-green-700 dark:text-green-300">
                          {((breakdown.netAmount / breakdown.grossAmount) * 100).toFixed(1)}% of total
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="venue-splits" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Price Input */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="price-venue">Experience Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="price-venue"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="150"
                      className="pl-9"
                      min="0"
                      step="0.01"
                      data-testid="input-price-venue"
                    />
                  </div>
                </div>
              </div>

              {/* Commercial terms */}
              <div className="space-y-4">
                <Label>Revenue Share Terms</Label>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="venue-percent" className="text-sm flex items-center gap-1">
                      <Building className="w-3 h-3" />
                      Venue Share (%)
                    </Label>
                    <Input
                      id="venue-percent"
                      type="number"
                      value={venuePercentage}
                      onChange={(e) => handlePercentageChange('venue', e.target.value)}
                      placeholder="30"
                      min="0"
                      max="100"
                      step="0.1"
                      data-testid="input-venue-percentage"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="creator-percent" className="text-sm flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      Creator Share (%)
                    </Label>
                    <Input
                      id="creator-percent"
                      type="number"
                      value={creatorPercentage}
                      onChange={(e) => handlePercentageChange('creator', e.target.value)}
                      placeholder="50"
                      min="0"
                      max="100"
                      step="0.1"
                      data-testid="input-creator-percentage"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="platform-percent" className="text-sm flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Platform Share (%)
                    </Label>
                    <Input
                      id="platform-percent"
                      type="number"
                      value={platformPercentage}
                      onChange={(e) => handlePercentageChange('platform', e.target.value)}
                      placeholder="20"
                      min="0"
                      max="100"
                      step="0.1"
                      data-testid="input-platform-percentage"
                    />
                  </div>
                </div>
                
                {percentageError && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950 rounded text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {percentageError}
                  </div>
                )}
                
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Total: {(parseFloat(venuePercentage) + parseFloat(creatorPercentage) + parseFloat(platformPercentage)).toFixed(1)}%
                </div>
              </div>

              {/* Venue Split Results */}
              <div className="space-y-4">
                <Label>Revenue Breakdown</Label>
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}

                {breakdown && isVenueSplitBreakdown(breakdown) && !isLoading && (
                  <div className="space-y-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Total Revenue</span>
                        <span className="text-lg font-bold text-blue-600" data-testid="text-total-revenue">
                          ${(breakdown.grossAmount / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <div className="text-xs text-red-600 space-y-1">
                        <div className="flex justify-between">
                          <span>Stripe Fee</span>
                          <span>-${(breakdown.stripeFeeAmount / 100).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium flex items-center gap-1 text-purple-900 dark:text-purple-100">
                            <Building className="w-4 h-4" />
                            Venue Share
                          </span>
                          <span className="text-lg font-bold text-purple-600" data-testid="text-venue-share">
                            ${(breakdown.venueShareAmount / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-purple-700 dark:text-purple-300">
                          {breakdown.venuePercentage}% of net revenue
                        </div>
                      </div>

                      <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium flex items-center gap-1 text-green-900 dark:text-green-100">
                            <Heart className="w-4 h-4" />
                            Creator Share
                          </span>
                          <span className="text-lg font-bold text-green-600" data-testid="text-creator-share">
                            ${(breakdown.creatorShareAmount / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-green-700 dark:text-green-300">
                          {breakdown.creatorPercentage}% of net revenue
                        </div>
                      </div>

                      <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium flex items-center gap-1 text-gray-900 dark:text-gray-100">
                            <Users className="w-4 h-4" />
                            Platform Share
                          </span>
                          <span className="text-lg font-bold text-gray-600" data-testid="text-platform-share">
                            ${(breakdown.platformShareAmount / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-700 dark:text-gray-300">
                          {breakdown.platformPercentage}% of net revenue
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-amber-800 dark:text-amber-200">
            <div>
              <strong>Role-Based Pricing:</strong> Traditional creator fee structure with platform support levels from DIY (20%) to Full Service (34%). Creators earn a percentage after platform fees.
            </div>
            <div>
              <strong>Venue Terms:</strong> Legacy revenue share estimator for marketplace partnerships. Use the event builder commercial model step for final venue offers and handshake terms.
            </div>
          </div>
        </div>

        {breakdown && (
          <div className="mt-6 text-center">
            <Button 
              className="btn-gradient text-white px-8 py-3"
              onClick={() => window.location.href = '/conversational-creator-setup-v2'}
              data-testid="button-start-creating"
            >
              Start Creating Experiences
            </Button>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {isRoleBasedBreakdown(breakdown) 
                ? `Ready to earn $${(breakdown.netAmount / 100).toFixed(2)} per booking? Let's get started!`
                : isVenueSplitBreakdown(breakdown)
                ? `Ready to earn $${(breakdown.creatorShareAmount / 100).toFixed(2)} per booking? Let's get started!`
                : "Ready to start creating experiences? Let's get started!"
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
