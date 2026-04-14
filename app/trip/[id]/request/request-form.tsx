'use client';

import { useState, useTransition } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { sendMatchRequestAction } from './actions';

export function RequestForm({
  tripId,
  posterName,
  isFamilyPoster,
}: {
  tripId: string;
  posterName: string;
  isFamilyPoster: boolean;
}) {
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const result = await sendMatchRequestAction({ trip_id: tripId, intro_message: message });
      if (!result.ok) setErr(result.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <Alert variant="warm">
        <AlertTitle>Request sent.</AlertTitle>
        <AlertDescription>
          {posterName} will get an email and an in-app notification. You'll hear back as soon as
          they respond.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {err ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn't send</AlertTitle>
          <AlertDescription>{err}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="intro">A short intro</Label>
        <Textarea
          id="intro"
          required
          minLength={30}
          maxLength={1000}
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            isFamilyPoster
              ? `Hi ${posterName}, I'm on the same flight on this date — happy to help at the Doha transfer. My Bengali is fluent; I usually fly this route two or three times a year.`
              : `Hi ${posterName}, my mother is on this flight and would really appreciate a hand at Doha. She speaks Bengali, walks slowly, and is 72.`
          }
        />
        <p className="text-xs text-muted-foreground">
          Say who you are, why you can help, and mention the shared language.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || message.trim().length < 30}>
          {pending ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </form>
  );
}
