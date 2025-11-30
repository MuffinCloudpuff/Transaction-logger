import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Transaction, TradeStats, FilterType } from './types';
import { SummaryCards } from './components/SummaryCards';
import { TransactionList } from './components/TransactionList';
import { TransactionForm } from './components/TransactionForm';
import { FinancialCharts } from './components/FinancialCharts';
import { MatchView } from './components/MatchView';
import { analyzeTradePerformance, analyzeTradeScreenshots, batchSmartCategorize } from './services/geminiService';
import { Plus, BrainCircuit, PieChart as ChartIcon, List, Link as LinkIcon, Loader2, CheckCircle2, Package, ShoppingBag, Download, Upload, Layers, X, FileJson, AlertTriangle, FileUp, Trash2, Split } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('tradeTracker_transactions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load transactions", e);
      return [];
    }
  });
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  
  // Delete Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, type: 'SPLIT' | 'DELETE', title: string } | null>(null);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [overrideConfirm, setOverrideConfirm] = useState(false);
  
  // Default to Closed Loop (Matched) as requested
  const [filter, setFilter] = useState<FilterType>(FilterType.CLOSED_LOOP);
  const [viewMode, setViewMode] = useState<'LIST' | 'CHARTS' | 'MATCH'>('LIST');
  const [isProcessingImport, setIsProcessingImport] = useState(false);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem('tradeTracker_transactions', JSON.stringify(transactions));
  }, [transactions]);

  // --- Calculations ---
  const stats: TradeStats = useMemo(() => {
    let totalInvested = 0;
    let totalRevenue = 0;
    let closedLoopProfit = 0;
    let closedLoopCost = 0;
    let closedLoopCount = 0;
    let soldCount = 0;

    transactions.forEach(t => {
      totalInvested += t.buyPrice;
      if (t.isSold) {
        totalRevenue += t.sellPrice;
        soldCount++;
        
        // Only calculate profit for "Closed Loop" transactions (Valid Buy + Valid Sell)
        if (t.buyPrice > 0 && t.sellPrice > 0) {
          const shipping = t.shippingCost || 0;
          // Platform Fee: (SellPrice + Shipping) * 0.6%
          const fee = (t.sellPrice + shipping) * 0.006;
          
          // Net Profit = Sell - Buy - Shipping - Fee
          const netProfit = t.sellPrice - t.buyPrice - shipping - fee;
          
          closedLoopProfit += netProfit;
          closedLoopCost += t.buyPrice;
          closedLoopCount++;
        }
      }
    });

    const closedLoopRoi = closedLoopCost > 0 ? (closedLoopProfit / closedLoopCost) * 100 : 0;

    return {
      totalInvested,
      totalRevenue,
      closedLoopProfit,
      closedLoopRoi,
      itemCount: transactions.length,
      soldCount,
      closedLoopCount
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    switch (filter) {
      case FilterType.CLOSED_LOOP:
        // Both Buy and Sell prices exist
        return transactions.filter(t => t.buyPrice > 0 && t.sellPrice > 0);
      case FilterType.INVENTORY:
        // Has Buy Price, but Sell Price is 0 (Unsold or price not entered)
        return transactions.filter(t => t.buyPrice > 0 && t.sellPrice === 0);
      case FilterType.ORPHAN_SALES:
        // No Buy Price, but Has Sell Price
        return transactions.filter(t => t.buyPrice === 0 && t.sellPrice > 0);
      case FilterType.ALL:
      default: 
        return transactions;
    }
  }, [transactions, filter]);

  // --- Handlers ---
  const handleSave = (transaction: Transaction) => {
    // 1. Optimistic Update (Immediate UI response)
    if (editingTransaction) {
      setTransactions(prev => prev.map(t => t.id === transaction.id ? transaction : t));
    } else {
      setTransactions(prev => [transaction, ...prev]);
    }
    setEditingTransaction(null);

    // 2. Background AI Auto-Tagging
    const needsTagging = !transaction.smartType || (editingTransaction && editingTransaction.name !== transaction.name);
    
    if (needsTagging && transaction.name.trim()) {
        console.log(`Triggering auto-tag for: ${transaction.name}`);
        batchSmartCategorize([transaction.name])
            .then(categoryMap => {
                const newTag = categoryMap[transaction.name];
                if (newTag) {
                    setTransactions(prev => prev.map(t => 
                        t.id === transaction.id ? { ...t, smartType: newTag } : t
                    ));
                }
            })
            .catch(err => console.error("Auto-tagging failed silently", err));
    }
  };

  const handleDirectFileUpload = async (files: File[], type: 'BUY' | 'SELL') => {
    setIsProcessingImport(true);
    try {
      const items = await analyzeTradeScreenshots(files, type);
      
      const newTransactions: Transaction[] = items.map(item => ({
        id: crypto.randomUUID(),
        name: item.name,
        category: 'Electronics', // Default
        buyPrice: type === 'BUY' ? item.price : 0,
        sellPrice: type === 'SELL' ? item.price : 0,
        isSold: type === 'SELL',
        date: item.date,
        sellDate: type === 'SELL' ? item.date : undefined,
        notes: item.originalText ? `From Screenshot: ${item.name}` : '',
        // Default shipping for Sales: STO 5.6
        shippingCost: type === 'SELL' ? 5.6 : undefined,
        shippingMethod: type === 'SELL' ? 'STO' : undefined
      }));

      setTransactions(prev => [...newTransactions, ...prev]);
    } catch (e) {
      alert("识别失败，请重试");
    } finally {
      setIsProcessingImport(false);
    }
  };

  const handleSmartCategorize = async () => {
    setIsProcessingImport(true);
    try {
      // Find items that don't have a smartType yet
      const itemsToTag = transactions.filter(t => !t.smartType);
      
      if (itemsToTag.length === 0) {
        alert("所有物品都已分类完毕！");
        return;
      }
      
      // Batch them (Gemini can handle decent sized lists)
      const names = itemsToTag.map(t => t.name);
      
      // Call Service
      const categoryMap = await batchSmartCategorize(names);
      
      // Update State
      setTransactions(prev => prev.map(t => {
        if (categoryMap[t.name]) {
          return { ...t, smartType: categoryMap[t.name] };
        }
        return t;
      }));
      
    } catch (e) {
      console.error(e);
      alert("AI分类失败，请重试");
    } finally {
      setIsProcessingImport(false);
    }
  };

  const handleMerge = (buyId: string, sellId: string) => {
    setTransactions(prev => {
      const buyItem = prev.find(t => t.id === buyId);
      const sellItem = prev.find(t => t.id === sellId);
      
      if (!buyItem || !sellItem) return prev;

      // Update the Buy Item to include Sell info (closing the loop)
      const updatedBuyItem: Transaction = {
        ...buyItem,
        sellPrice: sellItem.sellPrice,
        isSold: true,
        sellDate: sellItem.date, // Preserve the actual sale date
        notes: (buyItem.notes || '') + ` | Sold Match: ${sellItem.name}`,
        // Inherit shipping info from the sales record, or default to STO 5.6 if missing
        shippingCost: sellItem.shippingCost !== undefined ? sellItem.shippingCost : 5.6,
        shippingMethod: sellItem.shippingMethod || 'STO',
        smartType: buyItem.smartType || sellItem.smartType // Preserve smart tag if available
      };

      // Remove the orphaned Sell Item and update the Buy Item
      return prev
        .map(t => t.id === buyId ? updatedBuyItem : t)
        .filter(t => t.id !== sellId);
    });
  };

  // Quick update for inline editing
  const handleQuickUpdate = (id: string, field: keyof Transaction, value: any) => {
    setTransactions(prev => prev.map(t => {
      if (t.id !== id) return t;
      
      const updates: Partial<Transaction> = { [field]: value };
      
      // Smart logic: if sell price is updated, check if it should be marked as sold
      if (field === 'sellPrice') {
        const newPrice = Number(value);
        updates.isSold = newPrice > 0;
        // If becoming sold and no sell date, set to today or copy buy date
        if (updates.isSold && !t.sellDate) {
           updates.sellDate = new Date().toISOString().split('T')[0];
           // Also set default shipping if not present
           if (!t.shippingMethod) {
               updates.shippingMethod = 'STO';
               updates.shippingCost = 5.6;
           }
        }
      }

      return { ...t, ...updates };
    }));
  };

  // Step 1: Trigger confirmation modal
  const handleDeleteRequest = (id: string) => {
    const itemToDelete = transactions.find(t => t.id === id);
    if (!itemToDelete) return;

    // Determine Type
    const isClosedLoop = itemToDelete.buyPrice > 0 && itemToDelete.sellPrice > 0 && itemToDelete.isSold;
    
    setDeleteConfirm({
        id: id,
        type: isClosedLoop ? 'SPLIT' : 'DELETE',
        title: itemToDelete.name
    });
  };

  // Step 2: Execute action after confirmation
  const executeDelete = () => {
    if (!deleteConfirm) return;

    const { id, type } = deleteConfirm;

    if (type === 'SPLIT') {
         setTransactions(prev => {
           const itemToDelete = prev.find(t => t.id === id);
           if (!itemToDelete) return prev;

           // Try to recover original names from notes
           const notes = itemToDelete.notes || '';
           const matchSeparator = ' | Sold Match: ';
           
           let originalBuyName = itemToDelete.name;
           let originalSellName = itemToDelete.name;
           let buyNotes = notes;

           if (notes.includes(matchSeparator)) {
              const parts = notes.split(matchSeparator);
              originalBuyName = itemToDelete.name; // Keep current name as buy name
              originalSellName = parts[1].trim(); 
              // Remove the suffix from notes for the buy item
              buyNotes = parts[0].trim();
           }

           // 1. Restore Buy Record (Inventory) -> Keep ID, Name, BuyPrice, Reset SellPrice
           const restoredBuy: Transaction = {
             ...itemToDelete,
             name: originalBuyName, 
             sellPrice: 0,
             isSold: false,
             sellDate: undefined,
             notes: buyNotes,
             shippingCost: undefined, // Reset shipping on inventory
             shippingMethod: undefined,
             smartType: itemToDelete.smartType
           };

           // Generate ID safely
           const newSellId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);

           // 2. Restore Sell Record (Orphan) -> New ID, Recovered Name, BuyPrice 0
           const restoredSell: Transaction = {
             id: newSellId,
             name: originalSellName,
             category: itemToDelete.category,
             buyPrice: 0,
             sellPrice: itemToDelete.sellPrice,
             isSold: true,
             date: itemToDelete.sellDate || itemToDelete.date, // Use sell date
             sellDate: itemToDelete.sellDate,
             notes: `Unmerged from ${originalBuyName}`,
             shippingCost: itemToDelete.shippingCost,
             shippingMethod: itemToDelete.shippingMethod,
             smartType: itemToDelete.smartType 
           };

           return [restoredSell, ...prev.map(t => t.id === id ? restoredBuy : t)];
         });
    } else {
        // PERMANENT DELETE
        setTransactions(prev => prev.filter(t => t.id !== id));
    }
    
    setDeleteConfirm(null);
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsModalOpen(true);
  };

  const handleAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiAnalysis('');
    const result = await analyzeTradePerformance(transactions, stats);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  // --- Export / Import JSON ---
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(transactions, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `trade_data_backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;

     const reader = new FileReader();
     reader.onload = (event) => {
       const content = event.target?.result as string;
       if (content) {
         setImportText(content);
       }
     };
     reader.readAsText(file);
  };

  // --- Paste Import Logic ---
  const parseAndImport = (jsonStr: string, mode: 'MERGE' | 'REPLACE') => {
    try {
        if (!jsonStr || !jsonStr.trim()) throw new Error("内容为空");

        const jsonRegex = /\[[\s\S]*\]/;
        const match = jsonStr.match(jsonRegex);
        
        let parsedData = null;
        if (match) {
           try {
             parsedData = JSON.parse(match[0]);
           } catch (e) {
             console.error("Regex extracted invalid JSON", e);
           }
        }
        
        if (!parsedData) {
           try {
              parsedData = JSON.parse(jsonStr);
           } catch (e) {
              throw new Error("无法解析 JSON 数据。请确保粘贴了完整的数组 [...] 内容。");
           }
        }
        
        if (Array.isArray(parsedData)) {
          let closedLoopCount = 0;
          let inventoryCount = 0;
          let orphanCount = 0;

          const repairedData: Transaction[] = parsedData.map((item: any) => {
             let shippingMethod = item.shippingMethod;
             let shippingCost = Number(item.shippingCost);
             
             if (!!item.isSold) {
                 if (!shippingMethod) {
                     shippingMethod = 'STO';
                     shippingCost = 5.6;
                 } else if (isNaN(shippingCost)) {
                     shippingCost = (shippingMethod === 'STO') ? 5.6 : 
                                    (shippingMethod === 'SF') ? 18 :
                                    (shippingMethod === 'JD') ? 15 : 0;
                 }
             }

             const t: Transaction = {
                 id: item.id || crypto.randomUUID(),
                 name: item.name || 'Unknown Item',
                 category: item.category || 'Electronics',
                 buyPrice: Number(item.buyPrice) || 0,
                 sellPrice: Number(item.sellPrice) || 0,
                 isSold: !!item.isSold,
                 date: item.date || new Date().toISOString().split('T')[0],
                 sellDate: item.sellDate || (item.isSold ? item.date : undefined),
                 notes: item.notes,
                 shippingCost: isNaN(shippingCost) ? 0 : shippingCost,
                 shippingMethod: shippingMethod,
                 smartType: item.smartType
             };

             if (t.buyPrice > 0 && t.sellPrice > 0) closedLoopCount++;
             else if (t.buyPrice > 0 && t.sellPrice === 0) inventoryCount++;
             else if (t.buyPrice === 0 && t.sellPrice > 0) orphanCount++;
             
             return t;
          });
          
          if (mode === 'REPLACE') {
            setTransactions(repairedData);
          } else {
            const existingIds = new Set(transactions.map(t => t.id));
            const newItems = repairedData.filter(t => !existingIds.has(t.id));
            setTransactions(prev => [...prev, ...newItems]);
          }

          alert(`导入成功！\n\n模式: ${mode === 'REPLACE' ? '覆盖' : '合并'}\n✅ 闭环交易: ${closedLoopCount}\n📦 库存记录: ${inventoryCount}\n💰 孤立卖出: ${orphanCount}`);
          
          setIsImportModalOpen(false);
          setImportText('');
          setViewMode('LIST');
          setFilter(FilterType.ALL);

        } else {
          throw new Error("格式错误：必须是 JSON 数组 [...]");
        }
    } catch (err) {
        alert(`导入失败：\n${(err as Error).message}`);
    }
  };


  return (
    <div className="min-h-screen pb-24 bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
              <ChartIcon size={20} />
            </div>
            <h1 className="text-xl font-bold text-gray-800">TradeTracker AI</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {/* View Modes */}
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
              <button 
                onClick={() => setViewMode('LIST')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List size={16} />
                <span className="hidden sm:inline">列表</span>
              </button>
              <button 
                onClick={() => setViewMode('MATCH')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'MATCH' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <LinkIcon size={16} />
                <span className="hidden sm:inline">对账/匹配</span>
                {viewMode !== 'MATCH' && isProcessingImport && <Loader2 size={12} className="animate-spin" />}
              </button>
              <button 
                onClick={() => setViewMode('CHARTS')}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${viewMode === 'CHARTS' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <ChartIcon size={16} />
                <span className="hidden sm:inline">报表</span>
              </button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-1 hidden md:block"></div>

            {/* Data Tools */}
            <div className="flex items-center space-x-2">
               <button 
                  onClick={handleExportJSON}
                  className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="导出数据 (JSON)"
               >
                 <Download size={20} />
               </button>
               <button 
                  onClick={() => setIsImportModalOpen(true)}
                  className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-lg transition-colors"
                  title="导入数据 (JSON)"
               >
                 <Upload size={20} />
               </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        
        {/* View Content */}
        {viewMode === 'MATCH' ? (
          <MatchView 
            transactions={transactions} 
            onMerge={handleMerge} 
            onUpload={handleDirectFileUpload}
            onAutoTag={handleSmartCategorize}
            isProcessing={isProcessingImport}
          />
        ) : viewMode === 'CHARTS' ? (
           <>
              <FinancialCharts transactions={transactions} />
              
              {/* AI Analysis Section */}
              <div className="mt-8 border-t border-gray-200 pt-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <BrainCircuit className="text-purple-600" />
                    <span>智能财务分析报告</span>
                  </h2>
                  <button
                    onClick={handleAiAnalysis}
                    disabled={isAnalyzing || transactions.length === 0}
                    className={`text-sm px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2
                      ${isAnalyzing 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-purple-600 text-white hover:bg-purple-700 shadow-md shadow-purple-200'
                      }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>分析中...</span>
                      </>
                    ) : '生成 AI 报告'}
                  </button>
                </div>
                
                {aiAnalysis ? (
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-fade-in">
                    <article 
                      className="prose prose-indigo max-w-none prose-h2:text-lg prose-h2:font-bold prose-h2:text-gray-800 prose-blockquote:bg-gray-50 prose-blockquote:border-l-4 prose-blockquote:border-indigo-400 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:not-italic prose-blockquote:text-gray-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-indigo-700 prose-code:font-mono prose-code:text-sm prose-li:text-sm prose-li:text-gray-600 text-sm"
                      dangerouslySetInnerHTML={{ __html: aiAnalysis }} 
                    />
                  </div>
                ) : (
                  <div className="text-center py-10 bg-white rounded-xl border border-gray-100 border-dashed text-gray-400 text-sm">
                    点击右上角按钮，让 AI 为您分析当前的财务状况与盈利策略。
                  </div>
                )}
              </div>
           </>
        ) : (
          <>
            {/* LIST VIEW */}
            <SummaryCards stats={stats} />

             {/* Filter Tabs */}
            <div className="flex items-center space-x-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
              <button 
                onClick={() => setFilter(FilterType.CLOSED_LOOP)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${filter === FilterType.CLOSED_LOOP ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                <CheckCircle2 size={16} />
                闭环交易 ({stats.closedLoopCount})
              </button>
              <button 
                onClick={() => setFilter(FilterType.INVENTORY)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${filter === FilterType.INVENTORY ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                <Package size={16} />
                购买记录 ({stats.itemCount - stats.soldCount})
              </button>
              <button 
                onClick={() => setFilter(FilterType.ORPHAN_SALES)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${filter === FilterType.ORPHAN_SALES ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                <ShoppingBag size={16} />
                出售记录 ({stats.soldCount - stats.closedLoopCount})
              </button>
               <button 
                onClick={() => setFilter(FilterType.ALL)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border ${filter === FilterType.ALL ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                <Layers size={16} />
                全部 ({transactions.length})
              </button>
            </div>
            
            <TransactionList 
               transactions={filteredTransactions} 
               onEdit={handleEdit} 
               onUpdate={handleQuickUpdate}
               onDelete={handleDeleteRequest} 
             />
          </>
        )}

      </main>

      {/* Floating Add Button */}
      {viewMode === 'LIST' && (
        <button
          onClick={() => {
            setEditingTransaction(null);
            setIsModalOpen(true);
          }}
          className="fixed bottom-6 right-6 bg-indigo-600 hover:bg-indigo-700 text-white p-4 rounded-full shadow-xl shadow-indigo-300 transition-transform hover:scale-105 active:scale-95 z-40"
        >
          <Plus size={28} />
        </button>
      )}

      {/* Add Transaction Form Modal */}
      <TransactionForm
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        initialData={editingTransaction}
      />

      {/* DELETE CONFIRMATION MODAL (Custom) */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all scale-100">
              <div className="p-6">
                 <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full mb-4 ${deleteConfirm.type === 'SPLIT' ? 'bg-indigo-100 text-indigo-600' : 'bg-red-100 text-red-600'}`}>
                    {deleteConfirm.type === 'SPLIT' ? <Split size={24} /> : <Trash2 size={24} />}
                 </div>
                 <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                    {deleteConfirm.type === 'SPLIT' ? '拆分闭环交易' : '确认永久删除'}
                 </h3>
                 <p className="text-sm text-gray-500 text-center mb-2 font-medium">
                    {deleteConfirm.title}
                 </p>
                 <p className="text-sm text-gray-500 text-center">
                    {deleteConfirm.type === 'SPLIT' 
                       ? '此操作会将该记录还原为“库存(买入)”和“出售”两条独立记录，数据不会丢失。' 
                       : '删除后无法恢复，该记录将永久消失。'}
                 </p>
              </div>
              <div className="bg-gray-50 px-6 py-4 flex flex-row-reverse gap-3">
                 <button
                    type="button"
                    onClick={executeDelete}
                    className={`w-full inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white sm:text-sm ${deleteConfirm.type === 'SPLIT' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-red-600 hover:bg-red-700'}`}
                 >
                    {deleteConfirm.type === 'SPLIT' ? '确认拆分' : '确认删除'}
                 </button>
                 <button
                    type="button"
                    onClick={() => setDeleteConfirm(null)}
                    className="mt-0 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:text-sm"
                 >
                    取消
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* OVERRIDE CONFIRMATION MODAL (Custom) - z-60 to be above import modal */}
      {overrideConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 animate-fade-in">
           <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 transform transition-all scale-100">
               <div className="flex flex-col items-center text-center">
                  <div className="bg-red-100 text-red-600 p-3 rounded-full mb-4">
                     <AlertTriangle size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">确认覆盖所有数据？</h3>
                  <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                     此操作将 <span className="text-red-600 font-bold">清空当前所有记录</span>，并完全替换为您输入的新数据。<br/>
                     该操作无法撤销，建议先导出备份。
                  </p>
                  <div className="flex gap-3 w-full">
                     <button 
                        onClick={() => setOverrideConfirm(false)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                     >
                        取消
                     </button>
                     <button 
                        onClick={() => {
                           parseAndImport(importText, 'REPLACE');
                           setOverrideConfirm(false);
                        }}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                     >
                        确认覆盖
                     </button>
                  </div>
               </div>
           </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 animate-fade-in">
           <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                 <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <FileJson className="text-indigo-600" size={20} />
                    导入数据 (JSON)
                 </h2>
                 <button onClick={() => setIsImportModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                 </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                 <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-800 flex gap-2">
                    <AlertTriangle className="shrink-0 text-yellow-600" size={18} />
                    <p>
                       支持直接上传 <code>.json</code> 备份文件，或者粘贴文本内容。
                    </p>
                 </div>

                 <div className="mb-4">
                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-gray-300 border-dashed rounded-xl cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <FileUp className="w-8 h-8 text-gray-400 mb-2" />
                            <p className="text-sm text-gray-500"><span className="font-semibold">点击上传文件</span></p>
                        </div>
                        <input type="file" className="hidden" accept=".json" onChange={handleJsonFileUpload} />
                    </label>
                 </div>

                 <div className="relative">
                     <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200"></div>
                     </div>
                     <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">或 粘贴文本</span>
                     </div>
                 </div>

                 <textarea
                    className="mt-4 w-full h-32 p-4 border border-gray-300 rounded-xl font-mono text-xs text-gray-600 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none resize-none"
                    placeholder={`[\n  {\n    "name": "示例物品",\n    "buyPrice": 100,\n    ...\n  }\n]`}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                 />
              </div>

              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                 <button 
                    onClick={() => parseAndImport(importText, 'MERGE')}
                    disabled={!importText}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                 >
                    合并 (保留现有)
                 </button>
                 <button 
                    onClick={() => setOverrideConfirm(true)}
                    disabled={!importText}
                    className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-200"
                 >
                    覆盖 (删除现有)
                 </button>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default App;