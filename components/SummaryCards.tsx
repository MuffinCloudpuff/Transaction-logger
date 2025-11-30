
import React from 'react';
import { TradeStats } from '../types';
import { TrendingUp, TrendingDown, DollarSign, Package, Wallet, CheckCircle2 } from 'lucide-react';

interface SummaryCardsProps {
  stats: TradeStats;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({ stats }) => {
  const isProfit = stats.closedLoopProfit >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Total Invested */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-gray-500 mb-2">
          <Wallet size={18} />
          <span className="text-sm font-medium">总流水 (买入)</span>
        </div>
        <div className="text-2xl font-bold text-gray-900">
          ¥{stats.totalInvested.toLocaleString()}
        </div>
        <div className="text-xs text-gray-400 mt-1">包含库存成本</div>
      </div>

      {/* Total Revenue */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-gray-500 mb-2">
          <DollarSign size={18} />
          <span className="text-sm font-medium">总流水 (卖出)</span>
        </div>
        <div className="text-2xl font-bold text-blue-600">
          ¥{stats.totalRevenue.toLocaleString()}
        </div>
        <div className="text-xs text-gray-400 mt-1">包含未对账收入</div>
      </div>

      {/* Net Profit (Closed Loop) */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between border-l-4 border-l-green-400">
        <div className="flex items-center space-x-2 text-gray-500 mb-2">
          {isProfit ? <TrendingUp size={18} className="text-green-500" /> : <TrendingDown size={18} className="text-red-500" />}
          <span className="text-sm font-medium">闭环净利润</span>
        </div>
        <div className={`text-2xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
          {isProfit ? '+' : ''}¥{stats.closedLoopProfit.toLocaleString()}
        </div>
        <div className="text-xs text-gray-400 mt-1">基于 {stats.closedLoopCount} 笔完整交易</div>
      </div>

      {/* ROI / Inventory */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
        <div className="flex items-center space-x-2 text-gray-500 mb-2">
          <Package size={18} />
          <span className="text-sm font-medium">回报率 / 库存</span>
        </div>
        <div className="flex items-end justify-between">
            <span className={`text-2xl font-bold ${stats.closedLoopRoi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.closedLoopRoi.toFixed(1)}%
            </span>
            <div className="text-right">
                <div className="text-xs text-gray-400">ROI (闭环)</div>
                <div className="text-xs text-gray-500 font-medium">{stats.itemCount - stats.soldCount} 库存</div>
            </div>
        </div>
      </div>
    </div>
  );
};
