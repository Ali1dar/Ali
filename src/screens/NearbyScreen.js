// src/screens/NearbyScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Platform } from 'react-native';
import { db } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function NearbyScreen({ visible, onClose, province, onDirectChat }) {
  const { theme } = useTheme();
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 🔴 مرجع (Ref) لحفظ المستمع الحالي ليتم إغلاقه بشكل صحيح ومنع التكرار
  const pharmaciesQueryRef = useRef(null);

  useEffect(() => {
    // إذا كانت النافذة مفتوحة والمحافظة موجودة، نبدأ جلب البيانات
    if (visible && province) {
      loadNearbyPharmacies();
    }

    // 🔴 التنظيف (Cleanup): عند إغلاق النافذة أو اختفائها، يتم تدمير المستمع فوراً
    return () => {
      cleanUpListener();
    };
  }, [visible, province]);

  const loadNearbyPharmacies = () => {
    // تأمين: لو كان هناك مستمع قديم يعمل، نغلقه أولاً قبل بدء مستمع جديد
    cleanUpListener();
    
    setLoading(true);
    
    // إنشاء الاستعلام لجلب الصيدليات في المحافظة المحددة
    const q = db.ref('users').orderByChild('role').equalTo('pharmacy');
    pharmaciesQueryRef.current = q; // حفظ الاستعلام في المرجع

    // تشغيل المستمع الذكي
    q.on('value', snap => {
      let arr = [];
      if (snap.exists()) {
        snap.forEach(c => {
          const d = c.val();
          // تصفية الصيدليات التي تنتمي لنفس محافظة المستخدم فقط
          if (d.province === province) {
            arr.push({ id: c.key, ...d });
          }
        });
      }
      setPharmacies(arr);
      setLoading(false);
    }, error => {
      console.log("خطأ في جلب الصيدليات القريبة:", error);
      setLoading(false);
    });
  };

  // 🔴 دالة مخصصة لإغلاق وتنظيف المستمع من الذاكرة تماماً
  const cleanUpListener = () => {
    if (pharmaciesQueryRef.current) {
      pharmaciesQueryRef.current.off('value');
      pharmaciesQueryRef.current = null;
    }
  };

  const st = mkStyles(theme);

  if (!visible) return null;

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: '#00796b' }]}>
        <TouchableOpacity onPress={() => { cleanUpListener(); onClose(); }} style={st.closeBtn}>
          <Text style={st.closeText}>×</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>📍 صيدليات قريبة في {province}</Text>
      </View>

      {/* Body */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color="#00796b" />
          <Text style={[st.loadingTxt, { color: theme.subText }]}>جاري تحديث الصيدليات القريبة...</Text>
        </View>
      ) : pharmacies.length === 0 ? (
        <View style={st.center}>
          <Text style={[st.emptyTxt, { color: theme.subText }]}>لا توجد صيدليات مسجلة حالياً في هذه المنطقة.</Text>
        </View>
      ) : (
        <FlatList
          data={pharmacies}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 15 }}
          renderItem={({ item }) => (
            <View style={[st.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
              <View style={st.cardInfo}>
                <Text style={[st.pharmacyName, { color: theme.text }]}>💊 {item.pharmacyName || 'صيدلية غير مسمية'}</Text>
                <Text style={[st.pharmacyDetails, { color: theme.subText }]}>🕒 أوقات العمل: {item.workHours || 'غير محددة'}</Text>
                {item.isKhofra && (
                  <View style={st.khofraBadge}>
                    <Text style={st.khofraText}>🌙 صيدلية خافرة (24 ساعة)</Text>
                  </View>
                )}
              </View>
              
              <TouchableOpacity 
                style={[st.chatBtn, { backgroundColor: theme.primary }]} 
                onPress={() => { cleanUpListener(); onDirectChat(item.id, item.pharmacyName); }}
              >
                <Text style={st.chatBtnTxt}>تواصل الآن 💬</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15000 },
  header: { padding: 15, paddingTop: Platform.OS === 'android' ? 42 : 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 16, flex: 1, textAlign: 'center', marginRight: 35 },
  closeBtn: { paddingHorizontal: 10 },
  closeText: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingTxt: { marginTop: 10, fontSize: 14, fontWeight: 'bold' },
  emptyTxt: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },
  card: { padding: 15, borderRadius: 12, borderWidth: 1, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardInfo: { flex: 1, alignItems: 'flex-start', paddingRight: 10 },
  pharmacyName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  pharmacyDetails: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  khofraBadge: { backgroundColor: 'rgba(255,152,0,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5, marginTop: 6 },
  khofraText: { color: '#ff9800', fontSize: 11, fontWeight: 'bold' },
  chatBtn: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  chatBtnTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 }
});
