const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

exports.sendChatNotification = functions.database
  .ref("/chats/{chatId}/{pharmacyId}/messages/{messageId}")
  .onCreate(async (snapshot, context) => {
    const message = snapshot.val();
    if (!message) return null;
    const { chatId, pharmacyId } = context.params;
    try {
      let receiverId = null;
      if (message.role === "pharmacy") {
        if (chatId.startsWith("p_")) {
          receiverId = chatId.split("_")[1];
        } else {
          const reqSnap = await admin.database().ref("/requests").once("value");
          reqSnap.forEach(p => {
            p.forEach(req => {
              if (req.key === chatId) receiverId = req.val().patientId;
            });
          });
        }
      } else {
        receiverId = pharmacyId;
      }
      if (!receiverId) return null;
      const userSnap = await admin.database().ref("/users/" + receiverId).once("value");
      const userData = userSnap.val();
      if (!userData || !userData.fcm_token) return null;
      const title = message.role === "pharmacy" ? "رسالة من الصيدلية" : "رسالة من مريض";
      const body = message.text || (message.image ? "صورة" : "") || (message.audio ? "رسالة صوتية" : "") || "رسالة جديدة";
      await admin.messaging().send({
        token: userData.fcm_token,
        notification: { title: title, body: body },
        android: { priority: "high", notification: { sound: "default", channel_id: "default" } },
        data: { chatId: chatId, role: message.role || "" },
      });
    } catch (e) {
      console.error("خطأ:", e.message);
    }
    return null;
  });

exports.sendStatusNotification = functions.database
  .ref("/requests/{province}/{requestId}/status")
  .onUpdate(async (change, context) => {
    const newStatus = change.after.val();
    const { province, requestId } = context.params;
    try {
      const reqSnap = await admin.database().ref("/requests/" + province + "/" + requestId).once("value");
      const req = reqSnap.val();
      if (!req || !req.patientId) return null;
      const userSnap = await admin.database().ref("/users/" + req.patientId).once("value");
      const userData = userSnap.val();
      if (!userData || !userData.fcm_token) return null;
      const statusText = newStatus === "available" ? "متوفر" : "غير متوفر";
      await admin.messaging().send({
        token: userData.fcm_token,
        notification: { title: "تحديث دواء", body: "طلبك (" + req.name + "): " + statusText },
        android: { priority: "high", notification: { sound: "default", channel_id: "default" } },
        data: { requestId: requestId },
      });
    } catch (e) {
      console.error("خطأ:", e.message);
    }
    return null;
  });
