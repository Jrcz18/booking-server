import fetch from "node-fetch";
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

  const { unitName, name, start, end } = req.body;

  try {
    // 1️⃣ Fetch unit calendar ID from Firestore
    const unitDoc = await db.collection("units").doc(unitName).get();
    if (!unitDoc.exists) return res.status(404).json({ error: "Unit not found" });

    const { calendarId } = unitDoc.data();

    // 2️⃣ Insert event into Google Calendar
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    const calendar = google.calendar({ version: "v3", auth });

    await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `Booking: ${name}`,
        start: { dateTime: start },
        end: { dateTime: end },
      },
    });

    // 3️⃣ Send Discord notification
    await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `New booking for ${unitName}: ${name}` }),
    });

    // 4️⃣ (Optional) Save booking in Firestore
    await db.collection("bookings").add({ unitName, name, start, end });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
