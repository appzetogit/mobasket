import { initializeFirebaseRealtime, getFirebaseRealtimeDb, isFirebaseRealtimeEnabled } from '../shared/services/firebaseRealtimeService.js';

const run = async () => {
  const init = await initializeFirebaseRealtime({ allowDbLookup: false });
  if (!init.initialized || !isFirebaseRealtimeEnabled()) {
    console.log('Firebase realtime not enabled', init);
    process.exit(0);
  }

  const db = getFirebaseRealtimeDb();
  const [activeSnap, deliverySnap, routeSnap] = await Promise.all([
    db.ref('active_orders').once('value'),
    db.ref('delivery_boys').once('value'),
    db.ref('route_cache').once('value')
  ]);

  const active = activeSnap.val() || {};
  const delivery = deliverySnap.val() || {};
  const route = routeSnap.val() || {};

  const activeKeys = Object.keys(active);
  const deliveryKeys = Object.keys(delivery);
  const routeKeys = Object.keys(route);

  console.log('active_orders count:', activeKeys.length);
  console.log('delivery_boys count:', deliveryKeys.length);
  console.log('route_cache count:', routeKeys.length);

  if (activeKeys[0]) {
    console.log('sample active_orders key:', activeKeys[0]);
    console.log('sample active_orders fields:', Object.keys(active[activeKeys[0]] || {}));
  }
  if (deliveryKeys[0]) {
    console.log('sample delivery_boys key:', deliveryKeys[0]);
    console.log('sample delivery_boys fields:', Object.keys(delivery[deliveryKeys[0]] || {}));
  }
  if (routeKeys[0]) {
    console.log('sample route_cache key:', routeKeys[0]);
    console.log('sample route_cache fields:', Object.keys(route[routeKeys[0]] || {}));
  }
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
