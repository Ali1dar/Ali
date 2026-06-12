// src/screens/InboxScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Animated, Platform } from 'react-native';
import { db, firebaseAuth } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function InboxScreen({ visible, onClose, onOpenChat }) {
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(700)).current;
  const [chats, setChats] = useState([]);
  const listenerRef = useRef(null);

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : 700, duration: 300, useNativeDriver: true }).start();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    const ref = db.ref('chats');
    listenerRef.current = ref.on('value', async snap => {
      if (!snap.exists()) { setChats([]); return; }
      let arr = [];
      const ps = [];
      snap.forEach(child => {
        const id = child.key;
        if (!id.includes(uid)) return;
        const data = child.val()[uid] || {};
        const msgs = data.messages ? Object.values(data.messages) : [];
        const last = msgs[msgs.length - 1];
        let preview = 'اضغط لفتح المحادثة...';
        if (last?.text) preview = last.text;
        else if (last?.image) preview = '🖼️ صورة';
        else if (last?.audio) preview = '🎙️ رسالة صوتية';
        const unread = data.unreadPharmacy || 0;
        const patientId = id.split('_')[1] || '';
        const entry = { id, preview, unread, patientId, patientName: null };
        arr.push(entry);
        if (patientId) {
          ps.push(db.ref(`users/${patientId}`).once('value').then(s => {
            entry.patientName = s.val()?.patientName || 'مريض';
          }).catch(() => {}));
        }
      });
      await Promise.all(ps);
      setChats([...arr]);
    });
    return () => ref.off('value', listenerRef.current);
  }, [visible]);

  if (!visible) return null;
  const st = mkStyles(theme);
  return (
    <Animated.View style={[st.container, { transform: [{ translateY: slideAnim }], backgroundColor: theme.bg }]}>
      <View style={st.header}>
        <Text style={st.headerTitle}>💬 صندوق الرسائل</Text>
        <TouchableOpacity onPress={onClose}><Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>×</Text></TouchableOpacity>
      </View>
      {chats.length === 0
        ? <Text style={[st.empty, { color: theme.subText }]}>لا توجد رسائل واردة حالياً.</Text>
        : <FlatList
            data={chats}
            keyExtractor={i => i.id}
            contentContainerStyle={{ padding: 15, gap: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[st.item, { backgroundColor: theme.cardBg, borderColor: item.unread > 0 ? '#e53935' : theme.border }, item.unread > 0 && { borderRightWidth: 4 }]}
                onPress={() => onOpenChat(item.id)}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.name, { color: theme.primary }]}>📥 {item.patientName || 'جاري...'}</Text>
                  <Text style={[st.preview, { color: theme.subText }]} numberOfLines={1}>{item.preview}</Text>
                </View>
                {item.unread > 0 && (
                  <View style={st.unreadBadge}>
                    <Text style={st.unreadTxt}>{item.unread}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          />
      }
    </Animated.View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10050 },
  header: { backgroundColor: '#00796b', padding: 15, paddingTop: Platform.OS === 'android' ? 42 : 58, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  item: { padding: 14, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  name: { fontWeight: 'bold', fontSize: 15, textAlign: 'right' },
  preview: { fontSize: 13, marginTop: 4, textAlign: 'right' },
  unreadBadge: { backgroundColor: '#e53935', borderRadius: 12, minWidth: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  unreadTxt: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  empty: { textAlign: 'center', marginTop: 28, fontStyle: 'italic' },
});
