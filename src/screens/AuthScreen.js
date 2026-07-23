// src/screens/AuthScreen.js
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView, Dimensions, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { firebaseAuth, db, arabicError } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';
import ProvincePicker from '../components/ProvincePicker';

const { width } = Dimensions.get('window');

const saveFcmToken = async (uid) => {
  try {
    console.log('سيتم التعامل مع التوكن عبر نظام إشعارات Expo المستدعى في App.js');
  } catch (e) {
    console.log('❌ خطأ في حفظ التوكن:', e);
  }
};

export default function AuthScreen({ onToast }) {
  const { theme, isDark, toggle } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [method, setMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [province, setProvince] = useState('بغداد');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const confirmRef = useRef(null);

  const handlePharmacyWhatsApp = () => {
    const phoneNumber = '9647823017544';
    const message = 'مرحباً، أود تسجيل صيدليتي وتفعيل الحساب في تطبيق دليلك الدوائي.';
    const url = `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) return Linking.openURL(url);
        const webUrl = `https://api.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
        return Linking.openURL(webUrl);
      })
      .catch(() => onToast('يرجى التأكد من تثبيت تطبيق واتساب', 'error'));
  };

  const handleEmail = async () => {
    if (!email || !password) return onToast('يرجى إدخال البريد وكلمة المرور', 'error');
    setLoading(true);
    try {
      if (isLogin) {
        const cred = await firebaseAuth.signInWithEmailAndPassword(email.trim(), password.trim());
        await saveFcmToken(cred.user.uid);
      } else {
        if (!fullName.trim()) { setLoading(false); return onToast('يرجى كتابة الاسم الكامل', 'error'); }
        const cred = await firebaseAuth.createUserWithEmailAndPassword(email.trim(), password.trim());
        await db.ref(`users/${cred.user.uid}`).set({
          role: 'patient', patientName: fullName.trim(), email: email.trim(),
          province, subscriptionExpiry: Date.now() + 30 * 86400000,
        });
        await saveFcmToken(cred.user.uid);
      }
    } catch (e) { 
      onToast(e.code ? arabicError(e.code) : 'حدث خطأ في عملية التحقق', 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleSendOtp = async () => {
    let p = phone.trim();
    if (!p) return onToast('أدخل رقم الهاتف', 'error');
    if (!p.startsWith('+')) p = '+' + p;
    setLoading(true);
    try {
      confirmRef.current = await firebaseAuth.signInWithPhoneNumber(p);
      setOtpSent(true);
      onToast('تم إرسال رمز التفعيل 💬');
    } catch (e) { 
      onToast(e.code ? arabicError(e.code) : 'خطأ في إرسال الرمز', 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleOtp = async () => {
    if (!otp.trim()) return onToast('أدخل رمز التحقق', 'error');
    setLoading(true);
    try {
      const r = await confirmRef.current.confirm(otp.trim());
      const snap = await db.ref(`users/${r.user.uid}`).once('value');
      if (!snap.exists()) {
        await db.ref(`users/${r.user.uid}`).set({
          role: 'patient', patientName: 'مريض جديد',
          phone: r.user.phoneNumber, province,
          subscriptionExpiry: Date.now() + 30 * 86400000,
        });
      }
      await saveFcmToken(r.user.uid);
      onToast('تم الدخول بنجاح!');
    } catch { 
      onToast('رمز خاطئ أو منتهي الصلاحية', 'error'); 
    } finally { 
      setLoading(false); 
    }
  };

  const s = styles(theme);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <LinearGradient
            colors={[theme.primary, '#00796b']}
            style={s.headerGradient}
          >
            <Text style={s.appName}>دليلك الدوائي</Text>
            <Text style={s.appSub}>دليلك الشامل للأدوية والمعلومات الطبية</Text>
          </LinearGradient>
          <TouchableOpacity style={s.themeBtn} onPress={toggle}>
            <Text style={{ fontSize: 20 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <Text style={[s.title, { color: theme.primary }]}>
            {isLogin ? 'تسجيل الدخول' : 'حساب جديد'}
          </Text>
          <Text style={[s.sub, { color: theme.subText }]}>
            {isLogin ? 'مرحباً، سجّل دخولك للمتابعة' : 'أنشئ حسابك الآن'}
          </Text>

          <View style={s.tabs}>
            {['email', 'phone'].map(m => (
              <TouchableOpacity
                key={m}
                style={[s.tab, { borderColor: theme.border, backgroundColor: method === m ? theme.primary : theme.bg }]}
                onPress={() => setMethod(m)}
              >
                <Text style={{ color: method === m ? 'white' : theme.text, fontWeight: 'bold', fontSize: 13 }}>
                  {m === 'email' ? '📧 البريد الإلكتروني' : '📱 رقم الهاتف'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ProvincePicker label="📍 المحافظة:" value={province} onChange={setProvince} />

          {method === 'email' && (
            <>
              {!isLogin && (
                <TextInput
                  style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="الاسم الكامل"
                  placeholderTextColor={theme.subText}
                  value={fullName}
                  onChangeText={setFullName}
                  textAlign="right"
                />
              )}
              <TextInput
                style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="البريد الإلكتروني"
                placeholderTextColor={theme.subText}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                textAlign="right"
              />
              <TextInput
                style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="كلمة المرور"
                placeholderTextColor={theme.subText}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textAlign="right"
              />
            </>
          )}

          {method === 'phone' && (
            !otpSent
              ? <TextInput
                  style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="+9647700000000"
                  placeholderTextColor={theme.subText}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  textAlign="right"
                />
              : <TextInput
                  style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="رمز التحقق (6 أرقام)"
                  placeholderTextColor={theme.subText}
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="numeric"
                  maxLength={6}
                  textAlign="right"
                />
          )}

          <TouchableOpacity
            style={[s.btn, { backgroundColor: theme.primary }]}
            onPress={method === 'email' ? handleEmail : (!otpSent ? handleSendOtp : handleOtp)}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={s.btnTxt}>
                  {method === 'email'
                    ? (isLogin ? 'دخول 🚀' : 'إنشاء حساب ✅')
                    : (!otpSent ? 'إرسال رمز التفعيل 📲' : 'تأكيد الرمز ✅')}
                </Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ marginTop: 10 }}>
            <Text style={{ color: theme.primary, textAlign: 'center', textDecorationLine: 'underline', fontSize: 14 }}>
              {isLogin ? 'ليس لديك حساب؟ إنشاء حساب جديد' : 'لديك حساب؟ تسجيل الدخول'}
            </Text>
          </TouchableOpacity>

          <View style={{ width: '100%', height: 1, backgroundColor: theme.border, marginVertical: 18 }} />

          <TouchableOpacity
            style={[s.pharmacyBtn, { borderColor: theme.primary }]}
            onPress={handlePharmacyWhatsApp}
          >
            <Text style={[s.pharmacyBtnTxt, { color: theme.primary }]}>
              🟢 أنشاء حساب صيدلية (تواصل عبر واتساب)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (theme) => StyleSheet.create({
  header: { borderRadius: 16, overflow: 'hidden', marginBottom: 20, position: 'relative' },
  headerGradient: { padding: 30, alignItems: 'center' },
  appName: { fontSize: 28, fontWeight: 'bold', color: 'white', marginBottom: 6 },
  appSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  themeBtn: {
    position: 'absolute', top: 12, left: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  card: { padding: 22, borderRadius: 16, borderWidth: 1, elevation: 4 },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 13, textAlign: 'center', marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tab: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  input: { padding: 13, borderWidth: 2, borderRadius: 8, fontSize: 15, marginBottom: 13 },
  btn: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  btnTxt: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  pharmacyBtn: {
    paddingVertical: 13, paddingHorizontal: 15, borderWidth: 1.5,
    borderRadius: 8, borderStyle: 'dashed', alignItems: 'center',
    justifyContent: 'center', width: '100%', backgroundColor: 'rgba(0,121,107,0.03)',
  },
  pharmacyBtnTxt: { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
});
