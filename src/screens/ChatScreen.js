// src/screens/ChatScreen.js
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
  
  // 🔴 حالتان جديدتان للتحكم في تكبير الصورة
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgModalVisible, setImgModalVisible] = useState(false);

  const listRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(700)).current;
  const msgRef = useRef(null);

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

  // مستمع زر الرجوع لأندرويد
  useEffect(() => {
    const handleBackButton = () => {
      // إذا كانت نافذة تكبير الصورة مفتوحة، نغلقها أولاً
      if (imgModalVisible) {
        setImgModalVisible(false);
        setSelectedImg(null);
        return true;
      }
      if (visible) {
        onClose();
        return true;
      }
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackButton);
    return () => backHandler.remove();
  }, [visible, imgModalVisible]);

  const loadTabs = async () => {
    const snap = await db.ref(`chats/${chatId}`).once('value');
    if (!snap.exists()) return;
    const ids = []; const names = {};
    const ps = [];
    snap.forEach(c => {
      if (!['unreadPharmacy','unreadPatient'].includes(c.key)) {
        ids.push(c.key);
        ps.push(db.ref(`users/${c.key}`).once('value').then(s => { names[c.key] = s.val()?.pharmacyName || `صيدلية(${c.key.slice(0,5)})`; }));
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
      setMessages(arr);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    });
    msgRef.current = () => ref.off('value', listener);

    // Status
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
        body: JSON.stringify({
          to: targetToken,
          sound: 'default',
          title: title,
          body: body,
          data: { chatId: chatId },
        }),
      });
    } catch (e) {
      console.log('فشل إرسال الإشعار سحابياً:', e);
    }
  };

  const sendMsg = async () => {
    const msg = text.trim();
    if (!msg || !chatId || !activePid) return;
    setText('');
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role, text: msg, timestamp: Date.now() });
    
    const cn = role === 'pharmacy' ? 'unreadPatient' : 'unreadPharmacy';
    const cr = db.ref(`chats/${chatId}/${activePid}/${cn}`);
    cr.once('value').then(s => cr.set((s.val() || 0) + 1));

    const senderName = role === 'pharmacy' ? 'الصيدلية' : 'رسالة من مريض';
    triggerNotification(senderName, msg);
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

      const senderName = role === 'pharmacy' ? 'الصيدلية' : 'مريض';
      triggerNotification(senderName, '📷 أرسل صورة جديدة للوصفة الطبية');
    }
  };

  const toggleRecord = async () => {
    if (!isRecording) {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') return onToast('يرجى السماح باستخدام الميكروفون', 'error');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: rec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(rec); setIsRecording(true);
      onToast('جاري التسجيل... 🔴');
    } else {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null); setIsRecording(false);
      const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
      await ref.set({ role, audio: uri, timestamp: Date.now() });
      onToast('تم إرسال الرسالة الصوتية 🎙️');

      const senderName = role === 'pharmacy' ? 'الصيدلية' : 'مريض';
      triggerNotification(senderName, '🎙️ أرسل رسالة صوتية جديدة');
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

    triggerNotification('الصيدلية', '📍 أرسلت لك موقعها الجغرافي على الخريطة');
  };

  const sendQuick = async (t) => {
    if (t.includes('سعر')) { setText(t); return; }
    const ref = db.ref(`chats/${chatId}/${activePid}/messages`).push();
    await ref.set({ role: 'pharmacy', text: t, timestamp: Date.now() });
    const cr = db.ref(`chats/${chatId}/${activePid}/unreadPatient`);
    cr.once('value').then(s => cr.set((s.val() || 0) + 1));

    triggerNotification('الصيدلية', t);
  };

  const playAudio = async (uri) => {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();
    } catch { onToast('تعذر تشغيل الصوت', 'error'); }
  };

  // دالة تفتح الصورة بكامل الشاشة عند النقر عليها
  const handleOpenImage = (imgUri) => {
    setSelectedImg(imgUri);
    setImgModalVisible(true);
  };

  if (!visible) return null;

  return (
    <Animated.View style={[st.container, { transform: [{ translateY: slideAnim }], backgroundColor: theme.cardBg }]}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{requestName || 'المحادثة'}</Text>
          <Text style={st.statusTxt}>{userStatus}</Text>
        </View>
        <TouchableOpacity onPress={onClose}><Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>×</Text></TouchableOpacity>
      </View>

      {role === 'patient' && tabs.length > 0 && (
        <ScrollView horizontal style={[st.tabsBar, { borderBottomColor: theme.border, backgroundColor: theme.bg }]} showsHorizontalScrollIndicator={false}>
          {tabs.map(tid => (
            <TouchableOpacity key={tid}
              style={[st.tabBtn, { borderColor: theme.border, backgroundColor: activeTab === tid ? theme.primary : theme.cardBg }]}
              onPress={() => selectTab(tid)}>
              <Text style={{ color: activeTab === tid ? 'white' : theme.text, fontWeight: 'bold', fontSize: 12 }}>
                {tabNames[tid] || tid.slice(0,8)}
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
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const isMe = item.role === role;
            return (
              <View style={[st.msgWrap, isMe ? { alignItems: 'flex-start' } : { alignItems: 'flex-end' }]}>
                <View style={[st.bubble, { backgroundColor: isMe ? theme.primary : '#dcf8c6' }]}>
                  {item.text && <Text style={[st.msgTxt, { color: isMe ? 'white' : '#333' }]}>{item.text}</Text>}
                  
                  {/* 🔴 جعل الصورة قابلة للضغط للتكبير */}
                  {item.image && (
                    <TouchableOpacity onPress={() => handleOpenImage(item.image)}>
                      <Image source={{ uri: item.image }} style={st.msgImg} />
                    </TouchableOpacity>
                  )}
                  
                  {item.audio && (
                    <TouchableOpacity style={st.audioBubble} onPress={() => playAudio(item.audio)}>
                      <Text style={{ color: isMe ? 'white' : '#333' }}>▶️ تشغيل الرسالة الصوتية</Text>
                    </TouchableOpacity>
                  )}
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
          <TouchableOpacity onPress={sendImage} style={st.iconBtn}><Text style={{ fontSize: 21 }}>📷</Text></TouchableOpacity>
          <TouchableOpacity onPress={toggleRecord} style={st.iconBtn}>
            <Text style={{ fontSize: 21 }}>{isRecording ? '🛑' : '🎙️'}</Text>
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
        </View>
      </KeyboardAvoidingView>

      {/* 🔴 واجهة عرض وتكبير الصورة بكامل الشاشة المدمجة */}
      <Modal visible={imgModalVisible} transparent={true} animationType="fade">
        <View style={st.modalBackground}>
          {/* زر الإغلاق في الأعلى */}
          <TouchableOpacity style={st.closeImgBtn} onPress={() => { setImgModalVisible(false); setSelectedImg(null); }}>
            <Text style={st.closeImgTxt}>×</Text>
          </TouchableOpacity>
          
          {/* عرض الصورة بحجمها الكامل المتناسق مع الشاشة */}
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
  statusTxt: { color: '#b2dfdb', fontSize: 11, marginTop: 2 },
  tabsBar: { maxHeight: 54, borderBottomWidth: 1, paddingHorizontal: 10 },
  tabBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8, marginVertical: 8 },
  msgList: { flex: 1 },
  msgWrap: { marginBottom: 8 },
  bubble: { maxWidth: '76%', padding: 10, borderRadius: 12 },
  msgTxt: { fontSize: 14, lineHeight: 20 },
  msgImg: { width: 200, height: 150, borderRadius: 8, marginTop: 5 },
  audioBubble: { padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 7, marginTop: 4 },
  locBubble: { padding: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 7, marginTop: 4 },
  quickBar: { maxHeight: 50, borderTopWidth: 1, paddingHorizontal: 8 },
  quickBtn: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 15, borderWidth: 1, marginRight: 8, marginVertical: 7 },
  quickTxt: { fontWeight: 'bold', fontSize: 12 },
  inputArea: { flexDirection: 'row', padding: 10, gap: 7, borderTopWidth: 1, alignItems: 'center' },
  iconBtn: { padding: 5 },
  chatInput: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 20, fontSize: 14 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  
  // 🔴 ستايلات نافذة تكبير الصورة الجديدة
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' },
  closeImgBtn: { position: 'absolute', top: Platform.OS === 'android' ? 40 : 55, right: 25, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.25)', width: 45, height: 45, borderRadius: 22.5, justifyContent: 'center', alignItems: 'center' },
  closeImgTxt: { color: 'white', fontSize: 32, fontWeight: '300', marginTop: -4 },
  fullImage: { width: '100%', height: '80%' }
});
