import { google } from "googleapis";
import admin from "firebase-admin";

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    ),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { unitName } = req.body;

  try {
    // 1️⃣ Create Google Calendar
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });

    const newCalendar = await calendar.calendars.insert({
      requestBody: {
        summary: `Unit: ${unitName}`,
        timeZone: "Asia/Manila",
      },
    });

    const calendarId = newCalendar.data.id;

    // 2️⃣ Save unit in Firestore
    const unitRef = db.collection("units").doc(unitName);
    await unitRef.set({ name: unitName, calendarId });

    res.status(200).json({ success: true, calendarId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
