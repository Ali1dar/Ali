// src/components/Toast.js
import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform, StatusBar } from 'react-native';

export default function Toast({ message, visible, type = 'info' }) {
  // جعل نقطة البداية خارج الشاشة بالأعلى تماماً (-150) لتفادي أي ظهور مفاجئ
  const anim = useRef(new Animated.Value(-150)).current;

  useEffect(() => {
    if (visible && message) {
      Animated.sequence([
        // حساب نقطة الهبوط الآمنة ديناميكياً بدلاً من الرقم الثابت 10
        Animated.timing(anim, { 
          toValue: Platform.OS === 'android' ? StatusBar.currentHeight + 65 : 100, 
          duration: 350, 
          useNativeDriver: true 
        }),
        Animated.delay(2500),
        Animated.timing(anim, { toValue: -150, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, message]);

  // التحقق من وجود رسالة حتى لا يظهر صندوق فارغ
  if (!visible && !message) return null;

  return (
    <Animated.View style={[s.box, { transform: [{ translateY: anim }] }, type === 'error' ? s.err : s.ok]}>
      <Text style={s.txt}>{message}</Text>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  box: {
    position: 'absolute', 
    top: 0, 
    alignSelf: 'center', 
    zIndex: 999999, // رفع الأولوية ليكون فوق كل المكونات والـ Modals
    paddingHorizontal: 22, 
    paddingVertical: 12, 
    borderRadius: 25,
    elevation: 12, 
    shadowColor: '#000', 
    shadowOpacity: 0.25, 
    shadowRadius: 8,
    maxWidth: '85%', // منع النص الطويل من التمدد خارج حدود شاشة الهاتف
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ok: { backgroundColor: '#00796b' },
  err: { backgroundColor: '#f44336' },
  txt: { color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
