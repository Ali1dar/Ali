import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Image, Animated, Platform, Linking, ScrollView, KeyboardAvoidingView, BackHandler, Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { db, firebaseAuth, formatLastSeen } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

// ─── مشغل صوتي احترافي (محدث بالكامل) ───────────────────────────────────────
function AudioPlayer({ uri, isMe, theme }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const soundRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const togglePlay = async () => {
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (s) => { if (s.didJustFinish) { setIsPlaying(false); setPosition(0); clearInterval(intervalRef.current); } }
        );
        soundRef.current = sound;
        setDuration(status.durationMillis || 0);
        setIsPlaying(true);
        intervalRef.current = setInterval(async () => {
          const s = await sound.getStatusAsync();
          if (s.isLoaded) setPosition(s.positionMillis || 0);
        }, 150);
      } else {
        const status = await soundRef.current.getStatusAsync();
        if (status.isPlaying) {
          await soundRef.current.pauseAsync();
          setIsPlaying(false);
          clearInterval(intervalRef.current);
        } else {
          await soundRef.current.playAsync();
          setIsPlaying(true);
          intervalRef.current = setInterval(async () => {
            const s = await soundRef.current.getStatusAsync();
            if (s.isLoaded) setPosition(s.positionMillis || 0);
          }, 150);
        }
      }
    } catch (e) { console.log('خطأ تشغيل الصوت:', e); }
  };

  const fmt = (ms) => {
    const s = Math.floor((ms || 0) / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  const progress = duration > 0 ? position / duration : 0;
  
  const cardBg = isMe ? theme.primary : (theme.dark ? '#263238' : '#e0f2f1');
  const btnBg = isMe ? 'rgba(255,255,255,0.25)' : theme.primary;
  const iconColor = 'white';
  const barBg = isMe ? 'rgba(255,255,255,0.3)' : '#b2dfdb';
  const barFill = isMe ? '#fff' : theme.primary;
  const txtColor = isMe ? '#fff' : theme.text;

  const bars = [0.4, 0.8, 0.5, 1.0, 0.7, 0.9, 0.4, 0.6, 0.8, 0.5, 0.9, 0.7, 0.4, 0.8, 0.6];

  return (
    <View style={[apStyles.wrap, { backgroundColor: cardBg }]}>
      <TouchableOpacity onPress={togglePlay} style={[apStyles.playBtn, { backgroundColor: btnBg }]}>
        <Text style={{ color: iconColor, fontSize: 14 }}>{isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
      
      <View style={{ flex: 1, marginRight: 12 }}>
        <View style={apStyles.waveWrap}>
          {bars.map((h, i) => {
            const filled = (i / bars.length) <= progress;
            return (
              <View 
                key={i} 
                style={[
                  apStyles.bar, 
                  { 
                    height: 6 + h * 16, 
                    backgroundColor: filled ? barFill : barBg,
                    opacity: isPlaying && filled ? 1 : 0.8
                  }
                ]} 
              />
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={[apStyles.time, { color: txtColor }]}>
            {isPlaying || position > 0 ? fmt(position) : fmt(duration)}
          </Text>
          <Text style={[apStyles.time, { color: txtColor, opacity: 0.5 }]}>🎙️</Text>
        </View>
      </View>
    </View>
  );
}

const apStyles = StyleSheet.create({
  wrap: { flexDirection: 'row-reverse', alignItems: 'center', borderRadius: 20, padding: 10, width: 230, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  playBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  waveWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 3, height: 26, justifyContent: 'center' },
  bar: { width: 3, borderRadius: 2 },
  time: { fontSize: 10, fontWeight: '600' },
});

// ─── شريط التسجيل المتحرك (Snapchat Style) ──────────────────────────────────
function RecordingBar({ onStop, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 400, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();
    return () => clearInterval(timer);
  }, []);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const mockBars = [0.4, 0.9, 0.6, 1.0, 0.5, 0.8, 0.7, 0.4, 1.0, 0.6, 0.8, 0.5, 0.9, 0.7, 0.4];

  return (
    <View style={rbStyles.wrap}>
      <TouchableOpacity onPress={onCancel} style={rbStyles.trashBtn}>
        <Text style={{ fontSize: 18 }}>🗑️</Text>
      </TouchableOpacity>

      <View style={rbStyles.waveContainer}>
        <Animated.View style={[rbStyles.dot, { transform: [{ scale: pulseAnim }] }]} />
        <View style={rbStyles.wave}>
          {mockBars.map((h, i) => (
            <View key={i} style={[rbStyles.bar, { height: 4 + h * 18, backgroundColor: '#ff4444' }]} />
          ))}
        </View>
      </View>

      <Text style={rbStyles.time}>{fmt(elapsed)}</Text>

      <TouchableOpacity onPress={onStop} style={rbStyles.sendRecBtn}>
        <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>✓</Text>
      </TouchableOpacity>
    </View>
  );
}

const rbStyles = StyleSheet.create({
  wrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff0f0', borderRadius: 25, paddingHorizontal: 10, paddingVertical: 6, gap: 10, borderWidth: 1, borderColor: '#ffccd0' },
  trashBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#ffe5e5', justifyContent: 'center', alignItems: 'center' },
  waveContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff4444' },
  wave: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: 24, justifyContent: 'center' },
  bar: { width: 2.5, borderRadius: 2, opacity: 0.6 },
  time: { color: '#ff4444', fontWeight: 'bold', fontSize: 13, minWidth: 35, textAlign: 'center' },
  sendRecBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#25D366', justifyContent: 'center', alignItems: 'center' },
});

export default function ChatScreen({ visible, onClose, chatId, pharmacyId, role, requestName, localRequests, onToast }) {
  const { theme } = useTheme();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [userStatus, setUserStatus] = useState('');
  const [tabs, setTabs] = useState([]);
  const [tabNames, setTabNames] = useState({});
  const [activeTab, setActiveTab] = useState(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgModalVisible, setImgModalVisible] = useState(false);

  const listRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(700)).current;
  const msgRef = useRef(null);
  const isAtBottom = useRef(true);
  const prevMsgCount = useRef(0);

  const activePid = role === 'pharmacy' ? firebaseAuth.currentUser?.uid : (activeTab || pharmacyId);
  const isDirectChat = chatId?.startsWith('p_');
  const st = mkStyles(theme);

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : 700, duration: 300, useNativeDriver: true }).start();
    if (visible && chatId) {
      if (role === 'patient' && !isDirectChat) loadTabs();
      else startListen(chatId, role === 'pharmacy' ? firebaseAuth.currentUser?.uid : pharmacyId);
    }
    return () => { if (msgRef.current) msgRef.current(); };
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

  const loadTabs = async () => {
    const snap = await db.ref(`chats/${chatId}`).once('value');
    if (!snap.exists()) return;
    const ids = []; const names = {}; const ps = [];
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
    const listener = ref.on('value', snap => {
      let arr = [];
      if (snap.exists()) snap.forEach(c => arr.push({ id: c.key, ...c.val() }));

      const isNewMessage = arr.length > prevMsgCount.current;
      prevMsgCount.current = arr.length;

      setMessages(arr);

      if (isNewMessage && isAtBottom.current) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      }
      if (prevMsgCount.current === arr.length && arr.length > 0) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
      }
    });
    msgRef.current = () => ref.off('value', listener);

    let target = pid;
    if (role === 'pharmacy') {
      target = isDirectChat ? cId.split('_')[1] : (localRequests?.find(r => r.id === cId)?.patientId || pid);
    }
    db.ref(`users/${target}/presence`).on('value', s => {
      const d = s.val();
      setUserStatus(d?.online === true ? '🟢 متصل الآن' : `🕒 ${formatLastSeen(d?.lastSeen)}`);
    });
  };

  const triggerNotification = async (title, body) => {
    try {
      let targetUid = activePid;
      if (role === 'pharmacy') {
        targetUid = isDirectChat ? chatId.split('_')[1] : (localRequests?.find(r => r.id === chatId)?.patientId || activePid);
      }
      const userSnap = await db.ref(`users/${targetUid}`).once('value');
      const targetToken = userSnap.val()?.fcmToken;
      if (!targetToken) return;
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetToken, sound: 'default', title, body, data: { chatId } }),
      });
    } catch (e) { console.log('فشل الإشعار:', e); }
  };

  const sendMsg = async () => {
    const msg = text.trim();
    if (!msg || !chatId || !activePid) return;
    setText('');
    isAtBottom.current = true;
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role, text: msg, timestamp: Date.now() });
    const cn = role === 'pharmacy' ? 'unreadPatient' : 'unreadPharmacy';
    const cr = db.ref(`chats/${chatId}/${activePid}/${cn}`);
    cr.once('value').then(s => cr.set((s.val() || 0) + 1));
    triggerNotification(role === 'pharmacy' ? 'الصيدلية' : 'رسالة جديدة', msg);
  };

  const sendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح بالوصول للمعرض', 'error');
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.5, base64: true });
    if (!r.canceled && r.assets[0]) {
      const b64 = `data:image/jpeg;base64,${r.assets[0].base64}`;
      isAtBottom.current = true;
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
  };

  const cancelRecording = async () => {
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      setRecording(null);
      setIsRecording(false);
      onToast('تم إلغاء التسجيل 🗑️');
    } catch (e) { console.log(e); }
  };

  const stopRecording = async () => {
    if (!recording) return;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);
    setIsRecording(false);
    isAtBottom.current = true;
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role, audio: uri, timestamp: Date.now() });
    onToast('تم إرسال الرسالة الصوتية 🎙️');
    triggerNotification(role === 'pharmacy' ? 'الصيدلية' : 'مريض', '🎙️ أرسل رسالة صوتية');
  };

  const sendLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return onToast('يرجى السماح بتحديد الموقع', 'error');
    const loc = await Location.getCurrentPositionAsync({});
    const url = `https://www.google.com/maps?q=${loc.coords.latitude},${loc.coords.longitude}`;
    isAtBottom.current = true;
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role: 'pharmacy', locationUrl: url, timestamp: Date.now() });
    onToast('تم إرسال الموقع 📍');
    triggerNotification('الصيدلية', '📍 أرسلت لك موقعها على الخريطة');
  };

  const sendQuick = async (t) => {
    if (t.includes('سعر')) { setText(t); return; }
    isAtBottom.current = true;
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role: 'pharmacy', text: t, timestamp: Date.now() });
    const cr = db.ref(`chats/${chatId}/${activePid}/unreadPatient`);
    cr.once('value').then(s => cr.set((s.val() || 0) + 1));
    triggerNotification('الصيدلية', t);
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
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            isAtBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 60;
          }}
          scrollEventThrottle={100}
          renderItem={({ item }) => {
            const isMe = item.role === role;
            const isAudioOnly = item.audio && !item.text;

            return (
              <View style={[st.msgWrap, isMe ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }]}>
                <View style={[
                  st.bubble, 
                  { backgroundColor: isAudioOnly ? 'transparent' : (isMe ? theme.primary : (theme.dark ? '#1e272e' : '#fff')) },
                  isAudioOnly && { padding: 0, maxWidth: '100%' }
                ]}>
                  {item.text && (
                    <Text style={[st.msgTxt, { color: isMe ? 'white' : theme.text }]}>{item.text}</Text>
                  )}
                  {item.image && (
                    <TouchableOpacity onPress={() => { setSelectedImg(item.image); setImgModalVisible(true); }}>
                      <Image source={{ uri: item.image }} style={st.msgImg} />
                    </TouchableOpacity>
                  )}
                  {item.audio && <AudioPlayer uri={item.audio} isMe={isMe} theme={theme} />}
                  {item.locationUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(item.locationUrl)} style={st.locBubble}>
                      <Text style={{ color: '#00796b', fontWeight: 'bold' }}>📍 عرض الموقع على الخريطة</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />

        {role === 'pharmacy' && (
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

        <View style={[st.inputArea, { backgroundColor: theme.cardBg, borderTopColor: theme.border }]}>
          {isRecording ? (
            <RecordingBar onStop={stopRecording} onCancel={cancelRecording} />
          ) : (
            <>
              <TouchableOpacity onPress={sendImage} style={st.iconBtn}>
                <Text style={{ fontSize: 22 }}>📷</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={startRecording} style={st.iconBtn}>
                <Text style={{ fontSize: 22 }}>🎙️</Text>
              </TouchableOpacity>
              <TextInput
                style={[st.chatInput, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                placeholder="اكتب رسالتك..." placeholderTextColor={theme.subText}
                value={text} onChangeText={setText} textAlign="right"
                onSubmitEditing={sendMsg}
              />
              <TouchableOpacity style={[st.sendBtn, { backgroundColor: theme.primary }]} onPress={sendMsg}>
                <Text style={{ color: 'white', fontWeight: 'bold' }}>إرسال</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={imgModalVisible} transparent animationType="fade">
        <View style={st.modalBackground}>
          <TouchableOpacity style={st.closeImgBtn} onPress={() => { setImgModalVisible(false); setSelectedImg(null); }}>
            <Text style={st.closeImgTxt}>×</Text>
          </TouchableOpacity>
          {selectedImg && <Image source={{ uri: selectedImg }} style={st.fullImage} resizeMode="contain" />}
        </View>
      </Modal>
    </Animated.View>
  );
}

const mkStyles = (t) => StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20000 },
  header: { backgroundColor: '#00796b', padding: 15, paddingTop: Platform.OS === 'android' ? 42 : 58, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  statusTxt: { color: '#b2dfdb', fontSize: 11, marginTop: 2 },
  tabsBar: { maxHeight: 54, borderBottomWidth: 1, paddingHorizontal: 10 },
  tabBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8, marginVertical: 8 },
  msgList: { flex: 1 },
  msgWrap: { marginBottom: 10 },
  bubble: { maxWidth: '80%', padding: 12, borderRadius: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 1, elevation: 0.5 },
  msgTxt: { fontSize: 14, lineHeight: 22 },
  msgImg: { width: 200, height: 150, borderRadius: 12, marginTop: 5 },
  locBubble: { padding: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 7, marginTop: 4 },
  quickBar: { maxHeight: 50, borderTopWidth: 1, paddingHorizontal: 8 },
  quickBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 15, borderWidth: 1, marginRight: 8, marginVertical: 7 },
  quickTxt: { fontWeight: 'bold', fontSize: 12 },
  inputArea: { flexDirection: 'row', padding: 10, gap: 7, borderTopWidth: 1, alignItems: 'center' },
  iconBtn: { padding: 5 },
  chatInput: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 20, fontSize: 14 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  closeImgBtn: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 55, right: 25, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.25)', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  closeImgTxt: { color: 'white', fontSize: 32, fontWeight: '300', marginTop: -4 },
  fullImage: { width: '100%', height: '80%' },
});
