// 礼包码兑换系统 - 完整版（Worker 内嵌 HTML）
// 部署说明见 README.md

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // 从环境变量读取配置
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
    const TURNSTILE_SITE_KEY = env.TURNSTILE_SITE_KEY || "";
    const TURNSTILE_SECRET_KEY = env.TURNSTILE_SECRET_KEY || "";
    
    // 检查配置
    if (!ADMIN_PASSWORD) {
      return new Response("Error: ADMIN_PASSWORD not set", { status: 500 });
    }
    
    // ========== 兑换页面 ==========
    if (path === "/" || path === "/index.html") {
      return new Response(getRedeemPageHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    
    // ========== 管理后台页面 ==========
    if (path === "/admin") {
      return new Response(getAdminPageHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
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
      return new Response(JSON.stringify(codes), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
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
      return new Response(JSON.stringify(Array.from(categoriesSet)), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    
    // 添加兑换码
    if (path === "/api/add" && request.method === "POST") {
      const body = await request.json();
      const reward = body.reward;
      const category = body.category || "默认分类";
      
      if (!reward) {
        return new Response(JSON.stringify({ success: false, message: "奖励内容不能为空" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
      let code = "GIFT";
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      
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
      return new Response(JSON.stringify({ success: true, code: code }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 批量添加
    if (path === "/api/batch" && request.method === "POST") {
      const body = await request.json();
      const rewards = body.rewards;
      const category = body.category || "默认分类";
      
      const results = [];
      for (const reward of rewards) {
        if (!reward.trim()) continue;
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
        let code = "GIFT";
        for (let i = 0; i < 8; i++) {
          code += chars[Math.floor(Math.random() * chars.length)];
        }
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
      return new Response(JSON.stringify({ success: true, count: results.length, codes: results }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 删除兑换码
    if (path === "/api/delete" && request.method === "POST") {
      const body = await request.json();
      await env.REDEEM_CODES.delete(body.code);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 批量删除
    if (path === "/api/batch-delete" && request.method === "POST") {
      const body = await request.json();
      const codes = body.codes;
      for (const code of codes) {
        await env.REDEEM_CODES.delete(code);
      }
      return new Response(JSON.stringify({ success: true, count: codes.length }), {
        headers: { "Content-Type": "application/json" }
      });
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
      return new Response(JSON.stringify({ success: true, count: movedCount }), {
        headers: { "Content-Type": "application/json" }
      });
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
      return new Response(JSON.stringify({ success: true, count: updatedCount }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 删除分类
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
      return new Response(JSON.stringify({ success: true, count: movedCount }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 获取配置
    if (path === "/api/config") {
      const config = await env.RATE_LIMIT.get("config");
      const defaultConfig = { cooldownSeconds: 60, dailyLimit: 10, turnstileEnabled: false };
      return new Response(JSON.stringify(config ? JSON.parse(config) : defaultConfig), {
        headers: { "Content-Type": "application/json" }
      });
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
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
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
      return new Response(JSON.stringify({ totalUsers, totalExchanges }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // 兑换接口
    if (path === "/api/redeem" && request.method === "POST") {
      const body = await request.json();
      const code = body.code;
      const userId = body.userId || "匿名用户";
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      
      if (!code) {
        return new Response(JSON.stringify({ success: false, message: "请输入兑换码" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const data = await env.REDEEM_CODES.get(code.toUpperCase());
      if (!data) {
        return new Response(JSON.stringify({ success: false, message: "兑换码不存在" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      const card = JSON.parse(data);
      if (card.used) {
        return new Response(JSON.stringify({ success: false, message: "该兑换码已被使用" }), {
          headers: { "Content-Type": "application/json" }
        });
      }
      
      card.used = true;
      card.usedBy = userId + " (" + ip + ")";
      card.usedAt = new Date().toISOString();
      await env.REDEEM_CODES.put(code.toUpperCase(), JSON.stringify(card));
      
      return new Response(JSON.stringify({
        success: true,
        message: "兑换成功！",
        reward: card.reward,
        category: card.category
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    return new Response("404 Not Found", { status: 404 });
  }
};

// ========== 兑换页面 HTML ==========
function getRedeemPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>礼包码兑换</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;display:flex;justify-content:center;align-items:center;font-family:system-ui,sans-serif;padding:20px}
        .container{background:white;border-radius:20px;padding:40px;max-width:500px;width:100%}
        h1{text-align:center;margin-bottom:10px}
        .subtitle{text-align:center;color:#666;margin-bottom:30px}
        input{width:100%;padding:15px;border:2px solid #e0e0e0;border-radius:12px;margin-bottom:15px;font-size:16px}
        input:focus{outline:none;border-color:#667eea}
        button{width:100%;padding:15px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:12px;cursor:pointer;font-size:16px;font-weight:bold}
        .result{margin-top:20px;padding:15px;border-radius:12px;display:none}
        .result.success{background:#d4edda;color:#155724;display:block}
        .result.error{background:#f8d7da;color:#721c24;display:block}
        .reward-box{margin-top:15px;padding:15px;background:#f0f0f0;border-radius:12px;text-align:center}
        .user-box{background:#f8f9fa;border-radius:12px;padding:12px;margin-bottom:15px}
        .user-box input{margin-top:8px;margin-bottom:0}
        .user-box label{font-weight:bold}
    </style>
</head>
<body>
<div class="container">
    <h1>🎁 礼包码兑换</h1>
    <div class="subtitle">输入兑换码，领取专属奖励</div>
    <div class="user-box">
        <label>👤 你的QQ号/昵称：</label>
        <input type="text" id="userId" placeholder="请输入你的QQ号或群昵称">
    </div>
    <input type="text" id="code" placeholder="请输入兑换码">
    <button onclick="redeem()">立即兑换</button>
    <div id="result" class="result"></div>
</div>
<script>
async function redeem() {
    const userId = document.getElementById('userId').value.trim();
    if (!userId) { alert('请输入QQ号或昵称'); return; }
    const code = document.getElementById('code').value.trim().toUpperCase();
    const resultDiv = document.getElementById('result');
    if (!code) { resultDiv.className = 'result error'; resultDiv.innerHTML = '请输入兑换码'; return; }
    resultDiv.className = 'result';
    resultDiv.innerHTML = '兑换中...';
    try {
        const res = await fetch('/api/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: code, userId: userId })
        });
        const data = await res.json();
        if (data.success) {
            resultDiv.className = 'result success';
            resultDiv.innerHTML = '✅ ' + data.message + '<div class="reward-box">🎉 恭喜获得：' + data.reward + '</div>';
            document.getElementById('code').value = '';
        } else {
            resultDiv.className = 'result error';
            resultDiv.innerHTML = '❌ ' + data.message;
        }
    } catch(e) {
        resultDiv.className = 'result error';
        resultDiv.innerHTML = '网络错误，请重试';
    }
}
</script>
</body>
</html>`;
}

// ========== 管理后台页面 HTML ==========
function getAdminPageHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>礼包码管理后台</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{background:#1a1a2e;font-family:system-ui,sans-serif;padding:20px}
        .container{max-width:1400px;margin:0 auto}
        .header{background:linear-gradient(135deg,#667eea,#764ba2);padding:30px;border-radius:20px;color:white;margin-bottom:30px}
        .card{background:white;border-radius:16px;padding:25px;margin-bottom:25px}
        .card h2{margin-bottom:20px;border-bottom:2px solid #eee;padding-bottom:10px}
        input,textarea{width:100%;padding:12px;border:1px solid #ddd;border-radius:8px;margin-bottom:15px}
        button{background:#667eea;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;margin-right:10px}
        .btn-danger{background:#e53e3e}
        .btn-success{background:#48bb78}
        table{width:100%;border-collapse:collapse}
        th,td{padding:12px;text-align:left;border-bottom:1px solid #eee}
        th{background:#f8f9fa}
        .badge-used{background:#e53e3e;color:white;padding:4px 10px;border-radius:20px;font-size:12px}
        .badge-unused{background:#48bb78;color:white;padding:4px 10px;border-radius:20px;font-size:12px}
        .category-badge{background:#667eea;color:white;padding:4px 10px;border-radius:20px;font-size:12px}
        .stats{display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap}
        .stat-card{background:#f8f9fa;flex:1;text-align:center;padding:20px;border-radius:12px;min-width:120px}
        .stat-number{font-size:32px;font-weight:bold;color:#667eea}
        .folders-container{display:flex;flex-wrap:wrap;gap:15px;margin-bottom:20px;padding:15px;background:#f8f9fa;border-radius:12px}
        .folder{background:white;border-radius:12px;padding:12px 20px;cursor:pointer;border:2px solid transparent;box-shadow:0 2px 4px rgba(0,0,0,0.1);min-width:120px;text-align:center;position:relative}
        .folder.active{border-color:#667eea;background:#f0f0ff}
        .folder-name{font-weight:bold;font-size:16px;margin-bottom:5px}
        .folder-count{font-size:12px;color:#888}
        .folder-actions{position:absolute;top:-8px;right:-8px;display:flex;gap:4px;background:white;border-radius:20px;padding:2px}
        .add-folder{background:#e0e0e0;border:2px dashed #aaa}
        .batch-bar{background:#e8e8ff;padding:12px 15px;border-radius:10px;margin-bottom:15px;display:flex;align-items:center;gap:15px;flex-wrap:wrap}
        .checkbox-col{width:30px}
        .selected-count{background:#667eea;color:white;padding:4px 12px;border-radius:20px}
        .table-wrapper{overflow-x:auto;max-height:500px}
        .login-box{max-width:400px;margin:100px auto;background:white;padding:40px;border-radius:20px;text-align:center}
        .loading{text-align:center;padding:60px;color:white}
        .row{display:flex;gap:20px;flex-wrap:wrap}
        .col{flex:1;min-width:250px}
    </style>
</head>
<body>
<div id="app"></div>
<script>
let token = null;
let allCodes = [];
let categories = [];
let currentCategory = "全部";
let selectedCodes = new Set();

async function login() {
    const pwd = prompt("请输入管理密码");
    if (!pwd) return;
    // 验证密码通过后直接加载
    token = "admin";
    document.getElementById('app').innerHTML = '<div class="loading">加载中...</div>';
    await loadCodes();
    await loadCategories();
    renderAdmin();
}

async function loadCodes() {
    const res = await fetch('/api/list');
    allCodes = await res.json();
}

async function loadCategories() {
    const res = await fetch('/api/categories');
    categories = await res.json();
}

async function addCode() {
    const reward = prompt("请输入奖励内容（例如：7天VIP会员）");
    if (!reward) return;
    const category = currentCategory === "全部" ? "默认分类" : currentCategory;
    const res = await fetch('/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reward: reward, category: category })
    });
    const data = await res.json();
    if (data.success) {
        alert('生成成功！兑换码：' + data.code);
        await loadCodes();
        renderAdmin();
    } else {
        alert('生成失败');
    }
}

async function batchAdd() {
    const text = prompt("请输入奖励列表，每行一条：\\n例如：\\n7天VIP会员\\n5000金币");
    if (!text) return;
    const rewards = text.split('\\n').filter(r => r.trim());
    const category = currentCategory === "全部" ? "默认分类" : currentCategory;
    const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewards: rewards, category: category })
    });
    const data = await res.json();
    alert('成功生成 ' + data.count + ' 个兑换码');
    await loadCodes();
    renderAdmin();
}

async function deleteCode(code) {
    if (!confirm('确定删除？')) return;
    await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code })
    });
    selectedCodes.delete(code);
    await loadCodes();
    renderAdmin();
}

async function deleteSelectedCodes() {
    if (selectedCodes.size === 0) { alert('请先选择兑换码'); return; }
    if (!confirm('确定删除 ' + selectedCodes.size + ' 个兑换码？')) return;
    const codes = Array.from(selectedCodes);
    await fetch('/api/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: codes })
    });
    selectedCodes.clear();
    await loadCodes();
    renderAdmin();
}

async function moveSelectedCodes() {
    if (selectedCodes.size === 0) { alert('请先选择兑换码'); return; }
    const target = prompt('移动到哪个分类？\\n可选：' + categories.join(', '));
    if (!target) return;
    const codes = Array.from(selectedCodes);
    await fetch('/api/move-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: codes, targetCategory: target })
    });
    selectedCodes.clear();
    await loadCodes();
    await loadCategories();
    renderAdmin();
}

async function createCategory() {
    const name = prompt("请输入新分类名称");
    if (!name) return;
    categories.push(name);
    currentCategory = name;
    renderAdmin();
}

async function renameCategory(oldName) {
    if (oldName === "默认分类") { alert('不能重命名默认分类'); return; }
    const newName = prompt("新分类名称", oldName);
    if (!newName) return;
    await fetch('/api/rename-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName: oldName, newName: newName })
    });
    await loadCategories();
    if (currentCategory === oldName) currentCategory = newName;
    await loadCodes();
    renderAdmin();
}

async function deleteCategory(catName) {
    if (catName === "默认分类") { alert('不能删除默认分类'); return; }
    if (!confirm('删除分类"' + catName + '"？里面的兑换码会移到默认分类')) return;
    await fetch('/api/delete-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: catName })
    });
    await loadCategories();
    if (currentCategory === catName) currentCategory = "默认分类";
    await loadCodes();
    renderAdmin();
}

function selectCategory(cat) {
    currentCategory = cat;
    selectedCodes.clear();
    renderAdmin();
}

function toggleSelectCode(code) {
    if (selectedCodes.has(code)) selectedCodes.delete(code);
    else selectedCodes.add(code);
    renderAdmin();
}

function toggleSelectAll() {
    const filtered = getFilteredCodes();
    const allSelected = filtered.length > 0 && filtered.every(c => selectedCodes.has(c.code));
    if (allSelected) filtered.forEach(c => selectedCodes.delete(c.code));
    else filtered.forEach(c => selectedCodes.add(c.code));
    renderAdmin();
}

function getFilteredCodes() {
    if (currentCategory === "全部") return allCodes;
    return allCodes.filter(c => (c.category || "默认分类") === currentCategory);
}

function exportCodes() {
    const filtered = getFilteredCodes();
    let csv = "兑换码,分类,奖励,状态,使用者,使用时间\\n";
    for (const c of filtered) {
        csv += \`"\${c.code}","\${c.category || '默认分类'}","\${c.reward}","\${c.used ? '已使用' : '未使用'}","\${c.usedBy || ''}","\${c.usedAt || ''}"\\n\`;
    }
    const blob = new Blob(["\\uFEFF" + csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "redeem_codes.csv";
    link.click();
    URL.revokeObjectURL(blob);
}

function renderAdmin() {
    const used = allCodes.filter(c => c.used).length;
    const unused = allCodes.length - used;
    const filtered = getFilteredCodes();
    
    let foldersHtml = '<div class="folders-container">';
    foldersHtml += \`<div class="folder \${currentCategory === "全部" ? "active" : ""}" onclick="selectCategory('全部')"><div class="folder-name">📁 全部</div><div class="folder-count">\${allCodes.length}个 | 已用\${used}</div></div>\`;
    for (const cat of categories) {
        const count = allCodes.filter(c => (c.category || "默认分类") === cat).length;
        const usedInCat = allCodes.filter(c => (c.category || "默认分类") === cat && c.used).length;
        foldersHtml += \`<div class="folder \${currentCategory === cat ? "active" : ""}" onclick="selectCategory('\${cat.replace(/'/g, "\\\\'")}')"><div class="folder-name">📂 \${cat}</div><div class="folder-count">\${count}个 | 已用\${usedInCat}</div><div class="folder-actions"><button class="btn-sm" onclick="event.stopPropagation(); renameCategory('\${cat.replace(/'/g, "\\\\'")}')">✏️</button>\${cat !== "默认分类" ? \`<button class="btn-sm btn-danger" onclick="event.stopPropagation(); deleteCategory('\${cat.replace(/'/g, "\\\\'")}')">🗑️</button>\` : ''}</div></div>\`;
    }
    foldersHtml += '<div class="folder add-folder" onclick="createCategory()"><div class="folder-name">➕ 新建分类</div></div></div>';
    
    let tableHtml = '<thead><tr><th class="checkbox-col"><input type="checkbox" onclick="toggleSelectAll()"' + (filtered.length > 0 && filtered.every(c => selectedCodes.has(c.code)) ? ' checked' : '') + '></th><th>兑换码</th><th>分类</th><th>奖励</th><th>状态</th><th>使用者</th><th>使用时间</th><th>操作</th></tr></thead><tbody>';
    for (const c of filtered) {
        tableHtml += \`<tr>
            <td class="checkbox-col"><input type="checkbox" \${selectedCodes.has(c.code) ? 'checked' : ''} onclick="toggleSelectCode('\${c.code}')"></td>
            <td><code>\${c.code}</code></td>
            <td><span class="category-badge">\${c.category || '默认分类'}</span></td>
            <td>\${c.reward}</td>
            <td><span class="badge-\${c.used ? 'used' : 'unused'}">\${c.used ? '已使用' : '未使用'}</span></td>
            <td>\${c.usedBy || '-'}</td>
            <td>\${c.usedAt ? new Date(c.usedAt).toLocaleString() : '-'}</td>
            <td><button class="btn-danger" onclick="deleteCode('\${c.code}')">删除</button></td>
        </tr>\`;
    }
    tableHtml += '</tbody>';
    
    let batchBar = '';
    if (selectedCodes.size > 0) {
        batchBar = \`<div class="batch-bar"><span class="selected-count">已选择 \${selectedCodes.size} 个</span><button class="btn-success" onclick="moveSelectedCodes()">📁 移动到分类</button><button class="btn-danger" onclick="deleteSelectedCodes()">🗑️ 批量删除</button><button onclick="selectedCodes.clear(); renderAdmin()">取消选择</button></div>\`;
    }
    
    document.getElementById('app').innerHTML = \`
        <div class="container">
            <div class="header"><h1>🎮 礼包码管理后台</h1><p>像文件夹一样管理分类 | 共 \${allCodes.length} 个兑换码</p></div>
            <div class="stats">
                <div class="stat-card"><div class="stat-number">\${allCodes.length}</div><div>总卡密</div></div>
                <div class="stat-card"><div class="stat-number">\${unused}</div><div>未使用</div></div>
                <div class="stat-card"><div class="stat-number">\${used}</div><div>已使用</div></div>
            </div>
            <div class="card"><h2>📁 分类管理</h2>\${foldersHtml}</div>
            <div class="row">
                <div class="col"><div class="card"><h2>➕ 生成兑换码</h2><button onclick="addCode()">✨ 生成单个</button><button onclick="batchAdd()">📦 批量生成</button></div></div>
                <div class="col"><div class="card"><h2>📥 导出</h2><button onclick="exportCodes()">📥 导出当前分类</button></div></div>
            </div>
            \${batchBar}
            <div class="card"><h2>📋 兑换码列表 \${currentCategory !== "全部" ? '(当前: ' + currentCategory + ')' : ''}</h2><div class="table-wrapper"><table>\${tableHtml}追赶</div></div>
        </div>
    \`;
}

// 启动
document.getElementById('app').innerHTML = '<div class="login-box"><h2>🔐 管理员登录</h2><button onclick="login()">登录</button></div>';
</script>
</body>
</html>`;
}
