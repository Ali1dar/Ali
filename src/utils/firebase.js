// src/utils/firebase.js
import firebase from 'firebase/compat/app';
import 'firebase/compat/database';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDtVddk_FoOXoD7_xObpuC_HCjRg94wct4",
  authDomain: "viralboost-web-38eec.firebaseapp.com",
  databaseURL: "https://viralboost-web-38eec-default-rtdb.firebaseio.com",
  projectId: "viralboost-web-38eec",
  storageBucket: "viralboost-web-38eec.firebasestorage.app",
  messagingSenderId: "195415969543",
  appId: "1:195415969543:android:e5ce89d331e23852577fa2",
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// المصادقة عبر الـ modular API مع حفظ الجلسة بـ AsyncStorage
export const firebaseAuth = initializeAuth(firebase.app(), {
  persistence: getReactNativePersistence(AsyncStorage),
});

// قاعدة البيانات تبقى compat (متوافقة مع db.ref(...) بكل الشاشات)
export const db = firebase.database();

// يُستخدم بواسطة FirebaseRecaptchaVerifierModal بشاشة تسجيل الدخول بالرقم
export { firebaseConfig };

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
