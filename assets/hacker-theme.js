const API = '';
const PAGE_SIZE = 10;
const FALLBACK_IMAGE = '/image_error.svg';

const state = {
  route: parseRoute(),
  user: { loggedIn: false, username: '' },
  categories: [],
  hot: [],
  searchTimer: null,
  captcha: null,
};

const root = document.getElementById('root');

const api = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...options, headers });
  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const message = payload?.message || payload?.data?.message || `请求失败 (${response.status})`;
    throw new Error(message);
  }
  return payload;
};

function parseRoute() {
  const url = new URL(window.location.href);
  const parts = url.pathname.split('/').filter(Boolean);
  if (!parts.length) return { name: 'home', page: Number(url.searchParams.get('page') || 1) };
  if (parts[0] === 'login') return { name: 'login' };
  if (parts[0] === 'register') return { name: 'register' };
  if (parts[0] === 'article') return { name: 'article', alias: decodeURIComponent(parts.slice(1).join('/')) };
  if (parts[0] === 'category') return { name: 'category', value: decodeURIComponent(parts.slice(1).join('/')), page: Number(url.searchParams.get('page') || 1) };
  if (parts[0] === 'tag') return { name: 'tag', value: decodeURIComponent(parts.slice(1).join('/')), page: Number(url.searchParams.get('page') || 1) };
  if (parts[0] === 'search') return { name: 'search', keyword: url.searchParams.get('keyword') || '' };
  return { name: 'home', page: 1 };
}

function navigate(path) {
  history.pushState({}, '', path);
  state.route = parseRoute();
  render();
}

window.addEventListener('popstate', () => { state.route = parseRoute(); render(); });
document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-link]');
  if (!link) return;
  const url = new URL(link.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  navigate(`${url.pathname}${url.search}`);
});

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const fmtDate = (value) => {
  if (!value) return '未知时间';
  const normalized = String(value).replace('T', ' ');
  return normalized.slice(0, 16).replaceAll('-', '/');
};

const splitTags = (value = '') => String(value).split(',').map((tag) => tag.trim()).filter(Boolean);
const articleHref = (article) => `/article/${encodeURIComponent(article.alias || article.article_alias || article.id)}`;
const imageUrl = (src) => src || FALLBACK_IMAGE;
const viewCount = (n) => Number(n || 0) >= 1000 ? `${(Number(n) / 1000).toFixed(1)}k` : Number(n || 0);

function shell(content) {
  return `
    <header class="topbar">
      <nav class="shell nav">
        <a class="brand" href="/" data-link><b>DimStack::root</b><span>hacker terminal blog</span></a>
        <div class="navlinks">
          <a class="navlink" href="/" data-link>首页</a>
          <a class="navlink" href="/category/默认分类" data-link>分类</a>
          <a class="navlink" href="/tag/默认标签" data-link>标签</a>
        </div>
        <div class="nav-actions">
          <div class="searchbox">
            <input id="globalSearch" class="input" placeholder="search --keyword 文章标题/摘要" autocomplete="off" />
            <div id="searchResults" class="search-results" hidden></div>
          </div>
          ${state.user.loggedIn ? `<span class="muted">已登录: ${escapeHtml(state.user.username)}</span><button class="btn" id="logoutBtn">退出</button>` : `<a class="navlink" href="/login" data-link>登录</a><a class="navlink" href="/register" data-link>注册</a>`}
        </div>
      </nav>
    </header>
    ${content}
    <footer class="footer shell">© 2026 次元栈 - Dim Stack // powered by hacker-terminal theme</footer>
  `;
}

function bindShellEvents() {
  const search = document.getElementById('globalSearch');
  const results = document.getElementById('searchResults');
  search?.addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    const keyword = search.value.trim();
    if (!keyword) { results.hidden = true; results.innerHTML = ''; return; }
    state.searchTimer = setTimeout(async () => {
      results.hidden = false;
      results.innerHTML = '<div class="search-item">扫描索引中...</div>';
      try {
        const data = await api(`/api/articlesearch/search?keyword=${encodeURIComponent(keyword)}`);
        const items = Array.isArray(data?.data) ? data.data : [];
        results.innerHTML = items.length ? items.map((item) => `
          <a class="search-item" href="${articleHref(item)}" data-link>
            <b>${escapeHtml(item.title)}</b><br><span>${escapeHtml(item.excerpt || '')}</span>
          </a>`).join('') : '<div class="search-item">没有匹配结果</div>';
      } catch (error) {
        results.innerHTML = `<div class="search-item">${escapeHtml(error.message)}</div>`;
      }
    }, 260);
  });
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => null);
    state.user = { loggedIn: false, username: '' };
    navigate('/');
  });
}

async function bootstrapCommon() {
  const [user, categories, hot] = await Promise.allSettled([
    api('/api/user/status'),
    api('/api/categoriesandcount'),
    api('/api/hot/articles'),
  ]);
  if (user.status === 'fulfilled') state.user = { loggedIn: !!user.value?.loggedIn, username: user.value?.username || '' };
  if (categories.status === 'fulfilled' && Array.isArray(categories.value)) state.categories = categories.value;
  if (hot.status === 'fulfilled' && Array.isArray(hot.value)) state.hot = hot.value;
}

function hero(total = 0) {
  return `
    <section class="hero shell">
      <div class="hero-grid">
        <div class="terminal">
          <div class="term-head"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span>~/dimstack/theme/hacker-terminal</span></div>
          <div class="term-body">
            <div class="kicker">access granted // cyber blog ui</div>
            <h1 class="cursor">黑客风博客主题</h1>
            <p class="lead">以终端、霓虹网格、扫描线和绿色矩阵为视觉核心，完整对接 DimStack 主题接口：文章列表、阅读、搜索、分类、标签、热门文章、验证码、登录、注册和评论交互。</p>
            <div class="stats">
              <div class="stat"><b>${total}</b><span>文章总数</span></div>
              <div class="stat"><b>${state.categories.length}</b><span>分类节点</span></div>
              <div class="stat"><b>${state.hot.length}</b><span>热门追踪</span></div>
            </div>
          </div>
        </div>
        <aside class="panel">
          <h3>system.status</h3>
          <div class="side-list">
            <div class="side-item"><span>API</span><b>/api/*</b></div>
            <div class="side-item"><span>Auth</span><b>${state.user.loggedIn ? 'online' : 'guest'}</b></div>
            <div class="side-item"><span>Theme</span><b>terminal</b></div>
            <div class="side-item"><span>Mode</span><b>responsive</b></div>
          </div>
        </aside>
      </div>
    </section>`;
}

function articleCard(article) {
  const tags = splitTags(article.tag);
  return `
    <article class="article-card">
      <a class="article-cover" href="${articleHref(article)}" data-link><img src="${escapeHtml(imageUrl(article.image || article.article_cover))}" alt="" onerror="this.src='${FALLBACK_IMAGE}'"></a>
      <div class="article-body">
        <div class="article-meta">${escapeHtml(fmtDate(article.date || article.create_time))} • ${escapeHtml(article.author || 'anonymous')} • ${escapeHtml(article.category || '未分类')}</div>
        <a class="article-title" href="${articleHref(article)}" data-link>${escapeHtml(article.title || article.article_name || 'Untitled')}</a>
        <p class="excerpt">${escapeHtml(article.excerpt || '没有摘要，进入文章读取完整内容。')}</p>
        <div class="tags">
          ${(article.category ? `<a class="chip" href="/category/${encodeURIComponent(article.category)}" data-link>#${escapeHtml(article.category)}</a>` : '')}
          ${tags.map((tag) => `<a class="chip" href="/tag/${encodeURIComponent(tag)}" data-link>${escapeHtml(tag)}</a>`).join('')}
        </div>
      </div>
    </article>`;
}

function sidebar() {
  const tagMap = new Map();
  state.hot.forEach((item) => splitTags(item.tag).forEach((tag) => tagMap.set(tag, (tagMap.get(tag) || 0) + 1)));
  return `<aside class="sidebar">
    <section class="panel"><h3>文章分类</h3><div class="side-list">
      ${state.categories.length ? state.categories.map((cat) => `<a class="side-item" href="/category/${encodeURIComponent(cat.article_categories)}" data-link><span>${escapeHtml(cat.article_categories)}</span><b>${cat.articleCount ?? ''}</b></a>`).join('') : '<div class="muted">暂无分类数据</div>'}
    </div></section>
    <section class="panel"><h3>热门文章</h3><div class="side-list">
      ${state.hot.length ? state.hot.map((item) => `<a class="side-item" href="${articleHref(item)}" data-link><span>${escapeHtml(item.title)}</span><b>${viewCount(item.page_views)}</b></a>`).join('') : '<div class="muted">暂无热门文章</div>'}
    </div></section>
    <section class="panel"><h3>文章标签</h3><div class="tags">
      ${[...tagMap.keys()].length ? [...tagMap.keys()].map((tag) => `<a class="chip" href="/tag/${encodeURIComponent(tag)}" data-link>${escapeHtml(tag)}</a>`).join('') : '<span class="muted">标签会从文章数据中自动聚合</span>'}
    </div></section>
  </aside>`;
}

function pagination(page, totalPages, base) {
  if (!totalPages || totalPages <= 1) return '';
  const buttons = [];
  buttons.push(`<button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">prev</button>`);
  for (let i = 1; i <= totalPages; i += 1) buttons.push(`<button class="page-btn" ${i === page ? 'disabled' : ''} data-page="${i}">${i}</button>`);
  buttons.push(`<button class="page-btn" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">next</button>`);
  return `<div class="pagination" data-base="${escapeHtml(base)}">${buttons.join('')}</div>`;
}

async function renderList(loader, title, subtitle, base) {
  const page = Math.max(1, state.route.page || 1);
  root.innerHTML = shell(`${hero(0)}<main class="shell layout"><section><div class="loading">loading articles...</div></section>${sidebar()}</main>`);
  bindShellEvents();
  try {
    const data = await loader(page);
    const items = Array.isArray(data?.data) ? data.data : [];
    const total = Number(data?.total || items.length || 0);
    const totalPages = Number(data?.total_pages || 1);
    root.innerHTML = shell(`${hero(total)}<main class="shell layout"><section>
      <div class="section-title"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><span class="muted">page ${page}/${totalPages}</span></div>
      <div class="article-list">${items.length ? items.map(articleCard).join('') : '<div class="empty">没有文章数据</div>'}</div>
      ${pagination(page, totalPages, base)}
    </section>${sidebar()}</main>`);
    bindShellEvents();
    document.querySelectorAll('.page-btn[data-page]').forEach((btn) => btn.addEventListener('click', () => navigate(`${base}${base.includes('?') ? '&' : '?'}page=${btn.dataset.page}`)));
  } catch (error) {
    root.innerHTML = shell(`<main class="shell reader"><div class="empty">${escapeHtml(error.message)}</div></main>`);
    bindShellEvents();
  }
}

function renderHome() {
  return renderList((page) => api(`/api/articles?page=${page}&size=${PAGE_SIZE}`), 'latest.posts', '最新文章流已经载入终端。', '/');
}
function renderCategory() {
  const value = state.route.value || '';
  return renderList((page) => api(`/api/categories/${encodeURIComponent(value)}/articles?page=${page}&size=${PAGE_SIZE}`), `category: ${value}`, '按分类过滤文章。', `/category/${encodeURIComponent(value)}`);
}
function renderTag() {
  const value = state.route.value || '';
  return renderList((page) => api(`/api/tags/${encodeURIComponent(value)}/articles?page=${page}&size=${PAGE_SIZE}`), `tag: ${value}`, '按标签过滤文章。', `/tag/${encodeURIComponent(value)}`);
}

function markdownToHtml(markdown = '') {
  const src = escapeHtml(markdown).replace(/\r\n/g, '\n');
  const blocks = src.split(/\n{2,}/);
  return blocks.map((block) => {
    if (/^```/.test(block)) return `<pre><code>${block.replace(/^```\w*\n?/, '').replace(/```$/, '')}</code></pre>`;
    if (/^#{1,3}\s/.test(block)) {
      const level = block.match(/^#+/)[0].length;
      return `<h${level}>${inlineMd(block.replace(/^#{1,3}\s/, ''))}</h${level}>`;
    }
    if (/^[-*]\s/m.test(block)) return `<ul>${block.split('\n').filter(Boolean).map((line) => `<li>${inlineMd(line.replace(/^[-*]\s/, ''))}</li>`).join('')}</ul>`;
    if (/^>\s/m.test(block)) return `<blockquote>${inlineMd(block.replace(/^>\s?/gm, ''))}</blockquote>`;
    if (block.includes('|') && block.includes('\n')) {
      const rows = block.split('\n').filter((row) => row.includes('|') && !/^\s*\|?\s*-/.test(row));
      if (rows.length) return `<table>${rows.map((row, index) => `<tr>${row.split('|').filter((cell, i, arr) => !(i === 0 && !cell.trim()) && !(i === arr.length - 1 && !cell.trim())).map((cell) => index === 0 ? `<th>${inlineMd(cell.trim())}</th>` : `<td>${inlineMd(cell.trim())}</td>`).join('')}</tr>`).join('')}</table>`;
    }
    return `<p>${inlineMd(block).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

function inlineMd(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

async function renderArticle() {
  const alias = state.route.alias;
  root.innerHTML = shell('<main class="shell reader"><div class="loading">decrypt article...</div></main>');
  bindShellEvents();
  try {
    const check = await api(`/api/article/${encodeURIComponent(alias)}/check-password`).catch(() => ({ needPassword: false }));
    if (check?.needPassword) {
      root.innerHTML = shell(`<main class="shell auth-wrap"><section class="auth-card"><h2>需要文章密码</h2><form class="form" id="passwordForm"><label>password<input class="input" type="password" name="password" required></label><button class="btn primary">解密文章</button></form></section></main>`);
      bindShellEvents();
      document.getElementById('passwordForm').addEventListener('submit', (event) => { event.preventDefault(); loadArticle(alias, new FormData(event.target).get('password')); });
      return;
    }
    await loadArticle(alias, '');
  } catch (error) {
    root.innerHTML = shell(`<main class="shell reader"><div class="empty">${escapeHtml(error.message)}</div></main>`);
    bindShellEvents();
  }
}

async function loadArticle(alias, password = '') {
  const payload = await api(`/api/article/${encodeURIComponent(alias)}?password=${encodeURIComponent(password)}`);
  const article = payload?.data || payload;
  root.innerHTML = shell(`<main class="shell reader"><article class="article-shell terminal">
    <div class="article-hero">
      <div class="kicker">read.article // ${escapeHtml(article.category || 'uncategorized')}</div>
      <h1>${escapeHtml(article.article_name || article.title || 'Untitled')}</h1>
      <p class="lead">${escapeHtml(article.excerpt || '')}</p>
      <div class="article-meta">${escapeHtml(fmtDate(article.create_time || article.date))} • 阅读 ${viewCount(article.page_views)} • 喜欢 ${viewCount(article.like_count)} • 收藏 ${viewCount(article.favorite_count)}</div>
      ${article.article_cover ? `<img class="cover-wide" src="${escapeHtml(article.article_cover)}" alt="" onerror="this.remove()">` : ''}
      <div class="tags"><a class="chip" href="/category/${encodeURIComponent(article.category || '')}" data-link>#${escapeHtml(article.category || '未分类')}</a>${splitTags(article.tag).map((tag) => `<a class="chip" href="/tag/${encodeURIComponent(tag)}" data-link>${escapeHtml(tag)}</a>`).join('')}</div>
    </div>
    <div class="markdown">${markdownToHtml(article.article_content || '')}</div>
  </article><section class="article-shell panel" style="margin-top:18px" id="commentsPanel"><h3>评论</h3><div class="loading">loading comments...</div></section></main>`);
  bindShellEvents();
  loadComments(alias);
}

async function loadComments(alias) {
  const panel = document.getElementById('commentsPanel');
  try {
    const comments = await api(`/api/comments/article/${encodeURIComponent(alias)}`);
    panel.innerHTML = `<h3>评论</h3>${state.user.loggedIn ? `<form class="form" id="commentForm"><textarea class="textarea" name="content" rows="3" placeholder="写下你的评论..." required></textarea><input type="hidden" name="to_comment_id"><button class="btn primary">发表</button></form>` : `<div class="notice">登录后可以发表评论、点赞或删除自己的评论。<a href="/login" data-link>去登录</a></div>`}<div class="comment-list" style="margin-top:14px">${Array.isArray(comments) && comments.length ? comments.map((comment) => renderComment(comment, alias)).join('') : '<div class="empty">还没有评论，快来抢沙发吧！</div>'}</div>`;
    document.getElementById('commentForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      await api('/api/comments', { method: 'POST', body: JSON.stringify({ article_alias: alias, content: form.get('content'), to_comment_id: form.get('to_comment_id') || '' }) });
      loadComments(alias);
    });
    panel.querySelectorAll('[data-like]').forEach((btn) => btn.addEventListener('click', async () => { await api(`/api/comments/${btn.dataset.like}/like`, { method: 'POST' }); loadComments(alias); }));
    panel.querySelectorAll('[data-delete]').forEach((btn) => btn.addEventListener('click', async () => { if (confirm('确认删除该评论？')) { await api(`/api/comments/${btn.dataset.delete}`, { method: 'DELETE' }); loadComments(alias); } }));
    panel.querySelectorAll('[data-reply]').forEach((btn) => btn.addEventListener('click', () => {
      const form = document.getElementById('commentForm');
      if (!form) return navigate('/login');
      form.to_comment_id.value = btn.dataset.reply;
      form.content.placeholder = `回复 @${btn.dataset.user}`;
      form.content.focus();
    }));
  } catch (error) {
    panel.innerHTML = `<h3>评论</h3><div class="notice error">${escapeHtml(error.message)}</div>`;
  }
}

function renderComment(comment, alias) {
  const avatar = comment.avatar || '';
  const children = Array.isArray(comment.children) ? comment.children : [];
  return `<div class="comment">
    <div class="comment-head">${avatar ? `<img class="avatar" src="${escapeHtml(avatar)}" alt="">` : '<span class="avatar"></span>'}<b>${escapeHtml(comment.username || '匿名')}</b><span>${escapeHtml(fmtDate(comment.create_time))}</span></div>
    <p>${escapeHtml(comment.content || '')}</p>
    <div class="comment-actions"><button class="chip" data-like="${escapeHtml(comment.comment_id)}">${comment.is_liked ? '已点赞' : '点赞'} (${viewCount(comment.comment_like_count)})</button><button class="chip" data-reply="${escapeHtml(comment.comment_id)}" data-user="${escapeHtml(comment.username || '')}">回复</button>${state.user.loggedIn && state.user.username === comment.username ? `<button class="chip" data-delete="${escapeHtml(comment.comment_id)}">删除</button>` : ''}</div>
    ${children.length ? `<div class="children">${children.map((child) => renderComment(child, alias)).join('')}</div>` : ''}
  </div>`;
}

async function loadCaptcha(imgId = 'captchaImg') {
  const data = await api('/api/captcha');
  state.captcha = data;
  const img = document.getElementById(imgId);
  if (img) img.src = data.image;
  return data;
}

function renderAuth(mode) {
  const isLogin = mode === 'login';
  root.innerHTML = shell(`<main class="shell auth-wrap"><section class="auth-card">
    <div class="kicker">${isLogin ? 'login.session' : 'register.account'}</div>
    <h1>${isLogin ? '登录' : '注册'}</h1>
    <form class="form" id="authForm">
      <label>用户名<input class="input" name="username" required autocomplete="username"></label>
      ${isLogin ? '' : `<label>邮箱（可选）<input class="input" name="email" type="email" autocomplete="email"></label><label>手机号（可选）<input class="input" name="phone" pattern="^1[3-9]\\d{9}$"></label>`}
      <label>密码<input class="input" name="password" type="password" required autocomplete="${isLogin ? 'current-password' : 'new-password'}"></label>
      <div class="captcha-row"><label>验证码<input class="input" name="captcha" required autocomplete="off"></label><img id="captchaImg" class="captcha-img" alt="点击刷新验证码" title="点击刷新验证码"></div>
      <button class="btn primary">${isLogin ? '登录系统' : '创建账户'}</button>
      <div id="authNotice" class="notice" hidden></div>
      <p class="muted">${isLogin ? '还没有账户？' : '已有账户？'} <a href="${isLogin ? '/register' : '/login'}" data-link>${isLogin ? '立即注册' : '去登录'}</a></p>
    </form>
  </section></main>`);
  bindShellEvents();
  loadCaptcha().catch(showAuthError);
  document.getElementById('captchaImg').addEventListener('click', () => loadCaptcha().catch(showAuthError));
  document.getElementById('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const notice = document.getElementById('authNotice');
    notice.hidden = false;
    notice.className = 'notice';
    notice.textContent = '提交中...';
    const form = new FormData(event.target);
    const body = {
      username: form.get('username'),
      password: form.get('password'),
      captcha: form.get('captcha'),
      captchaKey: state.captcha?.key || '',
    };
    if (!isLogin) {
      if (form.get('email')) body.email = form.get('email');
      if (form.get('phone')) body.phone = form.get('phone');
    }
    try {
      const data = await api(isLogin ? '/api/login' : '/api/register', { method: 'POST', body: JSON.stringify(body) });
      notice.textContent = data?.data?.message || (isLogin ? '登录成功' : '注册成功');
      if (isLogin) {
        await bootstrapCommon();
        setTimeout(() => navigate('/'), 500);
      } else {
        setTimeout(() => navigate('/login'), 700);
      }
    } catch (error) {
      showAuthError(error);
      loadCaptcha().catch(() => null);
    }
  });
}

function showAuthError(error) {
  const notice = document.getElementById('authNotice');
  if (!notice) return;
  notice.hidden = false;
  notice.className = 'notice error';
  notice.textContent = error.message || String(error);
}

async function renderSearchPage() {
  const keyword = state.route.keyword || '';
  root.innerHTML = shell(`<main class="shell reader"><section class="panel"><h3>search: ${escapeHtml(keyword)}</h3><div class="loading">searching...</div></section></main>`);
  bindShellEvents();
  try {
    const data = await api(`/api/articlesearch/search?keyword=${encodeURIComponent(keyword)}`);
    const items = Array.isArray(data?.data) ? data.data : [];
    root.innerHTML = shell(`<main class="shell layout"><section><div class="section-title"><div><h2>search.results</h2><p>${escapeHtml(keyword)}</p></div><span class="muted">${items.length} hits</span></div><div class="article-list">${items.length ? items.map(articleCard).join('') : '<div class="empty">没有匹配结果</div>'}</div></section>${sidebar()}</main>`);
    bindShellEvents();
  } catch (error) {
    root.innerHTML = shell(`<main class="shell reader"><div class="empty">${escapeHtml(error.message)}</div></main>`);
    bindShellEvents();
  }
}

async function render() {
  window.scrollTo({ top: 0, behavior: 'instant' });
  await bootstrapCommon();
  if (state.route.name === 'login') return renderAuth('login');
  if (state.route.name === 'register') return renderAuth('register');
  if (state.route.name === 'article') return renderArticle();
  if (state.route.name === 'category') return renderCategory();
  if (state.route.name === 'tag') return renderTag();
  if (state.route.name === 'search') return renderSearchPage();
  return renderHome();
}

render();
