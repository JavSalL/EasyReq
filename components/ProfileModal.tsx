'use client';

import React, { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { Mail, User as UserIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase-auth-provider';
import { getProfesiones, saveUserProfile } from '@/lib/firestore-service';
import { Profesion } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { btnPrimario, btnSecundario, campo, etiqueta } from '@/components/ui/estilos';
import SelectorProfesiones from '@/components/SelectorProfesiones';
import { auth } from '@/lib/firebase';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  /**
   * Paso de registro que no se puede omitir (cuentas nuevas de Google o perfiles
   * sin profesiones): no se cierra con Esc, clic fuera ni la X, y en lugar de
   * "Cancelar" ofrece cerrar la sesión.
   */
  obligatorio?: boolean;
}

export default function ProfileModal({
  open,
  onClose,
  title = 'Configuración del Perfil',
  description = 'Actualiza tu información personal y especialidades profesionales.',
  obligatorio = false
}: ProfileModalProps) {
  const { user, profile, refreshProfile, logout } = useAuth();

  const [nombre, setNombre] = useState('');
  const [idsProfesiones, setIdsProfesiones] = useState<string[]>([]);
  const [profesiones, setProfesiones] = useState<Profesion[]>([]);
  const [guardando, setGuardando] = useState(false);

  // Cargar el catálogo de profesiones al abrir
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    getProfesiones()
      .then((lista) => {
        if (!cancelado) setProfesiones(lista);
      })
      .catch((err) => console.error('Error al cargar profesiones:', err));
    return () => {
      cancelado = true;
    };
  }, [open]);

  // Rellenar el formulario con lo que ya se sabe del usuario (en Google, el nombre de la cuenta)
  useEffect(() => {
    if (!open) return;
    setNombre(profile?.nombre || user?.displayName || '');
    setIdsProfesiones(profile?.ids_profesiones || (profile?.id_profesion ? [profile.id_profesion] : []));
  }, [open, profile, user]);

  const cerrarSesion = async () => {
    try {
      await logout();
      window.location.href = '/login/';
    } catch {
      toast.error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      toast.error('Por favor ingresa tu nombre completo');
      return;
    }
    if (idsProfesiones.length === 0) {
      toast.error('Por favor selecciona al menos una profesión');
      return;
    }

    setGuardando(true);
    try {
      if (auth.currentUser && auth.currentUser.displayName !== nombreLimpio) {
        await updateProfile(auth.currentUser, { displayName: nombreLimpio });
      }

      const seleccionadas = profesiones.filter((p) => idsProfesiones.includes(p.id));
      await saveUserProfile(user.uid, {
        nombre: nombreLimpio,
        correo: user.email || profile?.correo || '',
        ids_profesiones: seleccionadas.map((p) => p.id),
        profesiones_nombres: seleccionadas.map((p) => p.nombre),
        profesiones: seleccionadas,
        id_profesion: seleccionadas[0]?.id || undefined,
        profesion_nombre: seleccionadas[0]?.nombre || undefined
      });

      await refreshProfile();
      toast.success(obligatorio ? `¡Bienvenido a EasyReq, ${nombreLimpio}!` : 'Perfil actualizado correctamente');
      onClose();
    } catch (err) {
      console.error('Error al guardar el perfil:', err);
      toast.error('No se pudieron guardar los cambios');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="md" cerrable={!obligatorio}>
      <form onSubmit={handleGuardar} noValidate className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-5">
          {/* Correo (solo lectura) */}
          <div>
            <label htmlFor="perfil-correo" className={etiqueta}>
              {obligatorio ? 'Cuenta' : 'Correo Electrónico'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
                <Mail size={18} aria-hidden />
              </div>
              <input
                id="perfil-correo"
                type="email"
                disabled
                value={user?.email || profile?.correo || ''}
                className={`${campo} pl-10 cursor-not-allowed`}
              />
            </div>
            <p className="text-xs text-ink-subtle mt-1.5">El correo está vinculado a tu cuenta de acceso y no se puede cambiar.</p>
          </div>

          {/* Nombre */}
          <div>
            <label htmlFor="perfil-nombre" className={etiqueta}>
              Nombre Completo <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-ink-subtle">
                <UserIcon size={18} aria-hidden />
              </div>
              <input
                id="perfil-nombre"
                type="text"
                autoComplete="name"
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. Ana María Gómez"
                className={`${campo} pl-10`}
              />
            </div>
          </div>

          {/* Profesiones */}
          <SelectorProfesiones
            id="perfil-profesiones"
            profesiones={profesiones}
            valor={idsProfesiones}
            onChange={setIdsProfesiones}
          />
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={obligatorio ? cerrarSesion : onClose}
            disabled={guardando}
            className={btnSecundario}
          >
            {obligatorio ? 'Cerrar sesión' : 'Cancelar'}
          </button>
          <button type="submit" disabled={guardando} className={btnPrimario}>
            {guardando ? 'Guardando...' : obligatorio ? 'Guardar y entrar' : 'Guardar cambios'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
