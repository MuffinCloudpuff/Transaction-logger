<div align="center">
  <img width="100%" alt="TradeTracker AI Banner" src="https://via.placeholder.com/1200x400/2563eb/ffffff?text=TradeTracker+AI+%7C+Smart+Reselling+Assistant" />

  <h1>TradeTracker AI 💰</h1>
  <h3>深度集成的 AI 二手交易记账与财务分析助手</h3>
  <p>
    专为“闲鱼/二手”交易者设计，解决买卖时间错位痛点，实现从进货到出货的完美数据闭环。
  </p>

  <p>
    <a href="https://github.com/yourusername/tradetracker-ai/graphs/contributors">
      <img src="https://img.shields.io/badge/Contributors-Welcome-orange" alt="contributors" />
    </a>
    <a href="">
      <img src="https://img.shields.io/badge/AI-Gemini%20Powered-4285F4" alt="AI Powered" />
    </a>
    <a href="">
      <img src="https://img.shields.io/badge/License-MIT-green" alt="license" />
    </a>
  </p>
</div>

**View your app in AI Studio:** https://ai.studio/apps/drive/1avnVpjKQcmQ098CYblDA1hvCgIAzTdfB

---

## 📖 Introduction (项目介绍)

**TradeTracker AI** 是一个以“对账”为核心逻辑的专业记账工具。它不只是简单的记录流水，而是通过 AI 辅助用户完成从“进货”到“出货”的数据管理。它解决了传统记账软件无法很好处理“买入”和“卖出”时间错位、需要后期痛苦对账的痛点。

### 核心逻辑：三态数据管理
系统将交易数据严格划分为三种状态，完美契合倒卖业务流：
* 📦 **库存 (Inventory):** 已花钱买入，但尚未卖出的商品。
* 💰 **孤立出售 (Orphan Sales):** 已收到钱卖出，但尚未关联买入成本的记录（如直接导入的截图）。
* ✅ **闭环交易 (Closed Loop):** 既有买入成本也有卖出收入，用于计算真实的净利润和回报率 (ROI)。

---

## ✨ Key Features (核心功能)

### 1. 🧠 智能对账中心 (Smart Match View)
这是本项目的核心亮点。
* **双栏布局 & AI 匹配:** 左侧显示“待对账买入”，右侧显示“孤立卖出”。点击买入物品，AI 自动根据名称相似度排序，瞬间找到对应的卖出记录。
* **一键合并:** 确认匹配后，两条独立记录合并为“闭环交易”，自动计算利润。
* **AI 截图导入:** 支持上传闲鱼/订单长截图，AI 自动切片、OCR 提取商品名称、价格和日期，自动归类入库。

### 2. 📊 财务报表 (Financial Intelligence)
类似股票软件的 F10 深度分析：
* **资金权益走势:** 面积图展示累计投入、回款和净利润的时间变化。
* **AI 财务顾问:** 集成 **Gemini AI**，根据当前报表数据生成文字版投资建议（如“库存周转率过低”、“电子产品利润率高”等）。
* **多维分析:** 包含月度收支柱状图、库存资金分布饼图、利润贡献分析。

### 3. 🛠 交易管理与数据安全
* **智能拆分 (Smart Unmerge):** 删除“闭环交易”时，自动利用备注历史还原为“库存”和“出售”两条记录，防止数据丢失。
* **AI 智能填单:** 粘贴一段复杂的商品描述（如“99新 iPhone 13...2500元”），AI 自动提取关键信息填入表单。
* **数据安全:** 支持 JSON 全量导出与导入（含容错解析与自动修复）。

---

## 🚀 Run Locally (本地运行)

**Prerequisites:** Node.js (Version 16+)

1.  **Clone the project**
    ```bash
    git clone [https://github.com/your-username/tradetracker-ai.git](https://github.com/your-username/tradetracker-ai.git)
    cd tradetracker-ai
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Configure Environment**
    Create a `.env.local` file in the root directory and add your Gemini API Key:
    ```env
    NEXT_PUBLIC_GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the app**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
