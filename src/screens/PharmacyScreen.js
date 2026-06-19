// src/screens/PharmacyScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Alert, Modal, Platform } from 'react-native';
import { db, firebaseAuth } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function PharmacyScreen({ onOpenChat, onToast, province, pharmacyName, userId }) {
  const { theme } = useTheme();
  const [requests, setRequests] = useState([]);
  const [patientNames, setPatientNames] = useState({});
  const [dots, setDots] = useState({});
  
  // 🔴 حالتان للتحكم في نافذة تكبير صورة الوصفة الطبية لقائمة الطلبات
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgModalVisible, setImgModalVisible] = useState(false);

  const qRef = useRef(null);
  const dotRefs = useRef({});

  // دالة مساعدة لتنسيق وقت الطلب بالتوقيت المحلي العراقي
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    if (!province) return;
    if (qRef.current) db.ref(`requests/${province}`).off('value', qRef.current);
    const q = db.ref(`requests/${province}`).orderByChild('createdAt').limitToLast(100);
    qRef.current = q.on('value', snap => {
      let arr = [];
      snap.forEach(c => {
        const d = c.val();
        if (!(d.hiddenBy?.[userId])) arr.push({ id: c.key, ...d });
      });
      arr.sort((a, b) => b.createdAt - a.createdAt);
      setRequests(arr);
      arr.forEach(r => {
        if (r.patientId && !patientNames[r.patientId]) {
          db.ref(`users/${r.patientId}`).once('value').then(s => {
            if (s.exists()) setPatientNames(p => ({ ...p, [r.patientId]: s.val().patientName || 'مريض' }));
          });
        }
        if (!dotRefs.current[r.id]) {
          const ref = db.ref(`chats/${r.id}/${userId}/unreadPharmacy`);
          dotRefs.current[r.id] = ref.on('value', s => setDots(d => ({ ...d, [r.id]: (s.val() || 0) > 0 })));
        }
      });
    });
    return () => q.off('value', qRef.current);
  }, [province, userId]);

  const updateStatus = async (id, status) => {
    await db.ref(`requests/${province}/${id}`).update({ status });
    onToast('تم التحديث ✅');
  };

  const hideReq = (id) => {
    Alert.alert('إخفاء', 'إخفاء هذا الطلب من قائمتك؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'إخفاء', onPress: () => db.ref(`requests/${province}/${id}/hiddenBy`).update({ [userId]: true }).then(() => onToast('تم الإخفاء')) },
    ]);
  };

  // دالة لفتح تكبير الصورة عند الضغط عليها
  const handleOpenImage = (imgUri) => {
    setSelectedImg(imgUri);
    setImgModalVisible(true);
  };

  const badge = (s) => s === 'available' ? { t: '✅ متوفر', c: '#4caf50', b: 'rgba(76,175,80,0.15)' }
    : s === 'rejected' ? { t: '❌ غير متوفر', c: '#f44336', b: 'rgba(244,67,54,0.15)' }
    : { t: '⏳ انتظار', c: '#ffb300', b: 'rgba(255,193,7,0.15)' };

  const st = mkStyles(theme);
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={[st.header, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
        <Text style={st.icon}>💊</Text>
        <Text style={[st.title, { color: theme.primary }]}>
          الطلبات الواردة{'\n'}({pharmacyName}) [{province}]
        </Text>
      </View>
      {requests.length === 0
        ? <Text style={[st.empty, { color: theme.subText }]}>لا توجد طلبات حالياً في محافظتك.</Text>
        : <FlatList
            data={requests}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 15, paddingBottom: 100 }}
            renderItem={({ item }) => {
              const b = badge(item.status);
              const dist = isNaN(item.distance) ? item.distance : `${item.distance} كم`;
              return (
                <View style={[st.item, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    
                    {/* 🔴 جعل صورة الطلب قابلة للنقر لتكبيرها بملء الشاشة */}
                    {item.image ? (
                      <TouchableOpacity onPress={() => handleOpenImage(item.image)}>
                        <Image source={{ uri: item.image }} style={{ width: 55, height: 55, borderRadius: 8, borderWidth: 1, borderColor: theme.border }} />
                      </TouchableOpacity>
                    ) : null}

                    <View style={{ flex: 1 }}>
                      <Text style={[st.medName, { color: theme.text }]}>{item.name}</Text>
                      
                      {/* 🕒 سطر تفاصيل المريض والوقت بشكل متقابل ومتناسق */}
                      <View style={st.patientRow}>
                        <Text style={[st.timeText, { color: theme.subText }]}>
                          🕒 {formatTime(item.createdAt)}
                        </Text>
                        <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '500' }}>
                          👤 {patientNames[item.patientId] || 'جاري...'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <View style={{ backgroundColor: b.b, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: b.c, fontSize: 11, fontWeight: 'bold' }}>{b.t}</Text>
                        </View>
                        <View style={{ backgroundColor: 'rgba(0,121,107,0.1)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: theme.primary, fontSize: 11 }}>📍 {dist}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={st.actions}>
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#4caf50' }]} onPress={() => updateStatus(item.id, 'available')}>
                      <Text style={st.btnTxt}>✓ متوفر</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#ff9800' }]} onPress={() => updateStatus(item.id, 'rejected')}>
                      <Text style={st.btnTxt}>✕ غير متوفر</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#0288d1' }]} onPress={() => onOpenChat(item.id, item.name)}>
                      <Text style={st.btnTxt}>💬 {dots[item.id] ? '🔴' : ''}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.btn, { backgroundColor: '#f44336' }]} onPress={() => hideReq(item.id)}>
                      <Text style={st.btnTxt}>إخفاء</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
      }

      {/* 🔴 واجهة عارض الصور بملء الشاشة المدمجة للطلبات */}
      <Modal visible={imgModalVisible} transparent={true} animationType="fade" onRequestClose={() => { setImgModalVisible(false); setSelectedImg(null); }}>
        <View style={st.modalBackground}>
          <TouchableOpacity style={st.closeImgBtn} onPress={() => { setImgModalVisible(false); setSelectedImg(null); }}>
            <Text style={st.closeImgTxt}>×</Text>
          </TouchableOpacity>
          {selectedImg && (
            <Image source={{ uri: selectedImg }} style={st.fullImage} resizeMode="contain" />
          )}
        </View>
      </Modal>

    </View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  header: { margin: 15, padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  icon: { fontSize: 38 },
  title: { fontSize: 15, fontWeight: 'bold', textAlign: 'center', marginTop: 5 },
  empty: { textAlign: 'center', marginTop: 24, fontStyle: 'italic' },
  item: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  medName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  patientRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, width: '100%' },
  timeText: { fontSize: 11, fontWeight: '400' },
  actions: { flexDirection: 'row', gap: 6, marginTop: 11, justifyContent: 'flex-end', flexWrap: 'wrap' },
  btn: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 6 },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  
  // 🔴 ستايلات عارض صورة الطلب بكامل الشاشة
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImgBtn: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 55, right: 25, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.25)', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  closeImgTxt: { color: 'white', fontSize: 32, fontWeight: '300', marginTop: -4 },
  fullImage: { width: '100%', height: '85%' }
});
