import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { ref, update, get } from 'firebase/database';
import { db } from './src/utils/firebase';

// إعداد الإشعارات في الخلفية
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('إشعار في الخلفية:', remoteMessage);
});

export async function registerForPushNotifications(userId) {
  try {
    // طلب الصلاحية (مهم لـ iOS)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.warn('❌ الصلاحية مرفوضة');
      return null;
    }

    // جلب FCM Token
    const token = await messaging().getToken();
    console.log('✅ FCM Token:', token);

    // حفظ التوكن في Firebase — منفصل فقط
    await update(ref(db, `users/${userId}`), {
      fcm_token: token,
    });

    console.log('✅ تم حفظ التوكن في Firebase');

    // عند تجديد التوكن تلقائياً
    messaging().onTokenRefresh(async newToken => {
      console.log('🔄 تجديد التوكن:', newToken);
      await update(ref(db, `users/${userId}`), {
        fcm_token: newToken,
      });
    });

    return token;

  } catch (e) {
    console.error('❌ خطأ في التوكن:', e.message);
    return null;
  }
}

// الاستماع للإشعارات وقت فتح التطبيق
export function setupNotificationListeners() {
  // التطبيق مفتوح
  const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
    console.log('📩 إشعار Foreground:', remoteMessage);
  });

  // المستخدم ضغط على الإشعار من الخلفية
  messaging().onNotificationOpenedApp(remoteMessage => {
    console.log('👆 فتح من الخلفية:', remoteMessage);
  });

  // التطبيق كان مغلقاً تماماً
  messaging()
    .getInitialNotification()
    .then(remoteMessage => {
      if (remoteMessage) {
        console.log('🚀 فتح من الإغلاق التام:', remoteMessage);
      }
    });

  return unsubscribeForeground;
}

// إرسال إشعار عبر Vercel API
export async function sendPushNotification(targetUserId, title, body) {
  try {
    const snapshot = await get(ref(db, `users/${targetUserId}`));
    if (!snapshot.exists()) return;
    const token = snapshot.val().fcm_token;
    if (!token) return;

    await fetch('https://vercel-api-five-omega.vercel.app/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, title, body }),
    });
  } catch (e) {
    console.error('خطأ في الإشعار:', e.message);
  }
}
