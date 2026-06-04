'use client';

import React, { use, useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  Users, Plus, Edit2, Trash2, ChevronLeft, Search, 
  UserPlus, Shield, User, Crown, X, Save, History, 
  Check, Info, AlertTriangle, Eye, Clock, Diff, ArrowRight, Trash
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Team = {
  id: number;
  groupId: number;
  name: string;
  description?: string;
}

type Member = {
  id: number;
  teamId: number;
  name: string;
  role: string;
}

type LeaderHistory = {
  id: number;
  teamId: number;
  memberId: number;
  is_current: boolean;
}

export default function GruposPage({ searchParams }: { searchParams: Promise<{ groupId?: string }> }) {
  const params = use(searchParams);
  const router = useRouter();
  const groupId = params.groupId ? Number(params.groupId) : null;
  
  const [teams, setTeams] = useState<Array<Team>>([]);
  const [members, setMembers] = useState<Array<Member>>([]);
  const [leaders, setLeaders] = useState<Array<LeaderHistory>>([]);
  const [memberLogs, setMemberLogs] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);

  // Team Modal State
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isTeamDeleteModalOpen, setIsTeamDeleteModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [teamFormData, setTeamFormData] = useState({ name: '', description: '' });

  // Member Modal State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [activeTeamForMember, setActiveTeamForMember] = useState<number | null>(null);
  const [memberFormData, setMemberFormData] = useState({
    name: '',
    role: 'Miembro',
    madeById: '',
    leaderId: '',
    overwriteLeader: false
  });

  // Member Delete Modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteMember, setPendingDeleteMember] = useState<Member | null>(null);

  // History / Diff Modal
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<any>(null);
  const [showHistoryForTeam, setShowHistoryForTeam] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    
    const { data: teamsData } = await supabase
      .from('equipos')
      .select('*')
      .eq('groupId', groupId);
    
    setTeams(teamsData || []);
    const teamIds = (teamsData || []).map(t => t.id);

    if (teamIds.length > 0) {
      const { data: membersData } = await supabase
        .from('integrantes')
        .select('*')
        .in('teamId', teamIds);
      setMembers(membersData || []);

      const { data: leadersData } = await supabase
        .from('lideres_historial')
        .select('*')
        .in('teamId', teamIds)
        .eq('is_current', true);
      setLeaders(leadersData || []);

      const { data: logsData } = await supabase
        .from('logs_integrantes')
        .select(`
          *,
          made_by:integrantes!made_by_id(name),
          leader:integrantes!leader_at_time_id(name)
        `)
        .in('teamId', teamIds)
        .order('timestamp', { ascending: false });
      setMemberLogs(logsData || []);
    }
    setLoading(false);
  }, [groupId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openTeamModal = (team: Team) => {
    setEditingTeam(team);
    setTeamFormData({ name: team.name, description: team.description || '' });
    setIsTeamModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam) return;

    const { error } = await supabase
      .from('equipos')
      .update({ name: teamFormData.name, description: teamFormData.description })
      .eq('id', editingTeam.id);

    if (error) toast.error("Error al actualizar");
    else {
      toast.success("Equipo actualizado");
      setIsTeamModalOpen(false);
      fetchData();
    }
  };

  const handleDeleteTeam = async () => {
    if (deleteConfirmText !== 'BORRAR' || !teamToDelete) return;

    const { error } = await supabase
      .from('equipos')
      .delete()
      .eq('id', teamToDelete.id);

    if (error) {
      toast.error("Error al eliminar equipo. Verifica que no tenga registros vinculados.");
    } else {
      toast.success("Equipo eliminado permanentemente");
      setIsTeamDeleteModalOpen(false);
      setTeamToDelete(null);
      setDeleteConfirmText("");
      fetchData();
    }
  };

  const getTeamLeader = (teamId: number) => {
    const leaderEntry = leaders.find(l => l.teamId === teamId);
    if (!leaderEntry) return null;
    return members.find(m => m.id === leaderEntry.memberId);
  };

  const openMemberModal = (teamId: number, member: Member | null = null) => {
    setActiveTeamForMember(teamId);
    const leader = getTeamLeader(teamId);
    
    if (member) {
      setEditingMember(member);
      setMemberFormData({
        name: member.name,
        role: member.role,
        madeById: '',
        leaderId: leader?.id.toString() || '',
        overwriteLeader: false
      });
    } else {
      setEditingMember(null);
      setMemberFormData({
        name: '',
        role: 'Miembro',
        madeById: '',
        leaderId: leader?.id.toString() || '',
        overwriteLeader: false
      });
    }
    setIsMemberModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const teamHasMembers = members.some(m => m.teamId === activeTeamForMember);
    
    // Validate: if the team ALREADY has members, you MUST select who is doing the change
    if (teamHasMembers && (!memberFormData.madeById || !memberFormData.leaderId)) {
      toast.error("Por favor selecciona quién realiza el registro y quién supervisa.");
      return;
    }

    if (!memberFormData.name) {
      toast.error("El nombre es obligatorio");
      return;
    }

    let memberId: number;
    const action = editingMember ? 'Editado' : 'Agregado';
    let details: any = null;

    try {
      if (editingMember) {
        details = {
          before: { name: editingMember.name, role: editingMember.role },
          after: { name: memberFormData.name, role: memberFormData.role }
        };
        const { error } = await supabase.from('integrantes')
          .update({ name: memberFormData.name, role: memberFormData.role })
          .eq('id', editingMember.id);
        if (error) throw error;
        memberId = editingMember.id;
      } else {
        details = { after: { name: memberFormData.name, role: memberFormData.role } };
        const { data, error } = await supabase.from('integrantes')
          .insert([{ teamId: activeTeamForMember, name: memberFormData.name, role: memberFormData.role }])
          .select().single();
        if (error) throw error;
        memberId = data.id;
      }

      // Log the change (If it's the first member, made_by and leader will be null)
      await supabase.from('logs_integrantes').insert([{
        teamId: activeTeamForMember,
        member_affected_id: memberId,
        action,
        made_by_id: memberFormData.madeById ? Number(memberFormData.madeById) : null,
        leader_at_time_id: memberFormData.leaderId ? Number(memberFormData.leaderId) : null,
        details,
        timestamp: new Date().toISOString()
      }]);

      toast.success(editingMember ? 'Integrante actualizado' : 'Integrante agregado');
      setIsMemberModalOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Error al guardar");
    }
  };

  const openDeleteMemberModal = (member: Member) => {
    setPendingDeleteMember(member);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteMember = async (authorizerId: number) => {
    if (!pendingDeleteMember) return;

    await supabase.from('logs_integrantes').insert([{
      teamId: pendingDeleteMember.teamId,
      member_affected_id: pendingDeleteMember.id,
      action: 'Eliminado',
      made_by_id: authorizerId,
      leader_at_time_id: getTeamLeader(pendingDeleteMember.teamId)?.id || null,
      details: { before: { name: pendingDeleteMember.name, role: pendingDeleteMember.role } },
      timestamp: new Date().toISOString()
    }]);

    const { error } = await supabase.from('integrantes').delete().eq('id', pendingDeleteMember.id);
    if (error) toast.error("Error al eliminar");
    else {
      toast.success("Integrante eliminado");
      setIsDeleteModalOpen(false);
      fetchData();
    }
  };

  const setAsLeader = async (teamId: number, memberId: number) => {
    await supabase.from('lideres_historial')
      .update({ is_current: false, end_date: new Date().toISOString() })
      .eq('teamId', teamId)
      .eq('is_current', true);
    
    const { error } = await supabase.from('lideres_historial')
      .insert([{ teamId, memberId, is_current: true }]);
    
    if (error) toast.error('Error al asignar líder');
    else { toast.success('Nuevo líder asignado'); fetchData(); }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center space-x-4">
        <button onClick={() => router.push('/')} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-600 dark:text-zinc-400">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Equipos y Staff</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gestión de recursos humanos y liderazgos.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <div key={i} className="h-48 bg-white dark:bg-zinc-900 rounded-3xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {teams.map((team) => {
            const teamMembers = members.filter(m => m.teamId === team.id);
            const leader = getTeamLeader(team.id);
            const teamLogs = memberLogs.filter(l => l.teamId === team.id);
            
            return (
              <div key={team.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                      <Users size={24} />
                    </div>
                    <div>
                      <div className="flex items-center space-x-3">
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{team.name}</h2>
                        <button 
                          onClick={() => openTeamModal(team)}
                          className="p-1.5 text-zinc-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                      <div className="flex flex-col space-y-1">
                        <div className="flex items-center text-sm">
                          <Crown size={14} className="text-amber-500 mr-1" />
                          <span className="text-zinc-500">Líder: {leader ? <span className="font-bold text-zinc-700 dark:text-zinc-300">{leader.name}</span> : 'No asignado'}</span>
                        </div>
                        {team.description && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 italic line-clamp-1 max-w-md">
                            {team.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button 
                      onClick={() => setShowHistoryForTeam(showHistoryForTeam === team.id ? null : team.id)}
                      className={cn(
                        "p-2 rounded-xl transition-all",
                        showHistoryForTeam === team.id ? "bg-amber-100 text-amber-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900"
                      )}
                      title="Historial de staff"
                    >
                      <History size={20} />
                    </button>
                    <button onClick={() => router.push(`/equipos?teamId=${team.id}`)} className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-bold">
                      Requerimientos
                    </button>
                  </div>
                </div>

                <div className="p-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Integrantes del Equipo</h3>
                    <button onClick={() => openMemberModal(team.id)} className="text-sm text-blue-600 font-bold flex items-center hover:underline">
                      <UserPlus size={16} className="mr-2" /> Agregar Integrante
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamMembers.map(member => (
                      <div key={member.id} className="group bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between hover:border-blue-500 transition-all">
                        <div className="flex items-center space-x-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center font-black",
                            leader?.id === member.id ? "bg-amber-100 text-amber-600" : "bg-white dark:bg-zinc-800 text-zinc-400"
                          )}>
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-zinc-900 dark:text-white leading-tight">{member.name}</p>
                            <p className="text-[10px] text-zinc-500 font-medium uppercase mt-1">{member.role}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {leader?.id !== member.id && (
                            <button onClick={() => setAsLeader(team.id, member.id)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg" title="Hacer líder">
                              <Crown size={16} />
                            </button>
                          )}
                          <button onClick={() => openMemberModal(team.id, member)} className="p-2 text-zinc-400 hover:text-blue-500 rounded-lg">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => openDeleteMemberModal(member)} className="p-2 text-zinc-400 hover:text-red-500 rounded-lg">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Team History Log */}
                  {showHistoryForTeam === team.id && (
                    <div className="mt-8 pt-8 border-t border-dashed border-zinc-200 dark:border-zinc-800 animate-in slide-in-from-top-4 duration-500">
                      <div className="flex items-center space-x-2 mb-4">
                        <History size={16} className="text-amber-500" />
                        <h4 className="text-sm font-black uppercase tracking-widest text-zinc-500">Log de Cambios en Staff</h4>
                      </div>
                      <div className="space-y-2">
                        {teamLogs.map(log => (
                          <div 
                            key={log.id} 
                            onClick={() => setSelectedLogForDiff(log)}
                            className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between cursor-pointer hover:border-blue-500 transition-all"
                          >
                            <div className="flex items-center space-x-3">
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center",
                                log.action === 'Agregado' ? "bg-emerald-50 text-emerald-600" :
                                log.action === 'Editado' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                              )}>
                                <Clock size={16} />
                              </div>
                              <div>
                                <p className="text-xs font-bold dark:text-white">{log.action}: {log.details?.after?.name || log.details?.before?.name}</p>
                                <p className="text-[10px] text-zinc-500">Por {log.made_by?.name || 'Sistema'} | Líder: {log.leader?.name || '---'}</p>
                              </div>
                            </div>
                            <Eye size={14} className="text-zinc-300" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TEAM EDIT MODAL */}
      {isTeamModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <form onSubmit={handleSaveTeam} className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white">Editar Equipo</h3>
                <p className="text-sm text-zinc-500 font-medium italic mt-1">Modifica la información básica del proyecto.</p>
              </div>
              <button type="button" onClick={() => setIsTeamModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Nombre del Equipo</label>
                <input 
                  required 
                  className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-blue-500 outline-none transition-all font-bold" 
                  value={teamFormData.name} 
                  onChange={e => setTeamFormData({...teamFormData, name: e.target.value})} 
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Descripción</label>
                <textarea 
                  className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-blue-500 outline-none transition-all font-medium min-h-[120px]" 
                  value={teamFormData.description} 
                  onChange={e => setTeamFormData({...teamFormData, description: e.target.value})}
                  placeholder="Sin descripción..."
                />
              </div>
            </div>

            <div className="p-8 bg-zinc-50 dark:bg-zinc-800/30 flex items-center justify-between gap-4">
              <button 
                type="button"
                onClick={() => {
                  setTeamToDelete(editingTeam);
                  setIsTeamDeleteModalOpen(true);
                }}
                className="p-4 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-2xl hover:bg-red-200 transition-colors"
                title="Eliminar equipo"
              >
                <Trash2 size={24} />
              </button>
              <button type="submit" className="flex-1 px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-blue-500/30 flex items-center justify-center">
                <Save size={18} className="mr-3" /> Actualizar Equipo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TEAM DELETE CONFIRMATION MODAL */}
      {isTeamDeleteModalOpen && teamToDelete && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border-4 border-red-500/20 animate-in zoom-in-95 duration-300">
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-[30px] flex items-center justify-center mx-auto">
                <Trash2 size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Eliminar Proyecto</h3>
                <p className="text-zinc-500 text-sm mt-2">
                  Esta acción eliminará permanentemente a <span className="font-black text-red-600">{teamToDelete.name}</span> y todos sus requerimientos y logs.
                </p>
              </div>

              <div className="space-y-4 pt-4 text-left">
                <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 ml-1">
                  Escribe <span className="text-red-600">BORRAR</span> para confirmar
                </label>
                <input
                  type="text"
                  placeholder="BORRAR"
                  className="w-full px-6 py-4 rounded-2xl border-2 border-red-100 dark:border-red-900/20 bg-red-50/30 dark:bg-red-900/5 text-red-600 focus:border-red-500 outline-none transition-all font-black text-center tracking-[0.5em]"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-0 border-t border-zinc-100 dark:border-zinc-800">
              <button 
                onClick={() => {
                  setIsTeamDeleteModalOpen(false);
                  setDeleteConfirmText("");
                }}
                className="py-6 font-black uppercase text-xs tracking-widest text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleDeleteTeam}
                disabled={deleteConfirmText !== 'BORRAR'}
                className="py-6 font-black uppercase text-xs tracking-widest text-white bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:grayscale transition-all"
              >
                Eliminar Ahora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER FORM MODAL */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <form onSubmit={handleSaveMember} className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white">{editingMember ? 'Editar Integrante' : 'Nuevo Integrante'}</h3>
                <p className="text-sm text-zinc-500 font-medium italic mt-1">Configuración de rol y acceso.</p>
              </div>
              <button type="button" onClick={() => setIsMemberModalOpen(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Nombre Completo</label>
                <input required className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-blue-500 outline-none transition-all font-bold" value={memberFormData.name} onChange={e => setMemberFormData({...memberFormData, name: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-500">Rol / Cargo</label>
                  <input required className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 focus:border-blue-500 outline-none transition-all" value={memberFormData.role} onChange={e => setMemberFormData({...memberFormData, role: e.target.value})} />
                </div>
                
                {/* Condition: Show selection ONLY if there are other members */}
                {members.some(m => m.teamId === activeTeamForMember) ? (
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest text-zinc-500">¿Quién registra?</label>
                    <select required className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 outline-none appearance-none" value={memberFormData.madeById} onChange={e => setMemberFormData({...memberFormData, madeById: e.target.value})}>
                      <option value="">Seleccionar...</option>
                      {members.filter(m => m.teamId === activeTeamForMember).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2 opacity-50">
                    <label className="text-xs font-black uppercase tracking-widest text-zinc-500">¿Quién registra?</label>
                    <div className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-xs font-bold italic">Registro inicial del equipo</div>
                  </div>
                )}
              </div>

              {/* Leader Tracking */}
              {members.some(m => m.teamId === activeTeamForMember) && (
                <div className="p-6 rounded-3xl bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-100 dark:border-amber-900/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Crown size={20} className="text-amber-500" />
                      <span className="text-sm font-black dark:text-white uppercase tracking-tighter">Supervisión del Líder</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={memberFormData.overwriteLeader} onChange={e => setMemberFormData({...memberFormData, overwriteLeader: e.target.checked})} />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                  {!memberFormData.overwriteLeader ? (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Líder registrado: <span className="font-black italic">{getTeamLeader(activeTeamForMember!)?.name || 'Sistema'}</span></p>
                  ) : (
                    <select className="w-full px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900 text-sm outline-none" value={memberFormData.leaderId} onChange={e => setMemberFormData({...memberFormData, leaderId: e.target.value})}>
                      {members.filter(m => m.teamId === activeTeamForMember).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="p-8 bg-zinc-50 dark:bg-zinc-800/30 flex justify-end space-x-4">
              <button type="button" onClick={() => setIsMemberModalOpen(false)} className="px-8 py-4 text-zinc-500 font-black uppercase text-xs tracking-widest hover:text-zinc-800">Cancelar</button>
              <button type="submit" className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-blue-500/30 flex items-center">
                <Save size={18} className="mr-3" /> {editingMember ? 'Actualizar' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DELETE MEMBER MODAL */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border-4 border-red-50 dark:border-red-900/10">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-[30px] flex items-center justify-center mx-auto shadow-inner">
                <Trash size={40} />
              </div>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white">Baja de Integrante</h3>
              <p className="text-sm text-zinc-500 italic">¿Quién autoriza la eliminación de <span className="font-black text-red-500 underline">{pendingDeleteMember?.name}</span>?</p>
            </div>
            <div className="p-8 pt-0 space-y-2 max-h-[300px] overflow-y-auto">
              {members.filter(m => m.teamId === pendingDeleteMember?.teamId && m.id !== pendingDeleteMember?.id).map(m => (
                <button key={m.id} onClick={() => confirmDeleteMember(m.id)} className="w-full p-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 hover:border-red-500 dark:hover:border-red-500 text-left flex items-center space-x-4 transition-all group">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-black group-hover:bg-red-500 group-hover:text-white">{m.name.charAt(0)}</div>
                  <span className="font-bold dark:text-white group-hover:text-red-500">{m.name}</span>
                </button>
              ))}
              {members.filter(m => m.teamId === pendingDeleteMember?.teamId && m.id !== pendingDeleteMember?.id).length === 0 && (
                <button onClick={() => confirmDeleteMember(pendingDeleteMember!.id)} className="w-full p-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 hover:border-red-500 text-center font-black text-xs uppercase tracking-widest transition-all">Último integrante (Baja Directa)</button>
              )}
            </div>
            <button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-black uppercase text-xs tracking-widest">Cerrar</button>
          </div>
        </div>
      )}

      {/* DIFF MODAL */}
      {selectedLogForDiff && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center space-x-5">
                <div className="w-14 h-14 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-[20px] flex items-center justify-center"><Diff size={28} /></div>
                <div><h3 className="text-2xl font-black tracking-tight dark:text-white">Detalle de Staff</h3><p className="text-zinc-500 font-bold italic">{selectedLogForDiff.action} | {new Date(selectedLogForDiff.timestamp).toLocaleString()}</p></div>
              </div>
              <button onClick={() => setSelectedLogForDiff(null)} className="p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-400"><X size={32} /></button>
            </div>
            <div className="p-12 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-12 items-center">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-400">Estado Previo</p>
                <div className="p-8 rounded-[40px] bg-red-50 dark:bg-red-900/10 border-2 border-dashed border-red-100 dark:border-red-900/20 min-h-[160px] flex flex-col justify-center">
                  {selectedLogForDiff.details?.before ? (
                    <div><p className="text-xl font-black dark:text-white leading-none">{selectedLogForDiff.details.before.name}</p><p className="text-xs font-bold text-red-500 mt-2 uppercase">{selectedLogForDiff.details.before.role}</p></div>
                  ) : <div className="text-center opacity-30 italic font-black">Nulo</div>}
                </div>
              </div>
              <ArrowRight size={32} className="text-zinc-300 mx-auto" />
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Estado Actual</p>
                <div className="p-8 rounded-[40px] bg-emerald-50 dark:bg-emerald-900/10 border-2 border-dashed border-emerald-100 dark:border-emerald-900/20 min-h-[160px] flex flex-col justify-center">
                  {selectedLogForDiff.details?.after ? (
                    <div><p className="text-xl font-black dark:text-white leading-none">{selectedLogForDiff.details.after.name}</p><p className="text-xs font-bold text-emerald-500 mt-2 uppercase">{selectedLogForDiff.details.after.role}</p></div>
                  ) : <div className="text-center opacity-30 italic font-black">Eliminado</div>}
                </div>
              </div>
            </div>
            <div className="p-10 bg-zinc-50 dark:bg-zinc-800/30 text-center flex justify-center space-x-12">
              <div className="flex items-center space-x-2"><User size={16} className="text-zinc-400" /><span className="text-[10px] font-black uppercase text-zinc-500">Editor: {selectedLogForDiff.made_by?.name || 'Sistema'}</span></div>
              <div className="flex items-center space-x-2"><Crown size={16} className="text-amber-500" /><span className="text-[10px] font-black uppercase text-zinc-500">Líder: {selectedLogForDiff.leader?.name || '---'}</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
