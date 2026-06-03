import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isAdminUser } from "@/lib/authUtils";
import { ArrowLeft, Users, Eye, DollarSign, TrendingUp, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";

interface PromoterSummary {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  promoterCode: string | null;
  totalBookings: number;
  estimatedByCurrency: Record<string, number>;
  lockedByCurrency: Record<string, number>;
  voidedByCurrency: Record<string, number>;
}

function formatCurrency(amount: number | string, currency: string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (!numAmount || isNaN(numAmount)) return '€0.00';
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currency.toUpperCase()] || currency + ' ';
  return `${symbol}${numAmount.toFixed(2)}`;
}

function formatCurrencyMap(currencyMap: Record<string, number>): string {
  const entries = Object.entries(currencyMap).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return '-';
  return entries.map(([currency, amount]) => formatCurrency(amount, currency)).join(', ');
}

export default function AdminPromotersPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdminUser(user))) {
      toast({
        title: "Unauthorized",
        description: "You don't have admin access.",
        variant: "destructive",
      });
      setTimeout(() => setLocation("/"), 500);
    }
  }, [isAuthenticated, isLoading, user, toast, setLocation]);

  const { data: promoters = [], isLoading: promotersLoading } = useQuery<PromoterSummary[]>({
    queryKey: ["/api/admin/promoters"],
    enabled: isAuthenticated && isAdminUser(user),
  });

  if (isLoading || promotersLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  const totalBookings = promoters.reduce((sum, p) => sum + p.totalBookings, 0);
  
  // Aggregate totals by currency to avoid mixing currencies
  const aggregatedEstimated: Record<string, number> = {};
  const aggregatedLocked: Record<string, number> = {};
  promoters.forEach(p => {
    Object.entries(p.estimatedByCurrency).forEach(([currency, amount]) => {
      aggregatedEstimated[currency] = (aggregatedEstimated[currency] || 0) + amount;
    });
    Object.entries(p.lockedByCurrency).forEach(([currency, amount]) => {
      aggregatedLocked[currency] = (aggregatedLocked[currency] || 0) + amount;
    });
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Promoter Management</h1>
              <p className="text-muted-foreground">View all promoters, their attributed bookings, and commission status</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Promoters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{promoters.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total Bookings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalBookings}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-4 w-4" /> Estimated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-gray-600">
                {Object.keys(aggregatedEstimated).length === 0 ? '-' : 
                  Object.entries(aggregatedEstimated).map(([currency, amount]) => 
                    formatCurrency(amount, currency)
                  ).join(', ')}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" /> Locked
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-green-600">
                {Object.keys(aggregatedLocked).length === 0 ? '-' : 
                  Object.entries(aggregatedLocked).map(([currency, amount]) => 
                    formatCurrency(amount, currency)
                  ).join(', ')}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Promoters</CardTitle>
          </CardHeader>
          <CardContent>
            {promoters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No promoters found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Promoter Code</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Estimated</TableHead>
                    <TableHead className="text-right">Locked</TableHead>
                    <TableHead className="text-right">Voided</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoters.map((promoter) => (
                    <TableRow key={promoter.id}>
                      <TableCell className="font-medium">
                        {promoter.firstName || promoter.lastName 
                          ? `${promoter.firstName || ''} ${promoter.lastName || ''}`.trim()
                          : 'Unknown'}
                      </TableCell>
                      <TableCell>{promoter.email || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {promoter.promoterCode || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{promoter.totalBookings}</TableCell>
                      <TableCell className="text-right text-gray-600">
                        {formatCurrencyMap(promoter.estimatedByCurrency)}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrencyMap(promoter.lockedByCurrency)}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrencyMap(promoter.voidedByCurrency)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={`/admin/promoters/${promoter.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
