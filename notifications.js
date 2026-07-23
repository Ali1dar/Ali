import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, PermissionsAndroid } from 'react-native';
import { db } from './src/utils/firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(userId) {
  try {
    if (!Device.isDevice) {
      console.warn('⚠️ الإشعارات تحتاج جهاز حقيقي');
      return null;
    }

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('❌ المستخدم رفض إذن الإشعارات');
      return null;
    }

    // نفس نوع FCM token اللي كان يرجعه react-native-firebase
    const tokenResponse = await Notifications.getDevicePushTokenAsync();
    const token = tokenResponse.data;
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
  const foregroundSub = Notifications.addNotificationReceivedListener(notification => {
    console.log('📩 إشعار وصل:', notification.request.content);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    console.log('👆 ضغط على الإشعار:', data);
    if (data?.requestId && navigation) {
      navigation.navigate('OrderDetails', { requestId: data.requestId });
    }
  });

  return () => {
    foregroundSub.remove();
    responseSub.remove();
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
