import React, { useEffect, useMemo, useState } from 'react';
import { GoogleMap, LoadScript, Marker, Polyline } from '@react-google-maps/api';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Share2, RefreshCcw, Home, UtensilsCrossed, ChevronRight, Shield, Phone } from 'lucide-react';
import { orderAPI } from '@/lib/api';

const lightMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#333333' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#e3f2fd' }] },
];

const containerStyle = {
  width: '100%',
  height: '100vh',
};

const getAddressPoint = (order) => {
  const coords = order?.address?.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    return { lat: Number(coords[1]), lng: Number(coords[0]) };
  }
  const lat = Number(order?.address?.latitude);
  const lng = Number(order?.address?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
};

const getStorePoint = (order) => {
  const rLoc = order?.restaurantId?.location || {};
  const lat = Number(rLoc.latitude);
  const lng = Number(rLoc.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  const coords = rLoc.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    return { lat: Number(coords[1]), lng: Number(coords[0]) };
  }
  return null;
};

const TrackingPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadOrder = async () => {
      try {
        setLoading(true);
        const response = await orderAPI.getOrderDetails(id);
        const nextOrder = response?.data?.data?.order || null;
        setOrder(nextOrder);
      } catch (err) {
        setError(err?.response?.data?.message || 'Failed to fetch order details');
      } finally {
        setLoading(false);
      }
    };
    loadOrder();
  }, [id]);

  const userPos = useMemo(() => getAddressPoint(order), [order]);
  const storePos = useMemo(() => getStorePoint(order), [order]);
  const center = useMemo(() => {
    if (userPos && storePos) {
      return { lat: (userPos.lat + storePos.lat) / 2, lng: (userPos.lng + storePos.lng) / 2 };
    }
    return userPos || storePos || { lat: 20.5937, lng: 78.9629 };
  }, [userPos, storePos]);

  const etaMin = order?.eta?.min || Math.max(10, Number(order?.estimatedDeliveryTime || 30) - 5);
  const etaMax = order?.eta?.max || Number(order?.estimatedDeliveryTime || 30);
  const etaText = `${etaMin}-${etaMax} mins`;
  const storeName = order?.restaurantId?.name || order?.restaurantName || 'Store';
  const restaurantPlatform = String(order?.restaurantId?.platform || order?.platform || '').toLowerCase();
  const storeLabel = String(order?.restaurantName || order?.restaurantId?.name || '').toLowerCase();
  const orderNote = String(order?.note || '').toLowerCase();
  const approvalStatus = String(order?.adminApproval?.status || '').toLowerCase();
  const orderStatus = String(order?.status || '').toLowerCase();
  const isMoGroceryOrder =
    restaurantPlatform === 'mogrocery' ||
    storeLabel.includes('mogrocery') ||
    orderNote.includes('[mogrocery]');
  const isAwaitingGroceryAdminAcceptance =
    isMoGroceryOrder &&
    (approvalStatus ? approvalStatus !== 'approved' : (orderStatus === 'pending' || orderStatus === 'confirmed'));
  const preparationText = isAwaitingGroceryAdminAcceptance
    ? 'Yet to accept by grocery admin'
    : 'Preparing your order';
  const contactName = order?.deliveryPartnerId?.name || order?.userId?.name || order?.userId?.fullName || 'Contact';
  const contactPhone = order?.deliveryPartnerId?.phone || order?.userId?.phone || 'N/A';
  const deliveryAddress = order?.address?.fullAddress || order?.address?.formattedAddress || order?.address?.address || 'Delivery location';

  if (loading) {
    return <div className="min-h-screen bg-[#141414] text-white grid place-items-center">Loading order...</div>;
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#141414] text-white grid place-items-center p-6 text-center">
        <div>
          <p className="mb-4">{error || 'Order not found'}</p>
          <button onClick={() => navigate(-1)} className="px-4 py-2 rounded bg-emerald-700">Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-900 font-sans overflow-hidden">
      <div className="absolute top-0 left-0 right-0 z-20 bg-[#23633F] p-4 rounded-b-2xl shadow-lg">
        <div className="flex items-center justify-between text-white mb-3">
          <ArrowLeft className="w-6 h-6 cursor-pointer" onClick={() => navigate(-1)} />
          <span className="font-semibold text-lg">{storeName}</span>
          <Share2 className="w-5 h-5 cursor-pointer" />
        </div>
        <div className="text-center text-white">
          <h2 className="text-2xl font-bold mb-3">{order?.status === 'confirmed' ? 'Order placed' : 'Order update'}</h2>
          <div className="flex items-center justify-center gap-2 bg-[#1a4d31] w-fit mx-auto px-4 py-2 rounded-full">
            <span className="text-sm font-medium">Estimated delivery {etaText}</span>
            <RefreshCcw className="w-4 h-4 text-green-200" />
          </div>
        </div>
      </div>

      <div className="absolute top-0 left-0 w-full h-full z-0">
        <LoadScript googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY'}>
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={center}
            zoom={13}
            options={{ styles: lightMapStyle, disableDefaultUI: true, zoomControl: false }}
          >
            {storePos && (
              <Marker
                position={storePos}
                icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png' }}
              />
            )}
            {userPos && (
              <Marker
                position={userPos}
                icon={{ url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' }}
              />
            )}
            {storePos && userPos && (
              <Polyline
                path={[storePos, userPos]}
                options={{
                  strokeColor: '#23633F',
                  strokeOpacity: 0.8,
                  strokeWeight: 3,
                }}
              />
            )}
          </GoogleMap>
        </LoadScript>

        <div className="absolute bottom-[50vh] left-4 right-4 z-10 bg-white rounded-xl p-4 shadow-lg border border-gray-200">
          <p className="text-xs text-gray-600 mb-1 uppercase">ARRIVING IN</p>
          <p className="text-3xl font-bold text-red-600 mb-1">{etaText}</p>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#23633F] rounded-full" style={{ width: '60%' }} />
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 bg-[#141414] rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.5)] max-h-[50vh] overflow-y-auto">
        <div className="p-5 space-y-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center">
                <UtensilsCrossed className="w-6 h-6 text-red-400" />
              </div>
              <p className="font-semibold text-white">{preparationText}</p>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-sm">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-gray-400" />
              <span className="flex-1 text-left font-medium text-white">Delivery partner safety</span>
              <ChevronRight className="w-5 h-5 text-gray-500" />
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-sm">
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="font-semibold text-white">{contactName}</p>
                <p className="text-sm text-gray-400">{contactPhone}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-sm">
            <div className="flex items-center gap-3">
              <Home className="w-5 h-5 text-gray-400" />
              <div className="flex-1">
                <p className="font-semibold text-white">Delivery location</p>
                <p className="text-sm text-gray-400">{deliveryAddress}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackingPage;
