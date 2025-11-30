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
              
              // If no clean cut found, we just cut at max height. 
              // We might split an item, but the "smart search" usually works for lists.
              // To be safer, we could add overlap, but strict cutting is requested to avoid dupes.
              // Let's rely on the large search window (600px) which is usually enough for any product card.
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
    // Flatten result: [File1_Chunk1, File1_Chunk2, File2_Chunk1 ...]
    const allChunksNested = await Promise.all(files.map(sliceLongImage));
    const allChunks = allChunksNested.flat();

    if (allChunks.length === 0) return [];

    // 2. Process chunks in batches to respect API limits and keep context manageable
    // Sending 3-4 image chunks per request is usually safe for Gemini 2.5 Flash
    const BATCH_SIZE = 3; 
    const batches = [];
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      batches.push(allChunks.slice(i, i + BATCH_SIZE));
    }

    const allExtractedItems: any[] = [];

    // Process batches sequentially (or parallel if low count, but sequential is safer for rate limits)
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
        
        Return JSON Array:
        [{ "name": "...", "price": 100.00, "date": "2023-10-01" }]
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
              required: ["name", "price"],
            },
          },
        },
      });

      const text = response.text;
      if (text) {
        try {
          const items = JSON.parse(text);
          if (Array.isArray(items)) {
            allExtractedItems.push(...items);
          }
        } catch (e) {
          console.warn("Failed to parse batch response", e);
        }
      }
    }
    
    // 3. Deduplicate and Map
    // Since we cut cleanly, duplicates *should* be rare, but if a slice cut through a header 
    // and the AI hallucinated the rest in both chunks, we might get partial dupes.
    // Simple dedupe by Name + Price + Date
    const uniqueItems = new Map();
    
    allExtractedItems.forEach(item => {
      // Create a unique key
      const key = `${item.name}-${item.price}-${item.date}`;
      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, item);
      }
    });

    return Array.from(uniqueItems.values()).map((item: any) => ({
      id: crypto.randomUUID(),
      name: item.name,
      price: item.price,
      date: item.date || new Date().toISOString().split('T')[0],
      type: type,
      originalText: item.name
    }));

  } catch (error) {
    console.error("Gemini Image Analysis Error:", error);
    throw error;
  }
};

export const analyzeTradePerformance = async (transactions: Transaction[], stats: TradeStats): Promise<string> => {
  try {
    const recentSold = transactions.filter(t => t.isSold).slice(0, 15);
    const recentInventory = transactions.filter(t => !t.isSold).slice(0, 5);
    
    const dataSummary = {
      overview: stats,
      recentCompletedTrades: recentSold.map(t => ({
        item: t.name,
        buy: t.buyPrice,
        sell: t.sellPrice,
        profit: t.sellPrice - t.buyPrice,
        margin: ((t.sellPrice - t.buyPrice) / t.buyPrice * 100).toFixed(1) + '%'
      })),
      unsoldInventorySample: recentInventory.map(t => ({
        item: t.name,
        cost: t.buyPrice
      }))
    };

    const prompt = `
      As a professional second-hand trading financial advisor, analyze the following trading data JSON.
      
      Data: ${JSON.stringify(dataSummary)}

      Please provide a concise analysis in Chinese (中文) covering:
      1. Overall Profitability: Are they making money? What is the ROI?
      2. Strategy Check: Which items had the best/worst margins?
      3. Inventory Health: Warning about unsold items if any.
      4. Actionable Advice: One specific tip to improve profit based on this data.

      Keep the tone professional yet encouraging. Use emojis for readability. Limit response to 200 words.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text || "无法生成分析，请稍后再试。";

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "AI 分析服务暂时不可用，请检查网络或 API Key 设置。";
  }
};

export const extractItemDetails = async (input: string): Promise<{ name: string; category: string; buyPrice?: number }> => {
  try {
    const prompt = `
      Extract transaction details from the following text (which might be a product title, a description, or a mixed link string).
      
      Text: "${input}"

      Identify:
      1. Name: A concise product name (remove words like 'Selling', 'Used', 'Brand New' unless part of the name).
      2. Category: Must be exactly one of these: 'Electronics', 'Clothing', 'Household', 'Books', 'Toys', 'Other'.
      3. BuyPrice: If a price is mentioned as original cost/bought for, extract it. If multiple prices appear, try to guess the original buying price. If unsure, return 0 or null.

      Return ONLY JSON.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['Electronics', 'Clothing', 'Household', 'Books', 'Toys', 'Other'] },
            buyPrice: { type: Type.NUMBER, description: "Optional detected price" },
          },
          required: ["name", "category"],
        },
      },
    });

    const text = response.text;
    if (!text) return { name: '', category: 'Other' };
    
    return JSON.parse(text);

  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    return { name: '', category: 'Other' };
  }
};

export const findSmartMatches = async (bought: ImportItem[], sold: ImportItem[]): Promise<MatchedPair[]> => {
  try {
    const prompt = `
      I have two lists of second-hand items: one list of items I BOUGHT, and one list of items I SOLD.
      Please identify which "Sold" item corresponds to which "Bought" item based on their names and context.
      
      BOUGHT List: ${JSON.stringify(bought.map(i => ({ id: i.id, name: i.name, price: i.price })))}
      SOLD List: ${JSON.stringify(sold.map(i => ({ id: i.id, name: i.name, price: i.price })))}

      Rules:
      1. Match items that are likely the same physical object (e.g. "iPhone 13" bought and "iPhone 13" sold).
      2. Ignore price differences (I might sell for more or less).
      3. Return a JSON array of pairs.

      Output JSON Schema:
      [
        { "buyId": "id_from_bought_list", "sellId": "id_from_sold_list", "confidence": 0.9, "reason": "Name match" }
      ]
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
              buyId: { type: Type.STRING },
              sellId: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
              reason: { type: Type.STRING },
            },
            required: ["buyId", "sellId", "confidence"],
          },
        },
      },
    });
    
    const text = response.text;
    return text ? JSON.parse(text) : [];

  } catch (error) {
    console.error("Gemini Matching Error:", error);
    return [];
  }
};
