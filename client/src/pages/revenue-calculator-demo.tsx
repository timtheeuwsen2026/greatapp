import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  DollarSign, 
  Calculator, 
  TrendingUp, 
  TrendingDown, 
  Info,
  CheckCircle,
  ArrowRight,
  PiggyBank
} from "lucide-react";

interface RevenueBreakdown {
  grossAmount: number;
  platformFeeAmount: number;
  platformFeePercentage: number;
  stripeFeeAmount: number;
  netAmount: number;
  currency: string;
  managementType: string;
  feeDescription: string;
}

const samplePrices = [50, 100, 150, 250, 500];

export default function RevenueCalculatorDemo() {
  const [price, setPrice] = useState<string>("100");
  const [creatorManagedBreakdown, setCreatorManagedBreakdown] = useState<RevenueBreakdown | null>(null);
  const [greatManagedBreakdown, setGreatManagedBreakdown] = useState<RevenueBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const [selectedSample, setSelectedSample] = useState<number | null>(null);

  const calculateRevenue = async (amount: number) => {
    if (amount <= 0) {
      setCreatorManagedBreakdown(null);
      setGreatManagedBreakdown(null);
      return;
    }

    setIsLoading(true);
    try {
      // Calculate both scenarios
      const [creatorResponse, greatResponse] = await Promise.all([
        fetch('/api/calculate-revenue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, managementType: 'creator_managed' }),
        }),
        fetch('/api/calculate-revenue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, managementType: 'great_managed' }),
        })
      ]);

      if (creatorResponse.ok && greatResponse.ok) {
        const creatorData = await creatorResponse.json();
        const greatData = await greatResponse.json();
        setCreatorManagedBreakdown(creatorData);
        setGreatManagedBreakdown(greatData);
      } else {
        setCreatorManagedBreakdown(null);
        setGreatManagedBreakdown(null);
      }
    } catch (error) {
      console.error('Revenue calculation error:', error);
      setCreatorManagedBreakdown(null);
      setGreatManagedBreakdown(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const amount = parseFloat(price);
    if (!isNaN(amount) && amount > 0) {
      const debounceTimer = setTimeout(() => {
        calculateRevenue(amount);
      }, 300);
      
      return () => clearTimeout(debounceTimer);
    } else {
      setCreatorManagedBreakdown(null);
      setGreatManagedBreakdown(null);
    }
  }, [price]);

  const handleSamplePrice = (samplePrice: number) => {
    setPrice(samplePrice.toString());
    setSelectedSample(samplePrice);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Revenue Calculator Demo
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            See exactly what you'll earn as a creator on our platform. Complete transparency with no hidden fees.
          </p>
        </div>

        {/* Main Calculator Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Calculator Input */}
          <Card className="lg:sticky lg:top-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Experience Price Calculator
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="experience-price">Set Your Experience Price</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <Input
                      id="experience-price"
                      type="number"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="100"
                      className="pl-9 text-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Try Sample Prices</Label>
                  <div className="flex flex-wrap gap-2">
                    {samplePrices.map((samplePrice) => (
                      <Button
                        key={samplePrice}
                        variant={selectedSample === samplePrice ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleSamplePrice(samplePrice)}
                      >
                        ${samplePrice}
                      </Button>
                    ))}
                  </div>
                </div>

                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                )}

                {creatorManagedBreakdown && greatManagedBreakdown && !isLoading && (
                  <div className="space-y-6">
                    {/* Gross Revenue */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-blue-900 dark:text-blue-100">Customer Pays</span>
                        <span className="text-xl font-bold text-blue-600">
                          ${(creatorManagedBreakdown.grossAmount / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center">
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </div>

                    {/* Two Tier Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Creator Managed */}
                      <div className="p-4 border-2 border-orange-200 dark:border-orange-800 rounded-lg bg-orange-50 dark:bg-orange-950">
                        <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-3">
                          Creator Manages Venue & Services
                        </h4>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Platform Fee (20%)</span>
                            <span className="text-red-600">-${(creatorManagedBreakdown.platformFeeAmount / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Stripe Fee (2.9% + 30¢)</span>
                            <span className="text-red-600">-${(creatorManagedBreakdown.stripeFeeAmount / 100).toFixed(2)}</span>
                          </div>
                          <hr className="my-2" />
                          <div className="flex justify-between font-bold">
                            <span className="text-green-700 dark:text-green-300">You Earn</span>
                            <span className="text-green-600">${(creatorManagedBreakdown.netAmount / 100).toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-gray-600">
                            {((creatorManagedBreakdown.netAmount / creatorManagedBreakdown.grossAmount) * 100).toFixed(1)}% of gross revenue
                          </div>
                          <div className="text-xs text-blue-600 mt-1">
                            + You handle venue & service bookings
                          </div>
                        </div>
                      </div>

                      {/* Great Managed */}
                      <div className="p-4 border-2 border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-3">
                          Great Manages Venue & Services
                        </h4>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Your Share (20%)</span>
                            <span className="text-green-600">+${(greatManagedBreakdown.netAmount / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Great Keeps (80%)</span>
                            <span className="text-blue-600">-${(greatManagedBreakdown.platformFeeAmount / 100).toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-gray-500 italic">
                            (Covers venue, services, Stripe fees)
                          </div>
                          <hr className="my-2" />
                          <div className="flex justify-between font-bold">
                            <span className="text-green-700 dark:text-green-300">You Earn</span>
                            <span className="text-green-600">${(greatManagedBreakdown.netAmount / 100).toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-gray-600">
                            {((greatManagedBreakdown.netAmount / greatManagedBreakdown.grossAmount) * 100).toFixed(1)}% of gross revenue
                          </div>
                          <div className="text-xs text-blue-600 mt-1">
                            + Great handles all logistics for you
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900 rounded-lg border border-yellow-200 dark:border-yellow-700">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">
                        <strong>Different earnings models:</strong> Creator-managed offers higher earnings but requires more work. 
                        Great-managed offers convenience with guaranteed 20% revenue share.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fee Explanation */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="w-5 h-5" />
                  How Our Fees Work
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">
                        Creator-Managed (20% Platform Fee)
                      </h4>
                      <ul className="text-sm text-orange-800 dark:text-orange-200 space-y-1">
                        <li>• You book your own venue</li>
                        <li>• You manage all service providers</li>
                        <li>• Marketing platform and booking system</li>
                        <li>• Community features and participant tools</li>
                        <li>• 24/7 customer support</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                        Great-Managed (20% Revenue Share)
                      </h4>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                        <li>• Great books venues for you</li>
                        <li>• Great manages service providers</li>
                        <li>• Full marketing and booking platform</li>
                        <li>• End-to-end event management</li>
                        <li>• 24/7 support for you and participants</li>
                      </ul>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 dark:bg-gray-950 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Stripe Processing Fee: 2.9% + 30¢
                    </h4>
                    <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                      <li>• Secure credit card processing</li>
                      <li>• Fraud protection and chargeback handling</li>
                      <li>• PCI compliance and data security</li>
                      <li>• Instant payment confirmation</li>
                      <li>• Support for all major payment methods</li>
                    </ul>
                  </div>

                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                      Transparent Pricing Models
                    </h4>
                    <div className="space-y-2 text-sm text-green-800 dark:text-green-200">
                      <div><strong>Creator-managed:</strong> Keep ~77% (higher earnings, more work)</div>
                      <div><strong>Great-managed:</strong> Keep 20% (less earnings, zero logistics)</div>
                      <div className="text-xs text-green-600 mt-2">
                        Choose based on your preference for earnings vs. convenience
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PiggyBank className="w-5 h-5" />
                  Commercial Model Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      Research Competition
                    </p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      Check similar experiences in your area to price competitively
                    </p>
                  </div>

                  <div className="p-3 border-l-4 border-green-500 bg-green-50 dark:bg-green-950">
                    <p className="text-sm font-medium text-green-900 dark:text-green-100">
                      Factor Your Costs
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Include venue, materials, your time, and desired profit margin
                    </p>
                  </div>

                  <div className="p-3 border-l-4 border-purple-500 bg-purple-50 dark:bg-purple-950">
                    <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      Start Competitive
                    </p>
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      Begin with competitive pricing, then increase as you get reviews
                    </p>
                  </div>

                  <div className="p-3 border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-950">
                    <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                      Bundle Add-ons
                    </p>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      Increase value with meals, materials, photos, or premium options
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Comparison Table */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Revenue Comparison Examples</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">Experience Price</th>
                    <th className="text-left p-3">Platform Fee</th>
                    <th className="text-left p-3">Stripe Fee</th>
                    <th className="text-left p-3">Your Earnings</th>
                    <th className="text-left p-3">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {samplePrices.map((samplePrice) => {
                    const grossAmount = samplePrice * 100; // Convert to cents
                    const platformFee = Math.round(grossAmount * 0.15);
                    const stripeFee = Math.round(grossAmount * 0.029) + 30;
                    const netAmount = grossAmount - platformFee - stripeFee;
                    const percentage = ((netAmount / grossAmount) * 100);

                    return (
                      <tr key={samplePrice} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="p-3 font-semibold">${samplePrice}.00</td>
                        <td className="p-3 text-red-600">-${(platformFee / 100).toFixed(2)}</td>
                        <td className="p-3 text-red-600">-${(stripeFee / 100).toFixed(2)}</td>
                        <td className="p-3 font-semibold text-green-600">${(netAmount / 100).toFixed(2)}</td>
                        <td className="p-3">
                          <Badge variant="secondary">
                            {percentage.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Call to Action */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto bg-gradient-to-r from-blue-500 to-green-500 text-white">
            <CardContent className="p-8">
              <h3 className="text-2xl font-bold mb-4">Ready to Start Creating?</h3>
              <p className="mb-6 opacity-90">
                Join thousands of creators earning transparent, competitive revenue on our platform.
              </p>
              <Button 
                size="lg" 
                className="bg-white text-blue-600 hover:bg-gray-100"
                onClick={() => setLocation('/creator')}
              >
                Start Your Creator Journey
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
