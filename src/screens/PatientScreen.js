// src/screens/PatientScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, Image, Alert, ScrollView, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { db, firebaseAuth } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';
import ProvincePicker from '../components/ProvincePicker';

// المكون الفرعي الذكي المضاف حديثاً لمراقبة إشعارات كل طلب على حدة داخل القائمة
const RequestItemWithBadge = ({ item, theme, st, badge, getTimeAgo, onOpenChat, deleteReq }) => {
  const [hasUnread, setHasUnread] = useState(false);
  const [targetPharmacy, setTargetPharmacy] = useState(null);

  useEffect(() => {
    if (!item.id) return;
    const ref = db.ref(`chats/${item.id}`);
    
    const listener = ref.on('value', snap => {
      let unreadFound = false;
      let firstUnreadPharm = null;
      
      if (snap.exists()) {
        const data = snap.val();
        
        // مسح شجري للبحث عن أي صيدلية ردت برسالة غير مقروءة للمريض
        Object.keys(data).forEach(key => {
          if (data[key] && typeof data[key] === 'object' && data[key].unreadPatient > 0) {
            unreadFound = true;
            if (!firstUnreadPharm) {
              firstUnreadPharm = key; // حفظ معرف أول صيدلية لديها رسالة غير مقروءة
            }
          }
        });
      }
      setHasUnread(unreadFound);
      setTargetPharmacy(firstUnreadPharm);
    });

    return () => ref.off('value', listener);
  }, [item.id]);

  const b = badge(item.status);

  return (
    <View style={[st.reqItem, { backgroundColor: theme.cardBg || '#fff', borderColor: hasUnread ? '#e53935' : (theme.border || '#ccc'), borderWidth: hasUnread ? 1.8 : 1 }]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {item.image ? <Image source={{ uri: item.image }} style={{ width: 55, height: 55, borderRadius: 8, borderWidth: 0.5, borderColor: '#ccc' }} /> : null}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
            {hasUnread && <View style={st.redDotPulse} />} 
            <Text style={[{ fontWeight: 'bold', textAlign: 'right', fontSize: 14 }, { color: theme.text || '#000' }]}>{item.name}</Text>
          </View>
          
          <Text style={{ fontSize: 11, color: theme.subText || '#777', textAlign: 'right', marginTop: 3 }}>
            {getTimeAgo(item.createdAt)}
          </Text>

          <View style={{ flexDirection: 'row', gap: 5, marginTop: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            {item.latitude && <Text style={{ fontSize: 10, color: '#00796b', marginRight: 'auto' }}>📍 الموقع دقيق</Text>}
            <View style={{ backgroundColor: b.b, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 }}>
              <Text style={{ color: b.c, fontSize: 11, fontWeight: 'bold' }}>{b.t}</Text>
            </View>
          </View>
        </View>
      </View>
      
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <TouchableOpacity 
          style={[st.actBtn, { backgroundColor: hasUnread ? '#e53935' : '#0288d1', flexDirection: 'row', alignItems: 'center', gap: 5 }]} 
          onPress={() => onOpenChat(item.id, item.name, targetPharmacy)}
        >
          <Text style={st.actTxt}>{hasUnread ? '💬 رد جديد غير مقروء' : '💬 دخول الدردشة'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.actBtn, { backgroundColor: '#f44336' }]} onPress={() => deleteReq(item.id)}>
          <Text style={st.actTxt}>🗑 إلغاء الطلب</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const getTimeAgo = (timestamp) => {
  if (!timestamp) return 'وقت غير محدد';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours === 1) return 'منذ ساعة';
  if (hours === 2) return 'منذ ساعتين';
  if (hours < 24) return `منذ ${hours} ساعات`;
  if (days === 1) return 'منذ يوم';
  if (days === 2) return 'منذ يومين';
  return `منذ ${days} أيام`;
};

export default function PatientScreen({ onOpenChat, onOpenNearby, onOpenInbox, onToast, province, onProvinceChange }) {
  const { theme } = useTheme();
  const [medInput, setMedInput] = useState('');
  const [image, setImage] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const listenerRef = useRef(null);
  const chatsListenerRef = useRef(null);

  useEffect(() => {
    if (!province || !firebaseAuth.currentUser) return;
    
    if (listenerRef.current) {
      db.ref(`requests/${province}`).orderByChild('patientId').equalTo(firebaseAuth.currentUser.uid).off('value', listenerRef.current);
    }

    const q = db.ref(`requests/${province}`).orderByChild('patientId').equalTo(firebaseAuth.currentUser.uid);
    listenerRef.current = q.on('value', snap => {
      let arr = [];
      snap.forEach(c => arr.push({ id: c.key, ...c.val() }));
      arr.sort((a, b) => b.createdAt - a.createdAt);
      setRequests(arr);
    });
    
    return () => q.off('value', listenerRef.current);
  }, [province]);

  useEffect(() => {
    const uid = firebaseAuth.currentUser?.uid;
    if (!uid) return;
    
    const ref = db.ref('chats');
    chatsListenerRef.current = ref.on('value', snap => {
      let count = 0;
      if (snap.exists()) {
        snap.forEach(child => {
          if (!child.key.includes(uid) && !requests.some(r => r.id === child.key)) {
            // التحقق الاحتياطي الإضافي للربط مع معرفات الطلبات النشطة للمريض
          }
          
          const chatData = child.val();
          if (!chatData) return;

          Object.keys(chatData).forEach(key => {
            if (chatData[key] && typeof chatData[key] === 'object') {
              count += chatData[key].unreadPatient || 0;
            }
          });
          
          if (chatData.unreadPatient) {
            count += chatData.unreadPatient;
          }
        });
      }
      setUnreadCount(count);
    });
    return () => ref.off('value', chatsListenerRef.current);
  }, [requests]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح بالوصول للمعرض', 'error');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5, base64: true, allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      setImage({ uri: result.assets[0].uri, base64: `data:image/jpeg;base64,${result.assets[0].base64}` });
      onToast('تم إرفاق الصورة الوصفية بنجاح ✅');
    }
  };

  const sendRequest = async (name, coords) => {
    const ref = db.ref(`requests/${province}`).push();
    await ref.set({
      name: name || 'وصفة طبية (صورة مرفقة)',
      image: image?.base64 || '',
      status: 'pending',
      createdAt: Date.now(),
      patientId: firebaseAuth.currentUser.uid,
      province,
      latitude: coords ? coords.latitude : null,
      longitude: coords ? coords.longitude : null,
      distanceText: coords ? 'محدد بدقة 📍' : 'غير حدد العنوان'
    });
    setMedInput(''); setImage(null);
    onToast('تم إرسال طلبك إلى جميع الصيدليات بنجاح! ✅');
  };

  const handleSearch = async () => {
    const name = medInput.trim();
    if (!name && !image) return onToast('اكتب اسم الدواء أو أرفق صورة الوصفة!', 'error');
    
    setLoading(true);
    setLoadingMsg('جاري تحديد موقعك الجغرافي بأعلى دقة... 📍');

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({ 
            accuracy: Location.Accuracy.Highest,
            timeout: 6000
          });
          
          sendRequest(name, { latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        } catch (innerErr) {
          const fallbackLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          sendRequest(name, { latitude: fallbackLoc.coords.latitude, longitude: fallbackLoc.coords.longitude });
        }
      } else {
        onToast('تم إرسال الطلب بدون إحداثيات لعدم توفر الصلاحية', 'warning');
        sendRequest(name, null);
      }
    } catch (err) { 
      sendRequest(name, null); 
    } finally { 
      setLoading(false); 
      setLoadingMsg('');
    }
  };

  const deleteReq = (id) => {
    Alert.alert('تأكيد الحذف', 'هل تريد إلغاء هذا الطلب نهائياً وسحب المحادثات؟', [
      { text: 'تراجع', style: 'cancel' },
      { text: 'نعم، حذف', style: 'destructive', onPress: async () => {
        await db.ref(`requests/${province}/${id}`).remove();
        await db.ref(`chats/${id}`).remove();
        onToast('تم إلغاء وحذف الطلب بنجاح');
      }},
    ]);
  };

  const badge = (s) => s === 'available' ? { t: '✅ متوفر', c: '#4caf50', b: 'rgba(76,175,80,0.15)' }
    : s === 'rejected' ? { t: '❌ غير متوفر', c: '#f44336', b: 'rgba(244,67,54,0.15)' }
    : { t: '⏳ قيد الانتظار', c: '#ffb300', b: 'rgba(255,193,7,0.15)' };

  const st = mkStyles(theme);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg || '#f5f5f5' }} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={[st.provinceBox, { backgroundColor: theme.cardBg || '#fff', borderColor: theme.border || '#ccc' }]}>
        <ProvincePicker label="📍 تحديد نطاق البحث الحركي:" value={province} onChange={onProvinceChange} />
      </View>

      <View style={[st.card, { backgroundColor: theme.cardBg || '#fff', borderColor: theme.border || '#ccc' }]}>
        <Text style={st.icon}>🔍</Text>
        <Text style={[st.cardTitle, { color: theme.primary || '#00796b' }]}>البحث عن الدواء</Text>
        <Text style={[st.cardSub, { color: theme.subText || '#666' }]}>اكتب اسم العلاج بدقة أو أرفق صورة الروشتة الطبية الواضحة</Text>

        <View style={st.row}>
          <TextInput
            style={[st.input, { backgroundColor: theme.bg || '#f9f9f9', borderColor: theme.border || '#ccc', color: theme.text || '#000' }]}
            placeholder="اكتب اسم العلاج هنا..." placeholderTextColor={theme.subText || '#999'}
            value={medInput} onChangeText={setMedInput} textAlign="right"
          />
          <TouchableOpacity style={[st.camBtn, { borderColor: theme.border || '#ccc', backgroundColor: theme.bg || '#f9f9f9' }]} onPress={pickImage}>
            <Text style={{ fontSize: 22 }}>📷</Text>
          </TouchableOpacity>
        </View>

        {image && (
          <View style={{ alignItems: 'flex-end', marginBottom: 12, width: '100%', paddingHorizontal: 5 }}>
            <Image source={{ uri: image.uri }} style={{ width: 80, height: 80, borderRadius: 10, borderWidth: 1, borderColor: '#ccc' }} />
            <TouchableOpacity onPress={() => setImage(null)} style={{ paddingVertical: 4 }}>
              <Text style={{ color: '#f44336', fontSize: 13, fontWeight: 'bold' }}>✕ إزالة الصورة</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={[st.searchBtn, { backgroundColor: theme.primary || '#00796b' }, loading && { opacity: 0.75 }]} onPress={handleSearch} disabled={loading}>
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color="white" />
              <Text style={{ color: 'white', fontSize: 13, fontWeight: '500' }}>{loadingMsg}</Text>
            </View>
          ) : (
            <Text style={st.btnTxt}>تعميم وإرسال الطلب للصيدليات 📤</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={[st.searchBtn, { backgroundColor: '#607d8b', marginTop: 10 }]} onPress={onOpenNearby}>
          <Text style={st.btnTxt}>🏥 عرض الصيدليات القريبة والخافرة</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[st.searchBtn, { backgroundColor: '#0288d1', marginTop: 10 }]} onPress={onOpenInbox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={st.btnTxt}>💬 صندوق المحادثات الطبية</Text>
            {unreadCount > 0 && (
              <View style={st.unreadBadge}>
                <Text style={st.unreadTxt}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 15 }}>
        <Text style={[st.sectionTitle, { color: theme.primary || '#00796b' }]}>📋 طلباتي الطبية السابقة:</Text>
        {requests.length === 0 ? (
          <Text style={[st.empty, { color: theme.subText || '#888' }]}>لا توجد طلبات معلقة أو سابقة لك حالياً.</Text>
        ) : (
          <FlatList 
            data={requests} 
            keyExtractor={item => item.id} 
            scrollEnabled={false} 
            renderItem={({ item }) => (
              <RequestItemWithBadge 
                item={item} 
                theme={theme} 
                st={st} 
                badge={badge} 
                getTimeAgo={getTimeAgo} 
                onOpenChat={onOpenChat} 
                deleteReq={deleteReq} 
              />
            )}
          />
        )}
      </View>
    </ScrollView>
  );
}

const mkStyles = (t) => StyleSheet.create({
  provinceBox: { margin: 15, marginBottom: 5, padding: 14, borderRadius: 10, borderWidth: 1, elevation: 1 },
  card: { margin: 15, padding: 20, borderRadius: 15, borderWidth: 1, alignItems: 'center', elevation: 2 },
  icon: { fontSize: 36, marginBottom: 4 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  cardSub: { fontSize: 12, textAlign: 'center', marginBottom: 16, paddingHorizontal: 10, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12 },
  input: { flex: 1, padding: 12, borderWidth: 1.5, borderRadius: 8, fontSize: 14 },
  camBtn: { padding: 12, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  searchBtn: { width: '100%', padding: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  unreadBadge: { backgroundColor: '#e53935', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  unreadTxt: { color: 'white', fontWeight: 'bold', fontSize: 11 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'right', marginBottom: 10, marginTop: 5 },
  empty: { fontStyle: 'italic', textAlign: 'center', marginTop: 15, fontSize: 13 },
  reqItem: { padding: 14, borderWidth: 1, borderRadius: 12, marginBottom: 10, elevation: 1 },
  actBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 7 },
  actTxt: { color: 'white', fontWeight: 'bold', fontSize: 12 },
  // تصميم النقطة الحمراء الصارخة والنابضة للإشعار اللحظي للرد الأحدث
  redDotPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e53935', marginRight: 4 }
});
