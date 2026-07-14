import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import Navigation from "@/components/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isAdminUser } from "@/lib/authUtils";
import { ArrowLeft, User, Download, DollarSign, TrendingUp, AlertCircle, Calendar, FileText } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation, Link, useParams } from "wouter";

interface PromoterDetail {
  promoter: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    promoterCode: string | null;
  };
  earnings: {
    byCurrency: Array<{
      currency: string;
      estimated: number;
      locked: number;
      paid: number;
      voided: number;
      totalBookings: number;
    }>;
  };
  bookings: Array<{
    id: string;
    experienceId: string;
    experienceName: string;
    ticketSkuId: string | null;
    spots: number;
    bookingValue: string | null;
    commissionAmount: string | null;
    commissionStatus: string;
    commissionTransferId: string | null;
    commissionPaidAt: string | null;
    currency: string;
    participantName: string;
    createdAt: string;
  }>;
}

function formatCurrency(amount: number | string | null, currency: string): string {
  if (amount === null || amount === undefined) return '-';
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numAmount)) return '-';
  const symbols: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF '
  };
  const symbol = symbols[currency.toUpperCase()] || currency + ' ';
  return `${symbol}${numAmount.toFixed(2)}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'locked':
      return <Badge className="bg-green-100 text-green-800">Locked</Badge>;
    case 'voided':
      return <Badge className="bg-red-100 text-red-800">Voided</Badge>;
    case 'paid':
      return <Badge className="bg-blue-100 text-blue-800">Paid</Badge>;
    case 'estimated':
    default:
      return <Badge className="bg-gray-100 text-gray-800">Estimated</Badge>;
  }
}

export default function AdminPromoterDetailPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ promoterId: string }>();
  const promoterId = params.promoterId;

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

  const { data, isLoading: dataLoading } = useQuery<PromoterDetail>({
    queryKey: ["/api/admin/promoters", promoterId],
    enabled: isAuthenticated && isAdminUser(user) && !!promoterId,
  });

  const handleExportCSV = () => {
    if (!data) return;
    
    const headers = [
      'Booking ID',
      'Experience',
      'Promoter',
      'Commission Amount',
      'Currency',
      'Status',
      'Transfer ID',
      'Paid At',
      'Booking Date'
    ];
    
    const promoterName = data.promoter.firstName || data.promoter.lastName 
      ? `${data.promoter.firstName || ''} ${data.promoter.lastName || ''}`.trim()
      : data.promoter.email || 'Unknown';
    
    const rows = data.bookings.map(booking => [
      booking.id,
      `"${booking.experienceName.replace(/"/g, '""')}"`,
      `"${promoterName.replace(/"/g, '""')}"`,
      booking.commissionAmount || '0',
      booking.currency,
      booking.commissionStatus,
      booking.commissionTransferId || '',
      booking.commissionPaidAt || '',
      new Date(booking.createdAt).toISOString().split('T')[0]
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `promoter-${data.promoter.promoterCode || promoterId}-bookings.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: `Exported ${data.bookings.length} booking(s) to CSV`,
    });
  };

  if (isLoading || dataLoading) {
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

  if (!data) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Promoter Not Found</h2>
            <Link href="/admin/promoters">
              <Button variant="outline">Back to Promoters</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { promoter, earnings, bookings } = data;
  const promoterName = promoter.firstName || promoter.lastName 
    ? `${promoter.firstName || ''} ${promoter.lastName || ''}`.trim()
    : 'Unknown';

  const totalBookings = earnings.byCurrency.reduce((sum, e) => sum + e.totalBookings, 0);
  
  // Format multi-currency totals - display each currency separately, never aggregate
  const formatMultiCurrencyTotal = (extractor: (e: { currency: string; estimated: number; locked: number; paid: number; voided: number }) => number) => {
    const nonZero = earnings.byCurrency.filter(e => extractor(e) > 0);
    if (nonZero.length === 0) return '-';
    return nonZero.map(e => formatCurrency(extractor(e), e.currency)).join(', ');
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/admin/promoters">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Promoters
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">{promoterName}</h1>
                <p className="text-muted-foreground">{promoter.email}</p>
                {promoter.promoterCode && (
                  <Badge variant="outline" className="font-mono mt-1">
                    Code: {promoter.promoterCode}
                  </Badge>
                )}
              </div>
            </div>
            <Button onClick={handleExportCSV} disabled={bookings.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
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
                {formatMultiCurrencyTotal(e => e.estimated)}
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
                {formatMultiCurrencyTotal(e => e.locked)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-4 w-4" /> Paid
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-blue-600">
                {formatMultiCurrencyTotal(e => e.paid)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> Voided
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold text-red-600">
                {formatMultiCurrencyTotal(e => e.voided)}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Attributed Bookings
                </CardTitle>
                <CardDescription>All bookings attributed to this promoter</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No bookings attributed to this promoter yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking ID</TableHead>
                      <TableHead>Experience</TableHead>
                      <TableHead>Participant</TableHead>
                      <TableHead className="text-right">Spots</TableHead>
                      <TableHead className="text-right">Booking Value</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-mono text-xs">{booking.id.slice(0, 8)}...</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={booking.experienceName}>
                          {booking.experienceName}
                        </TableCell>
                        <TableCell>{booking.participantName}</TableCell>
                        <TableCell className="text-right">{booking.spots}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(booking.bookingValue, booking.currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(booking.commissionAmount, booking.currency)}
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(booking.commissionStatus)}
                        </TableCell>
                        <TableCell>
                          {new Date(booking.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
