import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, Alert, BackHandler
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from './src/utils/ThemeContext';
import { firebaseAuth, db } from './src/utils/firebase';

import {
  registerForPushNotifications,
  setupNotificationListeners,
  sendPushNotification
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
  const [patientInboxOpen, setPatientInboxOpen] = useState(false); // ✅ التغيير 1
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

  useEffect(() => {
    if (!user) return;
    registerForPushNotifications(user.uid);
    const unsubscribe = setupNotificationListeners();
    return () => unsubscribe();
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

  // 🕒 آلية الحذف التلقائي الذكي للطلبات والمحادثات المرتبطة بها
  useEffect(() => {
    if (!user) return;

    // 48 ساعة بالملي ثانية = 172800000
    const FORTY_EIGHT_HOURS = 172800000;
    const expirationLimit = Date.now() - FORTY_EIGHT_HOURS;

    // جلب مسار الطلبات بالكامل لفحصه وتنظيفه
    const requestsRef = db.ref('requests');
    
    requestsRef.once('value').then(snapshot => {
      if (snapshot.exists()) {
        snapshot.forEach(provinceSnapshot => {
          const provKey = provinceSnapshot.key;
          
          provinceSnapshot.forEach(requestSnapshot => {
            const reqData = requestSnapshot.val();
            const reqId = requestSnapshot.key;
            
            if (reqData) {
              // 1. فحص ما إذا كان الطلب منتهياً (مر عليه 48 ساعة)
              const hasExpired = reqData.createdAt && reqData.createdAt < expirationLimit;
              
              // 2. فحص ما إذا كان الطلب قديماً جداً ولا يحتوي على حقل الوقت أصلاً لضمان مسحه
              const isLegacyWithoutDate = !reqData.createdAt;

              // إذا تحقق أي من الشرطين يتم تفعيل الحذف النهائي للطلب والمحادثة
              if (hasExpired || isLegacyWithoutDate) {
                // حذف الطلب نهائياً من المحافظة الخاصة به
                db.ref(`requests/${provKey}/${reqId}`).remove();
                
                // حذف المحادثة التابعة للطلب مباشرة
                db.ref(`chats/${reqId}`).remove();
                
                console.log(`[تنظيف تلقائي] تم حذف الطلب والمحادثة للمعرف: ${reqId}`);
              }
            }
          });
        });
      }
    }).catch(err => console.log("خطأ أثناء التنظيف التلقائي للطلبات:", err));

  }, [user]);

  useEffect(() => {
    return firebaseAuth.onAuthStateChanged(u => {
      if (u) {
        setUser(u);
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
        setUser(null);
        setUserData(null);
        setSubBlock({ show: false, msg: '' });
        setReady(true);
      }
    });
  }, []);

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
      <LinearGradient
        colors={['#00251a', '#00695c']}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={s.loadingCard}>
          <View style={s.loadingIconCircle}>
            <Text style={{ fontSize: 40 }}>💊</Text>
          </View>
          <Text style={s.loadingTitle}>دليلك الدوائي</Text>
          <Text style={s.loadingEn}>YOUR DRUG GUIDE</Text>
          <View style={s.loadingBarBg}>
            <View style={s.loadingBarFill} />
          </View>
        </View>
      </LinearGradient>
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
              onOpenInbox={() => setPatientInboxOpen(true)} // ✅ التغيير 3
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
      {/* ✅ InboxScreen الصيدلية */}
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
      {/* ✅ InboxScreen المريض */}
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
  loadingCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 40,
    paddingHorizontal: 50,
    alignItems: 'center',
    gap: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
  },
  loadingIconCircle: {
    width: 80, height: 80,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  loadingTitle: {
    fontSize: 30, fontWeight: '800',
    color: 'white', letterSpacing: 1,
  },
  loadingEn: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12, letterSpacing: 3,
  },
  loadingBarBg: {
    width: 200, height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2, marginTop: 8,
    overflow: 'hidden',
  },
  loadingBarFill: {
    width: '60%', height: '100%',
    backgroundColor: '#00bfa5',
    borderRadius: 2,
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
