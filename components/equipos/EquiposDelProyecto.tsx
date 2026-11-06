'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Users,
  Plus,
  ChevronRight,
  ChevronLeft,
  Save,
  Edit2,
  Trash2,
  Crown,
  UserPlus,
  Check,
  Lock,
  History,
  Link2,
  Unlink,
  RefreshCw,
  UserCheck,
  UserX,
  Globe,
  Layers,
} from 'lucide-react';
import type {
  Equipo,
  EstadoEquipoProyecto,
  EstadoMiembroProyecto,
  MiembroProyectoEquipo,
  PerfilUsuario,
  Proyecto,
  Rol,
  SolicitudProyectoEquipo,
} from '@/lib/database.types';
import {
  getEquipos,
  createEquipoEnProyecto,
  updateEquipo,
  deleteEquipo,
  getAllUsers,
  getRoles,
  getVinculosEquiposDeProyecto,
  getMiembrosEquipo,
  getMiembrosProyectoEquipo,
  asignarEquipoAProyecto,
  cambiarEstadoEquipoEnProyecto,
  crearSolicitudProyectoEquipo,
  getSolicitudesProyectoEquipoEnviadas,
  sincronizarPlantillaEquipoEnProyecto,
  agregarMiembroLocalProyectoEquipo,
  actualizarRolesMiembroLocal,
  cambiarEstadoMiembroLocal,
  getEquiposLideradosPor,
  esRolLider,
} from '@/lib/firestore-service';
import { useAuth } from '@/lib/firebase-auth-provider';
import { mensajeError } from '@/lib/errores';
import { esCreadorDelProyecto } from '@/lib/equipos-proyecto';
import {
  EVENTO_EQUIPOS_CAMBIARON,
  irA,
  leerNavegacion,
  suscribirNavegacion,
} from '@/lib/navegacion-proyecto';
import { useCierreSeguro } from '@/lib/use-cierre-seguro';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal, ModalBody, ModalFooter } from '@/components/ui/Modal';
import {
  btnPrimario,
  btnSecundario,
  btnSecundarioCompacto,
  btnIcono,
  btnIconoPeligro,
  campo,
  etiqueta,
  tarjeta,
} from '@/components/ui/estilos';
import ModalFormEquipo from '@/components/equipos/ModalFormEquipo';
import { HistorialMiembrosModal } from '@/components/equipos/HistorialMiembrosModal';
import BuscadorPersonas from '@/components/proyectos/BuscadorPersonas';

interface MiembroLocalDetallado {
  usuario: PerfilUsuario;
  roles: Rol[];
  esLider: boolean;
  estado: EstadoMiembroProyecto;
  esLocal: boolean;
}

interface EquipoEnProyectoDetallado extends Equipo {
  estadoEnProyecto: EstadoEquipoProyecto;
  miembros: MiembroLocalDetallado[];
}

const nombreDe = (u: PerfilUsuario) => u.nombre || u.correo;
const iniciales = (u: PerfilUsuario) => nombreDe(u).slice(0, 2).toUpperCase();

interface FormularioDatosEquipoProps {
  equipo: EquipoEnProyectoDetallado;
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
            onChange={e => setNombre(e.target.value)}
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
            onChange={e => setDescripcion(e.target.value)}
            className={campo}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onEliminar} className={btnSecundario}>
          <Trash2 size={16} />
          Eliminar equipo global
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
  /** Se avisa con la cantidad de equipos activos cada vez que se cargan (para el contador de la pestaña). */
  onCantidad?: (cantidad: number) => void;
}

export default function EquiposDelProyecto({ proyecto, onCantidad }: EquiposDelProyectoProps) {
  const confirmar = useConfirm();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const proyectoId = proyecto.proyecto_id;
  const esCreador = esCreadorDelProyecto(proyecto, uid);

  const [equipos, setEquipos] = useState<EquipoEnProyectoDetallado[]>([]);
  const [todosEquiposGlobales, setTodosEquiposGlobales] = useState<Equipo[]>([]);
  const [solicitudesEnviadas, setSolicitudesEnviadas] = useState<SolicitudProyectoEquipo[]>([]);
  const [usuarios, setUsuarios] = useState<PerfilUsuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarDesvinculados, setMostrarDesvinculados] = useState(false);

  const [equiposLiderados, setEquiposLiderados] = useState<string[]>([]);
  const cargarLiderazgo = useCallback(async () => {
    try {
      setEquiposLiderados(uid ? await getEquiposLideradosPor(uid, proyectoId) : []);
    } catch (err) {
      console.error('Error al cargar liderazgo de equipos:', err);
      setEquiposLiderados([]);
    }
  }, [uid, proyectoId]);

  useEffect(() => {
    void cargarLiderazgo();
  }, [cargarLiderazgo]);

  const esLiderEquipo = (equipoId: string) => equiposLiderados.includes(equipoId);
  const puedeGestionarLocalmente = (equipoId: string) => esLiderEquipo(equipoId) || esCreador;

  // Modal crear nuevo equipo global y vincularlo
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({ nombre: '', descripcion: '' });
  const [saving, setSaving] = useState(false);
  const { hayCambios, intentarCerrar } = useCierreSeguro(isModalOpen, formData, () =>
    setIsModalOpen(false)
  );

  // Modal vincular equipo global existente
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [equipoAVincularId, setEquipoAVincularId] = useState('');
  const [vinculando, setVinculando] = useState(false);

  // Equipo abierto e historial
  const [equipoAbiertoId, setEquipoAbiertoId] = useState<string | null>(null);
  const [historialOpen, setHistorialOpen] = useState(false);
  const [sincronizandoPlantilla, setSincronizandoPlantilla] = useState(false);
  const [mostrarMiembrosInactivos, setMostrarMiembrosInactivos] = useState(true);

  const [memberForm, setMemberForm] = useState({ id_usuario: '', id_roles: [] as string[] });
  const [guardandoMiembro, setGuardandoMiembro] = useState(false);
  const [guardandoDatos, setGuardandoDatos] = useState(false);

  useEffect(() => {
    const leerUrl = () => {
      setEquipoAbiertoId(leerNavegacion().equipoId);
      setMemberForm({ id_usuario: '', id_roles: [] });
    };
    leerUrl();
    return suscribirNavegacion(leerUrl);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [
        usersData,
        rolesData,
        equiposGlobales,
        vinculosProyecto,
        miembrosLocalesProyecto,
        miembrosGlobales,
        solEnviadas,
      ] = await Promise.all([
        getAllUsers(),
        getRoles(),
        getEquipos(),
        getVinculosEquiposDeProyecto(proyectoId, true),
        getMiembrosProyectoEquipo(proyectoId, undefined, true),
        getMiembrosEquipo(),
        uid ? getSolicitudesProyectoEquipoEnviadas(uid, proyectoId) : Promise.resolve([]),
      ]);

      setUsuarios([...usersData].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))));
      setRoles(rolesData);
      setTodosEquiposGlobales(equiposGlobales);
      setSolicitudesEnviadas(solEnviadas);

      // Agrupar miembros locales por equipo
      const localesPorEquipo = new Map<string, MiembroProyectoEquipo[]>();
      for (const m of miembrosLocalesProyecto) {
        const lista = localesPorEquipo.get(m.id_equipo) ?? [];
        lista.push(m);
        localesPorEquipo.set(m.id_equipo, lista);
      }

      // Agrupar miembros globales por equipo (respaldo si aún no se ha clonado la plantilla)
      const globalesPorEquipo = new Map<string, typeof miembrosGlobales>();
      for (const m of miembrosGlobales) {
        const lista = globalesPorEquipo.get(m.id_equipo) ?? [];
        lista.push(m);
        globalesPorEquipo.set(m.id_equipo, lista);
      }

      const vinculosMap = new Map<string, EstadoEquipoProyecto>();
      for (const v of vinculosProyecto) {
        vinculosMap.set(v.id_equipo, v.estado ?? 'activo');
      }
      // Soporte legacy para equipos con `id_proyecto === proyectoId` sin documento en `proyecto_equipos`
      for (const eq of equiposGlobales) {
        if (eq.id_proyecto === proyectoId && !vinculosMap.has(eq.equipo_id)) {
          vinculosMap.set(eq.equipo_id, 'activo');
        }
      }

      const detallados: EquipoEnProyectoDetallado[] = equiposGlobales
        .filter(eq => vinculosMap.has(eq.equipo_id))
        .map(eq => {
          const estadoEnProyecto = vinculosMap.get(eq.equipo_id) ?? 'activo';
          const locales = localesPorEquipo.get(eq.equipo_id) ?? [];

          let miembros: MiembroLocalDetallado[];
          if (locales.length > 0) {
            miembros = locales
              .filter(m => Boolean(m.usuario))
              .map(m => {
                const rolesMiembro = m.roles ?? [];
                return {
                  usuario: m.usuario!,
                  roles: rolesMiembro,
                  esLider: rolesMiembro.some(r => esRolLider(r.nombre_rol)),
                  estado: m.estado ?? 'activo',
                  esLocal: Boolean(m.es_local),
                };
              });
          } else {
            const plantilla = globalesPorEquipo.get(eq.equipo_id) ?? [];
            miembros = plantilla
              .filter(m => Boolean(m.usuario))
              .map(m => {
                const rolesMiembro = m.roles ?? [];
                return {
                  usuario: m.usuario!,
                  roles: rolesMiembro,
                  esLider: rolesMiembro.some(r => esRolLider(r.nombre_rol)),
                  estado: 'activo' as EstadoMiembroProyecto,
                  esLocal: false,
                };
              });
          }

          miembros.sort(
            (a, b) =>
              Number(a.estado === 'inactivo') - Number(b.estado === 'inactivo') ||
              Number(b.esLider) - Number(a.esLider) ||
              nombreDe(a.usuario).localeCompare(nombreDe(b.usuario))
          );

          return {
            ...eq,
            estadoEnProyecto,
            miembros,
          };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre));

      setEquipos(detallados);
      const cantidadActivos = detallados.filter(e => e.estadoEnProyecto === 'activo').length;
      onCantidad?.(cantidadActivos);
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudieron cargar los equipos del proyecto'));
    } finally {
      setLoading(false);
    }
  }, [proyectoId, uid, onCantidad]);

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

  const abrirEquipo = (team: EquipoEnProyectoDetallado) => {
    irA(proyectoId, 'equipos', team.equipo_id);
    window.scrollTo({ top: 0 });
  };
  const cerrarEquipo = () => irA(proyectoId, 'equipos');

  const openCreateModal = () => {
    if (!esCreador) {
      toast.error('Solo el creador del proyecto puede crear o vincular equipos');
      return;
    }
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
      toast.error('No está configurado el rol de líder; no se puede crear el equipo');
      return;
    }

    setSaving(true);
    try {
      const nuevo = await createEquipoEnProyecto({
        nombre: formData.nombre.trim(),
        descripcion: formData.descripcion.trim(),
        id_proyecto: proyectoId,
        id_creador: uid,
        id_rol_lider: rolLider.id,
      });
      toast.success('Equipo global creado y vinculado al proyecto.');
      setIsModalOpen(false);
      await recargar();
      irA(proyectoId, 'equipos', nuevo.equipo_id);
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo crear el equipo'));
    } finally {
      setSaving(false);
    }
  };

  // Vincular equipo global existente
  const handleVincularEquipoExistente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !equipoAVincularId) {
      toast.error('Selecciona un equipo para vincular');
      return;
    }
    setVinculando(true);
    try {
      if (esLiderEquipo(equipoAVincularId)) {
        // Asignación directa porque el creador del proyecto también es líder del equipo
        await asignarEquipoAProyecto(proyectoId, equipoAVincularId, uid);
        toast.success('Equipo asignado al proyecto y plantilla de miembros sincronizada');
      } else {
        // Enviar solicitud al líder del equipo
        await crearSolicitudProyectoEquipo(proyectoId, equipoAVincularId, uid, 'vincular');
        toast.success('Solicitud de vinculación enviada al líder del equipo');
      }
      setIsLinkModalOpen(false);
      setEquipoAVincularId('');
      await recargar();
    } catch (err) {
      console.error(err);
      toast.error(mensajeError(err, 'No se pudo vincular el equipo'));
    } finally {
      setVinculando(false);
    }
  };

  // Cambiar estado del equipo en el proyecto ('activo' | 'desvinculado')
  const handleToggleEstadoEquipo = async (team: EquipoEnProyectoDetallado) => {
    if (!uid) return;
    const nuevoEstado: EstadoEquipoProyecto =
      team.estadoEnProyecto === 'activo' ? 'desvinculado' : 'activo';

    if (nuevoEstado === 'desvinculado') {
      const ok = await confirmar({
        titulo: '¿Desvincular equipo del proyecto?',
        mensaje: (
          <>
            El equipo <strong className="text-ink">{team.nombre}</strong> pasará a estado{' '}
            <strong className="text-ink">Desvinculado</strong> en este proyecto. Se conservará el
            historial local de sus miembros por si deseas reactivarlo después.
          </>
        ),
        textoConfirmar: 'Desvincular',
        peligro: true,
      });
      if (!ok) return;
    }

    try {
      if (esCreador && esLiderEquipo(team.equipo_id)) {
        await cambiarEstadoEquipoEnProyecto(proyectoId, team.equipo_id, nuevoEstado, uid);
        toast.success(
          nuevoEstado === 'activo'
            ? 'Equipo reactivado en el proyecto'
            : 'Equipo desvinculado del proyecto'
        );
      } else if (esCreador || esLiderEquipo(team.equipo_id)) {
        // Si es creador o líder (según firestore.rules, update en proyecto_equipos permite creador o líder)
        await cambiarEstadoEquipoEnProyecto(proyectoId, team.equipo_id, nuevoEstado, uid);
        toast.success(
          nuevoEstado === 'activo'
            ? 'Equipo reactivado en el proyecto'
            : 'Equipo desvinculado del proyecto'
        );
      } else {
        toast.error('Solo el creador del proyecto o el líder del equipo pueden cambiar su estado');
        return;
      }
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo cambiar el estado del equipo en el proyecto'));
    }
  };

  const guardarDatosEquipo = async (
    team: EquipoEnProyectoDetallado,
    datos: { nombre: string; descripcion: string }
  ) => {
    if (!esLiderEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede editar sus datos globales');
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

  const handleDeleteTeam = async (team: EquipoEnProyectoDetallado) => {
    if (!esLiderEquipo(team.equipo_id)) {
      toast.error('Solo el líder del equipo puede eliminarlo');
      return;
    }
    const ok = await confirmar({
      titulo: '¿Eliminar equipo global?',
      mensaje: (
        <>
          Se eliminará <strong className="text-ink">{team.nombre}</strong> de manera global con sus
          miembros e invitaciones. Si solo deseas retirarlo de este proyecto, usa el botón{' '}
          <strong className="text-ink">Desvincular del proyecto</strong>.
        </>
      ),
      textoConfirmar: 'Eliminar globalmente',
      peligro: true,
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

  const handleSincronizarPlantilla = async () => {
    if (!equipoAbierto || !uid) return;
    setSincronizandoPlantilla(true);
    try {
      await sincronizarPlantillaEquipoEnProyecto(
        proyectoId,
        equipoAbierto.equipo_id,
        uid,
        true
      );
      toast.success('Plantilla global sincronizada con este proyecto');
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo sincronizar la plantilla'));
    } finally {
      setSincronizandoPlantilla(false);
    }
  };

  const miembrosActuales = () => equipoAbierto?.miembros ?? [];
  const esIdRolLider = (id: string) => esRolLider(roles.find(r => r.id === id)?.nombre_rol);

  const quedariaSinLiderActivo = (userId: string, nuevosIdRoles: string[]) => {
    const tieneLider = (ids: string[]) => ids.some(esIdRolLider);
    const activos = miembrosActuales().filter(m => m.estado === 'activo');
    const habiaLider = activos.some(m => m.esLider);
    const quedaLider = activos.some(m =>
      tieneLider(m.usuario.id === userId ? nuevosIdRoles : m.roles.map(r => r.id))
    );
    return habiaLider && !quedaLider;
  };

  const handleGuardarMiembroLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipoAbierto || !uid) return;
    if (!memberForm.id_usuario) {
      toast.error('Selecciona un usuario');
      return;
    }
    if (!puedeGestionarLocalmente(equipoAbierto.equipo_id)) {
      toast.error(
        'Solo el líder del equipo o el creador del proyecto pueden gestionar miembros locales'
      );
      return;
    }

    const miembroExistente = miembrosActuales().find(
      m => m.usuario.id === memberForm.id_usuario
    );
    if (
      miembroExistente &&
      miembroExistente.estado === 'activo' &&
      quedariaSinLiderActivo(memberForm.id_usuario, memberForm.id_roles)
    ) {
      toast.error('El equipo debe conservar al menos un líder activo en este proyecto');
      return;
    }

    setGuardandoMiembro(true);
    try {
      if (miembroExistente && miembroExistente.estado === 'activo') {
        await actualizarRolesMiembroLocal({
          id_proyecto: proyectoId,
          id_equipo: equipoAbierto.equipo_id,
          id_usuario: memberForm.id_usuario,
          id_roles: memberForm.id_roles,
          id_autor: uid,
        });
        toast.success('Roles locales actualizados para este proyecto');
      } else {
        await agregarMiembroLocalProyectoEquipo({
          id_proyecto: proyectoId,
          id_equipo: equipoAbierto.equipo_id,
          id_usuario: memberForm.id_usuario,
          id_roles: memberForm.id_roles,
          id_autor: uid,
        });
        toast.success(
          miembroExistente
            ? 'Integrante reactivado en este proyecto'
            : 'Integrante agregado localmente a este proyecto'
        );
      }
      setMemberForm({ id_usuario: '', id_roles: [] });
      await recargar();
    } catch (err) {
      console.error('Error al guardar miembro local:', err);
      toast.error(mensajeError(err, 'No se pudo guardar el integrante en el proyecto'));
    } finally {
      setGuardandoMiembro(false);
    }
  };

  const handleToggleEstadoMiembroLocal = async (miembro: MiembroLocalDetallado) => {
    if (!equipoAbierto || !uid) return;
    if (!puedeGestionarLocalmente(equipoAbierto.equipo_id)) {
      toast.error('No tienes permiso para cambiar el estado de los miembros');
      return;
    }
    const nuevoEstado: EstadoMiembroProyecto =
      miembro.estado === 'activo' ? 'inactivo' : 'activo';

    if (nuevoEstado === 'inactivo') {
      const ok = await confirmar({
        titulo: '¿Desactivar miembro en este proyecto?',
        mensaje: (
          <>
            <strong className="text-ink">{nombreDe(miembro.usuario)}</strong> pasará a estado{' '}
            <strong className="text-ink">Inactivo</strong> dentro de este proyecto, sin afectar su
            participación en otros proyectos ni en la plantilla global del equipo.
          </>
        ),
        textoConfirmar: 'Desactivar en el proyecto',
        peligro: true,
      });
      if (!ok) return;
    }

    try {
      await cambiarEstadoMiembroLocal({
        id_proyecto: proyectoId,
        id_equipo: equipoAbierto.equipo_id,
        id_usuario: miembro.usuario.id,
        estado: nuevoEstado,
        id_autor: uid,
      });
      toast.success(
        nuevoEstado === 'activo'
          ? 'Integrante reactivado en el proyecto'
          : 'Integrante desactivado en el proyecto'
      );
      await recargar();
    } catch (err) {
      toast.error(mensajeError(err, 'No se pudo cambiar el estado del miembro'));
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

  const esMiembroActivo = (team: EquipoEnProyectoDetallado) =>
    team.miembros.some(m => m.usuario.id === uid && m.estado === 'activo');

  // Equipos globales disponibles para vincular (que no estén ya activos en este proyecto)
  const idsActivosEnProyecto = new Set(
    equipos.filter(e => e.estadoEnProyecto === 'activo').map(e => e.equipo_id)
  );
  const idsConSolicitudPendiente = new Set(solicitudesEnviadas.map(s => s.id_equipo));
  const equiposDisponiblesParaVincular = todosEquiposGlobales.filter(
    eq => !idsActivosEnProyecto.has(eq.equipo_id)
  );

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

  const modalVincularExistente = (
    <Modal
      open={isLinkModalOpen}
      onClose={() => setIsLinkModalOpen(false)}
      title="Vincular equipo global al proyecto"
      description="Selecciona un equipo existente. Si eres su líder se asignará de inmediato; de lo contrario, se enviará una solicitud a su líder."
    >
      <form onSubmit={handleVincularEquipoExistente} noValidate className="flex flex-col flex-1 min-h-0">
        <ModalBody className="space-y-4">
          {equiposDisponiblesParaVincular.length === 0 ? (
            <p className="text-sm text-ink-subtle py-4 text-center">
              Todos los equipos globales registrados ya están vinculados y activos en este proyecto.
            </p>
          ) : (
            <div>
              <label htmlFor="select-equipo-vincular" className={etiqueta}>
                Equipo global <span className="text-danger">*</span>
              </label>
              <select
                id="select-equipo-vincular"
                value={equipoAVincularId}
                onChange={e => setEquipoAVincularId(e.target.value)}
                className={campo}
              >
                <option value="">Selecciona un equipo...</option>
                {equiposDisponiblesParaVincular.map(eq => {
                  const soyLider = esLiderEquipo(eq.equipo_id);
                  const pendiente = idsConSolicitudPendiente.has(eq.equipo_id);
                  return (
                    <option key={eq.equipo_id} value={eq.equipo_id} disabled={pendiente}>
                      {eq.nombre}{' '}
                      {pendiente
                        ? '(Solicitud pendiente)'
                        : soyLider
                          ? '(Asignación directa — Eres líder)'
                          : '(Requiere aprobación de su líder)'}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            onClick={() => setIsLinkModalOpen(false)}
            className={btnSecundario}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={vinculando || !equipoAVincularId}
            className={btnPrimario}
          >
            <Link2 size={15} />
            {vinculando
              ? 'Procesando...'
              : equipoAVincularId && esLiderEquipo(equipoAVincularId)
                ? 'Asignar al proyecto'
                : 'Enviar solicitud'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );

  // ==========================================
  // DETALLE DE UN EQUIPO EN EL PROYECTO
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

    const puedeGestionarLocal = puedeGestionarLocalmente(equipoAbierto.equipo_id);
    const puedeEditarGlobal = esLiderEquipo(equipoAbierto.equipo_id);
    const miembroSeleccionado = equipoAbierto.miembros.find(
      m => m.usuario.id === memberForm.id_usuario
    );
    const editandoMiembroActivo = Boolean(
      miembroSeleccionado && miembroSeleccionado.estado === 'activo'
    );

    const miembrosVisibles = mostrarMiembrosInactivos
      ? equipoAbierto.miembros
      : equipoAbierto.miembros.filter(m => m.estado === 'activo');

    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <button
              onClick={cerrarEquipo}
              className="inline-flex items-center text-sm font-medium text-ink-subtle hover:text-ink transition-colors group cursor-pointer mb-3"
            >
              <ChevronLeft
                size={16}
                className="mr-1 group-hover:-translate-x-0.5 transition-transform"
              />
              Equipos del proyecto
            </button>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-semibold text-ink">{equipoAbierto.nombre}</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  equipoAbierto.estadoEnProyecto === 'activo'
                    ? 'bg-success-subtle text-success border-success-line'
                    : 'bg-warning-subtle text-warning border-warning-line'
                }`}
              >
                {equipoAbierto.estadoEnProyecto === 'activo'
                  ? 'Activo en este proyecto'
                  : 'Desvinculado del proyecto'}
              </span>
            </div>
            {!puedeEditarGlobal && (
              <p className="text-base text-ink-muted mt-1 max-w-prose">
                {equipoAbierto.descripcion || 'Sin descripción.'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHistorialOpen(true)}
              className={btnSecundario}
            >
              <History size={16} />
              Historial de miembros
            </button>
            {puedeGestionarLocal && (
              <button
                type="button"
                disabled={sincronizandoPlantilla}
                onClick={handleSincronizarPlantilla}
                title="Trae nuevos integrantes desde la plantilla global del equipo sin sobrescribir cambios locales"
                className={btnSecundario}
              >
                <RefreshCw
                  size={16}
                  className={sincronizandoPlantilla ? 'animate-spin' : ''}
                />
                Sincronizar plantilla
              </button>
            )}
            {(esCreador || puedeEditarGlobal) && (
              <button
                type="button"
                onClick={() => handleToggleEstadoEquipo(equipoAbierto)}
                className={btnSecundario}
              >
                {equipoAbierto.estadoEnProyecto === 'activo' ? (
                  <>
                    <Unlink size={16} />
                    Desvincular del proyecto
                  </>
                ) : (
                  <>
                    <Link2 size={16} />
                    Reactivar en el proyecto
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Datos globales del equipo (solo líder global) */}
        {puedeEditarGlobal && (
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

        {/* Formulario para agregar miembro local o editar roles locales */}
        {!puedeGestionarLocal ? (
          <div className="bg-warning-subtle border border-warning-line rounded-ui p-4 flex items-center gap-2.5 text-sm text-warning">
            <Lock size={16} className="shrink-0" />
            <span>
              Solo los líderes de este equipo o el creador del proyecto pueden modificar sus
              integrantes locales.
            </span>
          </div>
        ) : (
          <div className={`${tarjeta} p-5`}>
            <h3 className="text-base font-semibold text-ink mb-1 flex items-center gap-2">
              <UserPlus size={16} className="text-brand-text" />
              {editandoMiembroActivo
                ? 'Editar roles locales en este proyecto'
                : miembroSeleccionado
                  ? 'Reactivar integrante en este proyecto'
                  : 'Agregar miembro local al equipo en este proyecto'}
            </h3>
            <p className="text-sm text-ink-subtle mb-4">
              {editandoMiembroActivo
                ? 'Los cambios de rol aplican únicamente dentro de este proyecto, sin modificar la plantilla global del equipo.'
                : 'Agrega un integrante exclusivo para este proyecto o selecciona uno existente para ajustar sus roles locales.'}
            </p>
            <form onSubmit={handleGuardarMiembroLocal} noValidate className="space-y-4">
              <BuscadorPersonas
                id="miembro-local-usuario"
                titulo="Usuario *"
                multiple={false}
                valor={memberForm.id_usuario ? [memberForm.id_usuario] : []}
                onChange={ids => seleccionarUsuarioMiembro(ids[0] ?? '')}
                candidatos={usuarios}
                ayuda={
                  editandoMiembroActivo
                    ? 'Editando los roles locales de este integrante en el proyecto.'
                    : 'Escribe al menos 2 letras del nombre o correo de la persona.'
                }
              />

              <div>
                <span className={etiqueta}>Roles locales en este proyecto</span>
                {roles.length === 0 ? (
                  <p className="text-sm text-ink-subtle">No hay roles disponibles</p>
                ) : (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Roles en el proyecto">
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
                )}
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
                  <Save size={16} />
                  {guardandoMiembro
                    ? 'Guardando...'
                    : editandoMiembroActivo
                      ? 'Guardar roles locales'
                      : miembroSeleccionado
                        ? 'Reactivar integrante'
                        : 'Agregar al proyecto'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista de integrantes locales del equipo en este proyecto */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h3 className="text-lg font-semibold text-ink">
              Integrantes en este proyecto
              <span className="ml-2 text-sm font-normal text-ink-subtle">
                {miembrosVisibles.length}
              </span>
            </h3>
            {equipoAbierto.miembros.some(m => m.estado === 'inactivo') && (
              <button
                type="button"
                onClick={() => setMostrarMiembrosInactivos(prev => !prev)}
                className={btnSecundarioCompacto}
              >
                {mostrarMiembrosInactivos ? 'Ocultar inactivos' : 'Mostrar inactivos'}
              </button>
            )}
          </div>

          <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
            {miembrosVisibles.length === 0 ? (
              <li className="p-8 text-center text-sm text-ink-subtle">
                Este equipo no tiene integrantes activos en el proyecto.
              </li>
            ) : (
              miembrosVisibles.map(m => {
                const inactivo = m.estado === 'inactivo';
                return (
                  <li
                    key={m.usuario.id}
                    className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      memberForm.id_usuario === m.usuario.id
                        ? 'bg-brand-subtle'
                        : inactivo
                          ? 'bg-sunken opacity-75'
                          : 'hover:bg-sunken'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative size-9 shrink-0 rounded-full bg-brand-subtle text-brand-text flex items-center justify-center text-xs font-bold">
                        {iniciales(m.usuario)}
                        {m.esLider && !inactivo && (
                          <span
                            className="absolute -top-1 -right-1 size-4 rounded-full bg-warning text-canvas flex items-center justify-center"
                            title="Líder"
                          >
                            <Crown size={9} />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink truncate">
                            {m.usuario.nombre || 'Usuario'}
                            {m.usuario.id === uid && (
                              <span className="font-normal text-ink-subtle"> (tú)</span>
                            )}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                              m.esLocal
                                ? 'bg-brand-subtle text-brand-text border-brand-line'
                                : 'bg-sunken text-ink-subtle border-line'
                            }`}
                          >
                            {m.esLocal ? (
                              <>
                                <Layers size={10} aria-hidden />
                                Local del proyecto
                              </>
                            ) : (
                              <>
                                <Globe size={10} aria-hidden />
                                Plantilla global
                              </>
                            )}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              inactivo
                                ? 'bg-danger-subtle text-danger border-danger-line'
                                : 'bg-success-subtle text-success border-success-line'
                            }`}
                          >
                            {inactivo ? 'Inactivo en proyecto' : 'Activo'}
                          </span>
                        </div>
                        <p className="text-xs text-ink-subtle truncate mt-0.5">
                          {m.usuario.correo}
                        </p>
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
                      {puedeGestionarLocal && (
                        <div className="flex items-center shrink-0">
                          {!inactivo && (
                            <button
                              onClick={() => {
                                seleccionarUsuarioMiembro(m.usuario.id);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={btnIcono}
                              title="Editar roles locales en este proyecto"
                              aria-label={`Editar roles locales de ${nombreDe(m.usuario)}`}
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleEstadoMiembroLocal(m)}
                            className={inactivo ? btnIcono : btnIconoPeligro}
                            title={
                              inactivo
                                ? 'Reactivar integrante en este proyecto'
                                : 'Desactivar integrante en este proyecto'
                            }
                            aria-label={
                              inactivo
                                ? `Reactivar a ${nombreDe(m.usuario)}`
                                : `Desactivar a ${nombreDe(m.usuario)}`
                            }
                          >
                            {inactivo ? <UserCheck size={16} /> : <UserX size={16} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <HistorialMiembrosModal
          open={historialOpen}
          onClose={() => setHistorialOpen(false)}
          equipoId={equipoAbierto.equipo_id}
          equipoNombre={equipoAbierto.nombre}
          proyectoId={proyectoId}
          proyectoNombre={proyecto.nombre}
        />

        {modalEquipo}
        {modalVincularExistente}
      </div>
    );
  }

  // ==========================================
  // LISTA DE EQUIPOS DEL PROYECTO
  // ==========================================
  const hayDesvinculados = equipos.some(e => e.estadoEnProyecto === 'desvinculado');
  const equiposMostrados = mostrarDesvinculados
    ? equipos
    : equipos.filter(e => e.estadoEnProyecto === 'activo');

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-base text-ink-muted max-w-prose">
          Equipos globales asignados a este proyecto, con sus integrantes locales, roles y estado.
        </p>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hayDesvinculados && (
            <button
              type="button"
              onClick={() => setMostrarDesvinculados(prev => !prev)}
              className={btnSecundario}
            >
              {mostrarDesvinculados ? 'Ocultar desvinculados' : 'Ver desvinculados'}
            </button>
          )}
          {esCreador && (
            <>
              <button
                type="button"
                onClick={() => {
                  setEquipoAVincularId('');
                  setIsLinkModalOpen(true);
                }}
                className={btnSecundario}
              >
                <Link2 size={16} />
                Vincular equipo existente
              </button>
              <button onClick={openCreateModal} className={btnPrimario}>
                <Plus size={16} />
                Nuevo equipo
              </button>
            </>
          )}
        </div>
      </div>

      {solicitudesEnviadas.length > 0 && (
        <div className="p-4 rounded-ui bg-sunken border border-line text-xs text-ink-muted flex flex-wrap items-center justify-between gap-2">
          <span>
            Solicitudes pendientes de respuesta por líderes de equipo:{' '}
            <strong className="text-ink">
              {solicitudesEnviadas.map(s => s.nombre_equipo).join(', ')}
            </strong>
          </span>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          aria-label="Cargando"
          className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden"
        >
          {[1, 2].map(i => (
            <div key={i} className="h-28 bg-sunken animate-pulse" />
          ))}
        </div>
      ) : equiposMostrados.length === 0 ? (
        <div className="text-center py-20">
          <h3 className="text-lg font-semibold text-ink">
            Este proyecto todavía no tiene equipos activos
          </h3>
          <p className="text-base text-ink-muted mt-2 max-w-md mx-auto">
            {esCreador
              ? 'Vincula un equipo global existente o crea uno nuevo para organizar a los integrantes del proyecto.'
              : 'Cuando el creador del proyecto asigne un equipo, aparecerá aquí.'}
          </p>
          {esCreador && (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEquipoAVincularId('');
                  setIsLinkModalOpen(true);
                }}
                className={btnSecundario}
              >
                <Link2 size={16} />
                Vincular equipo existente
              </button>
              <button onClick={openCreateModal} className={btnPrimario}>
                <Plus size={16} />
                Crear nuevo equipo
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="bg-surface border border-line rounded-ui divide-y divide-line overflow-hidden">
          {equiposMostrados.map(team => {
            const gestionable = puedeGestionarLocalmente(team.equipo_id);
            const miembrosActivos = team.miembros.filter(m => m.estado === 'activo');
            const lideres = miembrosActivos.filter(m => m.esLider);
            const desvinculado = team.estadoEnProyecto === 'desvinculado';

            return (
              <li key={team.equipo_id}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => abrirEquipo(team)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) abrirEquipo(team);
                  }}
                  aria-label={`Ver miembros locales de ${team.nombre}`}
                  className={`group flex items-center gap-4 px-5 py-5 cursor-pointer hover:bg-sunken focus-visible:bg-sunken ${
                    desvinculado ? 'opacity-70' : ''
                  }`}
                >
                  <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-ui bg-brand-solid text-on-solid">
                    <Users size={20} aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h3 className="text-base font-semibold text-ink">{team.nombre}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          desvinculado
                            ? 'bg-warning-subtle text-warning border-warning-line'
                            : 'bg-success-subtle text-success border-success-line'
                        }`}
                      >
                        {desvinculado ? 'Desvinculado' : 'Activo'}
                      </span>
                      {esLiderEquipo(team.equipo_id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-subtle text-warning text-xs font-medium border border-warning-line">
                          <Crown size={12} aria-hidden />
                          Líder
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
                      {miembrosActivos.slice(0, 4).map(m => (
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
                      {miembrosActivos.length}{' '}
                      {miembrosActivos.length === 1 ? 'activo' : 'activos'}
                    </span>
                  </div>

                  {!gestionable && !esMiembroActivo(team) && (
                    <span
                      title="Solo el líder del equipo o el creador del proyecto pueden editarlo"
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
      {modalVincularExistente}
    </div>
  );
}
