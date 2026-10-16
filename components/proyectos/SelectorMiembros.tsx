'use client';

import React from 'react';
import type { PerfilUsuario } from '@/lib/database.types';
import BuscadorPersonas from '@/components/proyectos/BuscadorPersonas';

interface SelectorMiembrosProps {
  usuarios: PerfilUsuario[];
  valor: string[];
  onChange: (ids: string[]) => void;
  titulo?: string;
}

/**
 * Elegir varias personas (p. ej. los miembros iniciales de un proyecto). Ya no lista a todos los
 * usuarios registrados: se buscan por nombre o correo, como al agregar colaboradores en GitHub.
 */
export default function SelectorMiembros({ usuarios, valor, onChange, titulo = 'Miembros' }: SelectorMiembrosProps) {
  return <BuscadorPersonas candidatos={usuarios} valor={valor} onChange={onChange} titulo={titulo} />;
}
