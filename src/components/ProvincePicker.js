// src/components/ProvincePicker.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { PROVINCES } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

export default function ProvincePicker({ value, onChange, label }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={[s.label, { color: theme.primary }]}>{label}</Text> : null}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: theme.bg, borderColor: theme.border }]}
        onPress={() => setOpen(true)}>
        <Text style={[s.btnTxt, { color: theme.text }]}>{value || 'اختر المحافظة'}</Text>
        <Text style={{ color: theme.subText, fontSize: 12 }}>▼</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity style={s.overlay} onPress={() => setOpen(false)} activeOpacity={1}>
          <View style={[s.sheet, { backgroundColor: theme.cardBg }]}>
            <Text style={[s.sheetTitle, { color: theme.primary }]}>اختر المحافظة</Text>
            <FlatList
              data={PROVINCES}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.item, item === value && { backgroundColor: theme.primary + '22' }]}
                  onPress={() => { onChange(item); setOpen(false); }}>
                  <Text style={[s.itemTxt, { color: theme.text }, item === value && { color: theme.primary, fontWeight: 'bold' }]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  label: { fontSize: 13, fontWeight: 'bold', marginBottom: 6, textAlign: 'right' },
  btn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderWidth: 2, borderRadius: 8 },
  btnTxt: { fontSize: 15 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 14 },
  item: { paddingVertical: 13, paddingHorizontal: 10, borderRadius: 8, marginBottom: 3 },
  itemTxt: { fontSize: 15, textAlign: 'right' },
});
