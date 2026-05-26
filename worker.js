// 礼包码兑换系统 - Cloudflare Worker
// KV 命名空间: REDEEM_CODES, RATE_LIMIT

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const ADMIN_PASSWORD = "aqua1201";
    
    const DEFAULT_CONFIG = {
      cooldownSeconds: 60,
      dailyLimit: 10,
      turnstileEnabled: false
    };
    
    async function getLimitConfig() {
      const config = await env.RATE_LIMIT.get("config");
      if (config) {
        return JSON.parse(config);
      }
      return DEFAULT_CONFIG;
    }
    
    function generateCode(prefix) {
      prefix = prefix || "GIFT";
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
      let randomStr = "";
      for (let i = 0; i < 8; i++) {
        randomStr += chars[Math.floor(Math.random() * chars.length)];
      }
      return prefix + randomStr;
    }
    
    async function isCodeUnique(code, env) {
      const existing = await env.REDEEM_CODES.get(code);
      return !existing;
    }
    
    async function generateUniqueCode(prefix, env) {
      let attempts = 0;
      while (attempts < 10) {
        const code = generateCode(prefix);
        if (await isCodeUnique(code, env)) {
          return code;
        }
        attempts++;
      }
      return prefix + Date.now();
    }
    
    function getClientIP(request) {
      return request.headers.get("CF-Connecting-IP") || 
             request.headers.get("X-Forwarded-For")?.split(",")[0] || 
             "unknown";
    }
    
    function getUserIdentity(userId, ip) {
      const cleanUserId = userId.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
      return cleanUserId + "|" + ip;
    }
    
    async function checkRateLimit(userId, ip, env) {
      const config = await getLimitConfig();
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      const identity = getUserIdentity(userId, ip);
      const userKey = "user:" + identity;
      
      let userRecord = await env.RATE_LIMIT.get(userKey);
      let record = userRecord ? JSON.parse(userRecord) : { 
        lastExchangeTime: 0, 
        dailyCount: 0, 
        lastDate: today,
        userId: userId,
        ip: ip
      };
      
      const timeSinceLast = now - record.lastExchangeTime;
      if (timeSinceLast < config.cooldownSeconds * 1000) {
        const remainingSeconds = Math.ceil((config.cooldownSeconds * 1000 - timeSinceLast) / 1000);
        return { allowed: false, reason: "cooldown", message: "请等待 " + remainingSeconds + " 秒后再试", remainingSeconds: remainingSeconds };
      }
      
      if (record.lastDate !== today) {
        record.dailyCount = 0;
        record.lastDate = today;
      }
      
      if (record.dailyCount >= config.dailyLimit) {
        return { allowed: false, reason: "dailyLimit", message: "今日兑换次数已达上限（" + config.dailyLimit + "次），明天再来吧" };
      }
      
      return { allowed: true, record: record, config: config };
    }
    
    async function updateRateLimit(userId, ip, env, success) {
      if (!success) return;
      const config = await getLimitConfig();
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      const identity = getUserIdentity(userId, ip);
      const userKey = "user:" + identity;
      
      let userRecord = await env.RATE_LIMIT.get(userKey);
      let record = userRecord ? JSON.parse(userRecord) : { 
        lastExchangeTime: 0, 
        dailyCount: 0, 
        lastDate: today,
        userId: userId,
        ip: ip
      };
      
      record.lastExchangeTime = now;
      if (record.lastDate !== today) {
        record.dailyCount = 1;
        record.lastDate = today;
      } else {
        record.dailyCount = record.dailyCount + 1;
      }
      record.userId = userId;
      record.ip = ip;
      
      await env.RATE_LIMIT.put(userKey, JSON.stringify(record), { expirationTtl: 172800 });
    }
    
    // CORS 头
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };
    
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    
    // ========== API 接口 ==========
    
    // 获取卡密列表
    if (path === "/api/list") {
      const allKeys = await env.REDEEM_CODES.list();
      const codes = [];
      for (const key of allKeys.keys) {
        const value = await env.REDEEM_CODES.get(key.name);
        let card = JSON.parse(value);
        if (!card.category) card.category = "默认分类";
        codes.push(card);
      }
      codes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return new Response(JSON.stringify(codes), { headers: corsHeaders });
    }
    
    // 获取分类列表
    if (path === "/api/categories") {
      const allKeys = await env.REDEEM_CODES.list();
      const categoriesSet = new Set();
      for (const key of allKeys.keys) {
        const value = await env.REDEEM_CODES.get(key.name);
        const card = JSON.parse(value);
        categoriesSet.add(card.category || "默认分类");
      }
      return new Response(JSON.stringify(Array.from(categoriesSet)), { headers: corsHeaders });
    }
    
    // 添加兑换码
    if (path === "/api/add" && request.method === "POST") {
      const body = await request.json();
      const reward = body.reward;
      const prefix = body.prefix || "GIFT";
      const category = body.category || "默认分类";
      
      if (!reward) {
        return new Response(JSON.stringify({ success: false, message: "奖励内容不能为空" }), { headers: corsHeaders });
      }
      
      const code = await generateUniqueCode(prefix, env);
      const card = {
        code: code,
        reward: reward,
        category: category,
        used: false,
        usedBy: null,
        usedAt: null,
        createdAt: new Date().toISOString()
      };
      await env.REDEEM_CODES.put(code, JSON.stringify(card));
      return new Response(JSON.stringify({ success: true, code: code }), { headers: corsHeaders });
    }
    
    // 批量添加
    if (path === "/api/batch" && request.method === "POST") {
      const body = await request.json();
      const rewards = body.rewards;
      const prefix = body.prefix || "GIFT";
      const category = body.category || "默认分类";
      
      const results = [];
      for (const reward of rewards) {
        if (!reward.trim()) continue;
        const code = await generateUniqueCode(prefix, env);
        const card = {
          code: code,
          reward: reward.trim(),
          category: category,
          used: false,
          usedBy: null,
          usedAt: null,
          createdAt: new Date().toISOString()
        };
        await env.REDEEM_CODES.put(code, JSON.stringify(card));
        results.push({ code: code, reward: reward });
      }
      return new Response(JSON.stringify({ success: true, count: results.length, codes: results }), { headers: corsHeaders });
    }
    
    // 删除兑换码
    if (path === "/api/delete" && request.method === "POST") {
      const body = await request.json();
      await env.REDEEM_CODES.delete(body.code);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
    
    // 批量删除
    if (path === "/api/batch-delete" && request.method === "POST") {
      const body = await request.json();
      const codes = body.codes;
      for (const code of codes) {
        await env.REDEEM_CODES.delete(code);
      }
      return new Response(JSON.stringify({ success: true, count: codes.length }), { headers: corsHeaders });
    }
    
    // 移动兑换码到分类
    if (path === "/api/move-codes" && request.method === "POST") {
      const body = await request.json();
      const codes = body.codes;
      const targetCategory = body.targetCategory;
      
      let movedCount = 0;
      for (const code of codes) {
        const value = await env.REDEEM_CODES.get(code);
        if (value) {
          const card = JSON.parse(value);
          card.category = targetCategory;
          await env.REDEEM_CODES.put(code, JSON.stringify(card));
          movedCount++;
        }
      }
      return new Response(JSON.stringify({ success: true, count: movedCount }), { headers: corsHeaders });
    }
    
    // 重命名分类
    if (path === "/api/rename-category" && request.method === "POST") {
      const body = await request.json();
      const oldName = body.oldName;
      const newName = body.newName;
      
      const allKeys = await env.REDEEM_CODES.list();
      let updatedCount = 0;
      for (const key of allKeys.keys) {
        const value = await env.REDEEM_CODES.get(key.name);
        const card = JSON.parse(value);
        if (card.category === oldName) {
          card.category = newName;
          await env.REDEEM_CODES.put(key.name, JSON.stringify(card));
          updatedCount++;
        }
      }
      return new Response(JSON.stringify({ success: true, count: updatedCount }), { headers: corsHeaders });
    }
    
    // 删除分类（移动所有卡密到默认分类）
    if (path === "/api/delete-category" && request.method === "POST") {
      const body = await request.json();
      const categoryName = body.categoryName;
      
      const allKeys = await env.REDEEM_CODES.list();
      let movedCount = 0;
      for (const key of allKeys.keys) {
        const value = await env.REDEEM_CODES.get(key.name);
        const card = JSON.parse(value);
        if (card.category === categoryName) {
          card.category = "默认分类";
          await env.REDEEM_CODES.put(key.name, JSON.stringify(card));
          movedCount++;
        }
      }
      return new Response(JSON.stringify({ success: true, count: movedCount }), { headers: corsHeaders });
    }
    
    // 获取配置
    if (path === "/api/config") {
      const config = await getLimitConfig();
      return new Response(JSON.stringify(config), { headers: corsHeaders });
    }
    
    // 保存配置
    if (path === "/api/config" && request.method === "POST") {
      const body = await request.json();
      const config = {
        cooldownSeconds: body.cooldownSeconds || 60,
        dailyLimit: body.dailyLimit || 10,
        turnstileEnabled: body.turnstileEnabled || false
      };
      await env.RATE_LIMIT.put("config", JSON.stringify(config));
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }
    
    // 获取统计
    if (path === "/api/stats") {
      const allKeys = await env.RATE_LIMIT.list();
      let totalUsers = 0;
      let totalExchanges = 0;
      for (const key of allKeys.keys) {
        if (key.name !== "config" && key.name.indexOf("user:") === 0) {
          totalUsers++;
          const value = await env.RATE_LIMIT.get(key.name);
          const record = JSON.parse(value);
          totalExchanges += record.dailyCount || 0;
        }
      }
      return new Response(JSON.stringify({ totalUsers, totalExchanges }), { headers: corsHeaders });
    }
    
    // 兑换接口
    if (path === "/api/redeem" && request.method === "POST") {
      const body = await request.json();
      const code = body.code;
      const userId = body.userId || "匿名用户";
      const ip = getClientIP(request);
      const config = await getLimitConfig();
      
      if (!code) {
        return new Response(JSON.stringify({ success: false, message: "请输入兑换码" }), { headers: corsHeaders });
      }
      
      const rateCheck = await checkRateLimit(userId, ip, env);
      if (!rateCheck.allowed) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: rateCheck.message, 
          reason: rateCheck.reason,
          remainingSeconds: rateCheck.remainingSeconds
        }), { headers: corsHeaders });
      }
      
      const data = await env.REDEEM_CODES.get(code.toUpperCase());
      if (!data) {
        return new Response(JSON.stringify({ success: false, message: "兑换码不存在" }), { headers: corsHeaders });
      }
      
      const card = JSON.parse(data);
      if (card.used) {
        return new Response(JSON.stringify({ success: false, message: "该兑换码已被使用" }), { headers: corsHeaders });
      }
      
      card.used = true;
      card.usedBy = userId + " (" + ip + ")";
      card.usedAt = new Date().toISOString();
      await env.REDEEM_CODES.put(code.toUpperCase(), JSON.stringify(card));
      await updateRateLimit(userId, ip, env, true);
      
      return new Response(JSON.stringify({
        success: true,
        message: "兑换成功！",
        reward: card.reward,
        category: card.category
      }), { headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
  }
};
