
import React, { useState, useEffect } from 'react';
import { Transaction } from '../types';
import { X, Save, Sparkles, Loader2, Truck } from 'lucide-react';
import { extractItemDetails } from '../services/geminiService';

interface TransactionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (transaction: Transaction) => void;
  initialData?: Transaction | null;
}

const SHIPPING_RATES: Record<string, number> = {
    'STO': 5.6,
    'SF': 18,
    'JD': 15,
    'FREE': 0,
    'CUSTOM': 0
};

export const TransactionForm: React.FC<TransactionFormProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Electronics');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [isSold, setIsSold] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [sellDate, setSellDate] = useState('');
  
  // Shipping State
  const [shippingMethod, setShippingMethod] = useState('STO');
  const [shippingCost, setShippingCost] = useState('5.6');
  
  // AI Smart Fill State
  const [smartInput, setSmartInput] = useState('');
  const [isFilling, setIsFilling] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setCategory(initialData.category);
      setBuyPrice(initialData.buyPrice.toString());
      setSellPrice(initialData.sellPrice.toString());
      setIsSold(initialData.isSold);
      setDate(initialData.date);
      setSellDate(initialData.sellDate || (initialData.isSold ? initialData.date : ''));
      setShippingMethod(initialData.shippingMethod || 'STO');
      setShippingCost(initialData.shippingCost?.toString() || '5.6');
      setSmartInput('');
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  const resetForm = () => {
    setName('');
    setCategory('Electronics');
    setBuyPrice('');
    setSellPrice('');
    setIsSold(false);
    setDate(new Date().toISOString().split('T')[0]);
    setSellDate('');
    // Default to STO (5.6)
    setShippingMethod('STO');
    setShippingCost('5.6');
    setSmartInput('');
  };

  const handleShippingMethodChange = (method: string) => {
      setShippingMethod(method);
      if (method !== 'CUSTOM') {
          setShippingCost(SHIPPING_RATES[method].toString());
      }
  };

  const handleSmartFill = async () => {
    if (!smartInput.trim()) return;
    
    setIsFilling(true);
    try {
      const result = await extractItemDetails(smartInput);
      if (result.name) setName(result.name);
      if (result.category) setCategory(result.category);
      if (result.buyPrice && result.buyPrice > 0) setBuyPrice(result.buyPrice.toString());
    } catch (e) {
      console.error("Failed to auto-fill", e);
    } finally {
      setIsFilling(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTransaction: Transaction = {
      id: initialData ? initialData.id : crypto.randomUUID(),
      name,
      category,
      buyPrice: parseFloat(buyPrice) || 0,
      sellPrice: parseFloat(sellPrice) || 0,
      isSold,
      date,
      sellDate: isSold ? (sellDate || new Date().toISOString().split('T')[0]) : undefined,
      shippingCost: isSold ? (parseFloat(shippingCost) || 0) : undefined,
      shippingMethod: isSold ? shippingMethod : undefined
    };
    onSave(newTransaction);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">
            {initialData ? '编辑记录' : '新增记账'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5 custom-scrollbar">
          
          {/* AI Smart Fill Section */}
          <div className="bg-purple-50 p-3 rounded-xl border border-purple-100">
            <label className="block text-xs font-semibold text-purple-700 mb-2 flex items-center">
              <Sparkles size={14} className="mr-1" />
              AI 智能识别 (粘贴闲鱼链接或描述)
            </label>
            <div className="flex gap-2">
              <input 
                type="text"
                value={smartInput}
                onChange={(e) => setSmartInput(e.target.value)}
                placeholder="例如：【99新】罗技GPW二代鼠标，原价899入的..."
                className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white"
                onKeyDown={(e) => { if(e.key === 'Enter') { e.preventDefault(); handleSmartFill(); }}}
              />
              <button 
                type="button"
                onClick={handleSmartFill}
                disabled={isFilling || !smartInput}
                className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center"
              >
                {isFilling ? <Loader2 size={16} className="animate-spin" /> : '识别'}
              </button>
            </div>
          </div>

          <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">物品名称</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：罗技 GPW 鼠标"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                >
                  <option value="Electronics">数码/电子</option>
                  <option value="Clothing">服饰/鞋包</option>
                  <option value="Household">家居/日用</option>
                  <option value="Books">图书/音像</option>
                  <option value="Toys">玩具/手办</option>
                  <option value="Other">其他</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">买入日期</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">买入价格 (¥)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">卖出价格 (¥)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={sellPrice}
                  onChange={(e) => {
                    setSellPrice(e.target.value);
                    if (parseFloat(e.target.value) > 0) {
                        setIsSold(true);
                        if (!sellDate) setSellDate(new Date().toISOString().split('T')[0]);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Sold Details Section */}
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-3">
                <div className="flex items-center space-x-2">
                <input
                    type="checkbox"
                    id="isSold"
                    checked={isSold}
                    onChange={(e) => {
                        setIsSold(e.target.checked);
                        if(e.target.checked && !sellDate) setSellDate(new Date().toISOString().split('T')[0]);
                    }}
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <label htmlFor="isSold" className="text-sm font-medium text-gray-700 select-none">
                    已售出 (标记为完成交易)
                </label>
                </div>
                
                {isSold && (
                    <div className="animate-fade-in-up space-y-3 pt-2 border-t border-gray-200">
                        {/* Sell Date */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">卖出日期</label>
                            <input
                                type="date"
                                value={sellDate}
                                onChange={(e) => setSellDate(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                            />
                        </div>

                        {/* Shipping Logic */}
                        <div>
                           <div className="flex items-center gap-1 mb-2">
                             <Truck size={14} className="text-indigo-500"/>
                             <label className="text-xs font-medium text-gray-500">运费设置 (卖家承担)</label>
                           </div>
                           
                           <div className="flex flex-wrap gap-2 mb-2">
                               {['STO', 'JD', 'SF', 'FREE', 'CUSTOM'].map(m => (
                                   <button
                                      key={m}
                                      type="button"
                                      onClick={() => handleShippingMethodChange(m)}
                                      className={`px-3 py-1 text-xs rounded-full border transition-all
                                        ${shippingMethod === m 
                                            ? 'bg-indigo-100 border-indigo-400 text-indigo-700 font-bold' 
                                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}`}
                                   >
                                     {m === 'STO' ? '申通' : m === 'SF' ? '顺丰' : m === 'JD' ? '京东' : m === 'FREE' ? '到付' : '自定义'}
                                   </button>
                               ))}
                           </div>
                           
                           <div className="relative">
                               <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">¥</span>
                               <input
                                   type="number"
                                   step="0.01"
                                   min="0"
                                   value={shippingCost}
                                   onChange={(e) => {
                                       setShippingCost(e.target.value);
                                       setShippingMethod('CUSTOM');
                                   }}
                                   className="w-full pl-6 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-500 outline-none"
                                   placeholder="运费金额"
                               />
                           </div>
                        </div>

                    </div>
                )}
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <button
            type="submit"
            form="transaction-form"
            className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition-colors shadow-lg shadow-indigo-200"
          >
            <Save size={20} />
            <span>保存记录</span>
          </button>
        </div>
      </div>
    </div>
  );
};
