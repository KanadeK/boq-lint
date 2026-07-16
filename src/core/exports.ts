import ExcelJS from 'exceljs';

import { RULE_METADATA } from './config';
import { fieldLabel } from './fields';
import type { LintIssue, LintReport, Severity } from './types';
import { RULE_IDS } from './types';

const ISSUE_HEADERS = [
  '严重程度',
  '规则编号',
  '工作表',
  'Excel 行号',
  '字段/列',
  '项目编码',
  '项目名称',
  '原始值',
  '问题说明',
  '修复建议',
  '表内合价',
  '计算合价',
  '差额',
] as const;

const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
  error: '错误',
  warning: '警告',
  info: '提示',
};

function serializableValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.description ?? '';
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function issueRow(issue: LintIssue): readonly (string | number | boolean | null)[] {
  const field = issue.field === null ? '' : fieldLabel(issue.field);
  const fieldAndColumn = issue.column === null ? field : `${field} (${issue.column})`;
  return [
    SEVERITY_LABELS[issue.severity],
    issue.ruleId,
    issue.sheetName,
    issue.rowNumber,
    fieldAndColumn,
    issue.itemCode,
    issue.itemName,
    serializableValue(issue.originalValue),
    issue.message,
    issue.remediation,
    issue.calculation === undefined ? null : Number(issue.calculation.actual),
    issue.calculation === undefined ? null : Number(issue.calculation.expected),
    issue.calculation === undefined ? null : Number(issue.calculation.difference),
  ];
}

function escapeCsv(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function createCsvReport(report: LintReport): string {
  const rows = [ISSUE_HEADERS, ...report.issues.map(issueRow)];
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')}`;
}

export function exportCsv(report: LintReport): Blob {
  return new Blob([createCsvReport(report)], { type: 'text/csv;charset=utf-8' });
}

export interface JsonReportPayload {
  readonly appVersion: string;
  readonly file: LintReport['file'];
  readonly checkedAt: string;
  readonly mode: LintReport['mode'];
  readonly mappings: LintReport['mappings'];
  readonly ruleConfig: LintReport['ruleConfig'];
  readonly summary: LintReport['summary'];
  readonly issues: LintReport['issues'];
}

export function jsonReportPayload(report: LintReport): JsonReportPayload {
  return {
    appVersion: report.appVersion,
    file: report.file,
    checkedAt: report.checkedAt,
    mode: report.mode,
    mappings: report.mappings,
    ruleConfig: report.ruleConfig,
    summary: report.summary,
    issues: report.issues,
  };
}

export function createJsonReport(report: LintReport): string {
  return JSON.stringify(jsonReportPayload(report), null, 2);
}

export function exportJson(report: LintReport): Blob {
  return new Blob([createJsonReport(report)], { type: 'application/json;charset=utf-8' });
}

function styleHeader(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 24;
}

function severityColor(severity: Severity): string {
  if (severity === 'error') return 'FFFEE2E2';
  if (severity === 'warning') return 'FFFFF3CD';
  return 'FFE0F2FE';
}

function configureTableSheet(worksheet: ExcelJS.Worksheet, columnWidths: readonly number[]): void {
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnWidths.length },
  };
  columnWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  styleHeader(worksheet.getRow(1));
}

function addSummarySheet(workbook: ExcelJS.Workbook, report: LintReport): void {
  const sheet = workbook.addWorksheet('检查汇总');
  sheet.addRow(['项目', '内容']);
  const rows: readonly (readonly [string, string | number])[] = [
    ['应用版本', report.appVersion],
    ['文件名', report.file.name],
    ['文件大小（字节）', report.file.size],
    ['检查时间', report.checkedAt],
    ['检查模式', report.mode === 'priced' ? '已计价工程量清单' : '未计价工程量清单'],
    ['明细行数', report.summary.detailRows],
    ['已检查工作表数', report.summary.checkedSheets],
    ['错误数', report.summary.errors],
    ['警告数', report.summary.warnings],
    ['提示数', report.summary.infos],
    ['已通过规则数', report.summary.passedRules],
    ['检查耗时（毫秒）', Math.round(report.summary.durationMs)],
  ];
  rows.forEach((row) => sheet.addRow([...row]));
  configureTableSheet(sheet, [24, 50]);
}

function addIssuesSheet(workbook: ExcelJS.Workbook, report: LintReport): void {
  const sheet = workbook.addWorksheet('问题明细');
  sheet.addRow([...ISSUE_HEADERS]);
  for (const issue of report.issues) {
    const row = sheet.addRow([...issueRow(issue)]);
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: severityColor(issue.severity) },
    };
  }
  configureTableSheet(sheet, [10, 12, 18, 12, 20, 18, 24, 20, 48, 48, 14, 14, 14]);
  for (const column of [11, 12, 13]) sheet.getColumn(column).numFmt = '#,##0.00';
}

function addRulesSheet(workbook: ExcelJS.Workbook, report: LintReport): void {
  const sheet = workbook.addWorksheet('规则说明');
  sheet.addRow(['规则编号', '名称', '默认严重程度', '是否启用', '说明', '修复建议']);
  for (const ruleId of RULE_IDS) {
    const metadata = RULE_METADATA[ruleId];
    sheet.addRow([
      ruleId,
      metadata.name,
      SEVERITY_LABELS[metadata.defaultSeverity],
      report.ruleConfig.rules[ruleId].enabled ? '是' : '否',
      metadata.description,
      metadata.remediation,
    ]);
  }
  configureTableSheet(sheet, [12, 22, 14, 12, 55, 55]);
}

export async function createXlsxReport(report: LintReport): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BOQLint';
  workbook.created = new Date(report.checkedAt);
  addSummarySheet(workbook, report);
  addIssuesSheet(workbook, report);
  addRulesSheet(workbook, report);
  const buffer = await workbook.xlsx.writeBuffer();
  const view = buffer as unknown as Uint8Array;
  const copy = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  return new Uint8Array(copy);
}

export async function exportXlsx(report: LintReport): Promise<Blob> {
  const bytes = await createXlsxReport(report);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatReportFileName(fileName: string, date = new Date()): string {
  const baseName = fileName.replace(/\.xlsx$/iu, '') || '工程量清单';
  const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `${baseName}_BOQLint_检查报告_${timestamp}.xlsx`;
}
