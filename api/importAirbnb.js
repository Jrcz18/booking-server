import ical from 'node-ical';
import { google } from 'googleapis';
import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
  });
}
const db = admin.firestore();

// Initialize Google Calendar API
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
  scopes: ["https://www.googleapis.com/auth/calendar"]
});
const calendar = google.calendar({ version: 'v3', auth });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const unitsSnapshot = await db.collection('units').get();

    for (const unitDoc of unitsSnapshot.docs) {
      const unit = unitDoc.data();
      if (!unit.airbnbIcalUrl) continue; // Skip units without iCal

      const events = await ical.async.fromURL(unit.airbnbIcalUrl);

      for (const k in events) {
        const ev = events[k];
        if (ev.type === 'VEVENT') {
          const startISO = ev.start.toISOString();
          const endISO = ev.end.toISOString();

          // Insert into master Google Calendar
          await calendar.events.insert({
            calendarId: process.env.MASTER_CALENDAR_ID,
            requestBody: {
              summary: `[${unit.name}] Airbnb Booking`,
              description: ev.summary || '',
              start: { dateTime: startISO },
              end: { dateTime: endISO },
            }
          });

          // Insert into Firestore if not exists
          const existing = await db.collection('bookings')
            .where('unitName', '==', unit.name)
            .where('start', '==', startISO)
            .where('end', '==', endISO)
            .get();

          if (existing.empty) {
            await db.collection('bookings').add({
              unitName: unit.name,
              start: startISO,
              end: endISO,
              source: 'airbnb',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Airbnb bookings imported dynamically' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
