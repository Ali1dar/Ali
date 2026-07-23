// src/utils/firebase.js
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';

export const db = database();
export const firebaseAuth = auth();

export const PROVINCES = [
  'بغداد','أربيل','الأنبار','بابل','البصرة','حلبجة',
  'دهوك','القادسية','ديالى','ذي قار','السليمانية',
  'صلاح الدين','كركوك','كربلاء','المثنى','ميسان',
  'النجف','نينوى','واسط'
];

export function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

export function formatLastSeen(ts) {
  if (!ts) return 'غير نشط';
  if (ts === 'online') return 'متصل الآن';
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (m < 1) return 'نشط منذ ثوانٍ';
  if (m < 60) return `نشط منذ ${m} د`;
  if (h < 24) return `نشط منذ ${h} ساعة`;
  return `نشط منذ ${d} يوم`;
}

export function arabicError(code) {
  const map = {
    'auth/invalid-email': 'البريد الإلكتروني غير صحيح.',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد.',
    'auth/wrong-password': 'كلمة المرور غير صحيحة.',
    'auth/email-already-in-use': 'البريد مسجل مسبقاً، سجّل دخول.',
    'auth/weak-password': 'كلمة المرور قصيرة جداً (6 أحرف على الأقل).',
    'auth/network-request-failed': 'تحقق من اتصالك بالإنترنت.',
    'auth/too-many-requests': 'محاولات كثيرة، انتظر قليلاً.',
    'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة.',
  };
  return map[code] || 'حدث خطأ، حاول مجدداً.';
}
