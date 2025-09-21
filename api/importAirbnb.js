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
      if (!unit.airbnbIcalUrl) continue;

      const events = await ical.async.fromURL(unit.airbnbIcalUrl);

      // Fetch existing bookings from Firestore for this unit
      const bookingsSnapshot = await db.collection('bookings')
        .where('unitName', '==', unit.name)
        .where('source', '==', 'airbnb')
        .get();

      const existingBookings = {};
      bookingsSnapshot.forEach(doc => {
        const data = doc.data();
        existingBookings[`${data.start}_${data.end}`] = { id: doc.id, calendarEventId: data.calendarEventId || null };
      });

      for (const k in events) {
        const ev = events[k];
        if (ev.type === 'VEVENT') {
          const startISO = ev.start.toISOString();
          const endISO = ev.end.toISOString();
          const key = `${startISO}_${endISO}`;

          // Check if this booking already exists in Firestore
          if (existingBookings[key]) {
            // Optionally update Google Calendar event if description changed
            if (existingBookings[key].calendarEventId) {
              await calendar.events.update({
                calendarId: process.env.MASTER_CALENDAR_ID,
                eventId: existingBookings[key].calendarEventId,
                requestBody: {
                  summary: `[${unit.name}] Airbnb Booking`,
                  description: ev.summary || '',
                  start: { dateTime: startISO },
                  end: { dateTime: endISO },
                }
              });
            }
            delete existingBookings[key]; // Remove from existing map, anything left will be deleted
            continue;
          }

          // Insert new event into Google Calendar
          const gCalEvent = await calendar.events.insert({
            calendarId: process.env.MASTER_CALENDAR_ID,
            requestBody: {
              summary: `[${unit.name}] Airbnb Booking`,
              description: ev.summary || '',
              start: { dateTime: startISO },
              end: { dateTime: endISO },
            }
          });

          // Insert into Firestore
          await db.collection('bookings').add({
            unitName: unit.name,
            start: startISO,
            end: endISO,
            source: 'airbnb',
            calendarEventId: gCalEvent.data.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // Any bookings left in existingBookings are no longer in Airbnb iCal → delete them
      for (const leftoverKey in existingBookings) {
        const booking = existingBookings[leftoverKey];
        if (booking.calendarEventId) {
          try {
            await calendar.events.delete({
              calendarId: process.env.MASTER_CALENDAR_ID,
              eventId: booking.calendarEventId
            });
          } catch (err) {
            console.warn(`Failed to delete Google Calendar event ${booking.calendarEventId}:`, err.message);
          }
        }
        // Delete from Firestore
        await db.collection('bookings').doc(booking.id).delete();
      }
    }

    return res.status(200).json({ success: true, message: 'Airbnb bookings synced successfully for all units' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
