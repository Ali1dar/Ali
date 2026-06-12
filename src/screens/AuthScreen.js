// src/screens/AuthScreen.js
import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { firebaseAuth, db, PROVINCES, arabicError } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';
import ProvincePicker from '../components/ProvincePicker';

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
  const { t } = { t: theme };

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#00796b', '#004d40']} style={s.header}>
          <Text style={s.headerTitle}>دليلك الدوائي</Text>
          <TouchableOpacity style={s.themeBtn} onPress={toggle}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </LinearGradient>

        <View style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <Text style={s.icon}>🔐</Text>
          <Text style={[s.title, { color: theme.primary }]}>{isLogin ? 'تسجيل الدخول' : 'حساب جديد'}</Text>
          <Text style={[s.sub, { color: theme.subText }]}>{isLogin ? 'مرحباً، سجّل دخولك للمتابعة' : 'أنشئ حسابك الآن'}</Text>

          {/* Tabs */}
          <View style={s.tabs}>
            {['email', 'phone'].map(m => (
              <TouchableOpacity key={m} style={[s.tab, { borderColor: theme.border, backgroundColor: method === m ? theme.primary : theme.bg }]} onPress={() => setMethod(m)}>
                <Text style={{ color: method === m ? 'white' : theme.text, fontWeight: 'bold', fontSize: 13 }}>
                  {m === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ProvincePicker label="المحافظة:" value={province} onChange={setProvince} />

          {method === 'email' && (
            <>
              {!isLogin && <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="الاسم الكامل" placeholderTextColor={theme.subText} value={fullName} onChangeText={setFullName} textAlign="right" />}
              <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="البريد الإلكتروني" placeholderTextColor={theme.subText} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" textAlign="right" />
              <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="كلمة المرور" placeholderTextColor={theme.subText} value={password} onChangeText={setPassword} secureTextEntry textAlign="right" />
            </>
          )}

          {method === 'phone' && (
            !otpSent
              ? <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="+9647700000000" placeholderTextColor={theme.subText} value={phone} onChangeText={setPhone} keyboardType="phone-pad" textAlign="right" />
              : <TextInput style={[s.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} placeholder="رمز التحقق (6 أرقام)" placeholderTextColor={theme.subText} value={otp} onChangeText={setOtp} keyboardType="numeric" maxLength={6} textAlign="right" />
          )}

          <TouchableOpacity style={[s.btn, { backgroundColor: theme.primary }]} onPress={method === 'email' ? handleEmail : (!otpSent ? handleSendOtp : handleOtp)} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={s.btnTxt}>{method === 'email' ? (isLogin ? 'دخول' : 'إنشاء حساب') : (!otpSent ? 'إرسال رمز التفعيل' : 'تأكيد الرمز')}</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={{ marginTop: 8 }}>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'android' ? 45 : 60 },
  headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  themeBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  card: { margin: 15, padding: 24, borderRadius: 16, borderWidth: 1, elevation: 4 },
  icon: { fontSize: 42, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  sub: { fontSize: 13, textAlign: 'center', marginBottom: 20 },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tab: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  input: { padding: 13, borderWidth: 2, borderRadius: 8, fontSize: 15, marginBottom: 13 },
  btn: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 4, marginBottom: 10 },
  btnTxt: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
