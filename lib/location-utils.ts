import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from './supabase';
import type { Profile } from './types';

/** Calculate distance in meters between two lat/lon coordinates using the Haversine formula */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/** Format distance in meters to readable text (e.g. '350 m away' or '2.4 km away') */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m away`;
  }
  return `${(meters / 1000).toFixed(1)} km away`;
}

/** Check if location permissions are currently granted without prompting */
export async function checkLocationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator.permissions) {
      const res = await navigator.permissions.query({ name: 'geolocation' });
      return res.state === 'granted';
    }
    if (Platform.OS !== 'web') {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    }
  } catch {
    // fallback
  }
  return false;
}

/** Request location permissions and fetch current device coordinates */

export async function getCurrentUserLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && navigator.geolocation) {
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          },
          () => resolve(null),
          { timeout: 10000, enableHighAccuracy: true }
        );
      });
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    };
  } catch (error) {
    console.log('Location fetch error:', error);
    return null;
  }
}

/** Save current user's location to Supabase database */
export async function updateUserLocationInDB(
  userId: string,
  latitude: number,
  longitude: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        latitude,
        longitude,
        location_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    return !error;
  } catch {
    return false;
  }
}

/** Find all family members within a given distance threshold (default 500 meters) */
export function getNearbyFamilyMembers(
  currentUserId: string,
  currentLat: number,
  currentLon: number,
  members: Profile[],
  maxDistanceMeters: number = 1000
): { member: Profile; distanceMeters: number }[] {
  const nearby: { member: Profile; distanceMeters: number }[] = [];

  for (const m of members) {
    if (m.id === currentUserId) continue;
    if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
      const dist = calculateDistance(currentLat, currentLon, m.latitude, m.longitude);
      if (dist <= maxDistanceMeters) {
        nearby.push({ member: m, distanceMeters: dist });
      }
    }
  }

  return nearby.sort((a, b) => a.distanceMeters - b.distanceMeters);
}
