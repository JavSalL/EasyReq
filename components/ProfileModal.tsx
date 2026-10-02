'use client';

import React, { useEffect, useState } from 'react';
import { updateProfile } from 'firebase/auth';
import { User as UserIcon, Mail, Check, X, ChevronDown, Briefcase } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/lib/firebase-auth-provider';
import { getProfesiones, saveUserProfile } from '@/lib/firestore-service';
import { Profesion } from '@/lib/database.types';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { auth } from '@/lib/firebase';

interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
}

export default function ProfileModal({ 
  open, 
  onClose,
  title = 'Configuración del Perfil',
  description = 'Actualiza tu información personal y especialidades profesionales.'
}: ProfileModalProps) {
  const { user, profile, refreshProfile } = useAuth();
  
  const [nombre, setNombre] = useState('');
  const [idsProfesiones, setIdsProfesiones] = useState<string[]>([]);
  const [profesiones, setProfesiones] = useState<Profesion[]>([]);
  const [profMenuOpen, setProfMenuOpen] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Cargar lista de profesiones del catálogo
  useEffect(() => {
    async function cargarProfesiones() {
      setCargando(true);
      try {
        const lista = await getProfesiones();
        setProfesiones(lista);
      } catch (err) {
        console.error('Error al cargar profesiones:', err);
      } finally {
        setCargando(false);
      }
    }
    if (open) {
      cargarProfesiones();
    }
  }, [open]);

  // Inicializar estado del formulario con el perfil del usuario actual
  useEffect(() => {
    if (open) {
      setNombre(profile?.nombre || user?.displayName || '');
      const currentIds = profile?.ids_profesiones || 
        (profile?.id_profesion ? [profile.id_profesion] : []);
      setIdsProfesiones(currentIds);
    }
  }, [open, profile, user]);

  const toggleProfesion = (id: string) => {
    setIdsProfesiones((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      toast.error('El nombre no puede estar vacío');
      return;
    }

    setGuardando(true);
    try {
      // 1. Actualizar displayName en Firebase Auth (si aplica)
      if (auth.currentUser && auth.currentUser.displayName !== nombreLimpio) {
        await updateProfile(auth.currentUser, { displayName: nombreLimpio });
      }

      // 2. Mapear profesiones seleccionadas
      const profesionesSeleccionadas = profesiones.filter((p) => idsProfesiones.includes(p.id));

      // 3. Guardar en documento `perfil_usuario` en Firestore
      await saveUserProfile(user.uid, {
        nombre: nombreLimpio,
        correo: user.email || profile?.correo || '',
        ids_profesiones: profesionesSeleccionadas.map((p) => p.id),
        profesiones_nombres: profesionesSeleccionadas.map((p) => p.nombre),
        profesiones: profesionesSeleccionadas,
        id_profesion: profesionesSeleccionadas[0]?.id || undefined,
        profesion_nombre: profesionesSeleccionadas[0]?.nombre || undefined,
      });

      // 4. Refrescar perfil global en AuthContext
      await refreshProfile();

      toast.success('Perfil actualizado correctamente');
      onClose();
    } catch (err) {
      console.error('Error al guardar el perfil:', err);
      toast.error('No se pudieron guardar los cambios');
    } finally {
      setGuardando(false);
    }
  };

  const textoProfesiones = idsProfesiones.length === 0
    ? 'Selecciona tus profesiones...'
    : `${idsProfesiones.length} profesión${idsProfesiones.length > 1 ? 'es' : ''} seleccionada${idsProfesiones.length > 1 ? 's' : ''}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="md"
    >
      <form onSubmit={handleGuardar} className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          {/* Correo (Lectura) */}
          <div>
            <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                type="email"
                disabled
                value={user?.email || profile?.correo || ''}
                className="w-full pl-9 pr-3 py-2 bg-sunken border border-line rounded-ui text-sm text-ink-muted cursor-not-allowed opacity-80"
              />
            </div>
            <p className="text-[11px] text-ink-subtle mt-1">
              El correo está vinculado a tu cuenta de autenticación.
            </p>
          </div>

          {/* Nombre Completo */}
          <div>
            <label htmlFor="nombre-perfil" className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
              Nombre Completo <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <UserIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                id="nombre-perfil"
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. María González"
                className="w-full pl-9 pr-3 py-2 bg-surface border border-line rounded-ui text-sm text-ink focus:outline-none focus:border-brand-text transition-colors"
              />
            </div>
          </div>

          {/* Selector Multiselección de Profesiones */}
          <div className="relative">
            <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
              Profesión / Especialidad
            </label>
            <button
              type="button"
              onClick={() => setProfMenuOpen(!profMenuOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-surface border border-line rounded-ui text-sm text-ink text-left hover:border-line-strong transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <Briefcase size={16} className="text-ink-subtle shrink-0" />
                <span className={idsProfesiones.length === 0 ? 'text-ink-subtle' : 'text-ink font-medium'}>
                  {textoProfesiones}
                </span>
              </span>
              <ChevronDown size={16} className={`text-ink-subtle transition-transform ${profMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Menú Desplegable con Checkboxes */}
            {profMenuOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-surface border border-line rounded-ui shadow-lg animate-in fade-in overflow-hidden">
                <div className="px-3 py-2 border-b border-line flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-muted">Catálogo de Profesiones</span>
                  {idsProfesiones.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIdsProfesiones([])}
                      className="text-[11px] font-semibold text-brand-text hover:underline cursor-pointer"
                    >
                      Limpiar todo
                    </button>
                  )}
                </div>
                <div role="listbox" aria-multiselectable className="max-h-48 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
                  {cargando && profesiones.length === 0 && (
                    <p className="text-xs text-ink-subtle px-2.5 py-2">Cargando catálogo...</p>
                  )}
                  {!cargando && profesiones.length === 0 && (
                    <p className="text-xs text-ink-subtle px-2.5 py-2">No se encontraron profesiones en el catálogo.</p>
                  )}
                  {profesiones.map((p) => {
                    const checked = idsProfesiones.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-ui text-sm cursor-pointer transition-colors ${
                          checked
                            ? 'bg-brand-subtle text-ink font-medium'
                            : 'text-ink-muted hover:bg-sunken hover:text-ink'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleProfesion(p.id)}
                          className="w-4 h-4 rounded accent-brand-text shrink-0 cursor-pointer"
                        />
                        <span className="flex-1 truncate">{p.nombre}</span>
                        {checked && <Check size={14} className="text-brand-text shrink-0" />}
                      </label>
                    );
                  })}
                </div>
                <div className="px-2.5 py-2 border-t border-line bg-sunken">
                  <button
                    type="button"
                    onClick={() => setProfMenuOpen(false)}
                    className="w-full py-1.5 rounded-ui bg-brand-text text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Aceptar{idsProfesiones.length > 0 ? ` (${idsProfesiones.length})` : ''}
                  </button>
                </div>
              </div>
            )}

            {/* Chips de Profesiones Seleccionadas */}
            {idsProfesiones.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {idsProfesiones.map((id) => {
                  const prof = profesiones.find((p) => p.id === id);
                  if (!prof) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 text-[11px] font-medium bg-brand-subtle text-brand-text border border-brand-line rounded-full"
                    >
                      <span className="max-w-40 truncate">{prof.nombre}</span>
                      <button
                        type="button"
                        aria-label={`Quitar ${prof.nombre}`}
                        onClick={() => toggleProfesion(id)}
                        className="w-4 h-4 rounded-full hover:bg-brand-line flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-sunken rounded-ui transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="px-4 py-2 text-xs font-semibold bg-brand-text text-white rounded-ui hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
