// src/screens/ChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Image, Animated, Platform, Linking, ScrollView, KeyboardAvoidingView, BackHandler, Modal, Alert
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { db, firebaseAuth, formatLastSeen } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

function AudioPlayer({ uri, isMe }) {
  const [sound, setSound] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1.0);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
      clearInterval(intervalRef.current);
    };
  }, [sound]);

  const loadAndPlay = async () => {
    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isPlaying) {
          await sound.pauseAsync();
          setPlaying(false);
          clearInterval(intervalRef.current);
        } else {
          await sound.playAsync();
          setPlaying(true);
          startTracking(sound);
        }
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound: s, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, rate, shouldCorrectPitch: true }
      );
      setSound(s);
      setDuration(status.durationMillis || 0);
      setPlaying(true);
      startTracking(s);
      s.setOnPlaybackStatusUpdate(st => {
        if (st.didJustFinish) {
          setPlaying(false);
          setPosition(0);
          clearInterval(intervalRef.current);
          s.unloadAsync();
          setSound(null);
        }
      });
    } catch (e) {
      console.log('خطأ تشغيل الصوت:', e);
    }
  };

  const startTracking = (s) => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const st = await s.getStatusAsync();
      if (st.isLoaded) setPosition(st.positionMillis || 0);
    }, 300);
  };

  const seek = async (dir) => {
    if (!sound) return;
    const st = await sound.getStatusAsync();
    const newPos = Math.max(0, Math.min((st.positionMillis || 0) + dir * 5000, duration));
    await sound.setPositionAsync(newPos);
    setPosition(newPos);
  };

  const toggleRate = async () => {
    const newRate = rate === 1.0 ? 1.5 : rate === 1.5 ? 2.0 : 1.0;
    setRate(newRate);
    if (sound) await sound.setRateAsync(newRate, true);
  };

  const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (position / duration) : 0;

  return (
    <View style={[ap.wrap, { backgroundColor: isMe ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.07)' }]}>
      <TouchableOpacity onPress={loadAndPlay} style={ap.playBtn}>
        <Text style={{ fontSize: 18 }}>{playing ? '⏸' : '▶️'}</Text>
      </TouchableOpacity>
      <View style={{ flex: 1, marginHorizontal: 8 }}>
        <View style={ap.bar}>
          <View style={[ap.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={[ap.time, { color: isMe ? 'rgba(255,255,255,0.8)' : '#555' }]}>{fmtTime(position)}</Text>
          <Text style={[ap.time, { color: isMe ? 'rgba(255,255,255,0.8)' : '#555' }]}>{fmtTime(duration)}</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => seek(-1)} style={ap.skipBtn}>
        <Text style={{ fontSize: 13, color: isMe ? 'white' : '#333' }}>↩5</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => seek(1)} style={ap.skipBtn}>
        <Text style={{ fontSize: 13, color: isMe ? 'white' : '#333' }}>5↪</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={toggleRate} style={[ap.rateBtn, { borderColor: isMe ? 'rgba(255,255,255,0.5)' : '#aaa' }]}>
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: isMe ? 'white' : '#333' }}>{rate}×</Text>
      </TouchableOpacity>
    </View>
  );
}

const ap = StyleSheet.create({
  wrap: { borderRadius: 10, padding: 8, marginTop: 5, flexDirection: 'row', alignItems: 'center', minWidth: 200 },
  playBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  bar: { height: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 2 },
  fill: { height: 4, backgroundColor: '#00796b', borderRadius: 2 },
  time: { fontSize: 10 },
  skipBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  rateBtn: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 4 },
});

function RecordingIndicator({ seconds }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 500, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={ri.wrap}>
      <Animated.View style={[ri.dot, { transform: [{ scale: pulse }] }]} />
      <Text style={ri.txt}>🔴 جاري التسجيل {fmtSec(seconds)}</Text>
      <Text style={ri.hint}>ارفع إصبعك للإرسال</Text>
    </View>
  );
}

const ri = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(244,67,54,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#f44336' },
  txt: { color: '#f44336', fontWeight: 'bold', fontSize: 13 },
  hint: { color: '#f44336', fontSize: 11, opacity: 0.7 },
});

export default function ChatScreen({ visible, onClose, chatId, pharmacyId, role, requestName, localRequests, onToast }) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [userStatus, setUserStatus] = useState('');
  const [tabs, setTabs] = useState([]);
  const [tabNames, setTabNames] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgModalVisible, setImgModalVisible] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // حالات خاصة بالتعديل والحذف
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [isEditingMode, setIsEditingMode] = useState(false);

  const listRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(700)).current;
  const msgRef = useRef(null);
  const presenceRef = useRef(null);
  const recTimerRef = useRef(null);
  const statusIntervalRef = useRef(null);

  const myUid = firebaseAuth.currentUser?.uid;
  const activePid = role === 'pharmacy' ? myUid : (activeTab || pharmacyId);
  const isDirectChat = chatId?.startsWith('p_');
  const st = mkStyles(theme);

  // دالة لحساب تنسيق الوقت المنقضي الذكي لعدم الاتصال
  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'غير متصل';
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'منذ ثوانٍ';
    if (minutes === 1) return 'منذ دقيقة';
    if (minutes === 2) return 'منذ دقيقتين';
    if (minutes < 11) return `منذ ${minutes} دقائق`;
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours === 1) return 'منذ ساعة';
    if (hours === 2) return 'منذ ساعتين';
    if (hours < 11) return `منذ ${hours} ساعات`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days === 1) return 'منذ يوم';
    if (days === 2) return 'منذ يومين';
    return `منذ ${days} أيام`;
  };

  // إدارة حالة التواجد والاتصال الحقيقية (Presence) للـ User الحالي
  useEffect(() => {
    if (!myUid) return;
    const pRef = db.ref(`users/${myUid}/presence`);

    if (visible) {
      // عند الدخول للمحادثة: تعيين متصل الآن
      pRef.set({ online: true, lastSeen: Date.now() });
      // تفعيل ميزة التحديث التلقائي للمغادرة عند قطع الاتصال المفاجئ بالشبكة
      pRef.onDisconnect().set({ online: false, lastSeen: Date.now() });
    } else {
      // عند إغلاق المحادثة: تعيين غير متصل مع الوقت الحالي
      pRef.set({ online: false, lastSeen: Date.now() });
    }

    return () => {
      if (!visible) pRef.set({ online: false, lastSeen: Date.now() });
    };
  }, [visible, myUid]);

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : 700, duration: 300, useNativeDriver: true }).start();
    if (visible && chatId) {
      if (role === 'patient' && !isDirectChat) loadTabs();
      else startListen(chatId, role === 'pharmacy' ? myUid : pharmacyId);
    }
    return () => { 
      if (msgRef.current) msgRef.current(); 
      if (presenceRef.current) presenceRef.current();
      clearInterval(statusIntervalRef.current);
    };
  }, [visible, chatId]);

  useEffect(() => {
    const handleBackButton = () => {
      if (imgModalVisible) { setImgModalVisible(false); setSelectedImg(null); return true; }
      if (visible) { onClose(); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => backHandler.remove();
  }, [visible, imgModalVisible]);

  useEffect(() => {
    if (!visible && isRecording) {
      stopRecordingAndSend(false);
    }
  }, [visible]);

  const loadTabs = async () => {
    const snap = await db.ref(`chats/${chatId}`).once('value');
    if (!snap.exists()) return;
    const ids = []; const names = {};
    const ps = [];
    snap.forEach(c => {
      if (!['unreadPharmacy', 'unreadPatient'].includes(c.key)) {
        ids.push(c.key);
        ps.push(db.ref(`users/${c.key}`).once('value').then(s => { names[c.key] = s.val()?.pharmacyName || `صيدلية(${c.key.slice(0, 5)})`; }));
      }
    });
    await Promise.all(ps);
    setTabs(ids); setTabNames(names);
    if (ids[0]) selectTab(ids[0]);
  };

  const selectTab = (pid) => {
    setActiveTab(pid);
    db.ref(`chats/${chatId}/${pid}/unreadPatient`).set(0);
    startListen(chatId, pid);
  };

  const startListen = (cId, pid) => {
    if (msgRef.current) msgRef.current();
    if (role === 'pharmacy') db.ref(`chats/${cId}/${pid}/unreadPharmacy`).set(0);
    else db.ref(`chats/${cId}/${pid}/unreadPatient`).set(0);

    const ref = db.ref(`chats/${cId}/${pid}/messages`);
    let firstLoad = true;

    const listener = ref.on('value', snap => {
      const arr = [];
      if (snap.exists()) snap.forEach(c => arr.push({ id: c.key, ...c.val() }));

      setMessages(prev => {
        const isNewMsg = prev.length > 0 && arr.length > prev.length;
        if (firstLoad || isNewMsg) {
          setAutoScroll(true);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: !firstLoad }), 80);
          firstLoad = false;
        }
        return arr;
      });
    });

    msgRef.current = () => ref.off('value', listener);

    // متابعة وتحديث حالة اتصال الطرف الآخر حياً وتحديث نصوص "منذ ثوان" بشكل دوري
    if (presenceRef.current) presenceRef.current();
    let target = pid;
    if (role === 'pharmacy') {
      target = isDirectChat ? cId.split('_')[1] : (localRequests?.find(r => r.id === cId)?.patientId || pid);
    }
    
    const uPresenceRef = db.ref(`users/${target}/presence`);
    const updateStatusText = (snapData) => {
      if (snapData?.online === true) {
        setUserStatus('🟢 متصل الآن');
      } else {
        setUserStatus(`🕒 آخر ظهور ${formatTimeAgo(snapData?.lastSeen)}`);
      }
    };

    uPresenceRef.on('value', s => {
      const d = s.val();
      updateStatusText(d);
      
      // إعادة تشغيل المؤقت الزمني لتحديث الفروقات الدقيقة بالوقت تلقائياً كل 10 ثوانٍ
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = setInterval(() => {
        updateStatusText(d);
      }, 10000);
    });

    presenceRef.current = () => uPresenceRef.off('value');
  };

  const triggerNotification = async (title, body) => {
    try {
      let targetUid = activePid;
      if (role === 'pharmacy') {
        targetUid = isDirectChat
          ? chatId.split('_')[1]
          : (localRequests?.find(r => r.id === chatId)?.patientId || activePid);
      }
      const userSnap = await db.ref(`users/${targetUid}`).once('value');
      const targetToken = userSnap.val()?.fcmToken;
      if (!targetToken) return;
      await fetch('https://vercel-api-five-omega.vercel.app/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: targetToken,
          title,
          body,
        }),
      });
    } catch (e) { console.log('فشل الإشعار:', e); }
  };

  const sendMsg = async () => {
    const msg = text.trim();
    if (!msg || !chatId || !activePid) return;
    setText('');

    if (isEditingMode && editingMsgId) {
      // معالجة تعديل الرسالة القائمة
      await db.ref(`chats/${chatId}/${activePid}/messages/${editingMsgId}`).update({
        text: msg,
        isEdited: true
      });
      setIsEditingMode(false);
      setEditingMsgId(null);
      onToast('تم تعديل الرسالة');
    } else {
      // إرسال رسالة جديدة تماماً
      const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
      await ref.set({ role, text: msg, timestamp: Date.now() });
      const cn = role === 'pharmacy' ? 'unreadPatient' : 'unreadPharmacy';
      const cr = db.ref(`chats/${chatId}/${activePid}/${cn}`);
      cr.once('value').then(s => cr.set((s.val() || 0) + 1));
      triggerNotification(role === 'pharmacy' ? 'الصيدلية' : 'رسالة من مريض', msg);
    }
  };

  // ميزة حذف وتعديل الرسائل عند الضغط المطول
  const handleLongPressMessage = (item) => {
    if (item.role !== role || item.isDeleted) return; // الحذف والتعديل لرسائلك الخاصة فقط

    const options = [];
    if (item.text) {
      options.push({
        text: '✏️ تعديل الرسالة',
        onPress: () => {
          setText(item.text);
          setIsEditingMode(true);
          setEditingMsgId(item.id);
        }
      });
    }
    options.push({
      text: '🗑️ حذف للطرفين',
      style: 'destructive',
      onPress: async () => {
        await db.ref(`chats/${chatId}/${activePid}/messages/${item.id}`).update({
          text: '🚫 تم حذف هذه الرسالة',
          image: null,
          audio: null,
          locationUrl: null,
          isDeleted: true
        });
        onToast('تم حذف الرسالة');
      }
    });
    options.push({ text: 'إلغاء', style: 'cancel' });

    Alert.alert('خيارات الرسالة', 'اختر الإجراء المطلوب للرسالة المختارة:', options);
  };

  const sendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح بالوصول للمعرض', 'error');
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true });
    if (!r.canceled && r.assets[0]) {
      const b64 = `data:image/jpeg;base64,${r.assets[0].base64}`;
      const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
      await ref.set({ role, image: b64, timestamp: Date.now() });
      onToast('تم إرسال الصورة');
      triggerNotification(role === 'pharmacy' ? 'الصيدلية' : 'مريض', '📷 أرسل صورة جديدة');
    }
  };

  const startRecording = async () => {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح باستخدام الميكروفون', 'error');
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    setRecording(rec);
    setIsRecording(true);
    setRecSeconds(0);
    recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
  };

  const stopRecordingAndSend = async (doSend = true) => {
    clearInterval(recTimerRef.current);
    setIsRecording(false);
    setRecSeconds(0);
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (doSend && uri && chatId && activePid) {
        const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
        await ref.set({ role, audio: uri, timestamp: Date.now() });
        onToast('تم إرسال الرسالة الصوتية 🎙️');
        triggerNotification(role === 'pharmacy' ? 'الصيدلية' : 'مريض', '🎙️ أرسل رسالة صوتية');
      }
    } catch (e) {
      setRecording(null);
      console.log('خطأ إيقاف التسجيل:', e);
    }
  };

  const sendLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح بتحديد الموقع', 'error');
    const loc = await Location.getCurrentPositionAsync({});
    const url = `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`;
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role: 'pharmacy', locationUrl: url, timestamp: Date.now() });
    onToast('تم إرسال الموقع 📍');
    triggerNotification('الصيدلية', '📍 أرسلت لك موقعها الجغرافي');
  };

  const sendQuick = async (t) => {
    if (t.includes('سعر')) { setText(t); return; }
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role: 'pharmacy', text: t, timestamp: Date.now() });
    const cr = db.ref(`chats/${chatId}/${activePid}/unreadPatient`);
    cr.once('value').then(s => cr.set((s.val() || 0) + 1));
    triggerNotification('الصيدلية', t);
  };

  const handleOpenImage = (imgUri) => {
    setSelectedImg(imgUri);
    setImgModalVisible(true);
  };

  const cancelEditMode = () => {
    setIsEditingMode(false);
    setEditingMsgId(null);
    setText('');
  };

  if (!visible) return null;

  return (
    <Animated.View style={[st.container, { transform: [{ translateY: slideAnim }], backgroundColor: theme.cardBg }]}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{requestName || 'المحادثة'}</Text>
          <Text style={st.statusTxt}>{userStatus}</Text>
        </View>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>×</Text>
        </TouchableOpacity>
      </View>

      {role === 'patient' && tabs.length > 0 && (
        <ScrollView horizontal style={[st.tabsBar, { borderBottomColor: theme.border, backgroundColor: theme.bg }]} showsHorizontalScrollIndicator={false}>
          {tabs.map(tid => (
            <TouchableOpacity key={tid}
              style={[st.tabBtn, { borderColor: theme.border, backgroundColor: activeTab === tid ? theme.primary : theme.cardBg }]}
              onPress={() => selectTab(tid)}>
              <Text style={{ color: activeTab === tid ? 'white' : theme.text, fontWeight: 'bold', fontSize: 12 }}>
                {tabNames[tid] || tid.slice(0, 8)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={i => i.id || String(Math.random())}
          style={[st.msgList, { backgroundColor: theme.chatBg }]}
          contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
          onContentSizeChange={() => {
            if (autoScroll) listRef.current?.scrollToEnd({ animated: false });
          }}
          onScrollBeginDrag={() => setAutoScroll(false)}
          onScroll={(e) => {
            const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
            const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 60;
            if (isAtBottom) setAutoScroll(true);
          }}
          scrollEventThrottle={100}
          renderItem={({ item }) => {
            const isMe = item.role === role;
            return (
              <View style={[st.msgWrap, isMe ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }]}>
                <TouchableOpacity 
                  activeOpacity={0.8} 
                  onLongPress={() => handleLongPressMessage(item)}
                  style={[
                    st.bubble, 
                    { backgroundColor: isMe ? theme.primary : '#dcf8c6' },
                    item.isDeleted && { backgroundColor: theme.bg, borderWidth: 1, borderColor: theme.border }
                  ]}
                >
                  {item.text && (
                    <Text style={[
                      st.msgTxt, 
                      { color: isMe ? 'white' : '#333' },
                      item.isDeleted && { color: theme.subText, fontStyle: 'italic', fontSize: 13 }
                    ]}>
                      {item.text} {item.isEdited && !item.isDeleted && <Text style={st.editedLabel}>(معدلة)</Text>}
                    </Text>
                  )}
                  {item.image && (
                    <TouchableOpacity onPress={() => handleOpenImage(item.image)}>
                      <Image source={{ uri: item.image }} style={st.msgImg} resizeMode="cover" />
                    </TouchableOpacity>
                  )}
                  {item.audio && <AudioPlayer uri={item.audio} isMe={isMe} />}
                  {item.locationUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(item.locationUrl)} style={st.locBubble}>
                      <Text style={{ color: '#00796b', fontWeight: 'bold' }}>📍 عرض الموقع على الخريطة</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>
            );
          }}
        />

        {role === 'pharmacy' && !isEditingMode && (
          <ScrollView horizontal style={[st.quickBar, { borderTopColor: theme.border, backgroundColor: theme.bg }]} showsHorizontalScrollIndicator={false}>
            {[
              { l: '🟢 متوفر', t: 'مرحباً، الدواء متوفر لدينا وجاهز للاستلام.' },
              { l: '🔴 غير متوفر', t: 'عذراً، هذا الدواء غير متوفر حالياً.' },
              { l: '📷 صورة أوضح', t: 'يرجى تصوير الوصفة الطبية بشكل أوضح.' },
              { l: '💰 السعر', t: 'أهلاً بك، سعر هذا العلاج هو: ' },
              { l: '📍 موقعي', action: sendLocation },
            ].map((q, i) => (
              <TouchableOpacity key={i}
                style={[st.quickBtn, { borderColor: theme.primary, backgroundColor: theme.cardBg }]}
                onPress={() => q.action ? q.action() : sendQuick(q.t)}>
                <Text style={[st.quickTxt, { color: theme.primary }]}>{q.l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* شريط تنبيهي عند تفعيل نمط تعديل الرسالة النصية */}
        {isEditingMode && (
          <View style={[st.editIndicatorBar, { backgroundColor: theme.bg, borderTopColor: theme.border }]}>
            <TouchableOpacity onPress={cancelEditMode}>
              <Text style={st.cancelEditTxt}>إلغاء التعديل ×</Text>
            </TouchableOpacity>
            <Text style={[st.editIndicatorLabel, { color: theme.subText }]}>جاري تعديل الرسالة المنتقاة...</Text>
          </View>
        )}

        <View style={[st.inputArea, { backgroundColor: theme.cardBg, borderTopColor: theme.border }]}>
          {!isEditingMode && (
            <TouchableOpacity onPress={sendImage} style={st.iconBtn}>
              <Text style={{ fontSize: 21 }}>📷</Text>
            </TouchableOpacity>
          )}
          {!isEditingMode && (
            <TouchableOpacity
              onPressIn={startRecording}
              onPressOut={() => stopRecordingAndSend(true)}
              style={[st.iconBtn, isRecording && st.iconBtnRecording]}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 21 }}>{isRecording ? '🔴' : '🎙️'}</Text>
            </TouchableOpacity>
          )}

          {isRecording ? (
            <View style={{ flex: 1 }}>
              <RecordingIndicator seconds={recSeconds} />
            </View>
          ) : (
            <TextInput
              style={[st.chatInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
              placeholder={isEditingMode ? "عدل رسالتك هنا..." : "اكتب رسالتك..."} 
              placeholderTextColor={theme.subText}
              value={text} onChangeText={setText} textAlign="right"
              onSubmitEditing={sendMsg}
            />
          )}

          {!isRecording && (
            <TouchableOpacity style={[st.sendBtn, { backgroundColor: isEditingMode ? '#00c853' : theme.primary }]} onPress={sendMsg}>
              <Text style={{ color: 'white', fontWeight: 'bold' }}>{isEditingMode ? 'حفظ' : 'إرسال'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={imgModalVisible} transparent animationType="fade">
        <View style={st.modalBackground}>
          <TouchableOpacity style={st.closeImgBtn} onPress={() => { setImgModalVisible(false); setSelectedImg(null); }}>
            <Text style={st.closeImgTxt}>×</Text>
          </TouchableOpacity>
          {selectedImg && (
            <Image source={{ uri: selectedImg }} style={st.fullImage} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </Animated.View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20000 },
  header: { backgroundColor: '#00796b', padding: 15, paddingTop: Platform.OS === 'android' ? 42 : 58, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  statusTxt: { color: '#b2dfdb', fontSize: 11, marginTop: 2, fontWeight: '500' },
  tabsBar: { maxHeight: 54, borderBottomWidth: 1, paddingHorizontal: 10 },
  tabBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8, marginVertical: 8 },
  msgList: { flex: 1 },
  msgWrap: { marginBottom: 8 },
  bubble: { maxWidth: '76%', padding: 10, borderRadius: 12 },
  msgTxt: { fontSize: 14, lineHeight: 20, textAlign: 'right' },
  editedLabel: { fontSize: 10, color: 'rgba(0,0,0,0.4)', fontStyle: 'italic' },
  msgImg: { width: 200, height: 160, borderRadius: 8, marginTop: 5 },
  locBubble: { padding: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 7, marginTop: 4 },
  quickBar: { maxHeight: 50, borderTopWidth: 1, paddingHorizontal: 8 },
  quickBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 15, borderWidth: 1, marginRight: 8, marginVertical: 7 },
  quickTxt: { fontWeight: 'bold', fontSize: 12 },
  editIndicatorBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 6, borderTopWidth: 1, alignItems: 'center' },
  editIndicatorLabel: { fontSize: 11, fontStyle: 'italic' },
  cancelEditTxt: { color: '#f44336', fontSize: 12, fontWeight: 'bold' },
  inputArea: { flexDirection: 'row', padding: 10, gap: 7, borderTopWidth: 1, alignItems: 'center' },
  iconBtn: { padding: 5 },
  iconBtnRecording: { backgroundColor: 'rgba(244,67,54,0.15)', borderRadius: 20, padding: 8 },
  chatInput: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 20, fontSize: 14 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  closeImgBtn: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 55, right: 25, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.25)', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  closeImgTxt: { color: 'white', fontSize: 32, fontWeight: '300', marginTop: -4 },
  fullImage: { width: '100%', height: '80%' },
});
