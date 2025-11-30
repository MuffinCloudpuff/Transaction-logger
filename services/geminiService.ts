
import { GoogleGenAI, Type } from "@google/genai";
import { Transaction, TradeStats, ImportItem, MatchedPair } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Image Processing Helpers ---

// Check if a row of pixels is likely a background separator (uniform color)
const isBackgroundLine = (data: Uint8ClampedArray, width: number, y: number): boolean => {
  const rowStart = y * width * 4;
  // Sample every 10th pixel to performance
  const step = 10;
  
  // Get reference color from the start (or middle to avoid border artifacts)
  const refIdx = rowStart + (Math.floor(width / 2) * 4);
  const rRef = data[refIdx];
  const gRef = data[refIdx + 1];
  const bRef = data[refIdx + 2];

  for (let x = 0; x < width; x += step) {
    const idx = rowStart + (x * 4);
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

    // Calculate difference (Manhattan distance)
    const diff = Math.abs(r - rRef) + Math.abs(g - gRef) + Math.abs(b - bRef);
    
    // Threshold for "noise" - if diff is high, it's likely text/image content
    if (diff > 40) {
      return false; 
    }
  }
  return true;
};

// Slice a long image into smart chunks
const sliceLongImage = async (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const chunks: string[] = [];
          
          // 1. Normalize Width (resize if too wide, e.g., > 1080px, to save tokens/bandwidth)
          // Most mobile screenshots are ~1080-1200px wide. 
          const TARGET_WIDTH = 1080;
          let renderWidth = img.width;
          let renderHeight = img.height;
          
          if (renderWidth > TARGET_WIDTH) {
            const scale = TARGET_WIDTH / renderWidth;
            renderWidth = TARGET_WIDTH;
            renderHeight = img.height * scale;
          }

          // Create a "source" canvas to read pixel data from
          const sourceCanvas = document.createElement('canvas');
          sourceCanvas.width = renderWidth;
          sourceCanvas.height = renderHeight;
          const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
          if (!sourceCtx) throw new Error("Canvas context unavailable");
          
          // Fill white first (handle transparency)
          sourceCtx.fillStyle = "#FFFFFF";
          sourceCtx.fillRect(0, 0, renderWidth, renderHeight);
          sourceCtx.drawImage(img, 0, 0, renderWidth, renderHeight);
          
          const imageData = sourceCtx.getImageData(0, 0, renderWidth, renderHeight);
          const pixels = imageData.data;

          // 2. Slicing Loop
          const CHUNK_MAX_HEIGHT = 2000; // Optimal for OCR context
          const MIN_CHUNK_HEIGHT = 500;  // Don't make tiny crumbs
          let currentY = 0;

          while (currentY < renderHeight) {
            // Determine potential end of this chunk
            let endY = currentY + CHUNK_MAX_HEIGHT;
            
            // If we are near the end, just take the rest
            if (endY >= renderHeight) {
              endY = renderHeight;
            } else {
              // Smart Cut: Search upwards from endY for a background gap
              // Scan back up to 600px to find a break
              let foundCut = false;
              const searchLimit = Math.max(currentY + MIN_CHUNK_HEIGHT, endY - 600);
              
              for (let y = endY; y > searchLimit; y -= 5) { // Step 5px for speed
                 if (isBackgroundLine(pixels, renderWidth, y)) {
                   endY = y;
                   foundCut = true;
                   break;
                 }
              }
            }

            // Extract chunk
            const chunkHeight = endY - currentY;
            
            // Skip tiny tail chunks (often just footer whitespace)
            if (chunkHeight < 50) {
              currentY = endY;
              continue;
            }

            const chunkCanvas = document.createElement('canvas');
            chunkCanvas.width = renderWidth;
            chunkCanvas.height = chunkHeight;
            const chunkCtx = chunkCanvas.getContext('2d');
            if (!chunkCtx) throw new Error("Chunk Canvas unavailable");

            chunkCtx.drawImage(sourceCanvas, 0, currentY, renderWidth, chunkHeight, 0, 0, renderWidth, chunkHeight);
            
            // Compress to JPEG
            const base64 = chunkCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            chunks.push(base64);

            currentY = endY;
          }
          
          resolve(chunks);

        } catch (e) {
          console.error("Slicing failed", e);
          reject(e);
        }
      };
      img.onerror = (e) => reject(e);
      img.src = event.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeTradeScreenshots = async (files: File[], type: 'BUY' | 'SELL'): Promise<ImportItem[]> => {
  try {
    // 1. Process all files into chunks (base64 strings)
    const allChunksNested = await Promise.all(files.map(sliceLongImage));
    const allChunks = allChunksNested.flat();

    if (allChunks.length === 0) return [];

    // 2. Process chunks in batches
    const BATCH_SIZE = 3; 
    const batches = [];
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      batches.push(allChunks.slice(i, i + BATCH_SIZE));
    }

    const allExtractedItems: any[] = [];

    for (const batchImages of batches) {
      
      const imageParts = batchImages.map(data => ({
        inlineData: { mimeType: 'image/jpeg', data }
      }));

      const prompt = `
        You are an OCR expert for Chinese e-commerce apps (Xianyu/Taobao). 
        Analyze these screenshot slices of a transaction list (either "I Bought" or "I Sold").
        Note: These images are vertical slices of a long scrollable list.
        
        Task:
        1. Identify individual transaction items.
        2. ONLY include items where the status suggests success (e.g., "交易成功", "To be shipped", "To be received", "已签收"). 
           - IGNORE "Closed" (交易关闭), "Refunded" (退款).
           - IGNORE "Guess you like" (猜你喜欢) section or any product recommendations at the bottom that are not part of the order history.
        3. For each item, extract:
           - Name (Product Title)
           - Price (number)
           - Date (YYYY-MM-DD, infer year ${new Date().getFullYear()} if missing)
        
        Context: This is a ${type} list.
        
        Return JSON Array.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [...imageParts, { text: prompt }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                date: { type: Type.STRING },
              },
              required: ["name", "price", "date"]
            }
          },
        },
      });

      if (response.text) {
        try {
          const items = JSON.parse(response.text);
          allExtractedItems.push(...items);
        } catch (e) {
          console.error("Failed to parse batch response", response.text);
        }
      }
    }

    // Deduplicate logic
    const uniqueMap = new Map();
    allExtractedItems.forEach(item => {
      // Create a unique key based on name and price
      const key = `${item.name}-${item.price}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    });

    return Array.from(uniqueMap.values()).map(item => ({
       id: crypto.randomUUID(),
       name: item.name,
       price: item.price,
       date: item.date,
       type: type,
       originalText: item.name
    }));

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const extractItemDetails = async (text: string): Promise<{name?: string, category?: string, buyPrice?: number}> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Extract item details from this text: "${text}". 
    Return JSON with: name (string), category (one of: Electronics, Clothing, Household, Books, Toys, Other), buyPrice (number). 
    If price is missing, use 0.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          buyPrice: { type: Type.NUMBER },
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return {};
  }
};

export const batchSmartCategorize = async (itemNames: string[]): Promise<Record<string, string>> => {
  if (itemNames.length === 0) return {};

  try {
    const prompt = `
      You are an expert e-commerce product classifier.
      Analyze the following product names and categorize them into ONE of the specific tags below.
      
      Classification Standard:
      
      1. 数码与家电
         - '主机设备': 手机、电脑（台式/笔记本）、平板、游戏机
         - '外设配件': 键盘、鼠标、数据线、充电头、硬盘/U盘、转接器、显卡、主板、内存
         - '影音摄影': 耳机、音箱、相机、镜头、支架
         - '生活家电': 冰箱、洗衣机、空调、吹风机、扫地机
      
      2. 家具与家装
         - '大型家具': 床、床垫、衣柜、沙发、桌子
         - '办公家具': 人体工学椅、书柜、置物架
         - '家纺布艺': 被褥、枕头、四件套、窗帘、地毯
         - '照明灯饰': 吸顶灯、台灯、落地灯
      
      3. 服饰与穿搭
         - '服饰': 上装、下装、外套、内衣、袜子
         - '鞋靴箱包': 运动鞋、皮鞋、拖鞋、双肩包、行李箱
         - '配饰': 手表、眼镜、皮带、首饰
      
      4. 厨房与饮食
         - '厨房用具': 锅具、餐具、水杯
         - '厨房小电': 电饭煲、微波炉、空气炸锅
         - '食品': 粮油、零食、饮料
      
      5. 卫浴与日化
         - '个人护理': 洗护用品、牙刷、剃须刀
         - '清洁用品': 洗衣液、纸品、清洁工具
      
      6. 文具与书籍
         - '书籍': 实体书、杂志
         - '办公文具': 笔、本子、文件夹
      
      7. 证件与重要资产
         - '重要资产': 证件、合同、贵金属、现金
      
      8. 兴趣与运动
         - '运动器材': 瑜伽垫、哑铃、球拍
         - '户外装备': 帐篷、登山杖
         - '收藏玩乐': 手办、模型、乐器、桌游
      
      9. 医药与急救
         - '医药急救': 药品、创可贴、口罩
      
      10. 虚拟/卡券
         - '虚拟/卡券': 会员、充值、兑换码、教程、服务
      
      Input Items:
      ${JSON.stringify(itemNames)}
      
      Return a JSON ARRAY of objects, where each object has 'name' and 'tag' (The specific sub-category name, e.g., '主机设备' or '外设配件').
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              tag: { type: Type.STRING }
            },
            required: ["name", "tag"]
          }
        }
      }
    });

    const resultList = JSON.parse(response.text || '[]');
    
    // Convert Array back to Map
    const map: Record<string, string> = {};
    resultList.forEach((item: any) => {
        if (item.name && item.tag) {
            map[item.name] = item.tag;
        }
    });
    
    return map;

  } catch (e) {
    console.error("Smart categorize failed", e);
    return {};
  }
};

export const analyzeTradePerformance = async (transactions: Transaction[], stats: TradeStats): Promise<string> => {
    
    // Filter for meaningful analysis
    // 1. Only Closed Loop for Profitability
    const closedLoop = transactions.filter(t => t.buyPrice > 0 && t.sellPrice > 0);
    
    // 2. High Value Inventory (> 5 yuan)
    const inventory = transactions.filter(t => t.buyPrice > 5 && t.sellPrice === 0);

    // Calculate Best/Worst
    let bestTrade = null;
    let worstTrade = null;
    
    const processedClosedLoop = closedLoop.map(t => {
        const shipping = t.shippingCost || 0;
        const fee = (t.sellPrice + shipping) * 0.006;
        const profit = t.sellPrice - t.buyPrice - shipping - fee;
        return { ...t, profit };
    }).sort((a,b) => b.profit - a.profit);

    if (processedClosedLoop.length > 0) {
        bestTrade = processedClosedLoop[0];
        worstTrade = processedClosedLoop[processedClosedLoop.length - 1];
    }

    const summaryData = {
        closedLoopStats: {
            profit: stats.closedLoopProfit,
            cost: stats.totalInvested, // This might be total, ideally should be closedLoopCost
            roi: stats.closedLoopRoi,
            count: stats.closedLoopCount
        },
        bestTrade: bestTrade ? { name: bestTrade.name, profit: bestTrade.profit } : null,
        worstTrade: worstTrade ? { name: worstTrade.name, profit: worstTrade.profit } : null,
        inventoryCount: inventory.length,
        inventorySample: inventory.slice(0, 10).map(t => t.name)
    };

    const prompt = `
      Act as a professional financial analyst for a second-hand trader.
      Write a performance report in **Simplified Chinese**.
      
      Data:
      ${JSON.stringify(summaryData)}
      
      Format Requirements (Use HTML Tags):
      1. Use <h2> with Emojis for section headers (e.g., 📊 经营概览, 🏆 最佳交易).
      2. Use <blockquote> for the Executive Summary at the top.
      3. Use <code> tags for ALL monetary values (e.g., <code>¥450.00</code>) and percentages (<code>12.5%</code>) to make them look like badges.
      4. Use <ul><li> for lists.
      5. Structure:
         - **Executive Summary**: Focus strictly on "Closed Loop" (Completed) trades. Start with "Congratulations! 🎉" if profitable.
         - **Highlights**: Best trade (Highest Profit) and Worst trade (Lowest/Negative Profit).
         - **Inventory Analysis**: Analyze the high-value inventory items provided. Give specific advice based on the item types (e.g. "Keyboards move slow", "Phones drop value fast").
      
      Tone: Professional, encouraging, and data-driven.
    `;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt
    });

    return response.text || "<h4>Analysis Failed</h4>";
};
