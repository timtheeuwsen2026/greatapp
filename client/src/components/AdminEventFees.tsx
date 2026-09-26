import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Percent } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest, readableError } from '@/lib/queryClient';
import { eventFeeRates, type FeeRateSource } from '@shared/platformFees';

export default function AdminEventFees({ event }: { event: FeeRateSource & { id: string; title: string } }) {
  const [open, setOpen] = useState(false);
  const [ticket, setTicket] = useState('15');
  const [addon, setAddon] = useState('0');
  const [error, setError] = useState('');
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: async () => {
      if (ticket.trim() === '' || addon.trim() === '') throw new Error('Enter both fee percentages.');
      const response = await apiRequest('PATCH', `/api/admin/experiences/${event.id}/platform-fees`, {
        ticketPlatformFeePct: Number(ticket), addonPlatformFeePct: Number(addon),
      });
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['/api/admin/experiences'] }),
        cache.invalidateQueries({ queryKey: ['/api/experiences'] }),
        cache.invalidateQueries({ queryKey: ['/api/my-experiences'] }),
      ]);
      setOpen(false);
    },
    onError: (failure: Error) => setError(readableError(failure)),
  });
  return <>
    <Button size="sm" variant="outline" data-testid={`button-platform-fees-${event.id}`} onClick={() => {
      const rates = eventFeeRates(event);
      setTicket(String(rates.ticketPlatformFeePct)); setAddon(String(rates.addonPlatformFeePct));
      setError(''); setOpen(true);
    }}><Percent className="mr-1.5 h-4 w-4" />Platform fees</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!save.isPending) setOpen(value); }}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-event-platform-fees">
        <DialogHeader>
          <DialogTitle>Platform fees for this event</DialogTitle>
          <DialogDescription>{event.title}</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(); }}>
          <p className="text-sm text-muted-foreground">Set Great's fee separately for entry tickets and optional add-ons. These settings apply only to this event.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="admin-ticket-fee">Entry ticket fee (%)</Label>
              <Input id="admin-ticket-fee" type="number" min="0" max="100" step="0.01" required value={ticket} onChange={e => setTicket(e.target.value)} />
              <p className="text-xs text-muted-foreground">Starting rate: 15%</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-addon-fee">Add-on fee (%)</Label>
              <Input id="admin-addon-fee" type="number" min="0" max="100" step="0.01" required value={addon} onChange={e => setAddon(e.target.value)} />
              <p className="text-xs text-muted-foreground">0% waives the fee on add-ons.</p>
            </div>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950">
            The venue's agreed share stays the same. Fee changes apply to new checkouts; existing payment agreements keep their saved rates.
          </div>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending} data-testid="button-save-event-fees">{save.isPending ? 'Saving…' : 'Save event fees'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
