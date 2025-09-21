// /api/chatData.js
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export async function POST(req) {
  try {
    const { queryType, params } = await req.json();

    let result;

    switch (queryType) {
      case 'getBookings':
        result = await db.collection('bookings')
          .where('unitId', '==', params.unitId)
          .get()
          .then(snapshot => snapshot.docs.map(doc => doc.data()));
        break;

      case 'getRevenue':
        result = await db.collection('bookings')
          .where('status', '==', 'confirmed')
          .get()
          .then(snapshot => snapshot.docs.map(doc => doc.data()));
        break;

      // Add more query handlers here
      default:
        result = { error: 'Unknown queryType' };
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
