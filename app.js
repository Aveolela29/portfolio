const paths = {
  pdf: '<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  movie: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 10h4m-4 4h4m10-4h4m-4 4h4m-11-5 4 3-4 3z"/>',
  portrait: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18.5h4m-3.7-10.7 4.8 3.2-4.8 3.2z"/>',
  play: '<path d="M8 4l13 8-13 8z"/>',
};
const orientations = { landscape: '横屏', portrait: '竖屏' };
const tones = ['sage', 'rose', 'sand', 'lilac', 'sky'];
const $ = (id) => document.getElementById(id);
const grid = $('work-grid');
const filters = $('filters');
const search = $('search');
const state = $('catalog-state');
const more = $('show-more');
const workDialog = $('work-dialog');
const shareDialog = $('share-dialog');
const viewer = $('viewer');
const batchSize = 12;
const pageUrl = new URL(location.pathname, location.origin);
let projects = [];
let portfolioUrl;
let matchesFilter = () => true;
let limit = batchSize;
let clearToast;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function icon(name) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = paths[name];
  return node;
}

function mediaUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, pageUrl);
    return url.protocol === 'https:' || (url.protocol === 'http:' && url.origin === location.origin) ? url.href : null;
  } catch {
    return null;
  }
}

function workUrl(id) {
  const url = new URL(pageUrl);
  url.searchParams.set('work', id);
  return url;
}

function workContent(work, className) {
  if (!work.url && work.type !== 'video' && !work.project) return element('div', className);
  const link = element('a', className);
  link.href = workUrl(work.id).href;
  link.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openWork(work);
  });
  return link;
}

function documentCard(work) {
  const card = element('article', `document-card tone-${work.tone}`);
  const content = workContent(work, 'document-content');
  const glyph = element('div', 'document-icon');
  glyph.append(icon('pdf'));
  const body = element('div');
  const meta = work.url ? (work.subtitle || '可在线阅读') : '待添加';
  body.append(element('h3', 'document-title', work.title), element('p', 'document-meta', meta));
  content.append(glyph, body, element('span', 'pdf-tag', 'PDF'));
  card.append(content);
  return card;
}

function projectCard(work) {
  const isPdf = work.type === 'pdf';
  const card = element('article', `work-card tone-${work.tone}`);
  const content = workContent(work, 'card-content');
  const containCover = work.coverFit === 'contain' || (work.orientation === 'portrait' && work.coverFit !== 'cover');
  const cover = element('div', ['cover-frame', containCover ? 'contain' : '', work.coverPosition === 'portrait-focus' ? 'portrait-focus' : ''].filter(Boolean).join(' '));
  if (work.cover) {
    const image = element('img');
    image.src = work.cover;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    cover.append(image);
  } else {
    cover.append(icon(isPdf ? 'pdf' : work.orientation === 'portrait' ? 'portrait' : 'movie'));
  }
  if (work.url) {
    const play = element('span', 'cover-play');
    const glyph = icon(isPdf ? 'pdf' : 'play');
    if (!isPdf) glyph.classList.add('play-icon');
    play.append(glyph);
    cover.append(play);
  }
  const body = element('div', 'card-body');
  const meta = element('p', 'card-meta');
  const currentDuration = work.plannedDuration && work.duration ? `当前 ${work.duration}` : '';
  const details = [work.yearLabel, work.category, work.subtitle, work.orientationLabel, currentDuration, work.durationLabel].filter(Boolean).join(' · ');
  if (details) meta.append(element('span', '', details));
  if (work.inProgress) meta.append(element('span', 'work-status', '制作中'));
  if (work.mediaLabel) meta.append(element('span', 'work-status', work.mediaLabel));
  if (!work.url) meta.append(element('span', '', isPdf ? 'PDF 待添加' : '视频待添加'));
  const title = element('h3', 'card-title');
  fillWorkTitle(title, work);
  body.append(title, meta);
  content.append(cover, body);
  card.append(content);
  return card;
}

function workMetadata(work) {
  return [work.yearLabel, work.category || (work.type === 'pdf' ? 'PDF' : '视频'), work.subtitle, work.orientationLabel, work.inProgress ? '制作中' : '', work.mediaLabel, work.durationLabel].filter(Boolean).join(' · ');
}

function fillWorkTitle(heading, work, featured = false) {
  const firstLine = featured && work.featuredTitleBreak ? work.shortTitle : '';
  if (firstLine && work.title.startsWith(firstLine)) {
    const secondLine = work.title.slice(firstLine.length).trimStart();
    heading.replaceChildren(firstLine, element('br'), secondLine);
  } else {
    heading.textContent = work.title;
  }
  if (work.award) heading.append(' ', element('span', 'work-status award', '获奖'));
}

function renderFeatured() {
  const selections = projects.filter((work) => work.featured && work.featuredCover);
  if (!selections.length) return;
  const panel = $('featured-panel');
  const buttons = $('featured-choices');
  const slides = selections.map((work) => {
    const slide = element('div', 'featured-slide');
    slide.dataset.work = work.id;
    const image = element('img', 'featured-image');
    image.src = work.featuredCover;
    image.alt = '';
    image.decoding = 'async';
    const info = element('div', 'featured-copy');
    const link = workContent(work, 'primary-link');
    link.textContent = work.type === 'pdf' ? '查看分镜与说明' : '观看作品';
    const title = element('h3');
    fillWorkTitle(title, work, true);
    info.append(element('p', 'featured-meta', workMetadata(work)), title);
    const description = work.featuredDescription || work.description;
    if (description) info.append(element('p', 'featured-description', description));
    info.append(link);
    slide.append(image, info);
    return slide;
  });
  panel.replaceChildren(...slides);
  const choose = (index) => {
    for (const [choiceIndex, slide] of slides.entries()) {
      const active = choiceIndex === index;
      slide.inert = !active;
      buttons.children[choiceIndex].setAttribute('aria-pressed', String(active));
    }
  };
  for (const [index, work] of selections.entries()) {
    const button = element('button', 'featured-choice');
    button.type = 'button';
    button.setAttribute('aria-controls', 'featured-panel');
    const thumbnail = element('img');
    thumbnail.src = work.featuredCover;
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    button.append(thumbnail, element('span', '', work.shortTitle || work.title));
    button.addEventListener('click', () => choose(index));
    buttons.append(button);
  }
  buttons.addEventListener('keydown', (event) => {
    const choices = [...buttons.children];
    const index = choices.indexOf(event.target);
    if (index < 0 || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const following = (index + (event.key === 'ArrowRight' ? 1 : choices.length - 1)) % choices.length;
    choose(following);
    choices[following].focus({ preventScroll: true });
  });
  choose(0);
  $('selected').hidden = false;
}

function renderNote(work, isProject) {
  const panel = $('creative-note');
  const body = $('note-content');
  panel.hidden = !isProject;
  body.replaceChildren();
  if (!isProject) return;
  if (work.award) {
    body.append(element('h4', '', '获奖'), element('p', '', typeof work.award === 'string' ? work.award : '获奖作品'));
  }
  const note = work.note;
  if (!note?.sections?.length) {
    body.append(element('p', '', '创作说明待补充。'));
    return;
  }
  for (const section of note.sections) {
    body.append(element('h4', '', section.label), element('p', '', section.body));
  }
  if (note.tools?.length) {
    const list = element('ul', 'note-tool-list');
    for (const tool of note.tools) list.append(element('li', '', tool));
    body.append(element('h4', '', '使用工具'), list);
  }
  if (portfolioUrl && Number.isInteger(note.page)) {
    const reference = element('a', 'underlink', `作品集 PDF · 第 ${note.page} 页`);
    const referenceUrl = new URL(portfolioUrl);
    referenceUrl.hash = `page=${note.page}`;
    reference.href = referenceUrl.href;
    reference.target = '_blank';
    reference.rel = 'noopener noreferrer';
    body.append(reference);
  }
}

function renderProjectNavigation(work) {
  const nav = $('dialog-nav');
  const index = projects.indexOf(work);
  nav.hidden = index < 0;
  nav.replaceChildren();
  if (index < 0) return;
  for (const [caption, target] of [['上一件作品', projects[index - 1]], ['下一件作品', projects[index + 1]]]) {
    const button = element('button', 'secondary-link', caption);
    button.type = 'button';
    button.disabled = !target;
    if (target) {
      button.setAttribute('aria-label', `${caption}，${target.title}`);
      button.addEventListener('click', () => openWork(target));
    }
    nav.append(button);
  }
}

function renderProjects(announce = true) {
  const terms = search.value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = projects.filter((work) => matchesFilter(work) && terms.every((term) => work.searchText.includes(term)));
  grid.replaceChildren(...matches.slice(0, limit).map(projectCard));
  state.hidden = matches.length > 0;
  state.textContent = projects.length ? '没有找到符合条件的作品。' : '作品即将上线。';
  more.hidden = matches.length <= limit;
  const count = matches.length <= limit ? `${matches.length} 件作品` : `已显示 ${limit} 件，共 ${matches.length} 件作品`;
  $('video-count').textContent = count;
  if (announce) $('results-status').textContent = count;
}

function renderFilters() {
  const choices = [
    ['全部', () => true],
    ['横屏', (work) => work.orientation === 'landscape'],
    ['竖屏', (work) => work.orientation === 'portrait'],
    ['分镜', (work) => work.type === 'pdf'],
    ['制作中', (work) => work.inProgress],
  ];
  for (const [label, predicate] of choices.filter(([, predicate]) => projects.some(predicate))) {
    const button = element('button', 'filter', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(label === '全部'));
    button.addEventListener('click', () => {
      matchesFilter = predicate;
      limit = batchSize;
      for (const choice of filters.children) choice.setAttribute('aria-pressed', String(choice === button));
      renderProjects();
    });
    filters.append(button);
  }
}

function showToast(message) {
  const toast = $('toast');
  clearTimeout(clearToast);
  toast.textContent = message;
  toast.hidden = false;
  clearToast = setTimeout(() => { toast.hidden = true; }, 2500);
}

async function share(url) {
  try {
    await navigator.clipboard.writeText(url.href);
    if (workDialog.open) $('share-work').textContent = '链接已复制';
    else showToast('链接已复制');
  } catch {
    const input = $('share-url');
    input.value = url.href;
    if (!shareDialog.open) shareDialog.showModal();
    input.focus();
    input.select();
  }
}

function openWork(work, updateUrl = true) {
  const isPdf = work.type === 'pdf';
  const isProject = work.type === 'video' || work.project;
  fillWorkTitle($('dialog-title'), work);
  $('dialog-type').textContent = workMetadata(work);
  $('dialog-description').textContent = work.description || '';
  viewer.replaceChildren();
  if (!work.url) {
    if (work.cover) {
      const poster = element('img', 'detail-cover');
      poster.src = work.cover;
      poster.alt = `${work.title}静帧`;
      viewer.append(poster);
    }
    viewer.append(element('p', 'media-pending', isPdf ? 'PDF 待添加。' : '视频待添加。'));
  } else if (!work.externalOnly && (isPdf || work.embedUrl)) {
    const frame = element('iframe');
    frame.title = `${work.title} ${isPdf ? 'PDF 预览' : '视频播放器'}`;
    frame.src = work.embedUrl || work.url;
    if (!isPdf) {
      frame.allow = 'fullscreen; picture-in-picture; encrypted-media';
      frame.allowFullscreen = true;
    }
    viewer.append(frame);
  } else if (!work.externalOnly) {
    const video = element('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (work.cover) video.poster = work.cover;
    video.src = work.url;
    viewer.append(video);
  }
  if (work.url && work.orientation === 'portrait') viewer.firstElementChild?.classList.add('portrait-media');
  const actions = $('dialog-actions');
  actions.replaceChildren();
  if (work.url) {
    const assetLink = element('a', 'primary-link', isPdf ? '打开 PDF' : '打开视频');
    assetLink.href = work.url;
    assetLink.target = '_blank';
    assetLink.rel = 'noopener noreferrer';
    actions.append(assetLink);
  }
  const shareButton = element('button', 'secondary-link', '复制作品链接');
  shareButton.type = 'button';
  shareButton.id = 'share-work';
  shareButton.addEventListener('click', () => share(workUrl(work.id)));
  actions.append(shareButton);
  renderNote(work, isProject);
  renderProjectNavigation(work);
  if (workDialog.open) workDialog.querySelector('.close-button').focus({ preventScroll: true });
  else workDialog.showModal();
  workDialog.scrollTop = 0;
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('work', work.id);
    history.replaceState(null, '', url);
  }
}

search.addEventListener('input', () => {
  limit = batchSize;
  renderProjects();
});
more.addEventListener('click', () => {
  const firstNewIndex = grid.children.length;
  limit += batchSize;
  renderProjects();
  const target = grid.children[firstNewIndex];
  if (target) {
    target.tabIndex = -1;
    (target.querySelector('a') ?? target).focus();
  }
});
$('share-site').addEventListener('click', () => share(pageUrl));
for (const dialog of [workDialog, shareDialog]) {
  dialog.querySelector('.close-button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
workDialog.addEventListener('close', () => {
  viewer.replaceChildren();
  const url = new URL(location.href);
  if (url.searchParams.has('work')) {
    url.searchParams.delete('work');
    history.replaceState(null, '', url);
  }
});

async function loadCatalog() {
  let data;
  try {
    const response = await fetch(new URL('works.json', pageUrl));
    if (!response.ok) throw new Error('Catalog request failed');
    data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid catalog');
  } catch {
    $('catalog-error').hidden = false;
    return;
  }
  const works = new Map();
  for (const item of data) {
    if (!item || typeof item.id !== 'string' || !item.id.trim() || works.has(item.id) || typeof item.title !== 'string' || !item.title.trim()) continue;
    if (item.type !== 'video' && item.type !== 'pdf') continue;
    const url = mediaUrl(item.url);
    const tone = tones.includes(item.tone) ? item.tone : 'sage';
    const yearLabel = Number.isInteger(item.year) ? `${item.year} 年` : '';
    const orientationLabel = Object.hasOwn(orientations, item.orientation) ? orientations[item.orientation] : '';
    const durationLabel = item.plannedDuration ? `预计全片 ${item.plannedDuration}` : item.duration;
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const noteTerms = item.note?.sections?.map((section) => section.body) ?? [];
    const searchText = [item.title, item.category, item.subtitle, yearLabel, orientationLabel, item.mediaLabel, item.description, item.award && '获奖', typeof item.award === 'string' ? item.award : '', item.inProgress && '制作中', ...tags, ...noteTerms, ...(item.note?.tools ?? [])].filter(Boolean).join(' ').normalize('NFKC').toLowerCase();
    const cover = mediaUrl(item.cover);
    const featuredCover = mediaUrl(item.featuredCover) || cover;
    works.set(item.id, { ...item, url, tone, yearLabel, orientationLabel, durationLabel, searchText, cover, featuredCover, embedUrl: mediaUrl(item.embedUrl) });
  }
  const all = [...works.values()];
  portfolioUrl = works.get('portfolio-pdf')?.url;
  const documents = all.filter((work) => work.type === 'pdf' && !work.project);
  $('document-grid').replaceChildren(...documents.map(documentCard));
  projects = all.filter((work) => work.type === 'video' || work.project);
  $('toolbar').hidden = !projects.length;
  renderFeatured();
  renderFilters();
  renderProjects(false);
  const requested = new URL(location.href).searchParams.get('work');
  if (requested) {
    const work = works.get(requested);
    if (work?.url || work?.type === 'video' || work?.project) openWork(work, false);
    else showToast(work ? '文件待添加' : '没有找到这件作品');
  }
}

loadCatalog();
