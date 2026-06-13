// src/screens/NearbyScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Platform, Linking, Alert
} from 'react-native';
import { db } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function NearbyScreen({ visible, onClose, province, onDirectChat }) {
  const { theme } = useTheme();
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(false);
  const pharmaciesQueryRef = useRef(null);

  useEffect(() => {
    if (visible && province) loadNearbyPharmacies();
    return () => { cleanUpListener(); };
  }, [visible, province]);

  const loadNearbyPharmacies = () => {
    cleanUpListener();
    setLoading(true);
    const q = db.ref('users').orderByChild('role').equalTo('pharmacy');
    pharmaciesQueryRef.current = q;
    q.on('value', snap => {
      let arr = [];
      if (snap.exists()) {
        snap.forEach(c => {
          const d = c.val();
          if (d.province === province) arr.push({ id: c.key, ...d });
        });
      }
      setPharmacies(arr);
      setLoading(false);
    }, error => {
      console.log("خطأ:", error);
      setLoading(false);
    });
  };

  const cleanUpListener = () => {
    if (pharmaciesQueryRef.current) {
      pharmaciesQueryRef.current.off('value');
      pharmaciesQueryRef.current = null;
    }
  };

  // ✅ فتح الخريطة - يستخدم item.lat و item.lng
  const openMap = (item) => {
    if (!item.lat || !item.lng) {
      Alert.alert('تنبيه', 'هذه الصيدلية لم تحدد موقعها بعد');
      return;
    }

    const name = encodeURIComponent(item.pharmacyName || 'الصيدلية');
    const url = Platform.OS === 'ios'
      ? `maps:0,0?q=${name}@${item.lat},${item.lng}`
      : `geo:${item.lat},${item.lng}?q=${item.lat},${item.lng}(${name})`;

    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(
          `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
        );
      }
    });
  };

  const st = mkStyles(theme);
  if (!visible) return null;

  return (
    <View style={[st.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[st.header, { backgroundColor: '#00796b' }]}>
        <TouchableOpacity
          onPress={() => { cleanUpListener(); onClose(); }}
          style={st.closeBtn}
        >
          <Text style={st.closeText}>×</Text>
        </TouchableOpacity>
        <Text style={st.headerTitle}>📍 صيدليات قريبة في {province}</Text>
      </View>

      {/* Body */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color="#00796b" />
          <Text style={[st.loadingTxt, { color: theme.subText }]}>
            جاري تحديث الصيدليات القريبة...
          </Text>
        </View>
      ) : pharmacies.length === 0 ? (
        <View style={st.center}>
          <Text style={[st.emptyTxt, { color: theme.subText }]}>
            لا توجد صيدليات مسجلة حالياً في هذه المنطقة.
          </Text>
        </View>
      ) : (
        <FlatList
          data={pharmacies}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 15 }}
          renderItem={({ item }) => (
            <View style={[st.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>

              {/* معلومات الصيدلية */}
              <View style={st.cardInfo}>
                <Text style={[st.pharmacyName, { color: theme.text }]}>
                  💊 {item.pharmacyName || 'صيدلية غير مسمية'}
                </Text>
                <Text style={[st.pharmacyDetails, { color: theme.subText }]}>
                  🕒 {item.workingHours || 'غير محددة'}
                </Text>
                {item.isNightDuty && (
                  <View style={st.khofraBadge}>
                    <Text style={st.khofraText}>🌙 خافرة 24 ساعة</Text>
                  </View>
                )}
                {item.lat && item.lng && (
                  <Text style={st.locationSet}>📌 الموقع محدد</Text>
                )}
              </View>

              {/* الأزرار */}
              <View style={st.btnGroup}>
                {/* زر الخريطة */}
                <TouchableOpacity
                  style={[st.mapBtn, (!item.lat || !item.lng) && st.mapBtnDisabled]}
                  onPress={() => openMap(item)}
                >
                  <Text style={st.btnTxt}>🗺️ خريطة</Text>
                </TouchableOpacity>

                {/* زر التواصل */}
                <TouchableOpacity
                  style={[st.chatBtn, { backgroundColor: theme.primary }]}
                  onPress={() => { cleanUpListener(); onDirectChat(item.id, item.pharmacyName); }}
                >
                  <Text style={st.btnTxt}>تواصل 💬</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  container: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 15000
  },
  header: {
    padding: 15,
    paddingTop: Platform.OS === 'android' ? 42 : 58,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
  },
  headerTitle: {
    color: 'white', fontWeight: 'bold', fontSize: 16,
    flex: 1, textAlign: 'center', marginRight: 35
  },
  closeBtn: { paddingHorizontal: 10 },
  closeText: { color: 'white', fontSize: 32, fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingTxt: { marginTop: 10, fontSize: 14, fontWeight: 'bold' },
  emptyTxt: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  // البطاقة
  card: {
    padding: 15, borderRadius: 12, borderWidth: 1,
    marginBottom: 12, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between'
  },
  cardInfo: { flex: 1, alignItems: 'flex-end', paddingRight: 5 },
  pharmacyName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  pharmacyDetails: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  locationSet: { color: '#00796b', fontSize: 11, marginTop: 4, fontWeight: 'bold' },
  khofraBadge: {
    backgroundColor: 'rgba(255,152,0,0.15)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 5, marginTop: 6
  },
  khofraText: { color: '#ff9800', fontSize: 11, fontWeight: 'bold' },

  // الأزرار
  btnGroup: { flexDirection: 'column', gap: 8, alignItems: 'center' },
  mapBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, backgroundColor: '#0288d1',
    alignItems: 'center', minWidth: 80
  },
  mapBtnDisabled: { backgroundColor: '#b0bec5' },
  chatBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 8, alignItems: 'center', minWidth: 80
  },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 },
});
