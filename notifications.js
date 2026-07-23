import messaging from '@react-native-firebase/messaging';
import { db } from './src/utils/firebase';

export async function registerForPushNotifications(userId) {
  try {
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.warn('❌ المستخدم رفض إذن الإشعارات');
      return null;
    }

    const token = await messaging().getToken();
    console.log('✅ FCM Token:', token);

    await db.ref(`users/${userId}`).update({ fcm_token: token });
    console.log('✅ تم حفظ التوكن في Firebase');
    return token;

  } catch (e) {
    console.error('❌ خطأ في التوكن:', e.message);
    return null;
  }
}

export function setupNotificationListeners(navigation) {
  const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
    console.log('📩 إشعار وصل:', remoteMessage);
  });

  messaging().onNotificationOpenedApp(remoteMessage => {
    const data = remoteMessage?.data;
    console.log('👆 ضغط على الإشعار:', data);
    if (data?.requestId && navigation) {
      navigation.navigate('OrderDetails', { requestId: data.requestId });
    }
  });

  return () => {
    unsubscribeForeground();
  };
}

export async function sendPushNotification(targetUserId, title, body, requestId = '') {
  try {
    const snapshot = await db.ref(`users/${targetUserId}`).once('value');
    if (!snapshot.exists()) return;

    const token = snapshot.val().fcm_token;
    if (!token) {
      console.warn('⚠️ لا يوجد توكن لهذا المستخدم');
      return;
    }

    const response = await fetch(
      'https://vercel-api-five-omega.vercel.app/api/notify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, title, body, requestId }),
      }
    );

    const result = await response.json();
    console.log('✅ نتيجة الإرسال:', result);

  } catch (e) {
    console.error('❌ خطأ في إرسال الإشعار:', e.message);
  }
}
