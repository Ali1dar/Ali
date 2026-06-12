// src/screens/PatientScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, Alert, ScrollView, ActivityIndicator, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { db, firebaseAuth, getDistanceKm } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';
import ProvincePicker from '../components/ProvincePicker';

export default function PatientScreen({ onOpenChat, onOpenNearby, onToast, province, onProvinceChange }) {
  const { theme } = useTheme();
  const [medInput, setMedInput] = useState('');
  const [image, setImage] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const listenerRef = useRef(null);

  useEffect(() => {
    if (!province || !firebaseAuth.currentUser) return;
    const q = db.ref(`requests/${province}`).orderByChild('patientId').equalTo(firebaseAuth.currentUser.uid);
    listenerRef.current = q.on('value', snap => {
      let arr = [];
      snap.forEach(c => arr.push({ id: c.key, ...c.val() }));
      arr.sort((a, b) => b.createdAt - a.createdAt);
      setRequests(arr);
    });
    return () => q.off('value', listenerRef.current);
  }, [province]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح بالوصول للمعرض', 'error');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6, base64: true, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImage({ uri: result.assets[0].uri, base64: `data:image/jpeg;base64,${result.assets[0].base64}` });
      onToast('تم إرفاق الصورة ✅');
    }
  };

  const sendRequest = async (name, distance) => {
    const ref = db.ref(`requests/${province}`).push();
    await ref.set({
      name: name || 'وصفة طبية (صورة مرفقة)',
      image: image?.base64 || '',
      distance, status: 'pending',
      createdAt: Date.now(),
      patientId: firebaseAuth.currentUser.uid,
      province,
    });
    setMedInput(''); setImage(null);
    onToast('تم إرسال الطلب بنجاح! ✅');
  };

  const handleSearch = async () => {
    const name = medInput.trim();
    if (!name && !image) return onToast('اكتب اسم الدواء أو أرفق صورة!', 'error');
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        sendRequest(name, getDistanceKm(loc.coords.latitude, loc.coords.longitude, 32.616, 44.0249));
      } else {
        sendRequest(name, 'غير محدد');
      }
    } catch { sendRequest(name, 'غير محدد'); }
    finally { setLoading(false); }
  };

  const deleteReq = (id) => {
    Alert.alert('تأكيد الحذف', 'هل تريد إلغاء هذا الطلب نهائياً؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: async () => {
        await db.ref(`requests/${province}/${id}`).remove();
        await db.ref(`chats/${id}`).remove();
        onToast('تم الحذف');
      }},
    ]);
  };

  const badge = (s) => s === 'available' ? { t: '✅ متوفر', c: '#4caf50', b: 'rgba(76,175,80,0.15)' }
    : s === 'rejected' ? { t: '❌ غير متوفر', c: '#f44336', b: 'rgba(244,67,54,0.15)' }
    : { t: '⏳ قيد الانتظار', c: '#ffb300', b: 'rgba(255,193,7,0.15)' };

  const st = mkStyles(theme);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={[st.provinceBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
        <ProvincePicker label="📍 محافظتك الحالية:" value={province} onChange={onProvinceChange} />
      </View>

      <View style={[st.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
        <Text style={st.icon}>🔍</Text>
        <Text style={[st.cardTitle, { color: theme.primary }]}>البحث عن الدواء</Text>
        <Text style={[st.cardSub, { color: theme.subText }]}>اكتب اسم العلاج أو أرفق صورة الوصفة</Text>

        <View style={st.row}>
          <TextInput style={[st.input, { backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }]}
            placeholder="اسم الدواء..." placeholderTextColor={theme.subText}
            value={medInput} onChangeText={setMedInput} textAlign="right" />
          <TouchableOpacity style={[st.camBtn, { borderColor: theme.border, backgroundColor: theme.cardBg }]} onPress={pickImage}>
            <Text style={{ fontSize: 22 }}>📷</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <View style={{ alignItems: 'flex-end', marginBottom: 10 }}>
            <Image source={{ uri: image.uri }} style={{ width: 75, height: 75, borderRadius: 8 }} />
            <TouchableOpacity onPress={() => setImage(null)}>
              <Text style={{ color: '#f44336', fontSize: 12, marginTop: 3 }}>✕ إزالة</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[st.searchBtn, { backgroundColor: theme.primary }, loading && { opacity: 0.7 }]} onPress={handleSearch} disabled={loading}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={st.btnTxt}>إرسال الطلب 📤</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[st.searchBtn, { backgroundColor: '#607d8b', marginTop: 10 }]} onPress={onOpenNearby}>
          <Text style={st.btnTxt}>🏥 عرض الصيدليات القريبة والخافرة</Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 15 }}>
        <Text style={[st.sectionTitle, { color: theme.primary }]}>📋 طلباتي السابقة:</Text>
        {requests.length === 0
          ? <Text style={[st.empty, { color: theme.subText }]}>لا توجد طلبات سابقة.</Text>
          : <FlatList data={requests} keyExtractor={i => i.id} scrollEnabled={false} renderItem={({ item }) => {
              const b = badge(item.status);
              return (
                <View style={[st.reqItem, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                    {item.image ? <Image source={{ uri: item.image }} style={{ width: 48, height: 48, borderRadius: 7 }} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={[{ fontWeight: 'bold', textAlign: 'right' }, { color: theme.text }]}>{item.name}</Text>
                      <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
                        <View style={{ backgroundColor: b.b, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: b.c, fontSize: 11, fontWeight: 'bold' }}>{b.t}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={[st.actBtn, { backgroundColor: '#0288d1' }]} onPress={() => onOpenChat(item.id, item.name)}>
                      <Text style={st.actTxt}>💬 المحادثة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.actBtn, { backgroundColor: '#f44336' }]} onPress={() => deleteReq(item.id)}>
                      <Text style={st.actTxt}>🗑 إلغاء</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }} />
        }
      </View>
    </ScrollView>
  );
}

const mkStyles = (t) => StyleSheet.create({
  provinceBox: { margin: 15, marginBottom: 5, padding: 14, borderRadius: 10, borderWidth: 1 },
  card: { margin: 15, padding: 22, borderRadius: 15, borderWidth: 1, alignItems: 'center', elevation: 3 },
  icon: { fontSize: 40, marginBottom: 6 },
  cardTitle: { fontSize: 21, fontWeight: 'bold', marginBottom: 4 },
  cardSub: { fontSize: 13, textAlign: 'center', marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12 },
  input: { flex: 1, padding: 12, borderWidth: 2, borderRadius: 8, fontSize: 15 },
  camBtn: { padding: 12, borderWidth: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  searchBtn: { width: '100%', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', textAlign: 'right', marginBottom: 10 },
  empty: { fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  reqItem: { padding: 14, borderWidth: 1, borderRadius: 12, marginBottom: 10 },
  actBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 7 },
  actTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 },
});
