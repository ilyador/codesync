import { useState, useEffect } from 'react';
import { getMe, getToken, clearSession } from '../lib/api';

interface Profile {
  id: string;
  name: string;
  email: string;
  initials: string;
}

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }

    getMe()
      .then(data => {
        setProfile(data.profile);
        setLoggedIn(true);
      })
      .catch(() => {
        clearSession();
        setLoggedIn(false);
      })
      .finally(() => setLoading(false));
  }, [loggedIn]);

  function onAuthSuccess() {
    setLoggedIn(true);
    setLoading(true);
  }

  function onSignOut() {
    clearSession();
    setProfile(null);
    setLoggedIn(false);
  }

  return { profile, loading, loggedIn, onAuthSuccess, onSignOut };
}
