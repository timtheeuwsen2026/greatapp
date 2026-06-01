import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';

const STORAGE_KEY = 'promoter_ref_id';
const PROMOTER_ID_KEY = 'promoter_id';

interface PromoterAttribution {
  promoterId: string | null;
  referralCode: string | null;
}

export function usePromoterAttribution() {
  const [location] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const hasPersistedRef = useRef(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    
    if (refCode) {
      storeAttribution(refCode);
    }
  }, [location]);

  useEffect(() => {
    if (isAuthenticated && user && !hasPersistedRef.current) {
      persistReferrerToUser();
      hasPersistedRef.current = true;
    }
  }, [isAuthenticated, user]);

  return {
    getAttribution,
    clearAttribution,
    storeAttribution,
  };
}

export async function storeAttribution(refCode: string): Promise<void> {
  try {
    sessionStorage.setItem(STORAGE_KEY, refCode);
    localStorage.setItem(STORAGE_KEY, refCode);
    
    sessionStorage.removeItem(PROMOTER_ID_KEY);
    localStorage.removeItem(PROMOTER_ID_KEY);
    
    const response = await fetch('/api/promoter-attribution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralCode: refCode }),
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.promoterId) {
        sessionStorage.setItem(PROMOTER_ID_KEY, data.promoterId);
        localStorage.setItem(PROMOTER_ID_KEY, data.promoterId);
      }
    }
  } catch (e) {
    console.error('Failed to store promoter attribution:', e);
  }
}

export function getAttribution(): PromoterAttribution {
  try {
    const sessionRef = sessionStorage.getItem(STORAGE_KEY);
    const localRef = localStorage.getItem(STORAGE_KEY);
    const referralCode = sessionRef || localRef || null;
    
    const sessionPromoterId = sessionStorage.getItem(PROMOTER_ID_KEY);
    const localPromoterId = localStorage.getItem(PROMOTER_ID_KEY);
    const promoterId = sessionPromoterId || localPromoterId || null;
    
    return {
      promoterId,
      referralCode,
    };
  } catch (e) {
    console.error('Failed to get promoter attribution:', e);
    return { promoterId: null, referralCode: null };
  }
}

export function clearAttribution(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(PROMOTER_ID_KEY);
    localStorage.removeItem(PROMOTER_ID_KEY);
  } catch (e) {
    console.error('Failed to clear promoter attribution:', e);
  }
}

export async function persistReferrerToUser(): Promise<void> {
  try {
    const { promoterId, referralCode } = getAttribution();
    
    if (!promoterId && !referralCode) {
      return;
    }
    
    const response = await fetch('/api/auth/set-referrer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promoterId, referralCode }),
      credentials: 'include'
    });
    
    if (response.ok) {
      console.log('Promoter referrer persisted to user record');
    }
  } catch (e) {
    console.error('Failed to persist referrer to user:', e);
  }
}

export async function resolvePromoterFromCode(referralCode: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/promoters/by-code/${encodeURIComponent(referralCode)}`);
    if (response.ok) {
      const data = await response.json();
      return data.promoterId || null;
    }
    return null;
  } catch (e) {
    console.error('Failed to resolve promoter from code:', e);
    return null;
  }
}
