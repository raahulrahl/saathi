import { Badge } from '@/components/ui/badge';

/**
 * Small coloured badge that labels a trip, match_request, or match row
 * by its `status` column. All three tables use overlapping vocabularies
 * (open / matched / completed / cancelled / pending / accepted /
 * declined / active / disputed), so a single mapping covers them all.
 *
 * Unknown values render verbatim with the `muted` variant so a newly
 * added status in the DB shows up clearly rather than silently
 * disappearing.
 */
export function StatusPill({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? { label: status, variant: 'muted' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

type PillVariant = 'muted' | 'success' | 'destructive' | 'secondary';

const STATUS_MAP: Record<string, { label: string; variant: PillVariant }> = {
  open: { label: 'Open', variant: 'muted' },
  matched: { label: 'Matched', variant: 'success' },
  completed: { label: 'Completed', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'muted' },
  pending: { label: 'Pending', variant: 'muted' },
  accepted: { label: 'Accepted', variant: 'success' },
  declined: { label: 'Declined', variant: 'destructive' },
  auto_declined: { label: 'Auto-declined', variant: 'muted' },
  active: { label: 'Active', variant: 'success' },
  disputed: { label: 'Disputed', variant: 'destructive' },
};
