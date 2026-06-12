// src/components/SubscriptionOverlay.js
import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Linking } from 'react-native';
import { useTheme } from '../utils/ThemeContext';

export default function SubscriptionOverlay({ visible, message }) {
  const { theme } = useTheme();
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={[s.card, { backgroundColor: theme.cardBg }]}>
          <View style={s.iconBox}><Text style={{ fontSize: 38 }}>🔒</Text></View>
          <Text style={s.title}>صلاحية الحساب متوقفة</Text>
          <Text style={[s.msg, { color: theme.text }]}>{message}</Text>
          <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:07823017544')}>
            <Text style={s.callTxt}>📞 اتصل بالإدارة لتفعيل الحساب</Text>
            <Text style={{ color: '#b2dfdb', fontSize: 13, marginTop: 4 }}>07823017544</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { borderRadius: 24, padding: 32, width: '100%', alignItems: 'center', elevation: 20 },
  iconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(244,67,54,0.12)', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  title: { color: '#e53935', fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' },
  msg: { fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  callBtn: { backgroundColor: '#00796b', padding: 16, borderRadius: 14, alignItems: 'center', width: '100%' },
  callTxt: { color: 'white', fontWeight: 'bold', fontSize: 15 },
});
