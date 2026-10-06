'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Crown, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import type { Equipo, MiembroEquipo, PerfilUsuario, Proyecto } from '@/lib/database.types';
import {
  agregarMiembrosProyecto,
  esRolLider,
  getAllUsers,
  getEquipos,
  getMiembrosEquipo,
  getProyectoEquipos,
  quitarMiembroProyecto
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { puedeAgregarMiembros, puedeCrearEquipos } from '@/lib/equipos-proyecto';
import { EVENTO_EQUIPOS_CAMBIARON } from '@/lib/navegacion-proyecto';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import { btnIconoPeligro, btnPrimario, btnSecundario, campo } from '@/components/ui/estilos';

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

interface FilaMiembro {
  usuario: PerfilUsuario;
  esCreador: boolean;
  /** Agregado directamente al proyecto (se puede quitar). Los demás están por pertenecer a un equipo. */
  esDirecto: boolean;
  equipos: Array<{ equipo: Equipo; esLider: boolean }>;
}

interface MiembrosDelProyectoProps {
  proyecto: Proyecto;
  /** Se llama tras agregar o quitar miembros para recargar el proyecto. */
  onCambio: () => Promise<void> | void;
  onCantidad?: (cantidad: number) => void;
}

/** Pestaña Miembros de un proyecto: quién participa, en qué equipos, y alta/baja de miembros. */
export default function MiembrosDelProyecto({ proyecto, onCambio, onCantidad }: MiembrosDelProyectoProps) {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const proyectoId = proyecto.proyecto_id;
  const puedeAgregar = puedeAgregarMiembros(proyecto, uid);

  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [membresias, setMembresias] = useState<MiembroEquipo[]>([]);
  const [idsEquiposDelProyecto, setIdsEquiposDelProyecto] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Modal para agregar miembros
  const [modalAbierto, setModalAbierto] = useState(false);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [usersData, equiposData, vinculos, membresiasData] = await Promise.all([
        getAllUsers(),
        getEquipos(),
        getProyectoEquipos(),
        getMiembrosEquipo()
      ]);
      const ids = new Set<string>([
        ...vinculos.filter(v => v.id_proyecto === proyectoId).map(v => v.id_equipo),
        ...equiposData.filter(e => e.id_proyecto === proyectoId).map(e => e.equipo_id)
      ]);
      setUsuarios(usersData);
      setEquipos(equiposData.filter(e => ids.has(e.equipo_id)));
      setMembresias(membresiasData.filter(m => ids.has(m.id_equipo)));
      setIdsEquiposDelProyecto(ids);
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudieron cargar los miembros'));
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    void cargar();
  }, [cargar, proyecto.ids_miembros]);

  // Si alguien acepta una invitación a un equipo, la lista se actualiza sola
  useEffect(() => {
    const alCambiar = () => void cargar();
    window.addEventListener(EVENTO_EQUIPOS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_EQUIPOS_CAMBIARON, alCambiar);
  }, [cargar]);

  // Miembros: el creador, los agregados directamente y los que ya están en un equipo del proyecto
  const idsDirectos = new Set(proyecto.ids_miembros ?? []);
  const idsPorEquipo = new Set(membresias.map(m => m.id_usuario));
  const todosLosIds = [...new Set([proyecto.id_creador, ...idsDirectos, ...idsPorEquipo].filter((id): id is string => !!id))];

  const filas: FilaMiembro[] = todosLosIds
    .map(id => usuarios.find(u => u.id === id))
    .filter((u): u is PerfilUsuario => Boolean(u))
    .map(usuario => ({
      usuario,
      esCreador: usuario.id === proyecto.id_creador,
      esDirecto: idsDirectos.has(usuario.id),
      equipos: membresias
        .filter(m => m.id_usuario === usuario.id)
        .map(m => ({
          equipo: equipos.find(e => e.equipo_id === m.id_equipo),
          esLider: (m.roles ?? []).some(r => esRolLider(r.nombre_rol))
        }))
        .filter((x): x is { equipo: Equipo; esLider: boolean } => Boolean(x.equipo))
    }))
    .sort((a, b) => Number(b.esCreador) - Number(a.esCreador) || nombreDe(a.usuario).localeCompare(nombreDe(b.usuario)));

  useEffect(() => {
    if (!loading) onCantidad?.(filas.length);
  }, [loading, filas.length, onCantidad]);

  const disponibles = usuarios
    .filter(u => !todosLosIds.includes(u.id))
    .filter(u => {
      const texto = filtro.trim().toLowerCase();
      return !texto || `${nombreDe(u)} ${u.correo}`.toLowerCase().includes(texto);
    })
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

  const abrirModal = () => {
    setElegidos([]);
    setFiltro('');
    setModalAbierto(true);
  };

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (elegidos.length === 0) {
      toast.error('Elige al menos una persona');
      return;
    }
    setGuardando(true);
    try {
      await agregarMiembrosProyecto(proyectoId, elegidos);
      toast.success(elegidos.length === 1 ? 'Miembro agregado' : `${elegidos.length} miembros agregados`);
      setModalAbierto(false);
      await onCambio();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo agregar a los miembros'));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (fila: FilaMiembro) => {
    // Un equipo no puede quedarse sin líder: si es el único líder de alguno, primero hay que cambiarlo
    const sinLider = fila.equipos.find(({ equipo, esLider }) => {
      if (!esLider) return false;
      const otrosLideres = membresias.filter(
        m => m.id_equipo === equipo.equipo_id && m.id_usuario !== fila.usuario.id && (m.roles ?? []).some(r => esRolLider(r.nombre_rol))
      );
      return otrosLideres.length === 0;
    });
    if (sinLider) {
      toast.error(`${nombreDe(fila.usuario)} es el único líder de ${sinLider.equipo.nombre}. Asigna otro líder antes de quitarlo.`);
      return;
    }
    const ok = await confirmar({
      titulo: '¿Quitar del proyecto?',
      mensaje: (
        <>
          <strong className="text-ink">{nombreDe(fila.usuario)}</strong> dejará de ser miembro de {proyecto.nombre}
          {fila.equipos.length > 0 ? ' y saldrá de sus equipos en él' : ''}. Perderá el permiso de editar sus requerimientos.
        </>
      ),
      textoConfirmar: 'Quitar',
      peligro: true
    });
    if (!ok) return;
    try {
      await quitarMiembroProyecto(proyectoId, fila.usuario.id);
      toast.success('Miembro quitado');
      await onCambio();
      await cargar();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo quitar al miembro'));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-base text-ink-muted max-w-prose">
          Las personas que participan en el proyecto. Los equipos se arman con sus miembros.
        </p>
        {puedeAgregar && (
          <button onClick={abrirModal} className={`${btnPrimario} shrink-0`}>
            <Plus size={16} />
            Agregar miembros
          </button>
        )}
      </div>

      {loading ? (
        <div role="status" aria-label="Cargando" className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : (
        <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {filas.map(fila => (
            <li key={fila.usuario.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="size-9 shrink-0 rounded-full bg-brand-subtle text-brand-text flex items-center justify-center text-xs font-bold">
                  {iniciales(fila.usuario)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">
                    {nombreDe(fila.usuario)}
                    {fila.usuario.id === uid && <span className="font-normal text-ink-subtle"> (tú)</span>}
                  </p>
                  <p className="text-xs text-ink-subtle truncate">{fila.usuario.correo}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {fila.esCreador && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-warning-subtle text-warning text-xs font-medium border border-warning-line">
                    <Crown size={12} aria-hidden />
                    Creador
                  </span>
                )}
                {!fila.esCreador && puedeCrearEquipos(proyecto, fila.usuario.id) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-subtle text-brand-text text-xs font-medium border border-brand-line">
                    <Users size={12} aria-hidden />
                    Puede crear equipos
                  </span>
                )}
                {!fila.esCreador && puedeAgregarMiembros(proyecto, fila.usuario.id) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-brand-subtle text-brand-text text-xs font-medium border border-brand-line">
                    <UserPlus size={12} aria-hidden />
                    Gestiona miembros
                  </span>
                )}
                {fila.equipos.length === 0 ? (
                  <span className="text-xs text-ink-subtle italic">Sin equipo</span>
                ) : (
                  fila.equipos.map(({ equipo, esLider }) => (
                    <span
                      key={equipo.equipo_id}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-sunken text-ink-muted text-xs font-medium border border-line"
                    >
                      {esLider && <Crown size={11} aria-hidden className="text-warning" />}
                      {equipo.nombre}
                    </span>
                  ))
                )}
                {puedeAgregar && !fila.esCreador && fila.esDirecto && (
                  <button
                    onClick={() => quitar(fila)}
                    title="Quitar del proyecto"
                    aria-label={`Quitar a ${nombreDe(fila.usuario)} del proyecto`}
                    className={btnIconoPeligro}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {idsEquiposDelProyecto.size > 0 && filas.some(f => !f.esCreador && !f.esDirecto) && (
        <p className="text-xs text-ink-subtle">
          Algunas personas están en el proyecto por pertenecer a uno de sus equipos; se quitan desde el equipo.
        </p>
      )}

      <Modal open={modalAbierto} onClose={() => setModalAbierto(false)} title="Agregar miembros" description="Entran al proyecto de inmediato, sin invitación." size="md">
        <form onSubmit={agregar} noValidate className="flex flex-col flex-1 min-h-0">
          <ModalBody className="space-y-3">
            <input
              type="search"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              aria-label="Buscar personas por nombre o correo"
              className={campo}
            />
            <div className="max-h-72 overflow-y-auto rounded-ui border border-line divide-y divide-line custom-scrollbar">
              {disponibles.length === 0 ? (
                <p className="p-4 text-sm text-ink-subtle">
                  {filtro.trim() ? 'Nadie coincide con la búsqueda.' : 'Todas las personas ya son miembros del proyecto.'}
                </p>
              ) : (
                disponibles.map(u => (
                  <label key={u.id} className="flex items-center gap-3 px-3 min-h-11 cursor-pointer hover:bg-sunken">
                    <input
                      type="checkbox"
                      checked={elegidos.includes(u.id)}
                      onChange={() =>
                        setElegidos(prev => (prev.includes(u.id) ? prev.filter(x => x !== u.id) : [...prev, u.id]))
                      }
                      className="size-4 accent-brand-text shrink-0 cursor-pointer"
                    />
                    <span className="min-w-0 text-sm text-ink truncate">
                      {nombreDe(u)} <span className="text-ink-subtle">({u.correo})</span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={() => setModalAbierto(false)} className={btnSecundario}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando || elegidos.length === 0} className={btnPrimario}>
              {guardando ? 'Agregando...' : elegidos.length > 0 ? `Agregar (${elegidos.length})` : 'Agregar'}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}
