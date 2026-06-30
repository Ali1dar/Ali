import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, Alert, BackHandler, ImageBackground
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/utils/ThemeContext';
import { firebaseAuth, db } from './src/utils/firebase';

import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';
import messaging from '@react-native-firebase/messaging';

import {
  registerForPushNotifications,
  setupNotificationListeners,
} from './notifications';

import AuthScreen from './src/screens/AuthScreen';
import PatientScreen from './src/screens/PatientScreen';
import PharmacyScreen from './src/screens/PharmacyScreen';
import ChatScreen from './src/screens/ChatScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import NearbyScreen from './src/screens/NearbyScreen';
import InboxScreen from './src/screens/InboxScreen';
import SubscriptionOverlay from './src/components/SubscriptionOverlay';
import Toast from './src/components/Toast';

// ✅ دالة طلب جميع الأذونات دفعة واحدة عند فتح التطبيق
async function requestAllPermissions() {
  try {
    await ImagePicker.requestCameraPermissionsAsync();
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await Audio.requestPermissionsAsync();
    await Location.requestForegroundPermissionsAsync();
    await messaging().requestPermission(); // إذن الإشعارات عبر Firebase
  } catch (e) {
    console.log('خطأ بطلب الأذونات:', e);
  }
}

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
  const [patientInboxOpen, setPatientInboxOpen] = useState(false);
  const [subBlock, setSubBlock] = useState({ show: false, msg: '' });
  const [province, setProvince] = useState('بغداد');
  const [globalUnread, setGlobalUnread] = useState(false);

  const stateRef = useRef({ chatOpen, settingsOpen, nearbyOpen, inboxOpen, user });
  useEffect(() => {
    stateRef.current = { chatOpen, settingsOpen, nearbyOpen, inboxOpen, user };
  }, [chatOpen, settingsOpen, nearbyOpen, inboxOpen, user]);

  // ✅ طلب جميع الأذونات فور فتح التطبيق
  useEffect(() => {
    requestAllPermissions();
  }, []);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type, visible: true });
    setTimeout(() => setToast(p => ({ ...p, visible: false })), 3200);
  };

  useEffect(() => {
    if (!user) return;
    try {
      registerForPushNotifications(user.uid);
      const unsubscribe = setupNotificationListeners();
      return () => unsubscribe && unsubscribe();
    } catch (e) {
      console.log("Notification init error:", e);
    }
  }, [user]);

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

  useEffect(() => {
    if (!user) return;
    const FORTY_EIGHT_HOURS = 172800000;
    const expirationLimit = Date.now() - FORTY_EIGHT_HOURS;
    const requestsRef = db.ref('requests');
    requestsRef.once('value').then(snapshot => {
      if (snapshot.exists()) {
        snapshot.forEach(provinceSnapshot => {
          const provKey = provinceSnapshot.key;
          provinceSnapshot.forEach(requestSnapshot => {
            const reqData = requestSnapshot.val();
            const reqId = requestSnapshot.key;
            if (reqData) {
              const hasExpired = reqData.createdAt && reqData.createdAt < expirationLimit;
              const isLegacyWithoutDate = !reqData.createdAt;
              if (hasExpired || isLegacyWithoutDate) {
                db.ref(`requests/${provKey}/${reqId}`).remove();
                db.ref(`chats/${reqId}`).remove();
              }
            }
          });
        });
      }
    }).catch(err => console.log("خطأ أثناء التنظيف:", err));
  }, [user]);

  useEffect(() => {
    const unsubscribe = firebaseAuth.onAuthStateChanged(u => {
      if (u) {
        setUser(u);
      } else {
        setUser(null);
        setUserData(null);
        setSubBlock({ show: false, msg: '' });
        setReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const userRef = db.ref(`users/${user.uid}`);
    const handleData = (snap) => {
      try {
        const d = snap.val();
        if (d) {
          setUserData(d);
          const prov = d.province || 'بغداد';
          setProvince(prov);
          if (d.role === 'pharmacy') {
            checkSub(d.subscriptionExpiry);
          } else {
            setSubBlock({ show: false, msg: '' });
          }
          db.ref(`users/${user.uid}/presence`).update({ online: true, lastSeen: 'online' }).catch(e => console.log(e));
        }
      } catch (error) {
        console.error("خطأ في معالجة بيانات المستخدم:", error);
      } finally {
        setReady(true);
      }
    };
    userRef.on('value', handleData);
    return () => userRef.off('value', handleData);
  }, [user]);

  useEffect(() => {
    if (!user || userData?.role !== 'pharmacy') return;
    const uid = user.uid;
    const ref = db.ref('chats');
    const listener = ref.on('value', snap => {
      let has = false;
      if (snap.exists()) {
        snap.forEach(c => {
          if (c.key.includes(uid) && (c.val()[uid]?.unreadPharmacy || 0) > 0) has = true;
        });
      }
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
    setChatId(id);
    setChatName(name);
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
      <ImageBackground
        source={require('./assets/splash.png')}
        style={{ flex: 1, width: '100%', height: '100%' }}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,37,26,0.2)', 'rgba(0,105,92,0.6)']}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={s.loadingCard}>
            <View style={s.loadingBarBg}>
              <View style={s.loadingBarFill} />
            </View>
            <Text style={s.loadingEn}>جاري التحميل...</Text>
          </View>
        </LinearGradient>
      </ImageBackground>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: theme.bg }]}>
      <ExpoStatusBar style="light" backgroundColor="#00796b" />

      {!user ? (
        <AuthScreen onToast={showToast} />
      ) : (
        <View style={{ flex: 1 }}>
          <LinearGradient colors={['#00796b', '#004d40']} style={s.header}>
            <Text style={s.headerTitle}>دليلك الدوائي 💊</Text>
            <View style={s.headerBtns}>
              <TouchableOpacity style={s.hBtn} onPress={toggle}>
                <Text style={s.hBtnTxt}>{isDark ? '☀️' : '🌙'}</Text>
              </TouchableOpacity>
              {userData?.role === 'pharmacy' && (
                <TouchableOpacity
                  style={[s.hBtn, { backgroundColor: '#0288d1' }]}
                  onPress={() => setInboxOpen(true)}
                >
                  <Text style={s.hBtnTxt}>💬 {globalUnread ? '🔴' : ''}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.hBtn, { backgroundColor: '#ff9800' }]}
                onPress={() => setSettingsOpen(true)}
              >
                <Text style={s.hBtnTxt}>⚙️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.hBtn, { backgroundColor: '#e53935' }]}
                onPress={logout}
              >
                <Text style={s.hBtnTxt}>خروج</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {userData?.role !== 'pharmacy' ? (
            <PatientScreen
              onOpenChat={openChat}
              onOpenNearby={() => setNearbyOpen(true)}
              onOpenInbox={() => setPatientInboxOpen(true)}
              onToast={showToast}
              province={province}
              onProvinceChange={changeProvince}
              userId={user?.uid || ''}
            />
          ) : (
            <PharmacyScreen
              onOpenChat={openChat}
              onToast={showToast}
              province={province}
              pharmacyName={userData?.pharmacyName || 'الصيدلية'}
              userId={user?.uid || ''}
            />
          )}

          {chatOpen && (
            <ChatScreen
              visible={chatOpen} onClose={() => setChatOpen(false)}
              chatId={chatId} pharmacyId={chatPid}
              role={userData?.role || 'patient'} requestName={chatName}
              localRequests={[]} onToast={showToast}
            />
          )}

          <SettingsScreen
            visible={settingsOpen} onClose={() => setSettingsOpen(false)}
            onToast={showToast} role={userData?.role} userData={userData}
          />
          <NearbyScreen
            visible={nearbyOpen} onClose={() => setNearbyOpen(false)}
            province={province} onDirectChat={openDirectChat}
          />
          <InboxScreen
            visible={inboxOpen}
            onClose={() => setInboxOpen(false)}
            role="pharmacy"
            onOpenChat={(cid) => {
              setInboxOpen(false);
              setChatId(cid);
              setChatName('محادثة واردة');
              setChatPid(user?.uid);
              setChatOpen(true);
            }}
          />
          <InboxScreen
            visible={patientInboxOpen}
            onClose={() => setPatientInboxOpen(false)}
            role="patient"
            onOpenChat={(cid) => {
              setPatientInboxOpen(false);
              setChatId(cid);
              setChatName('محادثة مع الصيدلية');
              setChatPid(cid.split('_')[2] || null);
              setChatOpen(true);
            }}
          />
          <SubscriptionOverlay visible={subBlock.show} message={subBlock.msg} />
        </View>
      )}

      <Toast message={toast.msg} visible={toast.visible} type={toast.type} />
    </View>
  );
}

// ✅ SafeAreaProvider مضاف لحل مشكلة الكراش عند فتح الدردشة
export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  loadingCard: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 40,
  },
  loadingBarBg: {
    width: 200, height: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  loadingBarFill: {
    width: '65%', height: '100%',
    backgroundColor: '#00bfa5',
    borderRadius: 3,
  },
  loadingEn: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    letterSpacing: 1,
    fontWeight: '600',
  },
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

