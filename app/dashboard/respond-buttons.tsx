'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { respondToMatchRequestAction } from './actions';

export function RespondButtons({ matchRequestId }: { matchRequestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function respond(decision: 'accepted' | 'declined') {
    start(async () => {
      await respondToMatchRequestAction({ id: matchRequestId, decision });
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => respond('accepted')} disabled={pending}>
        <Check className="mr-1 size-4" /> Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => respond('declined')} disabled={pending}>
        <X className="mr-1 size-4" /> Decline
      </Button>
    </div>
  );
}
