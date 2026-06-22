// src/screens/NearbyScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Platform, Linking, Alert, TextInput
} from 'react-native';
import { db } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function NearbyScreen({ visible, onClose, province, onDirectChat }) {
  const { theme } = useTheme();
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const pharmaciesQueryRef = useRef(null);
  const isMountedRef = useRef(true);

  // ✅ إضافة cleanup على unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanUpListener();
    };
  }, []);

  useEffect(() => {
    if (visible && province) loadNearbyPharmacies();
    return () => { cleanUpListener(); };
  }, [visible, province]);

  const loadNearbyPharmacies = () => {
    try {
      cleanUpListener();
      setLoading(true);
      const q = db.ref('users').orderByChild('role').equalTo('pharmacy');
      pharmaciesQueryRef.current = q;
      q.on('value', snap => {
        // ✅ تحقق من isMounted
        if (!isMountedRef.current) return;

        try {
          let arr = [];
          if (snap.exists()) {
            snap.forEach(c => {
              const d = c.val();
              if (d && d.province === province) arr.push({ id: c.key, ...d });
            });
          }

          // الترتيب فقط حسب حقل priority
          arr.sort((a, b) => (a.priority || 999) - (b.priority || 999));

          setPharmacies(arr);
          setLoading(false);
        } catch (err) {
          console.error('خطأ في معالجة البيانات:', err);
          if (isMountedRef.current) setLoading(false);
        }
      }, error => {
        console.error('خطأ Firebase:', error);
        if (isMountedRef.current) setLoading(false);
      });
    } catch (err) {
      console.error('خطأ في loadNearbyPharmacies:', err);
      if (isMountedRef.current) setLoading(false);
    }
  };

  const cleanUpListener = () => {
    if (pharmaciesQueryRef.current) {
      pharmaciesQueryRef.current.off('value');
      pharmaciesQueryRef.current = null;
    }
  };

  const filteredPharmacies = searchQuery.trim() === ''
    ? pharmacies
    : pharmacies.filter(ph =>
        (ph.pharmacyName || '').toLowerCase().includes(searchQuery.toLowerCase())
      );

  // ✅ تصحيح دالة النجوم — آمنة من الأخطاء
  const getStars = (item) => {
    try {
      const n = parseInt(item.priorityType) || 0;
      if (n === 0 || item.priorityType === 'none') return null;

      // تحقق من انتهاء الصلاحية
      if (item.priorityExpiry && item.priorityExpiry !== -1 && item.priorityExpiry < Date.now()) {
        return null;
      }

      // بناء النجوم بطريقة آمنة
      let stars = '';
      for (let i = 1; i <= 5; i++) {
        stars += i <= n ? '★' : '☆';
      }
      return stars;
    } catch (err) {
      console.error('خطأ في getStars:', err);
      return null;
    }
  };

  const openMap = (item) => {
    try {
      if (!item.lat || !item.lng) {
        Alert.alert('تنبيه', 'هذه الصيدلية لم تحدد موقعها بعد');
        return;
      }
      const name = encodeURIComponent(item.pharmacyName || 'الصيدلية');
      const url = Platform.OS === 'ios'
        ? `maps:0,0?q=${name}@${item.lat},${item.lng}`
        : `geo:${item.lat},${item.lng}?q=${item.lat},${item.lng}(${name})`;
      
      Linking.canOpenURL(url)
        .then(supported => {
          if (supported) {
            return Linking.openURL(url);
          } else {
            return Linking.openURL(
              `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
            );
          }
        })
        .catch(err => {
          console.error('خطأ في Linking:', err);
        });
    } catch (err) {
      console.error('خطأ في openMap:', err);
    }
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

      {/* شريط البحث */}
      <View style={[st.searchContainer, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
        <TextInput
          style={[st.searchInput, { color: theme.text }]}
          placeholder="🔍 ابحث عن صيدلية..."
          placeholderTextColor={theme.subText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={st.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color="#00796b" />
          <Text style={[st.loadingTxt, { color: theme.subText }]}>
            جاري تحميل الصيدليات...
          </Text>
        </View>
      ) : filteredPharmacies.length === 0 ? (
        <View style={st.center}>
          <Text style={[st.emptyTxt, { color: theme.subText }]}>
            {searchQuery.trim() === ''
              ? 'لا توجد صيدليات مسجلة في هذه المنطقة.'
              : `لم نجد صيدليات بـ "${searchQuery}"`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredPharmacies}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 15 }}
          ListHeaderComponent={
            searchQuery.trim() !== '' ? (
              <Text style={[st.resultCount, { color: theme.subText }]}>
                وجدنا {filteredPharmacies.length} صيدلية
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const stars = getStars(item);

            return (
              <View style={[st.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>

                {/* ✅ النجوم — مع معالجة آمنة */}
                {stars && (
                  <View style={st.starsRow}>
                    <Text style={st.starsText}>{stars}</Text>
                  </View>
                )}

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

                  {item.lat && item.lng
                    ? <Text style={st.locationSet}>📌 الموقع محدد</Text>
                    : <Text style={[st.locationUnset, { color: theme.subText }]}>📌 الموقع غير محدد</Text>
                  }
                </View>

                {/* الأزرار */}
                <View style={st.btnGroup}>
                  <TouchableOpacity
                    style={[st.mapBtn, (!item.lat || !item.lng) && st.mapBtnDisabled]}
                    onPress={() => openMap(item)}
                  >
                    <Text style={st.btnTxt}>🗺️ خريطة</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[st.chatBtn, { backgroundColor: theme.primary }]}
                    onPress={() => { cleanUpListener(); onDirectChat(item.id, item.pharmacyName); }}
                  >
                    <Text style={st.btnTxt}>تواصل 💬</Text>
                  </TouchableOpacity>
                </View>

              </View>
            );
          }}
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

  searchContainer: {
    margin: 12, padding: 10, borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 5,
    fontSize: 14, textAlign: 'right',
  },
  clearBtn: { fontSize: 18, fontWeight: 'bold', color: '#999', paddingHorizontal: 8 },
  resultCount: { fontSize: 12, fontStyle: 'italic', marginBottom: 10, textAlign: 'center' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingTxt: { marginTop: 10, fontSize: 14, fontWeight: 'bold' },
  emptyTxt: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  card: {
    padding: 15, borderRadius: 12, borderWidth: 1,
    marginBottom: 12, alignItems: 'flex-end'
  },

  starsRow: {
    alignSelf: 'flex-end',
    marginBottom: 8,
    flexDirection: 'row',
  },
  starsText: {
    fontSize: 18,
    letterSpacing: 2,
    color: '#f59e0b',
  },

  cardInfo: { width: '100%', alignItems: 'flex-end', paddingRight: 5 },
  pharmacyName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  pharmacyDetails: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  locationSet: { color: '#00796b', fontSize: 11, marginTop: 4, fontWeight: 'bold' },
  locationUnset: { fontSize: 11, marginTop: 4 },

  khofraBadge: {
    backgroundColor: 'rgba(255,152,0,0.15)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 5, marginTop: 6, alignSelf: 'flex-end'
  },
  khofraText: { color: '#ff9800', fontSize: 11, fontWeight: 'bold' },

  btnGroup: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    marginTop: 12, alignSelf: 'flex-end'
  },
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
