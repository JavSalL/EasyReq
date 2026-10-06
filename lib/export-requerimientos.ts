// Utilidades para exportar los requerimientos de un proyecto como documento.
// Todo se ejecuta en el navegador (sin servidor): Markdown y Word se descargan
// como Blob y PDF se genera con jsPDF en el cliente.

import type { Patron, Proyecto, Requerimiento } from './database.types';
import { codigoDe } from './requerimientos';

export type FormatoExportacion = 'pdf' | 'markdown' | 'word';
export type AlcanceExportacion = 'visibles' | 'todos';
export type AgrupacionExportacion = 'ninguna' | 'tipo';

export interface ItemExportacion {
  codigo: string;
  orden: number;
  requerimiento: Requerimiento;
  tipoFurps: string;
  patron: string;
  modelo: string;
  estado: string;
}

export function nombreTipoFurps(req: Requerimiento): string {
  return req.tipo_requerimiento?.nombre?.trim() || 'Sin tipo';
}

/** Nombre del modelo asociado al requerimiento, si lo hay. */
export function nombreModelo(req: Requerimiento): string {
  return req.modelo?.nombre?.trim() || '—';
}

/**
 * Nombre del patrón usado al redactar. Los requerimientos nuevos guardan
 * `id_patron`; los antiguos solo traen `id_modelo`, así que se resuelve en
 * este orden: join `patron` > catálogo por `id_patron` > "—".
 */
export function nombrePatron(req: Requerimiento, patrones: Array<Patron>): string {
  const directo = req.patron?.nombre?.trim();
  if (directo) return directo;
  if (req.id_patron) {
    const hallado = patrones.find((p) => p.patron_id === req.id_patron);
    if (hallado?.nombre?.trim()) return hallado.nombre.trim();
  }
  return '—';
}

export function nombreEstado(req: Requerimiento): string {
  return req.estado?.nombre_estado?.trim() || 'Sin estado';
}

/**
 * Convierte la lista a exportar en items con código, orden y nombres legibles.
 * `listaAExportar` debe venir en el orden de la pantalla. El identificador es
 * el mismo que se ve (`codigo` guardado en la base); los requerimientos
 * anteriores a la numeración muestran "Sin código", igual que en la pantalla
 * no tienen insignia.
 */
export function prepararItems(
  listaAExportar: Array<Requerimiento>,
  patrones: Array<Patron>
): Array<ItemExportacion> {
  return listaAExportar.map((req, i) => ({
    codigo: codigoDe(req) ?? 'Sin código',
    orden: i + 1,
    requerimiento: req,
    tipoFurps: nombreTipoFurps(req),
    patron: nombrePatron(req, patrones),
    modelo: nombreModelo(req),
    estado: nombreEstado(req),
  }));
}

/** Agrupa items por tipo FURPS manteniendo el orden de primera aparición. */
export function agruparPorTipo(
  items: Array<ItemExportacion>
): Array<{ tipo: string; items: Array<ItemExportacion> }> {
  const grupos = new Map<string, Array<ItemExportacion>>();
  for (const item of items) {
    const lista = grupos.get(item.tipoFurps) ?? [];
    lista.push(item);
    grupos.set(item.tipoFurps, lista);
  }
  return [...grupos.entries()].map(([tipo, lista]) => ({ tipo, items: lista }));
}

function fechaCorta(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fechaArchivo(d: Date): string {
  return fechaCorta(d).replaceAll('-', '');
}

/** Nombre de archivo seguro para la descarga (conserva letras, ñ y acentos). */
export function nombreArchivo(
  proyecto: Proyecto,
  formato: FormatoExportacion,
  ahora = new Date()
): string {
  const extension = formato === 'markdown' ? 'md' : formato === 'word' ? 'doc' : 'pdf';
  const base = (proyecto.nombre || 'proyecto')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9áéíóúüñç\-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'proyecto';
  return `especificacion-${base}-${fechaArchivo(ahora)}.${extension}`;
}

function citaMarkdown(texto: string): string {
  return texto
    .split('\n')
    .map((linea) => (linea.trim() === '' ? '>' : `> ${linea}`))
    .join('\n');
}

/** Documento Markdown con nombre/descripción del proyecto y la lista numerada. */
export function generarMarkdown(
  proyecto: Proyecto,
  items: Array<ItemExportacion>,
  agrupacion: AgrupacionExportacion,
  ahora = new Date()
): string {
  const lineas: string[] = [];
  lineas.push(`# Especificación de requerimientos — ${proyecto.nombre}`);
  lineas.push('');
  lineas.push((proyecto.descripcion || 'Sin descripción.').trim());
  lineas.push('');
  lineas.push(`- Fecha de exportación: ${fechaCorta(ahora)}`);
  lineas.push(`- Total de requerimientos: ${items.length}`);
  if (proyecto.tipos_sistema?.nombre) {
    lineas.push(`- Tipo de sistema: ${proyecto.tipos_sistema.nombre}`);
  }
  lineas.push('');
  lineas.push('---');
  lineas.push('');

  const pintarItem = (item: ItemExportacion) => {
    lineas.push(`## ${item.codigo} · ${item.tipoFurps}`);
    lineas.push('');
    lineas.push(citaMarkdown(item.requerimiento.enunciado));
    lineas.push('');
    lineas.push(`- **Identificador:** ${item.codigo}`);
    lineas.push(`- **Tipo FURPS:** ${item.tipoFurps}`);
    lineas.push(`- **Patrón:** ${item.patron}`);
    lineas.push(`- **Modelo:** ${item.modelo}`);
    lineas.push(`- **Estado:** ${item.estado}`);
    lineas.push('');
  };

  if (agrupacion === 'tipo') {
    for (const grupo of agruparPorTipo(items)) {
      lineas.push(`# ${grupo.tipo} (${grupo.items.length})`);
      lineas.push('');
      grupo.items.forEach(pintarItem);
    }
  } else {
    items.forEach(pintarItem);
  }

  return lineas.join('\n');
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Documento HTML compatible con Word (.doc): encabezado del proyecto y una
 * tabla por requerimiento con identificador, texto, tipo FURPS y patrón.
 * Se descarga con BOM UTF-8 para conservar acentos y ñ.
 */
export function generarHtmlParaWord(
  proyecto: Proyecto,
  items: Array<ItemExportacion>,
  agrupacion: AgrupacionExportacion,
  ahora = new Date()
): string {
  const filas = (lista: Array<ItemExportacion>) =>
    lista
      .map(
        (item) => `
      <h3>${escaparHtml(`${item.codigo} · ${item.tipoFurps}`)}</h3>
      <table border="1" cellspacing="0" cellpadding="6" width="100%">
        <tr><td width="22%"><b>Identificador</b></td><td>${escaparHtml(item.codigo)}</td></tr>
        <tr><td><b>Texto</b></td><td style="white-space: pre-wrap;">${escaparHtml(item.requerimiento.enunciado)}</td></tr>
        <tr><td><b>Tipo FURPS</b></td><td>${escaparHtml(item.tipoFurps)}</td></tr>
        <tr><td><b>Patrón</b></td><td>${escaparHtml(item.patron)}</td></tr>
        <tr><td><b>Modelo</b></td><td>${escaparHtml(item.modelo)}</td></tr>
        <tr><td><b>Estado</b></td><td>${escaparHtml(item.estado)}</td></tr>
      </table>`
      )
      .join('\n');

  const cuerpo =
    agrupacion === 'tipo'
      ? agruparPorTipo(items)
          .map(
            (grupo) => `<h2>${escaparHtml(`${grupo.tipo} (${grupo.items.length})`)}</h2>\n${filas(grupo.items)}`
          )
          .join('\n')
      : filas(items);

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escaparHtml(`Especificación — ${proyecto.nombre}`)}</title></head>
<body>
<h1>${escaparHtml(`Especificación de requerimientos — ${proyecto.nombre}`)}</h1>
<p>${escaparHtml((proyecto.descripcion || 'Sin descripción.').trim())}</p>
<p>Fecha de exportación: ${escaparHtml(fechaCorta(ahora))} · Total de requerimientos: ${items.length}${proyecto.tipos_sistema?.nombre ? ` · Tipo de sistema: ${escaparHtml(proyecto.tipos_sistema.nombre)}` : ''}</p>
<hr>
${cuerpo}
</body>
</html>`;
}

function descargarBlob(contenido: BlobPart, nombre: string, mime: string): void {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga el Markdown generado en el navegador. */
export function exportarMarkdown(
  proyecto: Proyecto,
  items: Array<ItemExportacion>,
  agrupacion: AgrupacionExportacion
): string {
  const contenido = generarMarkdown(proyecto, items, agrupacion);
  const nombre = nombreArchivo(proyecto, 'markdown');
  descargarBlob(contenido, nombre, 'text/markdown;charset=utf-8');
  return nombre;
}

/** Descarga el documento Word (.doc HTML) generado en el navegador. */
export function exportarWord(
  proyecto: Proyecto,
  items: Array<ItemExportacion>,
  agrupacion: AgrupacionExportacion
): string {
  // BOM UTF-8 para que Word conserve acentos, ñ y textos largos.
  const contenido = `﻿${generarHtmlParaWord(proyecto, items, agrupacion)}`;
  const nombre = nombreArchivo(proyecto, 'word');
  descargarBlob(contenido, nombre, 'application/msword;charset=utf-8');
  return nombre;
}

/**
 * Genera y descarga el PDF en el navegador con jsPDF (import dinámico para no
 * romper el render estático). Maneja textos largos con salto de línea y
 * conserva caracteres en español con las fuentes WinAnsi.
 */
export async function exportarPdf(
  proyecto: Proyecto,
  items: Array<ItemExportacion>,
  agrupacion: AgrupacionExportacion
): Promise<string> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const anchoPagina = doc.internal.pageSize.getWidth();
  const altoPagina = doc.internal.pageSize.getHeight();
  const margen = 15;
  const anchoUtil = anchoPagina - margen * 2;
  let y = margen;

  const ahora = new Date();
  const necesitaSalto = (altoNecesario: number) => {
    if (y + altoNecesario > altoPagina - margen) {
      doc.addPage();
      y = margen;
    }
  };

  const escribirEnvuelto = (
    texto: string,
    tamaño: number,
    estilo: 'normal' | 'bold',
    color: [number, number, number],
    interlineado: number
  ) => {
    doc.setFont('helvetica', estilo);
    doc.setFontSize(tamaño);
    doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(texto, anchoUtil) as string[];
    for (const linea of lineas) {
      necesitaSalto(interlineado);
      doc.text(linea, margen, y);
      y += interlineado;
    }
  };

  escribirEnvuelto(`Especificación de requerimientos — ${proyecto.nombre}`, 16, 'bold', [24, 24, 27], 8);
  escribirEnvuelto((proyecto.descripcion || 'Sin descripción.').trim(), 10, 'normal', [82, 82, 91], 5);
  escribirEnvuelto(
    `Fecha: ${fechaCorta(ahora)} · Total: ${items.length}${proyecto.tipos_sistema?.nombre ? ` · Tipo de sistema: ${proyecto.tipos_sistema.nombre}` : ''}`,
    9,
    'normal',
    [113, 113, 122],
    5
  );
  necesitaSalto(4);
  doc.setDrawColor(212, 212, 216);
  doc.line(margen, y, margen + anchoUtil, y);
  y += 6;

  const pintarItem = (item: ItemExportacion) => {
    const titulo = `${item.codigo} · ${item.tipoFurps}`;
    const meta = `Patrón: ${item.patron} · Modelo: ${item.modelo} · Estado: ${item.estado}`;
    // Reserva aproximada: título + texto + metadatos.
    const lineasTexto = (doc.splitTextToSize(item.requerimiento.enunciado, anchoUtil) as string[]).length;
    necesitaSalto(6 + lineasTexto * 4.5 + 10);
    escribirEnvuelto(titulo, 11, 'bold', [24, 24, 27], 6);
    escribirEnvuelto(item.requerimiento.enunciado, 9.5, 'normal', [39, 39, 42], 4.5);
    escribirEnvuelto(meta, 8.5, 'normal', [113, 113, 122], 4.5);
    y += 3;
  };

  if (agrupacion === 'tipo') {
    for (const grupo of agruparPorTipo(items)) {
      necesitaSalto(12);
      escribirEnvuelto(`${grupo.tipo} (${grupo.items.length})`, 12, 'bold', [37, 99, 235], 7);
      grupo.items.forEach(pintarItem);
    }
  } else {
    items.forEach(pintarItem);
  }

  const totalPaginas = doc.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(161, 161, 170);
    doc.text(`Página ${i} de ${totalPaginas}`, anchoPagina - margen, altoPagina - 10, { align: 'right' });
  }

  const nombre = nombreArchivo(proyecto, 'pdf');
  doc.save(nombre);
  return nombre;
}
