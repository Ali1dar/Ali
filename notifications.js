import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { ref, update } from 'firebase/database';
import { db } from './src/utils/firebase';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// إعداد كيفية عرض الإشعار
// وهو التطبيق مفتوح
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // يظهر الإشعار
    shouldPlaySound: true,   // يشغل صوت
    shouldSetBadge: true,    // يضيف رقم على الأيقونة
  }),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// تسجيل المستخدم وجلب التوكن
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function registerForPushNotifications(userId) {
  try {
    // تأكد أنه جهاز حقيقي وليس محاكي
    if (!Device.isDevice) {
      console.warn('⚠️ الإشعارات لا تعمل على المحاكي');
      return null;
    }

    // طلب إذن الإشعارات من المستخدم
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('❌ المستخدم رفض إذن الإشعارات');
      return null;
    }

    // جلب Expo Token
    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId: '41c1978d-89f2-46ff-80f1-0401f1eabe23',
      })
    ).data;

    console.log('✅ Expo Token:', token);

    // حفظ التوكن في Firebase
    await update(ref(db, `users/${userId}`), {
      fcm_token: token,
    });

    console.log('✅ تم حفظ التوكن في Firebase');
    return token;

  } catch (e) {
    console.error('❌ خطأ في التوكن:', e.message);
    return null;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// الاستماع للإشعارات
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function setupNotificationListeners(navigation) {
  // إشعار وصل والتطبيق مفتوح
  const sub1 = Notifications.addNotificationReceivedListener(notification => {
    console.log('📩 إشعار وصل:', notification);
  });

  // المستخدم ضغط على الإشعار
  const sub2 = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data;
    console.log('👆 ضغط على الإشعار:', data);

    // توجيه المستخدم للشاشة المناسبة
    if (data?.requestId && navigation) {
      navigation.navigate('OrderDetails', { 
        requestId: data.requestId 
      });
    }
  });

  // إرجاع دالة التنظيف
  return () => {
    sub1.remove();
    sub2.remove();
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// إرسال إشعار لمستخدم آخر
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function sendPushNotification(targetUserId, title, body, requestId = '') {
  try {
    // جلب توكن المستخدم المستهدف من Firebase
    const snapshot = await get(ref(db, `users/${targetUserId}`));
    if (!snapshot.exists()) return;

    const token = snapshot.val().fcm_token;
    if (!token) {
      console.warn('⚠️ لا يوجد توكن لهذا المستخدم');
      return;
    }

    // إرسال الإشعار عبر Vercel
    const response = await fetch(
      'https://vercel-api-five-omega.vercel.app/api/notify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token, 
          title, 
          body, 
          requestId 
        }),
      }
    );

    const result = await response.json();
    console.log('✅ نتيجة الإرسال:', result);

  } catch (e) {
    console.error('❌ خطأ في إرسال الإشعار:', e.message);
  }
}
