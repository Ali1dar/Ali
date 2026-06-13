// App.js - إشعارات عبر Firebase فقط (بدون expo-notifications)
import { registerForPushNotifications, setupNotificationListeners } from './notifications';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar, Alert, BackHandler, PermissionsAndroid } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/utils/ThemeContext';
import { firebaseAuth, db } from './src/utils/firebase';
import messaging from '@react-native-firebase/messaging';

import AuthScreen from './src/screens/AuthScreen';
import PatientScreen from './src/screens/PatientScreen';
import PharmacyScreen from './src/screens/PharmacyScreen';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import NearbyScreen from './src/screens/NearbyScreen';
import InboxScreen from './src/screens/InboxScreen';
import SubscriptionOverlay from './src/components/SubscriptionOverlay';
import Toast from './src/components/Toast';

// معالج إشعارات الخلفية عبر Firebase مباشرة
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('إشعار في الخلفية:', remoteMessage);
});

function AppContent() {
  const { theme, isDark, toggle } = useTheme();
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [ready, setReady] = useState(false);

  const [toast, setToast] = useState({ msg: '', type: 'info', visible: false });
  const [chatOpen, setChatOpen] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [chatPid, setChatPid] = useState(null);
  const [chatName, setChatName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [subBlock, setSubBlock] = useState({ show: false, msg: '' });
  const [province, setProvince] = useState('بغداد');
  const [globalUnread, setGlobalUnread] = useState(false);

  const stateRef = useRef({ chatOpen, settingsOpen, nearbyOpen, inboxOpen, user });
  useEffect(() => {
    stateRef.current = { chatOpen, settingsOpen, nearbyOpen, inboxOpen, user };
  }, [chatOpen, settingsOpen, nearbyOpen, inboxOpen, user]);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast(p => ({ ...p, visible: false })), 3200);
  };

  // طلب صلاحية الإشعارات وحفظ FCM Token
  const setupCloudMessaging = async (userId) => {
    try {
      // طلب إذن أندرويد 13+
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
      }

      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        const token = await messaging().getToken();
        if (token) {
          await db.ref(`users/${userId}/fcmToken`).set(token);
        }
      }
    } catch (error) {
      console.log('خطأ في الإشعارات:', error);
    }
  };

  // استقبال الإشعارات والتطبيق مفتوح عبر Firebase
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      showToast(`✉️ ${remoteMessage.notification?.body || 'رسالة جديدة'}`);
    });
    return unsubscribe;
  }, []);

  // زر الرجوع
  useEffect(() => {
    const handleBackPress = () => {
      const { chatOpen, settingsOpen, nearbyOpen, inboxOpen, user } = stateRef.current;
      if (!user) return false;
      if (chatOpen) { setChatOpen(false); return true; }
      if (settingsOpen) { setSettingsOpen(false); return true; }
      if (nearbyOpen) { setNearbyOpen(false); return true; }
      if (inboxOpen) { setInboxOpen(false); return true; }
      Alert.alert(
        'تأكيد الخروج',
        'هل تريد الخروج من التطبيق؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'خروج', onPress: () => BackHandler.exitApp() }
        ],
        { cancelable: true }
      );
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => backHandler.remove();
  }, []);

  // Auth listener
  useEffect(() => {
    return firebaseAuth.onAuthStateChanged(u => {
      if (u) {
        setUser(u);
        setupCloudMessaging(u.uid);
        db.ref(`users/${u.uid}`).on('value', snap => {
          const d = snap.val();
          setUserData(d);
          const prov = d?.province || 'بغداد';
          setProvince(prov);
          if (d?.role === 'pharmacy') checkSub(d.subscriptionExpiry);
          else setSubBlock({ show: false, msg: '' });
          setReady(true);
          db.ref(`users/${u.uid}/presence`).update({ online: true, lastSeen: 'online' });
        });
      } else {
        setUser(null); setUserData(null);
        setSubBlock({ show: false, msg: '' });
        setReady(true);
      }
    });
  }, []);

  // Pharmacy inbox unread
  useEffect(() => {
    if (!user || userData?.role !== 'pharmacy') return;
    const uid = user.uid;
    const ref = db.ref('chats');
    const listener = ref.on('value', snap => {
      let has = false;
      if (snap.exists()) snap.forEach(c => { if (c.key.includes(uid) && (c.val()[uid]?.unreadPharmacy || 0) > 0) has = true; });
      setGlobalUnread(has);
    });
    return () => ref.off('value', listener);
  }, [user, userData?.role]);

  const checkSub = (exp) => {
    if (!exp && exp !== 0) { setSubBlock({ show: true, msg: 'لم يتم العثور على صلاحية اشتراك.' }); return; }
    const n = Number(exp);
    if (n === -1) { setSubBlock({ show: false, msg: '' }); return; }
    if ((n - Date.now()) <= 0) setSubBlock({ show: true, msg: 'لقد انتهت فترة صلاحية الاشتراك.' });
    else setSubBlock({ show: false, msg: '' });
  };

  const openChat = (id, name, pid = null) => {
    setChatId(id); setChatName(name);
    setChatPid(pid || (userData?.role === 'pharmacy' ? user?.uid : null));
    setChatOpen(true);
  };

  const openDirectChat = (pharmacyId, pharmName) => {
    setChatId(`p_${user.uid}_${pharmacyId}`);
    setChatName('محادثة: ' + pharmName);
    setChatPid(pharmacyId);
    setChatOpen(true);
  };

  const changeProvince = async (p) => {
    setProvince(p);
    if (user) {
      await db.ref(`users/${user.uid}`).update({ province: p });
      showToast(`تم التغيير إلى: ${p} 📍`);
    }
  };

  const logout = async () => {
    if (user) await db.ref(`users/${user.uid}/presence`).update({ online: false });
    await firebaseAuth.signOut();
    showToast('تم تسجيل الخروج');
  };

  if (!ready) {
    return (
      <View style={[s.loading, { backgroundColor: '#00796b' }]}>
        <Text style={s.loadingTxt}>دليلك الدوائي...</Text>
        <Text style={{ color: '#b2dfdb', fontSize: 13, marginTop: 6 }}>💊</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      <ExpoStatusBar style="light" backgroundColor="#00796b" />

      {!user ? (
        <AuthScreen onToast={showToast} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Header */}
          <LinearGradient colors={['#00796b', '#004d40']} style={s.header}>
            <Text style={s.headerTitle}>دليلك الدوائي 💊</Text>
            <View style={s.headerBtns}>
              <TouchableOpacity style={s.hBtn} onPress={toggle}>
                <Text style={s.hBtnTxt}>{isDark ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
              {userData?.role === 'pharmacy' && (
                <TouchableOpacity style={[s.hBtn, { backgroundColor: '#0288d1' }]} onPress={() => setInboxOpen(true)}>
                  <Text style={s.hBtnTxt}>💬 {globalUnread ? '🔴' : ''}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.hBtn, { backgroundColor: '#ff9800' }]} onPress={() => setSettingsOpen(true)}>
                <Text style={s.hBtnTxt}>⚙️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.hBtn, { backgroundColor: '#e53935' }]} onPress={logout}>
                <Text style={s.hBtnTxt}>خروج</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Views */}
          {userData?.role !== 'pharmacy' ? (
            <PatientScreen
              onOpenChat={openChat}
              onOpenNearby={() => setNearbyOpen(true)}
              onToast={showToast}
              province={province}
              onProvinceChange={changeProvince}
            />
          ) : (
            <PharmacyScreen
              onOpenChat={openChat}
              onToast={showToast}
              province={province}
              pharmacyName={userData?.pharmacyName || 'الصيدلية'}
              userId={user.uid}
            />
          )}
        </View>
      )}

      {/* Overlays */}
      <ChatScreen
        visible={chatOpen} onClose={() => setChatOpen(false)}
        chatId={chatId} pharmacyId={chatPid}
        role={userData?.role || 'patient'} requestName={chatName}
        localRequests={[]} onToast={showToast}
      />
      <SettingsScreen
        visible={settingsOpen} onClose={() => setSettingsOpen(false)}
        onToast={showToast} role={userData?.role} userData={userData}
      />
      <NearbyScreen
        visible={nearbyOpen} onClose={() => setNearbyOpen(false)}
        province={province} onDirectChat={openDirectChat}
      />
      <InboxScreen
        visible={inboxOpen} onClose={() => setInboxOpen(false)}
        onOpenChat={(cid) => { setInboxOpen(false); setChatId(cid); setChatName('محادثة واردة'); setChatPid(user?.uid); setChatOpen(true); }}
      />
      <SubscriptionOverlay visible={subBlock.show} message={subBlock.msg} />
      <Toast message={toast.msg} visible={toast.visible} type={toast.type} />
    </View>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingTxt: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 15,
    paddingTop: Platform.OS === 'android' ? 52 : 64,
  },
  headerTitle: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  hBtn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center', elevation: 2,
  },
  hBtnTxt: { color: 'white', fontSize: 14, fontWeight: 'bold' },
});
