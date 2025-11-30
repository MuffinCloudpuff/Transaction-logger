
import React, { useMemo } from 'react';
import { Transaction } from '../types';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart
} from 'recharts';
import { TrendingUp, DollarSign, Activity, Percent } from 'lucide-react';

interface FinancialChartsProps {
  transactions: Transaction[];
}

const COLORS = ['#6366F1', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#64748B'];

export const FinancialCharts: React.FC<FinancialChartsProps> = ({ transactions }) => {
  
  // --- Data Processing ---
  const data = useMemo(() => {
    if (transactions.length === 0) return null;

    // 1. Sort by Date
    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    // 2. Timeline Data (Cumulative)
    let accInvested = 0;
    let accRevenue = 0;
    let accProfit = 0;

    // Group by Date for cleaner timeline
    const dateMap = new Map<string, { date: string, invested: number, revenue: number, profit: number }>();

    sorted.forEach(t => {
      accInvested += t.buyPrice;
      if (t.isSold) {
        accRevenue += t.sellPrice;
        
        if (t.buyPrice > 0) {
            // Net Profit Logic: Sell - Buy - Shipping - Fee
            const shipping = t.shippingCost || 0;
            const fee = (t.sellPrice + shipping) * 0.006;
            const netProfit = t.sellPrice - t.buyPrice - shipping - fee;
            accProfit += netProfit;
        }
      }
      
      // Store snapshot for this date
      dateMap.set(t.date, { 
        date: t.date, 
        invested: accInvested, 
        revenue: accRevenue, 
        profit: accProfit 
      });
    });

    const timelineData = Array.from(dateMap.values());

    // 3. Monthly Data (Bar Chart)
    const monthMap = new Map<string, { name: string, buy: number, sell: number, profit: number }>();
    
    sorted.forEach(t => {
      const month = t.date.substring(0, 7); // YYYY-MM
      const current = monthMap.get(month) || { name: month, buy: 0, sell: 0, profit: 0 };
      
      current.buy += t.buyPrice;
      if (t.isSold) {
        current.sell += t.sellPrice;
        if (t.buyPrice > 0) {
            const shipping = t.shippingCost || 0;
            const fee = (t.sellPrice + shipping) * 0.006;
            const netProfit = t.sellPrice - t.buyPrice - shipping - fee;
            current.profit += netProfit;
        }
      }
      monthMap.set(month, current);
    });

    const monthlyData = Array.from(monthMap.values()).sort((a, b) => a.name.localeCompare(b.name));

    // 4. Category Data (Pie Charts)
    
    // A. Profit Distribution (Where does the money come from?)
    const profitStats = sorted.reduce((acc, t) => {
      let netProfit = 0;
      if (t.isSold && t.buyPrice > 0) {
          const shipping = t.shippingCost || 0;
          const fee = (t.sellPrice + shipping) * 0.006;
          netProfit = t.sellPrice - t.buyPrice - shipping - fee;
      }
      
      if (netProfit > 0) {
        const existing = acc.find(c => c.name === t.category);
        if (existing) existing.value += netProfit;
        else acc.push({ name: t.category, value: netProfit });
      }
      return acc;
    }, [] as { name: string; value: number }[]);

    // B. Inventory Value Distribution (Where is the money stuck?)
    // Filter: Not Sold AND Buy Price > 5 (Ignore cheap consumables)
    const inventoryStats = sorted
        .filter(t => !t.isSold && t.buyPrice > 5) 
        .reduce((acc, t) => {
            const existing = acc.find(c => c.name === t.category);
            if (existing) existing.value += t.buyPrice;
            else acc.push({ name: t.category, value: t.buyPrice });
            return acc;
        }, [] as { name: string; value: number }[]);

    const profitDistribution = profitStats;
    const inventoryDistribution = inventoryStats;

    // 5. KPI Metrics (Closed Loop Only)
    // Filter strictly for Closed Loop items for accurate "Trade Profit" stats
    const closedLoopItems = sorted.filter(t => t.buyPrice > 0 && t.sellPrice > 0);
    const closedLoopCount = closedLoopItems.length;
    
    let totalClosedLoopProfit = 0;
    let totalClosedLoopCost = 0;

    closedLoopItems.forEach(t => {
        const shipping = t.shippingCost || 0;
        const fee = (t.sellPrice + shipping) * 0.006;
        const netProfit = t.sellPrice - t.buyPrice - shipping - fee;

        totalClosedLoopProfit += netProfit;
        totalClosedLoopCost += t.buyPrice;
    });

    const avgProfit = closedLoopCount > 0 ? (totalClosedLoopProfit / closedLoopCount) : 0;
    // ROI = Net Profit / Cost Basis
    const profitMargin = totalClosedLoopCost > 0 ? (totalClosedLoopProfit / totalClosedLoopCost) * 100 : 0;
    
    return {
      timelineData,
      monthlyData,
      profitDistribution,
      inventoryDistribution,
      kpi: {
        avgProfit,
        profitMargin,
        count: closedLoopCount
      }
    };
  }, [transactions]);

  if (!data || transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
        <Activity className="text-gray-300 mb-2" size={32} />
        <p className="text-gray-400 text-sm">暂无足够数据生成报表</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      
      {/* KPI Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
         <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-500 font-semibold uppercase">平均单笔净利</p>
              <p className="text-xl font-bold text-indigo-700">¥{data.kpi.avgProfit.toFixed(0)}</p>
              <p className="text-[10px] text-indigo-400">已扣除运费与平台费</p>
            </div>
            <div className="bg-white p-2 rounded-full shadow-sm text-indigo-500">
              <TrendingUp size={18} />
            </div>
         </div>
         <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-emerald-600 font-semibold uppercase">总净收益率 (ROI)</p>
              <p className="text-xl font-bold text-emerald-700">{data.kpi.profitMargin.toFixed(1)}%</p>
              <p className="text-[10px] text-emerald-500">净利润 / 投入成本</p>
            </div>
            <div className="bg-white p-2 rounded-full shadow-sm text-emerald-500">
              <Percent size={18} />
            </div>
         </div>
      </div>

      {/* Chart 1: Capital Trend (Line) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
           <div>
             <h3 className="text-gray-800 font-bold text-lg">资金权益走势</h3>
             <p className="text-xs text-gray-400">累计投入 vs 累计收入 vs 累计净利润</p>
           </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#9CA3AF', fontSize: 10}} 
                minTickGap={30}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{fill: '#9CA3AF', fontSize: 10}} 
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                labelStyle={{ color: '#6B7280', fontSize: '12px', marginBottom: '4px' }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }}/>
              
              <Line 
                type="monotone" 
                dataKey="invested" 
                name="累计投入成本" 
                stroke="#9CA3AF" 
                strokeWidth={2} 
                dot={false} 
              />
              <Line 
                type="monotone" 
                dataKey="revenue" 
                name="累计销售回款" 
                stroke="#6366F1" 
                strokeWidth={2} 
                dot={false} 
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                name="累计净利润" 
                stroke="#10B981" 
                fillOpacity={1} 
                fill="url(#colorProfit)" 
                strokeWidth={2} 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Monthly Cash Flow (Combined Bar+Line) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
           <div>
             <h3 className="text-gray-800 font-bold text-lg">月度收支分析</h3>
             <p className="text-xs text-gray-400">买入支出 vs 卖出收入</p>
           </div>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 10}} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 10}} />
              <Tooltip 
                cursor={{ fill: '#F9FAFB' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
              />
              <Legend />
              <Bar dataKey="buy" name="月支出 (买入)" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={20} stackId="a" />
              <Bar dataKey="sell" name="月收入 (卖出)" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={20} />
              <Line type="monotone" dataKey="profit" name="月净利" stroke="#10B981" strokeWidth={2} dot={{r: 4}} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3 & 4: Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Inventory Value Distribution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-gray-800 font-bold text-lg mb-1">库存价值分布</h3>
          <p className="text-xs text-gray-400 mb-4">仅统计单价 &gt; ¥5 的有效库存</p>
          <div className="flex-1 min-h-[250px] relative">
            {data.inventoryDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.inventoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {data.inventoryDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                    <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle"/>
                  </PieChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  暂无高价值库存
                </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               {data.inventoryDistribution.length > 0 && (
                   <div className="text-center">
                     <p className="text-xs text-gray-400">总库存值</p>
                     <p className="text-lg font-bold text-gray-700">¥{(data.inventoryDistribution.reduce((a,b)=>a+b.value,0)/1000).toFixed(1)}k</p>
                   </div>
               )}
            </div>
          </div>
        </div>

        {/* Profit Distribution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-gray-800 font-bold text-lg mb-4">净利润贡献来源</h3>
          <div className="flex-1 min-h-[250px]">
             {data.profitDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.profitDistribution}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      stroke="none"
                    >
                      {data.profitDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `¥${value.toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
             ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  暂无盈利数据
                </div>
             )}
          </div>
        </div>

      </div>
    </div>
  );
};
