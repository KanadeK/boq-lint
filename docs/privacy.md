# 隐私说明 / Privacy

BOQLint 的核心承诺是：**用户选择的工程量清单文件只在当前浏览器本地处理，不会上传。**

> BOQLint's core promise: **the workbook you select is processed only in the current browser and is not uploaded.**

## 数据流

```text
用户选择本地 .xlsx
        ↓
浏览器内存读取与 ExcelJS 解析
        ↓
本地表头识别、字段映射、行分类和规则检查
        ↓
页面分页展示结果
        ↓
用户主动在本地生成 CSV / JSON / XLSX 报告
```

应用没有接收工作簿的服务器端接口。托管在 GitHub Pages 时，浏览器会下载公开的 HTML、JavaScript、CSS 和用户主动选择的虚构示例资源；这与上传用户文件不同。

## 不收集的内容

BOQLint 不会：

- 上传原始 Excel、解析后的单元格、字段映射或检查结果；
- 使用后端、数据库、账号、登录、云存储或跨设备同步；
- 调用 AI、LLM、DeepSeek、OpenAI 或第三方识别 API；
- 使用产品遥测、行为分析、统计、广告或用户画像；
- 把工作簿内容、文件名或检查结果写入 `localStorage`、`sessionStorage`、IndexedDB 或 Cookie；
- 在刷新页面后恢复上次检查的工程数据；或
- 自动把导出报告发送给维护者或其他服务。

## 在浏览器中保留什么

在当前页面打开期间，应用需要在内存中持有：

- 文件字节和 ExcelJS 工作簿对象；
- 工作表、单元格、公式缓存和结构快照；
- 用户确认的表头、字段映射和检查模式；以及
- 问题列表、筛选条件和原始行上下文。

点击“清除文件与结果”、刷新或关闭页面后，应用会释放这些引用。JavaScript 运行时和操作系统何时回收底层内存由浏览器/系统决定。

`localStorage` 仅用于非工程数据偏好：语言、浅色/深色主题和经过结构校验的规则配置。规则配置不包含文件名、单元格、项目编码、项目名称或问题结果。

## 网络行为

### 在线版

打开 GitHub Pages 在线版时会发生普通静态资源请求，例如页面、脚本、样式和内置虚构示例。GitHub 作为托管方可能根据其自身政策处理 IP 地址、User-Agent、访问时间等常规访问元数据。

用户导入本地工作簿后，解析、映射、检查和报告导出不需要上传请求。自动化测试会监听网络，并确认处理文件期间没有发送工作簿内容。

### 单文件离线版

`release/boq-lint-v0.1.0.html` 内联脚本、样式和必要资源，可通过 `file://` 双击打开。导入、检查和导出不应产生网络请求。请从可信发布来源获取文件并校验配套 SHA-256。

## 公式、宏和外部内容

- BOQLint 不执行工作簿宏。
- BOQLint 不充当 Excel/WPS 公式计算引擎；只读取文件中的公式文本和缓存结果。
- 公式错误会报告；缺少缓存结果时只提示无法确认，不猜测数值。
- 不跟随工作簿中的外部链接，也不加载嵌入的外部资源。
- 单元格和工作表名称按不可信文本渲染，不作为 HTML 执行。

## 导出文件

报告只在用户点击导出时于本地生成。报告会包含定位和修复所需的信息，例如原文件基础信息、工作表、Excel 行号、项目编码、原始值和问题说明，因此导出的报告也可能是敏感工程资料。

用户应按照所在组织的工程资料制度保护报告，包括访问权限、下载目录、备份、邮件和共享渠道。BOQLint 不控制用户保存报告后的传播。

## 用户环境仍然重要

本地处理不能防止以下环境访问数据：

- 获得页面读取权限的浏览器扩展；
- 恶意软件、远程控制、屏幕录制或剪贴板工具；
- 操作系统交换文件、崩溃转储、备份和同步目录；
- 共享电脑上的其他用户；
- 用户主动复制、截图、下载或发送的内容；或
- 被篡改的非官方构建。

处理敏感项目时，应使用受管设备和可信浏览器，限制扩展权限，从可信来源打开应用，校验离线文件，并妥善管理导出目录。

## 自行验证

可以用浏览器开发者工具验证本地处理边界：

1. 打开 Network 面板并完成页面静态资源加载。
2. 清空请求列表。
3. 导入一份完全虚构的本地 `.xlsx`。
4. 完成映射、检查和三种报告导出。
5. 确认没有包含工作簿内容的上传请求。

如果发现疑似数据外传，请按照 [SECURITY.md](../SECURITY.md) 私密报告，不要附真实工程文件。

## 隐私边界变更

任何后端、文件上传、工程数据持久化、账号、遥测、第三方 API 或 AI 能力都属于重大隐私边界变更。此类变化必须公开讨论、更新架构和隐私文档、取得明确授权并补充安全测试，不能作为普通改动静默加入。

---

**English summary:** BOQLint reads the selected `.xlsx` in browser memory, performs mapping and checks locally, and creates reports locally after a user action. It has no backend, accounts, database, telemetry, advertising, AI, or workbook upload. Only language, theme, and validated rule settings may be stored locally; workbook content, file names, mappings, and results are not persisted. Static hosting may receive ordinary page-resource request metadata under the host's own policy.
