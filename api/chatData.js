// /api/chatData.js
import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
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

      default:
        result = { error: 'Unknown queryType' };
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
