import webPush from 'web-push';

webPush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface PushPayload {
  title: string;
  body: string;
  ticker: string;
  signal: 'buy' | 'sell' | 'hold';
  url?: string;
}

export async function sendPushNotification(
  subscription: webPush.PushSubscription,
  payload: PushPayload
): Promise<boolean> {
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — should be removed from DB
      return false;
    }
    console.error('Push failed:', err);
    return false;
  }
}
