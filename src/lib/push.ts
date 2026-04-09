import webPush from 'web-push';

let initialized = false;

function init() {
  if (initialized) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    console.warn('VAPID keys not set, push disabled');
    return;
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  initialized = true;
}

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
  init();
  if (!initialized) return false;
  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) return false;
    console.error('Push failed:', err);
    return false;
  }
}
