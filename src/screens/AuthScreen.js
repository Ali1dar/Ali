// src/screens/AuthScreen.js - صورة splash تملأ الشاشة بالكامل
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
  ImageBackground, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { firebaseAuth, db, PROVINCES, arabicError } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';
import ProvincePicker from '../components/ProvincePicker';

const { width, height } = Dimensions.get('window');

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

  const handleEmail = async () => {
    if (!email || !password) return onToast('يرجى إدخال البريد وكلمة المرور', 'error');
    setLoading(true);
    try {
      if (isLogin) {
        await firebaseAuth.signInWithEmailAndPassword(email.trim(), password.trim());
      } else {
        if (!fullName.trim()) { setLoading(false); return onToast('يرجى كتابة الاسم الكامل', 'error'); }
        const cred = await firebaseAuth.createUserWithEmailAndPassword(email.trim(), password.trim());
        await db.ref(`users/${cred.user.uid}`).set({
          role: 'patient', patientName: fullName.trim(), email: email.trim(),
          province, subscriptionExpiry: Date.now() + 30 * 86400000,
        });
      }
    } catch (e) { onToast(arabicError(e.code), 'error'); }
    finally { setLoading(false); }
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
    } catch (e) { onToast(arabicError(e.code), 'error'); }
    finally { setLoading(false); }
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
      onToast('تم الدخول بنجاح!');
    } catch { onToast('رمز خاطئ أو منتهي الصلاحية', 'error'); }
    finally { setLoading(false); }
  };

  const s = styles(theme);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* ── Hero Banner يملأ الشاشة ── */}
      <ImageBackground
        source={require('../../assets/splash.png')}
        style={s.heroBg}
        resizeMode="cover"
      >
        {/* طبقة تدرج فوق الصورة لتحسين وضوح النص */}
        <LinearGradient
          colors={['rgba(0,77,64,0.55)', 'rgba(0,121,107,0.85)', 'rgba(0,77,64,0.97)']}
          style={s.heroGradient}
        >
          {/* زر الوضع الليلي في الأعلى */}
          <TouchableOpacity style={s.themeBtn} onPress={toggle}>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>

          {/* عنوان التطبيق */}
          <View style={s.heroContent}>
            <Text style={s.heroIcon}>💊</Text>
            <Text style={s.heroTitle}>دليلك الدوائي</Text>
            <Text style={s.heroSub}>ابحث عن دوائك في أقرب صيدلية</Text>
          </View>
        </LinearGradient>
      </ImageBackground>

      {/* ── بطاقة تسجيل الدخول ── */}
      <ScrollView
        style={[s.formArea, { backgroundColor: theme.bg }]}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <Text style={[s.title, { color: theme.primary }]}>{isLogin ? 'تسجيل الدخول' : 'حساب جديد'}</Text>
          <Text style={[s.sub, { color: theme.subText }]}>{isLogin ? 'مرحباً، سجّل دخولك للمتابعة' : 'أنشئ حسابك الآن'}</Text>

          {/* Tabs */}
          <View style={s.tabs}>
            {['email', 'phone'].map(m => (
              <TouchableOpacity key={m} style={[s.tab, { borderColor: theme.border, backgroundColor: method === m ? theme.primary : theme.bg }]} onPress={() => setMethod(m)}>
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
                <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="الاسم الكامل" placeholderTextColor={theme.subText}
                  value={fullName} onChangeText={setFullName} textAlign="right" />
              )}
              <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="البريد الإلكتروني" placeholderTextColor={theme.subText}
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textAlign="right" />
              <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="كلمة المرور" placeholderTextColor={theme.subText}
                value={password} onChangeText={setPassword} secureTextEntry textAlign="right" />
            </>
          )}

          {method === 'phone' && (
            !otpSent
              ? <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="+9647700000000" placeholderTextColor={theme.subText}
                  value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign="right" />
              : <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="رمز التحقق (6 أرقام)" placeholderTextColor={theme.subText}
                  value={otp} onChangeText={setOtp} keyboardType="numeric" maxLength={6} textAlign="right" />
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
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (theme) => StyleSheet.create({
  // Hero يملأ ثلث الشاشة العلوي
  heroBg: {
    width: width,
    height: height * 0.35,
  },
  heroGradient: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 40 : 55,
    paddingHorizontal: 20,
  },
  themeBtn: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroIcon: { fontSize: 48, marginBottom: 8 },
  heroTitle: { color: 'white', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6, textAlign: 'center' },

  // بطاقة النموذج
  formArea: { flex: 1 },
  card: {
    padding: 22, borderRadius: 16, borderWidth: 1, elevation: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 13, textAlign: 'center', marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tab: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  input: { padding: 13, borderWidth: 2, borderRadius: 8, fontSize: 15, marginBottom: 13 },
  btn: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  btnTxt: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
