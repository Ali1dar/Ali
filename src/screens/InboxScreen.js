// src/screens/InboxScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Animated, Platform } from 'react-native';
import { db, firebaseAuth } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function InboxScreen({ visible, onClose, onOpenChat, role }) {
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(700)).current;
  const [chats, setChats] = useState([]);
  const listenerRef = useRef(null);

  // دالة مساعدة لتنسيق الوقت بشكل مقروء ومقاوم للأخطاء
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : 700, duration: 300, useNativeDriver: true }).start();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;

    const ref = db.ref('chats');
    
    // الغاء المستمع القديم فوراً لو وجد لمنع تسريب الذاكرة
    if (listenerRef.current) {
      ref.off('value', listenerRef.current);
    }

    listenerRef.current = ref.on('value', async snap => {
      if (!snap.exists()) { setChats([]); return; }
      let arr = [];
      const ps = [];

      snap.forEach(child => {
        const id = child.key;
        
        // التحقق الذكي والمقاوم للأخطاء من تبعية المحادثة للمستخدم الحالي
        if (!id.includes(uid)) return;

        let otherUserId = '';
        const parts = id.split('_');

        // 🛠️ تصحيح تفكيك المعرفات لدعم الـ Direct Chats والـ Request Chats دون إنتاج undefined
        if (parts[0] === 'p' && parts.length >= 3) {
          // حالة المحادثة المباشرة p_patientUid_pharmacyUid
          otherUserId = role === 'pharmacy' ? parts[1] : parts[2];
        } else {
          // حالة طلب روشتة عامة: المعرف قد لا يحتوي على تركيب الـ Direct
          // نأخذ الـ UID المقابل للـ UID الحالي من تفرعات المحادثة نفسها
          const childData = child.val() || {};
          const branchKeys = Object.keys(childData).filter(k => k !== 'unreadPharmacy' && k !== 'unreadPatient');
          
          if (role === 'pharmacy') {
            // الصيدلي يبحث عن معرف المريض (الذي لا يساوي الـ uid الخاص بالصيدلية)
            otherUserId = branchKeys.find(k => k !== uid) || parts[1] || '';
          } else {
            // المريض يبحث عن معرف الصيدلية
            otherUserId = branchKeys.find(k => k === id || k !== uid) || parts[2] || '';
          }
        }

        // تصفية القيم والتأكد من عدم تمرير نص "undefined" كمتغير ميت
        if (!otherUserId || otherUserId === 'undefined') return;

        const branchKey = role === 'pharmacy' ? uid : otherUserId;
        const data = child.val()[branchKey] || child.val() || {};

        const msgs = data.messages ? Object.values(data.messages) : [];
        const last = msgs[msgs.length - 1];

        let preview = 'اضغط لفتح المحادثة...';
        if (last?.text) preview = last.text;
        else if (last?.image) preview = '📷 صورة جديدة';
        else if (last?.audio) preview = '🎙️ رسالة صوتية';
        else if (last?.locationUrl) preview = '📍 موقع جغرافي';

        const lastTime = last?.timestamp || last?.createdAt || null;

        const unread = role === 'pharmacy'
          ? (data.unreadPharmacy || child.val()?.unreadPharmacy || 0)
          : (data.unreadPatient || child.val()?.unreadPatient || 0);

        const entry = { id, preview, unread, otherUserId, otherName: 'جاري التحميل...', lastTime };
        arr.push(entry);

        // جلب الأسماء بشكل متوازي ومحمي من الانهيار
        ps.push(
          db.ref(`users/${otherUserId}`).once('value').then(s => {
            const val = s.val();
            if (val) {
              entry.otherName = role === 'pharmacy'
                ? (val.patientName || 'مريض')
                : (val.pharmacyName || 'صيدلية مجهولة');
            } else {
              entry.otherName = role === 'pharmacy' ? 'مريض' : 'صيدلية';
            }
          }).catch((err) => {
            console.log("خطأ جلب اسم المستخدم المحادث:", err);
            entry.otherName = role === 'pharmacy' ? 'مريض' : 'صيدلية';
          })
        );
      });

      await Promise.all(ps);
      
      // ترتيب زمني صارم: الأحدث يظهر أولاً
      arr.sort((a, b) => (b.lastTime || 0) - (a.lastTime || 0));
      
      setChats(arr);
    });

    return () => {
      if (listenerRef.current) ref.off('value', listenerRef.current);
    };
  }, [visible]);

  if (!visible) return null;
  const st = mkStyles(theme);

  return (
    <Animated.View style={[st.container, { transform: [{ translateY: slideAnim }], backgroundColor: theme.bg || '#f5f5f5' }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>
          {role === 'pharmacy' ? '💬 صندوق الطلبات والمحادثات' : '💬 محادثاتي الطبية'}
        </Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>×</Text>
        </TouchableOpacity>
      </View>

      {chats.length === 0 ? (
        <Text style={[st.empty, { color: theme.subText || '#888' }]}>لا توجد محادثات سابقة حالياً.</Text>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 15, gap: 10 }}
          
          // 🔥 خصائص الأداء العالي لإنهاء تعليق الواجهة الفوري المستقر
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                st.item,
                { backgroundColor: theme.cardBg || '#fff', borderColor: item.unread > 0 ? '#e53935' : (theme.border || '#ccc') },
                item.unread > 0 && { borderRightWidth: 5, borderRightColor: '#e53935' }
              ]}
              onPress={() => onOpenChat(item.id)}
            >
              <View style={{ flex: 1 }}>
                <View style={st.rowHeader}>
                  <Text style={[st.time, { color: theme.subText || '#777' }]}>
                    {formatTime(item.lastTime)}
                  </Text>
                  <Text style={[st.name, { color: item.unread > 0 ? '#e53935' : (theme.primary || '#00796b') }]}>
                    {role === 'pharmacy' ? '👤 ' : '💊 '} {item.otherName}
                  </Text>
                </View>
                
                <Text style={[st.preview, { color: item.unread > 0 ? (theme.text || '#000') : (theme.subText || '#666'), fontWeight: item.unread > 0 ? 'bold' : '400' }]} numberOfLines={1}>
                  {item.preview}
                </Text>
              </View>
              
              {item.unread > 0 && (
                <View style={st.unreadBadge}>
                  <Text style={st.unreadTxt}>{item.unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </Animated.View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10050 },
  header: {
    backgroundColor: '#00796b', padding: 15,
    paddingTop: Platform.OS === 'android' ? 42 : 58,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  item: { padding: 14, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  name: { fontWeight: 'bold', fontSize: 14, textAlign: 'right' },
  time: { fontSize: 11, textAlign: 'left' },
  preview: { fontSize: 13, marginTop: 5, textAlign: 'right' },
  unreadBadge: {
    backgroundColor: '#e53935', borderRadius: 11,
    minWidth: 22, height: 22, alignItems: 'center',
    justifyContent: 'center', marginLeft: 10, paddingHorizontal: 4
  },
  unreadTxt: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  empty: { textAlign: 'center', marginTop: 40, fontStyle: 'italic', fontSize: 14 },
});
