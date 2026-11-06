'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  Users,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Save,
  Edit2,
  Trash2,
  Crown,
  UserPlus,
  Check,
  Lock,
  Send,
  History,
  FolderGit2,
} from 'lucide-react';
import type {
  Equipo,
  PerfilUsuario,
  Proyecto,
  ProyectoEquipo,
  Rol,
} from '@/lib/database.types';
import {
  getEquipos,
  createEquipo,
  updateEquipo,
  deleteEquipo,
  getAllUsers,
  getRoles,
  getProyectos,
  getProyectoEquipos,
  getMiembrosEquipo,
  actualizarRolesMiembro,
  removeMiembroEquipo,
  getEquiposLideradosPor,
  esRolLider,
  crearInvitacionEquipo,
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { EVENTO_EQUIPOS_CAMBIARON } from '@/lib/navegacion-proyecto';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useEstadoSesion } from '@/lib/use-estado-sesion';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import PageHeader from '@/components/ui/PageHeader';
import ModalFormEquipo from '@/components/equipos/ModalFormEquipo';
import { HistorialMiembrosModal } from '@/components/equipos/HistorialMiembrosModal';
import BuscadorPersonas from '@/components/proyectos/BuscadorPersonas';
import {
  btnPrimario,
  btnSecundario,
  btnIcono,
  btnIconoPeligro,
  buscador,
  campo,
  etiqueta,
  tarjeta,
} from '@/components/ui/estilos';

interface MiembroDetallado {
  usuario: PerfilUsuario;
  roles: Rol[];
  esLider: boolean;
}

interface ProyectoVinculadoInfo {
  proyecto: Proyecto;
  estado: 'activo' | 'desvinculado';
}

interface EquipoGlobalDetallado extends Equipo {
  miembros: MiembroDetallado[];
  proyectosVinculados: ProyectoVinculadoInfo[];
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

interface FormularioDatosEquipoProps {
  equipo: EquipoGlobalDetallado;
  guardando: boolean;
  onGuardar: (datos: { nombre: string; descripcion: string }) => void;
  onEliminar: () => void;
}

function FormularioDatosEquipo({
  equipo,
  guardando,
  onGuardar,
  onEliminar,
}: FormularioDatosEquipoProps) {
  const [nombre, setNombre] = useState(equipo.nombre);
  const [descripcion, setDescripcion] = useState(equipo.descripcion ?? '');
  const hayCambios =
    nombre.trim() !== equipo.nombre || descripcion.trim() !== (equipo.descripcion ?? '');

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        onGuardar({ nombre, descripcion });
      }}
      noValidate
      className={`${tarjeta} p-5`}
    >
      <h3 className="text-base font-semibold text-ink mb-4">Datos del equipo global</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="equipo-global-nombre" className={etiqueta}>
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            id="equipo-global-nombre"
            type="text"
            maxLength={80}
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="equipo-global-descripcion" className={etiqueta}>
            Descripción <span className="text-danger">*</span>
          </label>
          <input
            id="equipo-global-descripcion"
            type="text"
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            className={campo}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onEliminar} className={btnSecundario}>
          <Trash2 size={16} />
          Eliminar equipo
        </button>
        <button type="submit" disabled={guardando || !hayCambios} className={btnPrimario}>
          <Save size={16} />
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

export default function EquiposGlobalPage() {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [equipos, setEquipos] = useState<EquipoGlobalDetallado[]>([]);
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [proyectosMap, setProyectosMap] = useState<Map<string, Proyecto>>(new Map());
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useEstadoSesion('easyreq:equipos:buscar', '');
  const [filtroMios, setFiltroMios] = useEstadoSesion('easyreq:equipos:filtro', 'todos');

  const [equiposLiderados, setEquiposLiderados] = useState<string[]>([]);
  const cargarLiderazgo = useCallback(async () => {
    try {
      setEquiposLiderados(uid ? await getEquiposLideradosPor(uid) : []);
    } catch (err) {
      console.error('Error al cargar liderazgo de equipos:', err);
      setEquiposLiderados([]);
    }
  }, [uid]);

  useEffect(() => {
    void cargarLiderazgo();
  }, [cargarLiderazgo]);

  const puedeGestionarEquipo = (equipoId: string) => equiposLiderados.includes(equipoId);

  // Modal crear equipo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () =>
    setIsModalOpen(false)
  );

  // Equipo abierto e historial
  const [equipoAbiertoId, setEquipoAbiertoId] = useState<string | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ id_usuario: '', id_roles: [] as string[] });
  const [guardandoMiembro, setGuardandoMiembro] = useState(false);
  const [guardandoDatos, setGuardandoDatos] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [usersData, rolesData, equiposData, proyectosData, vinculosData, miembrosData] =
        await Promise.all([
          getAllUsers(),
          getRoles(),
          getEquipos(),
          getProyectos(),
          getProyectoEquipos(false),
          getMiembrosEquipo(),
        ]);

      setUsuarios([...usersData].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))));
      setRoles(rolesData);

      const pMap = new Map<string, Proyecto>(proyectosData.map(p => [p.proyecto_id, p]));
      setProyectosMap(pMap);

      const vinculosPorEquipo = new Map<string, ProyectoEquipo[]>();
      for (const v of vinculosData) {
        if (!v.id_equipo) continue;
        const lista = vinculosPorEquipo.get(v.id_equipo) ?? [];
        lista.push(v);
        vinculosPorEquipo.set(v.id_equipo, lista);
      }

      const detallados: EquipoGlobalDetallado[] = equiposData.map(eq => {
        const miembros = miembrosData
          .filter(m => m.id_equipo === eq.equipo_id && m.usuario)
          .map(m => {
            const rolesMiembro = m.roles ?? [];
            return {
              usuario: m.usuario!,
              roles: rolesMiembro,
              esLider: rolesMiembro.some(r => esRolLider(r.nombre_rol)),
            };
          })
          .sort(
            (a, b) =>
              Number(b.esLider) - Number(a.esLider) ||
              nombreDe(a.usuario).localeCompare(nombreDe(b.usuario))
          );

        const vinculos = vinculosPorEquipo.get(eq.equipo_id) ?? [];
        const proyectosVinculados: ProyectoVinculadoInfo[] = vinculos
          .map(v => {
            const p = pMap.get(v.id_proyecto);
            if (!p) return null;
            return {
              proyecto: p,
              estado: v.estado ?? 'activo',
            };
          })
          .filter((item): item is ProyectoVinculadoInfo => Boolean(item));

        return {
          ...eq,
          miembros,
          proyectosVinculados,
        };
      });

      setEquipos(detallados.sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudieron cargar los equipos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const recargar = useCallback(async () => {
    await Promise.all([fetchData(), cargarLiderazgo()]);
  }, [fetchData, cargarLiderazgo]);

  useEffect(() => {
    const alCambiar = () => void recargar();
    window.addEventListener(EVENTO_EQUIPOS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_EQUIPOS_CAMBIARON, alCambiar);
  }, [recargar]);

  const equipoAbierto = equipos.find(e => e.equipo_id === equipoAbiertoId) ?? null;

  const openModal = () => {
    setFormData({ nombre: '', descripcion: '' });
    setIsModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim()) {
      toast.error('El nombre del equipo es obligatorio');
      return;
    }
    if (!formData.descripcion.trim()) {
      toast.error('La descripción del equipo es obligatoria');
      return;
    }
    if (!uid) {
      toast.error('Debes iniciar sesión para crear un equipo');
      return;
    }

    const rolLider = roles.find(r => esRolLider(r.nombre_rol));
    if (!rolLider) {
      toast.error('No está configurado el rol de líder');
      return;
    }

    setSaving(true);
    try {
      const nuevo = await createEquipo({
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        id_creador: uid,
        id_rol_lider: rolLider.id,
      });
      toast.success('Equipo global creado. Eres su líder.');
      setIsModalOpen(false);
      await recargar();
      setEquipoAbiertoId(nuevo.equipo_id);
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo crear el equipo'));
    } finally {
      setSaving(false);
    }
  };

  const guardarDatosEquipo = async (
    team: EquipoGlobalDetallado,
    datos: { nombre: string; descripcion: string }
  ) => {
    if (!puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede editarlo');
      return;
    }
    if (!datos.nombre.trim() || !datos.descripcion.trim()) {
      toast.error('El nombre y la descripción son obligatorios');
      return;
    }
    setGuardandoDatos(true);
    try {
      await updateEquipo(team.equipo_id, {
        nombre: datos.nombre.trim(),
        descripcion: datos.descripcion.trim(),
      });
      toast.success('Equipo actualizado');
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo guardar el equipo'));
    } finally {
      setGuardandoDatos(false);
    }
  };

  const handleDeleteTeam = async (team: EquipoGlobalDetallado) => {
    if (!puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede eliminarlo');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Eliminar equipo global?',
      mensaje: (
        <>
          Se eliminará <strong className="text-ink">{team.nombre}</strong> junto con su plantilla de
          miembros, invitaciones y vínculos con proyectos.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true,
    });
    if (!ok) return;

    try {
      await deleteEquipo(team.equipo_id);
      toast.success('Equipo eliminado');
      if (equipoAbiertoId === team.equipo_id) setEquipoAbiertoId(null);
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar el equipo'));
    }
  };

  const miembrosActuales = () => equipoAbierto?.miembros ?? [];
  const esIdRolLider = (id: string) => esRolLider(roles.find(r => r.id === id)?.nombre_rol);

  const quedariaSinLider = (userId: string, nuevosIdRoles: string[]) => {
    const tieneLider = (ids: string[]) => ids.some(esIdRolLider);
    const miembros = miembrosActuales();
    const habiaLider = miembros.some(m => m.esLider);
    const quedaLider = miembros.some(m =>
      tieneLider(m.usuario.id === userId ? nuevosIdRoles : m.roles.map(r => r.id))
    );
    return habiaLider && !quedaLider;
  };

  const handleGuardarMiembro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipoAbierto || !uid) return;
    if (!memberForm.id_usuario) {
      toast.error('Selecciona un usuario');
      return;
    }
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede invitar miembros o cambiar roles');
      return;
    }
    const esMiembroExistente = miembrosActuales().some(
      m => m.usuario.id === memberForm.id_usuario
    );
    if (esMiembroExistente && quedariaSinLider(memberForm.id_usuario, memberForm.id_roles)) {
      toast.error('El equipo debe conservar al menos un líder');
      return;
    }

    setGuardandoMiembro(true);
    try {
      if (esMiembroExistente) {
        await actualizarRolesMiembro(
          equipoAbierto.equipo_id,
          memberForm.id_usuario,
          memberForm.id_roles
        );
        toast.success('Roles actualizados en la plantilla global');
        await recargar();
      } else {
        await crearInvitacionEquipo(
          equipoAbierto.equipo_id,
          uid,
          memberForm.id_usuario,
          memberForm.id_roles
        );
        toast.success('Invitación enviada. El usuario se unirá cuando la acepte.');
      }
      setMemberForm({ id_usuario: '', id_roles: [] });
    } catch (err) {
      toast.error(
        mensajeError(
          err,
          esMiembroExistente
            ? 'No se pudieron actualizar los roles'
            : 'No se pudo enviar la invitación'
        )
      );
    } finally {
      setGuardandoMiembro(false);
    }
  };

  const handleRemoveMember = async (miembro: MiembroDetallado) => {
    if (!equipoAbierto) return;
    if (!puedeGestionarEquipo(equipoAbierto.equipo_id)) {
      toast.error('Solo el líder del equipo puede remover miembros');
      return;
    }
    if (miembro.usuario.id === uid) {
      toast.error('No puedes removerte a ti mismo del equipo');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Remover miembro de la plantilla global?',
      mensaje: (
        <>
          <strong className="text-ink">{nombreDe(miembro.usuario)}</strong> dejará de formar parte
          de la plantilla global de {equipoAbierto.nombre}.
        </>
      ),
      textoConfirmar: 'Remover',
      peligro: true,
    });
    if (!ok) return;

    try {
      await removeMiembroEquipo(equipoAbierto.equipo_id, miembro.usuario.id);
      toast.success('Miembro removido');
      if (memberForm.id_usuario === miembro.usuario.id) {
        setMemberForm({ id_usuario: '', id_roles: [] });
      }
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo remover al miembro'));
    }
  };

  const seleccionarUsuarioMiembro = (userId: string) => {
    const existente = miembrosActuales().find(m => m.usuario.id === userId);
    setMemberForm({
      id_usuario: userId,
      id_roles: existente ? existente.roles.map(r => r.id) : [],
    });
  };

  const toggleRolMiembro = (rolId: string) => {
    setMemberForm(prev => ({
      ...prev,
      id_roles: prev.id_roles.includes(rolId)
        ? prev.id_roles.filter(id => id !== rolId)
        : [...prev.id_roles, rolId],
    }));
  };

  const esMiembro = (team: EquipoGlobalDetallado) =>
    team.miembros.some(m => m.usuario.id === uid);

  const modalEquipo = (
    <ModalFormEquipo
      open={isModalOpen}
      onClose={intentarCerrar}
      cerrarConFondo={!hayCambios}
      editingEquipo={null}
      formData={formData}
      setFormData={setFormData}
      onSave={handleSaveTeam}
      saving={saving}
    />
  );

  // ==========================================
  // DETALLE DE UN EQUIPO GLOBAL
  // ==========================================
  if (equipoAbierto) {
    const puedeGestionar = puedeGestionarEquipo(equipoAbierto.equipo_id);
    const editandoMiembro = equipoAbierto.miembros.some(
      m => m.usuario.id === memberForm.id_usuario
    );
    const idsMiembros = new Set(equipoAbierto.miembros.map(m => m.usuario.id));

    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <button
              onClick={() => {
                setEquipoAbiertoId(null);
                setMemberForm({ id_usuario: '', id_roles: [] });
              }}
              className="inline-flex items-center text-sm font-medium text-ink-subtle hover:text-ink transition-colors group cursor-pointer mb-3"
            >
              <ChevronLeft
                size={16}
                className="mr-1 group-hover:-translate-x-0.5 transition-transform"
              />
              Todos los equipos
            </button>
            <h1 className="text-2xl font-semibold text-ink">{equipoAbierto.nombre}</h1>
            {!puedeGestionar && (
              <p className="text-base text-ink-muted mt-1 max-w-prose">
                {equipoAbierto.descripcion || 'Sin descripción.'}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setHistorialOpen(true)}
            className={btnSecundario}
          >
            <History size={16} />
            Historial de miembros
          </button>
        </div>

        {/* Proyectos donde participa */}
        <section className={`${tarjeta} p-5`}>
          <h3 className="text-base font-semibold text-ink mb-2 flex items-center gap-2">
            <FolderGit2 size={16} className="text-brand-text" />
            Proyectos donde participa
            <span className="text-xs font-normal text-ink-subtle">
              ({equipoAbierto.proyectosVinculados.length})
            </span>
          </h3>
          {equipoAbierto.proyectosVinculados.length === 0 ? (
            <p className="text-sm text-ink-subtle">
              Este equipo aún no está vinculado a ningún proyecto. Puedes asignarlo desde la pestaña{' '}
              <strong className="font-medium text-ink">Equipos</strong> dentro de un proyecto.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-2">
              {equipoAbierto.proyectosVinculados.map(({ proyecto, estado }) => (
                <Link
                  key={proyecto.proyecto_id}
                  href={`/requerimientos/?id=${proyecto.proyecto_id}&vista=equipos`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-ui border border-line bg-sunken hover:border-brand-text transition-colors text-xs"
                >
                  <span className="font-semibold text-ink">{proyecto.nombre}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      estado === 'activo'
                        ? 'bg-success-subtle text-success border-success-line'
                        : 'bg-sunken text-ink-subtle border-line'
                    }`}
                  >
                    {estado === 'activo' ? 'Activo' : 'Desvinculado'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {puedeGestionar && (
          <FormularioDatosEquipo
            key={`${equipoAbierto.equipo_id}|${equipoAbierto.nombre}|${
              equipoAbierto.descripcion ?? ''
            }`}
            equipo={equipoAbierto}
            guardando={guardandoDatos}
            onGuardar={datos => guardarDatosEquipo(equipoAbierto, datos)}
            onEliminar={() => handleDeleteTeam(equipoAbierto)}
          />
        )}

        {!puedeGestionar ? (
          <div className="bg-warning-subtle border border-warning-line rounded-ui p-4 flex items-center gap-2.5 text-sm text-warning">
            <Lock size={16} className="shrink-0" />
            <span>
              Solo los líderes de este equipo pueden invitar o remover miembros en la plantilla global.
            </span>
          </div>
        ) : (
          <div className={`${tarjeta} p-5`}>
            <h3 className="text-base font-semibold text-ink mb-1 flex items-center gap-2">
              <UserPlus size={16} className="text-brand-text" />
              {editandoMiembro
                ? 'Editar roles en la plantilla global'
                : 'Invitar usuario a la plantilla global'}
            </h3>
            <p className="text-sm text-ink-subtle mb-4">
              {editandoMiembro
                ? 'Actualiza los roles predeterminados de este miembro cuando el equipo se asigne a nuevos proyectos.'
                : 'El usuario se unirá a la plantilla global del equipo cuando acepte la invitación.'}
            </p>
            <form onSubmit={handleGuardarMiembro} noValidate className="space-y-4">
              <BuscadorPersonas
                id="miembro-global-usuario"
                titulo="Usuario *"
                multiple={false}
                valor={memberForm.id_usuario ? [memberForm.id_usuario] : []}
                onChange={ids => seleccionarUsuarioMiembro(ids[0] ?? '')}
                candidatos={usuarios.filter(u => u.id !== uid || idsMiembros.has(u.id))}
                ayuda={
                  editandoMiembro
                    ? 'Editando los roles globales de este miembro.'
                    : 'Escribe al menos 2 letras del nombre o correo de la persona.'
                }
              />

              <div>
                <span className={etiqueta}>Roles en el equipo</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Roles en el equipo">
                  {roles.map(r => {
                    const seleccionado = memberForm.id_roles.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleRolMiembro(r.id)}
                        aria-pressed={seleccionado}
                        className={`inline-flex items-center gap-1 px-3 min-h-9 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
                          seleccionado
                            ? 'bg-brand-solid border-brand-text text-on-solid'
                            : 'bg-sunken border-line text-ink-muted hover:border-brand-text'
                        }`}
                      >
                        {seleccionado ? (
                          <Check size={13} />
                        ) : esRolLider(r.nombre_rol) ? (
                          <Crown size={13} />
                        ) : null}
                        {r.nombre_rol}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {memberForm.id_usuario && (
                  <button
                    type="button"
                    onClick={() => setMemberForm({ id_usuario: '', id_roles: [] })}
                    className={btnSecundario}
                  >
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={guardandoMiembro} className={btnPrimario}>
                  {editandoMiembro ? <Save size={16} /> : <Send size={16} />}
                  {guardandoMiembro
                    ? 'Guardando...'
                    : editandoMiembro
                      ? 'Guardar roles'
                      : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Plantilla de integrantes */}
        <section>
          <h3 className="text-lg font-semibold text-ink mb-3">
            Plantilla global de integrantes
            <span className="ml-2 text-sm font-normal text-ink-subtle">
              {equipoAbierto.miembros.length}
            </span>
          </h3>
          <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
            {equipoAbierto.miembros.length === 0 ? (
              <li className="p-8 text-center text-sm text-ink-subtle">
                Este equipo aún no tiene integrantes en su plantilla global.
              </li>
            ) : (
              equipoAbierto.miembros.map(m => (
                <li
                  key={m.usuario.id}
                  className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                    memberForm.id_usuario === m.usuario.id ? 'bg-brand-subtle' : 'hover:bg-sunken'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative size-9 shrink-0 rounded-full bg-brand-subtle text-brand-text flex items-center justify-center text-xs font-bold">
                      {iniciales(m.usuario)}
                      {m.esLider && (
                        <span
                          className="absolute -top-1 -right-1 size-4 rounded-full bg-warning text-canvas flex items-center justify-center"
                          title="Líder"
                        >
                          <Crown size={9} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {m.usuario.nombre || 'Usuario'}
                        {m.usuario.id === uid && (
                          <span className="font-normal text-ink-subtle"> (tú)</span>
                        )}
                      </p>
                      <p className="text-xs text-ink-subtle truncate">{m.usuario.correo}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:justify-end">
                    <div className="flex flex-wrap gap-1 sm:justify-end">
                      {m.roles.length === 0 ? (
                        <span className="text-xs text-ink-subtle italic">Sin rol</span>
                      ) : (
                        m.roles.map(r => (
                          <span
                            key={r.id}
                            className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-subtle text-brand-text border border-brand-line"
                          >
                            {r.nombre_rol}
                          </span>
                        ))
                      )}
                    </div>
                    {puedeGestionar && (
                      <div className="flex items-center shrink-0">
                        <button
                          onClick={() => {
                            seleccionarUsuarioMiembro(m.usuario.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={btnIcono}
                          title="Editar roles globales"
                          aria-label={`Editar roles de ${nombreDe(m.usuario)}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m)}
                          disabled={m.usuario.id === uid}
                          className={btnIconoPeligro}
                          title={
                            m.usuario.id === uid
                              ? 'No puedes removerte a ti mismo'
                              : 'Remover miembro'
                          }
                          aria-label={`Remover a ${nombreDe(m.usuario)}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <HistorialMiembrosModal
          open={historialOpen}
          onClose={() => setHistorialOpen(false)}
          equipoId={equipoAbierto.equipo_id}
          equipoNombre={equipoAbierto.nombre}
          proyectoId={null}
          proyectosMap={proyectosMap}
        />

        {modalEquipo}
      </div>
    );
  }

  // ==========================================
  // DIRECTORIO GLOBAL DE EQUIPOS
  // ==========================================
  const termino = searchTerm.trim().toLowerCase();
  const equiposFiltrados = equipos.filter(eq => {
    if (filtroMios === 'mios' && !esMiembro(eq) && !puedeGestionarEquipo(eq.equipo_id)) {
      return false;
    }
    if (!termino) return true;
    return (
      eq.nombre.toLowerCase().includes(termino) ||
      (eq.descripcion || '').toLowerCase().includes(termino) ||
      eq.miembros.some(m => nombreDe(m.usuario).toLowerCase().includes(termino))
    );
  });

  return (
    <div className="animate-in fade-in">
      <PageHeader
        title="Equipos"
        description="Entidades globales de trabajo que pueden asignarse a uno o varios proyectos."
        actions={
          <button onClick={openModal} className={btnPrimario}>
            <Plus size={16} />
            Nuevo equipo
          </button>
        }
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-subtle">
            <Search size={16} />
          </div>
          <input
            type="search"
            placeholder="Buscar equipo por nombre, descripción o integrante..."
            aria-label="Buscar equipos"
            className={buscador}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="inline-flex rounded-ui border border-line bg-sunken p-1 shrink-0">
          {[
            { id: 'todos', etiqueta: 'Todos los equipos' },
            { id: 'mios', etiqueta: 'Mis equipos' },
          ].map(op => (
            <button
              key={op.id}
              type="button"
              onClick={() => setFiltroMios(op.id)}
              className={`px-3 min-h-8 rounded-ui text-xs font-semibold transition-colors cursor-pointer ${
                filtroMios === op.id
                  ? 'bg-surface text-ink shadow-2xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {op.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div
          role="status"
          aria-label="Cargando"
          className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden"
        >
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : equiposFiltrados.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">
            {termino || filtroMios === 'mios'
              ? 'No se encontraron equipos'
              : 'Todavía no hay equipos registrados'}
          </h3>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
            Crea un equipo global para invitar integrantes y asignarlo a tus proyectos.
          </p>
          <div className="mt-6 flex justify-center">
            <button onClick={openModal} className={btnPrimario}>
              <Plus size={16} />
              Crear equipo
            </button>
          </div>
        </div>
      ) : (
        <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {equiposFiltrados.map(team => {
            const gestionable = puedeGestionarEquipo(team.equipo_id);
            const lideres = team.miembros.filter(m => m.esLider);
            const proyectosActivos = team.proyectosVinculados.filter(
              pv => pv.estado === 'activo'
            ).length;

            return (
              <li key={team.equipo_id}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => {
                    setEquipoAbiertoId(team.equipo_id);
                    window.scrollTo({ top: 0 });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) {
                      setEquipoAbiertoId(team.equipo_id);
                      window.scrollTo({ top: 0 });
                    }
                  }}
                  aria-label={`Ver detalles de ${team.nombre}`}
                  className="group flex items-center gap-4 px-5 py-5 cursor-pointer hover:bg-sunken focus-visible:bg-sunken"
                >
                  <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-ui bg-brand-solid text-on-solid">
                    <Users size={20} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h3 className="text-base font-semibold text-ink">{team.nombre}</h3>
                      {gestionable && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-subtle text-warning text-xs font-medium border border-warning-line">
                          <Crown size={12} aria-hidden />
                          Líder
                        </span>
                      )}
                      {proyectosActivos > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sunken text-ink-muted text-xs font-medium border border-line">
                          <FolderGit2 size={12} aria-hidden />
                          {proyectosActivos}{' '}
                          {proyectosActivos === 1 ? 'proyecto activo' : 'proyectos activos'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted mt-1 line-clamp-1">
                      {team.descripcion || 'Sin descripción.'}
                    </p>
                    {lideres.length > 0 && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-ink-subtle min-w-0">
                        <Crown size={12} aria-hidden className="text-warning shrink-0" />
                        <span className="truncate">
                          {lideres.map(l => nombreDe(l.usuario)).join(', ')}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="hidden md:flex items-center gap-3 shrink-0 text-sm text-ink-muted">
                    <div className="flex -space-x-1.5">
                      {team.miembros.slice(0, 4).map(m => (
                        <span
                          key={m.usuario.id}
                          title={nombreDe(m.usuario)}
                          className="size-7 rounded-full bg-brand-subtle text-brand-text ring-2 ring-surface flex items-center justify-center text-xs font-bold"
                        >
                          {iniciales(m.usuario)}
                        </span>
                      ))}
                    </div>
                    <span>
                      {team.miembros.length}{' '}
                      {team.miembros.length === 1 ? 'integrante' : 'integrantes'}
                    </span>
                  </div>

                  {!gestionable && !esMiembro(team) && (
                    <span
                      title="Solo el líder del equipo puede editarlo"
                      className="inline-flex items-center gap-1 px-2 text-xs font-medium text-ink-subtle shrink-0"
                    >
                      <Lock size={14} aria-hidden />
                      Solo lectura
                    </span>
                  )}
                  <ChevronRight
                    size={18}
                    aria-hidden
                    className="text-ink-muted group-hover:text-ink shrink-0"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modalEquipo}
    </div>
  );
}

