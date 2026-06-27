// src/screens/ChatScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Image, Animated, Platform, Linking, ScrollView, BackHandler, Modal, Alert, Keyboard
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db, firebaseAuth } from '../utils/firebase';
import { useTheme } from '../utils/ThemeContext';

// ... (مكونات AudioPlayer و RecordingIndicator تبقى كما هي دون تغيير) ...

export default function ChatScreen({ visible, onClose, chatId, pharmacyId, role, requestName, localRequests, onToast }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [userStatus, setUserStatus] = useState('');
  const [tabs, setTabs] = useState([]);
  const [tabNames, setTabNames] = useState({});
  const [tabUnreads, setTabUnreads] = useState({}); 
  const [activeTab, setActiveTab] = useState(null);
  const [selectedImg, setSelectedImg] = useState(null);
  const [imgModalVisible, setImgModalVisible] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [isEditingMode, setIsEditingMode] = useState(false);

  const listRef = useRef(null);
  const slideAnim = useRef(new Animated.Value(700)).current;
  
  // 🔥 حساب حركة الكيبورد فوريًا
  const keyboardHeight = useRef(new Animated.Value(0)).current;

  const msgRef = useRef(null);
  const presenceRef = useRef(null);
  const tabsListenerRef = useRef(null); 
  const recTimerRef = useRef(null);
  const statusIntervalRef = useRef(null);

  const myUid = firebaseAuth.currentUser?.uid;
  const isDirectChat = chatId?.startsWith('p_');
  
  const st = mkStyles(theme, insets);

  // 🛠️ الاستماع الدقيق لحركات الكيبورد لتقليص الشاشة بأكملها
  useEffect(() => {
    if (!visible) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e) => {
      Animated.timing(keyboardHeight, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? e.duration : 100, // سرعة إضافية للأندرويد لحل التباطؤ
        useNativeDriver: false,
      }).start(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      });
    });

    const hideSubscription = Keyboard.addListener(hideEvent, (e) => {
      Animated.timing(keyboardHeight, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e.duration : 100,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [visible]);

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: visible ? 0 : 700, duration: 300, useNativeDriver: true }).start();
    let isMounted = true;

    if (msgRef.current) { msgRef.current(); msgRef.current = null; }
    if (presenceRef.current) { presenceRef.current(); presenceRef.current = null; }
    if (tabsListenerRef.current) { tabsListenerRef.current(); tabsListenerRef.current = null; }
    clearInterval(statusIntervalRef.current);

    if (visible && chatId) {
      setTabs([]);
      setTabNames({});
      setTabUnreads({});
      setMessages([]);
      setActiveTab(null);
      setUserStatus('جاري التحميل...');

      if (role === 'patient' && !isDirectChat) {
        startListenTabs(isMounted);
      } else {
        const currentPid = role === 'pharmacy' ? myUid : pharmacyId;
        setActiveTab(currentPid);
        startListen(chatId, currentPid);
      }
    }
    return () => { 
      isMounted = false;
      if (msgRef.current) msgRef.current(); 
      if (presenceRef.current) presenceRef.current();
      if (tabsListenerRef.current) tabsListenerRef.current();
      clearInterval(statusIntervalRef.current);
    };
  }, [visible, chatId]);

  // ... (بقية الدوال الداخلية startListenTabs, sendMsg الخ تبقى مستقرة ودون تغيير) ...

  if (!visible) return null;

  return (
    /* 🔥 التغيير الجذري هنا: جعل الحاوية المطلقة تنتهي (bottom) عند بداية الكيبورد تماماً */
    <Animated.View style={[
      st.container, 
      { 
        transform: [{ translateY: slideAnim }], 
        backgroundColor: theme?.cardBg || '#ffffff',
        bottom: keyboardHeight // الشاشة بالكامل تتقلص وتصعد مع صعود الكيبورد حتمياً!
      }
    ]}>
      {/* هيدر الشاشة */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle} numberOfLines={1}>{requestName || 'المحادثة'}</Text>
          <Text style={st.statusTxt}>{userStatus}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 5 }}>
          <Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold', lineHeight: 28 }}>×</Text>
        </TouchableOpacity>
      </View>

      {role === 'patient' && tabs.length > 0 && (
        <View style={[st.tabsContainer, { borderBottomColor: theme?.border || '#ccc', backgroundColor: theme?.bg || '#f9f9f9' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, alignItems: 'center' }}>
            {tabs.map(tid => (
              <TouchableOpacity key={tid}
                style={[st.tabBtn, { 
                  borderColor: tabUnreads[tid] > 0 ? '#e53935' : (theme?.border || '#ccc'), 
                  backgroundColor: activeTab === tid ? (theme?.primary || '#00796b') : (theme?.cardBg || '#fff'),
                  flexDirection: 'row', alignItems: 'center', gap: 6
                }]}
                onPress={() => selectTab(tid)}>
                {tabUnreads[tid] > 0 && <View style={st.tabRedDot} />}
                <Text style={{ color: activeTab === tid ? 'white' : (theme?.text || '#000'), fontWeight: 'bold', fontSize: 12 }}>
                  {tabNames[tid] || tid.slice(0, 8)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* منطقة الرسائل الفليكسبيبل */}
      <View style={{ flex: 1, backgroundColor: theme?.chatBg || '#efeae2' }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={i => i.id || String(Math.random())}
          style={st.msgList}
          contentContainerStyle={{ padding: 14, paddingBottom: 10 }}
          inverted
          removeClippedSubviews={Platform.OS === 'android'}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isMe = item.role === role;
            const defaultBg = isMe ? (theme?.primary || '#00796b') : '#dcf8c6';
            return (
              <View style={[st.msgWrap, isMe ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
                <TouchableOpacity activeOpacity={0.8} onLongPress={() => handleLongPressMessage(item)} style={[st.bubble, { backgroundColor: defaultBg }, item.isDeleted && { backgroundColor: theme?.bg || '#f5f5f5', borderWidth: 1, borderColor: theme?.border || '#ccc' }]}>
                  {item.text && <Text style={[st.msgTxt, { color: isMe ? 'white' : '#333' }]}>{item.text}</Text>}
                  {item.image && <Image source={{ uri: item.image }} style={st.msgImg} resizeMode="cover" />}
                  {item.audio && <AudioPlayer uri={item.audio} isMe={isMe} timestamp={item.timestamp} seen={item.seen} />}
                </TouchableOpacity>
              </View>
            );
          }}
        />
      </View>

      {/* البار السريع للصيدلية */}
      {role === 'pharmacy' && !isEditingMode && (
        <View style={[st.quickBarContainer, { borderTopColor: theme?.border || '#ccc', backgroundColor: theme?.bg || '#fff' }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center' }}>
            {[
              { l: '🟢 متوفر', t: 'مرحباً، الدواء متوفر لدينا وجاهز للاستلام.' },
              { l: '🔴 غير متوفر', t: 'عذراً، هذا الدواء غير متوفر حالياً.' },
              { l: '📷 صورة أوضح', t: 'يرجى تصوير الوصفة الطبية بشكل أوضح.' },
              { l: '💰 السعر', t: 'أهلاً بك، سعر هذا علاج هو: ' },
              { l: '📍 موقعي', action: sendLocation },
            ].map((q, i) => (
              <TouchableOpacity key={i}
                style={[st.quickBtn, { borderColor: theme?.primary || '#00796b', backgroundColor: theme?.cardBg || '#fff' }]}
                onPress={() => q.action ? q.action() : sendQuick(q.t)}>
                <Text style={[st.quickTxt, { color: theme?.primary || '#00796b' }]}>{q.l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {isEditingMode && (
        <View style={[st.editIndicatorBar, { backgroundColor: theme?.bg || '#fff', borderTopColor: theme?.border || '#ccc' }]}>
          <TouchableOpacity onPress={cancelEditMode}>
            <Text style={st.cancelEditTxt}>إلغاء التعديل ×</Text>
          </TouchableOpacity>
          <Text style={[st.editIndicatorLabel, { color: theme?.subText || '#666' }]}>جاري تعديل الرسالة...</Text>
        </View>
      )}

      {/* شريط الإدخال السفلي الثابت (يتأثر فقط بـ safe area عند إغلاق الكيبورد) */}
      <View style={[
        st.inputArea, 
        { 
          backgroundColor: theme?.cardBg || '#fff', 
          borderTopColor: theme?.border || '#ccc',
          paddingBottom: keyboardHeight.interpolate({
            inputRange: [0, 1],
            outputRange: [Platform.OS === 'ios' ? (insets.bottom > 0 ? insets.bottom : 8) : (insets.bottom > 0 ? insets.bottom + 4 : 10), 10]
          })
        }
      ]}>
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
            style={[st.chatInput, { backgroundColor: theme?.bg || '#f5f5f5', borderColor: theme?.border || '#ccc', color: theme?.text || '#000' }]}
            placeholder={isEditingMode ? "عدل رسالتك..." : "اكتب رسالتك..."} 
            placeholderTextColor={theme?.subText || '#999'}
            value={text} onChangeText={setText} textAlign="right"
            onSubmitEditing={sendMsg}
            blurOnSubmit={false}
          />
        )}

        {!isRecording && text.trim().length === 0 && role === 'patient' && (
          <TouchableOpacity style={st.iconBtn} onPress={sendLocation}>
            <Text style={{ fontSize: 21 }}>📍</Text>
          </TouchableOpacity>
        )}

        {!isRecording && (
          <TouchableOpacity style={[st.sendBtn, { backgroundColor: isEditingMode ? '#00c853' : (theme?.primary || '#00796b') }]} onPress={sendMsg}>
            <Text style={{ color: 'white', fontWeight: 'bold' }}>{isEditingMode ? 'حفظ' : 'إرسال'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* مودال الصور */}
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

const mkStyles = (t, insets) => StyleSheet.create({
  // تم حذف الـ bottom: 0 الثابت وتمريره ديناميكياً بالأعلى تبعاً للكيبورد
  container: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20000 },
  header: { 
    backgroundColor: '#00796b', 
    paddingHorizontal: 15, 
    paddingBottom: 12,
    paddingTop: Platform.OS === 'android' ? (insets.top > 0 ? insets.top + 12 : 35) : insets.top + 12, 
    flexDirection: 'row', 
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 16, textAlign: 'right' },
  statusTxt: { color: '#b2dfdb', fontSize: 11, marginTop: 1, fontWeight: '500', textAlign: 'right' },
  tabsContainer: { height: 48, borderBottomWidth: 1 },
  tabBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15, borderWidth: 1, marginRight: 6 },
  tabRedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e53935' }, 
  msgList: { flex: 1 },
  msgWrap: { marginBottom: 8, paddingHorizontal: 4 },
  bubble: { maxWidth: '78%', padding: 10, borderRadius: 14 },
  msgTxt: { fontSize: 14, lineHeight: 20, textAlign: 'right' },
  msgImg: { width: 200, height: 160, borderRadius: 8, marginTop: 4 },
  quickBarContainer: { height: 46, borderTopWidth: 1 },
  quickBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1, marginRight: 6 },
  quickTxt: { fontWeight: 'bold', fontSize: 11 },
  editIndicatorBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 6, borderTopWidth: 1, alignItems: 'center' },
  editIndicatorLabel: { fontSize: 11, fontStyle: 'italic' },
  cancelEditTxt: { color: '#f44336', fontSize: 12, fontWeight: 'bold' },
  
  inputArea: { 
    flexDirection: 'row-reverse',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 6, 
    borderTopWidth: 1, 
    alignItems: 'center'
  },
  iconBtn: { padding: 6, justifyContent: 'center', alignItems: 'center' },
  iconBtnRecording: { backgroundColor: 'rgba(244,67,54,0.15)', borderRadius: 20, padding: 6 },
  chatInput: { flex: 1, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 18, fontSize: 14, minHeight: 38, maxHeight: 40 },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  modalBackground: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  closeImgBtn: { position: 'absolute', top: insets.top > 0 ? insets.top + 15 : 35, right: 20, zIndex: 12, backgroundColor: 'rgba(255,255,255,0.2)', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  closeImgTxt: { color: 'white', fontSize: 30, fontWeight: '300', marginTop: -3 },
  fullImage: { width: '100%', height: '80%' }
});

