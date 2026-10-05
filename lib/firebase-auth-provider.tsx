'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from './firebase';
import { getUserProfile, seedCatalogsIfEmpty, asegurarCatalogosAprobacion } from './firestore-service';
import { PerfilUsuario } from './database.types';

interface AuthContextType {
  user: User | null;
  profile: PerfilUsuario | null;
  /** true cuando ya se consultó el perfil del usuario (exista o no): evita pedir datos antes de saberlo. */
  profileLoaded: boolean;
  loading: boolean;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  profileLoaded: false,
  loading: true,
  logout: async () => {},
  refreshProfile: async () => {},
});

export function FirebaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PerfilUsuario | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (currentUser: User) => {
    try {
      const prof = await getUserProfile(currentUser.uid);
      setProfile(prof);
      setProfileLoaded(true);
    } catch (err) {
      console.error('Error cargando perfil:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        await fetchProfile(currentUser);
        seedCatalogsIfEmpty();
        // KAN-18: `seedCatalogsIfEmpty()` es todo o nada, así que un entorno
        // sembrado antes de este ticket no recibe 'Pendiente de aprobación' ni
        // 'Generado con IA'. Sin el estado pendiente, la regla de creación
        // denegaría todo alta y el usuario vería un error de permisos sin causa.
        asegurarCatalogosAprobacion();
      } else {
        setProfile(null);
        setProfileLoaded(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await fbSignOut(auth);
    setUser(null);
    setProfile(null);
    setProfileLoaded(false);
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, profileLoaded, loading, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
