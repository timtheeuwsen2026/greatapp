import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Calculator,
  DollarSign,
  CheckCircle,
  Info,
  Users,
  Crown,
  ArrowRight,
  Briefcase,
  Heart
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

export default function RoleBasedPricingDemo() {
  const [price, setPrice] = useState<string>("150");
  const [breakdown, setBreakdown] = useState<RoleBasedRevenueBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [creatorRole, setCreatorRole] = useState<string>("facilitator");
  const [supportLevel, setSupportLevel] = useState<string>("basic");

  const calculateRevenue = async (amount: number, role: string, support: string) => {
    if (amount <= 0) {
      setBreakdown(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/calculate-revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, creatorRole: role, supportLevel: support }),
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
        calculateRevenue(amount, creatorRole, supportLevel);
      }, 300);
      
      return () => clearTimeout(debounceTimer);
    } else {
      setBreakdown(null);
    }
  }, [price, creatorRole, supportLevel]);

  const supportOptions = {
    facilitator: [
      { value: 'basic', label: 'DIY Support', description: 'Platform access only - you handle everything', fee: '15%' },
      { value: 'enhanced', label: 'Enhanced Support', description: 'Venue sourcing + marketing boost', fee: '27%' },
      { value: 'full', label: 'Full Service', description: 'Complete venue, marketing, insurance, concierge', fee: '34%' }
    ],
    influencer: [
      { value: 'managed', label: 'Fully Managed', description: 'Great provides facilitator and manages everything', fee: '75%' }
    ]
  };

  const currentOptions = supportOptions[creatorRole as keyof typeof supportOptions] || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Creator Role-Based Pricing
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Choose your role: Run the experience yourself or focus on bringing your community together
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Price Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Experience Price
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="experience-price">Set Your Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="experience-price"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="150"
                      className="pl-9 text-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                {breakdown && (
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex justify-between">
                        <span>Your Role:</span>
                        <span className="font-medium capitalize">{breakdown.creatorRole}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Support Level:</span>
                        <span className="font-medium capitalize">{breakdown.supportLevel}</span>
                      </div>
                      <hr className="my-2" />
                      <div className="flex justify-between font-bold">
                        <span>Fee Rate:</span>
                        <span>{breakdown.platformFeePercentage}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Role Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Role</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                What level of responsibility do you want to take?
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <RadioGroup value={creatorRole} onValueChange={setCreatorRole}>
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg border transition-all ${
                      creatorRole === 'facilitator' 
                        ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950' 
                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                    }`}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="facilitator" id="facilitator" className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4" />
                            <Label htmlFor="facilitator" className="font-medium cursor-pointer">
                              Experience Facilitator
                            </Label>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            You run the entire experience from start to finish. You're the host, guide, and leader.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg border transition-all ${
                      creatorRole === 'influencer' 
                        ? 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-950' 
                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                    }`}>
                      <div className="flex items-start gap-3">
                        <RadioGroupItem value="influencer" id="influencer" className="mt-1" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Heart className="w-4 h-4" />
                            <Label htmlFor="influencer" className="font-medium cursor-pointer">
                              Network Influencer
                            </Label>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            You bring your community together. Great provides a professional facilitator to run everything.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </RadioGroup>

                {/* Support Level Selection */}
                {currentOptions.length > 1 && (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Support Level</Label>
                    <RadioGroup value={supportLevel} onValueChange={setSupportLevel}>
                      <div className="space-y-2">
                        {currentOptions.map((option) => (
                          <div key={option.value} className={`p-3 rounded-lg border transition-all ${
                            supportLevel === option.value 
                              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' 
                              : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                          }`}>
                            <div className="flex items-start gap-3">
                              <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor={option.value} className="font-medium cursor-pointer text-sm">
                                    {option.label}
                                  </Label>
                                  <Badge variant="outline" className="text-xs">
                                    {option.fee}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                  {option.description}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Revenue Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Your Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}

                {breakdown && !isLoading && (
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-blue-900 dark:text-blue-100">Customer Pays</span>
                        <span className="text-xl font-bold text-blue-600">
                          ${(breakdown.grossAmount / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </div>

                    <div className="space-y-2">
                      <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg border">
                        <div className="text-sm">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{breakdown.roleDescription}</span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-600 dark:text-gray-400">{breakdown.supportDescription}</span>
                            <span className="text-red-600 font-medium">
                              -{breakdown.platformFeePercentage}% (${(breakdown.platformFeeAmount / 100).toFixed(2)})
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {breakdown.stripeFeeAmount > 0 && (
                        <div className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                          <span>Stripe Fee (2.9% + 30¢)</span>
                          <span className="text-red-600 font-medium">
                            -${(breakdown.stripeFeeAmount / 100).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </div>

                    <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border-2 border-green-200 dark:border-green-800">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold flex items-center gap-2 text-green-900 dark:text-green-100">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          You Earn
                        </span>
                        <span className="text-2xl font-bold text-green-600">
                          ${(breakdown.netAmount / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm text-green-700 dark:text-green-300">
                          {((breakdown.netAmount / breakdown.grossAmount) * 100).toFixed(1)}% of total
                        </span>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          {breakdown.creatorRole === 'facilitator' ? 'Platform Fee' : 'Revenue Share'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              How Role-Based Pricing Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" />
                  Experience Facilitator
                </h4>
                <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-400">
                  <li><strong>You take full responsibility</strong> for running the experience</li>
                  <li><strong>DIY (15%):</strong> Fixed platform fee - you handle everything</li>
                  <li><strong>Enhanced (27%):</strong> We help with venues and marketing</li>
                  <li><strong>Full Service (34%):</strong> Complete support with venues, marketing, insurance, concierge</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Heart className="w-4 h-4" />
                  Network Influencer
                </h4>
                <ul className="text-sm space-y-2 text-gray-600 dark:text-gray-400">
                  <li><strong>Focus on your community</strong> - bring people together</li>
                  <li><strong>25% revenue share</strong> for you</li>
                  <li><strong>Great provides a professional facilitator</strong> to run the experience</li>
                  <li><strong>You're the face</strong> that attracts participants, we handle operations</li>
                </ul>
              </div>
            </div>
            <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-950 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Choose based on your strengths:</strong> Want to be hands-on and lead experiences? Be a facilitator. 
                Prefer to focus on your community and let professionals handle logistics? Be a network influencer.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}