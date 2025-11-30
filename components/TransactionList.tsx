
import React, { useState, useRef, useEffect } from 'react';
import { Transaction } from '../types';
import { Edit2, Trash2, ArrowUpRight, ArrowDownRight, Archive, Truck, Check } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onUpdate: (id: string, field: keyof Transaction, value: any) => void;
  onDelete: (id: string) => void;
}

const SHIPPING_PRESETS = [
    { label: '申通', value: 5.6, code: 'STO' },
    { label: '京东', value: 15, code: 'JD' },
    { label: '顺丰', value: 18, code: 'SF' },
    { label: '到付', value: 0, code: 'FREE' },
];

export const TransactionList: React.FC<TransactionListProps> = ({ transactions, onEdit, onUpdate, onDelete }) => {
  const [editingCell, setEditingCell] = useState<{ id: string, field: keyof Transaction } | null>(null);
  const [tempValue, setTempValue] = useState<string | number>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const startEditing = (id: string, field: keyof Transaction, value: any) => {
    setEditingCell({ id, field });
    setTempValue(value);
  };

  const saveEditing = () => {
    if (editingCell) {
      // Validate number fields
      if (editingCell.field === 'buyPrice' || editingCell.field === 'sellPrice' || editingCell.field === 'shippingCost') {
        const numVal = parseFloat(tempValue.toString());
        onUpdate(editingCell.id, editingCell.field, isNaN(numVal) ? 0 : numVal);
      } else {
        onUpdate(editingCell.id, editingCell.field, tempValue);
      }
      setEditingCell(null);
    }
  };

  // Special handler for selecting a preset from the shipping popover
  const applyShippingPreset = (t: Transaction, preset: { value: number, code: string }) => {
      onUpdate(t.id, 'shippingCost', preset.value);
      onUpdate(t.id, 'shippingMethod', preset.code);
      setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditing();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="bg-gray-100 p-4 rounded-full mb-4">
          <Archive size={32} className="text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium">暂无交易记录</p>
        <p className="text-sm text-gray-400 mt-1">点击右下角按钮添加第一笔买卖</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-visible">
      <div className="overflow-x-visible">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-100">
              <th className="px-6 py-4 font-semibold">物品 / 日期</th>
              <th className="px-6 py-4 font-semibold text-right">买入价</th>
              <th className="px-6 py-4 font-semibold text-right">卖出价</th>
              <th className="px-4 py-4 font-semibold text-right w-32">运费(成本)</th>
              <th className="px-6 py-4 font-semibold text-right">差价 / 盈亏</th>
              <th className="px-6 py-4 font-semibold text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 relative">
            {transactions.map((t) => {
              const shipping = t.shippingCost || 0;
              // Platform fee 0.6% on (Sell + Shipping)
              const fee = (t.sellPrice + shipping) * 0.006;
              const profit = t.sellPrice - t.buyPrice - shipping - fee;
              
              const margin = t.buyPrice > 0 ? (profit / t.buyPrice) * 100 : 0;
              const isProfit = profit >= 0;

              return (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors group">
                  {/* Name and Date */}
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{t.name}</span>
                      <div className="text-xs text-gray-400 flex items-center gap-2 mt-1">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{t.category}</span>
                        {editingCell?.id === t.id && editingCell?.field === 'date' ? (
                          <input 
                            ref={inputRef}
                            type="date"
                            className="border rounded px-1 py-0.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={saveEditing}
                            onKeyDown={handleKeyDown}
                          />
                        ) : (
                          <span 
                            className="cursor-pointer hover:text-indigo-600 border-b border-transparent hover:border-indigo-300 transition-all"
                            onClick={() => startEditing(t.id, 'date', t.date)}
                            title="点击修改日期"
                          >
                            {t.date}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Buy Price */}
                  <td className="px-6 py-4 text-right">
                    {editingCell?.id === t.id && editingCell?.field === 'buyPrice' ? (
                      <input 
                        ref={inputRef}
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 text-right border rounded px-1 py-1 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onBlur={saveEditing}
                        onKeyDown={handleKeyDown}
                      />
                    ) : (
                      <span 
                        className="text-gray-600 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors"
                        onClick={() => startEditing(t.id, 'buyPrice', t.buyPrice)}
                        title="点击修改买入价"
                      >
                        ¥{t.buyPrice.toLocaleString()}
                      </span>
                    )}
                  </td>

                  {/* Sell Price */}
                  <td className="px-6 py-4 text-right">
                    {editingCell?.id === t.id && editingCell?.field === 'sellPrice' ? (
                      <input 
                        ref={inputRef}
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-24 text-right border rounded px-1 py-1 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                        value={tempValue}
                        onChange={(e) => setTempValue(e.target.value)}
                        onBlur={saveEditing}
                        onKeyDown={handleKeyDown}
                      />
                    ) : (
                      <div 
                        className="cursor-pointer hover:bg-gray-100 inline-block px-2 py-1 rounded transition-colors"
                        onClick={() => startEditing(t.id, 'sellPrice', t.sellPrice)}
                        title="点击修改卖出价"
                      >
                        {t.isSold ? (
                          <span className="text-gray-900 font-medium">¥{t.sellPrice.toLocaleString()}</span>
                        ) : (
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                            库存中
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                   {/* Freight Cost (Shipping) with Popover */}
                   <td className="px-4 py-4 text-right relative">
                     {t.isSold ? (
                        editingCell?.id === t.id && editingCell?.field === 'shippingCost' ? (
                            <div className="relative">
                                <input 
                                    ref={inputRef}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-full text-right border rounded px-1 py-1 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                                    value={tempValue}
                                    onChange={(e) => setTempValue(e.target.value)}
                                    onBlur={saveEditing}
                                    onKeyDown={handleKeyDown}
                                />
                                
                                {/* Floating Shipping Selector Popover */}
                                <div 
                                    className="absolute top-8 right-0 z-50 bg-white rounded-xl shadow-xl border border-gray-100 p-3 w-48 animate-fade-in"
                                    onMouseDown={(e) => e.preventDefault()} // Prevent blur on input when clicking buttons
                                >
                                    <div className="text-xs font-semibold text-gray-400 mb-2 px-1">快速选择运费</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SHIPPING_PRESETS.map(preset => (
                                            <button
                                                key={preset.code}
                                                onClick={() => applyShippingPreset(t, preset)}
                                                className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all
                                                  ${t.shippingMethod === preset.code 
                                                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                                                    : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100 hover:border-gray-300'}`}
                                            >
                                                <span className="text-xs font-medium">{preset.label}</span>
                                                <span className="text-[10px] opacity-80 font-mono">¥{preset.value}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-gray-100 text-center text-[10px] text-gray-400">
                                        或直接输入自定义金额并回车
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div 
                                className="flex flex-col items-end cursor-pointer hover:bg-gray-100 px-2 py-1 rounded transition-colors select-none"
                                onClick={() => startEditing(t.id, 'shippingCost', shipping)}
                            >
                                <div className="flex items-center gap-1 text-gray-500">
                                   <Truck size={12} />
                                   <span className="text-sm font-medium">¥{shipping}</span>
                                </div>
                                {t.shippingMethod && (
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded-full mt-0.5 transform scale-90 origin-right">
                                        {t.shippingMethod === 'STO' ? '申通' : t.shippingMethod === 'SF' ? '顺丰' : t.shippingMethod === 'JD' ? '京东' : t.shippingMethod === 'FREE' ? '到付' : '自定义'}
                                    </span>
                                )}
                            </div>
                        )
                     ) : (
                        <span className="text-gray-300 text-sm block text-center">-</span>
                     )}
                   </td>

                  {/* Profit (Calculated) */}
                  <td className="px-6 py-4 text-right">
                    {t.isSold ? (
                      <div className="flex flex-col items-end">
                        <span className={`font-bold flex items-center ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                          {isProfit ? <ArrowUpRight size={14} className="mr-1" /> : <ArrowDownRight size={14} className="mr-1" />}
                          {isProfit ? '+' : ''}¥{profit.toFixed(2)}
                        </span>
                        <div className="text-[10px] text-gray-400 mt-0.5" title="平台扣费公式: (卖出价+运费)*0.6%">
                            扣费: ¥{fee.toFixed(2)}
                        </div>
                        <span className={`text-xs ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                          {margin.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-sm">--</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-center">
                    <div className="flex justify-center space-x-3">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onEdit(t); }} 
                        className="text-indigo-600 hover:text-indigo-800 p-1" 
                        title="编辑详情"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(t.id); }} 
                        className="text-gray-400 hover:text-red-500 p-1" 
                        title="删除记录"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
