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

  useEffect(() => {
    if (visible && province) loadNearbyPharmacies();
    return () => { cleanUpListener(); };
  }, [visible, province]);

  // ✅ تحميل الصيدليات مع ترتيب الأولويات
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
          // تصفية حسب المحافظة
          if (d.province === province) arr.push({ id: c.key, ...d });
        });
      }
      
      // ✅ ترتيب حسب الأولوية (المهم جداً!)
      arr.sort((a, b) => {
        const priorityA = a.priority || 999;
        const priorityB = b.priority || 999;
        return priorityA - priorityB;
      });
      
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

  // ✅ البحث مع الترتيب حسب الأولوية
  const filteredPharmacies = searchQuery.trim() === '' 
    ? pharmacies
    : pharmacies.filter(ph => {
        const name = (ph.pharmacyName || '').toLowerCase();
        const query = searchQuery.toLowerCase();
        return name.includes(query);
      }).sort((a, b) => {
        const priorityA = a.priority || 999;
        const priorityB = b.priority || 999;
        return priorityA - priorityB;
      });

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

  // ✅ دالة إرجاع رقم الأولوية مع علامة بصرية
  const getPriorityBadge = (priority) => {
    const p = priority || 999;
    if (p === 1) return { text: '⭐ الأولوية الأولى', color: '#ffc107', bg: 'rgba(255,193,7,0.2)' };
    if (p === 2) return { text: '⭐⭐ الأولوية الثانية', color: '#ff9800', bg: 'rgba(255,152,0,0.2)' };
    if (p === 3) return { text: '⭐⭐⭐ الأولوية الثالثة', color: '#f44336', bg: 'rgba(244,67,54,0.2)' };
    return { text: `الأولوية #${p}`, color: theme.subText, bg: 'transparent' };
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

      {/* ✅ شريط البحث */}
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

      {/* Body */}
      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color="#00796b" />
          <Text style={[st.loadingTxt, { color: theme.subText }]}>
            جاري تحديث الصيدليات القريبة...
          </Text>
        </View>
      ) : filteredPharmacies.length === 0 ? (
        <View style={st.center}>
          <Text style={[st.emptyTxt, { color: theme.subText }]}>
            {searchQuery.trim() === '' 
              ? 'لا توجد صيدليات مسجلة حالياً في هذه المنطقة.'
              : `لم نجد صيدليات بـ "${searchQuery}"`
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredPharmacies}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 15 }}
          ListHeaderComponent={
            searchQuery.trim() === '' ? null : (
              <Text style={[st.resultCount, { color: theme.subText }]}>
                وجدنا {filteredPharmacies.length} صيدلية
              </Text>
            )
          }
          renderItem={({ item, index }) => {
            const priorityInfo = getPriorityBadge(item.priority);
            
            return (
              <View style={[st.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                
                {/* ✅ شارة الأولوية */}
                {item.priority && item.priority <= 3 && (
                  <View style={[st.priorityBadge, { backgroundColor: priorityInfo.bg }]}>
                    <Text style={[st.priorityText, { color: priorityInfo.color }]}>
                      {priorityInfo.text}
                    </Text>
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

  // ✅ شريط البحث
  searchContainer: {
    margin: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 5,
    fontSize: 14,
    textAlign: 'right',
  },
  clearBtn: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#999',
    paddingHorizontal: 8,
  },
  resultCount: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 10,
    textAlign: 'center',
  },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingTxt: { marginTop: 10, fontSize: 14, fontWeight: 'bold' },
  emptyTxt: { fontSize: 14, fontStyle: 'italic', textAlign: 'center' },

  // البطاقة
  card: {
    padding: 15, borderRadius: 12, borderWidth: 1,
    marginBottom: 12, alignItems: 'flex-end'
  },

  // ✅ شارة الأولوية
  priorityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 10,
    alignSelf: 'flex-end',
  },
  priorityText: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  cardInfo: { width: '100%', alignItems: 'flex-end', paddingRight: 5 },
  pharmacyName: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  pharmacyDetails: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  locationSet: { color: '#00796b', fontSize: 11, marginTop: 4, fontWeight: 'bold' },
  khofraBadge: {
    backgroundColor: 'rgba(255,152,0,0.15)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 5, marginTop: 6, alignSelf: 'flex-end'
  },
  khofraText: { color: '#ff9800', fontSize: 11, fontWeight: 'bold' },

  // الأزرار
  btnGroup: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12, alignSelf: 'flex-end' },
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
