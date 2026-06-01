import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Calculator, TrendingUp, TrendingDown } from "lucide-react";

interface RevenueBreakdown {
  grossAmount: number;
  platformFeeAmount: number;
  platformFeePercentage: number;
  stripeFeeAmount: number;
  netAmount: number;
  currency: string;
}

export default function RevenueCalculator() {
  const [price, setPrice] = useState<string>("100");
  const [breakdown, setBreakdown] = useState<RevenueBreakdown | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const calculateRevenue = async (amount: number) => {
    if (amount <= 0) {
      setBreakdown(null);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/calculate-revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
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
        calculateRevenue(amount);
      }, 300);
      
      return () => clearTimeout(debounceTimer);
    } else {
      setBreakdown(null);
    }
  }, [price]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5" />
          Revenue Calculator
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="experience-price">Experience Price</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input
                id="experience-price"
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="100"
                className="pl-9"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}

          {breakdown && !isLoading && (
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <span className="font-medium">Gross Revenue</span>
                <span className="font-bold text-blue-600">
                  ${(breakdown.grossAmount / 100).toFixed(2)}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    Platform Fee (15%)
                  </span>
                  <span className="text-red-600 font-medium">
                    -${(breakdown.platformFeeAmount / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-500" />
                    Stripe Fee (2.9% + 30¢)
                  </span>
                  <span className="text-red-600 font-medium">
                    -${(breakdown.stripeFeeAmount / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              <hr className="my-3" />

              <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <span className="font-semibold flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  You Earn
                </span>
                <span className="text-xl font-bold text-green-600">
                  ${(breakdown.netAmount / 100).toFixed(2)}
                </span>
              </div>

              <div className="text-xs text-gray-500 text-center">
                That's {((breakdown.netAmount / breakdown.grossAmount) * 100).toFixed(1)}% of the total price
              </div>
            </div>
          )}

          {!breakdown && !isLoading && parseFloat(price) > 0 && (
            <div className="text-center text-gray-500 py-4">
              Unable to calculate revenue
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}