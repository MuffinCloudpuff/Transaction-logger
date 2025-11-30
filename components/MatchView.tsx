
import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { ArrowRight, Link as LinkIcon, Sparkles, Loader2, UploadCloud, Search, AlertCircle } from 'lucide-react';

interface MatchViewProps {
  transactions: Transaction[];
  onMerge: (buyId: string, sellId: string) => void;
  onUpload: (files: File[], type: 'BUY' | 'SELL') => void;
  isProcessing: boolean;
}

export const MatchView: React.FC<MatchViewProps> = ({ transactions, onMerge, onUpload, isProcessing }) => {
  
  const [selectedBuyId, setSelectedBuyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Filter Lists from Main Transactions
  // Left: Items that are NOT sold (or partial buys if we supported them, but mainly standard inventory)
  // Also include items with 0 sell price (safety check)
  const buyList = useMemo(() => {
    return transactions.filter(t => !t.isSold || t.sellPrice === 0);
  }, [transactions]);

  // Right: Items that are SOLD but have 0 Buy Price (Orphaned Sells)
  const sellList = useMemo(() => {
    return transactions.filter(t => t.isSold && t.buyPrice === 0);
  }, [transactions]);

  // 2. Similarity Sorting
  const calculateSimilarity = (str1: string, str2: string) => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const tokens1 = s1.split(/[\s\-_]+/);
    const tokens2 = s2.split(/[\s\-_]+/);
    let matches = 0;
    tokens1.forEach(t => {
      if (t.length > 1 && s2.includes(t)) matches++;
    });
    // Bonus for exact containment
    if (s1.includes(s2) || s2.includes(s1)) matches += 2;
    return matches;
  };

  const filteredBuys = useMemo(() => {
    return buyList.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [buyList, searchQuery]);

  const filteredSells = useMemo(() => {
    let list = sellList.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // If a buy item is selected, sort 'Sold' list by similarity to that item
    if (selectedBuyId) {
      const selectedItem = buyList.find(b => b.id === selectedBuyId);
      if (selectedItem) {
        list = [...list].sort((a, b) => {
          const scoreA = calculateSimilarity(selectedItem.name, a.name);
          const scoreB = calculateSimilarity(selectedItem.name, b.name);
          return scoreB - scoreA; // Descending
        });
      }
    } else {
        // Default sort by date
        list = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    return list;
  }, [sellList, searchQuery, selectedBuyId, buyList]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'BUY' | 'SELL') => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files), type);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        
        {/* Header / Toolbar */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 bg-white z-10">
          <div>
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <LinkIcon size={20} className="text-indigo-600"/>
                  对账中心
              </h2>
              <p className="text-xs text-gray-500">点击左侧买入记录，再点击右侧卖出记录进行合并</p>
          </div>
          
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="搜索物品..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-gray-100 rounded-full text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full md:w-64 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Columns Container */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* LEFT: BUYS (Inventory) */}
          <div className="flex-1 flex flex-col border-r border-gray-100 bg-gray-50/30 min-w-0">
            <div className="p-3 bg-white border-b border-gray-100 flex justify-between items-center">
              <span className="font-bold text-gray-700 text-sm flex items-center gap-2">
                 库存 / 待对账买入
                 <span className="bg-gray-100 px-2 rounded-full text-xs">{filteredBuys.length}</span>
              </span>
              <label className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isProcessing ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>导入买入截图</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'BUY')} disabled={isProcessing} />
              </label>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {filteredBuys.map(item => (
                <div 
                  key={item.id}
                  onClick={() => setSelectedBuyId(item.id === selectedBuyId ? null : item.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all relative group
                    ${selectedBuyId === item.id 
                      ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500 z-10' 
                      : 'bg-white border-gray-200 hover:border-indigo-300'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-medium text-gray-800 text-sm line-clamp-2">{item.name}</div>
                    <span className="font-mono font-semibold text-gray-900 ml-2 text-sm">
                      ¥{item.buyPrice}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>{item.date}</span>
                  </div>
                  
                  {selectedBuyId === item.id && (
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white p-1 rounded-full shadow-lg z-20">
                      <ArrowRight size={14} />
                    </div>
                  )}
                </div>
              ))}
              {filteredBuys.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">暂无待对账的买入记录</div>
              )}
            </div>
          </div>

          {/* RIGHT: SELLS (Orphans) */}
          <div className="flex-1 flex flex-col bg-white min-w-0">
             <div className="p-3 bg-white border-b border-gray-100 flex justify-between items-center">
              <span className="font-bold text-gray-700 text-sm flex items-center gap-2">
                 孤立卖出记录
                 <span className="bg-gray-100 px-2 rounded-full text-xs">{filteredSells.length}</span>
              </span>
              <label className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isProcessing ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>导入卖出截图</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'SELL')} disabled={isProcessing} />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {filteredSells.map((item, index) => {
                const isTopRecommendation = selectedBuyId && index === 0 && searchQuery === '';
                return (
                  <div 
                    key={item.id}
                    onClick={() => {
                       if (selectedBuyId) {
                         onMerge(selectedBuyId, item.id);
                         setSelectedBuyId(null);
                       }
                    }}
                    className={`p-3 rounded-lg border transition-all group relative
                      ${selectedBuyId 
                         ? 'cursor-pointer hover:bg-green-50 hover:border-green-400' 
                         : 'bg-white border-gray-200 opacity-80'}
                      ${isTopRecommendation ? 'border-green-400 ring-2 ring-green-100 bg-green-50/30' : ''}
                    `}
                  >
                    {/* Warning for orphan */}
                    {!selectedBuyId && (
                         <div className="absolute top-1 right-1 text-amber-500" title="此记录没有买入成本，不计入闭环利润">
                             <AlertCircle size={12} />
                         </div>
                    )}

                    {isTopRecommendation && (
                       <div className="absolute -top-2 left-3 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                         <Sparkles size={10} /> 最佳匹配
                       </div>
                    )}

                    <div className="flex justify-between items-start mb-1">
                      <div className="font-medium text-gray-800 text-sm line-clamp-2">{item.name}</div>
                      <span className="font-mono font-semibold text-green-600 ml-2 text-sm">
                        +¥{item.sellPrice}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 flex justify-between">
                       <span>{item.date}</span>
                    </div>

                    {selectedBuyId && (
                       <div className="absolute inset-0 flex items-center justify-center bg-green-100/90 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity rounded-lg z-20">
                          <span className="font-bold text-green-800 flex items-center gap-2 shadow-sm bg-white px-3 py-1.5 rounded-full text-xs">
                            <LinkIcon size={14} /> 确认合并
                          </span>
                       </div>
                    )}
                  </div>
                );
              })}
               {filteredSells.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">暂无孤立的卖出记录</div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
};
