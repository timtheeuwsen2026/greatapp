import { useQuery } from '@tanstack/react-query';
import CopyableLink from './CopyableLink';

export default function PartnerLinks({ experienceId, entryId }: { experienceId?: string; entryId: string }) {
  const { data } = useQuery<any[]>({ queryKey: [`/api/experiences/${experienceId}/partners`], enabled: !!experienceId });
  const row = data?.find(row => (row.entryId || row.id) === entryId);
  return <div className="mt-3 space-y-2">
    {row?.inviteToken && row.status !== 'confirmed' && <CopyableLink
      url={`${window.location.origin}/invite/${row.inviteToken}`} label="Copy invitation link"
      note="Private invitation for the partner to review and accept." />}
    {row?.shareUrl ? <CopyableLink url={row.shareUrl} label="Copy partner tracking link"
      note="This is the link they share with members. Only its bookings count towards their deal." />
      : <p className="text-xs text-muted-foreground">Save the event to issue the invitation. The tracking or member-discount link becomes available here and on Partner Home after acceptance.</p>}
  </div>;
}
