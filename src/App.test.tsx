import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { getMessages } from './ui/i18n';
import { MappingStep } from './ui/MappingStep';
import { ResultsStep } from './ui/ResultsStep';
import type { SheetMapping, UiIssue, UiResult } from './ui/types';

const matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

function fakeIssue(index: number): UiIssue {
  const severities = ['error', 'warning', 'info'] as const;
  const ruleIds = ['REQ-001', 'CALC-001', 'STRUCT-003'] as const;
  const rowNumber = index + 2;
  return {
    id: `issue-${index}`,
    severity: severities[index % severities.length] ?? 'error',
    ruleId: ruleIds[index % ruleIds.length] ?? 'REQ-001',
    sheetName: index % 2 === 0 ? '分部分项' : '措施项目',
    rowNumber,
    field: index % 2 === 0 ? 'item_code' : 'total_price',
    itemCode: `CODE-${String(index).padStart(2, '0')}`,
    itemName: `虚构清单项目 ${index}`,
    originalValue: String(index),
    message: `第 ${rowNumber} 行演示问题`,
    suggestion: '复核虚构演示数据。',
    context: [
      {
        rowNumber,
        isIssueRow: true,
        values: {
          item_code: `CODE-${String(index).padStart(2, '0')}`,
          item_name: `虚构清单项目 ${index}`,
        },
      },
    ],
    ...(index % 3 === 1 ? { calculatedValue: '12.00', difference: '1.00' } : {}),
  };
}

function fakeResult(issueCount = 28): UiResult {
  const issues = Array.from({ length: issueCount }, (_, index) => fakeIssue(index));
  return {
    checkedAt: '2026-07-15T12:00:00.000Z',
    summary: {
      totalRows: 36,
      sheetsChecked: 2,
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
      infos: issues.filter((issue) => issue.severity === 'info').length,
      passedRules: 11,
      durationMs: 243,
    },
    issues,
  };
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: matchMedia });
});

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('boq-lint:locale', 'zh-CN');
  window.history.replaceState({}, '', '/');
  document.documentElement.removeAttribute('data-theme');
});

describe('App', () => {
  it('呈现四步式、本地处理的双模式导入首页', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '交付前，先把清单查一遍' })).toBeInTheDocument();
    expect(screen.getByTestId('privacy-message')).toHaveTextContent(
      '文件仅在本机浏览器中处理，不会上传',
    );
    expect(screen.getByText(/不生成价格，不修改原工作簿，不替代造价工程师/)).toBeInTheDocument();
    expect(screen.getByTestId('mode-unpriced')).toBeChecked();
    expect(screen.getByTestId('mode-priced')).not.toBeChecked();
    expect(screen.getByTestId('sample-valid')).toBeEnabled();
    expect(screen.getByTestId('sample-issues')).toBeEnabled();

    for (const step of ['import', 'mapping', 'check', 'results']) {
      expect(screen.getByTestId(`step-${step}`)).toBeInTheDocument();
    }
  });

  it('用可理解的中文拒绝旧版和非 xlsx 文件', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    const input = screen.getByLabelText('选择工程量清单 xlsx 文件');

    await user.upload(
      input,
      new File(['legacy'], 'legacy.xls', { type: 'application/vnd.ms-excel' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('暂不支持旧版 .xls 文件');

    await user.upload(
      input,
      new File(['macro'], 'macro.xlsm', { type: 'application/octet-stream' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('仅支持 .xlsx 文件');
  });

  it('切换整页语言和主题并保存非工作簿偏好', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByTestId('theme-toggle'), 'dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('boq-lint:theme')).toBe('dark');

    await user.click(screen.getByTestId('language-toggle'));
    expect(
      screen.getByRole('heading', { name: 'Check your BOQ before delivery' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('privacy-message')).toHaveTextContent('never uploaded');
    expect(document.documentElement.lang).toBe('en');
    expect(window.localStorage.getItem('boq-lint:locale')).toBe('en');
  });

  it('规则设置锁定核心规则、保存有效误差并可恢复默认值', async () => {
    const user = userEvent.setup();
    render(<App />);
    const settingsButton = screen.getByTestId('settings-button');

    await user.click(settingsButton);
    const drawer = screen.getByTestId('settings-drawer');
    expect(within(drawer).getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('rule-toggle-REQ-001')).toBeDisabled();
    expect(screen.getByTestId('rule-toggle-QTY-001')).toBeChecked();

    await user.click(screen.getByTestId('rule-toggle-QTY-001'));
    expect(screen.getByTestId('rule-toggle-QTY-001')).not.toBeChecked();

    const tolerance = screen.getByTestId('calc-tolerance');
    await user.clear(tolerance);
    await user.type(tolerance, '0.05');
    await user.tab();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('boq-lint:rule-config:v1') ?? '{}') as {
        calcTolerance?: string;
      };
      expect(saved.calcTolerance).toBe('0.05');
    });

    await user.click(screen.getByTestId('restore-defaults'));
    expect(screen.getByTestId('calc-tolerance')).toHaveValue(0.01);
    expect(screen.getByTestId('rule-toggle-QTY-001')).toBeChecked();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    expect(settingsButton).toHaveFocus();
  });

  it('通过 social 查询参数呈现固定尺寸的社交预览场景', () => {
    window.history.replaceState({}, '', '/?social=1');
    render(<App />);

    expect(screen.getByTestId('social-preview')).toBeInTheDocument();
    expect(screen.getByText('把问题定位到工作表、行号和字段')).toBeInTheDocument();
    expect(screen.queryByTestId('app-header')).not.toBeInTheDocument();
  });
});

describe('MappingStep', () => {
  const sheet: SheetMapping = {
    id: '1',
    name: '分部分项',
    state: 'visible',
    selected: true,
    headerRow: 3,
    headerConfidence: 0.82,
    headers: [
      { column: 1, text: '项目编码' },
      { column: 2, text: '项目名称' },
      { column: 3, text: '计量单位' },
      { column: 4, text: '工程量' },
    ],
    previewRows: [
      {
        rowNumber: 4,
        cells: [
          { column: 1, text: 'DEMO-001' },
          { column: 2, text: '虚构项目' },
          { column: 3, text: 'm²' },
          { column: 4, text: '12' },
        ],
      },
    ],
    mapping: { item_code: 1, item_name: 2, unit: 3, quantity: 4 },
    maxRow: 4,
    maxColumn: 4,
  };

  it('暴露稳定的表选择、表头、字段映射、预览和检查入口', async () => {
    const user = userEvent.setup();
    const onMappingChange = vi.fn();
    const onRun = vi.fn();
    render(
      <MappingStep
        messages={getMessages('zh-CN')}
        mode="unpriced"
        sheets={[sheet]}
        error={null}
        ready
        onToggleSheet={vi.fn()}
        onSelectAll={vi.fn()}
        onHeaderRowChange={vi.fn()}
        onMappingChange={onMappingChange}
        onBack={vi.fn()}
        onRun={onRun}
      />,
    );

    expect(screen.getByTestId('sheet-checkbox-0')).toBeChecked();
    expect(screen.getByTestId('header-row-0')).toHaveValue(3);
    expect(screen.getByTestId('preview-table')).toHaveTextContent('DEMO-001');
    await user.selectOptions(screen.getByTestId('mapping-item_code'), '2');
    expect(onMappingChange).toHaveBeenCalledWith('1', 'item_code', 2);
    await user.click(screen.getByTestId('run-check'));
    expect(onRun).toHaveBeenCalledOnce();
  });
});

describe('ResultsStep', () => {
  it('支持严重程度、规则、工作表、搜索、分页和原始行上下文', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(
      <ResultsStep
        locale="zh-CN"
        messages={getMessages('zh-CN')}
        result={fakeResult()}
        exporting={null}
        exportError={null}
        onExport={onExport}
        onBack={vi.fn()}
        onRecheck={vi.fn()}
        onNewFile={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId(/^issue-row-/u)).toHaveLength(25);
    expect(screen.getByText('第 1 页，共 2 页')).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId('severity-filter'), 'error');
    expect(screen.getAllByTestId(/^issue-row-/u)).toHaveLength(10);
    expect(screen.getAllByText('错误').length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByTestId('rule-filter'), 'CALC-001');
    expect(screen.queryAllByTestId(/^issue-row-/u)).toHaveLength(0);
    expect(screen.getByTestId('no-filtered-results')).toBeInTheDocument();

    await user.click(screen.getByTestId('clear-filters'));
    await user.selectOptions(screen.getByTestId('sheet-filter'), '措施项目');
    expect(screen.getAllByTestId(/^issue-row-/u)).toHaveLength(14);

    await user.click(screen.getByTestId('clear-filters'));
    await user.type(screen.getByTestId('issue-search'), 'CODE-27');
    expect(screen.getAllByTestId(/^issue-row-/u)).toHaveLength(1);
    expect(screen.getByTestId('issues-table')).toHaveTextContent('CODE-27');

    await user.click(screen.getByRole('button', { name: '查看第 29 行上下文' }));
    expect(screen.getByTestId('issue-context')).toHaveTextContent('虚构清单项目 27');
    await user.click(screen.getByTestId('close-context'));
    expect(screen.queryByTestId('issue-context')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('clear-filters'));
    await user.click(screen.getByTestId('next-page'));
    expect(screen.getByText('第 2 页，共 2 页')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^issue-row-/u)).toHaveLength(3);

    for (const format of ['csv', 'json', 'xlsx'] as const) {
      await user.click(screen.getByTestId(`export-${format}`));
      expect(onExport).toHaveBeenCalledWith(format);
    }
  });

  it('无问题时显示克制的通过状态和全部摘要指标', () => {
    render(
      <ResultsStep
        locale="zh-CN"
        messages={getMessages('zh-CN')}
        result={fakeResult(0)}
        exporting={null}
        exportError={null}
        onExport={vi.fn()}
        onBack={vi.fn()}
        onRecheck={vi.fn()}
        onNewFile={vi.fn()}
      />,
    );

    expect(screen.getByTestId('no-severe-issues')).toHaveTextContent(
      '不代表符合任何国家、行业或地方标准',
    );
    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
    expect(screen.getByTestId('warning-count')).toHaveTextContent('0');
    expect(screen.getByTestId('info-count')).toHaveTextContent('0');
    expect(screen.getByTestId('export-csv')).toBeEnabled();
    expect(screen.getByTestId('export-json')).toBeEnabled();
    expect(screen.getByTestId('export-xlsx')).toBeEnabled();
  });
});
