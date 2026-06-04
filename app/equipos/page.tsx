'use client';

import React, { use, useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, Plus, Edit2, Trash2, History, CheckCircle, 
  AlertCircle, ArrowUp, ArrowDown, User, Users, Crown, Clock, X, Check,
  Shield, Info, Settings, Save, AlertTriangle, Eye, List, Trash, Diff, ArrowRight, Sparkles, Wand2, BrainCircuit, RefreshCw, Layers, BookOpen, MessageSquare
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { generateBulkRequirements, generateSingleRequirement, evaluateRequirement, type AIRequirement } from '@/lib/ai-actions';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Section = {
  id: number;
  teamId: number;
  level: number;
  name: string;
  type: string;
  type_furps?: string;
  essence_state?: string;
  approval_status?: 'pending' | 'accepted' | 'rejected';
  ai_evaluation?: {
    actor: boolean;
    accion: boolean;
    objeto: boolean;
    datos_entrada: boolean;
    resultado: boolean;
  };
  ai_observations?: string;
}

type Team = {
  id: number;
  groupId: number;
  name: string;
  description?: string;
}

type Member = {
  id: number;
  teamId?: number;
  name: string;
  role: string;
}

type Pattern = {
  id: number;
  name: string;
  prompt: string;
}

const ESSENCE_STATES = ['conceived', 'bounded', 'coherent', 'acceptable', 'addressed', 'fulfilled'];

export default function EquiposPage({ searchParams }: { searchParams: Promise<{ teamId?: string }> }) {
  const params = use(searchParams);
  const router = useRouter();
  const teamId = params.teamId ? Number(params.teamId) : null;
  
  const [team, setTeam] = useState<Team | null>(null);
  const [sections, setSections] = useState<Array<Section>>([]);
  const [members, setMembers] = useState<Array<Member>>([]);
  const [patrones, setPatrones] = useState<Array<Pattern>>([]);
  const [currentLeader, setCurrentLeader] = useState<Member | null>(null);
  const [logs, setLogs] = useState<Array<any>>([]);
  const [memberLogs, setMemberLogs] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [showMemberHistory, setShowMemberHistory] = useState(false);

  // Pattern Selection State
  const [selectedPatternId, setSelectedPatternId] = useState<string>('none');
  const [customPattern, setCustomPattern] = useState('');

  const getActivePatternPrompt = () => {
    if (selectedPatternId === 'custom') return customPattern;
    if (selectedPatternId === 'none') return '';
    const p = patrones.find(p => p.id.toString() === selectedPatternId);
    return p ? p.prompt : '';
  };

  // Requirement Modal State
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Section | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Funcional',
    essence_state: 'conceived',
    madeById: '',
    leaderId: '',
    overwriteLeader: false
  });

  // Member Modal State
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [memberFormData, setMemberFormData] = useState({
    name: '',
    role: 'Miembro',
    madeById: '',
    leaderId: '',
    overwriteLeader: false
  });

  // Specific History Modal State
  const [isReqHistoryModalOpen, setIsReqHistoryModalOpen] = useState(false);
  const [historyForReq, setHistoryForReq] = useState<Section | null>(null);

  // Delete Requirement Authorization Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // Delete Member Authorization Modal State
  const [isMemberDeleteModalOpen, setIsMemberDeleteModalOpen] = useState(false);
  const [pendingDeleteMember, setPendingDeleteMember] = useState<Member | null>(null);

  // Diff Modal State
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<any>(null);

  // AI Generation State
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isTeamDeleteModalOpen, setIsTeamDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [projectDescription, setProjectDescription] = useState('');
  const [reqCount, setReqCount] = useState<string>('');
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);

  // Function to update essence state inline
  const handleUpdateEssence = async (section: Section, newState: string) => {
    if (section.essence_state === newState) return;
    if (members.length === 0) {
      toast.error("No hay integrantes para registrar el cambio");
      return;
    }

    const authorizerId = currentLeader?.id || members[0].id; // Default to leader or first member

    const { error } = await supabase.from('secciones')
      .update({ essence_state: newState })
      .eq('id', section.id);

    if (error) {
      toast.error("Error al actualizar estado");
      return;
    }

    await supabase.from('logs_cambios').insert([{
      sectionId: section.id,
      action: 'Cambio de Estado Essence',
      made_by_id: authorizerId,
      leader_at_time_id: currentLeader?.id || null,
      details: { 
        before: { name: section.name, essence: section.essence_state }, 
        after: { name: section.name, essence: newState } 
      },
      timestamp: new Date().toISOString()
    }]);

    toast.success(`Estado actualizado a ${newState.toUpperCase()}`);
    fetchData();
  };

  const openMemberModal = (member: Member | null = null) => {
    if (member) {
      setEditingMember(member);
      setMemberFormData({
        name: member.name,
        role: member.role,
        madeById: '',
        leaderId: currentLeader?.id.toString() || '',
        overwriteLeader: false
      });
    } else {
      setEditingMember(null);
      setMemberFormData({
        name: '',
        role: 'Miembro',
        madeById: '',
        leaderId: currentLeader?.id.toString() || '',
        overwriteLeader: false
      });
    }
    setIsMemberModalOpen(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const teamHasMembers = members.length > 0;
    
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
          .insert([{ teamId, name: memberFormData.name, role: memberFormData.role }])
          .select().single();
        if (error) throw error;
        memberId = data.id;
      }

      await supabase.from('logs_integrantes').insert([{
        teamId,
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

  const openMemberDeleteModal = (member: Member) => {
    setPendingDeleteMember(member);
    setIsMemberDeleteModalOpen(true);
  };

  const confirmDeleteMember = async (authorizerId: number) => {
    if (!pendingDeleteMember) return;

    await supabase.from('logs_integrantes').insert([{
      teamId,
      member_affected_id: pendingDeleteMember.id,
      action: 'Eliminado',
      made_by_id: authorizerId,
      leader_at_time_id: currentLeader?.id || null,
      details: { before: { name: pendingDeleteMember.name, role: pendingDeleteMember.role } },
      timestamp: new Date().toISOString()
    }]);

    const { error } = await supabase.from('integrantes').delete().eq('id', pendingDeleteMember.id);
    if (error) toast.error("Error al eliminar");
    else {
      toast.success("Integrante eliminado");
      setIsMemberDeleteModalOpen(false);
      fetchData();
    }
  };

  const setAsLeader = async (memberId: number) => {
    await supabase.from('lideres_historial')
      .update({ is_current: false, end_date: new Date().toISOString() })
      .eq('teamId', teamId)
      .eq('is_current', true);
    
    const { error } = await supabase.from('lideres_historial')
      .insert([{ teamId, memberId, is_current: true }]);
    
    if (error) toast.error('Error al asignar líder');
    else { toast.success('Nuevo líder asignado'); fetchData(); }
  };

  const handleEvaluate = async (section: Section) => {
    setEvaluatingId(section.id);
    try {
      const evaluation = await evaluateRequirement(section.name, getActivePatternPrompt());
      
      const { error } = await supabase.from('secciones')
        .update({
          type_furps: evaluation.type_furps,
          ai_evaluation: evaluation.ai_evaluation,
          ai_observations: evaluation.ai_observations
        })
        .eq('id', section.id);

      if (!error) {
        toast.success("Análisis completado");
        fetchData();
      }
    } catch (error) {
      toast.error("Error al analizar con IA");
    } finally {
      setEvaluatingId(null);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt) return;
    setIsAILoading(true);
    try {
      const result = await generateSingleRequirement(aiPrompt, getActivePatternPrompt());
      if (result) {
        setFormData({
          ...formData,
          name: result.name,
          type: result.type_furps === 'Functionality' ? 'Funcional' : 'No Funcional'
        });
        toast.success("Requerimiento generado con IA");
      }
    } catch (error) {
      toast.error("Error al generar con IA");
    } finally {
      setIsAILoading(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (!projectDescription || !formData.madeById || !formData.leaderId) {
      toast.error("Completa la descripción y los responsables");
      return;
    }
    setIsAILoading(true);
    try {
      const requirements = await generateBulkRequirements(
        projectDescription, 
        getActivePatternPrompt(),
        reqCount ? Number(reqCount) : undefined
      );
      console.log("IA Response:", requirements); // Para depuración
      
      let currentMaxLevel = sections.length;
      for (const req of requirements) {
        currentMaxLevel++;
        // Mapeo flexible por si la IA cambia el formato de las keys
        const f_type = req.type_furps || (req as any).typeFurps || (req as any).furps_type;

        const { data, error } = await supabase.from('secciones')
          .insert([{ 
            teamId, 
            name: req.name, 
            type: f_type === 'Functionality' ? 'Funcional' : 'No Funcional',
            type_furps: f_type,
            essence_state: 'conceived',
            ai_evaluation: req.ai_evaluation,
            approval_status: 'pending',
            level: currentMaxLevel 
          }])
          .select()
          .single();
        
        if (!error && data) {
          await supabase.from('logs_cambios').insert([{
            sectionId: data.id,
            action: 'Agregado (IA)',
            made_by_id: Number(formData.madeById),
            leader_at_time_id: Number(formData.leaderId),
            details: { after: { name: req.name, type: req.type_furps } },
            timestamp: new Date().toISOString()
          }]);
        }
      }
      
      toast.success(`${requirements.length} requerimientos generados`);
      setIsBulkModalOpen(false);
      setReqCount('');
      fetchData();
    } catch (error) {
      toast.error("Error en generación masiva");
    } finally {
      setIsAILoading(false);
    }
  };

  const resequenceLevels = async () => {
    if (!teamId) return;
    
    // 1. Obtener los requerimientos restantes ordenados por su nivel actual
    const { data: remaining, error: fetchError } = await supabase
      .from('secciones')
      .select('id, level')
      .eq('teamId', teamId)
      .order('level', { ascending: true });

    if (fetchError || !remaining) return;

    // 2. Actualizar cada uno con su nueva posición secuencial
    for (let i = 0; i < remaining.length; i++) {
      const newLevel = i + 1;
      if (remaining[i].level !== newLevel) {
        await supabase
          .from('secciones')
          .update({ level: newLevel })
          .eq('id', remaining[i].id);
      }
    }
    
    fetchData();
  };

  const handleApproveRequirement = async (id: number, approved: boolean) => {
    if (approved) {
      const { error } = await supabase.from('secciones')
        .update({ approval_status: 'accepted' })
        .eq('id', id);
      
      if (!error) {
        toast.success("Aceptado");
        fetchData();
      }
    } else {
      // Si se rechaza, se elimina el requerimiento (descartar)
      const { error } = await supabase.from('secciones')
        .delete()
        .eq('id', id);
      
      if (!error) {
        toast.success("Requerimiento descartado");
        resequenceLevels(); // Reordenar tras eliminar por rechazo
      }
    }
  };

  const fetchData = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);

    // Fetch Patterns
    const { data: patternsData } = await supabase.from('patrones').select('id, name, prompt');
    setPatrones(patternsData || []);

    const { data: teamData } = await supabase
      .from('equipos')
      .select('*')
      .eq('id', teamId)
      .single();
    setTeam(teamData);

    const { data: sectionsData } = await supabase
      .from('secciones')
      .select('*')
      .eq('teamId', teamId)
      .order('level', { ascending: true });
    setSections(sectionsData || []);

    const { data: membersData } = await supabase
      .from('integrantes')
      .select('id, name, role')
      .eq('teamId', teamId);
    setMembers(membersData || []);

    const { data: leaderData } = await supabase
      .from('lideres_historial')
      .select('memberId')
      .eq('teamId', teamId)
      .eq('is_current', true)
      .single();
    
    if (leaderData && membersData) {
      const leader = membersData.find(m => m.id === leaderData.memberId);
      setCurrentLeader(leader || null);
      if (leader && !formData.overwriteLeader) {
        setFormData(prev => ({ ...prev, leaderId: leader.id.toString() }));
      }
    }

    const { data: logsData } = await supabase
      .from('logs_cambios')
      .select(`
        *,
        made_by:integrantes!made_by_id(name),
        leader:integrantes!leader_at_time_id(name),
        secciones!inner(teamId)
      `)
      .eq('secciones.teamId', teamId)
      .order('timestamp', { ascending: false });
    setLogs(logsData || []);

    const { data: memberLogsData } = await supabase
      .from('logs_integrantes')
      .select(`
        *,
        made_by:integrantes!made_by_id(name),
        leader:integrantes!leader_at_time_id(name)
      `)
      .eq('teamId', teamId)
      .order('timestamp', { ascending: false });
    setMemberLogs(memberLogsData || []);

    setLoading(false);
  }, [teamId, formData.overwriteLeader]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openReqModal = (req: Section | null = null) => {
    if (members.length === 0) {
      toast.error("Debes agregar integrantes al equipo primero");
      return;
    }
    
    if (req) {
      setEditingReq(req);
      setFormData({
        name: req.name,
        type: req.type,
        essence_state: req.essence_state || 'conceived',
        madeById: '',
        leaderId: currentLeader?.id.toString() || '',
        overwriteLeader: false
      });
    } else {
      setEditingReq(null);
      setFormData({
        name: '',
        type: 'Funcional',
        essence_state: 'conceived',
        madeById: '',
        leaderId: currentLeader?.id.toString() || '',
        overwriteLeader: false
      });
    }
    setIsReqModalOpen(true);
  };

  const openSpecificHistory = (req: Section) => {
    setHistoryForReq(req);
    setIsReqHistoryModalOpen(true);
  };

  const openDeleteModal = (id: number) => {
    setPendingDeleteId(id);
    setIsDeleteModalOpen(true);
  };

  const handleSaveRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.madeById || !formData.leaderId) {
      toast.error("Por favor completa todos los campos requeridos");
      return;
    }

    let sectionId: number;
    const action = editingReq ? 'Editado' : 'Agregado';
    let details: any = null;

    if (editingReq) {
      details = {
        before: { name: editingReq.name, type: editingReq.type },
        after: { name: formData.name, type: formData.type }
      };

      const { error } = await supabase.from('secciones')
        .update({ name: formData.name, type: formData.type })
        .eq('id', editingReq.id);
      if (error) { toast.error("Error al actualizar"); return; }
      sectionId = editingReq.id;
    } else {
      details = {
        after: { name: formData.name, type: formData.type }
      };

      const { data, error } = await supabase.from('secciones')
        .insert([{ teamId, name: formData.name, type: formData.type, level: sections.length + 1 }])
        .select()
        .single();
      if (error) { toast.error("Error al crear"); return; }
      sectionId = data.id;
    }

    // Record Log with Details
    await supabase.from('logs_cambios').insert([{
      sectionId,
      action,
      made_by_id: Number(formData.madeById),
      leader_at_time_id: Number(formData.leaderId),
      details,
      timestamp: new Date().toISOString()
    }]);

    toast.success(editingReq ? 'Requerimiento actualizado' : 'Requerimiento creado');
    setIsReqModalOpen(false);
    fetchData();
  };

  const confirmDelete = async (memberId: number) => {
    if (!pendingDeleteId) return;

    const reqToDelete = sections.find(s => s.id === pendingDeleteId);

    // Record deletion log
    await supabase.from('logs_cambios').insert([{
      sectionId: pendingDeleteId,
      action: 'Eliminado',
      made_by_id: memberId,
      leader_at_time_id: currentLeader?.id || null,
      details: { before: { name: reqToDelete?.name, type: reqToDelete?.type } },
      timestamp: new Date().toISOString()
    }]);

    const { error } = await supabase.from('secciones').delete().eq('id', pendingDeleteId);
    
    if (error) {
      toast.error('Error al eliminar');
    } else {
      toast.success('Requerimiento eliminado correctamente');
      setIsDeleteModalOpen(false);
      setPendingDeleteId(null);
      resequenceLevels(); // Reordenar tras eliminar manualmente
    }
  };

  const handleDeleteTeam = async () => {
    if (deleteConfirmText !== 'BORRAR' || !teamId) return;

    const { error } = await supabase
      .from('equipos')
      .delete()
      .eq('id', teamId);

    if (error) {
      toast.error("Error al eliminar equipo. Verifica que no tenga registros vinculados.");
    } else {
      toast.success("Equipo eliminado permanentemente");
      router.push('/equipos-global');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => router.back()}
            className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-600 dark:text-zinc-400"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">{team?.name || 'Cargando...'}</h1>
              {team && (
                <button 
                  onClick={() => setIsTeamDeleteModalOpen(true)}
                  className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                  title="Eliminar este proyecto"
                >
                  <Trash size={18} />
                </button>
              )}
            </div>
            {team?.description ? (
              <p className="text-zinc-500 dark:text-zinc-400 mt-1 max-w-3xl line-clamp-2 italic">
                {team.description}
              </p>
            ) : (
              <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gestión técnica y trazabilidad de cambios.</p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl transition-all hover:opacity-90 font-bold text-sm shadow-xl"
          >
            <Sparkles size={18} className="mr-2 text-amber-500" />
            Generación Masiva
          </button>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className={cn(
              "inline-flex items-center px-4 py-2 rounded-xl transition-all font-medium",
              showLogs 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
            )}
          >
            <History size={18} className="mr-2" />
            Historial Requerimientos
          </button>
          <button
            onClick={() => openReqModal()}
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md font-medium"
          >
            <Plus size={18} className="mr-2" />
            Nuevo Requerimiento
          </button>
        </div>
      </div>

      {/* Team Member Management Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Users size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Equipo de Trabajo</h2>
              <div className="flex items-center mt-1 text-sm">
                <Crown size={14} className="text-amber-500 mr-1" />
                <span className="text-zinc-500">Líder: {currentLeader ? <span className="font-bold text-zinc-700 dark:text-zinc-300">{currentLeader.name}</span> : 'No asignado'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setShowMemberHistory(!showMemberHistory)}
              className={cn(
                "p-2 rounded-xl transition-all",
                showMemberHistory ? "bg-amber-100 text-amber-600" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900"
              )}
              title="Historial de staff"
            >
              <History size={20} />
            </button>
            <button onClick={() => openMemberModal()} className="px-4 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-bold flex items-center">
              <Plus size={16} className="mr-2" /> Agregar Integrante
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {members.map((member) => (
              <div key={member.id} className="p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between group">
                <div className="flex items-center space-x-3">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm",
                    currentLeader?.id === member.id ? "bg-amber-100 text-amber-600 ring-2 ring-amber-500 ring-offset-2 dark:ring-offset-zinc-900" : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500"
                  )}>
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-bold text-zinc-900 dark:text-white text-sm line-clamp-1">{member.name}</p>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{member.role}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {currentLeader?.id !== member.id && (
                    <button onClick={() => setAsLeader(member.id)} className="p-1.5 text-zinc-400 hover:text-amber-500 rounded-lg transition-colors" title="Asignar Líder">
                      <Crown size={14} />
                    </button>
                  )}
                  <button onClick={() => openMemberModal(member)} className="p-1.5 text-zinc-400 hover:text-blue-500 rounded-lg transition-colors">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => openMemberDeleteModal(member)} className="p-1.5 text-zinc-400 hover:text-red-500 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="col-span-full py-8 text-center text-zinc-400 text-sm italic">
                No hay integrantes registrados en este equipo.
              </div>
            )}
          </div>

          {/* Member History Log (Toggled) */}
          {showMemberHistory && (
            <div className="mt-8 pt-8 border-t border-zinc-100 dark:border-zinc-800 animate-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Trazabilidad de Staff</h3>
                <button onClick={() => setShowMemberHistory(false)} className="text-[10px] font-bold text-zinc-400 hover:text-zinc-600 uppercase">Cerrar</button>
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {memberLogs.map((log) => (
                  <div key={log.id} onClick={() => setSelectedLogForDiff(log)} className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:border-blue-500/50 bg-white dark:bg-zinc-950 flex items-center justify-between group cursor-pointer transition-all">
                    <div className="flex items-center space-x-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black",
                        log.action === 'Agregado' ? "bg-emerald-50 text-emerald-600" : log.action === 'Editado' ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                      )}>
                        {log.action.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                          {log.action} por <span className="text-blue-600">{log.made_by?.name || 'Sistema'}</span>
                        </p>
                        <p className="text-[10px] text-zinc-400 italic">Supervisado por: {log.leader?.name || '---'}</p>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-zinc-300 group-hover:text-blue-500 flex items-center">
                      <Clock size={10} className="mr-1" /> {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
                {memberLogs.length === 0 && (
                  <p className="text-center py-10 text-xs text-zinc-400 italic">No hay registros aún.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Title */}
      <div className="flex items-center justify-between pt-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-white dark:text-zinc-900">
            <List size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Matriz de Requerimientos</h2>
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium">Documentación técnica del proyecto</p>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-semibold">Nivel</th>
              <th className="px-6 py-4 font-semibold">Descripción y Calidad IA</th>
              <th className="px-6 py-4 font-semibold">Clasificación (FURPS/Essence)</th>
              <th className="px-6 py-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sections.map((section) => (
              <tr key={section.id} className={cn(
                "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors group",
                section.approval_status === 'pending' && "bg-amber-50/30 dark:bg-amber-900/10"
              )}>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold text-sm">
                    {section.level}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-2">
                    <p className="font-medium text-zinc-900 dark:text-white">{section.name}</p>
                    {section.ai_evaluation && (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(section.ai_evaluation).map(([tag, ok]) => (
                          <span key={tag} className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tighter border",
                            ok ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-zinc-50 text-zinc-400 border-zinc-200"
                          )}>
                            {tag.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    )}
                    {section.ai_observations && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 italic bg-amber-50/50 dark:bg-amber-900/10 px-2 py-1 rounded-lg border border-amber-100 dark:border-amber-900/30">
                        <strong>Nota IA:</strong> {section.ai_observations}
                      </p>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1.5">
                    <span className={cn(
                      "inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                      section.type_furps === 'Functionality' ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-600"
                    )}>
                      <Layers size={10} className="mr-1" />
                      {section.type_furps || section.type}
                    </span>
                    <span className="text-[10px] font-medium text-zinc-400 italic">
                      <select
                      className={cn(
                        "bg-transparent text-zinc-600 dark:text-zinc-300 uppercase font-black outline-none cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded px-1 transition-colors",
                        section.essence_state === 'fulfilled' ? "text-emerald-600" : section.essence_state === 'conceived' ? "text-zinc-400" : "text-blue-500"
                      )}
                      value={section.essence_state || 'conceived'}
                      onChange={(e) => handleUpdateEssence(section, e.target.value)}
                    >
                      {ESSENCE_STATES.map(s => <option key={s} value={s} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white uppercase font-bold text-[10px]">{s}</option>)}
                    </select>
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end space-x-1">
                    {section.approval_status === 'pending' ? (
                      <div className="flex items-center bg-white dark:bg-zinc-800 p-1 rounded-xl border border-amber-200 shadow-sm animate-pulse hover:animate-none">
                        <button 
                          onClick={() => handleApproveRequirement(section.id, true)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Aceptar"
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          onClick={() => handleApproveRequirement(section.id, false)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Rechazar"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end space-x-1">
                        {/* Inline Pattern Selector for Audit */}
                        <div className="flex items-center space-x-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1 border border-zinc-200 dark:border-zinc-700 shadow-sm">
                          <BookOpen size={12} className="ml-1.5 text-zinc-400 shrink-0" />
                          <select 
                            className="bg-transparent text-[10px] font-bold text-zinc-600 dark:text-zinc-300 outline-none pr-1 cursor-pointer max-w-[120px] truncate"
                            value={selectedPatternId}
                            onChange={(e) => setSelectedPatternId(e.target.value)}
                            title="Selecciona patrón para el análisis"
                          >
                            <option value="none">Estándar</option>
                            {patrones.map(p => <option key={p.id} value={p.id} className="text-zinc-900 dark:text-white">{p.name}</option>)}
                            <option value="custom">Personalizado...</option>
                          </select>
                          <button 
                            onClick={() => handleEvaluate(section)}
                            disabled={evaluatingId === section.id}
                            className={cn(
                              "p-1.5 rounded-lg transition-all",
                              evaluatingId === section.id ? "text-amber-500 animate-spin" : "text-zinc-400 hover:text-blue-500 hover:bg-white dark:hover:bg-zinc-700 shadow-sm border border-transparent hover:border-zinc-200"
                            )}
                            title="Lanzar análisis de calidad"
                          >
                            <BrainCircuit size={16} />
                          </button>
                        </div>
                        
                        <button 
                          onClick={() => openSpecificHistory(section)}
                          className="p-2 text-zinc-400 hover:text-blue-600 rounded-lg transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          onClick={() => openReqModal(section)}
                          className="p-2 text-zinc-400 hover:text-amber-600 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => openDeleteModal(section.id)}
                          className="p-2 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sections.length === 0 && (
          <div className="py-20 text-center text-zinc-500">
            No hay requerimientos definidos para este equipo.
          </div>
        )}
      </div>

      {/* General History Log Section (Toggled) */}
      {showLogs && (
        <div className="animate-in slide-in-from-bottom duration-500 space-y-4 pb-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History size={20} className="text-blue-600" />
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Registro de Actividad Global</h2>
            </div>
            <button onClick={() => setShowLogs(false)} className="text-xs text-zinc-400 hover:text-zinc-600">Cerrar historial</button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {logs.map((log) => (
              <LogItem key={log.id} log={log} onSelect={() => setSelectedLogForDiff(log)} />
            ))}
            {logs.length === 0 && (
              <p className="text-center py-10 text-zinc-500">No hay registros de cambios aún.</p>
            )}
          </div>
        </div>
      )}

      {/* TEAM DELETE CONFIRMATION MODAL */}
      {isTeamDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border-4 border-red-500/20 animate-in zoom-in-95 duration-300">
            <div className="p-10 text-center space-y-6">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-[30px] flex items-center justify-center mx-auto">
                <Trash size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Eliminar Proyecto</h3>
                <p className="text-zinc-500 text-sm mt-2">
                  Esta acción eliminará permanentemente a <span className="font-black text-red-600">{team?.name}</span> y todos sus requerimientos y logs.
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

      {/* MODAL: Nuevo/Editar Requerimiento */}
      {isReqModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <form 
            onSubmit={handleSaveRequirement}
            className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
          >
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {editingReq ? 'Editar Requerimiento' : 'Nuevo Requerimiento'}
                </h3>
                <p className="text-sm text-zinc-500 mt-1">Completa los datos para el registro técnico.</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsReqModalOpen(false)} 
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              {/* AI Helper Section */}
              {!editingReq && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <BrainCircuit size={18} className="text-amber-400" />
                      <span className="text-xs font-black text-white uppercase tracking-widest">Asistente IA Gemini</span>
                    </div>
                    {isAILoading && <RefreshCw size={14} className="text-amber-400 animate-spin" />}
                  </div>
                  
                  {/* Pattern Selection inside Single Req Modal */}
                  <div className="space-y-2">
                    <select 
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-[10px] text-zinc-300 outline-none focus:ring-1 focus:ring-amber-500 font-bold"
                      value={selectedPatternId}
                      onChange={(e) => setSelectedPatternId(e.target.value)}
                    >
                      <option value="none">Sin patrón (Estándar)</option>
                      {patrones.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      <option value="custom">Prompt personalizado...</option>
                    </select>
                    {selectedPatternId === 'custom' && (
                      <textarea 
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-[10px] text-white outline-none focus:ring-1 focus:ring-amber-500 min-h-[60px]"
                        placeholder="Reglas del patrón..."
                        value={customPattern}
                        onChange={(e) => setCustomPattern(e.target.value)}
                      />
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <input 
                      type="text"
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="Escribe una idea y la IA redactará el requerimiento..."
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                    />
                    <button 
                      type="button"
                      onClick={handleAIGenerate}
                      disabled={isAILoading || !aiPrompt}
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black rounded-xl transition-all"
                    >
                      <Wand2 size={16} />
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center">
                  <Info size={14} className="mr-2 text-blue-500" />
                  Descripción del requerimiento
                </label>
                <textarea
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]"
                  placeholder="Ej: El sistema debe permitir el login con OAuth2..."
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Tipo</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="Funcional">Funcional</option>
                    <option value="No Funcional">No Funcional</option>
                    <option value="Restricción">Restricción</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Estado Essence</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none font-bold uppercase text-[10px]"
                    value={formData.essence_state}
                    onChange={(e) => setFormData({...formData, essence_state: e.target.value})}
                  >
                    {ESSENCE_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">¿Quién realiza el cambio?</label>
                <select
                  required
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none"
                  value={formData.madeById}
                  onChange={(e) => setFormData({...formData, madeById: e.target.value})}
                >
                  <option value="">Seleccionar...</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>

              {/* Leader Overwrite Section */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700/50 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Crown size={16} className="text-amber-500" />
                    <span className="text-sm font-bold dark:text-white">Líder Supervisor</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={formData.overwriteLeader}
                      onChange={(e) => setFormData({...formData, overwriteLeader: e.target.checked})}
                    />
                    <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-2 text-[11px] font-medium text-zinc-500 uppercase tracking-tight">Sobrescribir</span>
                  </label>
                </div>

                {!formData.overwriteLeader ? (
                  <div className="flex items-center space-x-3 text-sm text-zinc-600 dark:text-zinc-400 italic">
                    <User size={14} />
                    <span>Se registrará al líder actual: <strong>{currentLeader?.name || 'Ninguno'}</strong></span>
                  </div>
                ) : (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <select
                      className="w-full px-4 py-2 text-sm rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                      value={formData.leaderId}
                      onChange={(e) => setFormData({...formData, leaderId: e.target.value})}
                    >
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 flex items-center justify-end space-x-3">
              <button 
                type="button"
                onClick={() => setIsReqModalOpen(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-8 py-2.5 rounded-xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center"
              >
                <Save size={18} className="mr-2" />
                {editingReq ? 'Guardar Cambios' : 'Crear Registro'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Historial Específico */}
      {isReqHistoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white">
                  <History size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white line-clamp-1">
                    Historial: {historyForReq?.name}
                  </h3>
                  <p className="text-sm text-zinc-500">Trazabilidad completa de este requerimiento.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsReqHistoryModalOpen(false)} 
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 max-h-[500px] overflow-y-auto space-y-3">
              {logs.filter(l => l.sectionId === historyForReq?.id).map((log) => (
                <LogItem key={log.id} log={log} onSelect={() => setSelectedLogForDiff(log)} />
              ))}
              {logs.filter(l => l.sectionId === historyForReq?.id).length === 0 && (
                <div className="text-center py-20 text-zinc-500 space-y-3">
                  <AlertCircle size={40} className="mx-auto text-zinc-300" />
                  <p>No se encontraron registros para este requerimiento.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 text-center">
              <button 
                onClick={() => setIsReqHistoryModalOpen(false)}
                className="w-full py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold hover:opacity-90 transition-opacity"
              >
                Cerrar Panel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Autorización de Eliminación */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-red-50 dark:bg-red-900/10">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white">
                  <Trash size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-red-600 dark:text-red-500">Autorizar Eliminación</h3>
                  <p className="text-xs text-red-500/70">Esta acción es irreversible.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDeleteModalOpen(false)} 
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full transition-colors text-red-400"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6 text-center">
                ¿Quién está autorizando la eliminación de este requerimiento? Selecciona tu nombre para registrar la baja.
              </p>
              
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {members.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => confirmDelete(member.id)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-all group"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-bold group-hover:bg-red-100 dark:group-hover:bg-red-900/40 group-hover:text-red-600 transition-colors">
                        {member.name.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="font-semibold text-zinc-900 dark:text-white group-hover:text-red-600 transition-colors">{member.name}</p>
                        <p className="text-xs text-zinc-500">{member.role}</p>
                      </div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-500/30">
                        <Check size={16} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 flex items-center justify-center space-x-2">
              <AlertTriangle size={14} className="text-amber-500" />
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Proceder con precaución</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo/Editar Integrante */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <form 
            onSubmit={handleSaveMember}
            className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300"
          >
            <div className="p-10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
              <div>
                <h3 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
                  {editingMember ? 'Editar Integrante' : 'Nuevo Integrante'}
                </h3>
                <p className="text-sm text-zinc-500 font-medium italic">Gestión de staff del equipo.</p>
              </div>
              <button type="button" onClick={() => setIsMemberModalOpen(false)} className="p-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-2xl text-zinc-400">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-10 space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-black uppercase tracking-widest text-zinc-400 ml-1">Nombre Completo</label>
                <input
                  required
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-6 py-5 rounded-3xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all font-bold text-lg"
                  value={memberFormData.name}
                  onChange={(e) => setMemberFormData({...memberFormData, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400 ml-1">Rol / Cargo</label>
                  <input
                    required
                    className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white focus:border-blue-500 outline-none transition-all"
                    value={memberFormData.role}
                    onChange={(e) => setMemberFormData({...memberFormData, role: e.target.value})}
                  />
                </div>
                
                <div className="space-y-3">
                  <label className="text-xs font-black uppercase tracking-widest text-zinc-400 ml-1">¿Quién registra?</label>
                  <select
                    required={members.length > 0}
                    className="w-full px-6 py-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none appearance-none"
                    value={memberFormData.madeById}
                    onChange={(e) => setMemberFormData({...memberFormData, madeById: e.target.value})}
                  >
                    <option value="">Seleccionar...</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    {members.length === 0 && <option value="system">Sistema (Primer registro)</option>}
                  </select>
                </div>
              </div>

              {/* Leader Tracking */}
              {members.length > 0 && (
                <div className="p-6 rounded-3xl bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-100 dark:border-amber-900/20 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Crown size={20} className="text-amber-500" />
                      <span className="text-sm font-black dark:text-white uppercase tracking-tighter">Supervisión del Líder</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={memberFormData.overwriteLeader} 
                        onChange={e => setMemberFormData({...memberFormData, overwriteLeader: e.target.checked})} 
                      />
                      <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                  </div>
                  {!memberFormData.overwriteLeader ? (
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Líder registrado: <span className="font-black italic">{currentLeader?.name || 'Sistema'}</span></p>
                  ) : (
                    <select 
                      className="w-full px-4 py-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900 text-sm outline-none" 
                      value={memberFormData.leaderId} 
                      onChange={e => setMemberFormData({...memberFormData, leaderId: e.target.value})}
                    >
                      <option value="">Seleccionar líder...</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="p-10 bg-zinc-50 dark:bg-zinc-800/30 flex justify-end space-x-4">
              <button type="button" onClick={() => setIsMemberModalOpen(false)} className="px-8 py-4 text-zinc-500 font-black uppercase text-xs tracking-widest hover:text-zinc-800">Cancelar</button>
              <button type="submit" className="px-10 py-4 bg-blue-600 text-white rounded-3xl font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-blue-500/30 flex items-center">
                <Save size={18} className="mr-3" /> {editingMember ? 'Actualizar' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: Autorización de Baja de Integrante */}
      {isMemberDeleteModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden border-4 border-red-50 dark:border-red-900/10 animate-in zoom-in-95">
            <div className="p-8 text-center space-y-4">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 text-red-600 rounded-[30px] flex items-center justify-center mx-auto shadow-inner">
                <Trash size={40} />
              </div>
              <h3 className="text-2xl font-black text-zinc-900 dark:text-white">Baja de Integrante</h3>
              <p className="text-sm text-zinc-500 italic">¿Quién autoriza la eliminación de <span className="font-black text-red-500 underline">{pendingDeleteMember?.name}</span>?</p>
            </div>
            <div className="p-8 pt-0 space-y-2 max-h-[300px] overflow-y-auto">
              {members.filter(m => m.id !== pendingDeleteMember?.id).map(m => (
                <button 
                  key={m.id} 
                  onClick={() => confirmDeleteMember(m.id)} 
                  className="w-full p-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 hover:border-red-500 dark:hover:border-red-500 text-left flex items-center space-x-4 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-black group-hover:bg-red-500 group-hover:text-white">{m.name.charAt(0)}</div>
                  <span className="font-bold dark:text-white group-hover:text-red-500">{m.name}</span>
                </button>
              ))}
              {members.length === 1 && (
                <button onClick={() => confirmDeleteMember(pendingDeleteMember!.id)} className="w-full p-4 rounded-2xl border-2 border-zinc-100 dark:border-zinc-800 hover:border-red-500 text-center font-black text-xs uppercase tracking-widest transition-all">Último integrante (Baja Directa)</button>
              )}
            </div>
            <button onClick={() => setIsMemberDeleteModalOpen(false)} className="w-full py-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-black uppercase text-xs tracking-widest">Cerrar</button>
          </div>
        </div>
      )}

      {/* MODAL: Comparación de Versiones (Diff) */}
      {selectedLogForDiff && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-center space-x-5">
                <div className="w-14 h-14 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-[20px] flex items-center justify-center">
                  <Diff size={28} />
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tight dark:text-white">Detalle del Cambio</h3>
                  <p className="text-zinc-500 font-bold italic">
                    {selectedLogForDiff.action} | {new Date(selectedLogForDiff.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLogForDiff(null)} 
                className="p-4 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-400"
              >
                <X size={32} />
              </button>
            </div>
            
            <div className="p-12 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-12 items-center">
              {/* Estado Previo */}
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-400">Estado Previo</p>
                <div className="p-8 rounded-[40px] bg-red-50 dark:bg-red-900/10 border-2 border-dashed border-red-100 dark:border-red-900/20 min-h-[160px] flex flex-col justify-center">
                  {selectedLogForDiff.details?.before ? (
                    <div>
                      <p className="text-xl font-black dark:text-white leading-tight">
                        {selectedLogForDiff.details.before.name}
                      </p>
                      <p className="text-xs font-bold text-red-500 mt-2 uppercase tracking-widest">
                        {selectedLogForDiff.details.before.type}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center opacity-30 italic font-black">Nulo (Nuevo Registro)</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-center">
                <ArrowRight size={32} className="text-zinc-300" />
              </div>

              {/* Estado Actual */}
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400">Estado Actual</p>
                <div className="p-8 rounded-[40px] bg-emerald-50 dark:bg-emerald-900/10 border-2 border-dashed border-emerald-100 dark:border-emerald-900/20 min-h-[160px] flex flex-col justify-center">
                  {selectedLogForDiff.details?.after ? (
                    <div>
                      <p className="text-xl font-black dark:text-white leading-tight">
                        {selectedLogForDiff.details.after.name}
                      </p>
                      <p className="text-xs font-bold text-emerald-500 mt-2 uppercase tracking-widest">
                        {selectedLogForDiff.details.after.type}
                      </p>
                    </div>
                  ) : (
                    <div className="text-center opacity-30 italic font-black">Eliminado</div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-10 bg-zinc-50 dark:bg-zinc-800/30 text-center flex justify-center space-x-12">
              <div className="flex items-center space-x-2">
                <User size={16} className="text-zinc-400" />
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                  Realizado por: {selectedLogForDiff.made_by?.name || 'Sistema'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Crown size={16} className="text-amber-500" />
                <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                  Supervisor: {selectedLogForDiff.leader?.name || '---'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Generación Masiva IA */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-amber-500/20">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-transparent">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Generación con IA (Modelo FURPS)</h3>
                  <p className="text-sm text-zinc-500">Define tu proyecto y Gemini hará el resto.</p>
                </div>
              </div>
              <button onClick={() => setIsBulkModalOpen(false)} className="p-2 text-zinc-400 hover:text-zinc-600"><X size={20} /></button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Descripción General del Proyecto</label>
                <textarea
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white min-h-[120px] outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Ej: Plataforma de e-commerce para venta de artesanías..."
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </div>

              {/* Pattern Selection inside Modal */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300 flex items-center">
                  <BookOpen size={14} className="mr-2 text-blue-500" />
                  Patrón de Redacción
                </label>
                <select 
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedPatternId}
                  onChange={(e) => setSelectedPatternId(e.target.value)}
                >
                  <option value="none">Sin patrón específico (Estándar)</option>
                  {patrones.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="custom">Prompt personalizado...</option>
                </select>
                {selectedPatternId === 'custom' && (
                  <textarea 
                    className="w-full mt-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px] animate-in slide-in-from-top-2"
                    placeholder="Describe las reglas de redacción..."
                    value={customPattern}
                    onChange={(e) => setCustomPattern(e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">N° Requerimientos</label>
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter italic">Opcional</span>
                  </div>
                  <input 
                    type="number"
                    min="1"
                    max="30"
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Auto"
                    value={reqCount}
                    onChange={(e) => setReqCount(e.target.value)}
                  />
                  <p className="text-[10px] text-zinc-500 leading-tight italic">Si se deja vacío, la IA generará la cantidad que considere necesaria para cubrir el proyecto.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Responsable</label>
                    <select
                      className="w-full px-4 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none"
                      value={formData.madeById}
                      onChange={(e) => setFormData({...formData, madeById: e.target.value})}
                    >
                      <option value="">Seleccionar...</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Líder Supervisor</label>
                    <select
                      className="w-full px-4 py-2.5 text-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none"
                      value={formData.leaderId}
                      onChange={(e) => setFormData({...formData, leaderId: e.target.value})}
                    >
                      <option value="">Seleccionar...</option>
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 flex items-center justify-end space-x-3">
              <button 
                onClick={() => setIsBulkModalOpen(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-500"
              >
                Cancelar
              </button>
              <button 
                onClick={handleBulkGenerate}
                disabled={isAILoading || !projectDescription}
                className="px-8 py-2.5 rounded-xl text-sm font-bold bg-amber-500 text-white hover:bg-amber-600 shadow-lg shadow-amber-500/20 flex items-center disabled:opacity-50"
              >
                {isAILoading ? <RefreshCw size={18} className="mr-2 animate-spin" /> : <Wand2 size={18} className="mr-2" />}
                Generar Requerimientos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-component for Log Item
function LogItem({ log, onSelect }: { log: any, onSelect: () => void }) {
  const contentPreview = log.details?.after?.name || log.details?.before?.name;

  return (
    <div 
      onClick={onSelect}
      className="bg-white dark:bg-zinc-900 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 flex items-center justify-between group hover:border-blue-500 dark:hover:border-blue-500 cursor-pointer transition-all hover:shadow-lg hover:shadow-blue-500/5 active:scale-[0.98]"
    >
      <div className="flex items-center space-x-5 flex-1 min-w-0">
        <div className={cn(
          "w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all duration-300 group-hover:rotate-6",
          log.action.includes('Agregado') ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 shadow-inner" :
          log.action.includes('Editado') ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 shadow-inner" : "bg-red-50 text-red-600 dark:bg-red-900/20 shadow-inner"
        )}>
          {log.action.includes('Agregado') ? <Plus size={24} /> : log.action.includes('Editado') ? <Edit2 size={24} /> : <Trash size={24} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-zinc-900 dark:text-white tracking-tight truncate">
            {log.action} por <span className="text-blue-600 dark:text-blue-400">{log.made_by?.name || 'Desconocido'}</span>
          </p>
          {contentPreview && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1 italic font-medium">
              &quot;{contentPreview}&quot;
            </p>
          )}
          <div className="flex items-center mt-2 space-x-4">
            <div className="flex items-center text-[11px] font-bold text-zinc-400 uppercase tracking-tighter">
              <Crown size={14} className="mr-1 text-amber-500" />
              <span>Líder: {log.leader?.name || '---'}</span>
            </div>
            <div className="flex items-center text-[11px] font-bold text-zinc-400 uppercase tracking-tighter">
              <Clock size={14} className="mr-1" />
              {new Date(log.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4 ml-4">
        <div className="px-3 py-1.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest border border-zinc-100 dark:border-zinc-700/50 hidden sm:block">
          {new Date(log.timestamp).toLocaleDateString()}
        </div>
        <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-blue-600 group-hover:text-white transition-all">
          <Eye size={16} />
        </div>
      </div>
    </div>
  );
}
