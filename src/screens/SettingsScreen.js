// src/screens/SettingsScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Animated, Switch, Platform, ActivityIndicator, BackHandler } from 'react-native';
import * as Location from 'expo-location';
import { db, firebaseAuth } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';
import ProvincePicker from '../components/ProvincePicker';

function SubStatus({ expiry }) {
  const { theme } = useTheme();
  if (!expiry && expiry !== 0) return <View style={s.subBox}><Text style={[s.badge, { backgroundColor: 'rgba(244,67,54,0.15)', color: '#f44336' }]}>لا يوجد اشتراك نشط ✕</Text></View>;
  const n = Number(expiry);
  if (n === -1) return <View style={s.subBox}><Text style={[s.badge, { backgroundColor: 'rgba(13,110,253,0.15)', color: '#0d6efd' }]}>مفتوح / مدى الحياة ♾️</Text></View>;
  const left = n - Date.now();
  if (left <= 0) return <View style={s.subBox}><Text style={[s.badge, { backgroundColor: 'rgba(244,67,54,0.15)', color: '#f44336' }]}>منتهي الاشتراك ❌</Text><Text style={{ color: theme.subText, fontSize: 12 }}>تواصل مع الإدارة للتجديد</Text></View>;
  const days = Math.ceil(left / 86400000);
  return <View style={s.subBox}><Text style={[s.badge, { backgroundColor: 'rgba(76,175,80,0.15)', color: '#4caf50' }]}>نشط ✅</Text><Text style={[s.daysLeft, { color: theme.text }]}>{days} يوم متبقي</Text></View>;
}

export default function SettingsScreen({ visible, onClose, onToast, role, userData }) {
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(700)).current;
  const [saving, setSaving] = useState(false);
  
  const currentRole = role || userData?.role || (userData?.pharmacyName ? 'pharmacy' : 'patient');

  // حالات المريض
  const [patientName, setPatientName] = useState('');
  const [patientProv, setPatientProv] = useState('بغداد');

  // حالات الصيدلية
  const [pharmName, setPharmName] = useState('');
  const [pharmProv, setPharmProv] = useState('بغداد');
  const [hours, setHours] = useState('');
  const [isNight, setIsNight] = useState(false);
  const [exclusive, setExclusive] = useState('');
  const [locStatus, setLocStatus] = useState('لم يتم تحديد الموقع بعد.');
  const [locOk, setLocOk] = useState(false);
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : 700, duration: 300, useNativeDriver: true }).start();
  }, [visible]);

  // 🔴 إضافة مستمع لزر الرجوع الخاص بأندرويد لمنع الخروج من التطبيق
  useEffect(() => {
    const handleBackButton = () => {
      if (visible) {
        onClose(); // إغلاق شاشة الإعدادات فقط
        return true; // إخبار النظام بأننا قمنا بمعالجة الضغطة بنجاح ولا نريد الخروج
      }
      return false; // إذا كانت الشاشة مخفية، اترك السلوك الافتراضي لزر الرجوع يعمل
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    
    // تنظيف المستمع عند تفكيك المكون لحماية الذاكرة
    return () => backHandler.remove();
  }, [visible]);

  useEffect(() => {
    if (userData) {
      setPatientName(userData.patientName || '');
      setPatientProv(userData.province || 'بغداد');

      setPharmName(userData.pharmacyName || '');
      setPharmProv(userData.province || 'بغداد');
      setHours(userData.workingHours || '');
      setIsNight(userData.isNightDuty || false);
      setExclusive(userData.exclusiveProducts || '');
      if (userData.lat && userData.lng) { 
        setLat(userData.lat); 
        setLng(userData.lng); 
        setLocOk(true); 
        setLocStatus('✅ الموقع مسجل.'); 
      }
    }
  }, [userData]);

  const detectLoc = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocStatus('❌ يرجى السماح بتحديد الموقع.'); return; }
    setLocStatus('جاري التحديد...');
    const loc = await Location.getCurrentPositionAsync({});
    setLat(loc.coords.latitude); setLng(loc.coords.longitude);
    setLocOk(true); setLocStatus('✅ تم التقاط الموقع بنجاح.');
  };

  const save = async () => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      if (currentRole === 'patient') {
        if (!patientName.trim()) { onToast('يرجى كتابة الاسم', 'error'); setSaving(false); return; }
        await db.ref(`users/${uid}`).update({ 
          patientName: patientName.trim(),
          province: patientProv 
        });
        onToast('تم تحديث بياناتك بنجاح ✨'); 
        onClose();
      } else {
        if (!pharmName.trim()) { onToast('يرجى كتابة اسم الصيدلية', 'error'); setSaving(false); return; }
        await db.ref(`users/${uid}`).update({ 
          pharmacyName: pharmName.trim(), 
          province: pharmProv, 
          workingHours: hours, 
          isNightDuty: isNight, 
          exclusiveProducts: exclusive, 
          lat, 
          lng 
        });
        onToast('تم تحديث إعدادات الصيدلية ✨'); 
        onClose();
      }
    } catch (e) { 
      onToast('خطأ أثناء الحفظ', 'error'); 
    } finally { 
      setSaving(false); 
    }
  };

  if (!visible) return null;
  const st = mkStyles(theme);
  return (
    <Animated.View style={[st.container, { transform: [{ translateY: slideAnim }], backgroundColor: theme.cardBg }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>{currentRole === 'patient' ? 'إعدادات الحساب' : 'إعدادات الصيدلية'}</Text>
        <TouchableOpacity onPress={onClose}><Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>×</Text></TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1, padding: 20 }} contentContainerStyle={{ paddingBottom: 40 }}>
        {currentRole === 'patient' ? (
          <>
            <Text style={[st.label, { color: theme.primary }]}>الاسم الكامل:</Text>
            <TextInput style={[st.inp, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} value={patientName} onChangeText={setPatientName} placeholder="اسمك الكامل" placeholderTextColor={theme.subText} textAlign="right" />
            
            <Text style={[st.label, { color: theme.primary, marginTop: 10 }]}>المحافظة الحالية:</Text>
            <ProvincePicker value={patientProv} onChange={setPatientProv} />
            <Text style={{ color: theme.subText, fontSize: 11, textAlign: 'right', marginTop: 5 }}>تساعدنا المحافظة في توجيه طلباتك للصيدليات القريبة منك.</Text>
          </>
        ) : (
          <>
            <Text style={[st.label, { color: theme.primary }]}>حالة الاشتراك:</Text>
            <SubStatus expiry={userData?.subscriptionExpiry} />
            <Text style={[st.label, { color: theme.primary }]}>اسم الصيدلية:</Text>
            <TextInput style={[st.inp, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} value={pharmName} onChangeText={setPharmName} placeholder="اسم الصيدلية الرسمي" placeholderTextColor={theme.subText} textAlign="right" />
            <Text style={[st.label, { color: theme.primary }]}>المحافظة:</Text>
            <ProvincePicker value={pharmProv} onChange={setPharmProv} />
            <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 14 }} />
            <Text style={[st.label, { color: theme.primary }]}>📍 الموقع الجغرافي:</Text>
            <TouchableOpacity style={[st.locBtn, { backgroundColor: '#0288d1' }]} onPress={detectLoc}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>{locOk ? '🔄 تحديث الموقع' : '📍 تحديد الموقع (GPS)'}</Text>
            </TouchableOpacity>
            <Text style={{ color: locOk ? '#4caf50' : theme.subText, fontSize: 12, textAlign: 'right', marginBottom: 14 }}>{locStatus}</Text>
            <Text style={[st.label, { color: theme.primary }]}>⏰ أوقات العمل:</Text>
            <TextInput style={[st.inp, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} value={hours} onChangeText={setHours} placeholder="8:00 ص - 11:00 م" placeholderTextColor={theme.subText} textAlign="right" />
            <View style={[st.switchRow, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={[{ fontWeight: 'bold', fontSize: 13, flex: 1, textAlign: 'right' }, { color: theme.text }]}>🌙 صيدلية خافرة (24 ساعة)</Text>
              <Switch value={isNight} onValueChange={setIsNight} trackColor={{ true: theme.primary }} />
            </View>
            <Text style={[st.label, { color: theme.primary, marginTop: 14 }]}>⭐ المنتجات الحصرية / العروض:</Text>
            <TextInput style={[st.inp, st.textarea, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]} value={exclusive} onChangeText={setExclusive} placeholder="المنتجات المتوفرة حصرياً أو العروض الحالية..." placeholderTextColor={theme.subText} multiline numberOfLines={3} textAlign="right" textAlignVertical="top" />
          </>
        )}
        <TouchableOpacity style={[st.saveBtn, { backgroundColor: theme.primary }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>حفظ التغييرات</Text>}
        </TouchableOpacity>
      </ScrollView>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  subBox: { alignItems: 'center', padding: 14, marginBottom: 14 },
  badge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, fontWeight: 'bold', fontSize: 13, overflow: 'hidden' },
  daysLeft: { fontSize: 14, fontWeight: 'bold', marginTop: 5 },
});
const mkStyles = (t) => StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10000 },
  header: { backgroundColor: '#00796b', padding: 15, paddingTop: Platform.OS === 'android' ? 42 : 58, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  label: { fontWeight: 'bold', fontSize: 13, marginBottom: 7, textAlign: 'right' },
  inp: { padding: 12, borderWidth: 2, borderRadius: 8, fontSize: 14, marginBottom: 14 },
  textarea: { minHeight: 80 },
  locBtn: { padding: 13, borderRadius: 8, alignItems: 'center', marginBottom: 7 },
  switchRow: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 8, borderWidth: 1, marginBottom: 5 },
  saveBtn: { padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 16 },
});
