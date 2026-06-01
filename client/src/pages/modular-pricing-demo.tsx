import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Calculator,
  DollarSign,
  CheckCircle,
  Info,
  Building,
  Users,
  Megaphone,
  Shield,
  Headphones,
  ArrowRight
} from "lucide-react";

interface ModularRevenueBreakdown {
  grossAmount: number;
  platformFeeAmount: number;
  platformFeePercentage: number;
  stripeFeeAmount: number;
  netAmount: number;
  currency: string;
  services: {
    venueBooking?: boolean;
    serviceProviders?: boolean;
    marketing?: boolean;
    insurance?: boolean;
    customerSupport?: boolean;
  };
  serviceBreakdown: {
    basePlatform: { percentage: number; description: string };
    venueBooking: { percentage: number; description: string };
    serviceProviders: { percentage: number; description: string };
    marketing: { percentage: number; description: string };
    insurance: { percentage: number; description: string };
    customerSupport: { percentage: number; description: string };
  };
  feeDescription: string;
}

const serviceOptions = [
  {
    key: 'venueBooking' as const,
    name: 'Venue Booking',
    description: 'We source and book the perfect venue for your experience',
    icon: Building,
    fee: '+6%',
    color: 'blue'
  },
  {
    key: 'serviceProviders' as const,
    name: 'Service Providers',
    description: 'We manage photographers, chefs, guides, and other service providers',
    icon: Users,
    fee: '+4%',
    color: 'green'
  },
  {
    key: 'marketing' as const,
    name: 'Enhanced Marketing',
    description: 'Premium promotion, featured listings, and targeted advertising',
    icon: Megaphone,
    fee: '+3%',
    color: 'purple'
  },
  {
    key: 'insurance' as const,
    name: 'Event Insurance',
    description: 'Comprehensive liability coverage and event protection',
    icon: Shield,
    fee: '+2%',
    color: 'orange'
  },
  {
    key: 'customerSupport' as const,
    name: '24/7 Concierge',
    description: 'Dedicated support for you and your participants',
    icon: Headphones,
    fee: '+2%',
    color: 'pink'
  }
];

export default function ModularPricingDemo() {
  const [price, setPrice] = useState<string>("100");
  const [breakdown, setBreakdown] = useState<ModularRevenueBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedServices, setSelectedServices] = useState({
    venueBooking: false,
    serviceProviders: false,
    marketing: false,
    insurance: false,
    customerSupport: false
  });

  const calculateRevenue = async (amount: number, services: typeof selectedServices) => {
    if (amount <= 0) {
      setBreakdown(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/calculate-revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, services }),
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
        calculateRevenue(amount, selectedServices);
      }, 300);
      
      return () => clearTimeout(debounceTimer);
    } else {
      setBreakdown(null);
    }
  }, [price, selectedServices]);

  const handleServiceToggle = (serviceKey: keyof typeof selectedServices) => {
    setSelectedServices(prev => ({
      ...prev,
      [serviceKey]: !prev[serviceKey]
    }));
  };

  const totalSelectedFee = 8 + // Base platform fee
    (selectedServices.venueBooking ? 6 : 0) +
    (selectedServices.serviceProviders ? 4 : 0) +
    (selectedServices.marketing ? 3 : 0) +
    (selectedServices.insurance ? 2 : 0) +
    (selectedServices.customerSupport ? 2 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Modular Pricing Calculator
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
            Build your perfect service package. Only pay for what you need. Complete transparency.
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
                      placeholder="100"
                      className="pl-9 text-lg"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex justify-between">
                      <span>Base Platform Fee:</span>
                      <span className="font-medium">8%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Selected Services:</span>
                      <span className="font-medium">+{totalSelectedFee - 8}%</span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between font-bold">
                      <span>Total Fee:</span>
                      <span>{totalSelectedFee}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Service Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Services</CardTitle>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Select which services you want Great to handle for you
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {serviceOptions.map((service) => {
                  const IconComponent = service.icon;
                  const isSelected = selectedServices[service.key];
                  
                  return (
                    <div
                      key={service.key}
                      className={`p-4 rounded-lg border transition-all ${
                        isSelected 
                          ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950' 
                          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <IconComponent className={`w-5 h-5 mt-0.5 ${
                            isSelected ? 'text-blue-600' : 'text-gray-400'
                          }`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{service.name}</h4>
                              <Badge variant="outline" className="text-xs">
                                {service.fee}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                              {service.description}
                            </p>
                          </div>
                        </div>
                        <Switch
                          checked={isSelected}
                          onCheckedChange={() => handleServiceToggle(service.key)}
                        />
                      </div>
                    </div>
                  );
                })}
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
                      {Object.entries(breakdown.serviceBreakdown).map(([key, service]) => {
                        if (service.percentage === 0) return null;
                        
                        return (
                          <div key={key} className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                            <span>{service.description}</span>
                            <span className="text-red-600 font-medium">
                              -{service.percentage}% (${(breakdown.grossAmount * service.percentage / 10000).toFixed(2)})
                            </span>
                          </div>
                        );
                      })}
                      
                      <div className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-950 rounded text-sm">
                        <span>Stripe Fee (2.9% + 30¢)</span>
                        <span className="text-red-600 font-medium">
                          -${(breakdown.stripeFeeAmount / 100).toFixed(2)}
                        </span>
                      </div>
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
                          {totalSelectedFee}% total fee
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
              How Modular Pricing Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-3">Always Included (8% base fee):</h4>
                <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                  <li>• Booking platform and payment processing</li>
                  <li>• Community features for participants</li>
                  <li>• Basic customer support</li>
                  <li>• Experience discovery and search</li>
                  <li>• Mobile app access</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-3">Optional Add-ons:</h4>
                <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-400">
                  <li>• <strong>Venue Booking (+6%):</strong> We find and book venues</li>
                  <li>• <strong>Service Providers (+4%):</strong> We manage all contractors</li>
                  <li>• <strong>Enhanced Marketing (+3%):</strong> Premium promotion</li>
                  <li>• <strong>Insurance (+2%):</strong> Comprehensive coverage</li>
                  <li>• <strong>24/7 Concierge (+2%):</strong> Dedicated support</li>
                </ul>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Example:</strong> Want full-service management? Select all options for 25% total fee. 
                Prefer doing it yourself? Just pay the 8% base fee. You choose what works for you.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}