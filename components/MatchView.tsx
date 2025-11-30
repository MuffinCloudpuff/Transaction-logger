
import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { ArrowRight, Link as LinkIcon, Sparkles, Loader2, UploadCloud, Search, AlertCircle, Tag, Wand2 } from 'lucide-react';

interface MatchViewProps {
  transactions: Transaction[];
  onMerge: (buyId: string, sellId: string) => void;
  onUpload: (files: File[], type: 'BUY' | 'SELL') => void;
  onAutoTag: () => void;
  isProcessing: boolean;
}

// --- Category Logic (Legacy Keyword Matching Fallback) ---
const CATEGORY_RULES = [
  { id: 'keyboard', icon: '⌨️', label: '键盘/轴', keywords: ['键盘', '套件', '轴', '键帽', '客制化', 'keyboard', 'keycap', 'switch', 'ttc', 'vgn', 'gasket', 'pcb', '卫星轴', '试轴器'] },
  { id: 'mouse', icon: '🖱️', label: '鼠标', keywords: ['鼠标', 'mouse', 'gpw', '毒蝰', '雷蛇', '罗技', '卓威', '垫'] },
  { id: 'phone', icon: '📱', label: '手机/平板', keywords: ['手机', 'iphone', 'ipad', 'android', '小米', '华为', '三星', 'redmi', 'vivo', 'oppo', '一加', 'iqoo', 'pro', 'max', 'ultra'] },
  { id: 'audio', icon: '🎧', label: '耳机/音响', keywords: ['耳机', 'headphone', 'airpods', 'tws', 'pro', 'buds', '音响', 'speaker', '麦克风'] },
  { id: 'pc', icon: '💻', label: '电脑硬件', keywords: ['显卡', 'gpu', 'cpu', '内存', '硬盘', '主板', '散热', '机箱', '电源', '显示器', '屏幕', 'ssd', 'ddr', 'rtx', 'gtx'] },
  { id: 'virtual', icon: '🎟️', label: '虚拟/卡券', keywords: ['会员', '网盘', '充值', '兑换', '码', '天卡', '周卡', '月卡', '年卡', '积分', '教程'] },
  { id: 'camera', icon: '📷', label: '摄影', keywords: ['相机', '镜头', 'sony', 'canon', 'nikon', '富士', 'ccd'] },
];

const detectCategory = (name: string) => {
  const lower = name.toLowerCase();
  for (const cat of CATEGORY_RULES) {
    if (cat.keywords.some(k => lower.includes(k))) {
      return cat;
    }
  }
  return null;
};

// Color map for AI tags (Using Chinese Keys from new Standard)
const TAG_COLORS: Record<string, string> = {
  // 1. 数码与家电
  '主机设备': 'bg-blue-100 text-blue-800',
  '外设配件': 'bg-indigo-100 text-indigo-800',
  '影音摄影': 'bg-purple-100 text-purple-800',
  '生活家电': 'bg-cyan-100 text-cyan-800',
  
  // 2. 家具与家装
  '大型家具': 'bg-amber-100 text-amber-800',
  '办公家具': 'bg-orange-100 text-orange-800',
  '家纺布艺': 'bg-yellow-100 text-yellow-800',
  '照明灯饰': 'bg-lime-100 text-lime-800',

  // 3. 服饰与穿搭
  '服饰': 'bg-rose-100 text-rose-800',
  '鞋靴箱包': 'bg-pink-100 text-pink-800',
  '配饰': 'bg-fuchsia-100 text-fuchsia-800',

  // 4. 厨房
  '厨房用具': 'bg-emerald-100 text-emerald-800',
  '厨房小电': 'bg-teal-100 text-teal-800',
  '食品': 'bg-green-100 text-green-800',

  // 5. 卫浴
  '个人护理': 'bg-sky-100 text-sky-800',
  '清洁用品': 'bg-blue-50 text-blue-600',

  // 6. 文具
  '书籍': 'bg-stone-100 text-stone-800',
  '办公文具': 'bg-neutral-100 text-neutral-800',

  // 7-10 Others
  '重要资产': 'bg-red-100 text-red-800',
  '运动器材': 'bg-violet-100 text-violet-800',
  '户外装备': 'bg-green-200 text-green-900',
  '收藏玩乐': 'bg-indigo-200 text-indigo-900',
  '医药急救': 'bg-red-50 text-red-600',
  '虚拟/卡券': 'bg-gray-100 text-gray-800 border border-gray-200',
  
  default: 'bg-gray-100 text-gray-600'
};

export const MatchView: React.FC<MatchViewProps> = ({ transactions, onMerge, onUpload, onAutoTag, isProcessing }) => {
  
  const [selectedBuyId, setSelectedBuyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Filter Lists from Main Transactions
  const buyList = useMemo(() => {
    return transactions.filter(t => !t.isSold || t.sellPrice === 0);
  }, [transactions]);

  const sellList = useMemo(() => {
    return transactions.filter(t => t.isSold && t.buyPrice === 0);
  }, [transactions]);

  // 2. Advanced Similarity Algorithm
  const calculateScore = (buyItem: Transaction, sellItem: Transaction) => {
    let score = 0;
    const s1 = buyItem.name.toLowerCase();
    const s2 = sellItem.name.toLowerCase();

    // A. AI Smart Type Matching (Highest Priority)
    if (buyItem.smartType && sellItem.smartType) {
        if (buyItem.smartType === sellItem.smartType) {
            score += 80; // Massive bonus for same AI tag (e.g. CPU vs CPU)
        } else {
            score -= 50; // Penalty for mismatch (e.g. CPU vs RAM)
        }
    }

    // B. Legacy Category Matching
    const cat1 = detectCategory(s1);
    const cat2 = detectCategory(s2);

    if (cat1 && cat2) {
      if (cat1.id === cat2.id) {
        score += 40; 
      } else {
        score -= 20; 
      }
    }

    // C. Direct Inclusion
    if (s1.includes(s2) || s2.includes(s1)) {
        score += 30;
    }

    // D. Character/Keyword Overlap (Jaccard-ish)
    const getTokens = (str: string) => {
       const match = str.match(/[a-z0-9]+|[\u4e00-\u9fa5]/g);
       return new Set(match || []);
    };

    const tokens1 = getTokens(s1);
    const tokens2 = getTokens(s2);

    let intersection = 0;
    tokens1.forEach(t => {
        if (tokens2.has(t)) intersection++;
    });

    score += (intersection * 10);

    return score;
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

    // If a buy item is selected, sort 'Sold' list by calculated score
    if (selectedBuyId) {
      const selectedItem = buyList.find(b => b.id === selectedBuyId);
      if (selectedItem) {
        list = list.map(item => ({
             item,
             score: calculateScore(selectedItem, item)
        }))
        .sort((a, b) => b.score - a.score) // Descending score
        .map(wrapper => wrapper.item);
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
                  智能对账中心
              </h2>
              <p className="text-xs text-gray-500">
                  {selectedBuyId ? '系统已根据【物品类型】和【关键词】为您推荐相似卖出记录 👇' : '点击左侧库存物品，右侧将自动匹配相似的卖出记录'}
              </p>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
             {/* AI Auto Tag Button */}
             <button
               onClick={onAutoTag}
               disabled={isProcessing}
               className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border
                 ${isProcessing 
                   ? 'bg-gray-100 text-gray-400 border-gray-200' 
                   : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 hover:border-purple-300 shadow-sm'
                 }`}
               title="使用 AI 自动识别硬件型号、虚拟物品等，提高匹配准确率"
             >
               {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
               AI 智能自动打标
             </button>

             <div className="w-px h-6 bg-gray-200 hidden md:block"></div>

            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder={selectedBuyId ? "正在匹配中..." : "搜索物品..."}
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
                 库存 / 待对账
                 <span className="bg-gray-100 px-2 rounded-full text-xs">{filteredBuys.length}</span>
              </span>
              <label className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isProcessing ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}>
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>导入买入</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'BUY')} disabled={isProcessing} />
              </label>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {filteredBuys.map(item => {
                const cat = detectCategory(item.name);
                const aiTag = item.smartType;
                return (
                  <div 
                    key={item.id}
                    onClick={() => setSelectedBuyId(item.id === selectedBuyId ? null : item.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all relative group
                      ${selectedBuyId === item.id 
                        ? 'bg-white border-indigo-500 shadow-md ring-1 ring-indigo-500 z-10' 
                        : 'bg-white border-gray-200 hover:border-indigo-300'}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1">
                          <div className="font-medium text-gray-800 text-sm line-clamp-2">{item.name}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                             {aiTag && (
                               <span className={`text-[10px] px-1.5 py-0.5 rounded border border-transparent font-medium uppercase tracking-wide flex items-center gap-1 ${TAG_COLORS[aiTag] || TAG_COLORS.default}`}>
                                  <Sparkles size={8} /> {aiTag}
                               </span>
                             )}
                             {!aiTag && cat && (
                                  <span className="text-[10px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                                      {cat.icon} {cat.label}
                                  </span>
                             )}
                          </div>
                      </div>
                      <span className="font-mono font-semibold text-gray-900 ml-2 text-sm whitespace-nowrap">
                        ¥{item.buyPrice}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {item.date}
                    </div>
                    
                    {selectedBuyId === item.id && (
                      <div className="absolute -right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white p-1 rounded-full shadow-lg z-20">
                        <ArrowRight size={14} />
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredBuys.length === 0 && (
                  <div className="text-center py-10 text-gray-400 text-xs">无数据</div>
              )}
            </div>
          </div>

          {/* RIGHT: SELLS (Orphans) */}
          <div className="flex-1 flex flex-col bg-white min-w-0">
             <div className="p-3 bg-white border-b border-gray-100 flex justify-between items-center">
              <span className="font-bold text-gray-700 text-sm flex items-center gap-2">
                 孤立卖出
                 <span className="bg-gray-100 px-2 rounded-full text-xs">{filteredSells.length}</span>
              </span>
              <label className={`cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isProcessing ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}>
                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                <span>导入卖出</span>
                <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'SELL')} disabled={isProcessing} />
              </label>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {filteredSells.map((item, index) => {
                const isTopRecommendation = selectedBuyId && index === 0 && searchQuery === '';
                const cat = detectCategory(item.name);
                const aiTag = item.smartType;
                
                // Show match reason if top recommendation
                let matchReason = '';
                if (isTopRecommendation && selectedBuyId) {
                    const selectedItem = buyList.find(b => b.id === selectedBuyId);
                    const score = selectedItem ? calculateScore(selectedItem, item) : 0;
                    if (score > 70) matchReason = "AI 智能匹配 🔥";
                    else if (score > 40) matchReason = "类型一致 & 关键词匹配";
                    else if (score > 10) matchReason = "关键词相似";
                }

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
                         <div className="absolute top-1 right-1 text-amber-500" title="此记录没有买入成本">
                             <AlertCircle size={12} />
                         </div>
                    )}

                    {isTopRecommendation && (
                       <div className="absolute -top-2.5 left-3 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1 z-10">
                         <Sparkles size={10} /> 最佳匹配 {matchReason && `- ${matchReason}`}
                       </div>
                    )}

                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800 text-sm line-clamp-2">{item.name}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                             {aiTag && (
                               <span className={`text-[10px] px-1.5 py-0.5 rounded border border-transparent font-medium uppercase tracking-wide flex items-center gap-1 ${TAG_COLORS[aiTag] || TAG_COLORS.default}`}>
                                  <Sparkles size={8} /> {aiTag}
                               </span>
                             )}
                             {!aiTag && cat && (
                                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 flex items-center gap-1">
                                      {cat.icon} {cat.label}
                                  </span>
                             )}
                          </div>
                      </div>
                      <span className="font-mono font-semibold text-green-600 ml-2 text-sm whitespace-nowrap">
                        +¥{item.sellPrice}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                       {item.date}
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
                  <div className="text-center py-10 text-gray-400 text-xs">无数据</div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
};
