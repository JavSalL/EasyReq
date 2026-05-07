'use client';

import React, { use, useEffect, useState, useCallback } from "react";
import { supabase } from '@/lib/supabase-client';
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { 
  ChevronLeft, Plus, Edit2, Trash2, History, CheckCircle, 
  AlertCircle, ArrowUp, ArrowDown, User, Crown, Clock, X, Check,
  Shield, Info, Settings, Save, AlertTriangle, Eye, List, Trash, Diff, ArrowRight, Sparkles, Wand2, BrainCircuit, RefreshCw, Layers
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

type Member = {
  id: number;
  name: string;
  role: string;
}

export default function EquiposPage({ searchParams }: { searchParams: Promise<{ teamId?: string }> }) {
  const params = use(searchParams);
  const router = useRouter();
  const teamId = params.teamId ? Number(params.teamId) : null;
  
  const [sections, setSections] = useState<Array<Section>>([]);
  const [members, setMembers] = useState<Array<Member>>([]);
  const [currentLeader, setCurrentLeader] = useState<Member | null>(null);
  const [logs, setLogs] = useState<Array<any>>([]);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);

  // Requirement Modal State
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<Section | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'Funcional',
    madeById: '',
    leaderId: '',
    overwriteLeader: false
  });

  // Specific History Modal State
  const [isReqHistoryModalOpen, setIsReqHistoryModalOpen] = useState(false);
  const [historyForReq, setHistoryForReq] = useState<Section | null>(null);

  // Delete Authorization Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  // Diff Modal State
  const [selectedLogForDiff, setSelectedLogForDiff] = useState<any>(null);

  // AI Generation State
  const [isAILoading, setIsAILoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [projectDescription, setProjectDescription] = useState('');
  const [evaluatingId, setEvaluatingId] = useState<number | null>(null);

  const handleEvaluate = async (section: Section) => {
    setEvaluatingId(section.id);
    try {
      const evaluation = await evaluateRequirement(section.name);
      
      const { error } = await supabase.from('secciones')
        .update({
          type_furps: evaluation.type_furps,
          essence_state: evaluation.essence_state,
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
      const result = await generateSingleRequirement(aiPrompt);
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
      const requirements = await generateBulkRequirements(projectDescription);
      console.log("IA Response:", requirements); // Para depuración
      
      for (const req of requirements) {
        // Mapeo flexible por si la IA cambia el formato de las keys
        const f_type = req.type_furps || (req as any).typeFurps || (req as any).furps_type;
        const e_state = req.essence_state || (req as any).essenceState || (req as any).essence;

        const { data, error } = await supabase.from('secciones')
          .insert([{ 
            teamId, 
            name: req.name, 
            type: f_type === 'Functionality' ? 'Funcional' : 'No Funcional',
            type_furps: f_type,
            essence_state: e_state,
            ai_evaluation: req.ai_evaluation,
            approval_status: 'pending',
            level: sections.length + 1 
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
      
      toast.success(`${requirements.length} requerimientos generados para revisión`);
      setIsBulkModalOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Error en generación masiva");
    } finally {
      setIsAILoading(false);
    }
  };

  const handleApproveRequirement = async (id: number, approved: boolean) => {
    const status = approved ? 'accepted' : 'rejected';
    const { error } = await supabase.from('secciones')
      .update({ approval_status: status })
      .eq('id', id);
    
    if (!error) {
      toast.success(approved ? "Aceptado" : "Rechazado");
      fetchData();
    }
  };

  const fetchData = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);

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
        leader:integrantes!leader_at_time_id(name)
      `)
      .order('timestamp', { ascending: false });
    setLogs(logsData || []);

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
        madeById: '',
        leaderId: currentLeader?.id.toString() || '',
        overwriteLeader: false
      });
    } else {
      setEditingReq(null);
      setFormData({
        name: '',
        type: 'Funcional',
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
      fetchData();
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
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">Requerimientos</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Gestión técnica y trazabilidad de cambios.</p>
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
            Todo el Historial
          </button>
          <button
            onClick={() => openReqModal()}
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-all shadow-md font-medium"
          >
            <Plus size={18} className="mr-2" />
            Nuevo
          </button>
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
                      Essence: <span className="text-zinc-600 dark:text-zinc-300 uppercase">{section.essence_state || '---'}</span>
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
                        <button 
                          onClick={() => handleEvaluate(section)}
                          disabled={evaluatingId === section.id}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            evaluatingId === section.id ? "text-amber-500 animate-spin" : "text-zinc-400 hover:text-amber-500 hover:bg-amber-50"
                          )}
                          title="Analizar calidad con IA"
                        >
                          <BrainCircuit size={16} />
                        </button>
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

      {/* MODAL: Comparación de Versiones (Diff) */}
      {selectedLogForDiff && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          {/* ... (código existente del modal de diff) */}
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
                  className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white min-h-[150px] outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Ej: Plataforma de e-commerce para venta de artesanías con pasarela de pagos, gestión de inventario y panel de envíos..."
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Responsable</label>
                  <select
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none"
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
                    className="w-full px-4 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white outline-none"
                    value={formData.leaderId}
                    onChange={(e) => setFormData({...formData, leaderId: e.target.value})}
                  >
                    <option value="">Seleccionar...</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
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
