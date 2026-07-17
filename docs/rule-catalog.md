# BOQ Lint v0.1.0 辅助检查规则目录

本文定义 BOQ Lint（清单校核）v0.1.0 的规则契约。规则用于工程量清单 Excel 数据质量辅助检查，不是标准条文复刻、合规认证或专业审核结论。

## 统一规则契约

每条规则包含：

- `id`
- `name`
- `description`
- `severity`
- `category`
- `applicableRowTypes`
- `check()`
- `remediation`
- `enabledByDefault`

所有规则均可在结果页单独启用或关闭，并支持恢复默认规则。规则按 `QG001` 至 `QG014` 的固定顺序运行；相同工作表、Excel 行号、字段和规则不得重复报错。

每条问题至少记录工作表、Excel 行号、字段、原值、问题说明和修改建议。跨行规则还应记录全部相关行号。

## 适用行

行分类至少区分：

- `item`：清单项目行；
- `section`：分部或章节标题行；
- `total`：小计、合计或总计行；
- `note`：备注行；
- `blank`：空白行。

QG001–QG013 只对声明的清单项目行运行。分部标题、合计行、备注行和空白行不得套用项目必填规则。QG014 可根据工作表结构与项目数据区域运行。

## QG001 项目名称缺失

- **severity**：error
- **category**：required-field
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：项目行的项目名称为空或只包含空白。
- **修改建议**：确认字段映射；映射正确时，在原工作簿补充可识别的项目名称。

## QG002 计量单位缺失

- **severity**：error
- **category**：required-field
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：项目行的计量单位为空或只包含空白。
- **修改建议**：确认字段映射和计量口径，在原工作簿补充单位。

## QG003 工程量无效

- **severity**：error
- **category**：numeric
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：工程量不是有限数值，或工程量小于零。
- **边界**：工程量等于零不属于本规则，由 QG004 处理。
- **修改建议**：清理文本、单位或公式错误；负数应结合调整业务核对后修正或说明。

## QG004 零工程量

- **severity**：warning
- **category**：numeric
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：有效工程量等于零。
- **修改建议**：确认是否为占位、暂不计量或录入错误，并保留业务依据。

## QG005 项目编码缺失

- **severity**：warning
- **category**：coding
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：项目行没有项目编码。
- **边界**：补充项目及企业模板可能存在差异，不直接认定违规。
- **修改建议**：结合地区、行业和企业模板确认是否需要补充编码。

## QG006 编码格式可疑

- **severity**：info
- **category**：coding
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：非空编码去除空格后不是常见的 12 位数字格式。
- **边界**：不同地区、行业、补充项目和企业模板可能采用其他编码方式。
- **修改建议**：核对适用的编码规则和模板，不自动修改编码。

## QG007 重复项目编码

- **severity**：warning
- **category**：duplicate
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：同一工作表内，相同的非空规范化项目编码出现多次。
- **范围**：不同工作表之间相互隔离。
- **问题上下文**：列出该编码的全部相关 Excel 行号。
- **修改建议**：确认是允许的拆分列项、复制错误还是编码录入错误。

## QG008 疑似重复清单项

- **severity**：warning
- **category**：duplicate
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：对“规范化项目名称 + 规范化项目特征 + 规范化单位”生成的指纹完全相同，并在同一工作表出现多次。
- **边界**：只提示复核，不自动认定为重复列项。
- **问题上下文**：列出同一指纹的全部相关 Excel 行号。
- **修改建议**：结合楼层、部位、标段、特征和计量口径确认是否应合并或保留。

## QG009 项目特征描述不足

- **severity**：warning
- **category**：description
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：项目特征为空；去除空白和标点后短于集中配置的阈值；或主要内容为“详见图纸”“同上”“见设计”“按图施工”等占位表达。
- **配置**：长度阈值和占位表达集中维护，不散落在规则代码中。
- **修改建议**：结合图纸、合同和计量要求补充影响计量与组价的必要特征。

## QG010 合价计算不一致

- **severity**：error
- **category**：calculation
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发前提**：工程量、综合单价和合价均为有效数值。
- **计算**：必须使用 `decimal.js` 计算工程量 × 综合单价。
- **默认允许误差**：`max(0.01 元, |合价| × 0.1%)`。
- **触发条件**：表内合价与计算合价的绝对差额超过允许误差。
- **用户配置**：页面允许调整绝对误差和相对误差参数。
- **修改建议**：核对工程量、单价、合价、公式缓存和舍入规则。

## QG011 单价异常

- **severity**：warning
- **category**：pricing
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：有效综合单价小于零或等于零。
- **边界**：赠送项、抵扣项、调整项或暂不计价项可能具有合理业务含义，不自动判定错误。
- **修改建议**：结合合同依据、备注和计价口径确认数值。

## QG012 同类项目单价离散

- **severity**：info
- **category**：pricing
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **分组**：同一规范化项目名称和规范化单位。
- **触发前提**：组内至少 4 项具有有效综合单价，且中位数不为零。
- **默认阈值**：相对中位数偏差超过 50%。
- **用户配置**：页面允许调整偏差比例。
- **边界**：名称和单位相同不代表项目完全可比，只作为人工复核提示。
- **修改建议**：结合项目特征、部位、工艺、时间和合同口径核对价格差异。

## QG013 公式缺少缓存结果

- **severity**：warning
- **category**：formula
- **applicableRowTypes**：item
- **enabledByDefault**：true
- **触发条件**：映射字段单元格包含公式，但文件中没有可用缓存结果。
- **边界**：浏览器不计算 Excel 公式，不据此猜测数值或产生确定的计算结论。
- **修改建议**：使用 Excel 或 WPS 完整重新计算并保存，再重新导入。

## QG014 导入结构风险

- **severity**：info
- **category**：structure
- **applicableRowTypes**：item、工作表结构
- **enabledByDefault**：true
- **触发条件**：项目数据区域存在隐藏行、隐藏列，或存在影响字段读取的合并单元格。
- **降噪**：普通标题或表头合并单元格不应产生大量重复提示。
- **修改建议**：取消影响明细读取的隐藏或合并设置，或确认这些结构具有明确业务依据。

## 结果解释

“未发现问题”仅表示在所选工作表、字段映射、规则开关和参数下未命中上述辅助检查规则。它不表示：

- 图纸没有漏项；
- 项目编码符合所有地区和行业要求；
- 综合单价合理；
- 定额、合同或计量规则使用正确；
- 成果完全符合 GB/T 50500-2024；
- 可以替代专业人员复核。

> BOQ Lint 仅用于工程量清单 Excel 数据质量辅助检查，不构成造价审核结论，也不能替代图纸、合同、计量规则及专业人员复核。
