'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Users, Plus, ChevronRight, ChevronLeft, Save, Edit2, Trash2, Crown, UserPlus, Check, Lock, Send
} from 'lucide-react';
import type { Equipo, PerfilUsuario, Proyecto, Rol } from '@/lib/database.types';
import {
  getEquipos,
  createEquipoEnProyecto,
  updateEquipo,
  deleteEquipo,
  getAllUsers,
  getRoles,
  getProyectoEquipos,
  getMiembrosEquipo,
  actualizarRolesMiembro,
  removeMiembroEquipo,
  getEquiposLideradosPor,
  esRolLider,
  crearInvitacionEquipo
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { esMiembroDelProyecto, puedeCrearEquipos } from '@/lib/equipos-proyecto';
import { EVENTO_EQUIPOS_CAMBIARON, irA, leerNavegacion, suscribirNavegacion } from '@/lib/navegacion-proyecto';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  btnPrimario, btnSecundario, btnIcono, btnIconoPeligro, campo, etiqueta, tarjeta
} from '@/components/ui/estilos';
import ModalFormEquipo from '@/components/equipos/ModalFormEquipo';

interface MiembroDetallado {
  usuario: PerfilUsuario;
  roles: Rol[];
  esLider: boolean;
}

interface EquipoDetallado extends Equipo {
  miembros: MiembroDetallado[];
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

interface FormularioDatosEquipoProps {
  equipo: EquipoDetallado;
  guardando: boolean;
  onGuardar: (datos: { nombre: string; descripcion: string }) => void;
  onEliminar: () => void;
}

/**
 * Datos del equipo (nombre y descripción) editables en la misma pantalla que sus miembros.
 * Se monta con `key` ligada a los datos guardados, así el formulario siempre parte de lo último.
 */
function FormularioDatosEquipo({ equipo, guardando, onGuardar, onEliminar }: FormularioDatosEquipoProps) {
  const [nombre, setNombre] = useState(equipo.nombre);
  const [descripcion, setDescripcion] = useState(equipo.descripcion ?? '');
  const hayCambios = nombre.trim() !== equipo.nombre || descripcion.trim() !== (equipo.descripcion ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({ nombre, descripcion });
      }}
      noValidate
      className={`${tarjeta} p-5`}
    >
      <h3 className="text-base font-semibold text-ink mb-4">Datos del equipo</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="equipo-nombre" className={etiqueta}>
            Nombre <span className="text-danger">*</span>
          </label>
          <input
            id="equipo-nombre"
            type="text"
            maxLength={80}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={campo}
          />
        </div>
        <div>
          <label htmlFor="equipo-descripcion" className={etiqueta}>
            Descripción <span className="text-danger">*</span>
          </label>
          <input
            id="equipo-descripcion"
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
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

interface EquiposDelProyectoProps {
  proyecto: Proyecto;
  /** Se avisa con la cantidad de equipos cada vez que se cargan (para el contador de la pestaña). */
  onCantidad?: (cantidad: number) => void;
}

/**
 * Equipos de un proyecto (KAN-24): reemplaza a la pantalla global de equipos. Lista los
 * equipos del proyecto, deja crear equipos a quien el proyecto autorice, y abre cada equipo
 * para ver sus miembros, invitar gente y cambiar roles. Todo equipo pertenece al proyecto.
 */
export default function EquiposDelProyecto({ proyecto, onCantidad }: EquiposDelProyectoProps) {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const proyectoId = proyecto.proyecto_id;

  const [equipos, setEquipos] = useState<EquipoDetallado[]>([]);
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const puedeCrear = puedeCrearEquipos(proyecto, uid);

  // Solo el líder de cada equipo lo edita y gestiona sus miembros
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

  // Modal crear / editar equipo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () => setIsModalOpen(false));

  // Equipo abierto (se refleja en la URL para que "atrás" regrese a la lista)
  const [equipoAbiertoId, setEquipoAbiertoId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState({ id_usuario: '', id_roles: [] as string[] });
  const [guardandoMiembro, setGuardandoMiembro] = useState(false);
  const [filtroUsuario, setFiltroUsuario] = useState('');

  useEffect(() => {
    const leerUrl = () => {
      setEquipoAbiertoId(leerNavegacion().equipoId);
      setMemberForm({ id_usuario: '', id_roles: [] });
      setFiltroUsuario('');
    };
    leerUrl();
    return suscribirNavegacion(leerUrl);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [usersData, rolesData, equiposData, vinculos, miembrosData] = await Promise.all([
        getAllUsers(),
        getRoles(),
        getEquipos(),
        getProyectoEquipos(),
        getMiembrosEquipo()
      ]);
      setUsuarios([...usersData].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))));
      setRoles(rolesData);

      // Equipos de este proyecto: los creados en él y los vinculados antes de que existiera esta vista
      const vinculados = new Set(vinculos.filter(v => v.id_proyecto === proyectoId).map(v => v.id_equipo));
      const delProyecto = equiposData.filter(e => e.id_proyecto === proyectoId || vinculados.has(e.equipo_id));

      const detallados: EquipoDetallado[] = delProyecto.map(eq => {
        const miembros = miembrosData
          .filter(m => m.id_equipo === eq.equipo_id && m.usuario)
          .map(m => {
            const rolesMiembro = m.roles ?? [];
            return { usuario: m.usuario!, roles: rolesMiembro, esLider: rolesMiembro.some(r => esRolLider(r.nombre_rol)) };
          })
          .sort((a, b) => Number(b.esLider) - Number(a.esLider) || nombreDe(a.usuario).localeCompare(nombreDe(b.usuario)));
        return { ...eq, miembros };
      });
      setEquipos(detallados.sort((a, b) => a.nombre.localeCompare(b.nombre)));
      onCantidad?.(detallados.length);
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudieron cargar los equipos'));
    } finally {
      setLoading(false);
    }
  }, [proyectoId, onCantidad]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const recargar = useCallback(async () => {
    await Promise.all([fetchData(), cargarLiderazgo()]);
  }, [fetchData, cargarLiderazgo]);

  // Al aceptar una invitación desde la campana, la lista se actualiza sola
  useEffect(() => {
    const alCambiar = () => void recargar();
    window.addEventListener(EVENTO_EQUIPOS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_EQUIPOS_CAMBIARON, alCambiar);
  }, [recargar]);

  const equipoAbierto = equipos.find(e => e.equipo_id === equipoAbiertoId) ?? null;

  const abrirEquipo = (team: EquipoDetallado) => {
    irA(proyectoId, 'equipos', team.equipo_id);
    window.scrollTo({ top: 0 });
  };
  const cerrarEquipo = () => irA(proyectoId, 'equipos');

  // Crear un equipo (editar se hace en la pantalla del equipo, junto con sus miembros)
  const openModal = () => {
    if (!puedeCrear) {
      toast.error('No tienes permiso para crear equipos en este proyecto');
      return;
    }
    setFormData({ nombre: '', descripcion: '' });
    setIsModalOpen(true);
  };

  // Guardar los datos de un equipo existente (nombre y descripción)
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const guardarDatosEquipo = async (team: EquipoDetallado, datos: { nombre: string; descripcion: string }) => {
    if (!puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede editarlo');
      return;
    }
    if (!datos.nombre.trim()) {
      toast.error('El nombre del equipo es obligatorio');
      return;
    }
    if (!datos.descripcion.trim()) {
      toast.error('La descripción del equipo es obligatoria');
      return;
    }
    setGuardandoDatos(true);
    try {
      await updateEquipo(team.equipo_id, { nombre: datos.nombre.trim(), descripcion: datos.descripcion.trim() });
      toast.success('Equipo actualizado');
      await recargar();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo guardar el equipo'));
    } finally {
      setGuardandoDatos(false);
    }
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

    setSaving(true);
    try {
      if (!uid) {
        toast.error('Debes iniciar sesión para crear un equipo');
        return;
      }
      // Quien lo crea queda como líder inicial para poder gestionarlo
      const rolLider = roles.find(r => esRolLider(r.nombre_rol));
      if (!rolLider) {
        toast.error('No está configurado el rol de líder; no se puede crear el equipo');
        return;
      }
      const nuevo = await createEquipoEnProyecto({
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        id_proyecto: proyectoId,
        id_creador: uid,
        id_rol_lider: rolLider.id
      });
      toast.success('Equipo creado. Eres su líder: agrega a sus miembros.');
      setIsModalOpen(false);
      await recargar();
      // Se abre el equipo para seguir con sus miembros
      irA(proyectoId, 'equipos', nuevo.equipo_id);
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo guardar el equipo'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTeam = async (team: EquipoDetallado) => {
    if (!puedeGestionarEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede eliminarlo');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Eliminar equipo?',
      mensaje: (
        <>
          Se eliminará <strong className="text-ink">{team.nombre}</strong> con sus miembros e invitaciones. Sus
          miembros podrían perder el permiso de editar este proyecto.
        </>
      ),
      textoConfirmar: 'Eliminar',
      peligro: true
    });
    if (!ok) return;
    try {
      await deleteEquipo(team.equipo_id);
      toast.success('Equipo eliminado');
      if (equipoAbiertoId === team.equipo_id) cerrarEquipo();
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo eliminar el equipo'));
    }
  };

  const miembrosActuales = () => equipoAbierto?.miembros ?? [];
  const esIdRolLider = (id: string) => esRolLider(roles.find(r => r.id === id)?.nombre_rol);

  // Un equipo con líder no puede quedarse sin ninguno: nadie podría gestionarlo
  const quedariaSinLider = (userId: string, nuevosIdRoles: string[]) => {
    const tieneLider = (ids: string[]) => ids.some(esIdRolLider);
    const miembros = miembrosActuales();
    const habiaLider = miembros.some(m => m.esLider);
    const quedaLider = miembros.some(m => tieneLider(m.usuario.id === userId ? nuevosIdRoles : m.roles.map(r => r.id)));
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
    const esMiembroExistente = miembrosActuales().some(m => m.usuario.id === memberForm.id_usuario);
    if (esMiembroExistente && quedariaSinLider(memberForm.id_usuario, memberForm.id_roles)) {
      toast.error('El equipo debe conservar al menos un líder');
      return;
    }

    setGuardandoMiembro(true);
    try {
      if (esMiembroExistente) {
        await actualizarRolesMiembro(equipoAbierto.equipo_id, memberForm.id_usuario, memberForm.id_roles);
        toast.success('Roles actualizados');
        await recargar();
      } else {
        // La membresía se crea cuando el usuario acepta la invitación
        await crearInvitacionEquipo(equipoAbierto.equipo_id, uid, memberForm.id_usuario, memberForm.id_roles);
        toast.success('Invitación enviada. El usuario se unirá cuando la acepte.');
      }
      setMemberForm({ id_usuario: '', id_roles: [] });
      setFiltroUsuario('');
    } catch (err) {
      console.error('Error al guardar miembro del equipo:', err);
      toast.error(mensajeError(err, esMiembroExistente ? 'No se pudieron actualizar los roles' : 'No se pudo enviar la invitación'));
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
      titulo: '¿Remover miembro?',
      mensaje: <><strong className="text-ink">{nombreDe(miembro.usuario)}</strong> dejará de ser miembro de {equipoAbierto.nombre}.</>,
      textoConfirmar: 'Remover',
      peligro: true
    });
    if (!ok) return;
    try {
      await removeMiembroEquipo(equipoAbierto.equipo_id, miembro.usuario.id);
      toast.success('Miembro removido');
      if (memberForm.id_usuario === miembro.usuario.id) setMemberForm({ id_usuario: '', id_roles: [] });
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo remover al miembro'));
    }
  };

  // Al elegir un usuario que ya es miembro, se precargan sus roles para editarlos
  const seleccionarUsuarioMiembro = (userId: string) => {
    const existente = miembrosActuales().find(m => m.usuario.id === userId);
    setMemberForm({ id_usuario: userId, id_roles: existente ? existente.roles.map(r => r.id) : [] });
  };

  const toggleRolMiembro = (rolId: string) => {
    setMemberForm(prev => ({
      ...prev,
      id_roles: prev.id_roles.includes(rolId) ? prev.id_roles.filter(id => id !== rolId) : [...prev.id_roles, rolId]
    }));
  };

  const esMiembro = (team: EquipoDetallado) => team.miembros.some(m => m.usuario.id === uid);

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
  // DETALLE DE UN EQUIPO
  // ==========================================
  if (equipoAbiertoId && (equipoAbierto || loading)) {
    if (!equipoAbierto) {
      return (
        <div role="status" aria-label="Cargando" className="space-y-4">
          <div className="h-8 w-72 max-w-full bg-sunken-strong rounded-ui animate-pulse" />
          <div className="h-40 bg-sunken rounded-ui animate-pulse" />
        </div>
      );
    }

    const puedeGestionar = puedeGestionarEquipo(equipoAbierto.equipo_id);
    const editandoMiembro = equipoAbierto.miembros.some(m => m.usuario.id === memberForm.id_usuario);
    const idsMiembros = new Set(equipoAbierto.miembros.map(m => m.usuario.id));

    return (
      <div className="space-y-6 animate-in fade-in">
        <div>
          <button
            onClick={cerrarEquipo}
            className="inline-flex items-center text-sm font-medium text-ink-subtle hover:text-ink transition-colors group cursor-pointer mb-4"
          >
            <ChevronLeft size={16} className="mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Equipos del proyecto
          </button>
          <h2 className="text-2xl font-semibold text-ink">{equipoAbierto.nombre}</h2>
          {!puedeGestionar && (
            <p className="text-base text-ink-muted mt-2 max-w-prose">{equipoAbierto.descripcion || 'Sin descripción.'}</p>
          )}
        </div>

        {/* Datos del equipo (solo líder): se editan aquí, junto con los miembros */}
        {puedeGestionar && (
          <FormularioDatosEquipo
            key={`${equipoAbierto.equipo_id}|${equipoAbierto.nombre}|${equipoAbierto.descripcion ?? ''}`}
            equipo={equipoAbierto}
            guardando={guardandoDatos}
            onGuardar={(datos) => guardarDatosEquipo(equipoAbierto, datos)}
            onEliminar={() => handleDeleteTeam(equipoAbierto)}
          />
        )}

        {/* Invitar miembros o cambiar roles (solo líder) */}
        {!puedeGestionar ? (
          <div className="bg-warning-subtle border border-warning-line rounded-ui p-4 flex items-center gap-2.5 text-sm text-warning">
            <Lock size={16} className="shrink-0" />
            <span>Solo los líderes de este equipo pueden invitar o remover miembros. Tienes acceso de lectura.</span>
          </div>
        ) : (
          <div className={`${tarjeta} p-5`}>
            <h3 className="text-base font-semibold text-ink mb-1 flex items-center gap-2">
              <UserPlus size={16} className="text-brand-text" />
              {editandoMiembro ? 'Editar roles del miembro' : 'Invitar a un usuario'}
            </h3>
            <p className="text-sm text-ink-subtle mb-4">
              {editandoMiembro
                ? 'Los cambios se aplican de inmediato.'
                : 'El usuario se unirá al equipo con estos roles cuando acepte la invitación.'}
            </p>
            <form onSubmit={handleGuardarMiembro} noValidate className="space-y-4">
              <div>
                <label htmlFor="miembro-usuario" className={etiqueta}>
                  Usuario <span className="text-danger">*</span>
                </label>
                {!editandoMiembro && usuarios.length > 8 && (
                  <input
                    type="search"
                    value={filtroUsuario}
                    onChange={(e) => setFiltroUsuario(e.target.value)}
                    placeholder="Filtrar por nombre o correo..."
                    aria-label="Filtrar usuarios por nombre o correo"
                    className={`${campo} mb-2`}
                  />
                )}
                <select
                  id="miembro-usuario"
                  value={memberForm.id_usuario}
                  onChange={(e) => seleccionarUsuarioMiembro(e.target.value)}
                  className={campo}
                >
                  <option value="">Seleccionar usuario...</option>
                  {usuarios
                    // Uno mismo solo aparece si ya es miembro del equipo (para editar sus roles)
                    .filter(u => u.id !== uid || idsMiembros.has(u.id))
                    // Los equipos de un proyecto se arman con los miembros del proyecto
                    .filter(u => idsMiembros.has(u.id) || !equipoAbierto.id_proyecto || esMiembroDelProyecto(proyecto, u.id))
                    .filter(u => {
                      const filtro = filtroUsuario.trim().toLowerCase();
                      return !filtro || u.id === memberForm.id_usuario || `${nombreDe(u)} ${u.correo}`.toLowerCase().includes(filtro);
                    })
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {nombreDe(u)} ({u.correo}){idsMiembros.has(u.id) ? ' · ya es miembro' : ''}
                      </option>
                    ))}
                </select>
                {equipoAbierto.id_proyecto && !editandoMiembro && (
                  <p className="text-xs text-ink-subtle mt-1.5">
                    Solo aparecen los miembros del proyecto. Para sumar a otra persona, agrégala antes en la pestaña Miembros.
                  </p>
                )}
              </div>

              <div>
                <span className={etiqueta}>Roles en el equipo</span>
                {roles.length === 0 ? (
                  <p className="text-sm text-ink-subtle">No hay roles disponibles</p>
                ) : (
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
                          {seleccionado ? <Check size={13} /> : esRolLider(r.nombre_rol) ? <Crown size={13} /> : null}
                          {r.nombre_rol}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                {memberForm.id_usuario && (
                  <button type="button" onClick={() => setMemberForm({ id_usuario: '', id_roles: [] })} className={btnSecundario}>
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={guardandoMiembro} className={btnPrimario}>
                  {editandoMiembro ? <Save size={16} /> : <Send size={16} />}
                  {guardandoMiembro ? 'Guardando...' : editandoMiembro ? 'Guardar roles' : 'Enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Integrantes */}
        <section>
          <h3 className="text-lg font-semibold text-ink mb-3">
            Integrantes
            <span className="ml-2 text-sm font-normal text-ink-subtle">{equipoAbierto.miembros.length}</span>
          </h3>
          <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
            {equipoAbierto.miembros.length === 0 ? (
              <li className="p-8 text-center text-sm text-ink-subtle">Este equipo aún no tiene miembros.</li>
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
                        <span className="absolute -top-1 -right-1 size-4 rounded-full bg-warning text-canvas flex items-center justify-center" title="Líder">
                          <Crown size={9} />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {m.usuario.nombre || 'Usuario'}
                        {m.usuario.id === uid && <span className="font-normal text-ink-subtle"> (tú)</span>}
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
                          <span key={r.id} className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-subtle text-brand-text border border-brand-line">
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
                          title="Editar roles"
                          aria-label={`Editar roles de ${nombreDe(m.usuario)}`}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(m)}
                          disabled={m.usuario.id === uid}
                          className={btnIconoPeligro}
                          title={m.usuario.id === uid ? 'No puedes removerte a ti mismo' : 'Remover miembro'}
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

        {modalEquipo}
      </div>
    );
  }

  // ==========================================
  // LISTA DE EQUIPOS DEL PROYECTO
  // ==========================================
  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-base text-ink-muted max-w-prose">
          Equipos que trabajan en este proyecto, con sus integrantes y roles.
        </p>
        {puedeCrear && (
          <button onClick={() => openModal()} className={`${btnPrimario} shrink-0`}>
            <Plus size={16} />
            Nuevo equipo
          </button>
        )}
      </div>

      {loading ? (
        <div role="status" aria-label="Cargando" className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {[1, 2].map(i => (
            <div key={i} className="h-28 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : equipos.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">Este proyecto todavía no tiene equipos</h3>
          <p className="text-base text-ink-muted mt-2 max-w-sm mx-auto">
            {puedeCrear
              ? 'Crea el primer equipo para organizar a quienes trabajan en el proyecto.'
              : 'Cuando se cree un equipo en este proyecto, aparecerá aquí.'}
          </p>
          {puedeCrear && (
            <div className="mt-6 flex justify-center">
              <button onClick={() => openModal()} className={btnPrimario}>
                <Plus size={16} />
                Crear equipo
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {equipos.map(team => {
            const gestionable = puedeGestionarEquipo(team.equipo_id);
            const lideres = team.miembros.filter(m => m.esLider);
            return (
              <li key={team.equipo_id}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => abrirEquipo(team)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) abrirEquipo(team);
                  }}
                  aria-label={`Ver miembros de ${team.nombre}`}
                  className="group flex items-center gap-4 px-5 py-5 cursor-pointer hover:bg-sunken focus-visible:bg-sunken"
                >
                  <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-ui bg-brand-solid text-on-solid">
                    <Users size={20} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="text-base font-semibold text-ink">{team.nombre}</h3>
                      {gestionable && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-subtle text-warning text-xs font-medium border border-warning-line">
                          <Crown size={12} aria-hidden />
                          Líder
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-ink-muted mt-1 line-clamp-1">{team.descripcion || 'Sin descripción.'}</p>
                    {lideres.length > 0 && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-ink-subtle min-w-0">
                        <Crown size={12} aria-hidden className="text-warning shrink-0" />
                        <span className="truncate">{lideres.map(l => nombreDe(l.usuario)).join(', ')}</span>
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
                      {team.miembros.length} {team.miembros.length === 1 ? 'integrante' : 'integrantes'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {gestionable ? (
                      <>
                        <button
                          onClick={() => handleDeleteTeam(team)}
                          title="Eliminar equipo"
                          aria-label={`Eliminar ${team.nombre}`}
                          className={btnIconoPeligro}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : !esMiembro(team) ? (
                      <span
                        title="Solo el líder del equipo puede editarlo"
                        className="inline-flex items-center gap-1 px-2 text-xs font-medium text-ink-subtle"
                      >
                        <Lock size={14} aria-hidden />
                        Solo lectura
                      </span>
                    ) : null}
                  </div>
                  <ChevronRight size={18} aria-hidden className="text-ink-muted group-hover:text-ink shrink-0" />
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
